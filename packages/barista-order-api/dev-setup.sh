#!/usr/bin/env bash
# Automated developer setup for Barista Order API
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> Barista Order API (robos:Microservice) — barista-api.robos.internal"
command -v node >/dev/null 2>&1 || { echo "Error: Node.js 20+ is required"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "Error: git is required"; exit 1; }
[ -f package.json ] && npm install --quiet
echo "✓ Environment verified"
