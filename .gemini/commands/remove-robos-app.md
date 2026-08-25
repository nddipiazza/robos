# Remove a RobOS Electron App

Remove a RobOS desktop application and all its registrations.

## Input

$ARGUMENTS — The app-id or app name to remove (e.g. "dev-central" or "Dev Central")

## What to remove

Derive `app-id` if a human name was given: lowercase, spaces to hyphens.

### 1. Delete app directory

Remove `packages/<app-id>/` entirely.

### 2. Remove from `packages/robos-icons/index.js`

Remove the entry from the `BUILTIN_APPS` array where `appId === '<app-id>'`.

### 3. Update CLAUDE.md

Remove the app from the App Suite tables.

### 4. Remove from cloud-init (if referenced)

Check `infra/desktop/cloud-init/user-data` for any references to the app (e.g. in `favorite-apps` dconf settings) and remove them.

## Validation

- Verify `packages/<app-id>/` no longer exists
- Verify no references remain in `packages/robos-icons/index.js`
- Verify no dangling references in cloud-init user-data
