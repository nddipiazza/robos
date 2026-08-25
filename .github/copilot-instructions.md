# GitHub Copilot Custom Instructions for RobOS

This file provides guidance to GitHub Copilot when working with code in this repository.

# RobOS — AI-First Software Development Operating System

RobOS is a developer-first operating system and IDE ecosystem that automates the entire Software Delivery Lifecycle (SDLC) using AI.

## Major Architecture & Conventions

- **OS Base**: Ubuntu 24.04 LTS + GNOME desktop environment running inside QEMU/KVM.
- **Desktop Apps**: 30+ Electron apps written in vanilla JavaScript (no React/Vue/Angular).
- **IPC Standard**: All Electron main/renderer process communication must use `contextBridge` in `preload.js` and `ipcRenderer.invoke()` / `ipcMain.handle()`. Never set `nodeIntegration: true`.
- **Styling**: Vanilla CSS using RobOS dark theme palette:
  - `--bg-primary: #0d1117`
  - `--bg-card: #161b22`
  - `--accent: #00bcd4` (cyan)
- **Icons**: 48x48 SVG files, Lucide stroke style (`stroke="#00bcd4"`, `stroke-width="1.5"`).
- **Shared Libraries**: Deployed at `/usr/local/share/robos/` (`robos-lib`, `robos-icons`, `robos-ui`). Always wrap requiring these libraries in try/catch for local dev-harness compatibility.
- **Testing**: Tests located in `tests/` or executed via `packages/dev-harness/harness.js`.
- **VM Flags**: All Electron launchers MUST pass `--no-sandbox --disable-gpu --disable-dev-shm-usage`.

## Key Commands & Tools

- Dev Harness: `node packages/dev-harness/harness.js --app <app-id> --scenario <scenario>`
- VM Build: `infra/desktop/build.sh`
- VM Run: `infra/desktop/run.sh [--firstboot]`
- Deploy app to VM: `scp -P 2224 -r packages/<app>/* robos@localhost:/tmp/<app>/ && ssh -p 2224 robos@localhost "sudo rm -rf /usr/local/share/robos/<app> && sudo cp -r /tmp/<app> /usr/local/share/robos/<app> && sudo chmod -R a+rX /usr/local/share/robos/<app>"`
- DOM Snapshot Debugging: `node packages/robos-lib/snapshot-cli.js <app-id> [--text|--json|--screenshot]`
