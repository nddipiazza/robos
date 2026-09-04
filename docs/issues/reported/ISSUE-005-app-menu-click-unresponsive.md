---
layout: default
nav_exclude: true
---

# Issue Specification: App Menu Button Click Does Nothing / Unresponsive

**Issue ID**: `ISSUE-005`  
**Status**: `Triaged`  
**Severity**: `High`  
**Impacted Components**: `packages/desktop-shell`, `packages/app-launcher`, panel IPC click handler  
**Date Reported**: `2026-08-26`  

---

## 1. Executive Summary

Clicking on the top panel's App Menu button fails to trigger any action or open the application launcher overlay window. The menu button appears completely non-responsive.

## 2. Problem Description & Impact

- **Observed Behavior**: Clicking the App Menu icon/button yields no visible UI response or app grid overlay.
- **Expected Behavior**: Clicking App Menu toggles the searchable App Launcher grid overlay window open/closed instantly.
- **User / Developer Impact**: High. Users cannot launch installed applications from the desktop top panel.

## 3. Steps to Reproduce

1. Boot VM into RobOS desktop.
2. Move cursor to top panel and click the "App Menu" button.
3. Observe no launcher opens and no click feedback occurs.

## 4. Technical Analysis & Root Cause

- Mouse event on the App Menu button may be blocked by an invisible click-shield / transparent window overlay (`pointer-events: none` missing).
- Alternatively, `ipcRenderer.invoke('toggle-app-launcher')` listener in `desktop-manager` / `main.js` is unhandled, failing silently due to broken IPC channel registration.

## 5. Proposed Fix Strategy

1. Inspect IPC channel binding between panel renderer and `desktop-manager` main process for `toggle-app-launcher`.
2. Ensure top panel overlay window sets `setIgnoreMouseEvents(true, { forward: true })` on non-interactive regions so clicks pass through properly to the button.
3. Add click feedback micro-animation and error logging on IPC invocation.

## 6. Acceptance Criteria & Verification

- [ ] Clicking App Menu button reliably opens the App Launcher grid.
- [ ] Clicking App Menu button again closes the App Launcher grid.
