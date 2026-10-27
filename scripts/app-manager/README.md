# RobOS App Manager distribution

Windows NSIS, Linux AppImage and macOS DMG package the same `packages/app-manager` application. The base download contains the manager and one Electron runtime. Apps, their libraries and game assets are separate downloads. The build enforces a 150 MiB base artifact budget.

```sh
cd packages/app-manager
npm install
cd ../..
node --test packages/app-manager/test/*.test.cjs
node scripts/app-manager/build.cjs
node scripts/app-manager/publish-catalog.cjs
```

Run builds on the target platform so native npm dependencies match the platform and CPU. `build.cjs --linux` also requests AppImage packaging explicitly. `.github/workflows/app-manager.yml` builds the Windows EXE, Linux AppImage, and separate Intel and Apple Silicon macOS DMGs, together with independent app archives and catalogs for each OS/CPU. It replaces the automatic monolithic Windows EXE release workflow. The old PowerShell suite setup and scripts/windows build scripts remain development/legacy tools.

Stable publication requires the core unit suite, Windows app-suite regression workflow and every platform build to pass. The publishing job combines the platform artifacts, verifies every archive against its catalog, and writes SHA256SUMS and a source-pinned release manifest. A matching version tag triggers publication; the authorized `codex/release-0.0.9` branch also cuts the initial stable release after these gates pass. Optional appliance/VM images have a separate manual workflow, `appliance-release.yml`.

Release uploads run serially, pause between writes, honor GitHub rate-limit backoff, and reuse assets only when their size and SHA-256 digest match. A draft becomes public only after the complete remote asset set verifies. Existing tags and releases cannot be repointed to another source revision.

If publication is interrupted after all build/test gates pass, run **Resume verified app release** in GitHub Actions with the original Modular RobOS apps run ID. Recovery checks every original gate, checks out that exact tested source, verifies its saved artifacts again, and uploads only missing files. It does not rebuild binaries or bypass a failed regression check.

`publish-catalog.cjs --apps notifications,point-of-sale` builds a limited catalog for distribution debugging. The default builds the catalog from the desktop app declarations, with explicit shared-library dependencies and per-game data archives. App dependency installation occurs on the build worker. End users do not need npm or Git to install apps. Features which invoke external tools still require those tools through Software Center or the operating system.

The version in `VERSION` and `packages/app-manager/package.json` must match. Catalogs and archives are pinned to that version's release URL. Each archive records its SHA-256, compressed and unpacked sizes and dependency IDs. Publish each catalog together with all its archives. Release URLs are restricted to this repository, so a remote catalog cannot redirect installation to an arbitrary publisher. The first installation needs access to GitHub Releases. A saved catalog and installed apps remain available offline.

The component manager downloads and verifies each archive, rejects links and traversal entries, extracts into staging, checks free space, and replaces directories using a recovery journal. Shortcuts and installed state participate in recovery. Cancellation happens between components or before committing the current download. Completed components are retained and reusable after cancellation. Shared components are reclaimed after the final dependent app is removed.

Selection supports one app, multiple apps across groups, or the complete library. Bulk uninstall validates the entire selection before deletion, removes dependents before their prerequisites, retains components required by remaining apps, and uses one confirmation for the batch. Cancellation is handled between component removals, with completed changes saved. **Uninstall all apps** keeps the manager, saved catalog and personal settings; **Uninstall RobOS** removes the manager and all managed apps together. Installed apps can be selected and removed without a catalog or network connection.

Windows payloads live in `%LOCALAPPDATA%\RobOS\app-manager`; shortcuts live in the current user's `RobOS Apps` Start menu folder. NSIS removes both on uninstall, preserving them on upgrades. Linux uses `~/.local/share/robos/app-manager`, `~/.local/share/robos/RobOS.AppImage` and `~/.local/share/applications/robos-managed-*.desktop`. The manager's uninstall action removes these owned paths, retaining personal app settings. Deleting an AppImage directly cannot invoke an uninstall hook.

macOS payloads live in `~/Library/Application Support/RobOS/app-manager`. Individual launchers are small `.app` bundles in `~/Applications/RobOS Apps`, sharing the manager's Electron runtime. Running the manager from a mounted DMG copies it to `~/Applications/RobOS.app` so these launchers continue to work after ejecting the DMG. The manager's uninstall action removes the managed apps and moves its own application bundle to Trash. Personal settings remain under `~/.config/robos`.

Knowledge Graph Explorer is an app component (`knowledge-graph-explorer`) with source in `packages/robos-graph`. The graph library remains a separate shared component (`robos-graph`), so an app needing graph APIs does not install the Explorer UI.

The packaged Windows smoke test exercises the real downloader, extraction, renderer, app launcher and Start menu integration against local fixture downloads:

```sh
node scripts/app-manager/smoke.cjs
```

It uses an isolated profile and verifies one app, multiple apps, the complete library, and full RobOS removal, including one confirmation per batch and native shortcut cleanup. Screenshots and a result record are saved to `run/app-manager-smoke/`. Linux UI testing is not required for this change; the shared core and generated GNOME entries are covered by Node tests.

The repository's existing compatibility graph aggregate disagrees with its modular graph packages. The new application registration is stored as a refinement request in `.robos/proposals/app-manager.registration.json`; canonical graph application must follow repair of that existing inconsistency. The package registry, icon registry, diagnostics and app documentation register App Manager independently.
