@echo off
title Poachers Battlefield v3
cd /d "%~dp0"
echo ===================================================
echo     POACHERS BATTLEFIELD v3 - LAUNCHER
echo ===================================================
echo.
echo Starting game server and web client...
echo Browser will open automatically at http://localhost:3000
echo.
call npm.cmd run dev
pause
