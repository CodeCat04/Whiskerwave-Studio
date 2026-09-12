@echo off
setlocal
cd /d "%~dp0"
title Whiskerwave Studio Model Manager
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" -ModelsOnly
if errorlevel 1 echo Model setup stopped with an error.
echo.
pause

