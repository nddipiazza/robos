@echo off
title RobOS Windows Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { $setup = Join-Path $env:TEMP ('Install-RobOS-' + [guid]::NewGuid() + '.ps1'); Invoke-WebRequest 'https://rowbose.com/downloads/Install-RobOS.ps1' -UseBasicParsing -OutFile $setup; & $setup; exit 0 } catch { Write-Host $_ -ForegroundColor Red; exit 1 }"
if errorlevel 1 (
  echo RobOS setup did not finish. Review the error above.
  pause
  exit /b 1
)
