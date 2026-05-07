Write-Host "🌱 Seeding users into local MongoDB..." -ForegroundColor Green

# Navigate to API gateway directory
cd services/api-gateway

# Run the seed script
npm run seed:users

Write-Host "✅ User seeding complete!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now login with:" -ForegroundColor Yellow
Write-Host "  - admin@example.com / 123456 (admin)" -ForegroundColor Cyan
Write-Host "  - admin@example.com / 123456 (user)" -ForegroundColor Cyan
Write-Host "  - operator@example.com / 123456 (user)" -ForegroundColor Cyan 