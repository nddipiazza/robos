---
title: "Notifications Center"
package: notifications
category: core-desktop
icon: notifications.svg
summary: "Shows the notification history stored in ~/.config/robos/notifications.json, with filters by category, tier and date, and edits the notification preferences."
description: "Notifications Center reads and edits the notification list and preference files that Desktop Manager and the toast app use. It does not create notifications itself."
---

Notifications Center is the history view behind the tray icon. [Desktop Manager]({{ '/apps/desktop-manager/' | relative_url }}) shows it when you click the tray icon, and the tray tooltip counts the unread entries in the same file.

## Notifications tab

Each entry has a title, body, source app, category, tier, time and read state. Filters across the top:

- Category checkboxes: **PR Review**, **CI/CD**, **Task**, **Agent** and **System**, each with an unread badge.
- Tier checkboxes: **Critical**, **Warning** and **Info**.
- A date menu (**All Time**, **Today**, **Last 7 Days**, **Last 30 Days**) and a **Search notifications...** box.
- **Mark All Read**, **Clear Read** and **Clear All** apply to the whole list. A line shows the unread and total counts.

## Preferences tab

**Save Preferences** writes `~/.config/robos/notification-prefs.json`. The options are the delivery mode (Smart Dual, RobOS Toasts Only, GNOME Native Only, or Both Always), **Enable Anti-Spam deduplication & rate limiting** with a cooldown in seconds (default 15), **Enable quiet hours** with start and end times (default 22:00 to 07:00), and **Enable DND mode**. **Open Toast Notification Console** opens the `robos-toast` app, which also reads this file. This window only stores the values; enforcement is up to the apps that read them.

## Where notifications come from

Any RobOS app sends `{notify: {...}}` to the Desktop Manager socket. Desktop Manager drops a repeat of the same title and body within 3 seconds, adds the entry at the top of `~/.config/robos/notifications.json` and keeps the newest 500. The Dev Central legacy dashboard has its own notifications tab on the same data.

Run it with `electron packages/notifications`. Source: [`packages/notifications`](https://github.com/nddipiazza/robos/tree/main/packages/notifications).
