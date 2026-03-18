# Story 06-05: AI Draft Stage

**Epic:** [AI Agent Integration](epic.md)
**Status:** Not started
**Points:** 8

## Description

Agent implements the task solution: writes code, creates tests, updates configs. Uses task context + EKGraph + codebase analysis. Creates a summary of all changes with rationale. Generates a PR description. Workflow advances to Human Review when draft is complete. Developer is notified with a link to the diff.

## Acceptance Criteria

- [ ] Tested end-to-end with buildbarn-forms example task
- [ ] Agent actions visible in real-time in the UI
- [ ] Task workflow stage advances correctly
