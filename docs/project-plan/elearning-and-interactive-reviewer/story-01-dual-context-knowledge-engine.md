---
nav_exclude: true
---

# Story 26-01: Dual-Context Knowledge Engine (Prod vs Proposed)

**Epic:** [Dual-Context eLearning & Interactive Reviewer](epic.md)
**Status:** Not started
**Points:** 8

## Description

Extend `packages/context-manager` with explicit tagging and realm partitioning: `realm: prod_reality` (main branch code, deployed release state) vs `realm: proposed_reality` (feature branches, unmerged specs, draft PRs). Ensures AI queries do not confuse unreleased code with active production functionality.

## Acceptance Criteria

- [ ] Context indexer tags chunks with `realm: prod_reality` or `realm: proposed_reality`.
- [ ] AI context retrieval filtering allows querying either realm independently or side-by-side.
- [ ] Prevents context hallucination regarding unreleased feature branches.
