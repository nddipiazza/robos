---
title: "Software Center"
package: software-center
category: core-desktop
icon: software-center.svg
summary: "Install and uninstall a fixed list of developer tools (AI CLIs, IDEs, browsers, CLI utilities) on a Debian or Ubuntu machine."
description: "A catalog of about thirty tools, each with a check command and an install script. Installs run through bash with sudo, and the output appears in an install log."
---

Software Center is a tool installer. It checks whether each tool in its built-in list is present, and runs a shell script to install or remove it. It does not manage language runtimes, compilers or cloud SDKs; those are not in the list.

## What is in the catalog

The list is defined in `packages/software-center/main.js`. Categories shown as filter buttons:

| Category | Tools |
|---|---|
| AI | Claude CLI, GitHub Copilot CLI, OpenAI Codex CLI, HarnessRouter CE |
| IDE | VS Code, IntelliJ IDEA Community, PyCharm Community, WebStorm, GoLand, CLion, Rider, RustRover |
| Browser | Firefox, Chromium, Google Chrome |
| Dev | GitHub CLI, GitHub Copilot CLI (gh extension), Docker, Lazygit |
| Media | Flameshot, Kazam, VLC |
| CLI | ripgrep, fd, bat, jq, fzf, htop, SQLite3 |

## Use it

1. Open **RobOS Software Center**. Each card shows the tool, its category and **Installed** or **Not installed**, which comes from running that tool's check command (for example `which code`).
2. Click **Install** or **Uninstall**. An install log panel opens and streams the script output. Close it with the X.
3. Choose a category button to narrow the list.

## What an install does

Each install runs a `bash -c` script with `DEBIAN_FRONTEND=noninteractive`. Typical scripts use `apt-get`, `npm install -g`, or download a `.deb` or tarball from the vendor (for example `dl.google.com` for Chrome or `download-cdn.jetbrains.com` for IntelliJ). Read the script in `main.js` before installing anything you are unsure about.

- **Administrator rights.** `sudo` is run with `-A`. It first tries passwordless sudo (`sudo -n`, which the RobOS VM allows) and otherwise shows a `zenity` password dialog. The password is not written to disk.
- **Requirements.** Network access, `apt`/`dpkg` on the host, and `zenity` for the password dialog. Docker's script adds the user `robos` to the `docker` group, so it is written for the RobOS VM account.
- Some entries run extra steps afterwards. For example Flameshot is also added to `~/.config/autostart`.

## Run it

Launch **RobOS Software Center** from the app launcher. The [RobOS Setup Wizard]({{ '/apps/robos-onboarding/' | relative_url }}) has its own smaller copy of this installer for a few tools.
