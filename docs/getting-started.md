---
title: Getting Started
layout: default
nav_order: 2
---

# Getting Started
{: .no_toc }

Build and run RobOS on your machine.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Prerequisites

| Requirement | Version | Notes |
|:------------|:--------|:------|
| QEMU/KVM | Latest | `/dev/kvm` access required |
| Node.js | 20+ | For building Electron apps |
| npm | 10+ | Comes with Node.js |
| Host RAM | 16 GB+ | VM uses 16 GB |
| Disk | 100 GB free | Sparse qcow2 image |

---

## Build the VM

```bash
# Clone the repository
git clone https://github.com/nddipiazza/robos.git
cd robos

# Build the disk image and cloud-init ISO
infra/desktop/build.sh

# First boot with cloud-init provisioning
infra/desktop/run.sh --firstboot
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

## Connect to the VM

After the first boot completes and the VM reboots:

```bash
# Subsequent launches (no --firstboot)
infra/desktop/run.sh

# SSH access
ssh -p 2224 robos@localhost
# Password: robos

# VNC access (for GUI)
# Port 5910

# SPICE access (clipboard sharing)
# Port 5932
```

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
| Org | `Hermetiq` |
| Repo | `buildbarn-forms` |
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
# Run an app with a test scenario
cd packages/robos-test
npm install
node lib/harness.js --app security-setup --scenario fresh-install

# Run all unit tests (432 tests)
npm run test:unit

# Run all E2E tests
npm test
```

Test scenarios simulate different credential states (`all-good`, `fresh-install`, `no-gh-auth`, etc.) with sandbox `$HOME` isolation and CLI stubs.

---

## Deploying Changes to the VM

```bash
# Full install (all packages)
ssh -p 2224 robos@localhost 'bash -s' < packages/desktop-shell/install.sh

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
