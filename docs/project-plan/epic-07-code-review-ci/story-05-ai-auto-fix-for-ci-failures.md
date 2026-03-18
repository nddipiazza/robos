# Story 07-05: AI Auto-Fix for CI Failures

**Epic:** [Code Review & CI/CD](epic.md)
**Status:** Not started
**Points:** 5

## Description

When CI fails on an AI-created PR, the agent automatically: reads the failure log, diagnoses the issue (test failure, lint error, type error, build failure), implements a fix, pushes a new commit, and comments on the PR. Configurable: auto-fix can be disabled, or limited to certain failure types.

## Acceptance Criteria

- [ ] Tested with buildbarn-forms GitHub repo
- [ ] Integrates with Task Manager workflow stages
- [ ] Real-time updates (no manual refresh)
