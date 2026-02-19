package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/docker/docker/client"
)

func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

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

	mu.RLock()
	health["active_sessions"] = len(sessions)
	mu.RUnlock()

	health["docker"] = "ok"

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(health)
}
