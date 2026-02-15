@echo off
REM Batch script to prepare Lancelot app for production deployment on Windows

echo.
echo ===================================================
echo   Preparing Lancelot for Production Deployment
echo ===================================================
echo.

REM Run the PowerShell script with appropriate execution policy
powershell -ExecutionPolicy Bypass -File prepare-production-deployment.ps1

pause
