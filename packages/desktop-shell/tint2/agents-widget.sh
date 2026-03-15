#!/usr/bin/env bash
# agents-widget.sh — tint2 executor: shows count of running agent sessions

AGENT_PROCS=0
LABELS=()

# Count gh copilot sessions
COP=$(pgrep -fc "gh copilot" 2>/dev/null || echo 0)
[ "$COP" -gt 0 ] && LABELS+=("copilot:$COP") && AGENT_PROCS=$((AGENT_PROCS + COP))

# Count any robos action scripts (future: scheduled tasks, workspace builders, etc.)
ACTION=$(pgrep -fc "robos-action" 2>/dev/null || echo 0)
[ "$ACTION" -gt 0 ] && LABELS+=("action:$ACTION") && AGENT_PROCS=$((AGENT_PROCS + ACTION))

# Count any running agent_panel spawned subprocesses logged in /tmp/robos-agents.log
if [ -f /tmp/robos-agents.log ]; then
  SCHEDULED=$(grep -c "^running" /tmp/robos-agents.log 2>/dev/null || echo 0)
  [ "$SCHEDULED" -gt 0 ] && LABELS+=("sched:$SCHEDULED") && AGENT_PROCS=$((AGENT_PROCS + SCHEDULED))
fi

if [ "$AGENT_PROCS" -gt 0 ]; then
  echo "🤖 $(IFS=', '; echo "${LABELS[*]}")"
else
  echo "🤖 idle"
fi
