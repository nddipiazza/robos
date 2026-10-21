#!/usr/bin/env bash
# launcher.sh — open the Dragon Warrior debug launcher GUI
DISPLAY=:0 "$(dirname "$0")/tools/debug-launcher/node_modules/.bin/electron" \
  --no-sandbox --disable-gpu --disable-dev-shm-usage \
  "$(dirname "$0")/tools/debug-launcher" &
echo "Launcher PID=$!"
