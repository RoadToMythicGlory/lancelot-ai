#!/usr/bin/env pwsh

Write-Host "🌱 Seeding department users..." -ForegroundColor Green

# Navigate to the API gateway directory
Push-Location services/api-gateway

try {
    # Check if node_modules exists
    if (-not (Test-Path "node_modules")) {
        Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
        npm install
    }

    # Run the seed script
    Write-Host "👤 Creating users for all departments..." -ForegroundColor Cyan
    npm run seed:department-users

    Write-Host "✅ Department users seeded successfully!" -ForegroundColor Green
    Write-Host "📄 Check DEPARTMENT_USER_CREDENTIALS.txt for login details" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Error seeding department users: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}


