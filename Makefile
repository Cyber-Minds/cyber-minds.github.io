.PHONY: help terminal-build terminal-up terminal-down terminal-logs site dev stop

TERMINAL_DIR := terminal
SITE_PORT ?= 8080
TERMINAL_API_PORT ?= 3000
LIVE_SERVER ?= live-server
COMPOSE ?= docker compose

help:
	@echo "Targets:"
	@echo "  make dev            - Start terminal Docker stack and run live-server"
	@echo "  make site           - Run live-server only (expects terminal API on :3000)"
	@echo "  make terminal-build - Build terminal Docker images"
	@echo "  make terminal-up    - Start terminal Docker stack"
	@echo "  make terminal-down  - Stop terminal Docker stack"
	@echo "  make terminal-logs  - Follow terminal backend logs"
	@echo "  make stop           - Stop terminal stack (live-server stops with Ctrl+C)"

terminal-build:
	$(COMPOSE) -f $(TERMINAL_DIR)/docker-compose.yml build

terminal-up:
	$(COMPOSE) -f $(TERMINAL_DIR)/docker-compose.yml up -d --build

terminal-down:
	$(COMPOSE) -f $(TERMINAL_DIR)/docker-compose.yml down

terminal-logs:
	$(COMPOSE) -f $(TERMINAL_DIR)/docker-compose.yml logs -f backend

site:
	$(LIVE_SERVER) . \
		--port=$(SITE_PORT) \
		--open=/index.html \
		--proxy=/api:http://127.0.0.1:$(TERMINAL_API_PORT)/api \
		--proxy=/health:http://127.0.0.1:$(TERMINAL_API_PORT)/health

dev: terminal-up site

stop: terminal-down
