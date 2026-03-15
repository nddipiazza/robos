---
layout: default
title: robosos (QEMU/Openbox)
parent: OS Builds
nav_order: 1
---

# robosos — QEMU / Openbox Build

> Ubuntu 22.04 Server cloud image, provisioned via cloud-init, running inside a QEMU VM with an Openbox + tint2 desktop.

---

## Overview

`robosos` is a fully self-contained QEMU virtual machine. The entire OS — from base Ubuntu cloud image to deployed Electron apps — is built reproducibly from source in this repository using two files: `infra/desktop/build.sh` and `infra/desktop/cloud-init/user-data`.

**Good for:** reproducible demo environments, developer VMs, CI testing of the RobOS app suite.

---

## Base Image

| Property | Value |
|----------|-------|
| Source | Ubuntu 22.04 "Jammy" server cloud image |
| URL | `https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img` |
| Format | qcow2, resized to 20 GB |
| Default user | `robos` / `robos` |
| Default shell | zsh (set by cloud-init) |

---

## How to Build and Run

```bash
# Build — downloads base image, creates VM disk, builds cloud-init ISO
./infra/desktop/build.sh

# First boot — attaches cloud-init ISO, provisions (~5–10 min)
./infra/desktop/run.sh --firstboot

# Normal boot
./infra/desktop/run.sh

# Headless (VNC on port 5910)
./infra/desktop/run.sh --vnc
```

After the first boot the VM reboots automatically. Subsequent boots land directly at the LightDM login screen.

---

## What Is Different from the Base Image

Everything below is a **RobOS-specific change** applied to the stock Ubuntu 22.04 cloud image. The base image has no desktop environment, no GUI tools, and no developer tooling.

---

### Two-Phase Boot Splash

**What changed:** A custom ASCII art splash screen is displayed on `tty1` from the very start of first-boot provisioning, before any packages are installed.

**Phase 1 — bootcmd ASCII loop** (`bootcmd` in `user-data`)

Runs via `cloud-init-per once` so it executes exactly once on first boot. A shell loop writes the ROBOS ASCII banner to `/dev/tty1` every 2 seconds until `/tmp/robos-install-done` appears. This fires before `apt` has even started, so the user never sees a blank screen.

```
     ██████╗  ██████╗ ██████╗  ██████╗ ███████╗
     ...
     AI-Powered SDLC Operating System
     Installing packages, please wait...
```

**Phase 2 — Python checklist splash** (`install_splash.py`, launched from `runcmd`)

Once packages are installed, the bootcmd loop is killed and `install_splash.py` takes over on `tty1`. It reads `/tmp/robos-install-status` (a two-line file: label + step number) and renders the ROBOS ASCII logo plus a numbered checklist of install steps with ANSI tick marks. Steps progress as `runcmd` writes new status lines.

**Files:**
- `infra/desktop/cloud-init/user-data` — `bootcmd` section
- `packages/desktop-shell/install-splash/install_splash.py` — phase 2 renderer

---

### Plymouth Boot Theme

**What changed:** A custom Plymouth theme replaces the default Ubuntu spinner on subsequent boots.

The theme (`robos.plymouth` + `robos.script`) displays:
- The ROBOS ASCII logo in a Plymouth-compatible font
- A custom progress bar with fill/background images (`bar-fill.png`, `bar-bg.png`)

GRUB is modified to enable `quiet splash`. `update-initramfs -u` is run to bake the theme in.

**Files written:**
- `/usr/share/plymouth/themes/robos/robos.plymouth`
- `/usr/share/plymouth/themes/robos/robos.script`
- `/usr/share/plymouth/themes/robos/bar-fill.png`
- `/usr/share/plymouth/themes/robos/bar-bg.png`
- `/etc/default/grub` — `GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"`

---

### Window Manager: Openbox

**What changed:** Openbox is installed as the sole window manager. There is no GNOME or other desktop environment.

**Packages installed:**
```
openbox tint2 xcompmgr picom xorg x11-xserver-utils dbus-x11 librsvg2-common
```

**Configuration files written to `/etc/skel/`** (copied to every user's home):

| File | Purpose |
|------|---------|
| `~/.config/openbox/autostart` | Starts tint2, sets background colour, launches Tilix, runs `configure-tilix.sh` |
| `~/.config/openbox/rc.xml` | Keybindings, window decorations, focus policy |
| `~/.config/openbox/menu.xml` | Right-click desktop menu with RobOS app shortcuts |

**RobOS Openbox theme** installed to `/usr/share/themes/RobOS/openbox-3/themerc` — a custom dark theme with `#0d1117` titlebar, `#388bfd` active border.

---

### tint2 Taskbar

**What changed:** tint2 is configured with a custom `tint2rc` providing the RobOS taskbar layout.

**Taskbar contents (left to right):**
- RobOS app launchers (Dev Central, Issue Manager, Git Projects, App Launcher, Agents Manager, etc.)
- Open windows list (middle)
- System tray + clock (right)

**Launcher scripts installed to `/usr/local/share/robos/`:**
- `task-widget.sh` — Jira task quick-pick
- `agents-widget.sh` — Copilot agent session manager shortcut
- `robos-copilot.sh` — wrapper for `gh copilot` CLI

**Config file:** `~/.config/tint2/tint2rc` (written from `packages/desktop-shell/tint2/tint2rc`)

---

### LightDM

**What changed:** LightDM is installed and configured as the display manager, replacing the default console login.

**`/etc/lightdm/lightdm.conf`** — sets:
```ini
[Seat:*]
user-session=openbox
autologin-user=robos
autologin-user-timeout=0
```

**`/etc/lightdm/lightdm-gtk-greeter.conf`** — dark-themed GTK greeter.

The default display manager is wired to LightDM:
```bash
echo "/usr/sbin/lightdm" > /etc/X11/default-display-manager
ln -sf /lib/systemd/system/lightdm.service /etc/systemd/system/display-manager.service
```

---

### GTK3 Dark Theme

**What changed:** A custom `gtk.css` is written to `~/.config/gtk-3.0/gtk.css` (and `/etc/skel/`) to prevent white border bleed in dark-themed Electron windows.

Also written:
- `~/.config/gtk-3.0/settings.ini` — sets `gtk-application-prefer-dark-theme=1`
- `~/.gtkrc-2.0` — GTK2 dark override for legacy apps

---

### zsh + oh-my-zsh

**What changed:** zsh is set as the default shell for the `robos` user. oh-my-zsh is installed non-interactively with the `robbyrussell` theme.

```bash
chsh -s /usr/bin/zsh robos
RUNZSH=no CHSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

---

### GitHub CLI + gh-copilot

**What changed:** `gh` (GitHub CLI) is installed from the official `cli.github.com` APT repository. The `gh-copilot` extension is installed by downloading the latest Linux-amd64 binary from the GitHub releases API.

```
/home/robos/.local/share/gh/extensions/gh-copilot/gh-copilot
```

The `run.sh` script copies host GitHub credentials (SSH key + `~/.config/gh/hosts.yml`) into the VM over SSH after first boot.

---

### VS Code

**What changed:** VS Code is installed from the Microsoft APT repository (`packages.microsoft.com/repos/code`).

GPG key written to `/usr/share/keyrings/microsoft.gpg`.
APT source written to `/etc/apt/sources.list.d/vscode.list`.

---

### Google Chrome

**What changed:** Google Chrome stable is installed from Google's DEB package. A wrapper script forces system title bars (required for the xfwm4/Openbox WM to draw window decorations correctly).

**Wrapper:** `/usr/local/bin/robos-chrome`
```bash
exec google-chrome --use-system-title-bar "$@"
```

**MIME default:** Chrome is set as the default browser via `/etc/xdg/mimeapps.list` and `/home/robos/.config/mimeapps.list`.

---

### RobOS Electron Apps

**What changed:** All RobOS Electron apps are deployed to `/usr/local/share/robos/<app>/` with:
- `npm install` run in each app directory
- A `.desktop` file copied to `/usr/local/share/applications/`
- A symlink/wrapper in `/usr/local/bin/<app>`

Apps deployed: `dev-central`, `issue-manager`, `task-planner`, `git-projects`, `app-launcher` (and all others listed in the [App Suite](../robos-app-suite/)).

---

### RobOS IntelliJ Plugin

**What changed:** The RobOS IntelliJ plugin is pre-built with Gradle (requires `openjdk-21-jdk-headless`) and the resulting ZIP is deployed to `/usr/local/share/robos/robos-intellij-plugin/robos-plugin.zip` for [IDE Manager](../robos-app-suite/ide-manager) to install on demand.

---

### Tilix Terminal

**What changed:** Tilix is installed as the default terminal. A `configure-tilix.sh` script is run at first desktop login to apply the dark RobOS colour scheme.

**autostart hook:** `~/.config/openbox/autostart` calls `configure-tilix.sh` on startup.

---

### RobOS Agent Instructions

**What changed:** A seed instructions file is written on first install (never overwritten on subsequent runs):

```
~/.config/robos/robos-instructions.txt
```

This file tells AI agents what RobOS is, what apps are available, and where config files live. Users can customise it freely.

---

### X Resources

**What changed:** `~/.Xresources` is written with DPI and font anti-aliasing settings appropriate for a VM display.

---

## VM Hardware Configuration

The QEMU VM is launched with:

| Setting | Value |
|---------|-------|
| RAM | 4 GB |
| CPUs | 2 vCPUs |
| Disk | 20 GB qcow2 |
| NIC | virtio, NAT with SSH forward `host:2222 → guest:22` |
| GPU | virtio-vga |
| RTC | localtime |
| KVM | enabled if `/dev/kvm` is accessible |

---

## Key Files

| Path | Description |
|------|-------------|
| `infra/desktop/build.sh` | Downloads base image, builds VM disk and cloud-init ISO |
| `infra/desktop/run.sh` | Launches QEMU VM; copies host GitHub credentials on first boot |
| `infra/desktop/cloud-init/user-data` | Full cloud-init config — all packages, files, runcmd steps |
| `infra/desktop/gen-userdata.py` | Regenerates `user-data` by embedding source files from `packages/` |
| `packages/desktop-shell/install-splash/install_splash.py` | Phase-2 install checklist splash renderer |
| `packages/desktop-shell/tint2/tint2rc` | tint2 taskbar config |
| `packages/desktop-shell/openbox/autostart` | Openbox session autostart script |
| `packages/desktop-shell/openbox/rc.xml` | Openbox window manager config |
