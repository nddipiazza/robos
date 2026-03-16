#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
DISK_IMAGE="$OUTPUT_DIR/robos.qcow2"
SEED_ISO="$OUTPUT_DIR/seed.iso"
SERIAL_LOG="/tmp/robos-gnome-serial.log"

RAM="16G"
CPUS="$(nproc)"
SSH_PORT="2224"
VNC_PORT="5912"
SPICE_PORT="5932"

# --- Parse arguments ---
FIRSTBOOT=false
DISPLAY_MODE="gtk"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --firstboot)
            FIRSTBOOT=true
            shift
            ;;
        --vnc)
            DISPLAY_MODE="vnc"
            shift
            ;;
        --spice)
            DISPLAY_MODE="spice"
            shift
            ;;
        --headless)
            DISPLAY_MODE="none"
            shift
            ;;
        *)
            echo "Usage: $0 [--firstboot] [--vnc|--spice|--headless]"
            exit 1
            ;;
    esac
done

# --- Preflight ---
if [ ! -f "$DISK_IMAGE" ]; then
    echo "ERROR: Disk image not found: $DISK_IMAGE" >&2
    echo "Run build.sh first." >&2
    exit 1
fi

if [ "$FIRSTBOOT" = true ] && [ ! -f "$SEED_ISO" ]; then
    echo "ERROR: Seed ISO not found: $SEED_ISO" >&2
    echo "Run build.sh first." >&2
    exit 1
fi

# --- Build QEMU command ---
QEMU_ARGS=(
    qemu-system-x86_64
    -m "$RAM"
    -smp "$CPUS"
    -drive "file=$DISK_IMAGE,format=qcow2,if=virtio"
    -netdev "user,id=net0,hostfwd=tcp::${SSH_PORT}-:22"
    -device "virtio-net-pci,netdev=net0"
    -vga none
    -device "virtio-vga,xres=1920,yres=1080"
    -device virtio-serial-pci
    -chardev spicevmc,id=vdagent,debug=0,name=vdagent
    -device virtserialport,chardev=vdagent,name=com.redhat.spice.0
    -serial "file:$SERIAL_LOG"
)

# Enable KVM if available
if [ -e /dev/kvm ]; then
    QEMU_ARGS+=(-enable-kvm -cpu host)
else
    echo "WARNING: KVM not available, VM will be slow"
    QEMU_ARGS+=(-cpu qemu64)
fi

# Cloud-init ISO for first boot
if [ "$FIRSTBOOT" = true ]; then
    QEMU_ARGS+=(-drive "file=$SEED_ISO,format=raw,if=virtio,media=cdrom")
    echo "First boot mode: cloud-init ISO attached"
fi

# Display configuration
case "$DISPLAY_MODE" in
    gtk)
        QEMU_ARGS+=(-display gtk,show-menubar=off -spice port=${SPICE_PORT},disable-ticketing=on)
        echo "Clipboard sharing enabled via SPICE agent"
        ;;
    vnc)
        VNC_DISPLAY=$((VNC_PORT - 5900))
        QEMU_ARGS+=(-display none -vnc ":${VNC_DISPLAY}")
        echo "VNC available on port $VNC_PORT"
        ;;
    spice)
        QEMU_ARGS+=(-display none -spice "port=${SPICE_PORT},disable-ticketing=on")
        echo "SPICE available on port $SPICE_PORT (use remote-viewer spice://localhost:$SPICE_PORT)"
        ;;
    none)
        QEMU_ARGS+=(-display none)
        ;;
esac

echo "Starting RobOS VM..."
echo "  SSH:    ssh -p $SSH_PORT robos@localhost"
echo "  Serial: tail -f $SERIAL_LOG"
echo ""

exec "${QEMU_ARGS[@]}"
