# Story 22-06: On-the-Fly App Builder (Scaffold + Register Electron Apps)

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 8

## Description

The crown jewel of the Desktop Customizer: describe an app in natural language, and the AI builds it — a fully functional Electron app with icon, .desktop file, and registration in the App Launcher.

### How It Works

```
User: /build-app "A Pomodoro timer with 25/5/15 minute intervals,
       a circular progress ring, sound notification when done,
       and session counter"
```

The AI:
1. **Generates** `main.js`, `preload.js`, `renderer/index.html`, `renderer/app.js`, `renderer/style.css`
2. **Creates** an SVG icon matching the RobOS Lucide style (cyan stroke, 48x48)
3. **Creates** a `.desktop` file for the App Launcher
4. **Registers** the app in desktop-manager, robos-icons
5. **Installs** npm dependencies (electron)
6. **Launches** the app for preview
7. **Shows** a before/after in the chat: "Created Pomodoro Timer. [Launch] [Edit Code] [Delete]"

### App Structure

Generated apps follow the exact same structure as all RobOS apps:

```
/usr/local/share/robos/pomodoro-timer/
├── main.js          # Electron main process
├── preload.js       # contextBridge IPC
├── renderer/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── icon.svg         # 48x48 Lucide-style
├── package.json
└── pomodoro-timer.desktop
```

### Iterative Refinement

After building, the user can refine:

```
User: "Make the progress ring thicker and add a dark red color when
       on break mode"
AI: [modifies style.css, updates app.js] Done. [Preview]

User: "Add a keyboard shortcut: Space to start/pause"
AI: [adds event listener] Done.

User: "Actually, delete this app"
AI: [removes files, deregisters] Pomodoro Timer removed.
```

### Safety

- Apps are built in `/usr/local/share/robos/<app-id>/` like all RobOS apps
- A snapshot is taken before the build
- `/restore last` removes the app and deregisters it
- Generated apps run with the same Electron sandbox as all RobOS apps (no nodeIntegration)

## Acceptance Criteria

- [ ] `/build-app "description"` generates a complete Electron app
- [ ] Generated app matches RobOS app conventions (contextBridge, dark theme, debug server)
- [ ] App appears in App Launcher immediately after build
- [ ] User can iteratively refine the app via follow-up prompts
- [ ] User can delete generated apps cleanly
- [ ] Snapshot taken before build; rollback removes the app
- [ ] Generated icon follows RobOS Lucide style
