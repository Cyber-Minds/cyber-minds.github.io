package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

const (
	defaultPort          = "8080"
	maxSessionTimeout    = 30 * time.Minute
	containerMemoryLimit = 512 * 1024 * 1024 // 512MB
	containerCPULimit    = 1000000000        // 1 CPU
	terminalImageName    = "terminal-base:latest"
	readBufferSize       = 8192
	rateLimitWindow      = time.Minute
	defaultMaxSessions   = 30
	defaultCreateRate    = 12 // requests per minute per client IP
)

// Session represents a terminal session
type Session struct {
	ID          string
	ContainerID string
	CreatedAt   time.Time
	ExecID      string
}

type wsControlMessage struct {
	Type string `json:"type"`
	Cols uint   `json:"cols"`
	Rows uint   `json:"rows"`
}

type fileEntry struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

var (
	sessions               = make(map[string]*Session)
	mu                     sync.RWMutex
	createSessionAttempts  = make(map[string][]time.Time)
	createSessionAttemptsM sync.Mutex
	maxActiveSessions      = getEnvInt("MAX_ACTIVE_SESSIONS", defaultMaxSessions)
	createRatePerMinute    = getEnvInt("SESSION_CREATE_RATE_LIMIT_PER_MINUTE", defaultCreateRate)
	upgrader               = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			return isOriginAllowed(origin)
		},
	}
)

func main() {
	// Validate environment
	if err := validateEnvironment(); err != nil {
		log.Fatalf("Environment validation failed: %v", err)
	}

	router := mux.NewRouter()

	// Middleware chain
	router.Use(securityHeadersMiddleware)
	router.Use(corsMiddleware)
	router.Use(loggingMiddleware)

	// Routes
	router.HandleFunc("/api/session", createSession).Methods("POST", "OPTIONS")
	router.HandleFunc("/api/terminal/{sessionId}", handleTerminal)
	router.HandleFunc("/api/session/{sessionId}", deleteSession).Methods("DELETE", "OPTIONS")
	router.HandleFunc("/api/session/{sessionId}/files", listSessionFiles).Methods("GET", "OPTIONS")
	router.HandleFunc("/api/session/{sessionId}/file", readSessionFile).Methods("GET", "OPTIONS")
	router.HandleFunc("/health", healthCheck).Methods("GET")

	// No static frontend in this deployment. UI is deployed separately.
	router.PathPrefix("/").Handler(http.NotFoundHandler())

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	log.Printf("Server starting on port %s", port)
	log.Printf("Environment: %s", getEnvironment())
	log.Printf("Session limits: max_active=%d create_per_minute=%d", maxActiveSessions, createRatePerMinute)
	log.Fatal(http.ListenAndServe(":"+port, router))
}

func validateEnvironment() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Verify Docker is accessible
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return fmt.Errorf("failed to create Docker client: %w", err)
	}
	defer cli.Close()

	// Ping Docker daemon
	if _, err := cli.Ping(ctx); err != nil {
		return fmt.Errorf("cannot connect to Docker daemon: %w", err)
	}

	// Check if terminal base image exists
	_, _, err = cli.ImageInspectWithRaw(ctx, terminalImageName)
	if err != nil {
		log.Printf("Warning: Terminal base image '%s' not found. Build it with: docker build -t %s -f Dockerfile.terminal .", terminalImageName, terminalImageName)
	}

	log.Println("✅ Environment validation passed")
	return nil
}

func getEnvironment() string {
	env := os.Getenv("ENVIRONMENT")
	if env == "" {
		return "development"
	}
	return env
}

func getEnvInt(key string, defaultValue int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		log.Printf("Invalid %s=%q; using default %d", key, raw, defaultValue)
		return defaultValue
	}
	return value
}

func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Security headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Only set CSP for non-WebSocket requests
		if r.Header.Get("Upgrade") != "websocket" {
			w.Header().Set("Content-Security-Policy", "default-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net")
		}

		next.ServeHTTP(w, r)
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" && !isOriginAllowed(origin) {
			http.Error(w, "Origin not allowed", http.StatusForbidden)
			return
		}

		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", normalizeOrigin(origin))
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "3600")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func isOriginAllowed(origin string) bool {
	origin = normalizeOrigin(origin)
	if origin == "" {
		return true
	}

	allowedOrigins := getAllowedOrigins()
	if len(allowedOrigins) == 0 {
		// Keep development friction low, but fail closed in production.
		return getEnvironment() != "production"
	}

	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func getAllowedOrigins() []string {
	joined := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if joined == "" {
		joined = strings.TrimSpace(os.Getenv("ALLOWED_ORIGIN"))
	}
	if joined == "" {
		return nil
	}

	parts := strings.Split(joined, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		origin := normalizeOrigin(part)
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}

func normalizeOrigin(origin string) string {
	origin = strings.TrimSpace(origin)
	origin = strings.TrimSuffix(origin, "/")
	if origin == "" {
		return ""
	}

	// Accept full URLs in ALLOWED_ORIGINS (including accidental path/query),
	// but normalize them down to strict origin format: scheme://host[:port].
	if strings.Contains(origin, "://") {
		parsed, err := url.Parse(origin)
		if err == nil && parsed.Scheme != "" && parsed.Host != "" {
			return parsed.Scheme + "://" + parsed.Host
		}
	}

	return origin
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Skip logging for WebSocket upgrades and health checks
		if r.URL.Path == "/health" || r.Header.Get("Upgrade") == "websocket" {
			next.ServeHTTP(w, r)
			return
		}

		log.Printf("[%s] %s %s", r.Method, r.URL.Path, r.RemoteAddr)

		next.ServeHTTP(w, r)

		log.Printf("[%s] %s completed in %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func healthCheck(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	health := map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().Unix(),
	}

	// Check Docker daemon
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		health["status"] = "error"
		health["docker"] = "unavailable"
		json.NewEncoder(w).Encode(health)
		return
	}
	defer cli.Close()

	if _, err := cli.Ping(ctx); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		health["status"] = "error"
		health["docker"] = "unreachable"
		json.NewEncoder(w).Encode(health)
		return
	}

	// Add session count
	mu.RLock()
	health["active_sessions"] = len(sessions)
	mu.RUnlock()

	health["docker"] = "ok"

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(health)
}

// createSession creates a new Docker container and returns session ID
func createSession(w http.ResponseWriter, r *http.Request) {
	if isSessionCapacityReached() {
		http.Error(w, "Session capacity reached. Try again later.", http.StatusServiceUnavailable)
		return
	}

	clientIP := getClientIP(r)
	if !allowCreateSession(clientIP) {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "Too many session requests. Please wait and retry.", http.StatusTooManyRequests)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Create Docker client
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Printf("Error creating Docker client: %v", err)
		http.Error(w, "Failed to connect to Docker", http.StatusInternalServerError)
		return
	}
	defer cli.Close()

	// Create container
	resp, err := cli.ContainerCreate(ctx, &container.Config{
		Image:        terminalImageName,
		Cmd:          []string{"/bin/bash"},
		Tty:          true,
		OpenStdin:    true,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/workspace",
		Env: []string{
			"TERM=xterm-256color",
		},
	}, &container.HostConfig{
		Resources: container.Resources{
			Memory:   containerMemoryLimit,
			NanoCPUs: containerCPULimit,
		},
		AutoRemove:  false,
		NetworkMode: "bridge", // Isolated network
	}, nil, nil, "")

	if err != nil {
		log.Printf("Error creating container: %v", err)
		http.Error(w, fmt.Sprintf("Failed to create container: %v", err), http.StatusInternalServerError)
		return
	}

	// Start container
	if err := cli.ContainerStart(ctx, resp.ID, types.ContainerStartOptions{}); err != nil {
		log.Printf("Error starting container %s: %v", resp.ID, err)
		// Try to remove the failed container
		cli.ContainerRemove(ctx, resp.ID, types.ContainerRemoveOptions{Force: true})
		http.Error(w, "Failed to start container", http.StatusInternalServerError)
		return
	}

	// Create session
	sessionID := uuid.New().String()
	session := &Session{
		ID:          sessionID,
		ContainerID: resp.ID,
		CreatedAt:   time.Now(),
	}

	mu.Lock()
	if len(sessions) >= maxActiveSessions {
		mu.Unlock()
		cli.ContainerRemove(ctx, resp.ID, types.ContainerRemoveOptions{Force: true, RemoveVolumes: true})
		http.Error(w, "Session capacity reached. Try again later.", http.StatusServiceUnavailable)
		return
	}
	sessions[sessionID] = session
	mu.Unlock()

	// Auto-cleanup after timeout
	go func() {
		time.Sleep(maxSessionTimeout)
		cleanupSession(sessionID)
	}()

	log.Printf("✅ Created session %s with container %s", sessionID, resp.ID[:12])

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"sessionId":   sessionID,
		"containerId": resp.ID,
	})
}

func isSessionCapacityReached() bool {
	mu.RLock()
	defer mu.RUnlock()
	return len(sessions) >= maxActiveSessions
}

func allowCreateSession(clientIP string) bool {
	now := time.Now()
	cutoff := now.Add(-rateLimitWindow)

	createSessionAttemptsM.Lock()
	defer createSessionAttemptsM.Unlock()

	attempts := createSessionAttempts[clientIP]
	trimmed := attempts[:0]
	for _, t := range attempts {
		if t.After(cutoff) {
			trimmed = append(trimmed, t)
		}
	}

	if len(trimmed) >= createRatePerMinute {
		createSessionAttempts[clientIP] = trimmed
		return false
	}

	trimmed = append(trimmed, now)
	createSessionAttempts[clientIP] = trimmed
	return true
}

func getClientIP(r *http.Request) string {
	// Prefer the last client hop before our direct reverse proxy.
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		ips := make([]string, 0, len(parts))
		for _, p := range parts {
			ip := strings.TrimSpace(p)
			if ip == "" {
				continue
			}
			if _, err := netip.ParseAddr(ip); err == nil {
				ips = append(ips, ip)
			}
		}
		if n := len(ips); n >= 2 {
			return ips[n-2]
		}
		if len(ips) == 1 {
			return ips[0]
		}
	}

	if xrip := strings.TrimSpace(r.Header.Get("X-Real-IP")); xrip != "" {
		if _, err := netip.ParseAddr(xrip); err == nil {
			return xrip
		}
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// handleTerminal handles WebSocket connection for terminal I/O
func handleTerminal(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	mu.RLock()
	session, exists := sessions[sessionID]
	mu.RUnlock()

	if !exists {
		log.Printf("Session not found: %s", sessionID)
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed for session %s: %v", sessionID, err)
		return
	}
	defer conn.Close()

	log.Printf("WebSocket connected for session %s", sessionID)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Create Docker client
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Printf("Docker client error for session %s: %v", sessionID, err)
		conn.WriteMessage(websocket.TextMessage, []byte("Error: Cannot connect to Docker\r\n"))
		return
	}
	defer cli.Close()

	// Verify container is running
	containerInfo, err := cli.ContainerInspect(ctx, session.ContainerID)
	if err != nil {
		log.Printf("Container inspect failed for session %s: %v", sessionID, err)
		conn.WriteMessage(websocket.TextMessage, []byte("Error: Container not found\r\n"))
		return
	}

	if !containerInfo.State.Running {
		log.Printf("Container not running for session %s", sessionID)
		conn.WriteMessage(websocket.TextMessage, []byte("Error: Container not running\r\n"))
		return
	}

	// Create exec instance
	execConfig := types.ExecConfig{
		Cmd:          []string{"/bin/bash"},
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		Env: []string{
			"TERM=xterm-256color",
		},
	}

	execResp, err := cli.ContainerExecCreate(context.Background(), session.ContainerID, execConfig)
	if err != nil {
		log.Printf("Exec create failed for session %s: %v", sessionID, err)
		conn.WriteMessage(websocket.TextMessage, []byte("Error: Failed to create shell\r\n"))
		return
	}

	// Set an initial PTY size so full-screen tools (vim, less, top) start reliably.
	if err := cli.ContainerExecResize(context.Background(), execResp.ID, types.ResizeOptions{
		Width:  120,
		Height: 40,
	}); err != nil {
		log.Printf("Initial resize failed for session %s: %v", sessionID, err)
	}

	// Attach to exec
	attachResp, err := cli.ContainerExecAttach(context.Background(), execResp.ID, types.ExecStartCheck{
		Tty: true,
	})
	if err != nil {
		log.Printf("Exec attach failed for session %s: %v", sessionID, err)
		conn.WriteMessage(websocket.TextMessage, []byte("Error: Failed to attach to shell\r\n"))
		return
	}
	defer attachResp.Close()

	// Channel to signal completion
	done := make(chan struct{})

	// Read from container and send to WebSocket
	go func() {
		defer close(done)
		buf := make([]byte, readBufferSize)
		for {
			n, err := attachResp.Reader.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("Read error for session %s: %v", sessionID, err)
				}
				return
			}

			if n > 0 {
				// PTY output can include non-UTF-8 bytes (for example from full-screen TUIs like vim).
				// WebSocket text frames must be valid UTF-8, so normalize before forwarding.
				chunk := strings.ToValidUTF8(string(buf[:n]), "")
				if err := conn.WriteMessage(websocket.TextMessage, []byte(chunk)); err != nil {
					log.Printf("WebSocket write error for session %s: %v", sessionID, err)
					return
				}
			}
		}
	}()

	// Read from WebSocket and send to container
	for {
		select {
		case <-done:
			return
		default:
			msgType, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WebSocket unexpected close for session %s: %v", sessionID, err)
				}
				return
			}

			if msgType == websocket.TextMessage {
				var ctrl wsControlMessage
				if err := json.Unmarshal(message, &ctrl); err == nil && ctrl.Type == "resize" {
					if ctrl.Cols > 0 && ctrl.Rows > 0 {
						if err := cli.ContainerExecResize(context.Background(), execResp.ID, types.ResizeOptions{
							Width:  ctrl.Cols,
							Height: ctrl.Rows,
						}); err != nil {
							log.Printf("Resize error for session %s: %v", sessionID, err)
						}
					}
					continue
				}
			}

			if _, err := attachResp.Conn.Write(message); err != nil {
				log.Printf("Container write error for session %s: %v", sessionID, err)
				return
			}
		}
	}
}

func listSessionFiles(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	session, ok := getSession(sessionID)
	if !ok {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, "Failed to connect to Docker", http.StatusInternalServerError)
		return
	}
	defer cli.Close()

	out, _, err := execInContainer(ctx, cli, session.ContainerID, []string{
		"bash", "-lc", "cd /workspace && find . -maxdepth 5 -type f -printf '%P\t%s\n' | head -n 300",
	})
	if err != nil {
		http.Error(w, "Failed to list files", http.StatusInternalServerError)
		return
	}

	files := make([]fileEntry, 0, 64)
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}

		parts := strings.SplitN(line, "\t", 2)
		if len(parts) != 2 {
			continue
		}

		path := strings.TrimSpace(parts[0])
		size := int64(0)
		fmt.Sscanf(strings.TrimSpace(parts[1]), "%d", &size)
		if path == "" {
			continue
		}
		files = append(files, fileEntry{Path: path, Size: size})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"files": files,
	})
}

func readSessionFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]
	relPath, err := normalizeWorkspacePath(r.URL.Query().Get("path"))
	if err != nil {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	session, ok := getSession(sessionID)
	if !ok {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		http.Error(w, "Failed to connect to Docker", http.StatusInternalServerError)
		return
	}
	defer cli.Close()

	pathArg := shellQuote(relPath)
	cmd := fmt.Sprintf("cd /workspace && if [ -f %s ]; then sed -n '1,2000p' %s; else exit 2; fi", pathArg, pathArg)
	content, stderr, err := execInContainer(ctx, cli, session.ContainerID, []string{"bash", "-lc", cmd})
	if err != nil {
		log.Printf("Failed reading file %s in session %s: %v %s", relPath, sessionID, err, stderr)
		http.Error(w, "Failed to read file", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"path":    relPath,
		"content": content,
	})
}

func execInContainer(ctx context.Context, cli *client.Client, containerID string, cmd []string) (string, string, error) {
	execResp, err := cli.ContainerExecCreate(ctx, containerID, types.ExecConfig{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		AttachStdin:  false,
		Tty:          false,
	})
	if err != nil {
		return "", "", err
	}

	attachResp, err := cli.ContainerExecAttach(ctx, execResp.ID, types.ExecStartCheck{Tty: false})
	if err != nil {
		return "", "", err
	}
	defer attachResp.Close()

	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdoutBuf, &stderrBuf, attachResp.Reader); err != nil && err != io.EOF {
		return "", "", err
	}

	inspect, err := cli.ContainerExecInspect(ctx, execResp.ID)
	if err != nil {
		return "", "", err
	}
	if inspect.ExitCode != 0 {
		return stdoutBuf.String(), stderrBuf.String(), fmt.Errorf("command failed with exit code %d", inspect.ExitCode)
	}

	return stdoutBuf.String(), stderrBuf.String(), nil
}

func getSession(sessionID string) (*Session, bool) {
	mu.RLock()
	defer mu.RUnlock()
	session, ok := sessions[sessionID]
	return session, ok
}

func normalizeWorkspacePath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("empty path")
	}

	clean := filepath.Clean(raw)
	clean = strings.TrimPrefix(clean, "./")
	if strings.HasPrefix(clean, "/") || clean == "." || strings.HasPrefix(clean, "..") {
		return "", fmt.Errorf("invalid path")
	}
	return clean, nil
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

// deleteSession stops and removes a container
func deleteSession(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["sessionId"]

	mu.RLock()
	_, exists := sessions[sessionID]
	mu.RUnlock()

	if !exists {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	cleanupSession(sessionID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "deleted",
		"sessionId": sessionID,
	})
}

func cleanupSession(sessionID string) {
	mu.Lock()
	session, exists := sessions[sessionID]
	if !exists {
		mu.Unlock()
		return
	}
	delete(sessions, sessionID)
	mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Printf("❌ Docker client error during cleanup of session %s: %v", sessionID, err)
		return
	}
	defer cli.Close()

	// Stop container with timeout
	timeout := 10
	stopOptions := container.StopOptions{Timeout: &timeout}
	if err := cli.ContainerStop(ctx, session.ContainerID, stopOptions); err != nil {
		log.Printf("⚠️  Failed to stop container %s: %v", session.ContainerID[:12], err)
	}

	// Remove container forcefully
	removeOptions := types.ContainerRemoveOptions{
		Force:         true,
		RemoveVolumes: true,
	}
	if err := cli.ContainerRemove(ctx, session.ContainerID, removeOptions); err != nil {
		log.Printf("⚠️  Failed to remove container %s: %v", session.ContainerID[:12], err)
		return
	}

	log.Printf("🧹 Cleaned up session %s (container %s)", sessionID, session.ContainerID[:12])
}
