@echo off
setlocal
cd /d "%~dp0.."

start "" "http://localhost:4000"
call npm run start
