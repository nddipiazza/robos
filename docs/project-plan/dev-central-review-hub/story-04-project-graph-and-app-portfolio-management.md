---
nav_exclude: true
---

# Story 29.04: Project Graph & Multi-App Portfolio Management

**Epic:** Dev Central — AI Agent Review-Based Development Hub
**Points:** 8
**Status:** Not started

## Description
Build project portfolio management enabling lead architects to view and register multiple applications, services, and shared libraries, with automated workspace provisioning and dev-server / test harness mappings.

## Tasks
- [ ] Create Project Catalog grid view displaying registered apps, repo paths, tech stacks, and active branches.
- [ ] Integrate with `.robos/project-graph.json-ld` from Epic 27 to render visual dependency and contract graphs.
- [ ] Implement "Provision Workspace" action linking directly into `workspace-manager` and RobOS IDE (port 63343).
- [ ] Define app runtime definitions (start command, test runner command, snapshot debug ports).
