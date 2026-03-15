#!/usr/bin/env bash
# desktop-task.sh — writes task info to cache files read by conkyrc
TASKS_FILE="$HOME/.config/robos/desktop-tasks.json"
LINE_FILE="/tmp/robos-desktop-task-line"
INFO_FILE="/tmp/robos-desktop-task-info"

# Get current desktop index (0-based)
CURRENT=$(wmctrl -d 2>/dev/null | awk '/\*/{print $1}')
[ -z "$CURRENT" ] && CURRENT=0
DESK=$((CURRENT + 1))

echo "Desktop $DESK" > "$LINE_FILE"

if [ ! -f "$TASKS_FILE" ]; then
  echo -n "" > "$INFO_FILE"
  exit 0
fi

python3 - "$DESK" "$TASKS_FILE" "$INFO_FILE" << 'PY'
import json, sys
desk, path, out = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    data = json.load(open(path))
    t = data.get('desktops', {}).get(str(desk))
    if t:
        key   = t.get('key', '').strip()
        title = t.get('title', '').strip()
        line  = f"{key}: {title}" if key else title
        if len(line) > 52:
            line = line[:52] + '\u2026'
        open(out, 'w').write(line)
    else:
        open(out, 'w').write('')
except:
    open(out, 'w').write('')
PY
