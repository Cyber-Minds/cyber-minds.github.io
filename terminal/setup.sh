#!/bin/bash

echo "🚀 Setting up Docker Web Terminal..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose first:"
    echo "   https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running. Please start Docker."
    exit 1
fi

echo "✅ Docker is installed and running"
echo ""

# Build images
echo "📦 Building terminal base image (this may take a few minutes)..."
docker build -t terminal-base:latest -f Dockerfile.terminal .

if [ $? -ne 0 ]; then
    echo "❌ Failed to build terminal base image"
    exit 1
fi

echo "✅ Terminal base image built"
echo ""

echo "📦 Building backend..."
docker build -t terminal-backend:latest -f Dockerfile .

if [ $? -ne 0 ]; then
    echo "❌ Failed to build backend"
    exit 1
fi

echo "✅ Backend built"
echo ""

# Start services
echo "🚀 Starting services..."
docker-compose up -d

if [ $? -ne 0 ]; then
    echo "❌ Failed to start services"
    exit 1
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🌐 Terminal is running at: http://localhost:8080"
echo ""
echo "Commands:"
echo "  make logs    - View logs"
echo "  make stop    - Stop services"
echo "  make clean   - Clean up everything"
