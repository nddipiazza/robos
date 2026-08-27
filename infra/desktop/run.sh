#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
DISK_IMAGE="$OUTPUT_DIR/robos.qcow2"
SEED_ISO="$OUTPUT_DIR/seed.iso"
SERIAL_LOG="/tmp/robos-gnome-serial.log"

RAM="16G"
NPROC="$(nproc)"
# Cap vCPUs to physical cores (half logical cores if >4) to prevent host thread starvation
if [ "$NPROC" -gt 4 ]; then
    CPUS=4
else
    CPUS="$NPROC"
fi
SSH_PORT="2224"
VNC_PORT="5912"
SPICE_PORT="5932"

# --- Parse arguments ---
DISPLAY_MODE="gtk"

while [[ $# -gt 0 ]]; do
    case "$1" in
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
            echo "Usage: $0 [--vnc|--spice|--headless]"
            exit 1
            ;;
    esac
done

FIRSTBOOT_MARKER="$OUTPUT_DIR/.firstboot_pending"
IS_FIRSTBOOT=false

if [ -f "$FIRSTBOOT_MARKER" ]; then
    IS_FIRSTBOOT=true
    rm -f "$FIRSTBOOT_MARKER" 2>/dev/null || true
fi

# --- Preflight ---
if [ ! -f "$DISK_IMAGE" ]; then
    echo "ERROR: Disk image not found: $DISK_IMAGE" >&2
    echo "Run build.sh first." >&2
    exit 1
fi

if [ "$IS_FIRSTBOOT" = true ]; then
    if [ ! -f "$SEED_ISO" ]; then
        echo "ERROR: Seed ISO not found for first boot: $SEED_ISO" >&2
        echo "Run build.sh first." >&2
        exit 1
    fi
    echo "⚡ First boot auto-detected: provisioning RobOS via cloud-init..."
fi

# --- Build QEMU command ---
QEMU_ARGS=(
    qemu-system-x86_64
    -m "$RAM"
    -smp "$CPUS"
    -drive "file=$DISK_IMAGE,format=qcow2,if=virtio,cache=writeback,discard=unmap"
    -netdev "user,id=net0,hostfwd=tcp::${SSH_PORT}-:22"
    -device "virtio-net-pci,netdev=net0"
    -serial "file:$SERIAL_LOG"
)

# Enable KVM if available
if [ -e /dev/kvm ]; then
    QEMU_ARGS+=(-enable-kvm -cpu host)
else
    echo "WARNING: KVM not available, VM will be slow"
    QEMU_ARGS+=(-cpu qemu64)
fi

# Attach cloud-init seed ISO ONLY during first-boot provisioning
if [ "$IS_FIRSTBOOT" = true ]; then
    QEMU_ARGS+=(-drive "file=$SEED_ISO,format=raw,if=virtio,media=cdrom")
    echo "Cloud-init ISO attached ($SEED_ISO)"
fi

# Display configuration
case "$DISPLAY_MODE" in
    gtk)
        QEMU_ARGS+=(
            -vga none
            -device "virtio-vga-gl,xres=1920,yres=1080"
            -global virtio-vga-gl.xres=1920
            -global virtio-vga-gl.yres=1080
            -display gtk,gl=on,show-menubar=off,zoom-to-fit=on
            -device virtio-serial-pci
            -chardev qemu-vdagent,id=vdagent,name=vdagent,clipboard=on
            -device virtserialport,chardev=vdagent,name=com.redhat.spice.0
        )
        echo "Clipboard sharing enabled via qemu-vdagent (3D VirGL acceleration active)"
        ;;
    vnc)
        VNC_DISPLAY=$((VNC_PORT - 5900))
        QEMU_ARGS+=(
            -vga none
            -device "virtio-vga,xres=1920,yres=1080"
            -display none
            -vnc ":${VNC_DISPLAY}"
            -device virtio-serial-pci
            -chardev qemu-vdagent,id=vdagent,name=vdagent,clipboard=on
            -device virtserialport,chardev=vdagent,name=com.redhat.spice.0
        )
        echo "VNC available on port $VNC_PORT (qemu-vdagent clipboard enabled)"
        ;;
    spice)
        QEMU_ARGS+=(
            -vga none
            -device "virtio-vga-gl,xres=1920,yres=1080"
            -display none
            -spice "port=${SPICE_PORT},disable-ticketing=on,gl=on"
            -device virtio-serial-pci
            -chardev spicevmc,id=vdagent,debug=0,name=vdagent
            -device virtserialport,chardev=vdagent,name=com.redhat.spice.0
        )
        echo "SPICE available on port $SPICE_PORT (use remote-viewer spice://localhost:$SPICE_PORT)"
        ;;
    none)
        QEMU_ARGS+=(
            -vga none
            -device "virtio-vga,xres=1920,yres=1080"
            -display none
            -device virtio-serial-pci
            -chardev qemu-vdagent,id=vdagent,name=vdagent,clipboard=on
            -device virtserialport,chardev=vdagent,name=com.redhat.spice.0
        )
        ;;
esac

echo "Starting RobOS VM..."
echo "  SSH:    ssh -p $SSH_PORT robos@localhost"
echo "  Serial: tail -f $SERIAL_LOG"
echo ""

if [ "$IS_FIRSTBOOT" = true ]; then
    "${QEMU_ARGS[@]}"
    echo ""
    echo "✓ First-boot provisioning complete! Booting into RobOS Desktop..."
    exec "$0" "$@"
else
    exec "${QEMU_ARGS[@]}"
fi
