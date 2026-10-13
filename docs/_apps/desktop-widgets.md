---
title: "Desktop Widgets"
package: desktop-widgets
category: core-desktop
icon: desktop-widgets.svg
summary: "A transparent panel on the right edge of the desktop with five status widgets: active task, system stats, AI agent, work journal and security."
description: "Desktop Widgets shows a 360-pixel overlay refreshed every five seconds. Active task, system stats and the pass and GPG check read real data; the AI agent and journal widgets show placeholder values."
---

Desktop Widgets draws a frameless, transparent window at desktop level (behind other windows, out of the task bar) on the right side of the primary display: 360 pixels wide, starting 40 pixels from the top and 20 from the right edge. Data is pushed to the window every five seconds.

## The five widgets

| Widget | Data | Real or placeholder |
|---|---|---|
| **Active Task** | Contents of `~/.config/robos/active-issue`, or "No active task" | Real |
| **System Resources** | CPU count, memory used and total, root disk use from `df -h /`, load average, uptime in hours | Real |
| **Security & Pass** | Whether `~/.password-store` and `~/.gnupg` exist ("Secured" when both do) | Real check; the key id `0x4F9A2B1C` is a constant |
| **Work Journal & Knowledge Graph** | `knowledge_graph_branch` from `~/.config/robos/settings.json` (default `main`) | The entry count (4) and last-entry text are constants |
| **AI Agent & Quota** | Provider, session count, model and quota | All constants (Claude / Anthropic, 2 sessions, 18 percent) |

There is no sprint, pull request or blocker widget in this package. For those, see [Dev Central]({{ '/apps/dev-central/' | relative_url }}).

## What you do in it

The **Widget Toggles** chips turn widgets on or off, and **Refresh Data** reloads. The on/off state is saved to `~/.config/robos/widgets.json`.

## Running it

[Desktop Manager]({{ '/apps/desktop-manager/' | relative_url }}) starts this app and restarts it if it stops. To run it by hand:

```bash
electron packages/desktop-widgets
```

Set `ROBOS_DEMO_SHOW=1` (or `ROBOS_TEST=1`) to open a normal 900 by 620 window instead of the overlay. The overlay needs X11 and a desktop that honors the `desktop` window type. Source: [`packages/desktop-widgets`](https://github.com/nddipiazza/robos/tree/main/packages/desktop-widgets).
