# RobOS Project Plan

## Release: v1.0 — RobOS AI-Assisted Engineering OS

17 epics, 111 stories, ~480 story points. Stories are intentionally small so AI agents can work on them in parallel.

## Epic Overview

| # | Epic | Stories | Status | Dependencies |
|---|------|---------|--------|-------------|
| 01 | [Desktop Foundation](epic-01-desktop-foundation/epic.md) | 8 | **Done** | — |
| 02 | [App Framework](epic-02-app-framework/epic.md) | 7 | **Done** | Epic 01 |
| 03 | [Dev Tools](epic-03-dev-tools/epic.md) | 5 | **Done** | Epic 02 |
| 04 | [Task Management](epic-04-task-management/epic.md) | 8 | Not started | Epic 02 |
| 05 | [Workspace Management](epic-05-workspace-management/epic.md) | 6 | Not started | Epic 04 |
| 06 | [AI Agent Integration](epic-06-ai-agent-integration/epic.md) | 8 | Not started | Epic 04, 05 |
| 07 | [Code Review & CI/CD](epic-07-code-review-ci/epic.md) | 6 | Not started | Epic 04, 06 |
| 08 | [Engineering Knowledge Graph](epic-08-ekgraph/epic.md) | 6 | Not started | Epic 02 |
| 09 | [Voice & Input](epic-09-voice-input/epic.md) | 4 | Not started | Epic 02 |
| 10 | [Management & Reporting](epic-10-management-reporting/epic.md) | 4 | Not started | Epic 04, 07 |
| 11 | [Release & Packaging](epic-11-release-packaging/epic.md) | 5 | Not started | All |
| 12 | [System Services & Desktop Integration](epic-12-system-services/epic.md) | 7 | Not started | Epic 02 |
| 13 | [Security & Authentication](epic-13-security-auth/epic.md) | 5 | Not started | Epic 02 |
| 14 | [Developer Experience & Testing](epic-14-developer-experience/epic.md) | 4 | Not started | Epic 02 |
| 15 | [First-Class MCP Server Support](epic-15-mcp-servers/epic.md) | 11 | Not started | Epic 02 |
| 16 | [App Test Framework](epic-16-test-framework/epic.md) | 8 | Not started | Epic 02 |
| 17 | [Work Journal](epic-17-work-journal/epic.md) | 9 | Not started | Epic 04, 12 |

## Dependency Graph

```
Epic 01 (Desktop Foundation) ✓
  └── Epic 02 (App Framework) ✓
        ├── Epic 03 (Dev Tools) ✓
        ├── Epic 08 (EKGraph)
        ├── Epic 09 (Voice & Input)
        ├── Epic 12 (System Services)
        ├── Epic 13 (Security & Auth)
        ├── Epic 14 (Dev Experience & Testing)
        ├── Epic 15 (MCP Servers) ← AI-first infrastructure
        ├── Epic 16 (Test Framework) ← build with confidence
        └── Epic 04 (Task Management)
              ├── Epic 05 (Workspace Management)
              │     └── Epic 06 (AI Agent Integration)
              │           └── Epic 07 (Code Review & CI/CD)
              └── Epic 10 (Management & Reporting)
                    └── Epic 11 (Release & Packaging)
```

## Parallelization

Once Epic 02 is done (it is), the following epics can be worked on **in parallel** by separate agents:

- Epic 04 (Task Management)
- Epic 08 (EKGraph)
- Epic 09 (Voice & Input)
- Epic 12 (System Services)
- Epic 13 (Security & Auth)
- Epic 14 (Dev Experience & Testing)
- Epic 15 (MCP Servers)
- Epic 16 (Test Framework)

Within each epic, stories are small enough that multiple agents can work on them simultaneously when there are no intra-epic dependencies.

## Story Status Key

- **Done** — Implemented and deployed
- **In Progress** — Currently being worked on
- **Not started** — Ready to begin when dependencies met
