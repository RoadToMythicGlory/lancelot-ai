Write-Host "Adding IT Department Admin user..." -ForegroundColor Green

# Navigate to api-gateway directory
cd services/api-gateway

# Run the script using ts-node
npx ts-node src/scripts/add-it-admin.ts

Write-Host "Done!" -ForegroundColor Green
Write-Host ""
Write-Host "IT Department Admin User Created:" -ForegroundColor Yellow
Write-Host "Email: itadmin@example.com" -ForegroundColor Cyan
Write-Host "Password: 123456" -ForegroundColor Cyan
Write-Host "Department: IT" -ForegroundColor Cyan
Write-Host "Role: DEPARTMENT_ADMIN" -ForegroundColor Cyan
Write-Host ""
Write-Host "This user can now log in and manage shift configurations for the IT department." -ForegroundColor Green 