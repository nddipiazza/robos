#!/usr/bin/env bash
# clip-sync.sh — bidirectional clipboard sync between host and RobOS VM
#
# Usage:
#   ./infra/desktop/clip-sync.sh            # default SSH port 2224
#   ./infra/desktop/clip-sync.sh --port 2224
#
# Keeps running in the foreground. Ctrl+C to stop.
# Requires: xclip on host, xclip + DISPLAY in VM.

set -euo pipefail

SSH_PORT=2224
for arg in "$@"; do
  case "$arg" in
    --port) shift; SSH_PORT="${1:-2224}" ;;
    --port=*) SSH_PORT="${arg#--port=}" ;;
  esac
done

SSH_BASE="-o StrictHostKeyChecking=no -o ConnectTimeout=3 -o BatchMode=yes"
CTRL_SOCK="/tmp/robos-clip-ctrl-$$"
INTERVAL=0.6

HOST_PREV=""
VM_PREV=""
HOST_XCLIP_PID=""

cleanup() {
  echo ""
  echo "==> Stopping clipboard sync..."
  [ -n "${HOST_XCLIP_PID:-}" ] && kill "$HOST_XCLIP_PID" 2>/dev/null || true
  ssh $SSH_BASE -S "$CTRL_SOCK" -O exit robos@localhost 2>/dev/null || true
  rm -f "$CTRL_SOCK"
  exit 0
}
trap cleanup EXIT INT TERM

# ── Open a persistent SSH control-master connection ───────────────────────────
echo "==> RobOS clipboard sync — connecting to SSH port $SSH_PORT..."
ssh $SSH_BASE -M -S "$CTRL_SOCK" -N -p "$SSH_PORT" robos@localhost &
CTRL_PID=$!

# Wait for control master to be ready
for i in $(seq 1 15); do
  if ssh $SSH_BASE -S "$CTRL_SOCK" -O check robos@localhost 2>/dev/null; then
    echo "==> Connected. Clipboard sync is active (Ctrl+C to stop)"
    echo ""
    break
  fi
  sleep 1
  if [ $i -eq 15 ]; then
    echo "ERROR: could not connect to VM on port $SSH_PORT"
    exit 1
  fi
done

vm_run() {
  ssh $SSH_BASE -S "$CTRL_SOCK" robos@localhost "$1" 2>/dev/null || true
}

# ── Sync loop ─────────────────────────────────────────────────────────────────
while true; do

  # ── Host → VM ───────────────────────────────────────────────────────────────
  HOST_CLIP=$(timeout 0.3 xclip -selection clipboard -o 2>/dev/null || true)
  if [ -n "$HOST_CLIP" ] && [ "$HOST_CLIP" != "$HOST_PREV" ]; then
    HOST_PREV="$HOST_CLIP"
    # Write to temp file in VM, then set clipboard (nohup keeps xclip alive
    # after the SSH session closes so apps in the VM can paste)
    printf '%s' "$HOST_CLIP" \
      | vm_run 'cat > /tmp/.robos-clip; pgrep -x xclip | xargs -r kill 2>/dev/null; DISPLAY=:0 nohup xclip -selection clipboard < /tmp/.robos-clip >/dev/null 2>&1 & disown'
    SHORT=$(printf '%s' "$HOST_CLIP" | head -c 60 | tr '\n' ' ')
    echo "[host→vm] ${SHORT}..."
  fi

  # ── VM → Host ───────────────────────────────────────────────────────────────
  VM_CLIP=$(vm_run 'timeout 0.3 DISPLAY=:0 xclip -selection clipboard -o 2>/dev/null || true')
  if [ -n "$VM_CLIP" ] && [ "$VM_CLIP" != "$VM_PREV" ]; then
    VM_PREV="$VM_CLIP"
    # Kill old host xclip owner, set new clipboard
    [ -n "${HOST_XCLIP_PID:-}" ] && kill "$HOST_XCLIP_PID" 2>/dev/null || true
    printf '%s' "$VM_CLIP" | xclip -selection clipboard -i &
    HOST_XCLIP_PID=$!
    SHORT=$(printf '%s' "$VM_CLIP" | head -c 60 | tr '\n' ' ')
    echo "[vm→host] ${SHORT}..."
  fi

  sleep "$INTERVAL"
done
