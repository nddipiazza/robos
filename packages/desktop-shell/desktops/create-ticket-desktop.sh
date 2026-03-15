#!/usr/bin/env bash
# create-ticket-desktop.sh TICKET-ID [JIRA_URL]
# Creates (or switches to) a named virtual desktop for a Jira ticket,
# then launches the standard developer workspace apps on that desktop.

set -euo pipefail

TICKET="${1:-}"
JIRA_URL="${2:-}"

if [ -z "$TICKET" ]; then
  echo "Usage: create-ticket-desktop.sh TICKET-ID [JIRA_URL]" >&2
  exit 1
fi

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

DESKTOPS_DIR="$HOME/.config/robos/desktops"
mkdir -p "$DESKTOPS_DIR"

# ── Check if a desktop for this ticket already exists ──────────────────────
EXISTING=$(wmctrl -d | awk -v t="$TICKET" '$NF == t {print $1}')
if [ -n "$EXISTING" ]; then
  echo "Switching to existing desktop for $TICKET (desktop $EXISTING)"
  wmctrl -s "$EXISTING"
  exit 0
fi

# ── Find the first unused workspace slot ───────────────────────────────────
CURRENT_COUNT=$(wmctrl -d | wc -l)
AVAILABLE=""
while IFS= read -r line; do
  idx=$(echo "$line" | awk '{print $1}')
  name=$(echo "$line" | awk '{print $NF}')
  if [[ "$name" == Workspace* ]]; then
    AVAILABLE="$idx"
    break
  fi
done < <(wmctrl -d)

if [ -z "$AVAILABLE" ]; then
  # All slots used — add a new desktop
  NEW_COUNT=$((CURRENT_COUNT + 1))
  wmctrl -n "$NEW_COUNT"
  sleep 0.3
  AVAILABLE=$((NEW_COUNT - 1))
fi

# ── Switch to the target desktop ───────────────────────────────────────────
wmctrl -s "$AVAILABLE"
sleep 0.3

# ── Rename the desktop ─────────────────────────────────────────────────────
python3 /usr/local/bin/robos-rename-desktop "$AVAILABLE" "$TICKET"
sleep 0.2

# ── Save ticket context ────────────────────────────────────────────────────
JIRA_BASE="${JIRA_URL:-https://jira.example.com/browse/$TICKET}"
cat > "$DESKTOPS_DIR/$TICKET.json" <<JSON
{
  "ticket": "$TICKET",
  "desktop": $AVAILABLE,
  "jira_url": "$JIRA_BASE",
  "created": "$(date -Iseconds)"
}
JSON

echo "Created desktop $AVAILABLE for $TICKET"

# ── Launch workspace apps on this desktop ─────────────────────────────────
move_to_desktop() {
  sleep 2
  wmctrl -r :ACTIVE: -t "$AVAILABLE" 2>/dev/null || true
}

CHROME_BIN=$(command -v google-chrome chromium-browser chromium 2>/dev/null | head -1 || true)
if [ -n "$CHROME_BIN" ]; then
  "$CHROME_BIN" --new-window "$JIRA_BASE" &
  move_to_desktop
fi

if command -v code &>/dev/null; then
  code &
  move_to_desktop
fi

if command -v tilix &>/dev/null; then
  tilix &
  move_to_desktop
fi

echo "Workspace for $TICKET is ready on desktop $AVAILABLE"
