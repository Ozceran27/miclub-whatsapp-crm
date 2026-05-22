@echo off
setlocal
cd /d "%~dp0.."

call npm run start:prod
if errorlevel 1 (
  echo [miClub CRM] Startup failed.
  exit /b 1
)

start "" "http://localhost:4000"
