# Lancelot Platform - Start Everything Script (Windows)
Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "    Lancelot Platform Starter" -ForegroundColor Blue
Write-Host "    Channel1 Operations Platform" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Check prerequisites
Write-Host "[CHECKING] Prerequisites..." -ForegroundColor Yellow

# Check Docker
try {
    docker --version | Out-Null
    Write-Host "[OK] Docker is installed" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker is not installed!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    Read-Host "Press Enter to exit"
    exit 1
}

# Check Node.js
try {
    node --version | Out-Null
    Write-Host "[OK] Node.js is installed" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js 18+ from: https://nodejs.org/"
    Read-Host "Press Enter to exit"
    exit 1
}

# Require a populated .env file. We do NOT auto-generate one with credentials —
# copy services/api-gateway/.env.example to .env and fill it in locally.
if (!(Test-Path ".env")) {
    Write-Host "[ERROR] No .env file found in the repository root." -ForegroundColor Red
    Write-Host "Copy services/api-gateway/.env.example to .env and supply MongoDB / JWT" -ForegroundColor Yellow
    Write-Host "credentials before running this script." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] .env file detected" -ForegroundColor Green

# Install dependencies
Write-Host "[INSTALLING] Dependencies..." -ForegroundColor Yellow
npm install
Write-Host "[OK] Dependencies installed" -ForegroundColor Green

# Start Docker services (only essential databases)
Write-Host "[STARTING] Essential databases..." -ForegroundColor Yellow
docker-compose down 2>$null
docker-compose up -d mongodb
Write-Host "[OK] MongoDB started" -ForegroundColor Green

# Wait for services
Write-Host "[WAITING] For MongoDB to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host "[OK] Databases should be ready" -ForegroundColor Green

# Start services in new windows
Write-Host "[STARTING] Application services..." -ForegroundColor Yellow

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/api-gateway; Write-Host 'API Gateway Starting...' -ForegroundColor Cyan; npm run start:dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/routing-engine; Write-Host 'Routing Engine Starting...' -ForegroundColor Cyan; npm run start:dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/excel-parser; Write-Host 'Excel Parser Starting...' -ForegroundColor Cyan; npm run start:dev"

Start-Sleep -Seconds 5

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd apps/web; Write-Host 'Web Application Starting...' -ForegroundColor Cyan; npm run dev"

# Wait for everything to start
Start-Sleep -Seconds 10

# Success message
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "    LANCELOT IS RUNNING!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Web Application:    http://localhost:3000" -ForegroundColor Cyan
Write-Host "GraphQL Playground: http://localhost:4000/graphql" -ForegroundColor Cyan
Write-Host "MongoDB:            localhost:27017" -ForegroundColor Cyan
Write-Host ""
Write-Host "Database Login: see your local .env file for credentials" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to stop all services..." -ForegroundColor Yellow

# Wait for key press
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Cleanup
Write-Host ""
Write-Host "[STOPPING] All services..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force 2>$null
docker-compose down
Write-Host "[OK] All services stopped" -ForegroundColor Green 