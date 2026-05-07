@echo off
title Lancelot Platform - Development Services
echo Starting Lancelot Platform Development Services...
echo.

echo Starting databases...
docker-compose up -d postgres redis
timeout /t 3 /nobreak >nul

echo.
echo Starting API Gateway on port 4000...
start "API Gateway" cmd /k "cd services\api-gateway && npm run start:dev"
timeout /t 5 /nobreak >nul

echo.
echo Starting Web App on port 3000...
start "Web App" cmd /k "cd apps\web && npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo ================================
echo All services are starting up!
echo ================================
echo Web App:      http://localhost:3000
echo GraphQL API:  http://localhost:4000/graphql
echo PostgreSQL:   localhost:5432
echo Redis:        localhost:6379
echo.
echo Press any key to stop all services...
pause >nul

echo.
echo Stopping services...
taskkill /f /fi "WindowTitle eq API Gateway*" 2>nul
taskkill /f /fi "WindowTitle eq Web App*" 2>nul
docker-compose stop postgres redis
echo Services stopped.
pause 