# Story 18-01: Event Bus Service

**Epic:** [Event Engine & Agent Scheduler](epic.md)
**Status:** Not started
**Points:** 8

## Description

Core event bus service that provides a publish/subscribe transport for all RobOS SDLC events. Runs as a background daemon, accepts events from any source, fans out to all subscribers, and persists events to disk for historical queries.

### Transport

- **Unix domain socket**: `/run/user/{uid}/robos-events.sock`
- **Protocol**: NDJSON (newline-delimited JSON) — one JSON object per line
- **Connection model**: Clients connect via Unix socket. Publishers write events, subscribers receive a stream of all events

Why Unix socket + NDJSON (not a message broker): RobOS is a single-user desktop VM. Zero external dependencies, low latency, follows the Desktop Manager IPC pattern from story 12-01.

### Event Envelope

Every event on the bus conforms to this schema:

```json
{
  "id": "evt_<nanoid>",
  "type": "ci_completed",
  "ts": "2026-03-18T14:30:00Z",
  "source": "journal-collector",
  "category": "ci_cd",
  "payload": {}
}
```

- `id`: Unique event ID (nanoid, prefixed `evt_`)
- `type`: Event type string (e.g., `ci_completed`, `pr_merged`)
- `ts`: ISO 8601 timestamp
- `source`: Name of the producing service/app
- `category`: Auto-derived from `type` via category mapping table in `robos-lib`
- `payload`: Event-specific data (arbitrary JSON object)

### Category Mapping

Mapping table maintained in `robos-lib` (shared across all consumers):

| Category | Event Types |
|----------|-------------|
| `pr_review` | pr_review_requested, pr_review_received, pr_merged, pr_opened |
| `ci_cd` | ci_started, ci_completed, deploy |
| `task` | task_started, task_status_changed |
| `agent` | agent_session |
| `system` | disk_low, service_crash, update_available |
| `git` | branch_created, commit, file_edited |
| `journal` | manual_note |

### Persistence

- Events persisted to `~/.config/robos/event-log/{YYYY-MM-DD}.jsonl`
- One file per day, append-only JSONL format
- Retention: 90 days default, configurable in `~/.config/robos/event-bus.json`
- Daily cleanup job removes files older than retention period

### API

Consumers interact via the Unix socket:

- **Publish**: Connect and write an NDJSON line with `{"action":"publish","event":{...}}`
- **Subscribe**: Connect and write `{"action":"subscribe","filter":{"type":"ci_completed"}}` — receives a stream of matching events
- **Query**: Connect and write `{"action":"query","since":"2026-03-18T00:00:00Z","category":"ci_cd","limit":100}` — returns matching historical events

### Startup

- Starts on user login (systemd user unit or autostart `.desktop` entry)
- Creates socket file, begins accepting connections
- Loads category mapping from `robos-lib`
- Recovers gracefully if socket file exists from a previous crash (removes stale socket)

## Acceptance Criteria

- [ ] Event bus daemon starts on login and listens on Unix socket
- [ ] Publishers can emit events via NDJSON over Unix socket
- [ ] Subscribers receive real-time event stream with optional type/category filter
- [ ] All events persisted to daily JSONL files in `~/.config/robos/event-log/`
- [ ] Historical query API returns events filtered by time range, type, and category
- [ ] Category auto-derived from event type via `robos-lib` mapping table
- [ ] Stale socket file cleaned up on startup
- [ ] Event retention enforced (default 90 days)
- [ ] Handles concurrent publishers and subscribers without data loss
