#!/usr/bin/env bash
export DISPLAY=:0
export HOME=/home/robos
exec /usr/local/share/robos/work-journal/node_modules/electron/dist/electron \
  /usr/local/share/robos/tech-workbench/main.js "$@"
