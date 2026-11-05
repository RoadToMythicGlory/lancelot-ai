# ============================================================================
# Lancelot Platform - On-Prem Development Restart Script
# ----------------------------------------------------------------------------
# This script restarts the local dev stack for the on-prem build of the app.
#   * No Streamer app: `apps/streamer` was removed when we collapsed the
#     standalone streamer into the main web app. The script no longer starts
#     it and warns if a stale `apps/streamer` directory is present.
#   * No SaaS billing service: the on-prem cleanup removed billing, org
#     signup, and subscription jobs from the API gateway. The web app exposes
#     internal IT support at /it-support instead.
#   * Services started: API Gateway, Excel Parser, Web App, AI Agent
#     (plus the Mosquitto MQTT broker via docker-compose for BLE tracking).
# ============================================================================

# Stop all Node.js processes
Write-Host "Stopping all Node.js processes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Sanity check: warn if a stale streamer app folder is still around so the
# author notices and removes it. The on-prem build does not use it.
if (Test-Path "apps\streamer") {
    Write-Host "  WARNING: apps\streamer still exists on disk but is no longer part of the on-prem build." -ForegroundColor DarkYellow
    Write-Host "  Delete it with: Remove-Item -Recurse -Force apps\streamer" -ForegroundColor DarkYellow
}

# Clear Next.js cache so removed pages (e.g. /billing) and renamed routes
# (e.g. /it-support) are picked up cleanly on the next dev boot.
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

# Start API Gateway (on-prem singleton: no organization signup, no billing
# resolvers, no subscription/trial jobs, IT support tickets at itTicket*).
Write-Host "Starting API Gateway..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services\api-gateway; `$env:ENABLE_E2EE_CHAT='true'; `$env:E2EE_FALLBACK_WARNING='true'; npm run dev"

# Wait for API to start
Start-Sleep -Seconds 5

# Start Excel Parser Service
Write-Host "Starting Excel Parser Service..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services\excel-parser; npm run dev"

# Wait for Excel Parser to start
Start-Sleep -Seconds 3

# Start Web App (on-prem: /billing route removed, /it-support added,
# Settings page now talks to the singleton site/company record).
Write-Host "Starting Web App..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd apps\web; `$env:NEXT_PUBLIC_ENABLE_E2EE_CHAT='true'; `$env:NEXT_PUBLIC_E2EE_FALLBACK_WARNING='true'; npm run dev"

# Start AI Agent
Write-Host "Starting AI Agent..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services\ai-agent; `$env:ENABLE_E2EE_CHAT='true'; `$env:E2EE_FALLBACK_WARNING='true'; `$env:RSS_PIPELINE_ENABLED='true'; npm run dev"

Write-Host ""
Write-Host "Development servers are starting..." -ForegroundColor Green
Write-Host "API Gateway:    http://localhost:4000/graphql" -ForegroundColor Cyan
Write-Host "Excel Parser:   http://localhost:3002" -ForegroundColor Cyan
Write-Host "Web App:        http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Settings:     http://localhost:3000/settings" -ForegroundColor DarkCyan
Write-Host "  Help:         http://localhost:3000/help" -ForegroundColor DarkCyan
Write-Host "  IT Support:   http://localhost:3000/it-support" -ForegroundColor DarkCyan
Write-Host "AI Agent:       http://localhost:4001/health" -ForegroundColor Cyan
Write-Host "MQTT Broker:    mqtt://localhost:1883" -ForegroundColor Cyan
