# Clean Next.js and Node cache before starting
Write-Host "Cleaning cache folders..." -ForegroundColor Yellow

# Remove .next folder if exists
if (Test-Path .next) {
    Write-Host "Removing .next folder..." -ForegroundColor Cyan
    Remove-Item -Recurse -Force .next
}

# Remove node_modules/.cache if exists
if (Test-Path "node_modules/.cache") {
    Write-Host "Removing node_modules/.cache folder..." -ForegroundColor Cyan
    Remove-Item -Recurse -Force "node_modules/.cache"
}

# Clear npm cache
Write-Host "Clearing npm cache..." -ForegroundColor Cyan
npm cache clean --force

Write-Host "Starting development server with optimized memory settings..." -ForegroundColor Green

# Start with lower memory limit and let it grow as needed
$env:NODE_OPTIONS = "--max-old-space-size=8192"

# Run the dev server
npm run dev 