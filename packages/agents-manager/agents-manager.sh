#!/usr/bin/env bash
APP_DIR="/usr/local/share/robos/agents-manager"
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
cd "$APP_DIR"
exec node_modules/.bin/electron . --no-sandbox --disable-gpu "$@"
