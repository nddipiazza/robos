---
layout: default
title: Notifications
parent: RobOS App Suite
nav_order: 21
---

# Notifications

> Full notification history viewer — browse, search, and act on all past RobOS system events.

---

## Overview

Notifications is a persistent history panel for all events that have passed through the RobOS notification system. While the [Toast Daemon](robos-toast) handles live pop-up delivery, Notifications stores every event and lets the developer review, filter, and act on them at any time — similar to a notification centre in a mobile OS.

---

## Features

- Chronological list of all notifications with timestamp, severity badge, and message
- Filter by severity (`info`, `warning`, `urgent`) and by app/source
- Search full-text across notification messages
- **Action buttons** — notifications with associated actions (e.g. "Open PR", "View Ticket") remain actionable from history
- Mark notifications as read / unread
- Clear all or clear by category
- Grouped view by day

---

## How to Open

```bash
/usr/local/share/robos/notifications/launch.sh
```

Or click the notification bell icon in the tint2 panel.

---

## Usage

### Browsing notifications

Notifications appear newest-first. Unread items have a blue left border. Click any item to expand the full message.

### Filtering

Use the **Severity** dropdown and the **Source** dropdown to narrow the list. Selections are combined with AND logic.

### Acting on a notification

If a notification has an action button (e.g. **Open PR**), click it to trigger the action. Actions remain available regardless of how old the notification is.

### Clearing history

Click **Clear All** to remove all notifications, or **Clear Read** to remove only read items.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `notification_history_limit` | Maximum number of notifications to retain (default: 500) |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-notifications` | Renderer → Main | Returns notification history (paginated, newest first) |
| `mark-read` | Renderer → Main | Marks one or more notifications as read |
| `clear-notifications` | Renderer → Main | Removes notifications (all or read-only) |
| `execute-notification-action` | Renderer → Main | Triggers the action associated with a notification |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/notifications.json` | Notification history — shared with [Toast Daemon](robos-toast) |
