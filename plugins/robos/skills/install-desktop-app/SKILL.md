---
name: install-desktop-app
description: Install, configure, and register a desktop application, its FreeDesktop .desktop entry, and icon on GNOME Linux, with support for desktop shortcuts, GNOME Shell favorites, icon caching, and validation.
---

# Install Desktop Application & .desktop Icon on GNOME Linux

Standardized skill and automation engine for installing, configuring, and registering desktop applications, `.desktop` launcher entries, and application icons on GNOME Linux (Ubuntu, Debian, Fedora, and RobOS appliance desktops).

Complies with the **FreeDesktop.org Desktop Entry Specification 1.5**, **Icon Theme Specification**, and **GNOME Shell / Desktop Icons NG (DING)** standards.

---

## Architecture Overview

```mermaid
flowchart LR
    subgraph Source ["Application Source"]
        BIN["App Binary / Executable"]
        ICON["App Icon (SVG / PNG)"]
    end

    subgraph Script ["install-desktop-app.sh"]
        VAL["desktop-file-validate"]
        GEN["Generate .desktop"]
    end

    subgraph XDG ["FreeDesktop XDG Layer"]
        XDG_BIN["~/.local/bin/ (Launcher Wrapper)"]
        XDG_ICON["~/.local/share/icons/hicolor/"]
        XDG_APP["~/.local/share/applications/"]
    end

    subgraph Caches ["Caches & Indices"]
        GIC["gtk-update-icon-cache"]
        UDD["update-desktop-database"]
    end

    subgraph GNOME ["GNOME Shell Integration"]
        DESK["~/Desktop/ (GIO metadata::trusted)"]
        DASH["GNOME Dash / Ubuntu Dock (Favorites)"]
        GRID["GNOME App Grid & Search Provider"]
    end

    BIN --> GEN
    ICON --> GEN
    GEN --> VAL
    VAL --> XDG_APP
    ICON --> XDG_ICON
    BIN --> XDG_BIN

    XDG_ICON --> GIC
    XDG_APP --> UDD

    XDG_APP --> DESK
    XDG_APP --> DASH
    XDG_APP --> GRID
    GIC --> GRID
    GIC --> DASH
```

![GNOME Desktop Install Architecture](file:///home/ndipiazza/source/robos/docs/assets/images/gnome-desktop-install-architecture.jpg)

---

## Input

`$ARGUMENTS` — Application details and target options:
- `--app-id <id>` (Required): Unique lowercase kebab-case slug (e.g. `robos-crpg`, `godot-editor`).
- `--name <name>` (Required): Display name (e.g. `"RobOS cRPG: Realm of Heroes"`).
- `--exec <command>` (Required): Executable binary or invocation command line.
- `--icon <path>`: Path to SVG/PNG icon file or theme icon name.
- `--desktop`: Create and trust launchable desktop shortcut in `~/Desktop/`.
- `--favorite` / `--dock`: Pin app to GNOME Shell favorites dock.
- `--path <dir>`: Set working directory (`Path=...`).
- `--categories <list>`: Semicolon-delimited categories (e.g. `"Game;RolePlaying;"`).
- `--comment <text>`: Tooltip and search description.
- `--wrapper`: Generate a wrapper script in `~/.local/bin/<app-id>`.
- `--scope <user|system>`: Target scope (`user` default to `~/.local/share/`, or `system` to `/usr/share/`).

---

## Procedures

### 1. Automated Installation via Script

Use the bundled automation utility:

```bash
plugins/robos/skills/install-desktop-app/scripts/install-desktop-app.sh \
  --app-id <app-id> \
  --name "<Display Name>" \
  --exec "<executable command>" \
  --icon "<path/to/icon.svg>" \
  --path "<working-directory>" \
  --categories "Utility;Development;" \
  --desktop \
  --favorite
```

---

### 2. Manual / Step-by-Step Procedure

When performing manual setup or customizing entries:

#### Step 1: Multi-Scale Icon Placement & Cache Update
GNOME Shell and Ubuntu Dock require raster PNGs across standard sizes (`16x16` through `512x512`) in the `hicolor` theme to render taskbar/dock icons reliably without falling back to the missing gear icon.
1. **Scalable Vector Icons (SVG)**:
   ```bash
   mkdir -p ~/.local/share/icons/hicolor/scalable/apps ~/.local/share/pixmaps
   cp icon.svg ~/.local/share/icons/hicolor/scalable/apps/<app-id>.svg
   cp icon.svg ~/.local/share/pixmaps/<app-id>.svg
   chmod 644 ~/.local/share/icons/hicolor/scalable/apps/<app-id>.svg
   ```
2. **Multi-Scale Raster Icons (PNG)**:
   ```bash
   for s in 16 24 32 48 64 128 256 512; do
     mkdir -p ~/.local/share/icons/hicolor/${s}x${s}/apps
     python3 -c "import gi; gi.require_version('GdkPixbuf', '2.0'); from gi.repository import GdkPixbuf; GdkPixbuf.Pixbuf.new_from_file_at_scale('icon.svg', $s, $s, True).savev('$HOME/.local/share/icons/hicolor/${s}x${s}/apps/<app-id>.png', 'png', [], [])"
   done
   cp ~/.local/share/icons/hicolor/256x256/apps/<app-id>.png ~/.local/share/pixmaps/<app-id>.png
   ```
3. **Dual-Key / Alias Installation**:
   If the running window's `WM_CLASS` differs from `<app-id>` (e.g. `robos-task-planner` vs `robos-task-explorer`), install / symlink icons under `<wm-class>` as well so dock lookups succeed via either key.
4. **Update GTK Icon Cache**:
   ```bash
   gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor
   ```

#### Step 2: Native Electron Window Icon (`_NET_WM_ICON`)
Electron's `BrowserWindow({ icon: ... })` **only supports raster PNG images** on Linux. If passed an SVG, Electron cannot set `_NET_WM_ICON` on the X11 window. Always keep a companion `icon.png` in the package directory and pass:
```javascript
const iconPng = path.join(__dirname, 'icon.png');
const win = new BrowserWindow({
  title: 'My RobOS App',
  icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
  ...
});
```

#### Step 3: Generate Desktop Entry
Create `~/.local/share/applications/<app-id>.desktop`:

```ini
[Desktop Entry]
Version=1.5
Type=Application
Name=<Display Name>
GenericName=<Generic Name>
Comment=<Description>
Exec=<exec-command> %U
Icon=<app-id>
Path=<working-directory>
Terminal=false
Categories=<Categories;>
Keywords=<search;keywords;>
StartupWMClass=<wm-class>
StartupNotify=true
X-RobOS-App=true
```

#### Step 3: Validate and Register
1. **Validate desktop syntax**:
   ```bash
   desktop-file-validate ~/.local/share/applications/<app-id>.desktop
   ```
2. **Update desktop database**:
   ```bash
   update-desktop-database ~/.local/share/applications
   ```

#### Step 4: GNOME Desktop Shortcut (DING Extension)
For GNOME Desktop Icons NG (DING) to display and launch the desktop shortcut without prompting "Untrusted Application":
```bash
cp ~/.local/share/applications/<app-id>.desktop ~/Desktop/
chmod +x ~/Desktop/<app-id>.desktop
gio set ~/Desktop/<app-id>.desktop metadata::trusted true
```

#### Step 5: GNOME Shell Favorites (Dock Pinning)
To pin the application to the left-hand Ubuntu dock / GNOME Shell dash:
```bash
# Read current favorites
CURRENT="$(gsettings get org.gnome.shell favorite-apps)"

# Add <app-id>.desktop if not already present
gsettings set org.gnome.shell favorite-apps "$(echo "$CURRENT" | sed "s/]$/, '<app-id>.desktop']/")"
```

---

## Validation & Verification

1. Check file validity:
   ```bash
   desktop-file-validate ~/.local/share/applications/<app-id>.desktop
   ```
2. Verify GIO recognition:
   ```bash
   gio info ~/.local/share/applications/<app-id>.desktop
   gio info ~/Desktop/<app-id>.desktop | grep "metadata::trusted"
   ```
3. Test launcher from terminal:
   ```bash
   gtk-launch <app-id>
   ```
