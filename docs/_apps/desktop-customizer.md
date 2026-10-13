---
title: "Desktop Customizer"
package: desktop-customizer
category: core-desktop
icon: desktop-customizer.svg
summary: "A slash-command console that changes GNOME settings (clock, taskbar, theme, shortcuts, startup apps) and keeps git-backed snapshots to roll back."
description: "Desktop Customizer runs commands such as /theme dark and /move-clock left through gsettings and dconf. Plain-English input is not implemented yet."
---

Desktop Customizer is a command box for the GNOME desktop that RobOS runs on. You type a slash command, and the app calls `gsettings`, `dconf` or edits `~/.config/gtk-3.0/gtk.css`. Type `/help` for the full list.

{: .note }
Input that does not start with `/` only returns a message that natural-language support is "coming soon". Use slash commands.

## Commands

| Command | What it does |
|---|---|
| `/move-clock left`, `center`, `right`, `hide`, `show`, `format 24h`, `show-seconds`, `show-date` | Clock position and format. Position uses the dash-to-panel extension's `clock-position` key. |
| `/taskbar height <px>`, `autohide on|off`, `add-favorite <app-id>`, `remove-favorite <app-id>` | Panel height (dash-to-panel), auto-hide (dash-to-dock) and pinned apps. |
| `/theme dark`, `light`, `accent <color>`, `font-size <px>`, `window-buttons left`, `right`, `css "<rules>"` | Color scheme, accent color (written to `gtk.css`), text scaling, window button side and custom GTK CSS. Re-open apps to see CSS changes. |
| `/shortcut <keys> open <app>`, `list`, `remove <keys>` | Custom GNOME keyboard shortcuts that launch a RobOS app. |
| `/startup list`, `add <app>`, `remove <app>` | Autostart entries in `~/.config/autostart`. |
| `/snapshot save <name>`, `list`, `diff` | Manual snapshots and a diff against the previous one. |
| `/restore last` or `/restore <hash>` | Roll back to a snapshot. |
| `/gsettings get|set <schema> <key> [value]`, `/exec <command>` | Direct access. `/exec` runs any shell command as you. |

## Snapshots

Before `/move-clock`, `/taskbar`, `/theme`, `/shortcut`, `/startup`, `/exec` and `/gsettings`, the app commits a snapshot to a git repository in `~/.config/robos/desktop-snapshots`. A snapshot holds a `dconf dump /`, `~/.config/robos/settings.json`, the GTK 3 and 4 `gtk.css` files and `~/.config/autostart/*.desktop`. Restoring loads the dconf dump with `dconf load /` and copies the CSS back; some changes need a log out. `/snapshot list` shows the 20 most recent.

Command history is saved to `~/.config/robos/desktop-customizer/history.json`.

## Requirements

A GNOME session with `gsettings`, `dconf` and `git` on the `PATH`. Clock position needs the dash-to-panel extension. The commands act on your real desktop, so try `/snapshot save before-experiments` first. Source: [`packages/desktop-customizer`](https://github.com/nddipiazza/robos/tree/main/packages/desktop-customizer).
