package main

import (
	"net/http"
	"testing"
	"time"
)

func TestNewHTTPServerBoundsConnectionsWithoutTimingOutWebSockets(t *testing.T) {
	server := newHTTPServer(":0", http.NotFoundHandler())

	if server.ReadHeaderTimeout != 5*time.Second {
		t.Fatalf("ReadHeaderTimeout = %v, want 5s", server.ReadHeaderTimeout)
	}
	if server.IdleTimeout != 60*time.Second {
		t.Fatalf("IdleTimeout = %v, want 1m", server.IdleTimeout)
	}
	if server.MaxHeaderBytes != 64<<10 {
		t.Fatalf("MaxHeaderBytes = %d, want %d", server.MaxHeaderBytes, 64<<10)
	}
	if server.ReadTimeout != 0 || server.WriteTimeout != 0 {
		t.Fatal("whole-request timeouts must remain unset for WebSocket streams")
	}
}
