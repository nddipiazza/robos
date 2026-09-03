---
nav_exclude: true
---

# Story: Proof of Work Interactive Verification Flow

**Epic:** [RobOS Desktop Agents](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Implement the "Proof of Work" state machine transition. Upon task completion, the agent enters `AWAITING_PROOF_VERIFICATION`, positions desktop applications (Chromium running live app + Terminal showing passing tests), highlights verification steps on the sidebar, and alerts the host user for interactive review and approval.

## Acceptance Criteria

- [x] Agent transitions to `AWAITING_PROOF_VERIFICATION` upon task completion
- [x] Agent automatically arranges desktop windows to display working solution and passing test runner
- [x] Toast notification alerts host user with "Review Proof of Work" action button
- [x] Host user can test app interactively or approve PR with one click
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/desktop-agents/proof-of-work.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/proof-of-work/`.
