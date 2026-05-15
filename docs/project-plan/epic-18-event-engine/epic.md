---
nav_exclude: true
---

# Epic 18: Event Engine & Agent Scheduler

**Status:** Not started
**Priority:** Medium
**Dependencies:** Epic 12 (System Services), Epic 17 (Work Journal)

A unified event bus, rule engine, and automation scheduler that ties together all RobOS SDLC events. Enables event-driven notifications, agent triggers, and custom automation rules — replacing ad-hoc polling with a reactive, user-configurable event system.

## Architecture

```
[Journal Collector] [CI Monitor] [robos-event CLI] [IDE Bridge]
        |                |              |                |
        v                v              v                v
+---------------------------------------------------------------+
|              RobOS Event Bus (story 18-01)                     |
|  Transport: Unix socket /run/user/{uid}/robos-events.sock     |
|  Protocol: NDJSON (newline-delimited JSON)                    |
|  Persistence: ~/.config/robos/event-log/{date}.jsonl          |
+---------------------------------------------------------------+
        |                |                      |
        v                v                      v
  [Toast Daemon]   [Rule Engine]         [Automation Studio]
   (12-02)          (18-02)              (18-03, event log tab)
                        |
               +--------+--------+
               v                 v
        [Send Notification]  [Run Agent/Script]
         (action registry)   (action registry)
```

## Event Envelope Schema

```json
{
  "id": "evt_abc123",
  "type": "ci_completed",
  "ts": "2026-03-18T14:30:00Z",
  "source": "journal-collector",
  "category": "ci_cd",
  "payload": { "runId": 789, "status": "failure", "repo": "my-app", "branch": "fix/bug-42" }
}
```

Category auto-derived from event type via mapping table in `robos-lib`.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Event Bus Service](story-01-event-bus.md) | Not started | 8 |
| 02 | [Event Rule Engine](story-02-event-rule-engine.md) | Not started | 8 |
| 03 | [Automation Studio UI](story-03-automation-studio-ui.md) | Not started | 8 |
| 04 | [Agent Scheduler — Cron Jobs](story-04-agent-scheduler-cron.md) | Not started | 5 |
| 05 | [Agent Scheduler — Event Triggers](story-05-agent-scheduler-events.md) | Not started | 5 |
| 06 | [Pluggable Action Registry](story-06-action-registry.md) | Not started | 5 |
