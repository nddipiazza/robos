# Story 31.01: Declarative GitOps SDLC Schema Specification (`.robos/`)

**Epic:** [RobOS — Agent-First Software Lifecycle OS](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

In traditional engineering organizations, SDLC knowledge is scattered across disjointed proprietary SaaS platforms: Jira for tickets, Confluence for architecture docs, Lucidchart for topology diagrams, SwaggerHub for APIs, Workday for team rosters, and proprietary cloud databases for app registries.

RobOS unifies the entire SDLC under a **declarative, version-controlled, GitOps-backed specification** located in `.robos/` at the root of repositories or meta-repositories. Every aspect of the software engineering ecosystem—topology, teams, entity schemas, API contracts, package runtimes, project graphs, and task items—is stored as structured, human-readable, agent-editable files.

### Core Capabilities
- **Standard JSON Schemas**: `topology.schema.json`, `teams.schema.json`, `packages.schema.json`, `projects.schema.json` compliant with JSON Schema 2020-12 drafts.
- **High-Performance GitOps Parser (`GitOpsSDLCParser`)**: Validates full `.robos/` directory trees and produces actionable diagnostic error messages.
- **Scaffold Generator (`initSDLCDirectory`)**: 1-click generation of fully conforming `.robos/` trees.
- **Zero Proprietary Databases**: 100% version-controlled in Git.

---

## 2. Acceptance Criteria

- [x] All `.robos/` files validate cleanly against JSON Schema 2020-12 drafts.
- [x] Schema parser handles missing optional fields gracefully with actionable diagnostic errors.
- [x] Scaffolding `.robos/` directory produces fully conforming template specifications.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/gitops-schema.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/gitops-schema/`.
