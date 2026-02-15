# Set environment variables for Lancelot API Gateway

# MongoDB Configuration - actual container password
# Updated password without special characters for local use
$env:MONGO_PASSWORD = "<MONGO_PASSWORD>"
$env:MONGO_USERNAME = "LancelotERP_DB"
$env:NODE_ENV = "development"

# Alternative: Use full connection string
# $env:MONGODB_URL = "mongodb://LancelotERP_DB:<MONGO_PASSWORD>@localhost:27017/lancelot?authSource=admin"

# JWT Configuration
$env:JWT_SECRET = "YourSecretKeyHere_PleaseChangeInProduction_MinLength32"

Write-Host "✅ Environment variables set!" -ForegroundColor Green
Write-Host ""
Write-Host "MongoDB Username: $env:MONGO_USERNAME" -ForegroundColor Yellow
Write-Host "MongoDB Password: $env:MONGO_PASSWORD" -ForegroundColor Yellow
Write-Host ""
Write-Host "Now you can run: npm run dev" -ForegroundColor Cyan 