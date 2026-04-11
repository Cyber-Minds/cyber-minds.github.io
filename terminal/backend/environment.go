package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/client"
)

// validateEnvironment ensures Docker is reachable and logs image readiness.
func validateEnvironment() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return fmt.Errorf("failed to create Docker client: %w", err)
	}
	defer cli.Close()

	if _, err := cli.Ping(ctx); err != nil {
		return fmt.Errorf("cannot connect to Docker daemon: %w", err)
	}

	if _, _, err := cli.ImageInspectWithRaw(ctx, terminalImageName); err != nil {
		log.Printf("Warning: Terminal base image '%s' not found. Build it with: docker build -t %s -f Dockerfile.terminal .", terminalImageName, terminalImageName)
	}

	log.Println("Environment validation passed")
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
