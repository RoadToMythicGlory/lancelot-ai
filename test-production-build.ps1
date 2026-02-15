# PowerShell script to test if production build was created successfully

Write-Host "`n🔍 Testing Production Build" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan

# Check if production-build directory exists
if (Test-Path ".\production-build") {
    Write-Host "✅ Production build directory exists" -ForegroundColor Green
    
    # Check for important files
    $requiredFiles = @(
        "production-build\docker-compose.yml",
        "production-build\docker-compose.production.yml",
        "production-build\Dockerfile",
        "production-build\Dockerfile.production",
        "production-build\production.env",
        "production-build\deploy.sh",
        "production-build\DEPLOYMENT_README.md",
        "production-build\apps\web\.env.production",
        "production-build\services\api-gateway\.env"
    )
    
    $allFilesExist = $true
    foreach ($file in $requiredFiles) {
        if (Test-Path $file) {
            Write-Host "  ✓ $file" -ForegroundColor Gray
        } else {
            Write-Host "  ✗ $file MISSING!" -ForegroundColor Red
            $allFilesExist = $false
        }
    }
    
    if ($allFilesExist) {
        Write-Host "`n✅ All required files are present" -ForegroundColor Green
        
        # Check if localhost:4000 is replaced in key files
        Write-Host "`n🔍 Checking URL replacements..." -ForegroundColor Yellow
        
        $webEnvContent = Get-Content "production-build\apps\web\.env.production" -Raw
        if ($webEnvContent -match "api\.lanceloterp\.io" -and $webEnvContent -notmatch "localhost:4000") {
            Write-Host "  ✓ Web app environment configured correctly" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Web app environment has incorrect URLs!" -ForegroundColor Red
        }
        
        $dockerComposeContent = Get-Content "production-build\docker-compose.yml" -Raw
        if ($dockerComposeContent -match "api\.lanceloterp\.io") {
            Write-Host "  ✓ Docker Compose updated with production URLs" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Docker Compose still has localhost URLs!" -ForegroundColor Red
        }
        
        Write-Host "`n📦 Production build is ready for deployment!" -ForegroundColor Green
        Write-Host "`n📋 Next steps:" -ForegroundColor Yellow
        Write-Host "  1. Update MongoDB credentials in production-build\services\api-gateway\.env" -ForegroundColor White
        Write-Host "  2. Upload production-build directory to your VPS" -ForegroundColor White
        Write-Host "  3. Run the deploy.sh script on your VPS" -ForegroundColor White
        
    } else {
        Write-Host "`n❌ Some files are missing! Run prepare-production-deployment.ps1 first" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Production build directory not found!" -ForegroundColor Red
    Write-Host "   Run .\prepare-production-deployment.ps1 to create it" -ForegroundColor Yellow
}
