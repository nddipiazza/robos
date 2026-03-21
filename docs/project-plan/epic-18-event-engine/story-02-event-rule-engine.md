# Story 18-02: Event Rule Engine

**Epic:** [Event Engine & Agent Scheduler](epic.md)
**Status:** Not started
**Points:** 8

## Description

A rule matching engine that subscribes to the Event Bus and evaluates incoming events against user-defined rules. When a rule matches, it executes one or more actions from the Action Registry (story 18-06).

### Rule Model

Rules stored in `~/.config/robos/event-rules.json`:

```json
{
  "id": "rule_001",
  "name": "CI failure notification",
  "enabled": true,
  "trigger": {
    "eventType": "ci_completed",
    "conditions": [
      { "field": "payload.status", "op": "eq", "value": "failure" }
    ]
  },
  "actions": [
    {
      "type": "notify",
      "params": {
        "tier": "critical",
        "category": "ci_cd",
        "title": "CI Failed: {{payload.repo}}",
        "message": "Branch {{payload.branch}} — run #{{payload.runId}}"
      }
    }
  ],
  "cooldown": 0,
  "lastFired": null
}
```

### Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `{"field":"payload.status","op":"eq","value":"failure"}` |
| `neq` | Not equals | `{"field":"payload.env","op":"neq","value":"dev"}` |
| `contains` | String contains | `{"field":"payload.repo","op":"contains","value":"frontend"}` |
| `matches` | Regex match | `{"field":"payload.branch","op":"matches","value":"^fix/"}` |
| `gt` | Greater than | `{"field":"payload.duration","op":"gt","value":300}` |
| `lt` | Less than | `{"field":"payload.duration","op":"lt","value":10}` |
| `exists` | Field exists | `{"field":"payload.reviewer","op":"exists"}` |

All conditions within a rule are AND-combined. Field access supports dot-notation for nested payload fields.

### Template Variables

Action parameters support Mustache-style `{{field}}` interpolation from the event envelope:
- `{{type}}` — event type
- `{{source}}` — event source
- `{{category}}` — event category
- `{{payload.fieldName}}` — any payload field (dot-notation for nested)
- `{{ts}}` — event timestamp

### Cooldown

Optional `cooldown` (in seconds) prevents a rule from firing repeatedly. If set, the rule will not fire again until `cooldown` seconds after `lastFired`. Useful for noisy events like `file_edited`.

### Evaluation Pipeline

1. Event arrives from Event Bus subscription
2. Filter rules by `trigger.eventType` match
3. Evaluate `conditions` against event payload (all must pass)
4. Check cooldown (skip if within cooldown window)
5. Execute all `actions` in order via Action Registry
6. Update `lastFired` timestamp
7. Log rule match to `~/.config/robos/event-log/rule-matches.jsonl`

### Built-in Default Rules

Ship with a set of sensible defaults (user can disable/modify):
- CI failure → critical notification
- PR review requested → warning notification
- PR merged → info notification
- Deploy completed → info notification

## Acceptance Criteria

- [ ] Rule engine subscribes to Event Bus and evaluates all incoming events
- [ ] All 7 condition operators work correctly (eq, neq, contains, matches, gt, lt, exists)
- [ ] Multiple conditions AND-combined within a rule
- [ ] Template variable interpolation works in action parameters
- [ ] Cooldown prevents re-firing within the configured window
- [ ] Actions dispatched to Action Registry (story 18-06)
- [ ] Rule matches logged to `rule-matches.jsonl`
- [ ] Default rules ship for CI failure, PR review requested, PR merged, deploy
- [ ] Rules hot-reloaded when `event-rules.json` changes (fs.watch)
- [ ] Malformed rules logged and skipped without crashing the engine
