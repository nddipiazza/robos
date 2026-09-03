---
nav_exclude: true
---

# Story 29.09: Blocker Radar & Escalation Hub

**Epic:** Dev Central — AI Agent Review-Based Development Hub
**Points:** 5
**Status:** Not started

## Description
Create the Blocker Radar & Escalation Hub to actively detect stalled agents, test failure loops, or unanswered questions (`waiting_for_input`), providing fast in-app resolution modals to unblock agents immediately.

## Tasks
- [ ] Implement background scanner for agent sessions requiring human clarification or permission grants.
- [ ] Display active blockers in Blocker Radar card and sidebar badge.
- [ ] Build quick-resolution modal to submit answers to agent questions without navigating away.
- [ ] Trigger system notifications via `toast-daemon` when high-priority blockers occur.
