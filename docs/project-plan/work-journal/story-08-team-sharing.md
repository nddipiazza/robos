---
nav_exclude: true
---

# Story 17-08: Journal Sharing and Team Feed

**Epic:** [RobOS Work Journal](epic.md)
**Status:** Not started
**Points:** 3

## Description

Share your journal with the team via git. View teammates' journals (with their permission). Team activity feed shows what everyone worked on.

### Sharing model
- Journal git repo can have a remote (e.g., private GitHub repo)
- Auto-push at end of day (configurable)
- Team members with read access can view your journal
- Privacy: can mark certain notes as private (not pushed)

### Team feed
- Dev Central shows team activity feed: "Alice merged PR #42", "Bob started US-8"
- Aggregated from team members' journals
- Useful for async standups — no meeting needed

## Acceptance Criteria

- [ ] Journal syncs to remote git repo
- [ ] Private notes excluded from push
- [ ] Team feed shows recent activity from all members
- [ ] Permission model (opt-in sharing)
