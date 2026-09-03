---
nav_exclude: true
---

# Story 29.03: Organization & Policy Governance

**Epic:** Dev Central — AI Agent Review-Based Development Hub
**Points:** 5
**Status:** Not started

## Description
Provide organization management views within Dev Central, allowing lead developers to manage company spaces, team hierarchies, repository mappings, access credentials, and global AI Agent governance rules (`AGENTS.md`, `GEMINI.md`).

## Tasks
- [ ] Build Organizations and Teams editor UI in `packages/dev-central`.
- [ ] Implement policy editor for global and per-team agent instructions (`AGENTS.md` rules and sandbox execution constraints).
- [ ] Connect credentials to `pass-manager` / GPG store for GitHub and cloud deploy tokens.
- [ ] Provide synchronization mechanism to write policy files across project repositories.
