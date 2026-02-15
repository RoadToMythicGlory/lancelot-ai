@echo off

echo Setting up environment variables for Lancelot API Gateway...

:: MongoDB Configuration - actual container password
set MONGO_PASSWORD=ShaySt@r!s@S3cUr1T1K1Ng!1
set NODE_ENV=development

:: PostgreSQL Configuration - matches docker-compose.yml defaults
set POSTGRES_PASSWORD=ShaySt@r!s@S3cUr1T1K1Ng!1
set DB_PASSWORD=ShaySt@r!s@S3cUr1T1K1Ng!1

:: JWT Configuration
set JWT_SECRET=YourSecretKeyHere_PleaseChangeInProduction_MinLength32

echo.
echo Environment variables set!
echo MongoDB Password: %MONGO_PASSWORD%
echo PostgreSQL Password: %POSTGRES_PASSWORD%
echo.
echo Starting API Gateway...
echo.

npm run dev 