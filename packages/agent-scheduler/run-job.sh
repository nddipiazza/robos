#!/usr/bin/env bash
# run-job.sh — executes a scheduled RobOS agent job
# Usage: run-job.sh <schedule-id>
export HOME="${HOME:-/home/robos}"
export PATH="/usr/local/bin:/usr/bin:/bin:/snap/bin:$PATH"
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

SCHEDULE_ID="$1"
SCHEDULES_FILE="$HOME/.config/robos/agent-scheduler/schedules.json"
LOG_DIR="$HOME/.config/robos/agent-scheduler/logs"
NOTIF_FILE="$HOME/.config/robos/notifications.json"
mkdir -p "$LOG_DIR" "$(dirname "$NOTIF_FILE")"
LOG_FILE="$LOG_DIR/${SCHEDULE_ID}.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
ISO_TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

if [ -z "$SCHEDULE_ID" ]; then
  echo "[$TIMESTAMP] ERROR: No schedule ID provided" >> "$LOG_FILE"
  exit 1
fi

# Read schedule info from JSON
READ_JSON=$(python3 - <<EOF
import json, sys
try:
    data = json.load(open('$SCHEDULES_FILE'))
    for s in data:
        if s.get('id') == '$SCHEDULE_ID':
            print(s.get('commandType', 'shell'))
            print(s.get('command', ''))
            print('1' if s.get('notifyOnRun', True) else '0')
            print('1' if s.get('notifyOnDone', True) else '0')
            print(s.get('name', 'Agent Job'))
            break
except Exception as e:
    print('shell')
    print('')
    print('1')
    print('1')
    print('Agent Job')
EOF
)

CMD_TYPE=$(echo "$READ_JSON" | sed -n '1p')
CMD=$(echo     "$READ_JSON" | sed -n '2p')
NOTIFY_RUN=$(echo "$READ_JSON" | sed -n '3p')
NOTIFY_DONE=$(echo "$READ_JSON" | sed -n '4p')
JOB_NAME=$(echo "$READ_JSON" | sed -n '5p')

if [ -z "$CMD" ]; then
  echo "[$TIMESTAMP] ERROR: Schedule $SCHEDULE_ID not found or empty command" >> "$LOG_FILE"
  exit 1
fi

# Helper: append a notification to notifications.json
append_notification() {
  local TITLE="$1"
  local MSG="$2"
  local ICON="${3:-info}"
  local TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  python3 - <<PYEOF
import json, os
f = '$NOTIF_FILE'
try:
    data = json.load(open(f)) if os.path.exists(f) else []
except:
    data = []
import uuid
data.insert(0, {
    'id': str(uuid.uuid4()),
    'title': '''$TITLE''',
    'message': '''$MSG''',
    'icon': '$ICON',
    'source': 'agent-scheduler',
    'jobName': '''$JOB_NAME''',
    'timestamp': '$TS',
    'read': False
})
# Keep last 200 notifications
data = data[:200]
with open(f, 'w') as out:
    json.dump(data, out, indent=2)
PYEOF
}

# Notify on start
if [ "$NOTIFY_RUN" = "1" ]; then
  robos-notify "▶ $JOB_NAME" "Scheduled job started" info 2>/dev/null || true
  append_notification "▶ $JOB_NAME" "Scheduled job started" "start"
fi

echo "[$TIMESTAMP] START [$CMD_TYPE]: $CMD" >> "$LOG_FILE"

# Log journal start event
python3 - <<PYEOF
import json, os, time, random, string
f = '$JOURNAL_EVENTS_FILE' if '$JOURNAL_EVENTS_FILE' else os.path.expanduser('~/.config/robos/journal-events.json')
f = os.path.expanduser('~/.config/robos/journal-events.json')
os.makedirs(os.path.dirname(f), exist_ok=True)
try: events = json.load(open(f))
except: events = []
evt_id = str(int(time.time()*1000)) + '-' + ''.join(random.choices(string.ascii_lowercase, k=5))
events.insert(0, {
  'id': evt_id,
  'timestamp': '$ISO_TIMESTAMP',
  'source': 'agent-scheduler',
  'type': 'agent-run',
  'title': '▶ $JOB_NAME',
  'detail': '''$CMD'''[:200],
  'status': 'started'
})
events = events[:2000]
with open(f, 'w') as out: json.dump(events, out, indent=2)
PYEOF

if [ "$CMD_TYPE" = "copilot" ]; then
  # Prepend RobOS system instructions if the file exists
  INSTRUCTIONS_FILE="$HOME/.config/robos/robos-instructions.txt"
  if [ -f "$INSTRUCTIONS_FILE" ]; then
    INSTRUCTIONS=$(cat "$INSTRUCTIONS_FILE")
    CMD="${INSTRUCTIONS}

${CMD}"
  fi
  # Run copilot agent directly (no terminal for cron) and log output
  /usr/local/bin/copilot -p "$CMD" --allow-all-tools --silent 2>&1 >> "$LOG_FILE"
  EXIT_CODE=$?
else
  eval "$CMD" >> "$LOG_FILE" 2>&1
  EXIT_CODE=$?
fi

echo "[$TIMESTAMP] END (exit=$EXIT_CODE)" >> "$LOG_FILE"
EXIT_CODE_SYMBOL=$( [ "$EXIT_CODE" = "0" ] && echo "✓" || echo "✗" )

# Log journal completion event
python3 - <<PYEOF
import json, os, time, random, string
f = os.path.expanduser('~/.config/robos/journal-events.json')
os.makedirs(os.path.dirname(f), exist_ok=True)
try: events = json.load(open(f))
except: events = []
evt_id = str(int(time.time()*1000)) + '-' + ''.join(random.choices(string.ascii_lowercase, k=5))
events.insert(0, {
  'id': evt_id,
  'timestamp': '$(date -u +%Y-%m-%dT%H:%M:%SZ)',
  'source': 'agent-scheduler',
  'type': 'agent-run',
  'title': '${EXIT_CODE_SYMBOL} $JOB_NAME',
  'detail': '''$CMD'''[:200],
  'status': 'completed' if $EXIT_CODE == 0 else 'failed'
})
events = events[:2000]
with open(f, 'w') as out: json.dump(events, out, indent=2)
PYEOF

# Notify on done
if [ "$NOTIFY_DONE" = "1" ]; then
  if [ "$EXIT_CODE" = "0" ]; then
    robos-notify "✓ $JOB_NAME" "Completed successfully" success 2>/dev/null || true
    append_notification "✓ $JOB_NAME" "Completed successfully" "success"
  else
    robos-notify "✗ $JOB_NAME" "Job failed (exit $EXIT_CODE)" error 2>/dev/null || true
    append_notification "✗ $JOB_NAME" "Job failed (exit $EXIT_CODE)" "error"
  fi
fi

# Update lastRun in schedules JSON
python3 - <<EOF
import json
try:
    with open('$SCHEDULES_FILE', 'r') as f:
        data = json.load(f)
    for s in data:
        if s.get('id') == '$SCHEDULE_ID':
            s['lastRun'] = '$TIMESTAMP'
            s['lastResult'] = $EXIT_CODE
            break
    with open('$SCHEDULES_FILE', 'w') as f:
        json.dump(data, f, indent=2)
except:
    pass
EOF
