#!/bin/bash
# Quick start script for Docker

echo "Starting HelpDesk with Docker..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "Please edit .env file with your configuration!"
fi

# Start containers
echo "Starting Docker containers..."
docker-compose up -d

echo ""
echo "Waiting for services to be ready..."
sleep 5

# Check status
echo ""
echo "Container status:"
docker-compose ps

echo ""
echo "Services are starting..."
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:8000"
echo "MinIO Console: http://localhost:9001"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down"
