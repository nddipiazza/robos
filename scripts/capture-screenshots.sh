#!/bin/bash
# Capture screenshots of all RobOS apps running on the VM.
# Usage: bash scripts/capture-screenshots.sh
# Prerequisites: VM running, SSH available on port 2224

set -e

SSH="ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost"
OUTDIR="docs/assets/images/screenshots"
mkdir -p "$OUTDIR"

# App → debug port mapping (must match main.js of each app)
declare -A PORTS=(
  [app-launcher]=19100
  [dev-central]=19133
  [issue-manager]=19103
  [agents-manager]=19104
  [context-manager]=19106
  [workspace-manager]=19110
  [task-servers]=19112
  [pass-manager]=19113
  [security-setup]=19114
  [notifications]=19115
  [robos-preferences]=19116
  [search-index]=19119
  [workflow-studio]=19120
  [pass-unlock]=19122
  [git-login-manager]=19123
  [task-board]=19124
  [desktop-widgets]=19127
  [automation-studio]=19128
  [pr-review]=19129
  [ci-monitor]=19130
  [stage-demo]=19131
  [deploy-tracker]=19132
  [manager-dashboard]=19134
  [report-builder]=19135
  [dev-tools]=19122
)

capture_app() {
  local app=$1
  local port=$2

  echo -n "  $app (port $port)... "

  # Kill any existing instance
  $SSH "fuser -k $port/tcp 2>/dev/null; pkill -f 'electron.*$app' 2>/dev/null" 2>/dev/null || true
  sleep 1

  # Launch the app
  $SSH "DISPLAY=:0 nohup /usr/bin/electron /usr/local/share/robos/$app --no-sandbox --disable-gpu --disable-dev-shm-usage > /dev/null 2>&1 &" 2>/dev/null

  # Wait for health
  local ok=0
  for i in $(seq 1 20); do
    if $SSH "curl -sf http://localhost:$port/health" 2>/dev/null | grep -q ok; then
      ok=1
      break
    fi
    sleep 1
  done

  if [ "$ok" = "0" ]; then
    echo "TIMEOUT (no health)"
    return 1
  fi

  # Give the app time to render
  sleep 3

  # Capture screenshot via SSH tunnel
  $SSH "curl -sf http://localhost:$port/screenshot" > "$OUTDIR/$app.png" 2>/dev/null

  if [ -s "$OUTDIR/$app.png" ]; then
    local size=$(stat -c%s "$OUTDIR/$app.png" 2>/dev/null || stat -f%z "$OUTDIR/$app.png" 2>/dev/null)
    echo "OK (${size} bytes)"
  else
    echo "EMPTY"
    rm -f "$OUTDIR/$app.png"
    return 1
  fi

  # Kill the app
  $SSH "fuser -k $port/tcp 2>/dev/null" 2>/dev/null || true

  return 0
}

echo "RobOS Screenshot Capture"
echo "========================"
echo ""

PASS=0
FAIL=0

for app in "${!PORTS[@]}"; do
  port=${PORTS[$app]}
  if capture_app "$app" "$port"; then
    ((PASS++))
  else
    ((FAIL++))
  fi
done | sort

echo ""
echo "Results: $PASS passed, $FAIL failed"
echo "Screenshots saved to: $OUTDIR/"
