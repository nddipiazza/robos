---
name: install-source-shortcuts
description: Run RobOS apps from a git clone, and install "RobOS <App> (From Source)" Start menu / GNOME app grid / macOS Applications entries and desktop icons for them on Windows, Linux (GNOME) and macOS, with each app's own icon on the menu entry, desktop icon, taskbar/dock button and window.
---

# Run RobOS Apps From Source & Install "(From Source)" Shortcuts

Every RobOS app is an Electron app in `packages/<app-id>/` of the clone. This skill covers
running them straight from source and installing per-OS launcher shortcuts that do the same.
Each shortcut is named **`RobOS <App> (From Source)`**, so typing "RobOS" in Start menu,
GNOME or Spotlight search finds them, and they never collide with apps installed by
App Manager (`robos-managed-*`) or the release builds.

## Input

`$ARGUMENTS`: a subcommand and options passed straight to the script:
- `install [app-id ...]`: create or refresh shortcuts (every app when no IDs are given)
- `--desktop`: also put an icon on the desktop (kept on later refreshes)
- `--no-install`: skip apps whose dependencies are not installed instead of running `npm install`
- `--dry-run`: print what would be created
- `remove [app-id ...]`: delete what the script created (everything when no IDs are given)
- `list`: show every app, whether its dependencies are installed, and which shortcuts exist

If the user gives no arguments, run `list` first, then ask which apps they want and whether
they want desktop icons too. All ~100 apps on the desktop is rarely what they want.

## Running an app from source (no shortcut)

Prerequisites: Node.js 20+, npm, Git, a desktop session.

```bash
# Any OS: install the package's dependencies once, then start it
cd packages/<app-id>
npm install
npm start            # or: npx electron .
```

```bash
# Linux/macOS helper: npm installs on first run, starts with --no-sandbox etc.
scripts/dev-launch.sh <app-id>
scripts/dev-launch.sh            # lists the app IDs
```

The shortcuts run the same code through `scripts/source-shortcuts/source-host.cjs`, which
gives the window its icon and identity (see below). To launch one by hand exactly as its
shortcut does:

```bash
packages/<app-id>/node_modules/.bin/electron scripts/source-shortcuts/source-host.cjs --app=<app-id>
```

Apps look for shared libraries (`robos-lib`, `robos-ui`, …) in the neighbouring `packages/`
folder first, so nothing else needs installing. Data goes where `npm start` puts it: the
`userData` folder named after the package's `productName`/`name`.

## Installing the shortcuts

```bash
node scripts/source-shortcuts/source-shortcuts.cjs list
node scripts/source-shortcuts/source-shortcuts.cjs install dev-central pr-review --desktop
node scripts/source-shortcuts/source-shortcuts.cjs install          # every app (runs npm install where needed, slow)
node scripts/source-shortcuts/source-shortcuts.cjs install --no-install   # every app that already has node_modules
node scripts/source-shortcuts/source-shortcuts.cjs remove dev-central
node scripts/source-shortcuts/source-shortcuts.cjs remove           # everything it created
```

On Windows run it from PowerShell or Git Bash with the same arguments. The script needs only
Node, plus each app's own Electron (it writes Windows `.lnk` files through Electron, see below).
What it created is recorded in `<RobOS data>/source-shortcuts.json` (`%LOCALAPPDATA%\RobOS`,
`~/.local/share/robos`, `~/Library/Application Support/RobOS`), so `remove` deletes exactly that.
Re-run `install` after moving the clone or changing an app's `icon.png`.

## How each OS gets the right icon everywhere

Icons come from `packages/<id>/icon.png` (256×256, rendered from `icon.svg` by
`scripts/app-manager/render-icons.cjs`). The script builds every format in pure Node
(`scripts/source-shortcuts/icons.cjs`). The **running window** has to claim the same identity
as its shortcut, or the taskbar/dock shows a generic Electron icon in a separate group.
`source-host.cjs` does that before the app's `main.js` runs.

| Surface | Windows | Linux (GNOME) | macOS |
|---|---|---|---|
| Menu entry | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\RobOS (From Source)\RobOS <App> (From Source).lnk` | `~/.local/share/applications/robos-source-<id>.desktop`, grouped in a **RobOS (From Source)** app-grid folder | `~/Applications/RobOS (From Source)/RobOS <App> (From Source).app` |
| Desktop icon (`--desktop`) | Same `.lnk` on the real Desktop (OneDrive-redirected too) | Copy of the entry on the XDG desktop, `chmod 755` + `gio set … metadata::trusted true` | Symlink to the bundle on `~/Desktop` |
| Icon file | `.ico` with 16/20/24/32/40/48/64 px bitmaps + the 256 px PNG in `%LOCALAPPDATA%\Programs\RobOS\icons\source-<id>-<hash>.ico` | hicolor PNGs 16–256 px + `scalable/…svg` named `robos-source-<id>`, then `gtk-update-icon-cache` and `update-desktop-database` | `Contents/Resources/icon.icns` (PNG entries 16–256 px incl. @2x), registered with `lsregister -f` |
| Taskbar / dock identity | Shortcut and process share AppUserModelID `com.rowbose.robos.source.<id>` (`app.setAppUserModelId`, later app calls blocked) | `StartupWMClass=robos-source-<id>` = WM_CLASS / Wayland app_id (`--class=` + `app.setName`, `app.setDesktopName`, later renames blocked) | Bundle ID `com.rowbose.robos.source.<id>`; running tile gets `app.dock.setIcon(icon.png)` |
| Window / Alt+Tab icon | `window.setIcon(<the .ico>)` on every BrowserWindow | `window.setIcon(icon.png)` (Electron's `_NET_WM_ICON` needs a raster) | from the Dock icon |

Lessons that are baked in. Don't undo them:
- **Windows `.lnk` must carry the AppUserModelID.** Only Electron's `shell.writeShortcutLink`
  sets it (`win-lnk.cjs`). `WScript.Shell` cannot. Without it the running window does not
  group with its pinned shortcut and shows electron.exe's icon.
- **Windows `.ico` needs small sizes.** A 256-px-only `.ico` shows as a blank page in Start
  menu search.
- **Windows icon location matters.** Start menu search refuses icons where app-container
  processes may write (all of `AppData\Local` can be granted that); `AppData\Local\Programs` is safe.
- **Windows caches icons by path.** The `.ico` is named by content hash, so a changed icon
  gets a new file instead of a stale cached one.
- **GNOME matches windows by WM_CLASS**, and many apps call `app.setName()` in `main.js`; the host
  pins the name first and ignores later calls.
- **Electron on Linux cannot use an SVG window icon**, so the host passes `icon.png`.
- **macOS limitation:** the bundle's launcher `exec`s the package's Electron, so while running,
  the Dock tile belongs to Electron.app: it shows the app's icon (via `dock.setIcon`) but its
  name/menu bar reads "Electron", and pinning that running tile pins Electron. Pin the
  `(From Source)` bundle from `~/Applications` instead.

## Validation

1. `node --test scripts/source-shortcuts/source-shortcuts.test.cjs` passes.
2. `node scripts/source-shortcuts/source-shortcuts.cjs list` shows the app as `menu` (or `menu+desktop`).
3. Open the app from its menu entry/desktop icon, then check the taskbar/dock button shows the
   app's own icon (not the Electron atom) and groups with the pinned shortcut:
   - Windows: the window's process runs with `--app-user-model-id=com.rowbose.robos.source.<id>`
     (visible in its renderer's command line), and the `.lnk`'s `System.AppUserModel.ID` matches:
     ```powershell
     $f = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\RobOS (From Source)\RobOS <App> (From Source).lnk"
     (New-Object -ComObject Shell.Application).NameSpace((Split-Path $f)).ParseName((Split-Path $f -Leaf)).ExtendedProperty('System.AppUserModel.ID')
     ```
   - GNOME: `xprop WM_CLASS` on the window prints `robos-source-<id>`.
4. `remove` leaves no entry, desktop icon or `source-<id>-*.ico` / `robos-source-<id>.png` behind.

## Troubleshooting

- **Skipped (no dependencies)**: run `npm install` in `packages/<id>` or drop `--no-install`.
- **Windows Start menu search does not list it yet**: indexing can take a minute; the Start
  menu's All list shows it immediately.
- **GNOME shows a gear icon**: run `gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor`,
  then log out and in on Wayland if it persists.
- **Desktop icon on GNOME says "Untrusted"**: right-click → *Allow Launching* (happens if `gio`
  was unavailable).
- `scripts/install-local.sh` is the older, Linux-only way (entries named `robos-<id>.desktop`,
  no icon identity). Its `--uninstall` leaves these `robos-source-*` entries alone.
