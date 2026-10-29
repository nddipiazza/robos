---
title: "Toast Daemon"
package: robos-toast
category: core-desktop
icon: robos-toast.svg
summary: "Shows overlay toast windows for new entries in ~/.config/robos/notifications.json, with tiers, categories, do-not-disturb and anti-spam limits."
description: "Watches the notifications file that robos-notify and other apps write to, and displays a stack of toast windows. A console window edits the settings and can simulate alerts."
---

The Toast Daemon turns entries in `~/.config/robos/notifications.json` into on-screen toasts. Anything that appends an entry with `read: false` and a new `id` triggers one, for example `robos-notify` from [RobOS CLI Tools]({{ '/apps/robos-cli/' | relative_url }}) or the lock notice from [Pass Manager]({{ '/apps/pass-manager/' | relative_url }}).

## Behavior

- **Categories** are `pr_review`, `ci_cd`, `task`, `agent`, `security` and `system`. Event names such as `ci_failed` or `pass_locked` map to a category.
- **Tiers** are `critical`, `warning`, `info` and `security`. By default `critical` and `security` toasts stay until dismissed, `warning` fades after 12 seconds and `info` after 5.
- **Stack.** Up to 5 toasts are visible (default), 380 px wide, in a corner chosen in settings (default `top-right`).
- **Do Not Disturb.** Non-critical toasts are suppressed. Critical, security and sticky ones are queued and shown when DND ends.
- **Quiet hours** (default 22:00 to 07:00, off by default) and an **anti-spam** limiter: a 30 second cooldown for repeats, at most 4 toasts per 10 seconds, and dropping exact duplicates. Critical and security alerts bypass the limiter by default.
- A toast with an `open-app` action asks the desktop manager to launch that app, through the socket named by `ROBOS_DM_SOCKET` or `/tmp/robos-dm-<uid>.sock`. If the action has an `open` object (for example `{ "section": "config_sync", "tab": "vault" }`), it is first written to `~/.config/robos/open-requests/<app>.json` (`robos-lib/open-request.js`) so the app opens at that place; RobOS Preferences reads it when it starts or comes to the front.

The delivery-mode setting (**Smart Dual**, **RobOS Rich Toasts Only**, **Ubuntu GNOME Native Only**, **Both Always**) only controls whether this daemon shows its overlay. In native-only mode it suppresses overlay toasts. The daemon does not itself send GNOME notifications; `robos-notify` does that with `notify-send` when it is installed.

## The console window

**RobOS Toast Notification Console** has the tabs **Monitor & Stack**, **Delivery & Dual-Notifications**, **Anti-Spam & Respam**, **Auto-Fade & Timing**, **Position & Appearance**, **Category Matrix**, **Sandbox & Auth Simulator**, and **Event Audit Stream**. The sandbox tab has preset buttons that fire sample toasts (CI build passed, PR review requested, CI pipeline blocked, task assigned, security auth request). Use **Save Preferences** to store settings in `~/.config/robos/notification-prefs.json`, **Reset Defaults** to restore them, and **Dismiss All** to clear the stack.

## Run it

Launch **RobOS Toast Daemon** from the app launcher, or run `npm start` in `packages/robos-toast`. Only one instance runs at a time. Closing the console window does not quit the daemon.
