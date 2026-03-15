#!/usr/bin/env bash
# build.sh — download Ubuntu 22.04 cloud image and prepare the RobOS QEMU disk
#
# Usage:  ./infra/desktop/build.sh
#
# Output: infra/desktop/output/robos.img   (20 GB qcow2 disk)
#         infra/desktop/output/cidata.iso   (cloud-init seed ISO)
#
# First boot will take ~5–10 min to install packages via cloud-init.
# Subsequent boots are fast.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$SCRIPT_DIR/output"
CI_DIR="$SCRIPT_DIR/cloud-init"

IMAGE_URL="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img"
BASE_IMG="$OUT_DIR/ubuntu-base.img"
DISK_IMG="$OUT_DIR/robos.img"
CIDATA_ISO="$OUT_DIR/cidata.iso"
DISK_SIZE="20G"

# ── Dependency check ─────────────────────────────────────────────────────────
check_dep() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: '$1' not found."
    echo "       Install with: sudo apt install $2"
    exit 1
  fi
}

check_dep qemu-img           "qemu-utils"
check_dep qemu-system-x86_64 "qemu-system-x86"
check_dep wget               "wget"
check_dep python3            "python3"

# ISO creation: prefer xorriso, fall back to genisoimage
if command -v xorriso &>/dev/null; then
  ISO_CMD="xorriso"
elif command -v genisoimage &>/dev/null; then
  ISO_CMD="genisoimage"
else
  echo "ERROR: need 'xorriso' or 'genisoimage'."
  echo "       Install with: sudo apt install xorriso"
  exit 1
fi

# ── Regenerate cloud-init user-data from source files ────────────────────────
echo "==> Regenerating cloud-init user-data..."
python3 "$SCRIPT_DIR/gen-userdata.py"

mkdir -p "$OUT_DIR"

# ── Download base image (cached) ─────────────────────────────────────────────
if [[ ! -f "$BASE_IMG" ]]; then
  echo "==> Downloading Ubuntu 22.04 cloud image (~600 MB)..."
  wget -O "$BASE_IMG" "$IMAGE_URL"
  echo "    Done."
else
  echo "==> Base image already present: $BASE_IMG"
fi

# ── Create VM disk (fresh copy + resize) ─────────────────────────────────────
echo "==> Creating VM disk ($DISK_SIZE)..."
cp "$BASE_IMG" "$DISK_IMG"
qemu-img resize "$DISK_IMG" "$DISK_SIZE"
echo "    Disk: $DISK_IMG"

# ── Build cloud-init seed ISO ─────────────────────────────────────────────────
echo "==> Building cloud-init ISO (using $ISO_CMD)..."
if [[ "$ISO_CMD" == "xorriso" ]]; then
  xorriso \
    -as mkisofs \
    -output "$CIDATA_ISO" \
    -volid cidata \
    -joliet \
    -rock \
    "$CI_DIR/user-data" \
    "$CI_DIR/meta-data"
else
  genisoimage \
    -output "$CIDATA_ISO" \
    -volid cidata \
    -joliet \
    -rock \
    "$CI_DIR/user-data" \
    "$CI_DIR/meta-data"
fi
echo "    ISO:  $CIDATA_ISO"

echo ""
echo "✓  Build complete."
echo ""
echo "   First boot (installs packages):  ./infra/desktop/run.sh --firstboot"
echo "   Normal boot:                     ./infra/desktop/run.sh"
echo ""
echo "   Login credentials:"
echo "     user:     robos"
echo "     password: robos"
echo "     session:  GNOME"
