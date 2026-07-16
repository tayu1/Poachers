@echo off
title Poachers Game Sharing Portal
cls
echo ===================================================================
echo               POACHERS - GAME SHARING PORTAL
echo ===================================================================
echo.
echo  This script will open a secure portal (tunnel) to your local game 
echo  server so you can play with a friend anywhere in the world!
echo.
echo ===================================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js first from: https://nodejs.org/
    echo.
    pause
    exit /b
)

:: Check if SSH is installed
where ssh >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] SSH client is not installed or not in PATH!
    echo Windows 10/11 usually has OpenSSH built-in.
    echo Please enable OpenSSH Client in Windows Optional Features.
    echo.
    pause
    exit /b
)

:: Check if game server is already running on port 8080
netstat -ano | findstr :8080 >nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Game server is already running on port 8080.
) else (
    echo [INFO] Starting the game server in a separate window...
    start "Poachers Game Server" cmd /k "node \"%~dp0server.js\""
    :: Give the server 2 seconds to boot
    timeout /t 2 >nul
)

echo.
echo  Connecting to secure tunnel service (localhost.run)...
echo  ==============================================================
echo  INSTRUCTIONS:
echo  1. Look for the line starting with "https://..." in the output.
echo  2. Copy that link and send it to your friend!
echo  3. Keep this window OPEN while playing.
echo  4. To stop sharing, close this window or press Ctrl+C.
echo  ==============================================================
echo.

ssh -o StrictHostKeyChecking=no -R 80:localhost:8080 nokey@localhost.run

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] Tunnel connection closed or failed to start.
    echo If you encountered an error, you can also try using localtunnel.
    echo Would you like to try starting the tunnel using localtunnel? (Y/N)
    set /p choice=Choice: 
    if /i "%choice%"=="Y" (
        echo.
        echo Starting tunnel using localtunnel...
        cmd /c "npx localtunnel --port 8080"
    )
)

pause
