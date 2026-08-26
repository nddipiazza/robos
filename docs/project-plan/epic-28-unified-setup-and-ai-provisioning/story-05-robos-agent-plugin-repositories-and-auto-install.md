---
nav_exclude: true
---

# Story 28.05: RobOS Agent Plugin Repositories & Auto-Install

**Epic:** Epic 28 (Unified Setup Assistant & AI Project Provisioner)
**Points:** 8
**Status:** Not started

## Description
Establish public GitHub repositories for RobOS AI agent plugins (`nddipiazza/robos-claude-plugin`, `nddipiazza/robos-codex-plugin`, `nddipiazza/robos-copilot-plugin`, `nddipiazza/robos-gemini-plugin`). Update RobOS dev applications (`software-center`, `agents-manager`, `dev-central`) to automatically fetch, install, and update the latest plugin versions on startup.

## Tasks
- [ ] Define standardized RobOS entity plugin schema (Users, Groups, Task Servers, Workspaces, Git Projects).
- [ ] Create repository structures for:
  - `nddipiazza/robos-claude-plugin`
  - `nddipiazza/robos-codex-plugin`
  - `nddipiazza/robos-copilot-plugin`
  - `nddipiazza/robos-gemini-plugin`
- [ ] Implement auto-installer background routine in `packages/agents-manager` to clone/update plugins from GitHub.
- [ ] Expose plugin management and status indicators in `software-center` and `agents-manager`.
