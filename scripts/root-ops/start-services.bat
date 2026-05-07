@echo off
echo Starting Lancelot Platform Services...
echo.

REM Start API Gateway in background
echo [1/3] Starting API Gateway...
cd /d "C:\Users\idanm\OneDrive\Desktop\Lancelot\services\api-gateway"
start "API Gateway" cmd /c "npm start & pause"

REM Wait a moment
timeout /t 3 /nobreak > nul

REM Start Web App in background  
echo [2/3] Starting Web Application...
cd /d "C:\Users\idanm\OneDrive\Desktop\Lancelot\apps\web"
start "Web App" cmd /c "npm run dev & pause"

REM Wait a moment
timeout /t 3 /nobreak > nul

REM Start Routing Engine (optional)
echo [3/3] Starting Routing Engine...
cd /d "C:\Users\idanm\OneDrive\Desktop\Lancelot\services\routing-engine"
start "Routing Engine" cmd /c "npm start & pause"

echo.
echo ✅ All services starting...
echo ✅ Web App: http://localhost:3000
echo ✅ API Gateway: http://localhost:4000
echo ✅ Check the separate windows for each service
echo.
pause 