#!/usr/bin/env bash
DISPLAY=:0 exec node /usr/local/share/robos/group-dev-settings/node_modules/.bin/electron \
  /usr/local/share/robos/group-dev-settings --no-sandbox --disable-gpu "$@"
