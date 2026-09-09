---
title: Getting Started
layout: default
nav_order: 4
---

# Installation & Getting Started
{: .no_toc }

Run RobOS instantly on your existing macOS, Linux, or Windows WSL machine via Docker or standalone CLI/apps, or deploy the native developer desktop suite and optional appliance OS.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Option 1: Instant Universal Quickstart & Agent Sandbox (macOS, Linux, Windows WSL)

The fastest way to experience RobOS without modifying your operating system. RobOS is engineered to run seamlessly alongside your existing IDE (VS Code, IntelliJ IDEA) and terminal workflows on **macOS**, **Linux**, or **Windows (WSL2)**.

### 1. Prerequisites
- **Node.js 20+** and **npm**
- **Git**
- **Docker** (optional, recommended for headless virtual framebuffer & video proof-of-work)

### 2. Quick Setup & Headless Agent Verification
```bash
# 1. Clone the RobOS repository
git clone https://github.com/nddipiazza/robos.git
cd robos

# 2. Run containerized headless verification & video proof-of-work
./scripts/e2e-container.sh
```

### 3. Launch Standalone Tools
You can launch any RobOS application individually without installing the desktop shell:

```bash
# Install package dependencies
npm install

# Launch Agent Code Review Platform
electron packages/pr-review

# Launch System Topology & C4 Architecture Studio
electron packages/topology-manager

# Launch Dev Central daily dashboard
electron packages/dev-central

# Launch Bruno REST API Client
electron packages/rest-client

# Launch Relational DB Manager (PostgreSQL, MySQL)
electron packages/db-manager
```

### 4. Use Knowledge Graph in Existing Repositories
Simply drop the `.robos/` directory into your project root to immediately enable declarative architecture modeling, TypeSpec schemas, W3C SHACL shape validation, and pre-code blast-radius diffing with any AI agent (Claude Code, Gemini, Copilot, Antigravity).

---

## Option 2: Full Native Developer Suite (Ubuntu / GNOME Desktop)

If you run an **Ubuntu Linux (22.04 LTS, 24.04 LTS, or 26.04)** workstation with the GNOME desktop environment, you can install the complete RobOS desktop suite, app launchers, system tray daemons, and shared libraries directly alongside your existing desktop:

### 1. One-Line Desktop Installation
```bash
# Clone the RobOS repository
git clone https://github.com/nddipiazza/robos.git
cd robos

# Audit & install dev machine dependencies
node scripts/install-dev-deps.js

# Install all 30+ apps, .desktop entries, and shared libraries to /usr/local/share/robos/
sudo bash packages/desktop-shell/install.sh
```

### 2. Launching Applications from Desktop Panel
All RobOS applications become accessible directly from the **RobOS App Launcher** in your desktop dock and top panel, or executable from the Tilix/bash terminal.

---

## Option 3 (Optional Power-User Appliance): Dedicated RobOS OS Distro & QEMU VM

For regulated environments, hardware air-gapping, or developers who want a dedicated appliance workstation, RobOS provides a fully provisioned, bootable Ubuntu 26.04 LTS developer OS image and local QEMU/KVM virtual machine.

### A. Bare Metal Deployment (Flash via Rufus / Etcher / dd)
1. Download the latest `robos-v0.1.0.iso` from [GitHub Releases](https://github.com/nddipiazza/robos/releases).
2. Write to a USB flash drive:
   - **Windows**: Use [Rufus](https://rufus.ie/) (Select GPT partition scheme and UEFI target).
   - **macOS / Linux**: Use [balenaEtcher](https://etcher.balena.io/) or standard `dd`:
     ```bash
     sudo dd if=robos-v0.1.0.iso of=/dev/sdX bs=4M status=progress conv=fsync
     ```
3. Insert the USB drive into your PC, boot into UEFI, and let cloud-init automatically provision the environment.
4. Default credentials: `robos` / `robos`.

### B. Virtual Machine Deployment (QEMU / KVM)
```bash
# Build the sparse disk image + cloud-init ISO
infra/desktop/build.sh

# Run VM (16GB RAM, all host CPUs, SSH on port 2224, VNC on port 5910)
infra/desktop/run.sh

# Connect via SSH
ssh -p 2224 robos@localhost
```

---

## Cross-Platform Desktop Setup: macOS & Windows

RobOS applications are built using pure Electron and vanilla JavaScript with zero framework overhead, making them inherently cross-platform and runnable across macOS, Windows, and Linux.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/cross-platform-desktop-architecture.jpg' | relative_url }}" alt="RobOS Cross-Platform Desktop Architecture" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS Cross-Platform Architecture</strong>: Native execution on macOS (Apple Silicon & Intel), Windows 11/10 (WSL2 & PowerShell), and Ubuntu Linux. <em>(Click image to zoom full screen)</em>
  </div>
</div>

### 🍎 macOS Setup (Apple Silicon M1–M4 & Intel)

RobOS runs natively on macOS with full support for Apple Silicon and Intel architectures.

#### 1. Prerequisites (via Homebrew)
```bash
brew install node git
# Optional: Docker Desktop or OrbStack for containerized headless video proof-of-work
brew install --cask docker
```

#### 2. Clone & Install
```bash
git clone https://github.com/nddipiazza/robos.git
cd robos
npm install
```

#### 3. Launch Standalone Applications
Launch any RobOS application directly from your terminal:
```bash
# Launch Agent Code Review Platform & IDE Bridge
npx electron packages/pr-review

# Launch System Topology & C4 Architecture Studio
npx electron packages/topology-manager

# Launch Dev Central daily dashboard
npx electron packages/dev-central

# Launch Relational DB Manager (PostgreSQL, MySQL)
npx electron packages/db-manager

# Launch Bruno REST API Client
npx electron packages/rest-client
```

#### 4. Run Headless Proof-of-Work in Docker
```bash
# Run containerized headless E2E verification & Piper TTS video proof-of-work
./scripts/e2e-container.sh
```

---

### 🪟 Windows 11 & 10 Setup (WSL2 & Native PowerShell)

RobOS supports Windows both inside WSL2 (with WSLg hardware-accelerated GUI streaming) and natively via PowerShell.

#### Method A: WSL2 with WSLg (Recommended)
WSL2 provides the ideal environment for RobOS on Windows because it supports in-memory `tmpfs` agent sandboxes, virtual X11 framebuffers, and native Windows 11 window integration:

```bash
# 1. Inside your WSL2 Ubuntu terminal, install Node.js and Git:
sudo apt update && sudo apt install -y nodejs npm git

# 2. Clone the repository and install dependencies:
git clone https://github.com/nddipiazza/robos.git
cd robos
npm install

# 3. Launch applications (opens directly as native Windows 11 windows via WSLg):
npx electron packages/pr-review
npx electron packages/topology-manager
npx electron packages/dev-central

# 4. Run containerized headless verification & video proof-of-work:
./scripts/e2e-container.sh
```

#### Method B: Native Windows (PowerShell)
You can also run RobOS developer tools directly in Windows PowerShell:

```powershell
# 1. Install Node.js LTS and Git (if not already installed)
winget install OpenJS.NodeJS.LTS
winget install Git.Git

# 2. Clone the repository and install dependencies:
git clone https://github.com/nddipiazza/robos.git
cd robos
npm install

# 3. Launch applications directly:
npx electron packages\pr-review
npx electron packages\topology-manager
npx electron packages\dev-central
npx electron packages\db-manager
```

---

## First-Run Onboarding & Organization Setup

When you first launch RobOS or log into the desktop, you can onboard your organization or bootstrap a brand-new tenant:

### 🏢 Organization Setup Paths
- [**Existing Company Setup**]({{ site.baseurl }}{% link existing-company-setup.md %}) — For established organizations with existing IdPs: configure automated SCIM/LDAP directory sync (Okta, Azure AD / Microsoft Entra, Google Workspace), GitHub team mapping, and Team Topologies (`.robos/teams.yaml`).
- [**New Company Setup**]({{ site.baseurl }}{% link new-company-setup.md %}) — For greenfield startups and new ventures: provision root administrator credentials, initialize VCS organizations, scaffold foundational squads, and configure AI provider keys.

### 🛠️ Developer Application Wizards
- [**Develop a New App**]({{ site.baseurl }}{% link new-app-wizard.md %}) — Launch the **RobOS App Wizard** to scaffold a brand-new application across 9 multi-app archetypes (`DesktopApp`, `FrontEndApp`, `PCGame`, `MobileGame`, `Microservice`, `ConsoleApp`, `MobileApp`, `DataPipeline`, `Library`) with API contract specifications and runnable `dev-setup.sh`.
- [**Import Existing Apps**]({{ site.baseurl }}{% link app-import-wizard.md %}) — Use the App Wizard's import engine to deeply inspect existing brownfield repositories, auto-detect runtime frameworks, synthesize Backstage `catalog-info.yaml`, and link into the Knowledge Graph.

---

## Testing & Verifying Applications

Run the containerized headless test suite or local scenario walkers:

```bash
# Run full automated test suite inside Docker container with Xvfb
./scripts/e2e-container.sh

# Run unit & scenario tests
npm --prefix packages/robos-test test

# Run developer tools test suite
xvfb-run -a node --test packages/robos-test/tests/developer-tools/developer-tools-suite.test.js

# Run full end-to-end topology & kubernetes lifecycle test
xvfb-run -a node --test packages/robos-test/tests/e2e/topology-db-kube-lifecycle.test.js
```

---

## Next Steps

- [**Existing Company Setup**]({{ site.baseurl }}{% link existing-company-setup.md %}) — Connect enterprise directory sync (Okta, Azure AD, OpenLDAP) and map Team Topologies.
- [**New Company Setup**]({{ site.baseurl }}{% link new-company-setup.md %}) — Bootstrap a new startup, root administrator, and foundational squads.
- [**Develop a New App**]({{ site.baseurl }}{% link new-app-wizard.md %}) — Scaffold a new application across 9 archetypes with API contracts and Backstage catalog.
- [**Import Existing Apps**]({{ site.baseurl }}{% link app-import-wizard.md %}) — Ingest existing brownfield repositories with automated tech stack detection.
- [**RobOS Skills**]({{ site.baseurl }}{% link robos-skills.md %}) — Master cross-agent AI skills (Claude, Codex, Antigravity, Copilot, Gemini) and 74+ shell macros.
- [**App Development Flow**]({{ site.baseurl }}{% link app-development-flow.md %}) — Learn the progressive flow of RobOS apps used to build an application.
- [**AI Agent Review-Based Development**]({{ site.baseurl }}{% link agent-review-development.md %}) — Learn the plan-code-review-verify workflow.
- [**Master Walkthroughs**]({{ site.baseurl }}{% link walkthroughs.md %}) — View recorded video walkthroughs and test proof-of-work.
- [**System Architecture**]({{ site.baseurl }}{% link architecture.md %}) — Explore the 8-pillar SDLC architecture and Knowledge Graph.
- [**App Suite Catalog**]({{ site.baseurl }}{% link apps.md %}) — Explore all 30+ applications.
- [**💡 Feature Ideas Store on GitHub**](https://github.com/nddipiazza/robos/tree/main/docs/ideas) — Explore raw ideas, structured specs, and community feature requests.
