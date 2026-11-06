#!/usr/bin/env bash
# Stage reference guides and their assets into the single rowbose.com site.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/sync-app-docs.js --check
node scripts/stage-site-guides.cjs
