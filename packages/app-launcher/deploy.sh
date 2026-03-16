#!/usr/bin/env bash
set -euo pipefail

# Deploy RobOS App Launcher to the running VM
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_PORT="${SSH_PORT:-2224}"
SSH_HOST="${SSH_HOST:-robos@localhost}"
APP_DIR="/usr/local/share/robos/app-launcher"

echo "Deploying app-launcher to VM..."

# Copy app files
scp -P "$SSH_PORT" -o StrictHostKeyChecking=no \
  "$SCRIPT_DIR/package.json" \
  "$SCRIPT_DIR/main.js" \
  "$SCRIPT_DIR/preload.js" \
  "$SCRIPT_DIR/icon.svg" \
  "$SCRIPT_DIR/robos-app-launcher.desktop" \
  "$SSH_HOST:/tmp/"

scp -P "$SSH_PORT" -o StrictHostKeyChecking=no -r \
  "$SCRIPT_DIR/renderer" \
  "$SSH_HOST:/tmp/renderer"

ssh -p "$SSH_PORT" -o StrictHostKeyChecking=no "$SSH_HOST" bash << 'REMOTE'
sudo mkdir -p /usr/local/share/robos/app-launcher
sudo cp /tmp/package.json /tmp/main.js /tmp/preload.js /tmp/icon.svg /tmp/robos-app-launcher.desktop /usr/local/share/robos/app-launcher/
sudo cp -r /tmp/renderer /usr/local/share/robos/app-launcher/
sudo cp /tmp/robos-app-launcher.desktop /usr/share/applications/
cd /usr/local/share/robos/app-launcher && sudo npm install --production --quiet 2>&1 | tail -3
rm -rf /tmp/package.json /tmp/main.js /tmp/preload.js /tmp/icon.svg /tmp/robos-app-launcher.desktop /tmp/renderer
echo "App launcher deployed to $PWD"
REMOTE

echo "Done. Launch with: electron /usr/local/share/robos/app-launcher/main.js --no-sandbox --disable-gpu --disable-dev-shm-usage"
