# Story 31.07: Multi-Repo Project Workspace Orchestrator (Git Worktrees)

**Epic:** [RobOS — Agent-First Software Lifecycle OS](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

In microservice and polyrepo environments, features often touch multiple repositories simultaneously (e.g., updating a backend API contract in `repo-backend` and updating frontend consumption in `repo-frontend`). Managing separate local checkouts, branch alignments, and working directories introduces massive context-switching overhead and disk bloat.

Story 31.07 delivers the **Multi-Repo Project Workspace Orchestrator** (`packages/workspace-manager`), utilizing native **Git Worktrees** for zero-overhead, isolated workspace branching across multi-repo graphs.

### Core Capabilities
- **Multi-Repo Project Dependency Graph**: Configured via `.robos/projects.yaml`.
- **Atomic Multi-Repo Worktree Branching**: Creates coordinated Git worktrees across repositories sharing underlying `.git` object stores in <200ms.
- **Automated IDE Multi-Root Launching**: Generates unified multi-root project files (`.code-workspace` and IntelliJ module sets).
- **Automated Teardown & Port Release**: Cleans up temporary worktrees and frees dev ports cleanly.
- **GitOps Multi-Branch Versioning**: Branch selector and commit state tracking.

---

## 2. Acceptance Criteria

- [x] Creating a task workspace spawns coordinated Git worktrees across 3+ repositories in under 200ms.
- [x] Switching GitOps branches instantly aligns all repositories in the project graph.
- [x] IDE bridge generates multi-root workspace configs for IntelliJ and VS Code.
- [x] Workspace teardown removes temporary directories without affecting main repository object stores.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/workspace-orchestrator.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/workspace-orchestrator/`.
