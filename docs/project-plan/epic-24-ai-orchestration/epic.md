# Epic 24: AI Agent Orchestration — Multi-Agent Teams with Human Oversight

**Status:** Not started
**Priority:** Critical
**Dependencies:** Epic 06 (AI Agent Integration), Epic 18 (Event Engine)
**Inspired by:** [gstack](https://github.com/garrytan/gstack) (Garry Tan's role-switching orchestration), [Paperclip](https://github.com/paperclipai/paperclip) (org charts for AI agent companies)

Full orchestration support for running multiple AI agents in parallel across tasks — with role specialization, budget controls, human approval gates, and a visual command center. RobOS becomes not just an IDE that uses AI, but an operating system where AI agents are first-class employees on your team.

## Why This Changes Everything

gstack proved that one engineer with role-specialized AI prompts can produce 10,000+ lines of production code per day. Paperclip proved you can model an entire company as an org chart of AI agents with budgets, goals, and governance. RobOS is the only platform where both of these ideas live natively in the OS — the agents aren't running in a browser tab or a CLI session, they're integrated into your desktop, your task board, your CI pipeline, and your notification system.

**The gap today:** RobOS has an Agent Manager that starts/stops individual agent sessions. But there's no way to:
- Run 5 agents in parallel across 5 different stories
- Give one agent the "architect" role and another the "implementer" role
- Set a budget ceiling ("spend no more than $50 on this sprint")
- Require human approval before an agent merges a PR
- See a live dashboard of all running agents, their progress, and their spend

This epic fills that gap.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Agent Command Center                 │
│                  (new Electron app)                   │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Org Chart    │  │ Live Feed    │  │ Budget     │  │
│  │              │  │              │  │ Dashboard  │  │
│  │ Architect    │  │ Agent 1: ██░ │  │            │  │
│  │  └ Impl-1    │  │ Agent 2: ███ │  │ $23 / $50  │  │
│  │  └ Impl-2    │  │ Agent 3: █░░ │  │ Sprint cap │  │
│  │ Reviewer     │  │              │  │            │  │
│  │ Tester       │  │ [Approve PR] │  │ ■■■■░░░░░  │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
│                                                       │
│  ┌──────────────────────────────────────────────────┐│
│  │              Agent Role Templates                 ││
│  │  gstack-style: architect, implementer, reviewer   ││
│  │  custom: QA, docs-writer, security-auditor        ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
        │                    │                  │
        ▼                    ▼                  ▼
   Claude Code          gh copilot          Codex/Gemini
   (via CLI)            (via CLI)           (via API)
```

## Core Concepts

### Agent Roles (inspired by gstack)

Each agent session runs with a **role** that shapes its behavior:

| Role | System Prompt Focus | Capabilities |
|------|-------------------|--------------|
| **Architect** | Design decisions, file structure, API contracts | Read code, propose plans, create specs — no code changes |
| **Implementer** | Write code following the architect's plan | Write code, create tests, make PRs |
| **Reviewer** | Code review, find bugs, suggest improvements | Read diffs, leave review comments, approve/reject |
| **Tester** | Write and run tests, verify behavior | Create test files, run test suites, report results |
| **Docs Writer** | Documentation, READMEs, API docs | Write markdown, update docs, no code changes |
| **Security Auditor** | Find vulnerabilities, audit dependencies | Read code, scan deps, flag issues |
| **DevOps** | CI/CD, deployment, infrastructure | Modify workflows, deploy scripts, monitor pipelines |

Users can create custom roles with custom system prompts.

### Org Chart (inspired by Paperclip)

Agents are organized in a hierarchy:

```
Sprint: "BBF Sprint 3"
├── Architect (Claude Opus) — designs all stories, reviews all plans
├── Team Lead (Claude Sonnet) — coordinates implementers, resolves conflicts
│   ├── Implementer-1 (Claude Sonnet) — working BBF-5 Scheduler Form
│   ├── Implementer-2 (Claude Sonnet) — working BBF-6 Browser Form
│   └── Implementer-3 (Codex) — working BBF-8 JSON Export
├── Reviewer (Claude Opus) — reviews all PRs before human approval
└── Tester (Claude Sonnet) — writes integration tests after each merge
```

### Budget Controls

- **Per-sprint budget**: "$50 max for this sprint" — agents pause when budget is hit
- **Per-task budget**: "$10 max per story" — prevents runaway spend on one task
- **Per-agent budget**: "$15 max for Implementer-3" — per-seat cost control
- **Real-time tracking**: Token usage × model pricing, updated live
- **Alerts**: "80% of budget consumed" → notification to human

### Human Approval Gates

Configurable checkpoints where agents pause and wait for human sign-off:

| Gate | When | Default |
|------|------|---------|
| **Plan Approval** | Architect proposes a design | Required |
| **PR Creation** | Implementer wants to create a PR | Optional |
| **PR Merge** | Reviewer approves, ready to merge | Required |
| **Deploy** | CI passes, ready to deploy | Required |
| **Budget Exceeded** | Agent hits budget ceiling | Auto-pause |

### Agent Providers (bring your own)

| Provider | How It Runs | Role Suitability |
|----------|-------------|-----------------|
| Claude Code CLI | `claude` with --system-prompt | All roles |
| GitHub Copilot | `gh copilot` | Implementer, Tester |
| OpenAI Codex | API calls | Implementer |
| Gemini | API calls | Architect, Reviewer |
| Ollama (local) | Local API | Any (no cloud cost) |
| Custom | Any CLI/API | Any |

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Agent Role system — define, assign, and switch roles](story-01-agent-roles.md) | Not started | 5 |
| 02 | [Org Chart — agent hierarchy with delegation](story-02-org-chart.md) | Not started | 5 |
| 03 | [Parallel agent execution — run N agents across N tasks](story-03-parallel-execution.md) | Not started | 8 |
| 04 | [Budget system — per-sprint, per-task, per-agent cost tracking](story-04-budget-system.md) | Not started | 5 |
| 05 | [Human approval gates — configurable pause points](story-05-approval-gates.md) | Not started | 5 |
| 06 | [Agent Command Center app — live dashboard](story-06-command-center.md) | Not started | 8 |
| 07 | [Role templates — gstack-style presets + custom roles](story-07-role-templates.md) | Not started | 3 |
| 08 | [Multi-provider support — Claude, Copilot, Codex, Gemini, Ollama](story-08-multi-provider.md) | Not started | 5 |
| 09 | [Sprint automation — assign stories to agents, run sprint autonomously](story-09-sprint-automation.md) | Not started | 8 |
| 10 | [Agent memory and context handoff between roles](story-10-agent-memory.md) | Not started | 5 |
| 11 | [Marketplace — downloadable team templates](story-11-marketplace.md) | Not started | 5 |
| 12 | [Event Bus integration — agent events flow through RobOS](story-12-event-integration.md) | Not started | 3 |
