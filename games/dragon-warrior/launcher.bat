@echo off
rem launcher.bat — open the Dragon Warrior debug launcher GUI on Windows
setlocal enabledelayedexpansion

set "LAUNCHER_DIR=%~dp0tools\debug-launcher"
set "ELECTRON_LOCAL=%LAUNCHER_DIR%\node_modules\.bin\electron.cmd"

if exist "%ELECTRON_LOCAL%" (
    start "" "%ELECTRON_LOCAL%" "%LAUNCHER_DIR%"
) else (
    where electron >nul 2>&1
    if !errorlevel! equ 0 (
        start "" electron "%LAUNCHER_DIR%"
    ) else (
        where npx >nul 2>&1
        if !errorlevel! equ 0 (
            start "" npx electron "%LAUNCHER_DIR%"
        ) else (
            echo Electron GUI environment not found. Launching game directly...
            call "%~dp0play.bat"
        )
    )
)
