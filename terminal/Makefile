.PHONY: build run dev stop clean

# Build everything
build:
	@echo "Building terminal base image..."
	docker build -t terminal-base:latest -f Dockerfile.terminal .
	@echo "Building backend..."
	docker build -t terminal-backend:latest -f Dockerfile .

# Run with docker-compose
run:
	docker-compose up -d

# Development mode (with logs)
dev:
	docker-compose up

# Stop all containers
stop:
	docker-compose down

# Clean up everything
clean:
	docker-compose down -v
	docker rmi terminal-base:latest terminal-backend:latest || true
	docker system prune -f

# Build and run
all: build run

# View logs
logs:
	docker-compose logs -f backend
