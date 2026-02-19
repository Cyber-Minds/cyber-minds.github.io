package main

import (
	"net/http"
	"sync"
	"time"

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

// Session tracks container metadata for an active browser terminal session.
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
