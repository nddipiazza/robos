#!/usr/bin/env bash
# copilot-quota.sh — tint2 executor: shows GitHub Copilot premium requests remaining
# Uses Pango markup (execp_markup = 1) for color-coding by percentage

CACHE_FILE="/tmp/robos-copilot-quota.cache"
CACHE_AGE=120  # refresh every 2 minutes

# Refresh cache in background if stale
if [ ! -f "$CACHE_FILE" ] || [ $(( $(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0) )) -ge $CACHE_AGE ]; then
  (
    [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null
    DATA=$(gh api /copilot_internal/user 2>/dev/null)
    [ -n "$DATA" ] && echo "$DATA" > "$CACHE_FILE"
  ) &
fi

# Read from cache
if [ ! -f "$CACHE_FILE" ]; then
  echo "🤖 ..."
  exit 0
fi

python3 - "$CACHE_FILE" <<'EOF'
import json, sys

try:
    with open(sys.argv[1]) as f:
        d = json.load(f)
    pi = d["quota_snapshots"]["premium_interactions"]
    remaining   = pi["remaining"]
    entitlement = pi["entitlement"]
    pct         = pi["percent_remaining"]
    unlimited   = pi["unlimited"]
    reset_date  = d.get("quota_reset_date", "?")

    if unlimited:
        print("🤖 ∞ reqs")
        sys.exit(0)

    # Color by percentage
    if pct >= 60:
        color = "#4caf50"   # green
    elif pct >= 30:
        color = "#ffeb3b"   # yellow
    elif pct >= 10:
        color = "#ff9800"   # orange
    else:
        color = "#f44336"   # red

    pct_int = int(round(pct))
    print(f'<span foreground="{color}">🤖 {remaining}/{entitlement}</span>'
          f'<span foreground="#484f58"> resets {reset_date}</span>')
except Exception as e:
    print("🤖 --")
EOF
