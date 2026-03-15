---
layout: default
title: OS Builds
nav_order: 3
has_children: true
permalink: /os-builds/
---

# RobOS OS Builds

RobOS ships as two distinct builds. Both deliver the same Electron app suite and RobOS customizations; they differ in their base OS, window manager, and deployment method.

---

## Build Comparison

| | **robosos** | **robos-gnome** |
|---|---|---|
| **Base image** | Ubuntu 22.04 Server cloud image | Ubuntu Desktop (any recent LTS) |
| **Provisioning** | cloud-init (`user-data`) | `packages/desktop-shell/install.sh` |
| **Window manager** | Openbox | xfwm4 |
| **Taskbar** | tint2 | tint2 |
| **Compositor** | picom + xcompmgr | xfwm4 built-in compositing |
| **Deployment** | QEMU VM | Bare metal or existing VM |
| **Desktop session** | `openbox-session` (LightDM) | `robos` xsession (LightDM) |
| **GNOME present** | No | Yes (packages remain, session bypassed) |
| **Good for** | Reproducible VM, CI, demos | Bare-metal developer workstations |

Both builds use **LightDM** as the display manager and **tint2** as the taskbar. All RobOS Electron apps, CLI tools, and configuration are identical between the two.

---

## Shared Customizations

The following changes are applied to **both** builds regardless of the base image:

- [tint2 taskbar](robosos#tint2-taskbar) — custom `tint2rc` with all RobOS launchers
- [RobOS Electron app suite](robosos#robos-electron-apps) — all apps installed to `/usr/local/share/robos/`
- [GitHub CLI + gh-copilot](robosos#github-cli--gh-copilot) — installed from the official APT repo and extension binary
- [VS Code](robosos#vs-code) — installed from Microsoft APT repository
- [Google Chrome wrapper](robosos#google-chrome) — `--use-system-title-bar` wrapper script + MIME default
- [zsh + oh-my-zsh](robosos#zsh--oh-my-zsh) — default shell for the `robos` user
- [LightDM login screen](robosos#lightdm) — configured to auto-select the RobOS session
- [GTK3 dark theme](robosos#gtk3-dark-theme) — `gtk.css` to eliminate white border bleed in dark-themed windows
- [RobOS agent instructions](robosos#robos-agent-instructions) — `~/.config/robos/robos-instructions.txt` seeded on first install
- [Plymouth boot theme](robosos#plymouth-boot-theme) — custom RobOS splash with progress bar

See the individual build pages for build-specific customizations:

- [robosos — QEMU/Openbox build](robosos)
- [robos-gnome — Ubuntu Desktop / xfwm4 build](robos-gnome)
