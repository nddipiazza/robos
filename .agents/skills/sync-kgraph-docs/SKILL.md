---
name: sync-kgraph-docs
description: Inspect RobOS Knowledge Graph (.robos/knowledge-graph.jsonld) object updates, discern noticeable impacts to system documentation, and synchronize docs accordingly.
---

# Sync Knowledge Graph & Living Documentation

Inspect newly added, modified, or removed Knowledge Graph (KGraph) objects and GitOps trees in `.robos/`, discern any noticeable updates required across system documentation, and synchronize documentation accordingly.

## When to Use

Use this skill whenever:
- A new application, microservice, API contract, requirement, BDD scenario, or eLearning course is registered in `.robos/knowledge-graph.jsonld`.
- A feature branch or GitOps configuration (`.robos/topology.yaml`, `.robos/packages.yaml`, `.robos/elearning.yaml`) has been modified.
- The AI prompt advisory is triggered: *"Noticeable updates detected in Knowledge Graph objects. AI prompted to discern documentation updates."*

## Workflow: 3-Step Continuous Documentation Sync

```
┌────────────────────────────────────────────────────────┐
│ 1. Ingest Knowledge Graph Deltas                       │
│    Inspect added/modified nodes in knowledge-graph.jsonld│
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ 2. Discern Noticeable Documentation Impacts            │
│    Identify impacted docs: README.md, docs/index.md,   │
│    docs/project-plan/, specs, and .robos/ GitOps files │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ 3. Apply Synchronized Documentation Updates            │
│    Update markdown files, tables, and architecture     │
│    diagrams to reflect latest graph entities           │
└────────────────────────────────────────────────────────┘
```

### Step 1 — Ingest KGraph Deltas
1. Read `.robos/knowledge-graph.jsonld` (or query via `SDLCKnowledgeGraphStore.query()` / `robos_ekgraph_search`).
2. Identify changed nodes:
   - Microservices (`robos:Microservice`)
   - Contracts (`robos:Contract`)
   - Requirements & BDD Features (`oslc_rm:Requirement`, `robos:Feature`)
   - eLearning Courses (`robos:ELearning`)
   - Teams & Agent Personas (`robos:Team`)

### Step 2 — Discern Noticeable Documentation Impacts
Evaluate whether the entity update introduces or alters:
- User-facing application suites (`AGENTS.md`, `README.md`, `docs/index.md`)
- Architecture topology diagrams or C4 descriptions (`docs/index.md`, `docs/app-development-flow.md`)
- Interactive training curriculums or courses (`.robos/elearning.yaml`, `docs/project-plan/engineering-knowledge-graph/epic.md`)
- API contracts or interface specifications (`specs/contracts/`)

### Step 3 — Apply Documentation Updates
1. Apply concise, accurate updates reflecting the entity's purpose, identifiers, contracts, or links.
2. Ensure GitOps declarative catalogs (`.robos/topology.yaml`, `.robos/elearning.yaml`) remain strictly aligned with `.robos/knowledge-graph.jsonld`.
3. Verify that all links, IDs, and markdown anchors remain valid.
