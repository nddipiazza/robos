# RobOS Desktop MVP — QEMU Quick Start

Builds and runs a minimal **Openbox + tint2** desktop inside QEMU with a single custom addition: the **RobOS Agent Control Panel** launcher in the taskbar.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Base OS | Ubuntu 22.04 cloud image | No-install first boot via cloud-init |
| Window manager | **Openbox** | Minimal (~5 MB), infinitely customisable |
| Taskbar | **tint2** | Lightweight, easy launcher + systray config |
| Agent panel | **Python 3 + GTK 3** | Ships with Ubuntu, zero extra deps |
| Provisioning | **cloud-init** | Stateless, reproducible first boot |

## Prerequisites (host machine)

```bash
sudo apt install qemu-system-x86 qemu-utils genisoimage wget python3
# Optional (big speed boost):
sudo usermod -aG kvm $USER && newgrp kvm
```

## Build

```bash
# From repo root:
./infra/desktop/build.sh
```

Downloads the Ubuntu 22.04 cloud image (~600 MB, cached), resizes to 20 GB, and packages the cloud-init seed ISO. Only needs to run once (or after source file changes).

## Run

```bash
# First boot — attaches cloud-init ISO, installs all packages (~5-10 min)
./infra/desktop/run.sh --firstboot

# All subsequent boots — fast, no cloud-init
./infra/desktop/run.sh

# Headless (VNC on port 5910)
./infra/desktop/run.sh --vnc
```

## Login

| Field | Value |
|---|---|
| Username | `robos` |
| Password | `robos` |
| Session | **Openbox** (select at LightDM login screen) |

## What you get

```
┌──────────────────────────────────────────────────────────┐
│                  (dark desktop)                          │
│                                                          │
│                                                          │
├──[🤖]──[open windows]──────────────────────[tray][14:32]─┤
 ^taskbar
  ^RobOS Agent icon → click → opens Agent Control Panel
```

The Agent Control Panel shows a placeholder jobs list. This is the seed for the full SDLC agent orchestration UI.

## Test the panel without QEMU

```bash
# Requires python3-gi on your host
python3 packages/desktop-shell/agent-panel/agent_panel.py
```

## Customising

| Want to change | Edit |
|---|---|
| Taskbar layout | `packages/desktop-shell/tint2/tint2rc` |
| Desktop autostart | `packages/desktop-shell/openbox/autostart` |
| Agent panel UI / jobs | `packages/desktop-shell/agent-panel/agent_panel.py` |
| Agent panel icon | `packages/desktop-shell/agent-panel/icon.svg` |
| VM provisioning | `packages/desktop-shell/install.sh` → then re-run `build.sh` |

After editing source files, re-run `build.sh` to regenerate `cloud-init/user-data`.

## Architecture notes

- `gen-userdata.py` reads source files and embeds them into `cloud-init/user-data` — single source of truth in `packages/desktop-shell/`
- `install.sh` can also deploy directly onto any running Ubuntu machine (inside or outside the VM)
- The Agent Panel is intentionally agent-agnostic — the backend API for real job data will be added separately
