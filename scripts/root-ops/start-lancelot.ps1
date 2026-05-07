# Lancelot Platform - Complete Startup Script
Write-Host "🚀 Starting Lancelot Platform..." -ForegroundColor Cyan
Write-Host ""

# Kill any existing Node processes
Write-Host "Stopping existing Node processes..." -ForegroundColor Yellow
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start API Gateway
Write-Host "Starting API Gateway on port 4000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
cd services\api-gateway
Write-Host 'API Gateway starting...' -ForegroundColor Yellow
npm run start:dev
"@

# Wait for API Gateway to start
Start-Sleep -Seconds 5

# Start Web App
Write-Host "Starting Web App on port 3000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
cd apps\web
Write-Host 'Web App starting...' -ForegroundColor Yellow
npm run dev
"@

# Wait for everything to be ready
Start-Sleep -Seconds 8

# Open browser
Write-Host ""
Write-Host "✅ All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "Opening browser..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "Services running at:" -ForegroundColor Yellow
Write-Host "  Web App:      http://localhost:3000" -ForegroundColor White
Write-Host "  API Gateway:  http://localhost:4000" -ForegroundColor White
Write-Host "  GraphQL:      http://localhost:4000/graphql" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Gray 