@echo off
setlocal
cd /d "%~dp0.."

echo [miClub CRM] Building production bundles...
call npm run build
if errorlevel 1 (
  echo [miClub CRM] Build failed.
  exit /b 1
)

echo [miClub CRM] Build complete.
exit /b 0
