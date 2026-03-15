#!/usr/bin/env bash
# fix-taskbar-indicators.sh — Fix dash-to-panel running indicator (orange bar on all apps)
# Run this on the VM to apply immediately without rebuilding.
#
# Root cause: dot-style-unfocused defaults to METRO in Ubuntu's dash-to-panel,
# making every open window show the same full-width orange bar as the focused one.
# Fix: unfocused windows get invisible dots; only the focused window gets the bar.

set -euo pipefail

DTP="org.gnome.shell.extensions.dash-to-panel"

echo "--> Fixing dash-to-panel running indicator..."

# Focused window: full METRO bar in RobOS cyan
gsettings set "$DTP" dot-style-focused        'METRO'
gsettings set "$DTP" dot-color-override       true
gsettings set "$DTP" dot-color-1              '#00bcd4'
gsettings set "$DTP" dot-color-2              '#00bcd4'
gsettings set "$DTP" dot-color-3              '#00bcd4'
gsettings set "$DTP" dot-color-4              '#00bcd4'

# Unfocused running windows: tiny dots using panel background color (invisible)
gsettings set "$DTP" dot-style-unfocused           'DOTS'
gsettings set "$DTP" dot-size                      2
gsettings set "$DTP" dot-color-unfocused-different true
gsettings set "$DTP" dot-color-unfocused-1         '#1e2a3a'
gsettings set "$DTP" dot-color-unfocused-2         '#1e2a3a'
gsettings set "$DTP" dot-color-unfocused-3         '#1e2a3a'
gsettings set "$DTP" dot-color-unfocused-4         '#1e2a3a'

# Disable grouped-app underline for unfocused and background highlight
gsettings set "$DTP" group-apps-underline-unfocused false
gsettings set "$DTP" focus-highlight                false

# Persist to system dconf policy (survives reboots)
if [ -f /etc/dconf/db/local.d/01-robos ]; then
  echo "--> Patching /etc/dconf/db/local.d/01-robos ..."
  sudo python3 - << 'PYEOF'
import pathlib, re

f = pathlib.Path('/etc/dconf/db/local.d/01-robos')
txt = f.read_text()
section = '[org/gnome/shell/extensions/dash-to-panel]'
additions = {
    "dot-style-focused":             "'METRO'",
    "dot-style-unfocused":           "'DOTS'",
    "dot-color-override":            "true",
    "dot-color-1":                   "'#00bcd4'",
    "dot-color-2":                   "'#00bcd4'",
    "dot-color-3":                   "'#00bcd4'",
    "dot-color-4":                   "'#00bcd4'",
    "dot-size":                      "2",
    "dot-color-unfocused-different": "true",
    "dot-color-unfocused-1":         "'#1e2a3a'",
    "dot-color-unfocused-2":         "'#1e2a3a'",
    "dot-color-unfocused-3":         "'#1e2a3a'",
    "dot-color-unfocused-4":         "'#1e2a3a'",
    "group-apps-underline-unfocused":"false",
    "focus-highlight":               "false",
}
if section not in txt:
    print("DTP section not found — skipping")
else:
    for key, val in additions.items():
        pat = rf"^{re.escape(key)}\s*=.*$"
        line = f"{key}={val}"
        if re.search(pat, txt, re.MULTILINE):
            txt = re.sub(pat, line, txt, flags=re.MULTILINE)
        else:
            txt = txt.replace(section, section + "\n" + line)
    f.write_text(txt)
    print("Saved.")
PYEOF
  sudo dconf update
fi

echo ""
echo "Done! The orange underline on all apps is fixed."
echo "If GNOME shell doesn't pick it up immediately, run:"
echo "  Alt+F2 → r → Enter   (restarts GNOME shell without logout)"
