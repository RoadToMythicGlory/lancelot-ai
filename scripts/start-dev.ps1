# PowerShell script to start all development services
Write-Host "Starting Lancelot Platform Development Servers..." -ForegroundColor Green

# Start services in separate PowerShell jobs
$root = Split-Path -Parent $PSScriptRoot
$webJob = Start-Job -ScriptBlock { param($path) Set-Location $path; $env:NEXT_PUBLIC_ENABLE_E2EE_CHAT='true'; $env:NEXT_PUBLIC_E2EE_FALLBACK_WARNING='true'; npm run dev } -ArgumentList (Join-Path $root "apps\web")
$apiJob = Start-Job -ScriptBlock { param($path) Set-Location $path; $env:ENABLE_E2EE_CHAT='true'; $env:E2EE_FALLBACK_WARNING='true'; npm run dev } -ArgumentList (Join-Path $root "services\api-gateway")
$aiJob = Start-Job -ScriptBlock { param($path) Set-Location $path; $env:ENABLE_E2EE_CHAT='true'; $env:E2EE_FALLBACK_WARNING='true'; npm run dev } -ArgumentList (Join-Path $root "services\ai-agent")

Write-Host "Services started!" -ForegroundColor Green
Write-Host "Web App: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Gateway: http://localhost:4000" -ForegroundColor Yellow
Write-Host "AI Agent: http://localhost:4001/health" -ForegroundColor Magenta

Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Red

# Wait for user input to stop
try {
    while ($true) {
        Start-Sleep 1
    }
} finally {
    Write-Host "Stopping services..." -ForegroundColor Yellow
    Stop-Job $webJob, $apiJob, $aiJob
    Remove-Job $webJob, $apiJob, $aiJob
    Write-Host "All services stopped." -ForegroundColor Red
} 