---
title: Home
layout: home
nav_order: 1
---

# RobOS

## AI-First Software Development Operating System
{: .fs-9 }

Every developer interaction — picking up a ticket, understanding a bug, reviewing a fix, shipping code — is augmented by AI. RobOS eliminates context-switching overhead by deeply integrating task management, code intelligence, and AI agents into the OS and IDE layers.
{: .fs-6 .fw-300 }

[Get Started]({% link getting-started.md %}){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/nddipiazza/robos){: .btn .fs-5 .mb-4 .mb-md-0 }

---

![RobOS App Launcher]({{ '/assets/images/screenshots/app-launcher.png' | relative_url }})

---

## The Vision

RobOS is a purpose-built Linux desktop environment where **every app, panel, and widget serves the software delivery lifecycle**. From the moment you log in, AI agents are ready to help you write code, review PRs, manage tasks, and deploy with confidence.

### What Makes RobOS Different

**Task-Driven Workspaces** — Each task on the task server maps to its own IDE workspace. When a developer picks up a task, the workspace is automatically provisioned: the correct branch is checked out, the dev environment is spun up, and the workspace is brought to a breakpoint where the issue reproduces.

**AI Investigates, Developer Reviews** — Instead of "developer investigates, then codes", RobOS inverts the flow: AI investigates and proposes a solution plan, then the developer reviews and approves before any code changes.

**Automatic Everything** — Status transitions, notifications, time logging, PR descriptions, reviewer checklists, and deployment tracking all happen automatically through an event-driven architecture.

---

## The Model Problem: Building Buildbarn Forms

We validate every RobOS feature against a real project: **[buildbarn-forms](https://github.com/Hermetiq/buildbarn-forms)** — a React component library for editing Buildbarn remote build execution configurations.

A team of four (Product Owner, Developer, Dev Lead, Manager) uses RobOS to take a story from backlog to deployed, with every status transition, notification, and dashboard update happening automatically.

[Read the Full Walkthrough]({% link model-problem/index.md %}){: .btn .btn-outline .fs-5 }

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

[See All Apps]({% link apps/index.md %}){: .btn .btn-outline .fs-5 }

---

## Architecture at a Glance

```
RobOS Desktop (Ubuntu 22.04 + GNOME)
├── 30+ Electron Apps ──── dark theme, contextBridge IPC
├── Event Bus ──────────── automatic status transitions
├── Rule Engine ────────── event → condition → action
├── Agent Scheduler ────── background AI agent jobs
├── Desktop Manager ────── system tray + app launch IPC hub
└── Shared Libraries ───── robos-lib, robos-icons, robos-ui
```

[Architecture Deep Dive]({% link architecture.md %}){: .btn .btn-outline .fs-5 }
