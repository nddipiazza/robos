---
nav_exclude: true
---

# Story 25-07: Proof of Work Interactive Verification Flow

**Epic:** [RobOS Desktop Agents](epic.md)
**Status:** Not started
**Points:** 5

## Description

Implement the "Proof of Work" state machine transition. Upon task completion, the agent enters `AWAITING_PROOF_VERIFICATION`, positions desktop applications (Chromium running live app + Terminal showing passing tests), highlights verification steps on the sidebar, and alerts the host user for interactive review and approval.

## Acceptance Criteria

- [ ] Agent transitions to `AWAITING_PROOF_VERIFICATION` upon task completion.
- [ ] Agent automatically arranges desktop windows to display working solution and passing test runner.
- [ ] Toast notification alerts host user with "Review Proof of Work" action button.
- [ ] Host user can test app interactively or approve PR with one click.
