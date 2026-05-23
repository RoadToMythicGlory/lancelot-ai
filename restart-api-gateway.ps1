# ============================================================================
# Lancelot Platform - API Gateway Development Restart Script
# ----------------------------------------------------------------------------
# This script restarts only the local API Gateway backend server.
# It leaves the web app, Excel Parser, AI Agent, and other Node.js processes
# alone unless their command line points at services\api-gateway.
# ============================================================================

$repoRoot = $PSScriptRoot
$apiGatewayPath = Join-Path $repoRoot "services\api-gateway"

Write-Host "Stopping existing API Gateway processes..." -ForegroundColor Yellow

$apiGatewayPathPattern = [regex]::Escape($apiGatewayPath)
$apiGatewayProcesses = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -match $apiGatewayPathPattern -or
        $_.CommandLine -match "services[\\/]api-gateway"
    }

foreach ($process in $apiGatewayProcesses) {
    Write-Host "  Stopping API Gateway process (PID: $($process.ProcessId))" -ForegroundColor DarkGray
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $apiGatewayPath)) {
    Write-Host "API Gateway directory not found: $apiGatewayPath" -ForegroundColor Red
    exit 1
}

Write-Host "Starting API Gateway..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$apiGatewayPath'; `$env:ENABLE_E2EE_CHAT='true'; `$env:E2EE_FALLBACK_WARNING='true'; npm run dev"

Write-Host ""
Write-Host "API Gateway is starting..." -ForegroundColor Green
Write-Host "API Gateway: http://localhost:4000/graphql" -ForegroundColor Cyan
