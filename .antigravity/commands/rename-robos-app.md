# Rename a RobOS Electron App

Rename a RobOS desktop application, updating all references.

## Input

$ARGUMENTS — `<old-name> <new-name>` (e.g. "Dev Central" "Developer Hub")

## What to update

Derive old and new `app-id` values: lowercase, spaces to hyphens.

### 1. Rename app directory

`mv packages/<old-app-id>/ packages/<new-app-id>/`

### 2. Update files inside the app

- **package.json**: Update `name` field
- **main.js**: Update `app.setName()`, any path references
- **<old-app-id>.desktop** → **<new-app-id>.desktop**: Update `Name=`, `Exec=`, `Icon=`, `StartupWMClass=`
- **preload.js**: Update if the exposed API name matches the old app-id

### 3. Update `packages/robos-icons/index.js`

Update the `appId` and `label` in the `BUILTIN_APPS` entry.

### 4. Update CLAUDE.md

Update the app name in the App Suite tables.

### 5. Update cloud-init (if referenced)

Check `infra/desktop/cloud-init/user-data` for references to the old .desktop filename and update them.

## Validation

- Verify `packages/<old-app-id>/` no longer exists
- Verify `packages/<new-app-id>/` exists with correct contents
- Verify all internal references use the new name
- Verify `packages/robos-icons/index.js` has the updated entry
