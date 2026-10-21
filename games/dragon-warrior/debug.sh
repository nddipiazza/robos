#!/usr/bin/env bash
# debug.sh — launch Dragon Warrior in debug mode
exec "$(dirname "$0")/launch.sh" --debug "$@"
