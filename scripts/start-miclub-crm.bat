@echo off
setlocal
title miClub WhatsApp CRM

cd /d "%~dp0.."

echo ==========================================
echo      Iniciando miClub WhatsApp CRM
echo ==========================================

start "" cmd /k "npm run start:prod"

timeout /t 8 >nul

start "" "http://localhost:4000"

exit /b 0