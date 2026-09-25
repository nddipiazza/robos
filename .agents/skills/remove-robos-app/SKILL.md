---
name: remove-robos-app
description: Remove a RobOS desktop application and cleanly deregister it across all manifests, icons, and configuration.
---

# Remove a RobOS Electron App

Remove a RobOS desktop application and all its registrations.

## Input

$ARGUMENTS — The app-id or app name to remove (e.g. "dev-central" or "Dev Central")

## What to remove

Derive `app-id` if a human name was given: lowercase, spaces to hyphens.

### 1. Delete app directory

Remove `packages/<app-id>/` entirely.

### 2. Remove from `packages/robos-icons/builtin-apps.js` and `packages/robos-icons/builtin-apps-browser.js`

Remove the entry from the `BUILTIN_APPS` array where `appId === '<app-id>'`.

### 3. Update AGENTS.md

Remove the app from the App Suite tables in `AGENTS.md`.

### 4. Remove from cloud-init (if referenced)

Check `infra/desktop/cloud-init/user-data` for any references to the app (e.g. in `favorite-apps` dconf settings) and remove them.

## Validation

- Verify `packages/<app-id>/` no longer exists
- Verify no references remain in `packages/robos-icons/builtin-apps.js`
- Verify no dangling references in cloud-init user-data
