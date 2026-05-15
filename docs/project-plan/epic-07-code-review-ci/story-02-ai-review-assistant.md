---
nav_exclude: true
---

# Story 07-02: AI Review Assistant

**Epic:** [Code Review & CI/CD](epic.md)
**Status:** Not started
**Points:** 5

## Description

When opening a PR, AI generates: change summary (what and why), risk assessment (low/medium/high), flagged issues (potential bugs, missing tests, performance concerns), improvement suggestions. Dev Lead can accept/dismiss each finding. AI learns from dismissed findings to improve future reviews.

## Acceptance Criteria

- [ ] Tested with buildbarn-forms GitHub repo
- [ ] Integrates with Task Manager workflow stages
- [ ] Real-time updates (no manual refresh)
