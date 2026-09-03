---
nav_exclude: true
---

# Story: RobOS Preferences — System-Wide Settings

**Epic:** [System Services & Desktop Integration](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

System-wide settings app. Configure: AI provider credentials (Claude API key, OpenAI API key, Google Gemini key), default IDE, theme preferences, notification settings, keyboard shortcuts, task server defaults, and work journal knowledge graph defaults. Settings stored in `~/.config/robos/settings.json`. Validated with schema. Changes broadcast to other apps via IPC.

## Acceptance Criteria

- [x] Schema-driven preferences configuration across all core SDLC sections (AI, GitHub, IDE, Notifications, Work Journal / Knowledge Graph, System)
- [x] Integrates with other RobOS apps via IPC (`load-settings`, `save-settings`, `get-setting`, `set-setting`)
- [x] Follows RobOS dark theme and desktop conventions
- [x] Runs reliably as a background service and desktop application
- [x] Verified with automated E2E tests (`packages/robos-test/tests/robos-preferences/e2e.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-preferences/`.
