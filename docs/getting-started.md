---
title: Getting Started
layout: default
nav_order: 2
---

# Getting Started
{: .no_toc }

Install RobOS on bare metal or run it as a VM.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Option A: Install on a Laptop (Bare Metal)

The recommended way to run RobOS for daily use. Works on any x86_64 machine — ThinkPads, Dell, HP, any PC that runs Ubuntu.

### What You Need

- A USB flash drive (8 GB+)
- A laptop or desktop with 16 GB+ RAM and 100 GB+ disk
- An internet connection (for first-boot provisioning)

### Step 1: Install Ubuntu 22.04 LTS

Download the Ubuntu 22.04 LTS desktop ISO from [ubuntu.com/download/desktop](https://ubuntu.com/download/desktop).

**Create a bootable USB drive:**

| OS | Tool |
|:---|:-----|
| Linux | `sudo dd if=ubuntu-22.04-desktop-amd64.iso of=/dev/sdX bs=4M status=progress` |
| Mac | [balenaEtcher](https://etcher.balena.io/) or `dd` |
| Windows | [Rufus](https://rufus.ie/) or [balenaEtcher](https://etcher.balena.io/) |

Boot from the USB drive and install Ubuntu with these settings:
- **User**: `robos` (password: your choice)
- **Disk**: Use entire disk (or a partition if dual-booting)
- **Minimal installation** is fine — RobOS provisioning installs everything else

### Step 2: Download the RobOS Seed ISO

After Ubuntu is installed and you're logged in, download the seed ISO from the latest [GitHub Release](https://github.com/nddipiazza/robos/releases):

```bash
# Download the latest seed ISO (contains all RobOS apps + provisioning scripts)
cd ~/Downloads
wget https://github.com/nddipiazza/robos/releases/latest/download/robos-v0.0.2-seed.iso
```

### Step 3: Mount and Run the Provisioner

```bash
# Mount the seed ISO
sudo mkdir -p /mnt/seed
sudo mount -o loop ~/Downloads/robos-v0.0.2-seed.iso /mnt/seed

# Extract the packages
sudo tar xzf /mnt/seed/robos-packages.tar.gz -C /tmp/robos-packages/

# Copy packages to /usr/local/share/robos/
sudo mkdir -p /usr/local/share/robos
for pkg in /tmp/robos-packages/*/; do
  name=$(basename "$pkg")
  sudo cp -r "$pkg" "/usr/local/share/robos/$name"
  sudo chmod -R a+rX "/usr/local/share/robos/$name"
done

# Install Node.js 20 (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Electron globally
sudo npm install -g electron@28

# Install npm dependencies for each app
for pkg in /usr/local/share/robos/*/; do
  if [ -f "$pkg/package.json" ] && grep -q electron "$pkg/package.json"; then
    sudo bash -c "cd '$pkg' && npm install --quiet"
  fi
done

# Install .desktop files so apps appear in the launcher
for desktop in /usr/local/share/robos/*/*.desktop; do
  [ -f "$desktop" ] && sudo cp "$desktop" /usr/share/applications/
done

# Copy logo
sudo cp /mnt/seed/robos-logo.png /usr/share/pixmaps/robos-logo.png 2>/dev/null || true

# Unmount
sudo umount /mnt/seed
```

### Step 4: Apply the RobOS Theme (Optional)

```bash
# Dark theme
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
gsettings set org.gnome.desktop.interface gtk-theme 'Yaru-dark'

# Auto-login (so RobOS boots straight to desktop)
sudo sed -i 's/#  AutomaticLoginEnable/AutomaticLoginEnable/' /etc/gdm3/custom.conf
sudo sed -i "s/#  AutomaticLogin = user1/AutomaticLogin = $(whoami)/" /etc/gdm3/custom.conf
```

Log out and back in (or reboot). All RobOS apps are now available in the GNOME application menu.

---

## Option B: Run as a VM (QEMU/KVM)

Best for development, testing, or trying RobOS without modifying your host system.

### From GitHub Releases (Fastest)

Download the pre-built VM image and seed ISO from the latest [release](https://github.com/nddipiazza/robos/releases):

```bash
# Download artifacts
wget https://github.com/nddipiazza/robos/releases/latest/download/robos-v0.0.2.qcow2
wget https://github.com/nddipiazza/robos/releases/latest/download/robos-v0.0.2-seed.iso

# First boot — cloud-init provisions the full RobOS desktop
qemu-system-x86_64 -m 16G -smp $(nproc) -enable-kvm -cpu host \
  -drive file=robos-v0.0.2.qcow2,format=qcow2,if=virtio \
  -drive file=robos-v0.0.2-seed.iso,format=raw,if=virtio \
  -netdev user,id=net0,hostfwd=tcp::2224-:22 \
  -device virtio-net-pci,netdev=net0 \
  -display gtk

# After provisioning completes and VM reboots, run without seed ISO:
qemu-system-x86_64 -m 16G -smp $(nproc) -enable-kvm -cpu host \
  -drive file=robos-v0.0.2.qcow2,format=qcow2,if=virtio \
  -netdev user,id=net0,hostfwd=tcp::2224-:22 \
  -device virtio-net-pci,netdev=net0 \
  -display gtk
```

### From Source

```bash
git clone https://github.com/nddipiazza/robos.git
cd robos

# Build the disk image and cloud-init ISO
infra/desktop/build.sh

# First boot with cloud-init provisioning
infra/desktop/run.sh --firstboot

# Subsequent boots
infra/desktop/run.sh
```

### Prerequisites (VM)

| Requirement | Version | Notes |
|:------------|:--------|:------|
| QEMU/KVM | Latest | `/dev/kvm` access required |
| Node.js | 20+ | For building from source |
| Host RAM | 16 GB+ | VM uses 16 GB |
| Disk | 100 GB free | Sparse qcow2 image |

### Connect to the VM

```bash
# SSH access
ssh -p 2224 robos@localhost
# Password: robos

# VNC access (for GUI): port 5910
# SPICE access (clipboard sharing): port 5932
```

The first boot runs a 7-step provisioning sequence via cloud-init:
1. System packages and GNOME desktop
2. Node.js and Electron runtime
3. Dark theme and desktop customization
4. All 30+ RobOS Electron apps deployed to `/usr/local/share/robos/`
5. Desktop panels, widgets, and launcher configuration
6. LightDM auto-login setup
7. Final reboot

---

## First Login

On first login, the **App Launcher** opens automatically — a searchable grid of all RobOS applications.

![App Launcher]({{ '/assets/images/screenshots/app-launcher.png' | relative_url }})

The recommended first steps:

### 1. Security Setup

Open **Security Setup** from the App Launcher. It walks you through 5 steps:

![Security Setup]({{ '/assets/images/screenshots/security-setup.png' | relative_url }})

1. **Pinentry** — Configure GPG pin entry
2. **GPG Key** — Generate a new GPG key for encrypting secrets
3. **Pass Store** — Initialize the password store
4. **SSH Key** — Generate an SSH key
5. **Add to GitHub** — Register the SSH key with GitHub

### 2. Configure a Task Server

Open **Task Servers** and add your GitHub or Jira instance:

![Task Servers]({{ '/assets/images/screenshots/task-servers.png' | relative_url }})

| Field | Example |
|:------|:--------|
| Type | GitHub |
| Name | My Project |
| Org | `acme-corp` |
| Repo | `my-project` |
| Auth | Use `gh` CLI |

Click **Test Connection** to verify, then **Save**.

### 3. Define Your Workflow

Open **Workflow Studio** and use the AI generator:

![Workflow Studio]({{ '/assets/images/screenshots/workflow-studio.png' | relative_url }})

1. Describe your process: `agile software team, bugs + features, AI-first development`
2. Click **Generate** — AI creates issue types and workflow states
3. Review and **Save**

---

## Testing Apps (Dev Harness)

You don't need the VM to test apps during development. The dev harness runs Electron apps locally in a sandbox:

```bash
cd packages/robos-test
npm install

# Run all unit tests (440 tests)
npm run test:unit

# Run all E2E tests
npm test
```

Test scenarios simulate different credential states (`all-good`, `fresh-install`, `no-gh-auth`, etc.) with sandbox `$HOME` isolation and CLI stubs.

---

## Deploying Changes to the VM

```bash
# Single app update
scp -P 2224 -r packages/task-board/* robos@localhost:/tmp/task-board/
ssh -p 2224 robos@localhost "sudo rm -rf /usr/local/share/robos/task-board \
  && sudo cp -r /tmp/task-board /usr/local/share/robos/task-board \
  && sudo chmod -R a+rX /usr/local/share/robos/task-board \
  && cd /usr/local/share/robos/task-board && sudo npm install --quiet"
```

---

## Next Steps

- [**The Model Problem**]({{ site.baseurl }}{% link model-problem/index.md %}) — See how a team uses RobOS to build buildbarn-forms
- [**App Suite**]({{ site.baseurl }}{% link apps/index.md %}) — Explore all 30+ RobOS applications
- [**Architecture**]({{ site.baseurl }}{% link architecture.md %}) — Understand the technical design
