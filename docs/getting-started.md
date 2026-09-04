---
title: Getting Started
layout: default
nav_order: 2
---

# Getting Started
{: .no_toc }

Install RobOS as a suite of lightweight desktop applications on your current machine, or install the full RobOS Ubuntu Developer OS on bare metal or virtual machine.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Option 1: Install as Desktop App Suite (Linux, macOS, Windows)

The easiest way to get started if you already have a workstation running Linux, macOS, or Windows.

### 1. Prerequisites
- **Node.js 20+** and **npm**
- **Git**
- Optional for Kubernetes workflows: **Docker / Kind** and **kubectl**

### 2. Setup and Launch
```bash
# Clone the RobOS repository
git clone https://github.com/nddipiazza/robos.git
cd robos

# Run the unified dependency audit and setup
node scripts/install-dev-deps.js

# Launch any application via harness or desktop entry
node packages/robos-test/lib/harness.js --app dev-central
node packages/robos-test/lib/harness.js --app db-manager
node packages/robos-test/lib/harness.js --app topology-manager
```

### 3. Running Containerized Headless E2E Tests
Run the full automated E2E test suite inside an isolated Docker container with Xvfb virtual framebuffers:
```bash
./scripts/e2e-container.sh          # Run full headless test suite
./scripts/e2e-container.sh -i       # Interactive shell
```

---

## Option 2: Install Full RobOS Ubuntu OS Distro

The complete, dedicated developer environment: Ubuntu 26.04 base, customized dark GNOME desktop, ephemeral agent session daemons, Tilix terminal, LightDM auto-login, and all 30+ pre-installed SDLC apps.

### Bare Metal Deployment (Flash via Rufus / Etcher / dd)
1. Download the latest `robos-v0.1.0.iso` from [GitHub Releases](https://github.com/nddipiazza/robos/releases).
2. Write to a USB drive:
   - **Windows**: Use [Rufus](https://rufus.ie/) (Select GPT, UEFI).
   - **macOS / Linux**: Use [balenaEtcher](https://etcher.balena.io/) or `dd`:
     ```bash
     sudo dd if=robos-v0.1.0.iso of=/dev/sdX bs=4M status=progress conv=fsync
     ```
3. Insert the USB drive into your target machine, boot into UEFI, and let cloud-init automatically configure the OS.
4. Default credentials: `robos` / `robos`.

### Virtual Machine (QEMU/KVM)
```bash
# Build the disk image + cloud-init ISO
infra/desktop/build.sh

# Run VM (16GB RAM, host CPUs, SSH on port 2224, VNC on port 5910)
infra/desktop/run.sh

# Connect via SSH
ssh -p 2224 robos@localhost
```

---

## First-Run Onboarding & AI Provisioning

When you first launch RobOS or log into the desktop, the **Unified Setup & Onboarding Wizard** guides you through:

1. **Security & GPG Keys**: Initializing the GPG key store and SSH identity for GitHub / Git servers.
2. **AI Model & MCP Configuration**: Connecting your AI API keys (Anthropic, Gemini, OpenAI) and authenticating Model Context Protocol (MCP) servers with OAuth flows.
3. **Task Server & Git Workspace**: Connecting your Jira or GitHub issue trackers and checking out target project repositories.
4. **Knowledge Graph Initialization**: Synthesizing the dual-state SDLC graph in `.robos/topology.yaml`.

---

## Testing & Verifying Applications

RobOS applications include built-in DOM snapshot debug servers and automated scenario runners:

```bash
# Run unit & scenario tests
npm --prefix packages/robos-test test

# Run developer tools test suite
xvfb-run -a node --test packages/robos-test/tests/developer-tools/developer-tools-suite.test.js

# Run full end-to-end topology & kubernetes lifecycle test
xvfb-run -a node --test packages/robos-test/tests/e2e/topology-db-kube-lifecycle.test.js
```

---

## Next Steps

- [**System Architecture**]({{ site.baseurl }}{% link architecture.md %}) — Explore the 8-pillar SDLC architecture and Knowledge Graph.
- [**AI Agent Review-Based Development**]({{ site.baseurl }}{% link agent-review-development.md %}) — Learn the plan-code-review-verify workflow.
- [**App Suite Catalog**]({{ site.baseurl }}{% link apps/index.md %}) — Explore all 30+ applications.
- [**Master Walkthroughs**]({{ site.baseurl }}{% link walkthroughs.md %}) — View recorded video walkthroughs and test proof-of-work.
