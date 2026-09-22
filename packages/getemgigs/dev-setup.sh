#!/usr/bin/env bash
# Automated Developer Setup for The Gig Bandit (getemgigs.com)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "==> Setting up environment for The Gig Bandit..."
echo "==> Technology: Next.js 15 / React 19 / TailwindCSS (Vercel + GitHub)"
echo "==> Target Domain: getemgigs.com"

command -v node >/dev/null 2>&1 || { echo "Error: Node.js (v20+) is required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "Error: git is required"; exit 1; }

echo "==> Node version: $(node -v)"
echo "==> NPM version: $(npm -v)"

echo "==> Running automated test suite..."
npm test

echo "✓ Environment verification passed for getemgigs!"
echo "To start development server: npm run dev"
