# Helper that prepares environment variables for the Lancelot API Gateway.
#
# This script intentionally contains NO default credentials. Define the values
# below in your shell, in a `.env` file (loaded by dotenv), or by sourcing this
# script after editing it locally — and never commit your edits.
#
# Required: MONGO_USERNAME, MONGO_PASSWORD (or MONGODB_URL), JWT_SECRET
# Optional: NODE_ENV (default development)

if (-not $env:NODE_ENV) { $env:NODE_ENV = "development" }

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
    Write-Host "Set them in your shell or a local .env file before running npm run dev." -ForegroundColor Yellow
    exit 1
}

Write-Host "Environment OK. You can now run: npm run dev" -ForegroundColor Green
