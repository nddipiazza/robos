---
nav_exclude: true
---

# Story 18-03: Automation Studio UI

**Epic:** [Event Engine & Agent Scheduler](epic.md)
**Status:** Not started
**Points:** 8

## Description

A single Electron app (`packages/automation-studio/`) that combines event rule management, scheduled job management, and a real-time event log viewer into three tabs. This replaces what would otherwise be 3 separate apps, keeping the automation surface unified.

### Tab 1: Rules

List, create, edit, and delete event rules (from `~/.config/robos/event-rules.json`).

**Rule list view:**
- Table: name, event type, # conditions, # actions, enabled toggle, last fired timestamp
- Quick enable/disable toggle per rule
- Duplicate and delete actions

**Rule editor (modal or side panel):**
- Event type selector (dropdown of known event types from category mapping)
- Condition builder: add/remove rows, each row has field (text input with autocomplete), operator (dropdown), value (text input)
- Action chain: ordered list of actions, each with type selector (from Action Registry) and parameter form
- Template variable helper: shows available `{{variables}}` for the selected event type
- Cooldown input (seconds, 0 = no cooldown)
- Test button: simulate a sample event and show which rules would match + what actions would fire

**Rule templates:**
- Pre-built rule templates for common scenarios (CI failure alert, PR review reminder, deploy notification)
- "Create from template" button that pre-fills the rule editor

### Tab 2: Scheduled Jobs

Manage cron-based recurring jobs (from story 18-04).

**Job list view:**
- Table: name, schedule (human-readable cron), action summary, next run, last run, status, enabled toggle
- Manual "Run now" button per job

**Job editor (modal or side panel):**
- Name input
- Cron expression builder: visual helper (every X minutes/hours/days, or raw cron expression)
- Action chain: same action editor component as Rules tab
- Enable/disable toggle

### Tab 3: Event Log

Real-time event stream and historical search.

**Live view:**
- Streaming event list (newest at top), auto-scrolls
- Each event shows: timestamp, type badge, source, category icon, payload summary
- Expandable row to see full event JSON
- Pause/resume streaming button

**Historical search:**
- Filter: event type, category, source, time range
- Full-text search across event payloads
- Shows which rules matched each event (from `rule-matches.jsonl`)

**Event detail panel:**
- Full event JSON with syntax highlighting
- List of rules that matched this event
- Actions that were executed

## Acceptance Criteria

- [ ] App launches with 3 tabs: Rules, Scheduled Jobs, Event Log
- [ ] Rules tab: CRUD operations on event rules with condition builder and action chain
- [ ] Rules tab: test button simulates event and shows matching rules/actions
- [ ] Rules tab: rule templates for common scenarios
- [ ] Scheduled Jobs tab: CRUD for cron jobs with visual cron builder
- [ ] Scheduled Jobs tab: "Run now" triggers immediate execution
- [ ] Event Log tab: real-time streaming of events from Event Bus
- [ ] Event Log tab: historical search with type/category/source/time filters
- [ ] Event Log tab: shows matched rules per event
- [ ] App registered in App Launcher, robos-icons, and desktop-manager
- [ ] Follows RobOS dark theme and conventions
