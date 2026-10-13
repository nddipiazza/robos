---
title: "Desktop Manager"
package: desktop-manager
category: core-desktop
icon: desktop-manager.svg
summary: "The background process that launches RobOS apps, restarts the ones marked keep-alive, owns the tray icon and listens on a Unix socket."
description: "Desktop Manager keeps a registry of RobOS apps, supervises a few of them, shows an unread-notification tray icon and accepts JSON commands over a Unix socket. Its status window is hidden unless you ask for it."
---

Desktop Manager is infrastructure that other RobOS apps call. You normally do not open it.

{: .warning }
At the current commit `node --check packages/desktop-manager/main.js` fails: line 571 uses `await` inside a callback that is not `async`, so the app cannot start from the repository until that is fixed.

## What it does

- **App registry and launcher.** `main.js` lists the apps (id, label, description, category) and how to start each one: `electron <APP_BASE>/<id>` with `--no-sandbox --disable-gpu --disable-dev-shm-usage`. `APP_BASE` defaults to `/usr/local/share/robos` and can be set with `ROBOS_APP_BASE`.
- **Watchdog.** Every 3 seconds it checks the apps marked `keepAlive` (`notifications`, `robos-toast`, `desktop-widgets`, `git-login-manager` and `robos-desktop`) and restarts any that stopped. A client can pause and resume this per app.
- **Tray icon.** The tooltip shows the unread count from `~/.config/robos/notifications.json`. Clicking the icon opens the [Notifications Center]({{ '/apps/notifications/' | relative_url }}).
- **Pass-lock reminder.** After onboarding is complete, it checks the GPG agent every 15 seconds and posts a sticky "Pass store locked" notification when the password store locks.
- **Socket server.** One JSON message per connection.

## Socket protocol

The socket is at `$ROBOS_DM_SOCKET` if set, otherwise `$XDG_RUNTIME_DIR/robos-dm.sock` (usually `/run/user/<uid>/robos-dm.sock`), with `/tmp/robos-dm-<uid>.sock` as a fallback. It is created with mode `600`. Send one JSON object, then close the write side. These keys are handled:

| Key | Effect |
|---|---|
| `ping` | Replies `{pong: true, time}` |
| `getApps`, `status`, `getUnread`, `listDesktops` | Registry, running processes, unread count, files in `~/.config/robos/desktops/` |
| `launch`, `kill` | Start or stop an app by id |
| `notify` | Add a notification (`title`, `body`, `icon`, `source`, `sticky`, `action`, `category`, `tier`) |
| `pauseKeepAlive`, `resumeKeepAlive` | Control the watchdog for one app id |
| `getVoicePrompts`, `getAppContext`, `voiceDictate` | Hooks used by [RobOS Voice]({{ '/voice-prompt.html' | relative_url }}) |

Example, the same call the built-in "Restart RobOS Taskbar" skill uses:

```bash
node -e "const s=require('net').connect('/run/user/'+process.getuid()+'/robos-dm.sock',()=>{s.write(JSON.stringify({launch:'robos-desktop'}));s.end();});"
```

## Status window

The window has tabs for **Apps & Services**, **Socket IPC Console**, **Notifications** and **Watchdog Supervisor**. It is created hidden and only shown when `ROBOS_DEMO_SHOW=1` or `ROBOS_TEST=1` is set, which is meant for tests and demos.

Source: [`packages/desktop-manager`](https://github.com/nddipiazza/robos/tree/main/packages/desktop-manager).
