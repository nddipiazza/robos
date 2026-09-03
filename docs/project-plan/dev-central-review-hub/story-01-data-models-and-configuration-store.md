---
nav_exclude: true
---

# Story 29.01: Data Models & Configuration Store

**Epic:** Dev Central — AI Agent Review-Based Development Hub
**Points:** 5
**Status:** Not started

## Description
Establish the underlying JSON configuration and artifact storage models for Dev Central under `~/.config/robos/dev-central/`, including organizations schema, project portfolio graphs, plan review queues, walkthrough artifacts, and swarm telemetry indexes.

## Tasks
- [ ] Define JSON schemas for `organizations.json`, `projects.json`, and `swarms.json` with strict validation (Zod).
- [ ] Create directory structure `~/.config/robos/dev-central/{plans,walkthroughs,logs}` on first boot.
- [ ] Implement data-access layer in `packages/dev-central/main.js` for reading/writing configuration and indexing `.md` artifacts.
- [ ] Expose IPC channels for reading and persisting organization/project state.
