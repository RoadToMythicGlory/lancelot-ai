# Start API Gateway locally with Docker databases.
#
# Credentials must be supplied through environment variables or a local `.env`
# file (which dotenv will load automatically). This script intentionally does
# NOT contain default passwords — set them in your shell or `.env` before
# running it.
#
# Required: MONGO_PASSWORD (or MONGODB_URL), MONGO_USERNAME, JWT_SECRET
# Optional: NODE_ENV (default development), PORT (default 4001)

if (-not $env:NODE_ENV) { $env:NODE_ENV = "development" }
if (-not $env:PORT) { $env:PORT = "4001" }

$missing = @()
if (-not $env:MONGODB_URL -and (-not $env:MONGO_USERNAME -or -not $env:MONGO_PASSWORD)) {
    $missing += "MONGODB_URL or MONGO_USERNAME + MONGO_PASSWORD"
}
if (-not $env:JWT_SECRET) {
    $missing += "JWT_SECRET"
}

if ($missing.Count -gt 0) {
    Write-Host "Missing required environment variables:" -ForegroundColor Red
    foreach ($m in $missing) { Write-Host "  - $m" -ForegroundColor Red }
    Write-Host "Set them in your shell or a local .env file before running this script." -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting API Gateway with Docker databases..." -ForegroundColor Green
Write-Host "MongoDB: localhost:27017" -ForegroundColor Cyan
Write-Host "API Gateway: localhost:$($env:PORT)" -ForegroundColor Yellow

npm run dev
