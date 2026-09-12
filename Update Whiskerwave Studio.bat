@echo off
setlocal
cd /d "%~dp0"
title Update Whiskerwave Studio
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1"
if errorlevel 1 echo Update stopped with an error.
echo.
pause

