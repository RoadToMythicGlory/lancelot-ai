#!/bin/bash

# Lancelot Platform - Start Everything Script
# This script will set up and run the entire platform

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print colored output
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# ASCII Art Banner
echo -e "${BLUE}"
cat << "EOF"
 _                           _       _   
| |    __ _ _ __   ___ ___| | ___ | |_ 
| |   / _` | '_ \ / __/ _ \ |/ _ \| __|
| |__| (_| | | | | (_|  __/ | (_) | |_ 
|_____\__,_|_| |_|\___\___|_|\___/ \__|
                                        
       Channel1 Operations Platform
EOF
echo -e "${NC}"

# Check prerequisites
print_step "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed!"
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed!"
    echo "Please install Node.js 18+ from: https://nodejs.org/"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed!"
    exit 1
fi

print_success "Prerequisites checked"

# Require a populated .env file. We do NOT auto-generate one with credentials —
# copy services/api-gateway/.env.example to .env and fill it in locally.
if [ ! -f .env ]; then
    print_error "No .env file found in the repository root."
    echo "Copy services/api-gateway/.env.example to .env and supply MongoDB /"
    echo "JWT credentials before running this script."
    exit 1
fi
print_success ".env file detected"

# Install dependencies
print_step "Installing dependencies..."
npm install --silent
print_success "Dependencies installed"

# Start Docker services
print_step "Starting Docker services..."
docker-compose down &> /dev/null || true
docker-compose up -d

# Wait for services to be ready
print_step "Waiting for services to be ready..."

echo -n "MongoDB"
until docker-compose exec -T mongodb mongosh --eval "db.adminCommand('ping')" &> /dev/null; do
    echo -n "."
    sleep 2
done
print_success "MongoDB is ready"

# Initialize databases
print_step "Initializing databases..."
# MongoDB is initialized automatically
print_success "Databases initialized"

# Build TypeScript services
print_step "Building services..."
npm run build --workspace=services/routing-engine --silent || true
npm run build --workspace=services/excel-parser --silent || true
print_success "Services built"

# Start all services
print_step "Starting all services..."

# Function to cleanup on exit
cleanup() {
    echo ""
    print_warning "Shutting down services..."
    kill $(jobs -p) 2>/dev/null
    docker-compose down
    print_success "Services stopped"
}

trap cleanup EXIT

# Start services in background
print_step "Starting API Gateway..."
(cd services/api-gateway && npm run start:dev 2>&1 | sed 's/^/[API] /' ) &

print_step "Starting Routing Engine..."
(cd services/routing-engine && npm run start:dev 2>&1 | sed 's/^/[ROUTING] /' ) &

print_step "Starting Excel Parser..."
(cd services/excel-parser && npm run start:dev 2>&1 | sed 's/^/[EXCEL] /' ) &

# Wait a bit for backend services to start
sleep 5

print_step "Starting Web Application..."
(cd apps/web && npm run dev 2>&1 | sed 's/^/[WEB] /' ) &

# Wait for services to be ready
sleep 10

# Print success message
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Lancelot Platform is running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📱 Web Application:    http://localhost:3000"
echo "📊 GraphQL Playground: http://localhost:4000/graphql"
echo "🗄️  MinIO Console:     http://localhost:9001 (credentials in your .env)"
echo "🔐 Keycloak Admin:     http://localhost:8080 (credentials in your .env)"
echo ""
echo "🧪 Test credentials are NOT shipped with the repo — see your local .env"
echo "   or talk to a teammate for a developer login."
echo ""
echo "💡 Tips:"
echo "   - Press Cmd+K to open command palette"
echo "   - Click the microphone button for voice commands"
echo "   - Try dragging sources in the MCR page"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running
while true; do
    sleep 1
done 