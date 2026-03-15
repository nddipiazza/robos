#!/bin/bash
# Source user profile so gh is on PATH
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null
[ -f "$HOME/.profile" ] && source "$HOME/.profile" 2>/dev/null

# Read active mode from settings
SETTINGS="$HOME/.config/robos/settings.json"
ACTIVE_MODE=""
if [ -f "$SETTINGS" ]; then
  ACTIVE_MODE=$(python3 -c "import json; d=json.load(open('$SETTINGS')); print(d.get('active_mode',''))" 2>/dev/null)
fi

# Reviewer roles default to explain; dev/manager roles default to suggest
case "$ACTIVE_MODE" in
  reviewer-*) DEFAULT_CMD="explain" ;;
  *)          DEFAULT_CMD="suggest" ;;
esac

# Run from /etc/robos so agents pick up AGENTS.md as system context
cd /etc/robos

gh copilot -i $DEFAULT_CMD

# Keep terminal open after copilot exits
exec bash -i
