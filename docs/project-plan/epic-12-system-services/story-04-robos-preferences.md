# Story 12-04: RobOS Preferences

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

System-wide settings app. Configure: AI provider credentials (Claude API key, GitHub token), default IDE, theme preferences, notification settings, keyboard shortcuts, task server defaults, voice dictation model. Settings stored in ~/.config/robos/settings.json. Validated with schema. Changes broadcast to other apps via IPC.

## Acceptance Criteria

- [ ] Integrates with other RobOS apps via IPC or CLI
- [ ] Follows RobOS dark theme and conventions
- [ ] Runs reliably as a background service (if applicable)
