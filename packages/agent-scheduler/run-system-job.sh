#!/usr/bin/env bash
# run-system-job.sh — executes a RobOS system scheduled job via cron
# Usage: run-system-job.sh <job-id>
export HOME="${HOME:-/home/robos}"
export PATH="/usr/local/bin:/usr/bin:/bin:/snap/bin:$PATH"
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

JOB_ID="$1"
LOG_DIR="$HOME/.config/robos/agent-scheduler/logs"
SETTINGS_FILE="$HOME/.config/robos/system-job-settings.json"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/system-${JOB_ID}.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
ISO_TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

echo "[$TIMESTAMP] START system job: $JOB_ID" >> "$LOG_FILE"

case "$JOB_ID" in
  daily-dev-summary)
    # Collect git history last 24h
    GIT_SUMMARY=""
    GIT_PROJECTS="$HOME/.config/robos/git-projects.json"
    if [ -f "$GIT_PROJECTS" ]; then
      REPOS=$(python3 -c "
import json
data = json.load(open('$GIT_PROJECTS'))
repos = data if isinstance(data, list) else data.get('projects', [])
for r in repos[:10]:
    print(r if isinstance(r, str) else r.get('path', r.get('localPath', '')))
" 2>/dev/null)
      SINCE=$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date -u -v-24H '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || echo "")
      if [ -n "$REPOS" ] && [ -n "$SINCE" ]; then
        while IFS= read -r REPO; do
          [ -z "$REPO" ] && continue
          LOG=$(git -C "$REPO" log --oneline --since="$SINCE" 2>/dev/null | head -20)
          if [ -n "$LOG" ]; then
            GIT_SUMMARY="${GIT_SUMMARY}
Repo: $REPO
$LOG
"
          fi
        done <<< "$REPOS"
      fi
    fi
    [ -z "$GIT_SUMMARY" ] && GIT_SUMMARY="No git commits found in the last 24 hours."

    # Collect task breakdowns modified last 24h
    BREAKDOWN_SUMMARY=""
    DRAFTS_DIR="$HOME/.config/robos/workflow-studio-drafts"
    if [ -d "$DRAFTS_DIR" ]; then
      BREAKDOWN_SUMMARY=$(find "$DRAFTS_DIR" -name "*.json" -newer "$DRAFTS_DIR" -mmin -1440 2>/dev/null | while IFS= read -r F; do
        NAME=$(python3 -c "import json; d=json.load(open('$F')); print(d.get('name','?'), '('+d.get('status','?')+')')" 2>/dev/null)
        [ -n "$NAME" ] && echo "- $NAME"
      done)
    fi
    [ -z "$BREAKDOWN_SUMMARY" ] && BREAKDOWN_SUMMARY="No task breakdowns modified."

    # Collect recent journal events last 24h
    JOURNAL_EVENTS_FILE="$HOME/.config/robos/journal-events.json"
    JOURNAL_SUMMARY=""
    if [ -f "$JOURNAL_EVENTS_FILE" ]; then
      JOURNAL_SUMMARY=$(python3 - <<PYEOF
import json, datetime
cutoff = (datetime.datetime.utcnow() - datetime.timedelta(hours=24)).isoformat()
try:
    events = json.load(open('$JOURNAL_EVENTS_FILE'))
    recent = [e for e in events if e.get('timestamp','') > cutoff][:40]
    for e in recent:
        ts = e.get('timestamp','')[:19]
        title = e.get('title', e.get('type',''))
        detail = (e.get('detail','') or '')[:100]
        print(f"[{ts}] {title}: {detail}")
except:
    pass
PYEOF
)
    fi
    [ -z "$JOURNAL_SUMMARY" ] && JOURNAL_SUMMARY="No recent journal activity."

    TODAY=$(date '+%A, %B %-d, %Y')
    DATE_STR=$(date '+%Y-%m-%d')

    PROMPT="You are writing a Daily Developer Summary for a software development manager to review. Today is $TODAY.

Format your output as Markdown with the following sections. Be concise, factual, and professional. Use the raw data provided — do not invent information.

Output this exact structure:

# Daily Summary — $TODAY

## 🔀 Git Activity
List each repository that had commits. For each, show the repo name as a subheading and bullet each commit message. If no commits, say \"No commits today.\"

## 📋 Tasks Worked On
List each task breakdown that was active today. Show name, status (draft/in_progress/submitted), and any linked issue URLs. If none, say \"No task breakdowns worked on.\"

## 🤖 AI Activity
A short bullet list of the main AI-assisted activities performed today (deduplicated, max 10 bullets). If none, say \"No AI activity.\"

## 📝 Summary
2-3 sentences max. What did the developer accomplish? What was the primary focus? Written for a dev manager.

---

RAW DATA:

GIT COMMITS (last 24h):
$GIT_SUMMARY

TASK BREAKDOWNS (modified last 24h):
$BREAKDOWN_SUMMARY

AI/COPILOT ACTIVITY (last 24h):
$JOURNAL_SUMMARY"

    echo "[$TIMESTAMP] Running daily dev summary via copilot (no shell tools)..." >> "$LOG_FILE"
    RESULT=$(/usr/local/bin/copilot -p "$PROMPT" --deny-tool 'shell(*)' --silent 2>/dev/null)
    EXIT_CODE=$?

    # Extract from response starting at "# Daily Summary"
    RESULT=$(echo "$RESULT" | awk '/^# Daily Summary/{found=1} found{print}')
    [ -n "$RESULT" ] && EXIT_CODE=0

    if [ "$EXIT_CODE" = "0" ] && [ -n "$RESULT" ]; then
      # Append to journal events
      python3 - <<PYEOF
import json, os, time, random, string
f = os.path.expanduser('~/.config/robos/journal-events.json')
os.makedirs(os.path.dirname(f), exist_ok=True)
try: events = json.load(open(f))
except: events = []
evt_id = str(int(time.time()*1000)) + '-' + ''.join(random.choices(string.ascii_lowercase, k=5))
events.insert(0, {
  'id': evt_id,
  'timestamp': '$ISO_TIMESTAMP',
  'source': 'system-job',
  'type': 'daily-summary',
  'title': '📊 Daily Developer Summary — $TODAY',
  'detail': """$RESULT""",
  'status': 'success'
})
events = events[:2000]
with open(f, 'w') as out: json.dump(events, out, indent=2)
PYEOF

      # Write/replace in journal repo daily file
      JOURNAL_REPO=$(python3 -c "import json; s=json.load(open('$HOME/.config/robos/settings.json')); print(s.get('journal_repo',''))" 2>/dev/null)
      if [ -n "$JOURNAL_REPO" ]; then
        REPO_CLEAN=$(echo "$JOURNAL_REPO" | sed 's|https://github.com/||;s|git@github.com:||;s|\.git$||')
        REPO_USER=$(echo "$REPO_CLEAN" | cut -d/ -f1)
        REPO_NAME=$(echo "$REPO_CLEAN" | cut -d/ -f2)
        JOURNAL_DAILY_DIR="$HOME/source/github.com/$REPO_USER/$REPO_NAME/daily"
        mkdir -p "$JOURNAL_DAILY_DIR"
        JOURNAL_FILE="$JOURNAL_DAILY_DIR/${DATE_STR}.md"
        if [ ! -f "$JOURNAL_FILE" ]; then
          DOW=$(date '+%A')
          echo "# Journal — $DATE_STR ($DOW)" > "$JOURNAL_FILE"
          printf "\n## 🎯 Today's Focus\n\n\n## ✏️ Notes\n\n\n## 🔗 References\n\n" >> "$JOURNAL_FILE"
        fi
        # Replace previous daily summary section if present, or append
        python3 - <<PYEOF
import re
with open('$JOURNAL_FILE', 'r') as f:
    content = f.read()
marker = '\n# Daily Summary'
idx = content.find(marker)
if idx >= 0:
    content = content[:idx]
content = content.rstrip() + '\n\n' + """$RESULT""" + '\n'
with open('$JOURNAL_FILE', 'w') as f:
    f.write(content)
PYEOF
      fi

      # Update lastRun in settings
      python3 - <<PYEOF
import json, os
f = '$SETTINGS_FILE'
os.makedirs(os.path.dirname(f), exist_ok=True)
try: s = json.load(open(f))
except: s = {}
s.setdefault('daily-dev-summary', {})['lastRun'] = '$ISO_TIMESTAMP'
with open(f, 'w') as out: json.dump(s, out, indent=2)
PYEOF

      robos-notify "📊 Daily Summary Ready" "Your developer summary for today is ready in the Work Journal." info 2>/dev/null || true
      echo "[$TIMESTAMP] SUCCESS — summary written to journal" >> "$LOG_FILE"
    else
      echo "[$TIMESTAMP] FAILED (exit=$EXIT_CODE)" >> "$LOG_FILE"
      robos-notify "📊 Daily Summary Failed" "Could not generate daily summary." error 2>/dev/null || true
    fi
    ;;
  *)
    echo "[$TIMESTAMP] ERROR: Unknown system job: $JOB_ID" >> "$LOG_FILE"
    exit 1
    ;;
esac

echo "[$TIMESTAMP] END system job: $JOB_ID" >> "$LOG_FILE"
