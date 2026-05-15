---
nav_exclude: true
---

# Story 17-09: Journal MCP Server

**Epic:** [RobOS Work Journal](epic.md)
**Status:** Not started
**Points:** 3

## Description

MCP server so AI agents can read and write to the journal.

### Tools
- `robos_journal_get_today` — Get today's journal entry
- `robos_journal_get_date` — Get journal for a specific date
- `robos_journal_get_summary` — Get AI-generated standup summary
- `robos_journal_add_note` — Add a manual note
- `robos_journal_get_blockers` — Get current blocking items
- `robos_journal_get_time_breakdown` — Get time spent per task today

### Resources
- `robos://journal/today` — Today's entry
- `robos://journal/blockers` — Current blockers
- `robos://journal/standup` — Standup-formatted summary

### Use cases
- Claude Code asks: "What was I working on?" → reads journal
- AI standup generator reads journal to create daily summary
- AI agent checks blockers before starting work

## Acceptance Criteria

- [ ] AI agent can read today's journal and blockers
- [ ] Agent can add notes to the journal
- [ ] Standup summary available as a resource
