#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"

echo "🧹 Cleaning RobOS VM build artifacts..."

# 1. Stop any running RobOS QEMU instances
if pgrep -f "qemu-system-x86_64.*robos.qcow2" >/dev/null 2>&1; then
    echo "  Stopping running RobOS VM process..."
    pkill -f "qemu-system-x86_64.*robos.qcow2" || true
    sleep 1
fi

# 2. Remove generated VM disk and seed ISO
if [ -d "$OUTPUT_DIR" ]; then
    rm -f "$OUTPUT_DIR/robos.qcow2"
    rm -f "$OUTPUT_DIR/seed.iso"
    rm -f "$OUTPUT_DIR/user-data"
    rm -f "$OUTPUT_DIR/user-data.expanded"
    rm -f "$OUTPUT_DIR/meta-data"
    rm -f "$OUTPUT_DIR/robos-packages.tar.gz"
    rm -f "$OUTPUT_DIR/robos-logo.png"
    echo "  Removed robos.qcow2, seed.iso, and cloud-init packages."
fi

# 3. Handle --all argument to also wipe cached base OS image
if [[ "${1:-}" == "--all" ]]; then
    echo "  Removing cached base OS cloud image..."
    rm -f "$OUTPUT_DIR/resolute-server-cloudimg-amd64.img"
fi

echo "✓ VM cleanup complete."
echo ""
echo "To build and run a fresh VM:"
echo "  infra/desktop/build.sh"
echo "  infra/desktop/run.sh --firstboot"
