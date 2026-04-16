---
title: App Suite
layout: default
nav_order: 4
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

## Core Workflow Apps

These apps drive the main development flow — from picking up a task to deploying code.

<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin: 1.5rem 0;">

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/task-board.svg' | relative_url }}" alt="Task Board" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Task Board</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Kanban and list view of all issues from your task server. Filter by state, assignee, or search. Drag cards between columns.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/issue-manager.svg' | relative_url }}" alt="Issue Manager" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Issue Manager</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">GitHub Issues client with AI issue breakdown, workflow state transitions, and workspace provisioning from any issue.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/pr-review.svg' | relative_url }}" alt="PR Review" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>PR Review Board</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">AI-assisted code review with change summaries, risk assessment, interactive breakpoint review, and one-click approval.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/ci-monitor.svg' | relative_url }}" alt="CI Monitor" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>CI Monitor</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Watch CI/CD pipelines in real time. AI diagnoses failures and suggests fixes. One-click rerun.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/workspace-manager.svg' | relative_url }}" alt="Workspace Manager" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Workspace Manager</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Discover and manage local workspaces. Open in any IDE. Auto-provisions workspace per task with branch, deps, and dev server.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/agents-manager.svg' | relative_url }}" alt="Agents Manager" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>AI Agent Manager</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Manage AI agent sessions (Claude Code, Copilot, Codex, Gemini). Assign agents to tasks. Monitor questionnaire, draft, and review-fix cycles.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/context-manager.svg' | relative_url }}" alt="Context Manager" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Context Manager</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Curate AI context sources — files, folders, URLs, repos, tickets. Auto-attached when an agent starts working on a task.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/dev-tools.svg' | relative_url }}" alt="Dev Tools" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Dev Tools</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Install and manage IDEs, CLI tools, and cloud SDKs. 19 tools including Claude CLI, VS Code, JetBrains suite, Docker, ripgrep.</span>
</div>
</div>

</div>

---

## Dashboard Apps

Real-time visibility for every role on the team.

<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin: 1.5rem 0;">

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/dev-central.svg' | relative_url }}" alt="Dev Central" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Dev Central</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Daily developer dashboard: my tasks, my PRs, review requests, AI standup summary, and blocker radar.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/manager-dashboard.svg' | relative_url }}" alt="Manager Dashboard" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Manager Dashboard</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Sprint board, velocity charts, per-developer metrics, deployment history, and team health indicators.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/deploy-tracker.svg' | relative_url }}" alt="Deploy Tracker" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Deploy Tracker</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Deployment timeline with per-version story lists, deploy frequency KPIs, and rollback tracking.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/report-builder.svg' | relative_url }}" alt="Report Builder" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Report Builder</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Generate sprint reports, velocity summaries, and team performance reports with AI-assisted insights.</span>
</div>
</div>

</div>

---

## Configuration & Security Apps

Set up your development environment and manage credentials.

<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin: 1.5rem 0;">

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/security-setup.svg' | relative_url }}" alt="Security Setup" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Security Setup</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">First-run wizard: GPG key generation, SSH key setup, GitHub authentication, and password store initialization.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/pass-manager.svg' | relative_url }}" alt="Pass Manager" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Pass Manager</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">GUI for GPG-encrypted password store. Create, view, edit, and delete secrets. Team secret distribution.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/task-servers.svg' | relative_url }}" alt="Task Servers" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Task Servers</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Configure connections to Jira, GitHub Issues, or Linear. Authentication, project mapping, and bidirectional sync.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/workflow-studio.svg' | relative_url }}" alt="Workflow Studio" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Workflow Studio</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Define custom task workflows with AI generation. Configure issue types, states, and event-driven transitions.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/robos-preferences.svg' | relative_url }}" alt="RobOS Preferences" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>RobOS Preferences</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">System-wide settings: credentials, AI model preferences, notification config, and theme customization.</span>
</div>
</div>

</div>

---

## System Services

Background services and desktop integration.

<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin: 1.5rem 0;">

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/automation-studio.svg' | relative_url }}" alt="Automation Studio" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Automation Studio</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Create event-driven rules (event → condition → action). Manage scheduled AI agent jobs. View event log.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/notifications.svg' | relative_url }}" alt="Notifications" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Notifications</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">Notification history viewer. Filter by category (PR, CI/CD, System) and tier (Critical, Warning, Info).</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/desktop-manager.svg' | relative_url }}" alt="Desktop Manager" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Desktop Manager</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">System tray IPC hub. Manages app lifecycle, inter-app communication, and desktop panel integration.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/search-index.svg' | relative_url }}" alt="Search Index" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Search Index</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">File system indexer for @-mention search in AI textareas. Fast lookup across all project files.</span>
</div>
</div>

<div style="background: var(--color-background-alt, #161b22); border-radius: 8px; padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start;">
<img src="{{ '/assets/images/icons/stage-demo.svg' | relative_url }}" alt="Stage Demo" style="width: 48px; height: 48px; flex-shrink: 0;">
<div>
<strong>Stage Demo Viewer</strong><br>
<span style="font-size: 0.85rem; opacity: 0.8;">AI-generated demo walkthroughs of merged PRs. Product owners can review changes before production deploy.</span>
</div>
</div>

</div>
