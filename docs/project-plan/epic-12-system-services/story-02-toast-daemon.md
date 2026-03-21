# Story 12-02: Toast Daemon — Categorized Overlay Notifications

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 8

## Description

Electron app running as a keep-alive background process. Displays system-wide overlay toast notifications (top-right corner). Other apps send toasts via robos-notify CLI, IPC, or the Event Bus (Epic 18). Supports categorized, tiered notifications with configurable behavior per category×tier combination.

### Notification Categories

Categories map to SDLC domains. Each event type belongs to exactly one category:

| Category | Event Types |
|----------|-------------|
| `pr_review` | pr_review_requested, pr_review_received, pr_merged |
| `ci_cd` | ci_started, ci_completed, deploy |
| `task` | task_started, task_status_changed |
| `agent` | agent_session |
| `system` | disk_low, service_crash, update_available |

### Notification Tiers

Tiers control notification behavior:

| Tier | Toast Duration | Sound | Badge | Example |
|------|---------------|-------|-------|---------|
| `critical` | Persistent (manual dismiss) | Yes | Yes | CI failure on your PR |
| `warning` | 15 seconds | Yes | Yes | PR changes requested |
| `info` | 5 seconds | No | No | PR merged, CI passed |

### Category×Tier Configuration

User preferences stored in `~/.config/robos/notification-prefs.json`:

```json
{
  "categoryOverrides": {
    "ci_cd": {
      "critical": { "sound": "alert.ogg", "persistent": true },
      "warning": { "sound": "chime.ogg", "persistent": false, "duration": 15000 },
      "info": { "sound": null, "persistent": false, "duration": 5000 }
    }
  },
  "quietHours": { "enabled": true, "start": "22:00", "end": "07:00" },
  "dnd": false
}
```

Each category×tier combo can override: sound file, persistence (manual vs auto-dismiss), dismiss duration, and whether to show at all.

### Quiet Hours & Do Not Disturb

- **Quiet Hours**: Configurable time window where only `critical` tier notifications produce sound; all others are silent but still recorded in notification history
- **DND Mode**: Toggle via system tray or CLI. Suppresses all toasts; notifications still written to history. Critical notifications queue and display when DND is turned off

### Event Bus Integration

When Epic 18 Event Bus is available, the Toast Daemon subscribes to the event bus socket and auto-generates toasts for events matching notification rules. Falls back to direct IPC when the event bus is not running.

### Visual Design

- Dark theme matching RobOS design system (`--bg-card`, `--accent`)
- Category icon in toast header (Lucide icons per category)
- Tier-based border color: critical=red, warning=amber, info=cyan
- Stacking: up to 5 visible toasts, overflow queued
- Click action: navigates to relevant app/context (e.g., click CI failure → open Code Review app)

## Acceptance Criteria

- [ ] Toast daemon starts on login and runs as a background process
- [ ] Supports all 5 notification categories with correct event type mapping
- [ ] Supports 3 notification tiers with distinct visual and behavioral treatment
- [ ] Category×tier preferences loaded from `~/.config/robos/notification-prefs.json`
- [ ] Quiet hours suppress sound for non-critical notifications
- [ ] DND mode suppresses all toasts, queues critical for later display
- [ ] Toasts accept notifications via IPC (from Desktop Manager) and robos-notify CLI
- [ ] Click-to-navigate works for at least pr_review and ci_cd categories
- [ ] All notifications written to `~/.config/robos/notifications.json` regardless of display
- [ ] Follows RobOS dark theme and conventions
