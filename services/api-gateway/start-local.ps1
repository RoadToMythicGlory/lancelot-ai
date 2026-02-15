# Start API Gateway locally with Docker databases
$env:MONGODB_URL="mongodb://LancelotERP_DB:<MONGO_PASSWORD>@localhost:27017/lancelot?authSource=admin"
$env:MONGO_PASSWORD="<MONGO_PASSWORD>"
$env:MONGO_USERNAME="LancelotERP_DB"
$env:JWT_SECRET="your-jwt-secret-here"
$env:NODE_ENV="development"
$env:PORT="4001"

Write-Host "Starting API Gateway with Docker databases..." -ForegroundColor Green
Write-Host "MongoDB: localhost:27017" -ForegroundColor Cyan
Write-Host "API Gateway: localhost:4001" -ForegroundColor Yellow

npm run dev 