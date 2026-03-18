# Story 06-07: AI Review-Fix Cycle Automation

**Epic:** [AI Agent Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

When a PR reviewer requests changes, the agent reads the review comments, implements fixes, and pushes a new commit. Comments on the PR explaining what was changed. Tracks the number of review-fix cycles. If the agent can't address feedback, it flags the developer. Dev Lead can configure max review-fix cycles in workflow config.

## Acceptance Criteria

- [ ] Tested end-to-end with buildbarn-forms example task
- [ ] Agent actions visible in real-time in the UI
- [ ] Task workflow stage advances correctly
