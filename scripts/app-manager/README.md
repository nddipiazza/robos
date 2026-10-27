# RobOS App Manager distribution

Windows NSIS and Linux AppImage package the same `packages/app-manager` application. Neither installer contains the suite, Git, a second Node runtime, or game assets. Electron is shared by the manager and all its installed apps. The build enforces a 150 MiB base artifact budget.

```sh
npm install --prefix packages/app-manager
node --test packages/app-manager/test/*.test.cjs
node scripts/app-manager/build.cjs
node scripts/app-manager/publish-catalog.cjs
```

Run builds on the target platform so native npm dependencies match the platform. `build.cjs --linux` also requests AppImage packaging explicitly. `.github/workflows/app-manager.yml` builds the Windows EXE and Linux AppImage and publishes independent app archives and catalogs. It replaces the automatic monolithic Windows EXE release workflow. The old PowerShell suite setup and scripts/windows build scripts remain development/legacy tools.

`publish-catalog.cjs --apps notifications,point-of-sale` builds a limited catalog for distribution debugging. The default builds the catalog from the desktop app declarations, with explicit shared-library dependencies and per-game data archives. App dependency installation occurs on the build worker. End users do not need npm or Git to install apps. Features which invoke external tools still require those tools through Software Center or the operating system.

The version in `VERSION` and `packages/app-manager/package.json` must match. Catalogs and archives are pinned to that version's release URL. Each archive records its SHA-256, compressed and unpacked sizes and dependency IDs. Publish each catalog together with all its archives. Release URLs are restricted to this repository, so a remote catalog cannot redirect installation to an arbitrary publisher. The first installation needs access to GitHub Releases. A saved catalog and installed apps remain available offline.

The component manager downloads and verifies each archive, rejects links and traversal entries, extracts into staging, checks free space, and replaces directories using a recovery journal. Shortcuts and installed state participate in recovery. Cancellation happens between components or before committing the current download. Completed components are retained and reusable after cancellation. Shared components are reclaimed after the final dependent app is removed.

Windows payloads live in `%LOCALAPPDATA%\RobOS\app-manager`; shortcuts live in the current user's `RobOS Apps` Start menu folder. NSIS removes both on uninstall, preserving them on upgrades. Linux uses `~/.local/share/robos/app-manager`, `~/.local/share/robos/RobOS.AppImage` and `~/.local/share/applications/robos-managed-*.desktop`. The manager's uninstall action removes these owned paths, retaining personal app settings. Deleting an AppImage directly cannot invoke an uninstall hook.

The packaged Windows smoke test exercises the real downloader, extraction, renderer, app launcher and Start menu integration against local fixture downloads:

```sh
node scripts/app-manager/smoke.cjs
```

It uses an isolated profile and writes screenshots and a result record to `run/app-manager-smoke/`. Linux UI testing is not required for this change; the shared core and generated GNOME entries are covered by Node tests.

The repository's existing compatibility graph aggregate disagrees with its modular graph packages. The new application registration is stored as a refinement request in `.robos/proposals/app-manager.registration.json`; canonical graph application must follow repair of that existing inconsistency. The package registry, icon registry, diagnostics and app documentation register App Manager independently.
