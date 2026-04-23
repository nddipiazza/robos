---
title: App Suite
layout: default
nav_order: 5
has_children: false
---

# RobOS App Suite
{: .no_toc }

30+ purpose-built Electron apps covering the full software delivery lifecycle.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

All apps share a consistent **dark theme** (`#0d1117` background, `#00bcd4` cyan accent), use `contextBridge` IPC for security, and expose DOM snapshot debug servers for automated testing.

---

## App Launcher

The entry point to RobOS — a searchable grid of all installed applications with category filtering.

![App Launcher]({{ '/assets/images/screenshots/app-launcher.png' | relative_url }})

---

## Core Workflow Apps

These apps drive the main development flow — from picking up a task to deploying code.

### Task Board

<img src="{{ '/assets/images/icons/task-board.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Kanban and list view of all issues from your task server. Filter by state, assignee, or search.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/BnbGA7ivVJM"
    title="RobOS Task Board — your whole backlog on one screen"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Issue Manager

<img src="{{ '/assets/images/icons/issue-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> GitHub Issues client with AI issue breakdown, workflow state transitions, and workspace provisioning from any issue.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/3awlQtEaWmE"
    title="RobOS Issue Manager — focused, AI-assisted view of any ticket"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### PR Review Board

<img src="{{ '/assets/images/icons/pr-review.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> AI-assisted code review with change summaries, risk assessment, interactive breakpoint review, and one-click approval.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/gV0vsmR5I7E"
    title="RobOS PR Review Board — AI-assisted code review"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### CI Monitor

<img src="{{ '/assets/images/icons/ci-monitor.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Watch CI/CD pipelines in real time. AI diagnoses failures and suggests fixes. One-click rerun.

![CI Monitor]({{ '/assets/images/screenshots/ci-monitor.png' | relative_url }})

### Workspace Manager

<img src="{{ '/assets/images/icons/workspace-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Discover and manage local workspaces. Open in any IDE. Auto-provisions workspace per task with branch, deps, and dev server.

![Workspace Manager]({{ '/assets/images/screenshots/workspace-manager.png' | relative_url }})

### AI Agent Manager

<img src="{{ '/assets/images/icons/agents-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Manage AI agent sessions (Claude Code, Copilot, Codex, Gemini). Assign agents to tasks. Monitor questionnaire, draft, and review-fix cycles.

![AI Agent Manager]({{ '/assets/images/screenshots/agents-manager.png' | relative_url }})

### Context Manager

<img src="{{ '/assets/images/icons/context-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Curate AI context sources — files, folders, URLs, repos, tickets. Auto-attached when an agent starts working on a task.

![Context Manager]({{ '/assets/images/screenshots/context-manager.png' | relative_url }})

### Dev Tools

<img src="{{ '/assets/images/icons/dev-tools.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Install and manage IDEs, CLI tools, and cloud SDKs. 19 tools including Claude CLI, VS Code, JetBrains suite, Docker, ripgrep.

![Dev Tools]({{ '/assets/images/screenshots/dev-tools.png' | relative_url }})

---

## Dashboard Apps

Real-time visibility for every role on the team.

### Dev Central

<img src="{{ '/assets/images/icons/dev-central.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Daily developer dashboard: my tasks, my PRs, review requests, AI standup summary, and blocker radar.

![Dev Central]({{ '/assets/images/screenshots/dev-central.png' | relative_url }})

### Manager Dashboard

<img src="{{ '/assets/images/icons/manager-dashboard.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Sprint board, velocity charts, per-developer metrics, deployment history, and team health indicators.

![Manager Dashboard]({{ '/assets/images/screenshots/manager-dashboard.png' | relative_url }})

### Deploy Tracker

<img src="{{ '/assets/images/icons/deploy-tracker.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Deployment timeline with per-version story lists, deploy frequency KPIs, and rollback tracking.

![Deploy Tracker]({{ '/assets/images/screenshots/deploy-tracker.png' | relative_url }})

### Report Builder

<img src="{{ '/assets/images/icons/report-builder.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Generate sprint reports, velocity summaries, and team performance reports with AI-assisted insights.

![Report Builder]({{ '/assets/images/screenshots/report-builder.png' | relative_url }})

### Stage Demo Viewer

<img src="{{ '/assets/images/icons/stage-demo.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> AI-generated demo walkthroughs of merged PRs. Product owners can review changes before production deploy.

![Stage Demo Viewer]({{ '/assets/images/screenshots/stage-demo.png' | relative_url }})

---

## Configuration & Security Apps

Set up your development environment and manage credentials.

### Security Setup

<img src="{{ '/assets/images/icons/security-setup.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> First-run wizard: GPG key generation, SSH key setup, GitHub authentication, and password store initialization.

<div style="max-width: 360px; margin: 1rem auto;">
  <div style="position: relative; padding-bottom: 177.78%; height: 0; overflow: hidden; border-radius: 8px;">
    <iframe
      src="https://www.youtube-nocookie.com/embed/QGmIybkj878"
      title="RobOS Security Setup — first-run wizard"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
  </div>
</div>

### Git Login Manager

<img src="{{ '/assets/images/icons/git-login-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Verify GitHub CLI auth, SSH key presence, SSH connectivity to GitHub, and git identity configuration.

![Git Login Manager]({{ '/assets/images/screenshots/git-login-manager.png' | relative_url }})

### Pass Manager

<img src="{{ '/assets/images/icons/pass-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> GUI for GPG-encrypted password store. Create, view, edit, and delete secrets. Team secret distribution.

![Pass Manager]({{ '/assets/images/screenshots/pass-manager.png' | relative_url }})

### Task Servers

<img src="{{ '/assets/images/icons/task-servers.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Configure connections to Jira, GitHub Issues, or Linear. Authentication, project mapping, and bidirectional sync.

![Task Servers]({{ '/assets/images/screenshots/task-servers.png' | relative_url }})

### Workflow Studio

<img src="{{ '/assets/images/icons/workflow-studio.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Define custom task workflows with AI generation. Configure issue types, states, and event-driven transitions.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/gqRYI6ja-q8"
    title="RobOS Workflow Studio — design ticket workflows in plain English"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### RobOS Preferences

<img src="{{ '/assets/images/icons/robos-preferences.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> System-wide settings: credentials, AI model preferences, notification config, and theme customization.

![RobOS Preferences]({{ '/assets/images/screenshots/robos-preferences.png' | relative_url }})

---

## System Services

Background services and desktop integration.

### Automation Studio

<img src="{{ '/assets/images/icons/automation-studio.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Create event-driven rules (event → condition → action). Manage scheduled AI agent jobs. View event log.

![Automation Studio]({{ '/assets/images/screenshots/automation-studio.png' | relative_url }})

### Notifications

<img src="{{ '/assets/images/icons/notifications.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Notification history viewer. Filter by category (PR, CI/CD, System) and tier (Critical, Warning, Info).

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/6iQgeIIvTH0"
    title="RobOS Notifications — app walkthrough"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Search Index

<img src="{{ '/assets/images/icons/search-index.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> File system indexer for @-mention search in AI textareas. Fast lookup across all project files.

![Search Index]({{ '/assets/images/screenshots/search-index.png' | relative_url }})
