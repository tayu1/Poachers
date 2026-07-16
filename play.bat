@echo off
title Poachers Game Server
echo.
echo ===================================================
echo   Starting Poachers Game Server...
echo ===================================================
echo.
node "%~dp0server.js"
if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: Failed to start the server. 
  echo Make sure Node.js is installed on your computer.
  echo You can download it from: https://nodejs.org/
  echo.
  pause
)
