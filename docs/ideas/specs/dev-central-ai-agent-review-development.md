---
title: "Proposal: Dev Central as an agent review hub"
layout: default
nav_exclude: true
---

# Proposal: Dev Central as an agent review hub
{: .no_toc }

Turn Dev Central from a personal dashboard into the place where you hand goals to agents, review their plans, and watch them work.
{: .fs-6 }

{: .important }
Proposal, not built. The dashboard exists; the agent-facing parts below do not.

## Proposal

- **Goal dispatcher.** Send a high-level goal to an agent with plan-first mode on: the agent must write an implementation plan, with trade-offs, before it changes code.
- **Plan review.** Open the plan, question its assumptions, ask for changes or approve it.
- **Live agent monitor.** A list of running agents and sub-agents with their current tool calls, token budgets and a link into each session.
- **Blocker alerts.** Notify you when an agent needs a decision or a permission.
- **Organization settings.** Shared agent rules (`AGENTS.md`, coding conventions) and the app and service boundaries agents must respect.
- **Proof and sign-off.** A walkthrough with test logs and snapshots, reviewed before the change is merged.

![A manual developer workflow compared with a six-step agent workflow where a human architect approves a plan and reviews a proof video before merge]({{ '/assets/images/agent-review-workflow-comparison.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today.*

## What exists today

- [Dev Central]({{ '/apps/dev-central/' | relative_url }}) (`packages/dev-central`) has tabs for tasks, pull requests, notifications, blockers, standup and activity. It loads your issues, pull requests and review requests (`dc-get-my-issues`, `dc-get-my-prs`, `dc-get-review-requests` in `main.js`).
- A list headed "In code review" shows saved reviews with CI state and an Open Code Review button (`renderer/task-reviews.js`).
- The walkthrough viewer (`renderer/walkthrough-viewer.js`) is wired to `dc-review-get-task-proof`, which returns one hardcoded sample (`TASK-201`).
- `packages/dev-central` has no goal dispatcher, plan review screen or agent monitor.

## Source

Raw note: [`ideas/inbox/dev-central-ai-agent-review-development.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/dev-central-ai-agent-review-development.txt). The earlier long spec is in the git history of this file.
