---
title: AI Agent Review-Based Development
layout: default
nav_order: 4
---

# AI Agent Review-Based Development
{: .no_toc }

Inverting the software engineering lifecycle: AI investigates, plans, writes code, and proves with E2E tests — while human developers act as Lead Architects and Reviewers.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Why Agent Review-Based Development?

Traditional AI coding assistants (autocomplete, copilot popups) operate at the level of individual lines of code. This forces developers to spend their day context-switching, reading stack traces, and manually executing test commands.

**RobOS shifts the developer's role from typist to Lead Architect:**

```
Traditional Workflow:
[Developer Investigates Bug] ──▶ [Developer Writes Code] ──▶ [Developer Runs Tests] ──▶ [Developer Files PR]

RobOS Agent Review Workflow:
[AI Agent Investigates & Reproduces] ──▶ [AI Agent Plans Fix] ──▶ [Human Architect Grills & Approves Plan] 
                                                                               │
[1-Click Merge & Deploy] ◀── [Human Reviews Video Proof] ◀── [AI Implements Code & Runs E2E Fabric]
```

---

## The 5-Stage Agent Review Lifecycle

### 1. Task Intake & Breakpoint Reproduction
When a task is picked up (from GitHub Issues, Jira, or Dev Central), the AI agent:
- Provisions an isolated workspace (Git worktree + devcontainer).
- Spawns a dedicated ephemeral Linux user account (e.g. `/home/agent-task-108`) with tmpfs memory mounts.
- Automatically brings the local runtime to a **breakpoint where the issue reproduces** or tests fail.

### 2. Interactive Plan Review (`/grill-me`)
Before writing any application code, the agent formulates a structured technical plan:
- Documents affected contracts (OpenAPI / AsyncAPI), schemas (TypeSpec), and Kubernetes manifests.
- Evaluates the blast radius using the **Dual-State SDLC Knowledge Graph**.
- Engages the human architect in an interactive interview (`/grill-me`) to clarify underspecified requirements and architectural decisions.

### 3. Autonomous Code Implementation & Infrastructure Synthesis
Once the human architect approves the plan:
- The agent implements source code across all polyglot microservices.
- If new databases or queues are required, the agent adds data source nodes in **System Topology (`topology-manager`)**, auto-generating Kubernetes manifests and Helm chart templates.
- Compiles TypeSpec schemas into multi-language DTO packages.

### 4. Headless E2E Test Fabric & Video Proof-of-Work
Rather than simply claiming code works, the agent executes rigorous automated verification:
- Spawns a headless X11 virtual display (`Xvfb`).
- Runs unit tests, API contract validations (Pact / Bruno), and UI end-to-end interactions.
- Records a 1080p text-narrated video walkthrough with synchronized WebVTT subtitles generated via local Piper neural TTS.
- Archives the proof-of-work bundle to `~/.robos/development/walkthroughs/<slug>/`.

### 5. Human Review & 1-Click Approval
The human developer opens **Dev Central** or **PR Review**:
- Reviews the visual diffs and architectural impact on the Knowledge Graph.
- Watches the 30-second narrated video verification.
- Approves and merges with a single click.

---

## Ephemeral Agent Profiles & Zero-Residue Isolation

AI agents in RobOS do not pollute the developer's personal desktop environment. Every agent session runs with full OS-level isolation:

| Dimension | Personal User (`robos`) | AI Agent Session (`agent-task-108`) |
|---|---|---|
| **Home Directory** | Physical Disk (`/home/robos`) | In-Memory `tmpfs` (`/home/agent-...`) |
| **Processes** | Permanent User Session | Auto-terminated on task completion |
| **Display** | Host X11 / Wayland Session | Headless Virtual Framebuffer (`Xvfb`) or Bridged Window |
| **Secrets** | Master GPG Keyring | Scoped, short-lived tokens via Pass Manager |
| **Cleanup** | Persistent | Zero Residue: RAM wiped upon exit |

---

## Tooling & Model Context Protocol (MCP)

RobOS equips all AI coding agents (Claude Code, Google Antigravity, GitHub Copilot CLI, Gemini CLI) with a standardized MCP toolchain:
- **System Topology MCP**: Read and mutate architecture graph nodes and links.
- **Contract Studio MCP**: Validate OpenAPI and TypeSpec specifications.
- **Workspace Manager MCP**: Create and switch Git worktree branches.
- **CI/CD & Kube Studio MCP**: Trigger Kubernetes deployments and stream container logs.
- **Database & REST MCP**: Execute SQL queries and run Bruno REST collections.
