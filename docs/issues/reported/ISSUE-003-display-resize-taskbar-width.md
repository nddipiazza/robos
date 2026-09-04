---
layout: default
nav_exclude: true
---

# Issue Specification: Display Resize Does Not Properly Resize Top Taskbar

**Issue ID**: `ISSUE-003`  
**Status**: `Triaged`  
**Severity**: `Medium`  
**Impacted Components**: `packages/desktop-shell`, panel CSS, display event listener  
**Date Reported**: `2026-08-26`  

---

## 1. Executive Summary

Resizing the display window or changing screen resolution in QEMU/SPICE/VNC causes the top taskbar / panel to maintain its initial fixed width or fail to recalculate `100vw` / screen bounds, resulting in clipped or short panel dimensions.

## 2. Problem Description & Impact

- **Observed Behavior**: Changing screen resolution (e.g. from 1024x768 to 1920x1080) leaves the top taskbar rendering at its previous width, leaving blank empty space on the right side of the screen.
- **Expected Behavior**: Top taskbar dynamically expands and contracts to match screen width (`100%`) immediately upon resolution change.
- **User / Developer Impact**: Degrades UI aesthetic and obscures right-hand tray widgets (clock, status icons).

## 3. Steps to Reproduce

1. Open VM window in QEMU / SPICE client.
2. Drag window border to resize resolution.
3. Observe top taskbar does not stretch across full screen width.

## 4. Technical Analysis & Root Cause

- Taskbar renderer process relies on fixed pixel width stored during initial window load or lacks a `window.addEventListener('resize', ...)` reflow trigger.
- Panel CSS uses static `width` setting instead of `width: 100%` or flexible flexbox layout.

## 5. Proposed Fix Strategy

1. Update taskbar panel stylesheet to ensure `width: 100vw` / `width: 100%` with `box-sizing: border-box`.
2. Add Electron `screen.on('display-metrics-changed', ...)` handler in main process to emit IPC `panel-reflow` event to top taskbar window.

## 6. Acceptance Criteria & Verification

- [ ] Resizing QEMU / SPICE window instantly updates taskbar to span 100% screen width without visual gaps or clipping.
