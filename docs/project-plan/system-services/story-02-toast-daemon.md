---
nav_exclude: true
---

# Story: Toast Daemon — Categorized Overlay Notifications

**Epic:** [System Services & Desktop Integration](epic.md)  
**Status:** Done  
**Points:** 8  

## Description

Electron app running as a keep-alive background process. Displays system-wide overlay toast notifications (top-right corner). Other apps send toasts via robos-notify CLI, IPC, or the Event Bus. Supports categorized, tiered notifications with configurable behavior per category×tier combination.

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

## Acceptance Criteria

- [x] Toast daemon starts on login and runs as a background process
- [x] Supports all 5 notification categories with correct event type mapping
- [x] Supports 3 notification tiers with distinct visual and behavioral treatment
- [x] Category×tier preferences loaded from `~/.config/robos/notification-prefs.json`
- [x] Quiet hours suppress sound for non-critical notifications
- [x] DND mode suppresses all toasts, queues critical for later display
- [x] Toasts accept notifications via IPC (from Desktop Manager) and robos-notify CLI
- [x] Click-to-navigate works for at least pr_review and ci_cd categories
- [x] All notifications written to `~/.config/robos/notifications.json` regardless of display
- [x] Follows RobOS dark theme and desktop conventions
- [x] Verified by automated headless E2E assertions (`packages/robos-test/tests/robos-toast/e2e.test.js`) and text-narrated video demonstration in Xvfb.
