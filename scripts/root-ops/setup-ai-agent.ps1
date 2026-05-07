# Setup AI Agent Script
# This script installs dependencies and creates the AI user

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Lancelot AI Agent Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path ".\services\ai-agent\package.json")) {
    Write-Host "Error: Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

# Step 1: Install AI Agent dependencies
Write-Host "Step 1: Installing AI Agent dependencies..." -ForegroundColor Yellow
Set-Location ".\services\ai-agent"

if (Test-Path "node_modules") {
    Write-Host "  Dependencies already installed, checking for updates..." -ForegroundColor Gray
    npm install
} else {
    Write-Host "  Installing dependencies..." -ForegroundColor Gray
    npm install
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to install dependencies" -ForegroundColor Red
    Set-Location "..\..\"
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green
Write-Host ""

# Step 2: Seed AI User
Write-Host "Step 2: Creating AI User in MongoDB..." -ForegroundColor Yellow
Write-Host "  Make sure MongoDB is running!" -ForegroundColor Gray

# Check if .env exists, if not create from example
if (-not (Test-Path ".env")) {
    Write-Host "  Creating .env file..." -ForegroundColor Gray
    @"
# AI Agent Configuration
AI_AGENT_PORT=4001
NODE_ENV=development

# LLM Configuration (Ollama)
OLLAMA_BASE_URL=http://localhost:11434
LLM_PRIMARY_MODEL=llama3.1:8b-instruct-q4_K_M
LLM_HEBREW_MODEL=qwen2.5:7b

# MongoDB (same as main app)
MONGODB_URL=mongodb://localhost:27017/broadcast
MONGO_DATABASE=broadcast
"@ | Out-File -FilePath ".env" -Encoding utf8
    Write-Host "  Created .env file - please update MongoDB URL if needed" -ForegroundColor Yellow
}

npm run seed:ai-user

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: AI User seeding may have failed. Check MongoDB connection." -ForegroundColor Yellow
} else {
    Write-Host "  AI User created successfully!" -ForegroundColor Green
}
Write-Host ""

Set-Location "..\..\"

# Step 3: Provide instructions
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Make sure Ollama is running with a model:" -ForegroundColor White
Write-Host "   ollama run llama3.1:8b-instruct-q4_K_M" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Start the AI Agent service:" -ForegroundColor White
Write-Host "   cd services\ai-agent" -ForegroundColor Gray
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Start the main application (in another terminal):" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Open the app and look for 'Lancelot AI' in the chat contacts!" -ForegroundColor Green
Write-Host ""
