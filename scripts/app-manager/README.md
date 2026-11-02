# RobOS App Manager distribution

Windows NSIS, Ubuntu `.deb`, Linux AppImage and macOS DMG package the same `packages/app-manager` application. The base download contains the manager and one Electron runtime. Apps, their libraries and game assets are separate downloads. The build enforces a 150 MiB base artifact budget.

```sh
cd packages/app-manager
npm install
cd ../..
node --test packages/app-manager/test/*.test.cjs
node scripts/app-manager/build.cjs
node scripts/app-manager/publish-catalog.cjs
```

Run builds on the target platform so native npm dependencies match the platform and CPU. `build.cjs --linux` requests the `.deb` and AppImage explicitly. `.github/workflows/app-manager.yml` builds the Windows EXE, Ubuntu `.deb`, Linux AppImage, and separate Intel and Apple Silicon macOS DMGs, together with independent app archives and catalogs for each OS/CPU. It replaces the automatic monolithic Windows EXE release workflow. The old PowerShell suite setup and scripts/windows build scripts remain development/legacy tools.

Stable publication requires the core unit suite, Windows app-suite regression workflow and every platform build to pass. The publishing job combines the platform artifacts, verifies every archive against its catalog, and writes SHA256SUMS and a source-pinned release manifest. A matching version tag publishes after these gates pass. A `codex/release-*` branch runs the same gates, then uploads everything as invisible drafts with `--draft-only`, so a release can be inspected on GitHub before it goes public. **Resume verified app release**, given that run's ID, then publishes the verified drafts without rebuilding. Merge the version bump to `main` straight after, because the site's links follow `VERSION`. Optional appliance/VM images have a separate manual workflow, `appliance-release.yml`.

Release uploads run serially, pause between writes, honor GitHub rate-limit backoff, and reuse assets only when their size and SHA-256 digest match. Package releases are marked as prereleases so they never become Latest. A draft becomes public only after every release's complete remote asset set verifies, with the main release going public last. Existing tags and releases cannot be repointed to another source revision.

If publication is interrupted after all build/test gates pass, run **Resume verified app release** in GitHub Actions with the original Modular RobOS apps run ID. Recovery checks every original gate, checks out that exact tested source, verifies its saved artifacts again, and uploads only missing files. It does not rebuild binaries or bypass a failed regression check.

`publish-catalog.cjs --apps notifications,point-of-sale` builds a limited catalog for distribution debugging. The default builds the catalog from the desktop app declarations, with explicit shared-library dependencies and per-game data archives. App dependency installation occurs on the build worker. End users do not need npm or Git to install apps. Features which invoke external tools still require those tools through Software Center or the operating system.

The version in `VERSION` and `packages/app-manager/package.json` must match. Catalogs and archives are pinned to their own release for that version, OS and CPU, such as `apps-v0.0.10-linux-x64`. GitHub release assets cannot hold folders, so these releases act as folders and keep the main `v0.0.10` release down to the installers, setup scripts and checksums. Its description links each installer directly. Each archive records its SHA-256, compressed and unpacked sizes and dependency IDs. Publishing replaces hard links with regular files and applies the installer's own archive validation, so an archive the manager would refuse cannot be released. Publish each catalog together with all its archives. Release URLs are restricted to this repository, so a remote catalog cannot redirect installation to an arbitrary publisher. The first installation needs access to GitHub Releases. A saved catalog and installed apps remain available offline.

The component manager downloads and verifies each archive, rejects links and traversal entries, extracts into staging, checks free space, and replaces directories using a recovery journal. Shortcuts and installed state participate in recovery. Cancellation happens between components or before committing the current download. Completed components are retained and reusable after cancellation. Shared components are reclaimed after the final dependent app is removed.

Selection supports one app, multiple apps across groups, or the complete library. Bulk uninstall validates the entire selection before deletion, removes dependents before their prerequisites, retains components required by remaining apps, and uses one confirmation for the batch. Cancellation is handled between component removals, with completed changes saved. **Uninstall all apps** keeps the manager, saved catalog and personal settings; **Uninstall RobOS** removes the manager and all managed apps together. Installed apps can be selected and removed without a catalog or network connection.

Windows payloads live in `%LOCALAPPDATA%\RobOS\app-manager`; shortcuts live in the current user's `RobOS Apps` Start menu folder. NSIS removes both on uninstall, preserving them on upgrades. Linux uses `~/.local/share/robos/app-manager` and `~/.local/share/applications/robos-managed-*.desktop`. The manager's uninstall action removes these owned paths, retaining personal app settings.

The `.deb` is the Ubuntu install. It places the manager in `/opt/RobOS`, its menu entry and sized icons under `/usr/share`, and an AppArmor profile that allows Chromium's sandbox on Ubuntu 24.04 and later. It needs no FUSE. Dock and app-grid state belongs to each user, so the manager applies it on first launch: it pins `robos-app-manager.desktop` once, recording `~/.local/share/robos/dock-pinned` so a later unpin is respected, and places each app it installs in a **RobOS Apps** app-grid folder, listed by app ID because GNOME refreshes category folders from a stale list of new apps. Later launches rewrite entries without touching the folder, so an app the user moves out stays out. These `gsettings` updates never block installation, and they are skipped outside GNOME. **Uninstall RobOS** removes all of this, then uses `pkexec apt-get remove` for the package. If the package is removed with `apt` instead, `TryExec` hides the per-user entries.

Each managed window must match its entry for GNOME to show the right dock icon. `app-host.cjs` therefore fixes the app name as `robos-<id>` before the app's `main.js` runs, which sets the window's class to the entry's `StartupWMClass`, and it ignores any name the app sets later.

The AppImage is the alternative for other Linux desktops. Ubuntu does not ship the FUSE 2 library it needs, so it does not start on a stock Ubuntu without `libfuse2t64`. It copies itself to `~/.local/share/robos/RobOS.AppImage` and writes its own entry. Deleting an AppImage directly cannot invoke an uninstall hook.

macOS payloads live in `~/Library/Application Support/RobOS/app-manager`. Individual launchers are small `.app` bundles in `~/Applications/RobOS Apps`, sharing the manager's Electron runtime. Running the manager from a mounted DMG copies it to `~/Applications/RobOS.app` so these launchers continue to work after ejecting the DMG. The manager's uninstall action removes the managed apps and moves its own application bundle to Trash. Personal settings remain under `~/.config/robos`.

Knowledge Graph Explorer is an app component (`knowledge-graph-explorer`) with source in `packages/robos-graph`. The graph library remains a separate shared component (`robos-graph`), so an app needing graph APIs does not install the Explorer UI.

The packaged smoke test, run on Windows and macOS, exercises the real downloader, extraction, renderer, app launcher and Start menu integration against local fixture downloads. On macOS it also proves the manager copies itself out of the disk image and that app launchers use that copy:

```sh
node scripts/app-manager/smoke.cjs
```

It uses an isolated profile and verifies one app, multiple apps, the complete library, and full RobOS removal, including one confirmation per batch and native shortcut cleanup. Screenshots and a result record are saved to `run/app-manager-smoke/`.

`test-ubuntu-install.sh` proves the Ubuntu result end to end. It installs the built `.deb` in a clean Ubuntu container (`ROBOS_UBUNTU_VERSION`, default 26.04), starts a real headless GNOME Shell with the Ubuntu dock, and drives `smoke-gnome.cjs`. That asks the Shell itself whether App Manager is pinned, whether each app is in the app grid and search with its own icon, whether each running window belongs to its dock entry, and whether uninstalling removes everything. Screenshots are saved to `run/app-manager-gnome-smoke/`. Nothing touches the desktop running the test. It needs Docker and app payloads built with `publish-catalog.cjs`.

`audit-linux.cjs` is the Linux counterpart of the Windows startup audit. Under a display, it installs every catalog app through the real manager into an isolated home, validates each desktop entry and icon, starts each app, and fails if its window has no content, has page errors, misses local resources or carries the wrong window class. Reports are saved to `run/linux-audit/`.

```sh
xvfb-run -a -s "-screen 0 1440x900x24" node scripts/app-manager/audit-linux.cjs
```

The graph node is `urn:robos:desktop-app:app-manager`, applied with `kgraph propose` and `kgraph apply` from `.robos/proposals/app-manager.registration.json` after `.robos/proposals/repair-validation-errors.refinement.json` cleared the repository graph's existing validation errors. The package registry, icon registry, diagnostics and app documentation register App Manager independently.
