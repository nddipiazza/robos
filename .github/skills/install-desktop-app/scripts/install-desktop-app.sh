#!/usr/bin/env bash
# ==============================================================================
# RobOS GNOME Linux Desktop App & .desktop Icon Installer
# Compliant with FreeDesktop.org Desktop Entry Specification 1.5 & Icon Theme Spec
# Supports GNOME Shell Dash/Dock Favorites, Desktop Icons (DING), and XDG Caching
# ==============================================================================

set -euo pipefail

APP_ID=""
APP_NAME=""
EXEC_CMD=""
ICON_PATH=""
COMMENT=""
GENERIC_NAME=""
WORK_DIR=""
CATEGORIES="Utility;Development;"
KEYWORDS=""
STARTUP_WM_CLASS=""
TERMINAL=false
CREATE_DESKTOP_SHORTCUT=false
PIN_FAVORITE=false
CREATE_WRAPPER=false
ROBOS_CATEGORY=""
SCOPE="user" # "user" or "system"
DRY_RUN=false

usage() {
  cat << 'EOF'
Usage: install-desktop-app.sh [OPTIONS]

Required Options:
  -a, --app-id <id>          Unique application identifier (e.g. "robos-crpg")
  -n, --name <name>          Human-readable display name (e.g. "RobOS cRPG: Realm of Heroes")
  -e, --exec <command>       Execution command line or executable path

Optional Configurations:
  -i, --icon <path-or-name>  Path to icon file (.svg, .png) or theme icon name
  -c, --comment <comment>    Tooltip / description text for launcher
  -g, --generic-name <name>  Generic application category name (e.g. "Role-Playing Game")
  -p, --path <dir>           Working directory for application process (Path=...)
  --categories <list>        Semicolon-separated categories (e.g. "Game;RolePlaying;")
  --keywords <list>          Semicolon-separated search keywords (e.g. "game;crpg;rpg;")
  --wm-class <class>         StartupWMClass for GNOME Shell window matching
  -t, --terminal             Run application inside terminal emulator (Terminal=true)
  -w, --wrapper              Create a clean binary wrapper in ~/.local/bin/<app-id>
  --robos-category <cat>     RobOS classification (Games, AI, Dev, Tools, etc.)

GNOME Integration:
  -d, --desktop              Create launchable desktop shortcut in ~/Desktop with GIO trust
  -f, --favorite, --dock     Pin application to GNOME Shell favorites dock
  -s, --scope <user|system>  Install target scope: "user" (default) or "system"
  --dry-run                  Preview generated files and actions without modifying disk
  -h, --help                 Show this help message

Examples:
  # Install game with desktop shortcut and icon
  ./install-desktop-app.sh \
    --app-id robos-crpg \
    --name "RobOS cRPG: Realm of Heroes" \
    --exec "/home/user/apps/godot4 --path /home/user/source/robos/games/crpg-realm" \
    --icon "/home/user/source/robos/games/crpg-realm/icon.svg" \
    --path "/home/user/source/robos/games/crpg-realm" \
    --categories "Game;RolePlaying;" \
    --desktop \
    --favorite
EOF
  exit 0
}

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -a|--app-id)
      APP_ID="${2:-}"
      shift 2
      ;;
    -n|--name)
      APP_NAME="${2:-}"
      shift 2
      ;;
    -e|--exec)
      EXEC_CMD="${2:-}"
      shift 2
      ;;
    -i|--icon)
      ICON_PATH="${2:-}"
      shift 2
      ;;
    -c|--comment)
      COMMENT="${2:-}"
      shift 2
      ;;
    -g|--generic-name)
      GENERIC_NAME="${2:-}"
      shift 2
      ;;
    -p|--path)
      WORK_DIR="${2:-}"
      shift 2
      ;;
    --categories)
      CATEGORIES="${2:-}"
      shift 2
      ;;
    --keywords)
      KEYWORDS="${2:-}"
      shift 2
      ;;
    --wm-class)
      STARTUP_WM_CLASS="${2:-}"
      shift 2
      ;;
    -t|--terminal)
      TERMINAL=true
      shift
      ;;
    -w|--wrapper)
      CREATE_WRAPPER=true
      shift
      ;;
    --robos-category)
      ROBOS_CATEGORY="${2:-}"
      shift 2
      ;;
    -d|--desktop|--desktop-shortcut)
      CREATE_DESKTOP_SHORTCUT=true
      shift
      ;;
    -f|--favorite|--dock)
      PIN_FAVORITE=true
      shift
      ;;
    -s|--scope)
      SCOPE="${2:-user}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Error: Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required inputs
if [[ -z "$APP_ID" ]]; then
  echo "Error: --app-id is required" >&2
  exit 1
fi
if [[ -z "$APP_NAME" ]]; then
  echo "Error: --name is required" >&2
  exit 1
fi
if [[ -z "$EXEC_CMD" ]]; then
  echo "Error: --exec is required" >&2
  exit 1
fi

# Sanitize app-id: lowercase kebab-case
APP_ID="$(echo "$APP_ID" | tr '[:upper:]' '[:lower:]' | tr -s ' _/' '-' | sed 's/^-//;s/-$//')"

# Ensure Categories ends with a semicolon
if [[ -n "$CATEGORIES" && "${CATEGORIES: -1}" != ";" ]]; then
  CATEGORIES="${CATEGORIES};"
fi

# Ensure Keywords ends with a semicolon
if [[ -n "$KEYWORDS" && "${KEYWORDS: -1}" != ";" ]]; then
  KEYWORDS="${KEYWORDS};"
fi

# Configure directories based on scope
if [[ "$SCOPE" == "system" ]]; then
  APPS_DIR="/usr/share/applications"
  ICONS_BASE_DIR="/usr/share/icons/hicolor"
  PIXMAPS_DIR="/usr/share/pixmaps"
  BIN_DIR="/usr/local/bin"
  SUDO_PREFIX="sudo"
else
  APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  ICONS_BASE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
  PIXMAPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/pixmaps"
  BIN_DIR="$HOME/.local/bin"
  SUDO_PREFIX=""
fi

DESKTOP_FILE_PATH="${APPS_DIR}/${APP_ID}.desktop"

echo "======================================================================"
echo "Installing GNOME Desktop Entry: ${APP_NAME} (${APP_ID})"
echo "Scope: ${SCOPE} | Target: ${DESKTOP_FILE_PATH}"
echo "======================================================================"

# Step 1: Optional Wrapper Generation
FINAL_EXEC="$EXEC_CMD"
if [[ "$CREATE_WRAPPER" = true ]]; then
  WRAPPER_SCRIPT="${BIN_DIR}/${APP_ID}"
  echo "Creating executable launcher wrapper at: ${WRAPPER_SCRIPT}..."
  if [[ "$DRY_RUN" = false ]]; then
    ${SUDO_PREFIX} mkdir -p "${BIN_DIR}"
    cat << EOFWRAP | ${SUDO_PREFIX} tee "${WRAPPER_SCRIPT}" > /dev/null
#!/usr/bin/env bash
set -e
${WORK_DIR:+cd "$WORK_DIR"}
exec $EXEC_CMD "\$@"
EOFWRAP
    ${SUDO_PREFIX} chmod +x "${WRAPPER_SCRIPT}"
  else
    echo "[DRY-RUN] Create script ${WRAPPER_SCRIPT} with command: ${EXEC_CMD}"
  fi
  FINAL_EXEC="${WRAPPER_SCRIPT} %U"
fi

# Step 2: Intelligent StartupWMClass Auto-Detection
if [[ -z "$STARTUP_WM_CLASS" ]]; then
  DETECT_DIR="${WORK_DIR:-}"
  if [[ -z "$DETECT_DIR" && -n "$EXEC_CMD" ]]; then
    for token in $EXEC_CMD; do
      if [[ -d "$token" && -f "$token/package.json" ]]; then
        DETECT_DIR="$token"
        break
      elif [[ -f "$token" && "$token" == *"/main.js" ]]; then
        DETECT_DIR="$(dirname "$token")"
        break
      fi
    done
  fi

  if [[ -n "$DETECT_DIR" && -d "$DETECT_DIR" ]]; then
    if [[ -f "$DETECT_DIR/main.js" ]]; then
      FOUND_NAME="$(grep -oP "app\.setName\(['\"]\K[^'\"]+" "$DETECT_DIR/main.js" 2>/dev/null | head -n1 || true)"
      if [[ -n "$FOUND_NAME" ]]; then
        STARTUP_WM_CLASS="$FOUND_NAME"
      fi
    fi
    if [[ -z "$STARTUP_WM_CLASS" && -f "$DETECT_DIR/package.json" ]]; then
      FOUND_PKG="$(grep -oP '"name"\s*:\s*"\K[^"]+' "$DETECT_DIR/package.json" 2>/dev/null | head -n1 || true)"
      if [[ -n "$FOUND_PKG" ]]; then
        STARTUP_WM_CLASS="$FOUND_PKG"
      fi
    fi
  fi

  if [[ -z "$STARTUP_WM_CLASS" ]]; then
    STARTUP_WM_CLASS="$APP_ID"
  fi
fi

# Step 3: Icon Resolution & Multi-Scale Rasterization
FINAL_ICON_NAME="$APP_ID"
if [[ -n "$ICON_PATH" ]]; then
  if [[ -f "$ICON_PATH" ]]; then
    ICON_EXT="${ICON_PATH##*.}"
    ICON_EXT="$(echo "$ICON_EXT" | tr '[:upper:]' '[:lower:]')"

    SIZES=(16 24 32 48 64 128 256 512)

    # Determine all alias names (APP_ID and STARTUP_WM_CLASS)
    ALIAS_NAMES=("$APP_ID")
    if [[ -n "$STARTUP_WM_CLASS" && "$STARTUP_WM_CLASS" != "$APP_ID" ]]; then
      ALIAS_NAMES+=("$STARTUP_WM_CLASS")
    fi

    echo "Installing icons for aliases: ${ALIAS_NAMES[*]}..."

    if [[ "$DRY_RUN" = false ]]; then
      ${SUDO_PREFIX} mkdir -p "${ICONS_BASE_DIR}/scalable/apps" "${PIXMAPS_DIR}"

      # Scalable SVG
      if [[ "$ICON_EXT" == "svg" ]]; then
        for alias in "${ALIAS_NAMES[@]}"; do
          ${SUDO_PREFIX} cp "${ICON_PATH}" "${ICONS_BASE_DIR}/scalable/apps/${alias}.svg"
          ${SUDO_PREFIX} chmod 644 "${ICONS_BASE_DIR}/scalable/apps/${alias}.svg"
          ${SUDO_PREFIX} cp "${ICON_PATH}" "${PIXMAPS_DIR}/${alias}.svg"
          ${SUDO_PREFIX} chmod 644 "${PIXMAPS_DIR}/${alias}.svg"
        done
      fi

      # Generate multi-scale PNGs
      for s in "${SIZES[@]}"; do
        SIZE_DIR="${ICONS_BASE_DIR}/${s}x${s}/apps"
        ${SUDO_PREFIX} mkdir -p "${SIZE_DIR}"

        TMP_PNG="/tmp/${APP_ID}-${s}x${s}.png"
        rm -f "${TMP_PNG}"
        if [[ "$ICON_EXT" == "svg" ]]; then
          python3 -c "
import gi, sys
gi.require_version('GdkPixbuf', '2.0')
from gi.repository import GdkPixbuf
try:
    pix = GdkPixbuf.Pixbuf.new_from_file_at_scale('${ICON_PATH}', ${s}, ${s}, True)
    pix.savev('${TMP_PNG}', 'png', [], [])
except Exception:
    sys.exit(1)
" 2>/dev/null || {
            if command -v rsvg-convert >/dev/null 2>&1; then
              rsvg-convert -w "$s" -h "$s" "${ICON_PATH}" -o "${TMP_PNG}" 2>/dev/null || true
            fi
          }
        elif [[ "$ICON_EXT" == "png" ]]; then
          python3 -c "
import gi, sys
gi.require_version('GdkPixbuf', '2.0')
from gi.repository import GdkPixbuf
try:
    pix = GdkPixbuf.Pixbuf.new_from_file_at_scale('${ICON_PATH}', ${s}, ${s}, True)
    pix.savev('${TMP_PNG}', 'png', [], [])
except Exception:
    sys.exit(1)
" 2>/dev/null || cp "${ICON_PATH}" "${TMP_PNG}" 2>/dev/null || true
        fi

        if [[ -f "${TMP_PNG}" ]]; then
          for alias in "${ALIAS_NAMES[@]}"; do
            ${SUDO_PREFIX} cp "${TMP_PNG}" "${SIZE_DIR}/${alias}.png"
            ${SUDO_PREFIX} chmod 644 "${SIZE_DIR}/${alias}.png"
          done
          if [[ "$s" -eq 128 || "$s" -eq 256 ]]; then
            for alias in "${ALIAS_NAMES[@]}"; do
              ${SUDO_PREFIX} cp "${TMP_PNG}" "${PIXMAPS_DIR}/${alias}.png"
              ${SUDO_PREFIX} chmod 644 "${PIXMAPS_DIR}/${alias}.png"
            done
          fi
          rm -f "${TMP_PNG}"
        fi
      done

      # Ensure companion icon.png exists in application workspace directory
      # so Electron apps can set native _NET_WM_ICON window property
      TARGET_APP_DIR="${WORK_DIR:-}"
      if [[ -z "$TARGET_APP_DIR" && "$ICON_PATH" == *"/icon.svg" ]]; then
        TARGET_APP_DIR="$(dirname "$ICON_PATH")"
      fi
      if [[ -n "$TARGET_APP_DIR" && -d "$TARGET_APP_DIR" && -f "$TARGET_APP_DIR/icon.svg" && ! -f "$TARGET_APP_DIR/icon.png" ]]; then
        python3 -c "
import gi
gi.require_version('GdkPixbuf', '2.0')
from gi.repository import GdkPixbuf
try:
    pix = GdkPixbuf.Pixbuf.new_from_file_at_scale('$TARGET_APP_DIR/icon.svg', 256, 256, True)
    pix.savev('$TARGET_APP_DIR/icon.png', 'png', [], [])
except Exception:
    pass
" 2>/dev/null || true
      fi
    else
      echo "[DRY-RUN] Multi-scale PNGs (16-512) and SVG installed for aliases: ${ALIAS_NAMES[*]}"
    fi
    FINAL_ICON_NAME="$APP_ID"
  else
    FINAL_ICON_NAME="$ICON_PATH"
  fi

  # Update GTK Icon Cache
  if [[ "$DRY_RUN" = false && -d "$ICONS_BASE_DIR" ]] && command -v gtk-update-icon-cache >/dev/null 2>&1; then
    echo "Updating GTK icon cache for: ${ICONS_BASE_DIR}..."
    ${SUDO_PREFIX} gtk-update-icon-cache -f -t -q "${ICONS_BASE_DIR}" 2>/dev/null || true
  fi

  # Update user custom icon themes if present in ~/.local/share/icons/
  if [[ "$DRY_RUN" = false && "$SCOPE" != "system" ]] && command -v gtk-update-icon-cache >/dev/null 2>&1; then
    for user_theme_dir in "${XDG_DATA_HOME:-$HOME/.local/share}/icons"/*/; do
      if [[ -f "${user_theme_dir}index.theme" ]]; then
        gtk-update-icon-cache -f -t -q "${user_theme_dir}" 2>/dev/null || true
      fi
    done
  fi
fi

# Step 4: Generate .desktop Entry File
TEMP_DESKTOP_FILE="$(mktemp "/tmp/${APP_ID}-XXXXXX.desktop")"

cat > "${TEMP_DESKTOP_FILE}" << EOF
[Desktop Entry]
Version=1.5
Type=Application
Name=${APP_NAME}
${GENERIC_NAME:+GenericName=${GENERIC_NAME}}
${COMMENT:+Comment=${COMMENT}}
Exec=${FINAL_EXEC}
Icon=${FINAL_ICON_NAME}
${WORK_DIR:+Path=${WORK_DIR}}
Terminal=${TERMINAL}
Categories=${CATEGORIES}
${KEYWORDS:+Keywords=${KEYWORDS}}
${STARTUP_WM_CLASS:+StartupWMClass=${STARTUP_WM_CLASS}}
StartupNotify=true
X-RobOS-App=true
${ROBOS_CATEGORY:+X-RobOS-Category=${ROBOS_CATEGORY}}
EOF

# Clean up empty lines
sed -i '/^[[:space:]]*$/d' "${TEMP_DESKTOP_FILE}"

echo "Validating generated desktop entry with desktop-file-validate..."
if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "${TEMP_DESKTOP_FILE}"
  echo "Validation passed."
fi

# Step 5: Install to Applications Directory
echo "Installing desktop entry to: ${DESKTOP_FILE_PATH}..."
if [[ "$DRY_RUN" = false ]]; then
  ${SUDO_PREFIX} mkdir -p "${APPS_DIR}"
  ${SUDO_PREFIX} cp "${TEMP_DESKTOP_FILE}" "${DESKTOP_FILE_PATH}"
  ${SUDO_PREFIX} chmod 644 "${DESKTOP_FILE_PATH}"
  rm -f "${TEMP_DESKTOP_FILE}"
else
  echo "[DRY-RUN] Install desktop file content to ${DESKTOP_FILE_PATH}"
  cat "${TEMP_DESKTOP_FILE}"
  rm -f "${TEMP_DESKTOP_FILE}"
fi

# Step 6: Update Desktop Database
if [[ "$DRY_RUN" = false ]] && command -v update-desktop-database >/dev/null 2>&1; then
  echo "Updating desktop application database for: ${APPS_DIR}..."
  ${SUDO_PREFIX} update-desktop-database -q "${APPS_DIR}" 2>/dev/null || true
fi

# Step 7: Create & Trust Desktop Shortcut (GNOME Shell DING Extension)
if [[ "$CREATE_DESKTOP_SHORTCUT" = true ]]; then
  DESKTOP_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
  SHORTCUT_PATH="${DESKTOP_DIR}/${APP_ID}.desktop"
  echo "Creating launchable GNOME desktop shortcut at: ${SHORTCUT_PATH}..."

  if [[ "$DRY_RUN" = false ]]; then
    mkdir -p "${DESKTOP_DIR}"
    cp "${DESKTOP_FILE_PATH}" "${SHORTCUT_PATH}"
    chmod +x "${SHORTCUT_PATH}"

    # GNOME DING metadata trust flag:
    # This prevents the "Untrusted application" prompt and allows immediate direct launch
    if command -v gio >/dev/null 2>&1; then
      gio set "${SHORTCUT_PATH}" metadata::trusted true 2>/dev/null || true
      gio set "${SHORTCUT_PATH}" metadata::trusted yes 2>/dev/null || true
    fi
  else
    echo "[DRY-RUN] Create ${SHORTCUT_PATH}, chmod +x, and set gio metadata::trusted true"
  fi
fi

# Step 8: Pin to GNOME Shell Favorites (Dock)
if [[ "$PIN_FAVORITE" = true ]]; then
  if command -v gsettings >/dev/null 2>&1; then
    DESKTOP_BASENAME="${APP_ID}.desktop"
    echo "Checking GNOME Shell favorites dock..."
    CURRENT_FAVS="$(gsettings get org.gnome.shell favorite-apps 2>/dev/null || echo "[]")"

    if [[ "$CURRENT_FAVS" == *"'${DESKTOP_BASENAME}'"* || "$CURRENT_FAVS" == *"\"${DESKTOP_BASENAME}\""* ]]; then
      echo "${DESKTOP_BASENAME} is already pinned to GNOME Shell favorites."
    else
      echo "Adding ${DESKTOP_BASENAME} to GNOME Shell favorites..."
      if [[ "$DRY_RUN" = false ]]; then
        # Append before the closing bracket
        if [[ "$CURRENT_FAVS" == "[]" || -z "$CURRENT_FAVS" ]]; then
          NEW_FAVS="['${DESKTOP_BASENAME}']"
        else
          # Strip trailing bracket and append
          NEW_FAVS="$(echo "$CURRENT_FAVS" | sed "s/]$/, '${DESKTOP_BASENAME}']/")"
        fi
        gsettings set org.gnome.shell favorite-apps "$NEW_FAVS"
        echo "Successfully updated GNOME Shell favorites: $NEW_FAVS"
      else
        echo "[DRY-RUN] Would append '${DESKTOP_BASENAME}' to org.gnome.shell favorite-apps"
      fi
    fi
  fi
fi

echo "======================================================================"
echo "Installation complete!"
echo "• Desktop Entry: ${DESKTOP_FILE_PATH}"
if [[ "$CREATE_DESKTOP_SHORTCUT" = true ]]; then
  echo "• Desktop Shortcut: ${DESKTOP_DIR:-$HOME/Desktop}/${APP_ID}.desktop (Trusted)"
fi
if [[ -n "$ICON_PATH" ]]; then
  echo "• Icon: ${FINAL_ICON_NAME}"
fi
echo "======================================================================"
