#!/usr/bin/env bash
# Automated developer setup for Urban Plant Tracker
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> Urban Plant Tracker (robos:FrontEndApp) — urbanplanttracker.com"
command -v node >/dev/null 2>&1 || { echo "Error: Node.js 20+ is required"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "Error: git is required"; exit 1; }
[ -f package.json ] && npm install --quiet
[ -f .env.local ] || { cp .env.example .env.local; echo "E2E_BYPASS_KEY=$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')" >> .env.local; }
npx playwright install chromium || echo "(optional) Playwright browser install failed; E2E needs it"
npm test
echo "✓ Ready. npm run dev → http://localhost:3000 (embedded Postgres, no setup)"
