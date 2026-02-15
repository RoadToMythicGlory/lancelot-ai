Write-Host "Starting Next.js development server..." -ForegroundColor Green

# Change to the script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start the Next.js development server
Write-Host "Starting server on http://localhost:3000" -ForegroundColor Cyan
node ./node_modules/next/dist/bin/next dev 