#!/bin/bash
# Shows latest 3 AI journal entries from journal-events.json

JOURNAL_FILE="$HOME/.config/robos/journal-events.json"

if [ ! -f "$JOURNAL_FILE" ]; then
  echo "\${color6}No journal yet\${color}"
  exit 0
fi

python3 - <<'EOF'
import json, sys, os
from datetime import datetime, timezone

JOURNAL_FILE = os.path.expanduser("~/.config/robos/journal-events.json")

try:
    data = json.load(open(JOURNAL_FILE))
except Exception as e:
    print("${color6}Error reading journal${color}")
    sys.exit(0)

entries = [e for e in data if e.get("type") == "journal-entry"]
entries.sort(key=lambda e: e.get("timestamp",""), reverse=True)
latest = entries[:3]

if not latest:
    print("${color6}No journal entries yet${color}")
    sys.exit(0)

for i, e in enumerate(latest):
    title = e.get("title", "Journal Entry")
    # Strip emoji prefix if present
    title = title.lstrip("📓 ").lstrip("📋 ").strip()
    detail = e.get("detail", "")
    # Truncate detail to ~80 chars, word-wrap
    snippet = detail[:80].rsplit(" ", 1)[0] + "…" if len(detail) > 80 else detail
    # Parse timestamp
    ts_str = e.get("timestamp","")
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z","+00:00"))
        date_label = dt.strftime("%-d %b %Y")
    except:
        date_label = ts_str[:10]

    if i > 0:
        print("${color1}${hr 1}${color}")
    print(f"${{color2}}{title}${{color}}")
    print(f"${{color6}}{date_label}${{color}}")
    # Word-wrap snippet to ~44 chars
    words = snippet.split()
    line = ""
    for w in words:
        if len(line) + len(w) + 1 > 44:
            print(line)
            line = w
        else:
            line = (line + " " + w).strip()
    if line:
        print(line)
EOF
