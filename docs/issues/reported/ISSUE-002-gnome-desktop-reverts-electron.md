---
layout: default
nav_exclude: true
---

# Issue Specification: GNOME Desktop Switch Automatically Reverts to Electron Desktop

**Issue ID**: `ISSUE-002`  
**Status**: `Triaged`  
**Severity**: `High`  
**Impacted Components**: `packages/desktop-shell`, `desktop-manager`, session watchdog process  
**Date Reported**: `2026-08-26`  

---

## 1. Executive Summary

When switching from the default RobOS Electron full-screen shell to the native GNOME desktop environment, a background session daemon or heartbeat watchdog forces the user back into the Electron desktop environment after exactly 1 minute.

## 2. Problem Description & Impact

- **Observed Behavior**: User selects "Switch to GNOME Desktop" in the session toggle. After ~60 seconds of standard GNOME usage, the display abruptly resets back to the Electron desktop shell.
- **Expected Behavior**: Switching to standard GNOME desktop should maintain that desktop environment until the user explicitly toggles back.
- **User / Developer Impact**: High. Developers cannot comfortably use native GNOME apps or traditional window management.

## 3. Steps to Reproduce

1. Boot VM into RobOS.
2. Select "Switch to GNOME Desktop" from panel or app switcher.
3. Observe native GNOME desktop for 60 seconds.
4. Watch desktop automatically switch back to Electron shell after 1 minute.

## 4. Technical Analysis & Root Cause

- `desktop-manager` or background watchdog daemon maintains an active check / timeout intended to recover from shell crashes.
- The watchdog fails to unregister or detect an intentional session switch, treating native GNOME mode as a failed Electron shell state and invoking fallback restart.

## 5. Proposed Fix Strategy

1. Update session state store in `~/.config/robos/session.json` to record active desktop mode (`electron` vs `gnome`).
2. Update background session watchdog process to check `activeMode` before enforcing shell process survival.
3. Ensure explicit session switch event sends IPC command to pause Electron watchdog timer.

## 6. Acceptance Criteria & Verification

- [ ] Switching to GNOME desktop remains in GNOME mode indefinitely (> 5 minutes).
- [ ] Explicitly selecting "Switch to RobOS Electron Shell" properly returns to Electron mode.
