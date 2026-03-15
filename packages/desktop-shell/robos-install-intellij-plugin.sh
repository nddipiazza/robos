#!/usr/bin/env bash
# robos-install-intellij-plugin.sh — auto-install the RobOS plugin to all
# detected JetBrains IDE installations for the current user.
#
# Called by install.sh and by the XDG autostart entry so newly-installed
# IDE versions also receive the plugin on next login.

PLUGIN_ZIP="/usr/local/share/robos/robos-intellij-plugin/robos-plugin.zip"
JB_DATA_DIR="${HOME}/.local/share/JetBrains"
LOG_TAG="robos-install-intellij-plugin"

if [ ! -f "$PLUGIN_ZIP" ]; then
  echo "[$LOG_TAG] Plugin ZIP not found at $PLUGIN_ZIP — skipping." >&2
  exit 0
fi

if [ ! -d "$JB_DATA_DIR" ]; then
  exit 0
fi

# Detect the plugin version embedded in the ZIP (top-level directory name)
# e.g. robos/ → "robos"
PLUGIN_DIR_NAME=$(unzip -qql "$PLUGIN_ZIP" | awk 'NR==1{split($4,a,"/"); print a[1]}')
if [ -z "$PLUGIN_DIR_NAME" ]; then
  echo "[$LOG_TAG] Could not determine plugin directory name from ZIP." >&2
  exit 1
fi

INSTALLED=0
SKIPPED=0

# JetBrains stores per-version user data (including plugins) under:
#   ~/.local/share/JetBrains/<ProductVersion>/
# The plugin folder lives directly inside that directory.
for version_dir in \
    "$JB_DATA_DIR"/IdeaIC* \
    "$JB_DATA_DIR"/IntelliJIdea* \
    "$JB_DATA_DIR"/WebStorm* \
    "$JB_DATA_DIR"/PyCharm* \
    "$JB_DATA_DIR"/PyCharmCE* \
    "$JB_DATA_DIR"/GoLand* \
    "$JB_DATA_DIR"/CLion* \
    "$JB_DATA_DIR"/Rider*; do

  [ -d "$version_dir" ] || continue

  plugin_dest="$version_dir/$PLUGIN_DIR_NAME"

  # Compare modification times: skip if plugin dir is newer than the ZIP
  if [ -d "$plugin_dest" ]; then
    if [ "$plugin_dest" -nt "$PLUGIN_ZIP" ]; then
      SKIPPED=$((SKIPPED + 1))
      continue
    fi
    # Newer ZIP → reinstall
    rm -rf "$plugin_dest"
  fi

  if unzip -qo "$PLUGIN_ZIP" -d "$version_dir" 2>/dev/null; then
    echo "[$LOG_TAG] Installed to: $version_dir"
    INSTALLED=$((INSTALLED + 1))
  else
    echo "[$LOG_TAG] Failed to install to: $version_dir" >&2
  fi
done

if [ $INSTALLED -gt 0 ]; then
  echo "[$LOG_TAG] RobOS IntelliJ plugin installed to $INSTALLED IDE version(s)."
fi

exit 0
