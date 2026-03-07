@echo off
REM Quick start script for Docker (Windows)

echo Starting HelpDesk with Docker...

REM Check if .env exists
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env
    echo Please edit .env file with your configuration!
)

REM Start containers
echo Starting Docker containers...
docker-compose up -d

timeout /t 5 /nobreak >nul

echo.
echo Container status:
docker-compose ps

echo.
echo Services are starting...
echo Frontend: http://localhost:3000
echo Backend API: http://localhost:8000
echo MinIO Console: http://localhost:9001
echo.
echo To view logs: docker-compose logs -f
echo To stop: docker-compose down

pause
