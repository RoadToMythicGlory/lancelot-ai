@echo off
echo Cleaning cache folders...

REM Remove .next folder if exists
if exist .next (
    echo Removing .next folder...
    rd /s /q .next
)

REM Remove node_modules/.cache if exists
if exist node_modules\.cache (
    echo Removing node_modules/.cache folder...
    rd /s /q node_modules\.cache
)

echo.
echo Starting development server with optimized memory settings...
echo.

REM Set optimized Node options
set NODE_OPTIONS=--max-old-space-size=4096 --optimize-for-size

REM Run with cross-env for better compatibility
npx cross-env NODE_ENV=development next dev 