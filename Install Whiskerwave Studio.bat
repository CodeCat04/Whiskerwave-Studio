@echo off
setlocal
cd /d "%~dp0"
title Install Whiskerwave Studio
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
if errorlevel 1 (
  echo.
  echo Installation stopped with an error.
)
echo.
pause

