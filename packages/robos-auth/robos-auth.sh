#!/usr/bin/env bash
DISPLAY=:0 exec node /usr/local/share/robos/robos-auth/node_modules/.bin/electron \
  /usr/local/share/robos/robos-auth --no-sandbox --disable-gpu "$@"
