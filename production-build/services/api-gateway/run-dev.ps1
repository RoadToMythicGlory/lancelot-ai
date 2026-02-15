# Lancelot API Gateway Development Runner
Write-Host "🚀 Starting Lancelot API Gateway..." -ForegroundColor Cyan

# Set environment variables
$env:MONGO_PASSWORD = "<MONGO_PASSWORD>"
$env:MONGO_USERNAME = "LancelotERP_DB"
$env:NODE_ENV = "development"
$env:JWT_SECRET = "YourSecretKeyHere_PleaseChangeInProduction_MinLength32"

Write-Host "✅ Environment variables set" -ForegroundColor Green
Write-Host "   MongoDB Username: $env:MONGO_USERNAME" -ForegroundColor Yellow
Write-Host "   MongoDB Password: $env:MONGO_PASSWORD" -ForegroundColor Yellow
Write-Host ""

# Run the development server
npm run dev 