---
nav_exclude: true
---

# Story 28.01: Onboarding State Guard & Popup Suppression

**Epic:** Epic 28 (Unified Setup Assistant & AI Project Provisioner)
**Points:** 5
**Status:** Not started

## Description
Implement a system-wide onboarding state guard in `robos-lib` (`~/.config/robos/onboarding-completed.json`) and update `desktop-manager`, `git-login-manager`, and `security-setup` to defer all missing-credential popups and notification toasts until the unified onboarding wizard has completed.

## Tasks
- [ ] Create `onboarding-state.js` in `packages/robos-lib` to read/write `~/.config/robos/onboarding-completed.json`.
- [ ] Update `desktop-manager` watchdog to check onboarding state before initiating credential prompts.
- [ ] Suppress background missing-credential toasts in `robos-toast` during onboarding.
- [ ] Expose IPC endpoint `ipcMain.handle('get-onboarding-status')` across RobOS apps.
