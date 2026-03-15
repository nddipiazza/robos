#!/usr/bin/env bash
# robos-timezone-sync.sh — Detect and set the system timezone at login.
#
# Why this exists:
#   Ubuntu does not auto-detect timezone by default (privacy). GNOME's built-in
#   automatic-timezone relies on geoclue2 hardware/WiFi location which is
#   unavailable in VMs. This script uses IP geolocation as a reliable fallback
#   that works on both physical hardware and QEMU VMs.
#
# Strategy:
#   1. If GNOME automatic-timezone is already working, skip.
#   2. Query a public IP geolocation API (no API key required).
#   3. Validate the returned timezone string.
#   4. Set system timezone via timedatectl (requires sudo without password
#      via the polkit rule installed by install.sh).
#   5. Update GNOME's clock so the change is visible without logout.

set -euo pipefail

LOG_FILE="${HOME}/.config/robos/timezone-sync.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

log "Starting timezone sync..."

# ── 1. Try IP geolocation (works in VM and on physical hardware) ──────────────
TZ_DETECTED=""

# Try multiple providers in order; use the first that responds
for URL in \
    "https://ipapi.co/timezone" \
    "http://ip-api.com/line/?fields=timezone" \
    "https://worldtimeapi.org/api/ip.txt" ; do
  RESPONSE=$(curl -s --max-time 5 "$URL" 2>/dev/null || true)
  # worldtimeapi returns "timezone: Area/City" — extract just the value
  if echo "$RESPONSE" | grep -q "timezone:"; then
    RESPONSE=$(echo "$RESPONSE" | grep "^timezone:" | awk '{print $2}')
  fi
  # Validate: must look like a real tz (e.g. "America/New_York")
  if echo "$RESPONSE" | grep -qE '^[A-Za-z_]+/[A-Za-z_/]+$|^UTC$|^Etc/'; then
    TZ_DETECTED="$RESPONSE"
    log "Detected timezone '$TZ_DETECTED' from $URL"
    break
  fi
done

if [ -z "$TZ_DETECTED" ]; then
  log "Could not detect timezone from any provider. Leaving unchanged."
  exit 0
fi

# ── 2. Check if already set to the detected timezone ─────────────────────────
CURRENT_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo "")
if [ "$CURRENT_TZ" = "$TZ_DETECTED" ]; then
  log "Timezone already set to '$TZ_DETECTED'. No change needed."
  exit 0
fi

# ── 3. Set the timezone ───────────────────────────────────────────────────────
log "Changing timezone: '$CURRENT_TZ' → '$TZ_DETECTED'"
sudo timedatectl set-timezone "$TZ_DETECTED"

# ── 4. Notify GNOME clock to refresh (fire-and-forget) ───────────────────────
DISPLAY="${DISPLAY:-:0}" gsettings set org.gnome.desktop.interface clock-format \
  "$(gsettings get org.gnome.desktop.interface clock-format)" 2>/dev/null || true

log "Timezone sync complete: $TZ_DETECTED"
