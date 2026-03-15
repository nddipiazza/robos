#!/usr/bin/env bash
# copilot-quota-refresh.sh — writes copilot quota data to /tmp files for Conky
# Called by Conky every update_interval; uses background caching to avoid blocking

CACHE="/tmp/robos-copilot-quota.cache"
LOCK="/tmp/robos-copilot-quota.lock"

# Trigger background refresh if cache is stale (>120s) or missing
AGE=$(( $(date +%s) - $(stat -c %Y "$CACHE" 2>/dev/null || echo 0) ))
if [ "$AGE" -ge 120 ] && [ ! -f "$LOCK" ]; then
  touch "$LOCK"
  (
    [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null
    DATA=$(gh api /copilot_internal/user 2>/dev/null)
    if echo "$DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'quota_snapshots' in d" 2>/dev/null; then
      echo "$DATA" > "$CACHE"
      python3 - "$CACHE" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
pi = d["quota_snapshots"]["premium_interactions"]
remaining   = int(pi["remaining"])
entitlement = int(pi["entitlement"])
pct         = pi["percent_remaining"]
used        = entitlement - remaining
reset       = d.get("quota_reset_date", "?")
unlimited   = pi["unlimited"]

with open("/tmp/robos-cop-remaining.txt",   "w") as f: f.write(str(remaining))
with open("/tmp/robos-cop-entitlement.txt", "w") as f: f.write(str(entitlement))
with open("/tmp/robos-cop-used.txt",        "w") as f: f.write(str(used))
with open("/tmp/robos-cop-reset.txt",       "w") as f: f.write(reset)
with open("/tmp/robos-cop-pct.txt",         "w") as f: f.write(str(int(round(pct))))
with open("/tmp/robos-cop-unlimited.txt",   "w") as f: f.write("1" if unlimited else "0")
PYEOF
    fi
    rm -f "$LOCK"
  ) &
fi
