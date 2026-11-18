#!/usr/bin/env bash
set -euo pipefail
PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/share/robos/node/bin:$PATH"
cd "$PACKAGE_DIR"
npm install --include=dev --no-audit --no-fund
# npm versions with install-script approval may leave Electron's archive uninstalled.
node node_modules/electron/install.js
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor"
mkdir -p "$APP_DIR" "$ICON_DIR/scalable/apps"
cp icon.svg "$ICON_DIR/scalable/apps/robos-services.svg"
python3 - "$PACKAGE_DIR" "$ICON_DIR" <<'PY'
import os, sys
try:
    import gi
    gi.require_version('GdkPixbuf', '2.0')
    from gi.repository import GdkPixbuf
    package, icons = sys.argv[1:]
    for size in (16,24,32,48,64,128,256,512):
        target = os.path.join(icons, str(size)+'x'+str(size), 'apps')
        os.makedirs(target, exist_ok=True)
        image = GdkPixbuf.Pixbuf.new_from_file_at_scale(os.path.join(package,'icon.svg'),size,size,True)
        image.savev(os.path.join(target,'robos-services.png'),'png',[],[])
        if size == 256: image.savev(os.path.join(package,'icon.png'),'png',[],[])
except ImportError:
    print('GdkPixbuf unavailable; using scalable SVG icon')
PY
cat > "$APP_DIR/robos-services.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=RobOS Services
Comment=Install and control local and SSH-hosted RobOS services
Exec="$PACKAGE_DIR/node_modules/electron/dist/electron" "$PACKAGE_DIR/main.js" --no-sandbox --disable-gpu --disable-dev-shm-usage
Icon=robos-services
Terminal=false
Categories=System;Settings;
StartupWMClass=robos-services
StartupNotify=true
X-RobOS-App=true
X-RobOS-Category=System
EOF
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || printf '%s/Desktop' "$HOME")"
mkdir -p "$DESKTOP_DIR"
cp "$APP_DIR/robos-services.desktop" "$DESKTOP_DIR/robos-services.desktop"
chmod +x "$DESKTOP_DIR/robos-services.desktop"
gio set "$DESKTOP_DIR/robos-services.desktop" metadata::trusted true || true
command -v desktop-file-validate >/dev/null && desktop-file-validate "$APP_DIR/robos-services.desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$APP_DIR" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICON_DIR" || true
# RobOS App Launcher also discovers system application entries. Use existing sudo
# authorization when available; user GNOME installation remains usable without it.
if sudo -n true 2>/dev/null; then
  sudo install -m 644 "$APP_DIR/robos-services.desktop" /usr/share/applications/robos-services.desktop
  if [[ ! -e /usr/local/share/robos/robos-services && ! -L /usr/local/share/robos/robos-services ]]; then
    sudo mkdir -p /usr/local/share/robos
    sudo ln -s "$PACKAGE_DIR" /usr/local/share/robos/robos-services
  fi
fi
echo "Installed RobOS Services in GNOME applications and $DESKTOP_DIR"
