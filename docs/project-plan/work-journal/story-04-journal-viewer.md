---
nav_exclude: true
---

# Story 17-04: Journal Viewer App (Timeline + Detail Views)

**Epic:** [RobOS Work Journal](epic.md)
**Status:** Not started
**Points:** 5

## Description

Electron app to browse the journal. Two views:

### Timeline View
Vertical timeline of the day's events. Each event is a card showing: time, type icon, description, linked task/PR. Click to expand details. Filter by event type. Scroll through days.

### Day Summary View
The rendered markdown for a specific day. Shows: AI summary, task breakdown, PR status, review status, manual notes. Calendar picker to jump to any day.

### Search
Full-text search across all journal entries. Find: "when did I last work on BUG-42?", "show all PRs I merged this week".

### Quick Stats
Sidebar showing: tasks touched today, PRs opened/merged, hours logged, reviews pending.

## Acceptance Criteria

- [ ] Timeline shows events in chronological order
- [ ] Day view renders the markdown journal entry
- [ ] Search works across all historical entries
- [ ] Calendar picker for date navigation
- [ ] Dark theme matching RobOS design system
