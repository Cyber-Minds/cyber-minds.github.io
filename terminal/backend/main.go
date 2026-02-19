package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
)

func main() {
	if err := validateEnvironment(); err != nil {
		log.Fatalf("Environment validation failed: %v", err)
	}

	router := mux.NewRouter()

	router.Use(securityHeadersMiddleware)
	router.Use(corsMiddleware)
	router.Use(loggingMiddleware)

	router.HandleFunc("/api/session", createSession).Methods("POST", "OPTIONS")
	router.HandleFunc("/api/terminal/{sessionId}", handleTerminal)
	router.HandleFunc("/api/session/{sessionId}", deleteSession).Methods("DELETE", "OPTIONS")
	router.HandleFunc("/api/session/{sessionId}/files", listSessionFiles).Methods("GET", "OPTIONS")
	router.HandleFunc("/api/session/{sessionId}/file", readSessionFile).Methods("GET", "OPTIONS")
	router.HandleFunc("/health", healthCheck).Methods("GET")

	// UI is served by the main website deployment, not this API process.
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
