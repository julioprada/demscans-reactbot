@echo off
setlocal

REM Change working directory to the script location
cd /d %~dp0

REM Ensure Node and dependencies
where node >nul 2>nul || (
  echo Node.js is required. Please install from https://nodejs.org/
  pause
  exit /b 1
)

REM Install dependencies if node_modules missing
if not exist node_modules (
  echo Installing dependencies...
  npm ci || npm install
)

REM Run the bot via tsx
npm run start

echo.
echo Bot finished. Press any key to exit.
pause >nul
