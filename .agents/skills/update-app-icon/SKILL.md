---
name: update-app-icon
description: Replace or create the 48x48 Lucide-style SVG icon for a RobOS desktop application and sync it to icon registries.
---

# Update a RobOS App Icon

Replace the SVG icon for a RobOS desktop application.

## Input

$ARGUMENTS — `<app-id-or-name>` optionally followed by a description of the desired icon (e.g. "Git Projects a branching tree" or "dev-central")

## What to update

Derive `app-id` if a human name was given: lowercase, spaces to hyphens.

### 1. Generate new icon SVG

Create a 48x48 SVG icon in Lucide style:
- `viewBox="0 0 24 24"` (Lucide standard, rendered at 48x48 via width/height)
- `fill="none"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- Pick a stroke color from the RobOS palette:
  - `#00bcd4` (cyan), `#3b82f6` (blue), `#22c55e` (green)
  - `#7c3aed` (purple), `#ec4899` (pink), `#f97316` (orange)
  - `#eab308` (yellow), `#ef4444` (red), `#14b8a6` (teal), `#8b949e` (gray)
- Use simple, recognizable shapes that convey the app's purpose
- Keep path data concise — Lucide icons are minimal by design

### 2. Write `packages/<app-id>/icon.svg`

Replace the file contents with the new SVG.

### 3. Update `packages/robos-icons/builtin-apps.js` and `packages/robos-icons/builtin-apps-browser.js`

Update the `iconSvg` field in the `BUILTIN_APPS` entry for this app-id. The value must exactly match the content of `icon.svg`.

## Validation

- Verify `packages/<app-id>/icon.svg` is valid SVG
- Verify `packages/robos-icons/builtin-apps.js` entry matches the file
- The SVG should render well at both 48x48 (launcher grid) and 16x16 (taskbar) sizes
