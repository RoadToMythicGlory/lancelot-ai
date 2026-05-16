# Lancelot API Gateway development runner.
#
# Loads environment variables from your shell or `.env` file (via dotenv) and
# starts the dev server. No credentials are hardcoded here — supply them in
# `.env` (see services/api-gateway/.env.example) or via your shell.

Write-Host "Starting Lancelot API Gateway..." -ForegroundColor Cyan

if (-not $env:NODE_ENV) { $env:NODE_ENV = "development" }

$missing = @()
if (-not $env:MONGODB_URL -and (-not $env:MONGO_USERNAME -or -not $env:MONGO_PASSWORD) -and $env:NODE_ENV -ne "development") {
    $missing += "MONGODB_URL or MONGO_USERNAME + MONGO_PASSWORD"
}
if (-not $env:JWT_SECRET -and $env:NODE_ENV -ne "development") {
    $missing += "JWT_SECRET"
}

if ($missing.Count -gt 0) {
    Write-Host "Missing required environment variables:" -ForegroundColor Red
    foreach ($m in $missing) { Write-Host "  - $m" -ForegroundColor Red }
    Write-Host "Set them in your shell or a local .env file before running this script." -ForegroundColor Yellow
    exit 1
}

npm run dev
