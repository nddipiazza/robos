---
title: Install
layout: default
nav_order: 2
---

# Install RobOS
{: .no_toc }

Flash a USB drive, boot, and walk into a fully provisioned AI development desktop.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Watch: RobOS Installer Walkthrough

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1.5rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/J4SMH4bskeo"
    title="RobOS Installer — Flash a USB and boot into your AI development desktop"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

---

## Option A: Install on a Laptop (Bare Metal)

The recommended way to run RobOS for daily use. Works on any x86_64 machine — ThinkPads, Dell, HP, any PC.

### Step 1 — Download the RobOS Installer

Download the **RobOS Installer** for your current OS from the latest [GitHub Release](https://github.com/nddipiazza/robos/releases):

| Your OS | Download |
|:--------|:---------|
| **Linux** | `RobOS-Installer-linux.AppImage` or `.deb` |
| **macOS** | `RobOS-Installer-mac.dmg` |
| **Windows** | `RobOS-Installer-win.exe` |

### Step 2 — Flash the USB Drive

Run the installer and follow the 3-step wizard:

![RobOS Installer — select your USB drive and click Flash]({{ '/assets/images/screenshots/robos-installer.png' | relative_url }})

1. **Select your USB drive** — the installer detects all removable drives
2. **Download RobOS** — automatically downloads the latest ISO with a progress bar
3. **Flash** — writes the ISO to your USB drive (confirm before erasing)

{: .warning }
> **This will erase the target drive.** Double-check you're writing to the USB drive, not your system disk.

### The Manual Way: Flash with dd / Rufus

```bash
# Download the ISO
wget https://github.com/nddipiazza/robos/releases/latest/download/robos-v0.0.3.iso

# Linux — flash with dd
sudo dd if=robos-v0.0.3.iso of=/dev/sdX bs=4M status=progress

# Or use the included CLI tool
sudo bash scripts/flash-robos.sh /dev/sdX
```

On **macOS** use [balenaEtcher](https://etcher.balena.io/). On **Windows** use [Rufus](https://rufus.ie/).

### Step 3 — Boot and Provision

1. Insert the USB drive and boot from it (F12 or F2 at BIOS splash for boot menu)
2. The RobOS installer starts automatically — **no interaction needed**
3. Ubuntu 26.04, GNOME, Node.js, Electron, and all 30+ RobOS apps install and configure themselves
4. After ~15–20 minutes you'll see the RobOS desktop

**Default credentials:** username `robos`, password `robos`

{: .important }
> The installer will **use the entire disk**. If you need dual-boot or custom partitioning, use Option B (VM) or install Ubuntu manually first, then run `robos-provision.sh` from the release.

---

## Option B: Run as a VM (QEMU/KVM)

Best for trying RobOS before committing to bare metal, or for development on the RobOS platform itself.

See the full VM setup instructions in [Getting Started]({{ site.baseurl }}{% link getting-started.md %}#option-b-run-as-a-vm-qemukvm).

---

## What Gets Installed

The provisioning sequence runs 7 steps automatically:

1. System packages (build tools, Node.js 20, npm)
2. GNOME desktop + LightDM auto-login
3. Electron + all 30+ RobOS apps installed to `/usr/local/share/robos/`
4. Dark navy/cyan theme applied
5. Desktop shell, launchers, and `.desktop` entries registered
6. SSH keys generated, zsh + oh-my-zsh configured
7. Final reboot into the RobOS desktop

[Detailed Provisioning Reference]({{ site.baseurl }}{% link getting-started.md %}){: .btn .btn-outline .fs-5 }
