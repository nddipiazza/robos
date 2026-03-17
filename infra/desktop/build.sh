#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
CLOUD_INIT_DIR="$SCRIPT_DIR/cloud-init"

UBUNTU_IMAGE_URL="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img"
BASE_IMAGE="$OUTPUT_DIR/jammy-server-cloudimg-amd64.img"
DISK_IMAGE="$OUTPUT_DIR/robos.qcow2"
SEED_ISO="$OUTPUT_DIR/seed.iso"
DISK_SIZE="200G"

# --- Preflight checks ---
for cmd in qemu-img wget python3; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: $cmd is required but not found" >&2
        exit 1
    fi
done

# Need xorriso or genisoimage for cloud-init ISO
ISO_CMD=""
if command -v xorriso &>/dev/null; then
    ISO_CMD="xorriso"
elif command -v genisoimage &>/dev/null; then
    ISO_CMD="genisoimage"
else
    echo "ERROR: xorriso or genisoimage is required but not found" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# --- Download Ubuntu cloud image (cached) ---
if [ ! -f "$BASE_IMAGE" ]; then
    echo "Downloading Ubuntu 22.04 cloud image..."
    wget -q --show-progress -O "$BASE_IMAGE" "$UBUNTU_IMAGE_URL"
else
    echo "Using cached Ubuntu cloud image: $BASE_IMAGE"
fi

# --- Create disk image ---
echo "Creating ${DISK_SIZE} qcow2 disk..."
cp "$BASE_IMAGE" "$DISK_IMAGE"
qemu-img resize "$DISK_IMAGE" "$DISK_SIZE"

# --- Generate cloud-init files ---
python3 "$SCRIPT_DIR/gen-userdata.py"

# --- Bundle RobOS packages tarball ---
PACKAGES_DIR="$SCRIPT_DIR/../../packages"
PACKAGES_TAR="$OUTPUT_DIR/robos-packages.tar.gz"
echo "Bundling RobOS packages..."
tar -czf "$PACKAGES_TAR" -C "$PACKAGES_DIR" \
    --exclude='node_modules' --exclude='.git' \
    .
echo "  Packages tarball: $(du -h "$PACKAGES_TAR" | cut -f1)"

# --- Copy branding assets ---
LOGO_SRC="$SCRIPT_DIR/../../logo.png"
LOGO_DST="$OUTPUT_DIR/robos-logo.png"
if [ -f "$LOGO_SRC" ]; then
    cp "$LOGO_SRC" "$LOGO_DST"
    echo "  Logo included: robos-logo.png"
else
    echo "  WARNING: logo.png not found at repo root, skipping"
fi

# --- Build cloud-init seed ISO (includes packages tarball + logo) ---
echo "Building cloud-init seed ISO..."
ISO_FILES=("$OUTPUT_DIR/user-data" "$OUTPUT_DIR/meta-data" "$PACKAGES_TAR")
[ -f "$LOGO_DST" ] && ISO_FILES+=("$LOGO_DST")

if [ "$ISO_CMD" = "xorriso" ]; then
    xorriso -as genisoimage -output "$SEED_ISO" \
        -volid cidata -joliet -rock \
        "${ISO_FILES[@]}"
else
    genisoimage -output "$SEED_ISO" \
        -volid cidata -joliet -rock \
        "${ISO_FILES[@]}"
fi

echo ""
echo "Build complete!"
echo "  Disk image: $DISK_IMAGE"
echo "  Seed ISO:   $SEED_ISO"
echo ""
echo "Next steps:"
echo "  ./run.sh --firstboot    # First boot with cloud-init"
echo "  ./run.sh                # Subsequent boots"
