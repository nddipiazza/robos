---
nav_exclude: true
---

# Story 29.05: Strategic Goal & Prompt Dispatcher

**Epic:** Dev Central — AI Agent Review-Based Development Hub
**Points:** 8
**Status:** Not started

## Description
Implement the AI Goal & Prompt Dispatcher in Dev Central, empowering lead developers to initiate agent work with Planning Mode enforced, context curation, and `@`-mention typeahead.

## Tasks
- [ ] Embed `<robos-ai-textarea>` widget into the Goal Dispatcher view.
- [ ] Integrate fuzzy `@`-mention typeahead for repositories, files, issues, and schemas (via `search-index`).
- [ ] Support execution mode flags: Planning Mode (Mandatory `implementation_plan.md`), Autonomous `/goal`, and Multi-Agent Swarm.
- [ ] Implement context curation drawer to attach docs, issue links, or EKGraph nodes before dispatching.
