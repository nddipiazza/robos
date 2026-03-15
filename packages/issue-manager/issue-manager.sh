#!/usr/bin/env bash
APP_DIR="/usr/local/share/robos/issue-manager"
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
cd "$APP_DIR"
exec node_modules/.bin/electron . "$@"
