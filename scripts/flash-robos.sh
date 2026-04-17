#!/usr/bin/env bash
# Flash the RobOS installer ISO to a USB drive or external disk.
#
# Downloads the ISO from GitHub Releases if not found locally,
# then writes it to the target device.
#
# Usage:
#   sudo bash scripts/flash-robos.sh /dev/sdX
#   sudo bash scripts/flash-robos.sh /dev/sda1        # partition
#   sudo bash scripts/flash-robos.sh /dev/sda          # whole disk
#   bash scripts/flash-robos.sh --dry-run /dev/sdX     # show what would happen
#
# The ISO is cached at infra/desktop/output/robos.iso after first download.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ISO_PATH="$REPO_ROOT/infra/desktop/output/robos.iso"
VERSION=$(cat "$REPO_ROOT/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "latest")

DRY_RUN=false
TARGET=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    /dev/*) TARGET="$arg" ;;
    *)
      echo "Usage: sudo bash $0 [--dry-run] /dev/sdX" >&2
      echo "" >&2
      echo "Examples:" >&2
      echo "  sudo bash $0 /dev/sda        # whole disk" >&2
      echo "  sudo bash $0 /dev/sdb1       # partition" >&2
      echo "  bash $0 --dry-run /dev/sda   # preview only" >&2
      exit 1
      ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "ERROR: No target device specified." >&2
  echo "" >&2
  echo "Available block devices:" >&2
  lsblk -d -o NAME,SIZE,MODEL,TRAN 2>/dev/null | head -20 >&2
  echo "" >&2
  echo "Usage: sudo bash $0 /dev/sdX" >&2
  exit 1
fi

echo "============================================"
echo "  RobOS USB Installer"
echo "============================================"
echo ""

# ── Step 1: Get the ISO ───────────────────────────────────────────────────────

if [ -f "$ISO_PATH" ]; then
  echo "[1/3] Using local ISO: $(du -sh "$ISO_PATH" | cut -f1)"
else
  echo "[1/3] ISO not found locally. Building..."
  echo "  Run: bash infra/desktop/build-iso.sh"
  echo "  Or download from: https://github.com/nddipiazza/robos/releases"

  # Try to build it
  if [ -f "$REPO_ROOT/infra/desktop/build-iso.sh" ]; then
    echo "  Building now..."
    bash "$REPO_ROOT/infra/desktop/build-iso.sh"
  else
    echo "ERROR: Cannot find build-iso.sh or robos.iso" >&2
    exit 1
  fi

  if [ ! -f "$ISO_PATH" ]; then
    echo "ERROR: ISO build failed" >&2
    exit 1
  fi
fi

# ── Step 2: Confirm target ───────────────────────────────────────────────────

echo "[2/3] Target device: $TARGET"
echo ""

if [ -b "$TARGET" ]; then
  echo "  Device info:"
  lsblk "$TARGET" -o NAME,SIZE,MODEL,FSTYPE,MOUNTPOINT 2>/dev/null | sed 's/^/    /'
else
  echo "  WARNING: $TARGET is not a block device" >&2
fi

echo ""

# Check if device is mounted
if mount | grep -q "$TARGET"; then
  MOUNT_POINT=$(mount | grep "$TARGET" | awk '{print $3}')
  echo "  WARNING: $TARGET is mounted at $MOUNT_POINT"
  if [ "$DRY_RUN" = false ]; then
    echo "  Unmounting..."
    umount "$TARGET" || { echo "ERROR: Failed to unmount $TARGET" >&2; exit 1; }
  fi
fi

ISO_SIZE=$(du -sh "$ISO_PATH" | cut -f1)

echo "  ┌─────────────────────────────────────────────┐"
echo "  │  THIS WILL ERASE ALL DATA ON $TARGET  │"
echo "  │  Writing: robos.iso ($ISO_SIZE)                   │"
echo "  └─────────────────────────────────────────────┘"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would run:"
  echo "  dd if=$ISO_PATH of=$TARGET bs=4M status=progress conv=fdatasync"
  echo ""
  echo "No changes made."
  exit 0
fi

# Check we're root
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Must run as root. Use: sudo bash $0 $TARGET" >&2
  exit 1
fi

read -p "  Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

# ── Step 3: Flash ─────────────────────────────────────────────────────────────

echo ""
echo "[3/3] Flashing RobOS ISO to $TARGET..."
echo "  This will take a few minutes..."
echo ""

dd if="$ISO_PATH" of="$TARGET" bs=4M status=progress conv=fdatasync

sync

echo ""
echo "============================================"
echo "  RobOS flashed to $TARGET"
echo "============================================"
echo ""
echo "  Next steps:"
echo "    1. Remove the USB drive"
echo "    2. Insert into the target laptop"
echo "    3. Boot from USB (F12/F2 at BIOS splash)"
echo "    4. Wait ~15-20 minutes for installation"
echo "    5. Login: robos / robos"
