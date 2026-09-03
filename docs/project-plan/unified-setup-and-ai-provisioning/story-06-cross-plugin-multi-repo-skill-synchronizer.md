---
nav_exclude: true
---

# Story 28.06: Cross-Plugin Multi-Repo Skill Synchronizer

**Epic:** Unified Setup Assistant & AI Project Provisioner
**Points:** 8
**Status:** Not started

## Description
Develop a meta-skill (`/add-robos-skill` / `sync-skills`) bundled into all RobOS agent plugins that allows developers or agents to create/modify RobOS skills. The synchronizer is multi-repo aware and automatically propagates and transforms skill definitions across all 4 plugin repositories (`robos-claude-plugin`, `robos-codex-plugin`, `robos-copilot-plugin`, `robos-gemini-plugin`) simultaneously in sync.

## Tasks
- [ ] Implement multi-vendor skill format transformer (converting skill specs between Claude `.claude/commands`, Codex `.agents/skills`, Copilot `.github/copilot-instructions`, and Gemini `.gemini/commands`).
- [ ] Create `/add-robos-skill` sync CLI tool (`robos-skill-sync`).
- [ ] Add GitHub API commit/PR automation to push updated skill definitions simultaneously to `nddipiazza/robos-claude-plugin`, `nddipiazza/robos-codex-plugin`, `nddipiazza/robos-copilot-plugin`, and `nddipiazza/robos-gemini-plugin`.
- [ ] Test synchronized skill propagation and conflict resolution across all 4 repositories.
