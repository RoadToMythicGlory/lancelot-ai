@echo off

REM Helper that starts the Lancelot API Gateway in development mode.
REM
REM Credentials must come from your shell or a local `.env` file (loaded by
REM dotenv at runtime). This script intentionally does NOT define defaults so
REM secrets are never committed to git. See services/api-gateway/.env.example.

if "%NODE_ENV%"=="" set NODE_ENV=development

if "%MONGO_PASSWORD%"=="" if "%MONGODB_URL%"=="" (
    echo [ERROR] Set MONGO_PASSWORD ^(and MONGO_USERNAME^) or MONGODB_URL before running.
    exit /b 1
)

if "%JWT_SECRET%"=="" if not "%NODE_ENV%"=="development" (
    echo [ERROR] JWT_SECRET must be set in non-development environments.
    exit /b 1
)

echo Starting API Gateway...
npm run dev
