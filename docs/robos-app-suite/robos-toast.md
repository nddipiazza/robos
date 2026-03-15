---
layout: default
title: Toast Daemon
parent: RobOS App Suite
nav_order: 22
---

# Toast Daemon

> Always-running overlay notification engine — delivers borderless toast pop-ups at the top-right corner of the screen.

---

## Overview

The Toast Daemon (`robos-toast`) is a persistent Electron process that runs at login and owns all visual toast notifications on the RobOS desktop. It polls `~/.config/robos/notifications.json` for new entries, spawns a frameless always-on-top overlay window for each toast, stacks multiple toasts vertically, and auto-dismisses them after a configurable timeout. It is the final delivery layer of the RobOS Notification Bus.

---

## Features

- Persistent background process — started at login, never shown in the app switcher
- Watches `notifications.json` via polling (1 s interval); detects new entries by ID set
- Stacks up to N simultaneous toasts in the top-right corner with configurable gap
- Each toast is a frameless, always-on-top Electron `BrowserWindow`
- Severity-coloured left border: `info` = blue, `warning` = amber, `urgent` = red
- Action button support — clicking an action button launches the associated app/URL
- Auto-dismiss timeout: 8 s (`info`/`warning`), persistent until dismissed (`urgent`)
- Toasts slide in with a CSS animation and fade out on dismiss
- New toast IDs added to `knownIds` set so the same notification never pops twice

---

## How to Start

The Toast Daemon is started automatically at login by the autostart entry:

```bash
~/.config/autostart/robos-toast.desktop
```

To start manually:

```bash
/usr/local/share/robos/robos-toast/launch.sh
```

---

## How Notifications Are Published

Any RobOS app (or external script) can publish a notification by appending to `~/.config/robos/notifications.json`:

```json
[
  {
    "id": "unique-id-123",
    "title": "PR Review Needed",
    "body": "PR #42: Add user auth — needs your review",
    "severity": "warning",
    "action": { "label": "Open PR", "url": "https://github.com/..." },
    "timestamp": "2025-01-15T10:30:00Z"
  }
]
```

The daemon picks it up within 1 second and renders the toast.

---

## Toast Layout

```
┌──────────────────────────────┐
│ ▐ PR Review Needed           │  ← title (severity border on left)
│   PR #42: Add user auth…     │  ← body (truncated to 2 lines)
│   [Open PR]  [✕]             │  ← action button + dismiss
└──────────────────────────────┘
  Width: 340px  Height: 90px
```

Multiple toasts stack from the top-right, spaced 8px apart with a 20px screen margin.

---

## Configuration

Constants are hardcoded in `main.js` but can be changed before deployment:

| Constant | Default | Description |
|----------|---------|-------------|
| `TOAST_WIDTH` | 340 | Toast window width (px) |
| `TOAST_HEIGHT` | 90 | Toast window height (px) |
| `TOAST_GAP` | 8 | Vertical gap between stacked toasts (px) |
| `TOAST_MARGIN` | 20 | Margin from screen edge (px) |
| Poll interval | 1000 ms | How often `notifications.json` is checked |

---

## IPC Reference

Toast windows have no renderer → main IPC. The daemon communicates internally between the main process (which spawns toast windows) and each toast's renderer via:

| Channel | Direction | Description |
|---------|-----------|-------------|
| `toast-data` | Main → Renderer | Sends notification payload to a newly created toast window |
| `dismiss-toast` | Renderer → Main | Renderer requests self-dismissal (on ✕ click or timeout) |
| `toast-action` | Renderer → Main | User clicked an action button; main opens URL or launches app |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/notifications.json` | Shared notification store — polled by daemon, written by all apps |
