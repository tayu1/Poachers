@echo off
title Poachers Test Suite
cd /d "%~dp0"
echo ===================================================
echo     POACHERS v3 - TEST SUITE
echo ===================================================
echo.
call npm.cmd test
echo.
pause
