#!/usr/bin/env bash
DISPLAY=:0 exec node /usr/local/share/robos/pass-manager/node_modules/.bin/electron \
  /usr/local/share/robos/pass-manager --no-sandbox --disable-gpu "$@"
