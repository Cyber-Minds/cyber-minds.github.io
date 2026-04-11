// Package main implements the CyberMinds terminal backend service.
//
// The service exposes HTTP and WebSocket endpoints for creating isolated
// per-user Docker sessions and streaming interactive shell I/O. It also provides
// workspace file listing and file-read endpoints used by the browser editor.
//
// Security-sensitive behavior includes:
//   - strict origin validation for CORS and WebSocket upgrades
//   - per-IP session creation rate limiting
//   - bounded active session count and container resource limits
//   - path normalization for workspace file reads
package main
