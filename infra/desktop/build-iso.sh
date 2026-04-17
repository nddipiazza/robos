#!/usr/bin/env bash
# Build a RobOS installer ISO from Ubuntu Server 22.04.
#
# Clones the Ubuntu Server ISO and injects autoinstall config + RobOS packages.
# The resulting ISO is a bootable installer that installs RobOS unattended.
#
# Usage:  bash infra/desktop/build-iso.sh
# Output: infra/desktop/output/robos.iso

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
VERSION=$(cat "$REPO_ROOT/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "dev")

UBUNTU_ISO_URL="https://releases.ubuntu.com/22.04.5/ubuntu-22.04.5-live-server-amd64.iso"
UBUNTU_ISO="$OUTPUT_DIR/ubuntu-22.04.5-server-amd64.iso"
ROBOS_ISO="$OUTPUT_DIR/robos.iso"

for cmd in xorriso wget; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd is required. Install with: sudo apt-get install xorriso wget" >&2
    exit 1
  fi
done

mkdir -p "$OUTPUT_DIR"

echo "============================================"
echo "  RobOS ISO Builder v${VERSION}"
echo "============================================"
echo ""

# ── Step 1: Download Ubuntu Server ISO ────────────────────────────────────────

if [ -f "$UBUNTU_ISO" ]; then
  echo "[1/4] Using cached Ubuntu Server ISO: $(du -sh "$UBUNTU_ISO" | cut -f1)"
else
  echo "[1/4] Downloading Ubuntu Server 22.04.5 LTS (~1.8 GB)..."
  wget -q --show-progress -O "$UBUNTU_ISO" "$UBUNTU_ISO_URL"
fi

# ── Step 2: Build RobOS packages tarball ──────────────────────────────────────

echo "[2/4] Building RobOS packages tarball..."
PACKAGES_TAR="$OUTPUT_DIR/robos-packages-iso.tar.gz"
tar -czf "$PACKAGES_TAR" \
  --exclude='node_modules' --exclude='.git' --exclude='__pycache__' \
  -C "$REPO_ROOT/packages" .
echo "  Packages: $(du -sh "$PACKAGES_TAR" | cut -f1)"

# ── Step 3: Prepare autoinstall files ─────────────────────────────────────────

echo "[3/4] Preparing autoinstall files..."
STAGING="$OUTPUT_DIR/iso-staging"
rm -rf "$STAGING"
mkdir -p "$STAGING/autoinstall"

# Autoinstall config
cp "$SCRIPT_DIR/autoinstall.yaml" "$STAGING/autoinstall/user-data"
touch "$STAGING/autoinstall/meta-data"

# Provisioner script
cp "$SCRIPT_DIR/robos-provision.sh" "$STAGING/robos-provision.sh"

# Logo
[ -f "$REPO_ROOT/logo-ascii.png" ] && cp "$REPO_ROOT/logo-ascii.png" "$STAGING/robos-logo.png"

# Packages tarball
cp "$PACKAGES_TAR" "$STAGING/robos-packages.tar.gz"

echo "  Staged: autoinstall config, provisioner, packages, logo"

# ── Step 4: Clone ISO and inject files ────────────────────────────────────────

echo "[4/4] Cloning ISO and injecting RobOS files..."

# Extract GRUB config from original, patch for autoinstall
GRUB_TMP="$OUTPUT_DIR/grub-patch.cfg"
xorriso -osirrox on -indev "$UBUNTU_ISO" -extract /boot/grub/grub.cfg "$GRUB_TMP" 2>/dev/null
chmod u+w "$GRUB_TMP"
sed -i 's|---| autoinstall ds=nocloud\;s=/cdrom/autoinstall/ ---|' "$GRUB_TMP"
sed -i 's/set timeout=.*/set timeout=5/' "$GRUB_TMP"

# Clone the ISO and inject all RobOS files + patched GRUB in one pass
cp "$UBUNTU_ISO" "$ROBOS_ISO"

MAP_LOGO=""
[ -f "$STAGING/robos-logo.png" ] && MAP_LOGO="-map $STAGING/robos-logo.png /robos-logo.png"

xorriso -indev "$ROBOS_ISO" -outdev "$ROBOS_ISO" \
  -volid "RobOS_v${VERSION}" \
  -map "$STAGING/autoinstall" /autoinstall \
  -map "$STAGING/robos-packages.tar.gz" /robos-packages.tar.gz \
  -map "$STAGING/robos-provision.sh" /robos-provision.sh \
  $MAP_LOGO \
  -map "$GRUB_TMP" /boot/grub/grub.cfg \
  -boot_image any replay \
  -commit 2>&1 | tail -5

rm -f "$GRUB_TMP" "$PACKAGES_TAR"
rm -rf "$STAGING"

ISO_SIZE=$(du -sh "$ROBOS_ISO" | cut -f1)

echo ""
echo "============================================"
echo "  RobOS ISO built: $ISO_SIZE"
echo "============================================"
echo ""
echo "  Output: $ROBOS_ISO"
echo ""
echo "  Flash to USB:"
echo "    Linux:   sudo dd if=$ROBOS_ISO of=/dev/sdX bs=4M status=progress"
echo "    Mac:     Use balenaEtcher"
echo "    Windows: Use Rufus or balenaEtcher"
