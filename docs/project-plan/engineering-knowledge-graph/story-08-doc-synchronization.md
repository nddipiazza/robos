# Story 08-08: Living Documentation Continuous Synchronization

**Epic:** [EKGraph](epic.md)  
**Status:** **Done**

## Overview
Ensures that the Knowledge Graph (`.robos/knowledge-graph.jsonld`) is constantly maintained by RobOS development skills (`e2e-driven-dev`, `create-robos-app`, `sync-kgraph-docs`). Whenever Knowledge Graph objects are updated (added, altered, or deleted), the AI is prompted to discern any noticeable updates needed across system documentation (`docs/index.md`, `README.md`, `docs/project-plan/`, API specs) and to apply those updates automatically.

## Acceptance Criteria
- [x] Continuous synchronization convention codified in `AGENTS.md`.
- [x] Development skills (`e2e-driven-dev`, `create-robos-app`) updated with KGraph and documentation synchronization steps.
- [x] Dedicated skill `sync-kgraph-docs` added to RobOS Plugin Marketplace and synced to all agent platforms.
- [x] `SDLCKnowledgeGraphStore.discernDocUpdates()` generates structured AI prompts on graph modifications.
- [x] Knowledge Graph Explorer displays interactive Doc Sync Advisory banner with prompt inspection and 1-click sync.
