---
title: User Personas
layout: default
nav_order: 7
---

# User Personas
{: .no_toc }

RobOS serves four distinct roles. Each sees a different slice of the platform.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Product Owner

### Role
Translates business needs into structured requirements. Reviews staged changes before they reach production.

### Daily Apps

| App | Use |
|:----|:----|
| **Task Manager** | Create epics and stories with AI-assisted breakdown |
| **Dev Central** | Track epic progress, see recently deployed features |
| **Stage Demo Viewer** | Review AI-generated demos of staged changes |

### Key Workflows

**Create structured requirements** — Open Task Manager, describe the business need, and let AI generate a structured requirement with acceptance criteria, scope, and test scenarios.

**AI-generated story breakdown** — Click "AI Breakdown" on an epic. AI reads the repo, proto definitions, and existing code to generate stories with effort estimates.

**Review staged changes** — When a feature reaches staging, Stage Demo Viewer generates an annotated walkthrough showing what changed and how to verify it.

---

## Developer

### Role
Implements tasks with AI assistance through a guided workflow: questionnaire → draft → review → deploy.

### Daily Apps

| App | Use |
|:----|:----|
| **Task Manager** | Pick up tasks, track progress |
| **Workspace Manager** | Auto-provisioned workspace per task |
| **AI Agent Manager** | AI questionnaire, draft, review-fix cycles |
| **Dev Tools** | Install IDEs, CLIs, runtimes |
| **Dev Central** | My tasks, my PRs, work journal |

### Key Workflows

**Pick up a task** — Click "Start Work" in Task Manager. Branch is created, workspace is provisioned, IDE opens at the right location, dev server starts. All automatic.

**AI-assisted implementation** — AI asks clarifying questions (questionnaire), implements the solution (draft), and creates a PR. Developer reviews and approves at every step.

**Zero status updates** — Jira/GitHub status transitions happen automatically via events. No manual board updates needed.

---

## Dev Lead

### Role
Reviews code efficiently with AI-powered context. Makes architecture decisions and approves PRs.

### Daily Apps

| App | Use |
|:----|:----|
| **PR Review Board** | AI summaries, interactive breakpoint review, approve/reject |
| **CI Monitor** | Pipeline status, failure diagnosis |
| **Task Manager** | Architecture decisions, reviewer assignment |
| **Dev Central** | Review queue, team velocity |

### Key Workflows

**AI-assisted review** — PR Review Board shows an AI summary (what changed, why, risk assessment, test coverage). Click "Start the app" to see changes live. Click "Run to breakpoint" to step through code in the IDE.

**One-click approval** — After reviewing, approve with a single click. AI auto-assigns follow-up if changes are requested.

**CI failure diagnosis** — CI Monitor shows AI-categorized failures (test, lint, type, build). One-click suggested fixes.

---

## Manager

### Role
Tracks progress, deployments, and team health without interrupting developers.

### Daily Apps

| App | Use |
|:----|:----|
| **Manager Dashboard** | Sprint board, velocity, per-developer metrics |
| **CI Monitor** | Pipeline health, build times |
| **Task Servers** | Configure Jira/GitHub connections |
| **Workflow Studio** | Define task workflows |
| **Deploy Tracker** | Deployment timeline and KPIs |

### Key Workflows

**Sprint oversight** — Manager Dashboard shows real-time sprint board with cards moving through columns automatically as developers work. No standup needed to know status.

**Deployment tracking** — Deploy Tracker shows every version deployed, which stories were included, and KPIs like deploy frequency and MTTR.

**Team health** — Per-developer metrics show cycle time, review turnaround, and AI utilization. Identify bottlenecks before they become blockers.
