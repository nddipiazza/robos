---
nav_exclude: true
---

# RobOS — Agent-First Software Lifecycle OS (Topology, HR, Schemas, Contracts, Apps, Projects, Work Items)

**Status:** Not started
**Priority:** High
**Dependencies:** Task Management, Workspace Management, AI Agent Integration, RobOS Desktop Agents, Contract-Driven Project Graph, Dev Central — AI Agent Review-Based Development Hub

Establishes RobOS as the operating system and desktop suite built specifically for **Agent-First Software Lifecycle Management**. Orchestrates modern generative software engineering by managing System Topology, Human & Agent Personnel, Entity Schemas, API Contracts, Application/Package Lifecycles, Multi-Repo Projects, Work Item/Task Graphs, and Declarative GitOps Storage. Adheres strictly to the **"Reinvent Nothing! Steal from OSS!"** principle by integrating open-source standards (Backstage, TypeSpec, Pact, Buf, Devcontainers, C4 Model, Team Topologies, MCP).

```mermaid
graph TD
    subgraph CorePillars [8 Pillars of Modern SDLC]
        P1[1. System Topology<br/>Backstage / C4 / Cytoscape]
        P2[2. Human & Agent HR<br/>Team Topologies / MCP]
        P3[3. Entity Schemas<br/>TypeSpec / JSON Schema / Buf]
        P4[4. API Contracts<br/>OpenAPI 3.1 / AsyncAPI / Pact]
        P5[5. Apps & Packages<br/>Devcontainers / Mise / Nix]
        P6[6. Dev Projects<br/>Git Worktrees / Multi-Repo]
        P7[7. Task Graph & Goals<br/>DAG Tasks / Planning / Alignment]
        P8[8. Declarative GitOps<br/>.robos/ Storage Single Source of Truth]
    end

    subgraph OSExperience [RobOS Desktop Environment]
        DC[Dev Central Command Hub]
        TopMgr[Topology Manager]
        HRMgr[People & Agent Manager]
        SchemaStd[Entity Schema Studio]
        ContractEng[API Contract Studio]
        PkgMgr[App & Package Manager]
        WSMgr[Workspace Manager]
        AgentEngine[Desktop Agent Swarm & Review Gates]
    end

    P8 --> P1 & P2 & P3 & P4 & P5 & P6 & P7
    P1 & P2 & P3 & P4 & P5 & P6 & P7 --> OSExperience
```

---

## Stories

| # | Story | Status | Points | Focus Area |
|---|-------|--------|--------|------------|
| 01 | [Declarative GitOps SDLC Schema Specification (`.robos/`)](story-01-declarative-gitops-sdlc-schema.md) | **Done** | 8 | Storage & Schema Standard |
| 02 | [System Topology & Catalog Manager (Backstage / C4 Model)](story-02-system-topology-and-catalog-manager.md) | **Done** | 8 | System Architecture & Topology |
| 03 | [Human & Agent Personnel Roster (Team Topologies & MCP)](story-03-human-and-agent-roster-manager.md) | **Done** | 8 | HR, Personnel & Agent Personas |
| 04 | [Entity Schema Studio & Registry (TypeSpec / JSON Schema / Buf)](story-04-entity-schema-studio-and-registry.md) | **Done** | 8 | Data Models & Schemas |
| 05 | [API Contract & Governance Engine (OpenAPI 3.1, AsyncAPI, Pact)](story-05-api-contract-and-governance-engine.md) | **Done** | 13 | API Contracts & Testing |
| 06 | [App, Package & Runtime Manager (Devcontainers, Mise, Nix)](story-06-app-package-and-runtime-manager.md) | **Done** | 8 | Package & Environment Runtimes |
| 07 | [Multi-Repo Project Workspace Orchestrator (Git Worktrees)](story-07-multi-repo-project-workspace-orchestrator.md) | **Done** | 8 | Projects & Workspaces |
| 08 | [Task Graph & AI Planning Dispatcher (DAGs, Planning Mode, Proactive Alignment)](story-08-task-graph-and-ai-planning-dispatcher.md) | **Done** | 13 | Work Items, Tasks & Planning |
| 09 | [Open-Source Ecosystem Adapter Suite (Backstage, Pact, Buf, Devcontainer)](story-09-oss-ecosystem-adapter-suite.md) | **Done** | 8 | OSS Integrations ("Reinvent Nothing") |
| 10 | [End-to-End Agent-First SDLC Walkthrough & Test Suite](story-10-e2e-agent-first-sdlc-walkthrough.md) | **Done** | 13 | E2E Verification & Harness |

---

## Open-Source Technology Mapping ("Re-invent Nothing!")

| SDLC Domain | Open Source Technology / Standard | How RobOS Reuses & Adapts It |
|-------------|-----------------------------------|------------------------------|
| **Topology** | [Backstage Software Catalog](https://backstage.io/), [C4-PlantUML / Structurizr](https://structurizr.com/), [Cytoscape.js](https://js.cytoscape.org/) | Reuses Backstage `catalog-info.yaml` spec and C4 DSL; renders interactive interactive node-link diagrams in Electron using Cytoscape.js. |
| **Human & Agent HR** | [Team Topologies](https://teamtopologies.com/), [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) | Models Stream-aligned, Enabling, Complicated-subsystem, and Platform teams. Agents are assigned explicit roles and MCP skill bundles. |
| **Entity Schemas** | [TypeSpec](https://typespec.io/) (Microsoft), [JSON Schema](https://json-schema.org/), [Buf CLI](https://buf.build/) (Protobuf) | Author domain models in TypeSpec or JSON Schema, auto-generate TypeScript, Java, Python, Go types, Protobuf definitions, and Prisma models. |
| **API Contracts** | [OpenAPI 3.1](https://www.openapis.org/), [AsyncAPI](https://www.asyncapi.com/), [Pact](https://pact.io/) (Consumer-Driven Contracts), [Spectral](https://stoplight.io/open-source/spectral) | Consumer-driven contract testing with Pact; schema linting with Spectral; mock server generation with Prism. |
| **App Packages** | [Development Containers](https://containers.dev/), [Mise](https://mise.jdx.dev/), [Devenv](https://devenv.sh/) / [Nix](https://nixos.org/) | Standard `.devcontainer/devcontainer.json` environment definitions; automated container and runtime provisioning. |
| **Dev Projects** | [Git Worktrees](https://git-scm.com/docs/git-worktree), [Simple-Git](https://github.com/steveukx/git-js), [Nx / Turborepo](https://nx.dev/) | Isolated lightweight branch workspaces without copying directories; project dependency graph resolution. |
| **Work Items / Tasks** | [Beads DAG Task Standard](https://github.com/), [Conventional Commits](https://www.conventionalcommits.org/), Claude/Codex/Copilot/Gemini CLIs | Dependency-aware DAG task execution; Planning Mode interactive alignment & probing; Proof-of-Work walkthrough verifications. |
| **Storage Layer** | [Git](https://git-scm.com/), [libgit2](https://libgit2.org/) | 100% declarative storage in `.robos/`; zero proprietary cloud database dependencies; fully auditable via standard pull requests. |
