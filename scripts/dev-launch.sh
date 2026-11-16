#!/usr/bin/env bash
# Launch a RobOS app from this checkout on macOS, Linux or Windows (Git Bash).
exec node "$(dirname "${BASH_SOURCE[0]}")/dev-launch.cjs" "$@"
