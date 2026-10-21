#!/usr/bin/env bash
# 🐉 Dragon Warrior E2E Test Manager Launcher
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH="${SCRIPT_DIR}:${PYTHONPATH}"

echo "🚀 Starting Dragon Warrior E2E Test Manager..."
exec python3 "${SCRIPT_DIR}/tests/e2e/e2e_test_app.py" "$@"
