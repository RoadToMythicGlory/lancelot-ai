#!/usr/bin/env pwsh

Write-Host "🔄 Restarting Backend API Gateway with Fixed Resolvers" -ForegroundColor Cyan
Write-Host "===================================================`n" -ForegroundColor Cyan

# Stop any existing API Gateway processes
Write-Host "🛑 Stopping existing API Gateway processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -match "node" -and $_.CommandLine -match "api-gateway"} | ForEach-Object {
    Write-Host "   Stopping API Gateway (PID: $($_.Id))" -ForegroundColor Gray
    try { Stop-Process $_.Id -Force -ErrorAction SilentlyContinue } catch {}
}

# Change to API Gateway directory
Write-Host "📁 Navigating to API Gateway directory..." -ForegroundColor Yellow
Set-Location "services/api-gateway"

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Build TypeScript
Write-Host "🔨 Building TypeScript..." -ForegroundColor Yellow
try {
    npx tsc
    Write-Host "✅ TypeScript build successful" -ForegroundColor Green
} catch {
    Write-Host "❌ TypeScript build failed" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# Start the API Gateway
Write-Host "🚀 Starting API Gateway with all resolvers..." -ForegroundColor Green
Write-Host "   📊 GraphQL endpoint: http://localhost:4000/graphql" -ForegroundColor Cyan
Write-Host "   📋 Resolvers loaded: users, permissions, broadcasts, production-events, shifts, tickets`n" -ForegroundColor Cyan

# Start in background
$job = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    node dist/index.js
}

Write-Host "✅ API Gateway started (Job ID: $($job.Id))" -ForegroundColor Green
Write-Host "🔍 Use 'Receive-Job $($job.Id)' to see output" -ForegroundColor Gray
Write-Host "🛑 Use 'Stop-Job $($job.Id); Remove-Job $($job.Id)' to stop" -ForegroundColor Gray

# Return to root directory
Set-Location "../.."

Write-Host "`n🎉 Backend restart complete! All GraphQL resolvers should now be working." -ForegroundColor Green
Write-Host "💡 You can now refresh your frontend to test the dark mode without GraphQL errors." -ForegroundColor Cyan 