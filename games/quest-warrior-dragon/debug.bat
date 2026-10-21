@echo off
rem debug.bat — launch Quest: Warrior Dragon into any scene with a preset hero state on Windows
setlocal enabledelayedexpansion

set "GODOT=%DW_GODOT_BIN%"

if "%GODOT%"=="" (
    where godot4.exe >nul 2>&1 && for /f "delims=" %%i in ('where godot4.exe') do set "GODOT=%%i"
)
if "%GODOT%"=="" (
    where godot4 >nul 2>&1 && for /f "delims=" %%i in ('where godot4') do set "GODOT=%%i"
)
if "%GODOT%"=="" (
    where godot.exe >nul 2>&1 && for /f "delims=" %%i in ('where godot.exe') do set "GODOT=%%i"
)
if "%GODOT%"=="" (
    if exist "%LOCALAPPDATA%\Programs\Godot\godot.exe" set "GODOT=%LOCALAPPDATA%\Programs\Godot\godot.exe"
)
if "%GODOT%"=="" (
    if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\godot.exe" set "GODOT=%LOCALAPPDATA%\Microsoft\WinGet\Links\godot.exe"
)
if "%GODOT%"=="" (
    if exist "%ProgramFiles%\Godot\godot.exe" set "GODOT=%ProgramFiles%\Godot\godot.exe"
)

if "%GODOT%"=="" (
    echo Godot binary not found. Set DW_GODOT_BIN or ensure godot4 is on PATH.
    exit /b 1
)

echo Launching debug mode...
start "" "%GODOT%" --path "%~dp0." res://scenes/DebugLaunch.tscn -- %*
