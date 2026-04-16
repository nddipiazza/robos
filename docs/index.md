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

[Get Started]({{ site.baseurl }}{% link getting-started.md %}){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/nddipiazza/robos){: .btn .fs-5 .mb-4 .mb-md-0 }

---

![RobOS Desktop]({{ '/assets/images/screenshots/robos-desktop.png' | relative_url }})

---

## Two Pillars

RobOS is a purpose-built Linux desktop with two major capabilities:

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin: 2rem 0;">

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-top: 4px solid #00bcd4;">
<h3 style="margin-top: 0;">1. Build Kick-Ass Software</h3>
<p>An OS fully dedicated to the software delivery lifecycle. 30+ purpose-built apps cover every phase — from picking up a ticket to deploying code. AI agents write code, review PRs, manage tasks, and track deployments. Every status transition, notification, and dashboard update happens automatically.</p>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.5rem; border-top: 4px solid #8b5cf6;">
<h3 style="margin-top: 0;">2. Customize Your Desktop with Prompts</h3>
<p>The <strong>Desktop Customizer</strong> lets you reshape the entire GNOME experience through natural language. Move the clock, resize the taskbar, add widgets, build new apps on the fly, mix UI languages — just describe what you want. Every change is versioned with one-click rollback.</p>
</div>

</div>

### What Makes RobOS Different

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
├── Event Bus ──────────── automatic status transitions
├── Rule Engine ────────── event → condition → action
├── Agent Scheduler ────── background AI agent jobs
├── Desktop Manager ────── system tray + app launch IPC hub
└── Shared Libraries ───── robos-lib, robos-icons, robos-ui
```

[Architecture Deep Dive]({{ site.baseurl }}{% link architecture.md %}){: .btn .btn-outline .fs-5 }
