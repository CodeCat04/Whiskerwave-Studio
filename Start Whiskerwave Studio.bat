@echo off
setlocal
cd /d "%~dp0"
title Whiskerwave Studio

if not exist "audio.cpp\build\windows-cuda-release\bin\audiocpp_server.exe" goto not_installed
if not exist "audio.cpp\models\Yue2-3B-GGUF\yue2-3b-q8_0.gguf" if not exist "audio.cpp\models\Yue2-3B-GGUF\yue2-3b-q4_0.gguf" if not exist "audio.cpp\models\Yue2-3B-GGUF\yue2-3b-bf16.gguf" goto not_installed

where py >nul 2>nul
if not errorlevel 1 (
  py -3.11 "studio\server.py"
) else (
  python "studio\server.py"
)
if errorlevel 1 (
  echo.
  echo Whiskerwave Studio stopped with an error.
  pause
)
exit /b

:not_installed
echo Whiskerwave Studio is not installed yet.
echo Double-click "Install Whiskerwave Studio.bat" first.
echo.
pause
exit /b 1

