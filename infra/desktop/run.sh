#!/usr/bin/env bash
# run.sh — launch the RobOS QEMU VM
#
# Usage:
#   ./infra/desktop/run.sh              # normal boot (GTK window, clipboard=on)
#   ./infra/desktop/run.sh --firstboot  # first boot: attach cloud-init ISO
#   ./infra/desktop/run.sh --vnc        # use VNC instead of display window
#   ./infra/desktop/run.sh --spice      # SPICE display (best clipboard support)
#                                       #   connect: remote-viewer spice://127.0.0.1:5932
#
# Requirements: qemu-system-x86_64, qemu-kvm (for KVM acceleration)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/output"
DISK_IMG="$OUT_DIR/robos.img"
CIDATA_ISO="$OUT_DIR/cidata.iso"

FIRST_BOOT=0
USE_VNC=0
USE_SPICE=0
VNC_PORT=5912
SPICE_PORT=5932

for arg in "$@"; do
  case "$arg" in
    --firstboot) FIRST_BOOT=1 ;;
    --vnc)       USE_VNC=1 ;;
    --spice)     USE_SPICE=1 ;;
  esac
done

if [[ ! -f "$DISK_IMG" ]]; then
  echo "ERROR: VM disk not found: $DISK_IMG"
  echo "       Run ./infra/desktop/build.sh first."
  exit 1
fi

# ── KVM acceleration ─────────────────────────────────────────────────────────
KVM_FLAGS=""
if [[ -r /dev/kvm ]]; then
  KVM_FLAGS="-enable-kvm -cpu host"
  echo "==> KVM acceleration: enabled"
else
  echo "==> KVM acceleration: not available (add user to 'kvm' group for speed)"
  KVM_FLAGS="-cpu qemu64"
fi

# ── Display ──────────────────────────────────────────────────────────────────
if [[ "$USE_SPICE" -eq 1 ]]; then
  # GTK window + SPICE server for clipboard via spice-vdagent in the guest.
  # The vdagent daemon inside the VM connects to the SPICE server automatically;
  # no separate SPICE viewer is needed for clipboard to work.
  DISPLAY_FLAGS="-display gtk,gl=off"
  SPICE_FLAGS="-spice port=${SPICE_PORT},addr=127.0.0.1,disable-ticketing=on -chardev spicevmc,id=vdagent,name=vdagent -device virtio-serial-pci -device virtserialport,chardev=vdagent,name=com.redhat.spice.0"
  echo "==> SPICE clipboard bridge: port $SPICE_PORT (host↔guest clipboard via spice-vdagent)"
  echo "    Ensure spice-vdagent is running inside the VM for clipboard to activate"
elif [[ "$USE_VNC" -eq 1 ]]; then
  DISPLAY_FLAGS="-display none -vnc 127.0.0.1:$(( VNC_PORT - 5900 ))"
  SPICE_FLAGS=""
  echo "==> VNC server: localhost:$VNC_PORT  (connect with: vncviewer localhost:$VNC_PORT)"
  echo "    Note: use --spice instead of --vnc for clipboard sharing support"
elif [[ -n "${DISPLAY:-}" ]]; then
  DISPLAY_FLAGS="-display gtk,gl=off"
  SPICE_FLAGS=""
else
  DISPLAY_FLAGS="-display sdl,gl=off"
  SPICE_FLAGS=""
fi

# ── Cloud-init ISO (first boot only) ─────────────────────────────────────────
CDROM_FLAGS=""
if [[ "$FIRST_BOOT" -eq 1 ]]; then
  if [[ ! -f "$CIDATA_ISO" ]]; then
    echo "ERROR: cloud-init ISO not found. Run ./infra/desktop/build.sh first."
    exit 1
  fi
  CDROM_FLAGS="-cdrom $CIDATA_ISO"
  echo "==> First boot mode: cloud-init ISO attached"
  echo "    Package installation will take ~5-10 minutes on first boot."
fi

# ── Launch ────────────────────────────────────────────────────────────────────
echo "==> Launching RobOS VM..."
echo "    Disk: $DISK_IMG"
echo ""

qemu-system-x86_64 \
  $KVM_FLAGS \
  -m 16G \
  -smp 4 \
  -hda "$DISK_IMG" \
  $CDROM_FLAGS \
  -net nic,model=virtio \
  -net user,hostfwd=tcp::2224-:22 \
  -vga virtio \
  $DISPLAY_FLAGS \
  ${SPICE_FLAGS} \
  -device virtio-balloon \
  -rtc base=localtime \
  -serial file:/tmp/robos-gnome-serial.log \
  -daemonize \
  -pidfile /tmp/robos-gnome-qemu.pid \
  -name "RobOS-Gnome"

echo ""
echo "==> VM launched (daemonized)"
echo "    VNC / display window: watch for the RobOS window on your desktop"
echo "    Serial log:           tail -f /tmp/robos-gnome-serial.log"
echo "    SSH (after boot):     ssh -p 2224 robos@localhost"
echo "    Stop VM:              kill \$(cat /tmp/robos-gnome-qemu.pid)"

# ── Copy host GitHub credentials into the VM (after SSH is ready) ─────────────
if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
  echo ""
  echo "==> Waiting for VM SSH to be ready (copying GitHub credentials)..."
  for i in $(seq 1 60); do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 -p 2224 robos@localhost true 2>/dev/null; then
      GH_TOKEN=$(gh auth token 2>/dev/null)
      GH_USER=$(gh api user --jq .login 2>/dev/null)
      if [[ -n "$GH_TOKEN" && -n "$GH_USER" ]]; then
        # Copy SSH key
        scp -q -o StrictHostKeyChecking=no -P 2222 \
          ~/.ssh/id_rsa ~/.ssh/id_rsa.pub robos@localhost:~/.ssh/ 2>/dev/null || true
        # Write gh hosts.yml directly (no keyring needed in VM)
        ssh -o StrictHostKeyChecking=no -p 2224 robos@localhost bash -s << SSHEOF
mkdir -p ~/.ssh ~/.config/gh
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_rsa ~/.ssh/id_rsa.pub 2>/dev/null || true
cat > ~/.config/gh/hosts.yml << GHEOF
github.com:
    git_protocol: ssh
    users:
        ${GH_USER}:
            oauth_token: ${GH_TOKEN}
    user: ${GH_USER}
    oauth_token: ${GH_TOKEN}
GHEOF
chmod 600 ~/.config/gh/hosts.yml
SSHEOF
        echo "    GitHub credentials copied for: $GH_USER"
      fi
      break
    fi
    sleep 2
  done
fi
