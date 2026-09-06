# Story 31.10: End-to-End Agent-First SDLC Walkthrough & Test Suite (Acme Petshop & Hermetic Gitea Forge)

**Epic:** [RobOS — Agent-First Software Lifecycle OS](epic.md)  
**Status:** Done  
**Points:** 13  

---

## 1. Overview & Problem Statement

To prove that the 8 pillars of modern software development work together seamlessly across the RobOS desktop apps and autonomous agents, we have constructed an end-to-end automated walkthrough and test scenario based on the **Acme Petshop** model problem (Java 21 Spring Boot Backend, React 18 / Node.js Frontend, Reusable Shared TypeSpec/Pact Library) running against a **Hermetic Local Gitea Git Forge & Task Server** without external GitHub dependencies.

### Verified Capabilities
1. **Topology & Team Definition**: Load `.robos/topology.yaml` and `.robos/teams.yaml` for Acme Petshop (`petstore-api`, `petstore-web`, `petstore-common`).
2. **Schema & Contract Authoring**: Author `entities/pet.typespec` and contract in `contracts/petstore-api.openapi.yaml`, compiling Java 21 Jackson DTOs and TypeScript Zod schemas.
3. **Task Planning & Proactive Alignment**: Dispatch task `PET-102` to an AI agent, review implementation plan with proactive architectural probing and alignment, and approve.
4. **Hermetic Git & Workspace Execution**: Agent provisions multi-repo Git worktrees and devcontainers, commits and pushes to the local **Gitea Git Forge** (`http://127.0.0.1:3000/acme-org/petstore-api.git`).
5. **Contract Verification & Full-Desktop Proof Video**: Automated Pact test gate passes (14/14), agent generates proof-of-work walkthrough video of the entire 1920×1080 desktop, and PR is merged in Dev Central.

---

## 2. Walkthrough Flow & Test Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Lead Reviewer (Human)
    participant UI as RobOS Dev Central & Desktop Suite
    participant Forge as Hermetic Gitea Git Forge (Local)
    participant Agent as RobOS Agent Swarm
    participant Env as Multi-Repo Worktree & Devcontainer
    participant Gate as Pact & Contract Verification Gate

    Dev->>UI: Create Acme Petshop Task (PET-102) & Dispatch Goal
    UI->>Forge: Read Topology, Schemas, Contracts from Git
    UI->>Agent: Launch in Planning Mode
    Agent->>UI: Submit implementation_plan.md
    Dev->>UI: Review & Proactive Alignment Session
    Dev->>UI: Approve Implementation Plan
    UI->>Env: Provision Multi-Repo Worktrees & Devcontainers
    UI->>Agent: Execute Plan
    Agent->>Env: Generate Java Spring Boot & React Code
    Agent->>Forge: Git Commit & Push Feature Branch (PET-105-vaccine)
    Agent->>Gate: Run Pact (14/14) & Stoplight Spectral Lint
    Gate-->>Agent: PASSED (100% contracts verified)
    Agent->>Forge: Open Pull Request #42 on Gitea
    Agent->>UI: Submit Proof-of-Work Full-Desktop Walkthrough
    Dev->>UI: Final Code Review & 1-Click Merge Sign-Off
    UI->>Forge: Merge PR #42 to main branch on Gitea
```

---

## 3. Key Capabilities

1. **Acme Petshop 3-Tier Model Problem**:
   - **Backend**: Java 21, Spring Boot 3.3, Maven, PostgreSQL (`petstore-api`).
   - **Frontend**: Node.js 20, React 18, Vite, Tailwind CSS (`petstore-web`).
   - **Common Library**: Shared TypeSpec models (`pet.typespec`), Pact contracts, Protobuf events (`petstore-common`).
2. **Hermetic Gitea Git Forge (`packages/robos-test/lib/gitea-forge.js`)**:
   - Lightweight, zero-config local Git HTTP & REST forge.
   - Executes genuine `git clone`, `git branch`, `git commit`, `git push`, PR creation, and merges offline.
3. **Full-Desktop Proof Video (1920×1080)**:
   - Records the entire RobOS desktop environment capturing the complete user journey across all desktop tools.

---

## 4. Acceptance Criteria

- [x] Complete E2E test runs headlessly in Xvfb with 100% pass rate against the local Gitea Git forge (`packages/robos-test/tests/sdlc-graph/e2e-sdlc-lifecycle.test.js`).
- [x] Contract breaking changes are reliably caught and blocked by the governance gate.
- [x] Real Git operations (clone, branch, push, PR, merge) succeed against the local forge.
- [x] Full-desktop 1920×1080 proof video captures the entire Acme Petshop lifecycle and is archived in `~/.robos/development/walkthroughs/acme-petshop/`.
