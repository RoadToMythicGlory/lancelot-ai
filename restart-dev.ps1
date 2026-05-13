# Stop all Node.js processes
Write-Host "Stopping all Node.js processes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Clear Next.js cache
Write-Host "Clearing Next.js cache..." -ForegroundColor Yellow
Remove-Item -Path "apps\web\.next" -Recurse -Force -ErrorAction SilentlyContinue

# Start Mosquitto MQTT broker (for BLE equipment tracking)
Write-Host "Starting Mosquitto MQTT broker..." -ForegroundColor Green
$mosquittoRunning = docker ps --filter "name=lancelot-mosquitto" --format "{{.Names}}" 2>$null
if ($mosquittoRunning -eq "lancelot-mosquitto") {
    Write-Host "  Mosquitto already running." -ForegroundColor DarkGray
} else {
    docker-compose -f docker-compose.tracking.yml up -d 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: Could not start Mosquitto. BLE tracking will be unavailable." -ForegroundColor DarkYellow
        Write-Host "  Make sure Docker is running and try: docker-compose -f docker-compose.tracking.yml up -d" -ForegroundColor DarkYellow
    }
}

# Wait a moment
Start-Sleep -Seconds 2

# Start API Gateway
Write-Host "Starting API Gateway..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services\api-gateway; `$env:ENABLE_E2EE_CHAT='true'; `$env:E2EE_FALLBACK_WARNING='true'; npm run dev"

# Wait for API to start
Start-Sleep -Seconds 5

# Start Excel Parser Service
Write-Host "Starting Excel Parser Service..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services\excel-parser; npm run dev"

# Wait for Excel Parser to start
Start-Sleep -Seconds 3

# Start Web App
Write-Host "Starting Web App..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd apps\web; `$env:NEXT_PUBLIC_ENABLE_E2EE_CHAT='true'; `$env:NEXT_PUBLIC_E2EE_FALLBACK_WARNING='true'; npm run dev"

# Start AI Agent
Write-Host "Starting AI Agent..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services\ai-agent; `$env:ENABLE_E2EE_CHAT='true'; `$env:E2EE_FALLBACK_WARNING='true'; `$env:RSS_PIPELINE_ENABLED='true'; npm run dev"

# Start Streamer App
Write-Host "Starting Streamer App..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd apps\streamer; npm run dev"

Write-Host "Development servers are starting..." -ForegroundColor Green
Write-Host "API Gateway:   http://localhost:4000/graphql" -ForegroundColor Cyan
Write-Host "Excel Parser:  http://localhost:3002" -ForegroundColor Cyan
Write-Host "Web App (ERP): http://localhost:3000" -ForegroundColor Cyan
Write-Host "Streamer App:  http://localhost:3100" -ForegroundColor Cyan
Write-Host "AI Agent:      http://localhost:4001/health" -ForegroundColor Cyan
Write-Host "MQTT Broker:   mqtt://localhost:1883" -ForegroundColor Cyan