#!/usr/bin/env bash
APP_DIR="/usr/local/share/robos/app-launcher"
cd "$APP_DIR" && exec node_modules/.bin/electron . "$@"
