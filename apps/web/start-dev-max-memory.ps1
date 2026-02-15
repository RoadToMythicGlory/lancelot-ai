# Start development server with increased memory allocation
Write-Host "Starting Next.js dev server with 16GB memory allocation..." -ForegroundColor Green

# Set Node options
$env:NODE_OPTIONS="--max-old-space-size=16384"

# Start the development server directly with npx to bypass npm script
npx next dev 