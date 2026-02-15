# Lancelot Platform Development Startup Script
# This script starts all necessary services for development

param(
    [switch]$SkipDeps,
    [switch]$Verbose
)

# Colors for output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"

function Write-ColoredOutput {
    param($Message, $Color)
    Write-Host $Message -ForegroundColor $Color
}

function Test-Port {
    param($Port)
    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $Port -InformationLevel Quiet
        return $connection
    }
    catch {
        return $false
    }
}

Write-ColoredOutput "🚀 Starting Lancelot Platform Development Environment" $Green
Write-ColoredOutput "=================================================" $Green

# Check if required tools are installed
$requiredTools = @{
    "node" = "Node.js"
    "npm" = "NPM"
    "docker" = "Docker"
}

Write-ColoredOutput "🔍 Checking required tools..." $Yellow
foreach ($tool in $requiredTools.Keys) {
    try {
        $version = Invoke-Expression "$tool --version" 2>$null
        if ($version) {
            Write-ColoredOutput "✅ $($requiredTools[$tool]): $version" $Green
        } else {
            Write-ColoredOutput "❌ $($requiredTools[$tool]) not found" $Red
            exit 1
        }
    }
    catch {
        Write-ColoredOutput "❌ $($requiredTools[$tool]) not found" $Red
        exit 1
    }
}

# Install dependencies if not skipped
if (-not $SkipDeps) {
    Write-ColoredOutput "📦 Installing dependencies..." $Yellow
    
    # Root dependencies
    Write-ColoredOutput "Installing root dependencies..." $Cyan
    npm install
    
    # Web app dependencies
    Write-ColoredOutput "Installing web app dependencies..." $Cyan
    Set-Location "apps\web"
    npm install
    Set-Location "..\.."
    
    # API Gateway dependencies
    Write-ColoredOutput "Installing API Gateway dependencies..." $Cyan
    Set-Location "services\api-gateway"
    npm install
    Set-Location "..\.."

    # AI Agent dependencies
    Write-ColoredOutput "Installing AI Agent dependencies..." $Cyan
    Set-Location "services\ai-agent"
    npm install
    Set-Location "..\.."
    
    Write-ColoredOutput "✅ Dependencies installed successfully" $Green
}

# Check if ports are available
$ports = @{
    3000 = "Next.js Web App"
    4000 = "API Gateway"
    4001 = "AI Agent"
    5432 = "PostgreSQL"
    27017 = "MongoDB"
    6379 = "Redis"
}

Write-ColoredOutput "🔍 Checking port availability..." $Yellow
foreach ($port in $ports.Keys) {
    if (Test-Port $port) {
        Write-ColoredOutput "⚠️  Port $port is already in use (${$ports[$port]})" $Yellow
    } else {
        Write-ColoredOutput "✅ Port $port is available" $Green
    }
}

# Start Docker services
Write-ColoredOutput "🐳 Starting Docker services..." $Yellow
try {
    docker-compose up -d
    Write-ColoredOutput "✅ Docker services started" $Green
    Start-Sleep -Seconds 5  # Wait for services to be ready
}
catch {
    Write-ColoredOutput "❌ Failed to start Docker services: $($_.Exception.Message)" $Red
    exit 1
}

# Start development servers in separate PowerShell windows
Write-ColoredOutput "🚀 Starting development servers..." $Yellow

# Start Web App
Write-ColoredOutput "Starting Next.js Web App on port 3000..." $Cyan
$webProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\apps\web'; `$env:NEXT_PUBLIC_ENABLE_E2EE_CHAT='true'; `$env:NEXT_PUBLIC_E2EE_FALLBACK_WARNING='true'; npm run dev" -PassThru

# Start API Gateway
Write-ColoredOutput "Starting API Gateway on port 4000..." $Cyan
$apiProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\services\api-gateway'; `$env:ENABLE_E2EE_CHAT='true'; `$env:E2EE_FALLBACK_WARNING='true'; npm run dev" -PassThru

# Start AI Agent
Write-ColoredOutput "Starting AI Agent on port 4001..." $Cyan
$aiProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\services\ai-agent'; `$env:ENABLE_E2EE_CHAT='true'; `$env:E2EE_FALLBACK_WARNING='true'; npm run dev" -PassThru

# Wait a moment for services to start
Start-Sleep -Seconds 3

Write-ColoredOutput "🎉 Lancelot Platform is starting up!" $Green
Write-ColoredOutput "=================================================" $Green
Write-ColoredOutput "📱 Web App:      http://localhost:3000" $Cyan
Write-ColoredOutput "🔌 API Gateway:  http://localhost:4000/graphql" $Yellow
Write-ColoredOutput "🤖 AI Agent:     http://localhost:4001/health" $Magenta
Write-ColoredOutput "🏥 Health Check: http://localhost:4000/health" $Yellow
Write-ColoredOutput "📊 GraphQL:      http://localhost:4000/graphql" $Yellow
Write-ColoredOutput "=================================================" $Green
Write-ColoredOutput ""
Write-ColoredOutput "💡 Tips:" $Yellow
Write-ColoredOutput "   • Press Ctrl+C in any window to stop that service" $Yellow
Write-ColoredOutput "   • Use 'docker-compose logs' to view database logs" $Yellow
Write-ColoredOutput "   • Use 'docker-compose down' to stop databases" $Yellow
Write-ColoredOutput ""
Write-ColoredOutput "🔧 Debugging:" $Yellow
Write-ColoredOutput "   • Check Docker: docker-compose ps" $Yellow
Write-ColoredOutput "   • View logs:    docker-compose logs -f" $Yellow
Write-ColoredOutput "   • Reset DB:     docker-compose down -v && docker-compose up -d" $Yellow

if ($Verbose) {
    Write-ColoredOutput "📝 Process Information:" $Yellow
    Write-ColoredOutput "   Web App Process ID: $($webProcess.Id)" $Cyan
    Write-ColoredOutput "   API Process ID: $($apiProcess.Id)" $Cyan
    Write-ColoredOutput "   AI Agent Process ID: $($aiProcess.Id)" $Magenta
}

Write-ColoredOutput ""
Write-ColoredOutput "Press any key to stop all services..." $Red
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Cleanup
Write-ColoredOutput "🛑 Stopping services..." $Yellow
try {
    if ($webProcess -and -not $webProcess.HasExited) {
        Stop-Process -Id $webProcess.Id -Force
        Write-ColoredOutput "✅ Stopped Web App" $Green
    }
    if ($apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id -Force
        Write-ColoredOutput "✅ Stopped API Gateway" $Green
    }
    if ($aiProcess -and -not $aiProcess.HasExited) {
        Stop-Process -Id $aiProcess.Id -Force
        Write-ColoredOutput "✅ Stopped AI Agent" $Green
    }
    
    docker-compose down
    Write-ColoredOutput "✅ Stopped Docker services" $Green
}
catch {
    Write-ColoredOutput "⚠️  Some services may still be running" $Yellow
}

Write-ColoredOutput "👋 Lancelot Platform stopped" $Green 