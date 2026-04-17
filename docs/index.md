---
title: Home
layout: home
nav_order: 1
---

# RobOS

## The AI-Native Operating System for Software Teams
{: .fs-9 }

A purpose-built Linux desktop where AI does the heavy lifting — writing code, reviewing PRs, managing tasks, tracking deployments — and the entire OS can be reshaped with a single prompt. Drop expensive hardware and proprietary licenses. Ship software faster on a $700 ThinkPad.
{: .fs-6 .fw-300 }

[Get Started]({{ site.baseurl }}{% link getting-started.md %}){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/nddipiazza/robos){: .btn .fs-5 .mb-4 .mb-md-0 }

---

![RobOS Desktop]({{ '/assets/images/screenshots/robos-desktop.png' | relative_url }})

---

## Two Pillars

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin: 2rem 0;">

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-top: 4px solid #00bcd4;">
<h3 style="margin-top: 0;">1. AI-First Software Delivery</h3>
<p>30+ purpose-built apps cover every phase of the SDLC — from picking up a ticket to deploying code. AI agents write code, review PRs, manage tasks, and track deployments. Every status transition, notification, and dashboard update happens automatically. The developer reviews and approves; the AI does the grunt work.</p>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-top: 4px solid #8b5cf6;">
<h3 style="margin-top: 0;">2. Prompt-Shaped Desktop</h3>
<p>The <strong>Desktop Customizer</strong> reshapes the entire GNOME experience through natural language. Move the clock, resize the taskbar, add widgets, build entirely new apps from a sentence, mix UI languages — just describe what you want. Every change is git-snapshotted with one-click rollback. Your desktop, your rules.</p>
</div>

</div>

### Desktop Customizer in Action

![Desktop Customizer — /help showing all available commands]({{ '/assets/images/screenshots/desktop-customizer.png' | relative_url }})

---

## The Case for RobOS
{: .text-center }

### Why your next dev machine should be a Linux laptop running RobOS
{: .text-center .fw-300 }

The economics of software development have inverted. AI is doing more of the actual work — writing code, running reviews, diagnosing CI failures — while developers are shifting to oversight, architecture, and approval. The expensive part is no longer the human typing speed or the build-time compilation. It's the AI API calls, the context windows, and the orchestration layer. So why are companies still spending $3,000+ per developer on hardware and proprietary OS licenses designed for a pre-AI world?

### The Traditional Stack — What It Actually Costs

| Line Item | MacBook Pro | Windows Surface | RobOS + ThinkPad |
|:----------|:------------|:----------------|:-----------------|
| **Hardware** | $2,499 (M3 Pro 14") | $1,999 (Surface Laptop) | **$699** (ThinkPad E14 Gen 6) |
| **OS License** | $0 (bundled) | $200 (Windows 11 Pro) | **$0** (Ubuntu LTS, free) |
| **Enterprise Support** | $299/yr (AppleCare) | $150/yr (MS Extended) | **$25/yr** (Ubuntu Pro, free for 5 seats) |
| **IDE** | $249/yr (IntelliJ) | $249/yr (IntelliJ) | **$249/yr** (IntelliJ) or **$0** (VS Code) |
| **Jira/Project Mgmt** | $77/yr per user (Standard) | $77/yr per user | **$0** (RobOS Task Manager + GitHub Issues) |
| **CI Dashboard** | $0-500/yr (third-party) | $0-500/yr | **$0** (RobOS CI Monitor) |
| **3-Year Total** | **$3,400 - $4,100** | **$2,900 - $3,600** | **$950 - $1,700** |

### That's $2,000+ per developer, per refresh cycle — saved.

For a 50-person engineering org refreshing every 3 years, that's **$100,000+ in savings per cycle** — and that's before you count the productivity gains from AI-native tooling.

### But Isn't Mac/Windows Better for Development?

That was true in 2020. Here's what changed:

**AI doesn't care about your OS.** Claude, GPT-4, Copilot — they run in the cloud. Your laptop is a terminal to the API. A $700 ThinkPad with 16GB RAM and an SSD runs VS Code, Docker, and the Anthropic SDK identically to a $2,500 MacBook.

**Linux is where production runs.** Your CI, your servers, your containers — all Linux. Developing on the same OS you deploy to eliminates "works on my machine" issues. No more Rosetta translation layers, no more WSL2 indirection.

**GNOME is now beautiful.** Ubuntu 22.04+ with GNOME 42+ has smooth animations, fractional scaling, HiDPI support, Wayland, and dark mode. RobOS adds a custom dark navy/cyan theme on top. It looks as polished as macOS and more customizable than both.

**The hardware caught up.** Lenovo ThinkPad E14 Gen 6: AMD Ryzen 7, 16 GB RAM, 512 GB SSD, 14" 1080p IPS, all-day battery, legendary keyboard, $699. Run QEMU/KVM for anything you'd need a VM for. USB-C docking for monitors. That's it. That's the whole dev machine.

### The Canonical Partnership Angle

For enterprises that need vendor support:

| | macOS | Windows | Ubuntu + Canonical |
|:--|:------|:--------|:-------------------|
| **Support tier** | AppleCare ($299/yr) | MS Premier ($500+/yr) | Ubuntu Pro ($25/yr per machine, free for 5) |
| **Security patches** | Apple's timeline | Patch Tuesday | Livepatch (zero-downtime kernel patches) |
| **Compliance** | Limited certifications | FIPS, Common Criteria | FIPS 140-2, CIS benchmarks, DISA STIGs |
| **MDM** | Apple MDM ($5-10/device/mo) | Intune ($8/device/mo) | Landscape ($5/device/mo, free for 5) |
| **CVE response** | Closed source, trust Apple | Closed source, trust MS | Open source, verify yourself |

Ubuntu Pro is free for up to 5 machines and $25/machine/year after that — with 10-year LTS support, FIPS compliance, and Livepatch. That's enterprise support for the price of a Starbucks order.

---

## Install in 3 Clicks

The **RobOS Installer** runs on Linux, macOS, and Windows. Pick your USB drive, click Flash, boot from USB. That's it.

![RobOS Installer]({{ '/assets/images/screenshots/robos-installer.png' | relative_url }})

Download the installer from the latest [GitHub Release](https://github.com/nddipiazza/robos/releases).

---

## What Makes RobOS Different

**Task-Driven Workspaces** — Each task maps to its own IDE workspace. When a developer picks up a task, the workspace is automatically provisioned: branch checked out, dev environment started, breakpoint set at the issue reproduction point.

**AI Investigates, Developer Reviews** — Instead of "developer investigates, then codes", RobOS inverts the flow: AI investigates and proposes, the developer reviews and approves.

**Prompt-Driven Desktop** — No more searching StackOverflow for `gsettings` commands. Type "move the clock to the left and make the taskbar bigger" and it happens. Build entirely new Electron apps from a sentence. Every change is snapshotted with instant rollback.

**Automatic Everything** — Status transitions, notifications, time logging, PR descriptions, reviewer checklists, and deployment tracking all happen automatically through an event-driven architecture.

---

## The Model Problem: Building Buildbarn Forms

We validate every RobOS feature against a real project: **buildbarn-forms** — a React component library for editing [Buildbarn](https://github.com/buildbarn) remote build execution configurations. Buildbarn is an open-source remote execution system used by organizations running large-scale distributed builds. The buildbarn-forms library reads Buildbarn's protobuf configuration schemas and renders type-safe, validated form UIs for each config section (workers, storage, schedulers, browsers).

A team of four (Product Owner, Developer, Dev Lead, Manager) uses RobOS to take a story from backlog to deployed, with every status transition, notification, and dashboard update happening automatically.

[Read the Full Walkthrough]({{ site.baseurl }}{% link model-problem/index.md %}){: .btn .btn-outline .fs-5 }

---

## 30+ Purpose-Built Apps

<div class="app-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 1rem; margin: 2rem 0;">

{% assign apps = "task-board,issue-manager,pr-review,ci-monitor,dev-central,agents-manager,workspace-manager,dev-tools,security-setup,automation-studio,manager-dashboard,notifications" | split: "," %}
{% for app in apps %}
<div style="text-align: center; padding: 1rem;">
<img src="{{ '/assets/images/icons/' | append: app | append: '.svg' | relative_url }}" alt="{{ app }}" style="width: 48px; height: 48px; margin-bottom: 0.5rem;">
<div style="font-size: 0.75rem;">{{ app | replace: '-', ' ' | capitalize }}</div>
</div>
{% endfor %}

</div>

[See All Apps]({{ site.baseurl }}{% link apps/index.md %}){: .btn .btn-outline .fs-5 }

---

## Architecture at a Glance

```
RobOS Desktop (Ubuntu 22.04 + GNOME)
├── 30+ Electron Apps ──── dark theme, contextBridge IPC
├── Desktop Customizer ─── prompt-driven GNOME customization
├── Event Bus ──────────── automatic status transitions
├── Rule Engine ────────── event → condition → action
├── Agent Scheduler ────── background AI agent jobs
├── Desktop Manager ────── system tray + app launch IPC hub
└── Shared Libraries ───── robos-lib, robos-icons, robos-ui
```

[Architecture Deep Dive]({{ site.baseurl }}{% link architecture.md %}){: .btn .btn-outline .fs-5 }
