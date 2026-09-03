#!/bin/bash
set -e

# 1. Initialize D-Bus session bus if not active
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
    eval $(dbus-launch --sh-syntax)
    export DBUS_SESSION_BUS_ADDRESS
fi

# 2. Start Xvfb virtual framebuffer on DISPLAY :99
export DISPLAY=:99
echo "[RobOS Docker E2E] Starting Xvfb on DISPLAY :99 (1920x1080 32-bit)..."
Xvfb :99 -screen 0 1920x1080x24+32 -ac +extension GLX +render -noreset >/dev/null 2>&1 &
XVFB_PID=$!

# Wait for Xvfb display to be ready
READY=0
for i in {1..30}; do
    if xset q >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 0.2
done

if [ $READY -eq 0 ]; then
    echo "[RobOS Docker E2E] ERROR: Xvfb failed to start on DISPLAY :99." >&2
    exit 1
fi
echo "[RobOS Docker E2E] Xvfb display :99 is ready."

# 3. Start Picom compositor for X11 transparency / RGBA rendering
if command -v picom >/dev/null 2>&1; then
    echo "[RobOS Docker E2E] Starting Picom compositor..."
    picom --backend xrender --no-fading-openclose >/dev/null 2>&1 &
elif command -v mutter >/dev/null 2>&1; then
    echo "[RobOS Docker E2E] Starting Mutter window manager..."
    mutter --replace >/dev/null 2>&1 &
fi

sleep 1

# 4. Link packages into /usr/local/share/robos for absolute path requires
if [ -d "/workspace/packages" ]; then
    mkdir -p /usr/local/share/robos
    for pkg in /workspace/packages/*; do
        if [ -d "$pkg" ]; then
            pkgname=$(basename "$pkg")
            ln -sf "$pkg" "/usr/local/share/robos/$pkgname"
        fi
    done
fi

# 5. Execute command
if [ $# -gt 0 ]; then
    echo "[RobOS Docker E2E] Executing command: $@"
    exec "$@"
else
    echo "[RobOS Docker E2E] Running default test suite in packages/robos-test..."
    cd /workspace/packages/robos-test && npm test
fi
