# Story 31.08: Task Graph & AI Planning Dispatcher (DAGs, Planning Mode, Proactive Alignment)

**Epic:** [RobOS — Agent-First Software Lifecycle OS](epic.md)  
**Status:** Done  
**Points:** 13  

---

## 1. Overview & Problem Statement

In an Agent-First OS, development workflows invert the traditional pattern. Instead of a human engineer writing code and an AI assisting with auto-completion, the AI Agent investigates the codebase, creates an **Implementation Plan**, and the Human Engineer **probes, refines, and aligns on the plan** before any code is modified.

Story 31.08 connects the task lifecycle into a dependency-aware **Directed Acyclic Graph (DAG)** and integrates **Planning Mode**, **Proactive Human Alignment & Probing**, and **Proof-of-Work Walkthrough Verification** into RobOS Task Planner and Dev Central.

### Core Capabilities
- **Dependency-Aware Task DAG Engine**: Automatically resolves task dependencies, root nodes, parallel task streams, and critical paths based on `.robos/tasks/*.md` YAML frontmatter.
- **Agent Planning Mode Dispatcher**: Dispatches tasks to AI agents under strict Planning Mode constraints, generating structured `implementation_plan.md` specifications before code edits.
- **Proactive Human Alignment & Architectural Interrogation**: Multi-turn probing loops challenging edge cases, validation bounds, rollback strategies, and contract gates grounded in the Knowledge Graph.
- **Automated State Transitions & Review Sign-Off**: Advances tasks from `In Planning` -> `In Review` -> `Executing` -> `Done`.
- **GitOps Multi-Branch Versioning**: Branch selector and commit state tracking.

---

## 2. Acceptance Criteria

- [x] Task graph renders DAG dependencies with blocker badges, parallel streams, and critical path chains.
- [x] Dispatching agents runs in Planning Mode, generating structured implementation plans with proposed file diffs.
- [x] Reviewer can execute interactive alignment sessions, interrogating architectural decisions and edge cases interactively.
- [x] Approved plans advance task state to `Executing` with automated contract and test verification gates.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/task-dispatcher.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/task-dispatcher/`.
