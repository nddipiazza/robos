---
layout: default
nav_exclude: true
---

# Issue Specification: Display Resize Does Not Reposition App Menu and Launcher Grid

**Issue ID**: `ISSUE-004`  
**Status**: `Triaged`  
**Severity**: `Medium`  
**Impacted Components**: `packages/desktop-shell`, `app-launcher`, window bounds IPC  
**Date Reported**: `2026-08-26`  

---

## 1. Executive Summary

When screen resolution changes, the popup coordinates and overlay positioning of the App Menu and App Launcher grid remain calculated based on the previous screen resolution, rendering the menu in an offset, off-center, or incorrect screen position.

## 2. Problem Description & Impact

- **Observed Behavior**: Resizing display and opening App Menu displays the launcher grid offset from the App Menu button or floating detached near the center/top left of the screen.
- **Expected Behavior**: App Menu launcher grid automatically recalculates popup coordinates relative to updated taskbar button position and screen width.
- **User / Developer Impact**: Awkward UI misalignment making app launcher look broken after screen resizes.

## 3. Steps to Reproduce

1. Launch RobOS in QEMU VM.
2. Resize host window to alter resolution.
3. Click App Menu launcher button.
4. Observe launcher grid opens in misaligned or incorrect screen coordinates.

## 4. Technical Analysis & Root Cause

- App Launcher positioning logic in `main.js` or preload script caches `display.bounds` at app startup without re-querying `screen.getPrimaryDisplay()` during popup trigger.

## 5. Proposed Fix Strategy

1. Update App Launcher toggle handler to call `screen.getPrimaryDisplay().workArea` dynamically before window `setBounds()` calculation.
2. Re-anchor popup coordinates relative to current taskbar button DOM `getBoundingClientRect()` via IPC.

## 6. Acceptance Criteria & Verification

- [ ] Resizing screen resolution to any dimensions and clicking App Menu opens launcher perfectly aligned beneath/beside App Menu button.
