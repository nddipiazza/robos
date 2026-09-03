---
nav_exclude: true
---

# RobOS Desktop Customizer — Prompt-Driven Desktop Experience

**Status:** Not started
**Priority:** High
**Dependencies:** Desktop Foundation, App Framework, System Services

A conversational desktop customization app powered by Claude (or compatible LLM) that lets users reshape the entire GNOME desktop experience through natural language prompts and slash commands. Move the clock, resize the taskbar, add widgets, swap languages, build new apps on the fly, replace the desktop with a custom app — all from a single prompt interface.

## Why This Is a Killer Feature

Every Linux desktop requires deep knowledge of `gsettings`, `dconf`, GNOME extensions, CSS overrides, and shell scripting to customize. RobOS Desktop Customizer makes this accessible to anyone who can type a sentence. It's the difference between "search StackOverflow for 45 minutes" and "type what you want and it happens."

More importantly, it can **build new Electron apps on the fly** using the same app framework every RobOS app uses. Want a Pomodoro timer in the taskbar? A stock ticker widget? A custom dashboard for your specific workflow? Just describe it.

## Design Philosophy

> **"We'll let you build anything here, but it can also let you shoot yourself in the foot. Be careful."**

The customizer is explicitly a **power tool**. It gives users full control over their desktop environment, including the ability to break things. Every change is versioned with automatic snapshots, so users can always roll back. But the tool doesn't prevent you from doing something unwise — it warns you and lets you proceed.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Desktop Customizer App                  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │         Prompt Input / Chat Interface         │   │
│  │  > Move the clock to the left side            │   │
│  │  > Add a weather widget to the desktop        │   │
│  │  > Build me a Pomodoro timer app              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ / Commands  │  │  Snapshot    │  │  Preview   │  │
│  │ /move-clock │  │  Manager     │  │  Pane      │  │
│  │ /taskbar    │  │  (git-based) │  │  (live)    │  │
│  │ /widget     │  │              │  │            │  │
│  │ /build-app  │  │  ↻ Rollback  │  │  Before/   │  │
│  │ /language   │  │  ⎘ Compare   │  │  After     │  │
│  │ /startup    │  │  📋 History  │  │            │  │
│  └─────────────┘  └──────────────┘  └───────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │              Execution Engine                  │   │
│  │  gsettings · dconf · GNOME Extensions ·       │   │
│  │  CSS overrides · shell scripts · Electron     │   │
│  │  app scaffolding · .desktop registration      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Slash Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/move-clock` | Reposition the GNOME clock | `/move-clock left` |
| `/taskbar` | Customize taskbar size, position, icons | `/taskbar width 100% position bottom` |
| `/widget` | Add/remove/configure desktop widgets | `/widget add weather --position top-right` |
| `/startup` | Manage startup applications | `/startup add terminal --delay 3s` |
| `/replace-desktop` | Replace the desktop background with a full-screen app | `/replace-desktop dev-central` |
| `/build-app` | Scaffold and build a new Electron app from a description | `/build-app "Pomodoro timer with 25/5 intervals"` |
| `/taskbar-widget` | Create a custom systray/panel widget | `/taskbar-widget "CPU usage bar chart"` |
| `/language` | Mix UI languages across apps and menus | `/language menu:es,en tooltips:en` |
| `/menu` | Customize the app launcher menu | `/menu hide:calculator,fonts group:"Dev" apps:task-board,pr-review` |
| `/theme` | Modify theme colors, fonts, spacing | `/theme accent:#ff6b6b font-size:14px` |
| `/extension` | Install/configure GNOME shell extensions | `/extension install dash-to-dock` |
| `/shortcut` | Create keyboard shortcuts | `/shortcut ctrl+shift+t open:terminal` |
| `/restore` | Roll back to a previous snapshot | `/restore last` or `/restore 2026-04-15-14:30` |

## Safety & Versioning

- **Automatic snapshots** before every change (git-backed in `~/.config/robos/desktop-snapshots/`)
- **Named checkpoints**: user can `/snapshot save "before I break everything"`
- **Diff view**: compare current state against any snapshot
- **One-click rollback**: `/restore last` undoes the most recent change
- **Danger warnings**: destructive commands (replace-desktop, remove extension) show a confirmation with impact description
- **Recovery mode**: if the desktop breaks, a failsafe keybinding (Ctrl+Alt+F2) opens a terminal with `robos-desktop-recover` script

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Desktop Customizer app shell and prompt interface](story-01-app-shell.md) | Not started | 5 |
| 02 | [Snapshot and rollback system (git-backed)](story-02-snapshot-rollback.md) | Not started | 5 |
| 03 | [GNOME settings engine (gsettings, dconf, extensions)](story-03-gnome-engine.md) | Not started | 8 |
| 04 | [Slash commands: clock, taskbar, theme, shortcuts](story-04-slash-commands-desktop.md) | Not started | 5 |
| 05 | [Widget system: add/remove/configure desktop widgets](story-05-widget-system.md) | Not started | 5 |
| 06 | [On-the-fly app builder (scaffold + register Electron apps)](story-06-app-builder.md) | Not started | 8 |
| 07 | [Taskbar widget builder (custom panel applets)](story-07-taskbar-widgets.md) | Not started | 5 |
| 08 | [Language mixing and app menu customization](story-08-language-menu.md) | Not started | 5 |
| 09 | [Startup manager and desktop replacement mode](story-09-startup-replace.md) | Not started | 3 |
| 10 | [LLM integration: Claude-powered conversational customization](story-10-llm-integration.md) | Not started | 8 |
