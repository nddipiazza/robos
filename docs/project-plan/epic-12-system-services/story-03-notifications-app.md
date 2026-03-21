# Story 12-03: Notifications App — Category-Filtered History Viewer

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Notification history viewer with category/tier filtering and a preferences editor. Shows all past notifications in reverse chronological order. Reads from `~/.config/robos/notifications.json` (written by Toast Daemon and robos-notify CLI).

### Notification List View

Each notification entry displays:
- Category icon + tier badge (color-coded)
- Timestamp (relative, e.g., "5m ago")
- Source app name
- Title and message body
- Read/unread indicator

### Filtering & Search

- **Category filter**: Checkboxes for pr_review, ci_cd, task, agent, system (multi-select)
- **Tier filter**: Checkboxes for critical, warning, info
- **Date range**: Quick presets (today, last 7 days, last 30 days) + custom range
- **Text search**: Full-text search across title and message

### Badge Counts

- Unread badge count displayed per category in the filter sidebar
- Total unread count exposed via IPC for Desktop Manager system tray icon badge

### Click-to-Navigate

Clicking a notification opens the relevant context:
- PR notifications → Issue Manager or Code Review app at the specific PR
- CI notifications → CI/CD dashboard for the specific run
- Task notifications → Issue Manager at the specific task
- Agent notifications → Agents Manager at the session

### Bulk Actions

- Mark all as read (per category or global)
- Clear all read notifications
- Delete individual notifications

### Preferences Tab

Embedded preferences editor for `~/.config/robos/notification-prefs.json`:
- Category×tier grid with toggles for sound, persistence, and dismiss duration
- Quiet hours start/end time pickers
- DND toggle with status indicator
- Test button: send a sample notification for the selected category×tier

## Acceptance Criteria

- [ ] Shows notifications in reverse chronological order with category icon and tier badge
- [ ] Filter by category (multi-select), tier (multi-select), and date range
- [ ] Full-text search across notification title and message
- [ ] Per-category unread badge counts in sidebar
- [ ] Total unread count exposed via IPC for system tray badge
- [ ] Click-to-navigate opens relevant app context for PR, CI, task, and agent notifications
- [ ] Bulk mark-as-read and clear-read actions work per category and globally
- [ ] Preferences tab edits `~/.config/robos/notification-prefs.json` with live preview
- [ ] Follows RobOS dark theme and conventions
