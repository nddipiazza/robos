# RobOS — Boot & Installation Splash Screen

## Problem

On first boot, cloud-init spends several minutes downloading and installing packages. Without intervention the user sees a blank console — no indication that anything is happening, no reason to stay at the screen.

## Solution: Two-Phase Splash

### Phase 1 — Immediate logo (bootcmd)

`cloud-init`'s `bootcmd` key runs **before packages are installed** and **before `runcmd`**. We inject a single `cloud-init-per once` command that:

1. Switches the active console to tty1 (`chvt 1`)
2. Spawns a background loop that clears the screen every 2 seconds and prints the RobOS ASCII logo + a "Installing packages, please wait..." message directly to `/dev/tty1`
3. The loop exits when `/tmp/robos-install-done` is created (written at the end of `runcmd`)

```yaml
# infra/desktop/cloud-init/user-data
bootcmd:
  - [ cloud-init-per, once, robos-splash, sh, -c,
      "chvt 1 2>/dev/null;
       (while ! [ -f /tmp/robos-install-done ]; do
         printf '\033c\n\n\n
     ██████╗  ██████╗ ██████╗  ██████╗ ███████╗\n
     ██╔══██╗██╔═══██╗██╔══██╗██╔═══██╗██╔════╝\n
     ██████╔╝██║   ██║██████╔╝██║   ██║███████╗\n
     ██╔══██╗██║   ██║██╔══██╗██║   ██║╚════██║\n
     ██║  ██║╚██████╔╝██████╔╝╚██████╔╝███████║\n
     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝\n\n
     AI-Powered SDLC Operating System\n\n
     Installing packages, please wait...\n'
         >/dev/tty1 2>&1
         sleep 2
       done) & echo \$! > /tmp/robos-splash-pid" ]
```

**Result**: The very first thing visible after boot is the RobOS logo. No blank screen, no confusion.

---

### Phase 2 — Progress checklist (install_splash.py)

Once packages are installed, `runcmd` kills the Phase 1 loop and launches `install_splash.py` on `tty1`. This Python script renders:

- The same logo in **cyan** (`\033[96m`)
- A full **step checklist** showing all 8 installation phases:
  - `✓` — completed step (green)
  - `▶ installing…` — current step (yellow)
  - `·` — pending step (dim)

Steps:
1. Base system
2. Display manager
3. Shell (zsh + oh-my-zsh)
4. GitHub CLI
5. VS Code
6. Google Chrome
7. Plymouth boot theme
8. Finalising

The script polls `/tmp/robos-install-status` (a two-line file: message on line 1, step index on line 2) written by `runcmd` at each step transition.

**Source**: `packages/desktop-shell/install-splash/install_splash.py`

---

## Handoff sequence

```
VM power on
    │
    └─ bootcmd fires (before packages)
           └─ chvt 1 + logo loop starts on tty1
               │
               └─ cloud-init installs packages (minutes pass, logo visible)
                       │
                       └─ runcmd starts
                              ├─ kill Phase 1 loop
                              ├─ launch install_splash.py on tty1
                              ├─ for each step: write /tmp/robos-install-status
                              │       └─ splash polls and updates checklist
                              └─ write /tmp/robos-install-done
                                     └─ splash exits
                                            └─ LightDM login screen appears
```

---

## Why bootcmd and not runcmd?

`runcmd` runs **after** the `packages:` block completes. That means if we only used `runcmd`, the user would see nothing for the entire package download phase. `bootcmd` is the only cloud-init mechanism that fires early enough to show a splash before packages install.

The `cloud-init-per once` wrapper ensures the bootcmd only runs on the first boot — not on every subsequent reboot.
