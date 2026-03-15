#!/usr/bin/env bash
DISPLAY="${DISPLAY:-:0}" exec /usr/local/share/robos/pass-unlock/node_modules/electron/dist/electron \
  /usr/local/share/robos/pass-unlock --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"
