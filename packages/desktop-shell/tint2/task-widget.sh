#!/usr/bin/env bash
# issues-widget.sh — tint2 executor: shows active issue key
# Outputs issue key for tint2 to display next to clock
ISSUE_FILE="$HOME/.config/robos/active-issue"
if [ -f "$ISSUE_FILE" ] && [ -s "$ISSUE_FILE" ]; then
    echo "$(cat "$ISSUE_FILE")"
else
    echo "No issue"
fi
