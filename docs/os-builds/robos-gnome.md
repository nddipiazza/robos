---
layout: default
title: robos-gnome (Ubuntu Desktop)
parent: OS Builds
nav_order: 2
---

# robos-gnome — Ubuntu Desktop / xfwm4 Build

> Standard Ubuntu Desktop installation with the RobOS desktop shell applied on top via `install.sh`. GNOME packages remain but the default session is replaced with the RobOS xfwm4 + tint2 session.

---

## Overview

`robos-gnome` starts from a fully installed Ubuntu Desktop system (bare metal, existing VM, or WSL2 with a desktop). Running `packages/desktop-shell/install.sh` applies all RobOS customizations: replaces the default desktop session with xfwm4 + tint2, installs all Electron apps, and deploys CLI tooling.

**Good for:** bare-metal developer workstations, upgrading an existing Ubuntu machine to RobOS, environments where GNOME system tools are desirable alongside RobOS apps.

---

## Base Image

| Property | Value |
|----------|-------|
| Source | Any Ubuntu Desktop 22.04 or 24.04 LTS installation |
| Install method | Standard Ubuntu Desktop installer (ISO) or existing Ubuntu machine |
| Minimum RAM | 4 GB recommended |
| Default user | Existing user account (install.sh runs as that user with `sudo`) |

---

## How to Install

On a running Ubuntu Desktop machine:

```bash
git clone https://github.com/nddipiazza/roboto-os.git ~/source/github.com/nddipiazza/roboto-os
cd ~/source/github.com/nddipiazza/roboto-os
./packages/desktop-shell/install.sh
```

Log out and select **RobOS** at the LightDM session picker to start the RobOS session. GNOME sessions remain available as fallback.

---

## What Is Different from the Base Image

Everything below is a **RobOS-specific change** applied on top of a stock Ubuntu Desktop installation. The base Ubuntu Desktop is unchanged except where explicitly noted.

---

### Desktop Session Replacement: xfwm4 + tint2

**What changed:** A new `robos` X session is registered and set as the LightDM default. GNOME is **not** removed — it remains available as a fallback session.

**New session entry:** `/usr/share/xsessions/robos.desktop`

Points to `/usr/local/bin/robos-session`, which:
1. Sets environment variables (`XDG_CURRENT_DESKTOP=XFCE`, etc.)
2. Starts `xfwm4` (window manager)
3. Starts `tint2` (taskbar)
4. Runs the user autostart script

**LightDM default changed:**
```bash
sudo sed -i 's/user-session=.*/user-session=robos/' /etc/lightdm/lightdm.conf
```

The original `user-session` (typically `ubuntu` / GNOME) is overwritten. To revert, change `user-session=ubuntu` in `/etc/lightdm/lightdm.conf`.

---

### Window Manager: xfwm4 with RobOS Theme

**What changed:** xfwm4 is installed and a custom dark theme is built by recoloring the Kokodi theme using ImageMagick.

**Package installed:** `xfwm4 xfwm4-theme-breeze imagemagick`

**Theme name:** `RobOS` — installed to `/usr/share/themes/RobOS/xfwm4/`

**Colors applied via ImageMagick `convert`:**

| Element | Active color | Inactive color |
|---------|-------------|----------------|
| Title bar | `#262636` | `#1a1a26` |
| Window borders | `#2a2a3c` (80%) | `#1a1a26` (90%) |
| Close button (hover) | `#c0392b` | — |
| Maximize button (hover) | `#27ae60` | — |
| Minimize button (hover) | `#d4a017` | — |

**`themerc` settings:**
```ini
active_text_color=#d0d0e8
inactive_text_color=#383850
full_width_title=true
frame_border_top=0
show_app_icon=false
```

**xfwm4 user config** written to `~/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml`:
- Theme: `RobOS`
- Font: `Ubuntu Bold 11`
- Button layout: `NHM|C` (menu, shade, stick on left; close on right)
- Click-to-focus: `true`
- Compositing: `true`
- Snap to windows and borders: `true`

---

### tint2 Taskbar

**What changed:** tint2 is installed and configured with the RobOS taskbar layout, identical to the robosos build.

**Config file:** `~/.config/tint2/tint2rc` — copied from `packages/desktop-shell/tint2/tint2rc`.

**Launcher scripts installed to `/usr/local/share/robos/`:**
- `task-widget.sh` — Jira task quick-pick
- `agents-widget.sh` — Copilot agent session shortcut
- `robos-copilot.sh` — `gh copilot` CLI wrapper

**Desktop entries installed to `/usr/local/share/applications/`:**
- `copilot-cli.desktop`
- `robos-gnome-sysmon.desktop` — wraps GNOME System Monitor with `GTK_CSD=0`
- `robos-chrome.desktop`

> **Note:** `robos-gnome-sysmon.desktop` uses `GTK_CSD=0` to disable GNOME's client-side decorations so xfwm4 draws window borders on the System Monitor window.

---

### LightDM

**What changed:** On Ubuntu Desktop, GDM3 is typically the display manager. The install script enables LightDM and configures it to default to the `robos` session. GDM3 is not removed.

```bash
sudo systemctl enable lightdm
sudo sed -i 's/user-session=.*/user-session=robos/' /etc/lightdm/lightdm.conf
```

If GDM3 is still the active display manager, you may need to run:
```bash
sudo dpkg-reconfigure gdm3
# and choose lightdm
```

---

### GTK3 Dark Theme

**What changed:** `~/.config/gtk-3.0/gtk.css` is written from `packages/desktop-shell/gtk/gtk.css` to prevent white border bleed in dark-themed Electron windows under xfwm4. This is the same fix applied in the robosos build.

---

### Essential Developer Packages

**What changed:** The following packages are installed if not already present:

```
unzip zip wget curl jq git rsync tree less file lsof net-tools nmap dnsutils
traceroute whois tmux screen vim nano htop fzf ripgrep fd-find bat
python3-pip python3-venv build-essential software-properties-common
apt-transport-https ca-certificates gnupg lsb-release
```

Plus GUI/desktop packages:
```
tint2 lightdm lightdm-gtk-greeter python3-gi python3-gi-cairo gir1.2-gtk-3.0
tilix zsh xsetroot librsvg2-common curl gnupg pass gopass pinentry-gtk2
gnome-system-monitor imagemagick xfwm4 xfwm4-theme-breeze
```

---

### GitHub CLI + gh-copilot

**What changed:** Same as robosos. `gh` installed from `cli.github.com` APT repo; `gh-copilot` extension binary downloaded from GitHub releases.

---

### VS Code

**What changed:** Same as robosos. Installed from `packages.microsoft.com/repos/code` Microsoft APT repo.

---

### Google Chrome

**What changed:** Same as robosos. Installed from Google's DEB package. Wrapper at `/usr/local/bin/robos-chrome` adds `--use-system-title-bar`.

MIME default for `x-scheme-handler/http` and `x-scheme-handler/https` set to `robos-chrome.desktop`.

---

### zsh + oh-my-zsh

**What changed:** zsh set as default shell for the installing user. oh-my-zsh installed non-interactively with `robbyrussell` theme.

---

### RobOS Electron Apps

**What changed:** All RobOS Electron apps deployed to `/usr/local/share/robos/`, identical to robosos. Each app has:
- `npm install` run at deploy time
- `.desktop` entry in `/usr/local/share/applications/`
- Wrapper in `/usr/local/bin/`

---

### RobOS IntelliJ Plugin

**What changed:** Same as robosos. Plugin pre-built with Gradle if `openjdk-21-jdk-headless` is available, deployed to `/usr/local/share/robos/robos-intellij-plugin/robos-plugin.zip`.

---

### RobOS Agent Instructions

**What changed:** `~/.config/robos/robos-instructions.txt` seeded on first install (never overwritten). Identical content to robosos.

---

## GNOME Coexistence Notes

Because GNOME packages are **not removed**, the following GNOME-specific items remain functional but are not used by default in the RobOS session:

- **GNOME Shell** — available at the LightDM session picker as "Ubuntu" or "GNOME"
- **GNOME Settings** — can be launched from a terminal (`gnome-control-center`)
- **GNOME System Monitor** — available via `robos-gnome-sysmon.desktop` in tint2 (with `GTK_CSD=0` so xfwm4 decorates it)
- **GDM3** — may still be installed; LightDM is enabled and set as default but GDM3 packages remain

To fully remove GNOME after installing RobOS (optional, frees ~600 MB):
```bash
sudo apt remove --autoremove ubuntu-desktop gnome-shell gnome-session gdm3
```

> ⚠️ Doing this is irreversible without reinstalling. Only recommended for dedicated RobOS machines.

---

## Reverting to GNOME

To restore GNOME as the default session without reinstalling:
```bash
sudo sed -i 's/user-session=robos/user-session=ubuntu/' /etc/lightdm/lightdm.conf
# or switch back to GDM3:
sudo dpkg-reconfigure gdm3
```

---

## Key Files

| Path | Description |
|------|-------------|
| `packages/desktop-shell/install.sh` | Master install script — runs all customizations |
| `packages/desktop-shell/tint2/tint2rc` | tint2 taskbar config |
| `packages/desktop-shell/xfwm4/robos-session` | Session startup script (starts xfwm4 + tint2) |
| `packages/desktop-shell/xfwm4/robos.desktop` | XSession entry (`/usr/share/xsessions/robos.desktop`) |
| `packages/desktop-shell/gtk/gtk.css` | GTK3 dark theme override |
| `/usr/share/themes/RobOS/xfwm4/` | Generated dark xfwm4 theme (built during install) |
| `~/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml` | xfwm4 user preferences |
| `/etc/lightdm/lightdm.conf` | LightDM config — `user-session=robos` |
