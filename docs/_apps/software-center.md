---
title: "Software Center"
package: software-center
category: core-desktop
icon: software-center.svg
summary: "Install and manage coding-agent CLIs, IDEs, browsers, game tools and utilities on Windows or Linux."
description: "Native Windows installers through WinGet and a private npm prefix, with progress logs, updates and installation checks. Debian and Ubuntu use their Linux installers."
---

Software Center installs tools from its built-in catalog. Open it from the RobOS launcher, choose a category, and click **Install**. Progress and errors appear in the log panel. **Refresh** checks the current installation state.

## Windows

Install the [Windows app suite](https://rowbose.com/download/#windows) first. Software Center uses Windows Package Manager (WinGet) for desktop tools and utilities, and RobOS's private Node.js runtime for Claude Code, Codex, Gemini CLI and GitHub Copilot CLI. No Bash, apt or sudo is used for Windows installations.

The catalog includes IDEs, browsers, GitHub CLI, Docker Desktop, Lazygit, Flameshot, VLC, command-line utilities, **Godot 4**, **FFmpeg**, **OBS Studio** and **Process Explorer**. Kazam and htop are Linux-only and show the available Windows alternatives.

- **Install, Update and Uninstall:** actions stream their output and verify the resulting installed state. Coding-agent installs also check that the CLI starts.
- **Folders:** RobOS apps default to `%USERPROFILE%\RobOS\packages`. Agent CLI packages use the installation's `tools\npm` folder and command shortcuts use `tools\bin`. WinGet tools use their Windows installation locations. Custom RobOS folders use the same relative structure.
- **Commands:** setup adds the private CLI/runtime directories to your user PATH. Open a new terminal after installing a tool. RobOS refreshes Windows PATH when starting an app.
- **Existing software:** vendor-installed copies detected outside WinGet have a **Windows settings** button, rather than an uninstall action that assumes WinGet owns them.
- **Requirements:** internet access and Microsoft's App Installer (WinGet). If WinGet is missing or fails, the cards explain the problem; install or update App Installer and click **Refresh**. Some tools require administrator approval, virtualization support or a restart. Software Center reports cancellations and failures.

Installing a coding agent does not sign you in or enable optional AI features. Start the installed agent and complete its sign-in when you want to use it.

## Debian and Ubuntu

Linux entries use their existing Bash installers: apt, npm, vendor downloads or Snap depending on the tool. Administrative operations use sudo, with a Zenity password dialog when passwordless sudo is unavailable. Some entries configure desktop integration afterward. Docker's Linux script targets the RobOS VM account.

## Catalog and verification

The Linux catalog is in `packages/software-center/main.js`; Windows package IDs and providers are in `packages/software-center/windows-tools.js`. Run `node scripts/windows/audit-software-center.cjs` on Windows to check current WinGet and npm catalog availability without installing anything.
