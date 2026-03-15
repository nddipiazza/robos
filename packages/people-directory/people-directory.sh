#!/usr/bin/env bash
DISPLAY=:0 exec node /usr/local/share/robos/people-directory/node_modules/.bin/electron \
  /usr/local/share/robos/people-directory --no-sandbox --disable-gpu "$@"
