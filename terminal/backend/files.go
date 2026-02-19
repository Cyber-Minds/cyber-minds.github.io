package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/gorilla/mux"
)

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
