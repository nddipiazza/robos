---
title: App Suite
layout: default
nav_order: 5
has_children: false
---

# RobOS App Suite
{: .no_toc }

30+ purpose-built Electron apps covering the full software delivery lifecycle — including **AI Prompt** (natural-language OS control) and **Skills Manager** (reusable shell skill packs).
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

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/Xs89Tea-mNE"
    title="RobOS CI Monitor — AI-diagnosed pipeline failures"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Git Projects

<img src="{{ '/assets/images/icons/git-projects.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> The front door to every git repository on the team — clone, run dev-setup scripts, open in any IDE, browse GitHub repos you already have access to. AI-generated dev-setup, test, and run scripts per project.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/QRALf76HR34"
    title="RobOS Git Projects — clone, manage, and launch every repo from one panel"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Workspace Manager

<img src="{{ '/assets/images/icons/workspace-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Discover and manage local workspaces. Open in any IDE. Auto-provisions workspace per task with branch, deps, and dev server.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/TZvC7Ii6nPg"
    title="RobOS Workspace Manager — every project, every IDE, one click away"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### AI Agent Manager

<img src="{{ '/assets/images/icons/agents-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Manage AI agent sessions (Claude Code, Copilot, Codex, Gemini). Assign agents to tasks. Monitor questionnaire, draft, and review-fix cycles.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/fomJ99guQY8"
    title="RobOS AI Agent Manager — one console for Claude, Copilot, and every agent"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Context Manager

<img src="{{ '/assets/images/icons/context-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Curate AI context sources — files, folders, URLs, repos, tickets. Auto-attached when an agent starts working on a task.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/w5HmwQvfBPE"
    title="RobOS Context Manager — ground every AI agent in what your team knows"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Dev Tools

<img src="{{ '/assets/images/icons/dev-tools.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Install and manage IDEs, CLI tools, and cloud SDKs. 19 tools including Claude CLI, VS Code, JetBrains suite, Docker, ripgrep.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/Q5_vzC3MOy0"
    title="RobOS Dev Tools — one-click install for every IDE, CLI, and AI agent"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

---

## Dashboard Apps

Real-time visibility for every role on the team.

### Dev Central

<img src="{{ '/assets/images/icons/dev-central.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Daily developer dashboard: my tasks, my PRs, review requests, AI standup summary, and blocker radar.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/vs6Grzfd074"
    title="RobOS Dev Central — your daily developer dashboard"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Manager Dashboard

<img src="{{ '/assets/images/icons/manager-dashboard.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Sprint board, velocity charts, per-developer metrics, deployment history, and team health indicators.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/RgMbLzuV9rY"
    title="RobOS Manager Dashboard — sprint metrics, velocity, and deploy frequency"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Deploy Tracker

<img src="{{ '/assets/images/icons/deploy-tracker.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Deployment timeline with per-version story lists, deploy frequency KPIs, and rollback tracking.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/-X5xDypHatQ"
    title="RobOS Deploy Tracker — timeline, frequency, and MTTR in one view"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Report Builder

<img src="{{ '/assets/images/icons/report-builder.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Generate sprint reports, velocity summaries, and team performance reports with AI-assisted insights.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/jzUt2vsZ5-I"
    title="RobOS Report Builder — AI-generated sprint reports in plain English"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Stage Demo Viewer

<img src="{{ '/assets/images/icons/stage-demo.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> AI-generated demo walkthroughs of merged PRs. Product owners can review changes before production deploy.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/n3TUdYDd5e4"
    title="RobOS Stage Demo Viewer — AI walkthroughs of every merged PR"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

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

<div style="max-width: 360px; margin: 1rem auto;">
  <div style="position: relative; padding-bottom: 177.78%; height: 0; overflow: hidden; border-radius: 8px;">
    <iframe
      src="https://www.youtube-nocookie.com/embed/vO7pY9c_b2Q"
      title="RobOS Git Login Manager — the silent safety net for your git credentials"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
  </div>
</div>

### Pass Manager

<img src="{{ '/assets/images/icons/pass-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> GUI for GPG-encrypted password store. Create, view, edit, and delete secrets. Team secret distribution.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/RhVt-ch2rIA"
    title="RobOS Pass Manager — GPG-encrypted secrets in a GUI"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Task Servers

<img src="{{ '/assets/images/icons/task-servers.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Configure connections to Jira, GitHub Issues, or Linear. Authentication, project mapping, and bidirectional sync.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/vyMGbo_-qk0"
    title="RobOS Task Servers — one config for GitHub, Jira, and Linear"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

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

## AI Shell & Skills

Natural-language AI control of the operating system — powered by a library of reusable shell skill packs.

### RobOS AI Prompt

<img src="{{ '/assets/images/icons/ai-prompt.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Talk to your OS in plain English. Select pre-built shell skills from the sidebar, fill in any required parameters, type a prompt (or skip it), and let an AI agent run the commands and explain the results in a structured step-by-step report.

**Key features:**
- **Skills sidebar** — 70+ built-in skills across 10 categories (File Operations, Git, Process Management, Docker, Network, Security, System, Package Management, Text Processing, Development). Filter by search or browse by category.
- **Skill parameter inputs** — Skills with `$VARIABLE` placeholders expand into inline input cards so you can fill in filenames, ports, search patterns, and more before running.
- **Skills-only mode** — Select one or more skills and hit Run without entering a prompt; the AI automatically runs all selected skills and returns a unified report.
- **AI agent selector** — Switch between Claude, GitHub Copilot, Codex, and Gemini via the agent pill in the header. Auth status is checked on load with an inline banner if login is needed.
- **Structured results** — Every run returns a numbered step list with the command, live output, and a plain-English explanation. Failed steps are highlighted in red.
- **Run history** — Every prompt+result pair is persisted so you can scroll back through past runs and re-apply them.

**Example prompts:**
```
Show me what's eating disk space in my home directory
Kill all processes listening on port 3000
Find all TODO comments in the current git repo
Run a full git status and show me what needs committing
```

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/PLACEHOLDER_AI_PROMPT"
    title="RobOS AI Prompt — talk to your OS in plain English"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

### Skills Manager

<img src="{{ '/assets/images/icons/skills-manager.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Browse, install, and manage AI shell skills. Ships with 70+ built-in skills and supports importing community skill packs from popular GitHub repositories.

**Built-in skill categories:**

| Category | Example skills |
|:---------|:---------------|
| **File Operations** | disk-usage, find-large-files, json-pretty, csv-summary, count-lines |
| **Process Management** | list-processes, kill-port, top-cpu, top-memory, port-in-use |
| **Git** | git-status, git-log, git-branches, git-stash, git-cleanup |
| **Network** | check-connectivity, open-ports, http-test, dns-lookup, wifi-info |
| **Docker** | docker-containers, docker-images, docker-logs, docker-cleanup |
| **System** | system-info, memory-usage, cpu-info, uptime, environment-vars |
| **Package Management** | npm-outdated, pip-list, apt-upgradable, node-version |
| **Text Processing** | grep-recursive, word-count, find-duplicates, sort-lines |
| **Security** | check-permissions, find-suid, ssh-keys, listening-services |
| **Development** | run-tests, lint-js, find-todos, check-syntax, node-modules-size |

**Community skill packs** — The Skills Manager can clone any GitHub repository of shell skills and register them as a custom pack. Use the **Add Pack** panel to paste a repo URL, preview the skills it contains, and install it with one click.

**Skill structure** — each skill is a JSON object with `id`, `name`, `description`, `category`, `command`, and optional `$VAR` parameters. Custom skills are stored in `~/.config/robos/skills.json`.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/PLACEHOLDER_SKILLS_MANAGER"
    title="RobOS Skills Manager — install and manage AI shell skills"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

#### How skills connect to AI Prompt

```
Skills Manager  ──(stores)──▶  ~/.config/robos/skills.json
                                         │
                              skills-data.js (built-ins)
                                         │
                                         ▼
AI Prompt ──── sidebar ────▶  selects skill(s)
               ▼
       fills $PARAM values
               ▼
       AI agent runs commands + returns structured report
```

The AI Prompt app loads skills from both `skills-data.js` (built-ins) and `~/.config/robos/skills.json` (custom/community), groups them by category, and substitutes any `$PARAM` values you fill in before constructing the AI prompt.

---

## System Services

Background services and desktop integration.

### Automation Studio

<img src="{{ '/assets/images/icons/automation-studio.svg' | relative_url }}" alt="" style="width: 32px; height: 32px; vertical-align: middle;"> Create event-driven rules (event → condition → action). Manage scheduled AI agent jobs. View event log.

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/XCpE7CDKDqk"
    title="RobOS Automation Studio — event-driven rules for the whole desktop"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>

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

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1rem 0; border-radius: 8px;">
  <iframe
    src="https://www.youtube-nocookie.com/embed/YkWkw-s75Os"
    title="RobOS Search Index — the invisible plumbing behind @-mentions"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"></iframe>
</div>
