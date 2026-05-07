#!/usr/bin/env pwsh

Write-Host "🚀 Starting Lancelot Platform Services..." -ForegroundColor Green
Write-Host ""

# Start API Gateway
Write-Host "[1/3] Starting API Gateway..." -ForegroundColor Yellow
Set-Location "C:\Users\idanm\OneDrive\Desktop\Lancelot\services\api-gateway"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start" -WindowStyle Normal

Start-Sleep -Seconds 3

# Start Web App
Write-Host "[2/3] Starting Web Application..." -ForegroundColor Yellow  
Set-Location "C:\Users\idanm\OneDrive\Desktop\Lancelot\apps\web"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

# Start Routing Engine (optional)
Write-Host "[3/3] Starting Routing Engine..." -ForegroundColor Yellow
Set-Location "C:\Users\idanm\OneDrive\Desktop\Lancelot\services\routing-engine"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start" -WindowStyle Normal

Write-Host ""
Write-Host "✅ All services starting..." -ForegroundColor Green
Write-Host "✅ Web App: http://localhost:3000" -ForegroundColor Cyan
Write-Host "✅ API Gateway: http://localhost:4000" -ForegroundColor Cyan
Write-Host "✅ Check the separate windows for each service" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit" 