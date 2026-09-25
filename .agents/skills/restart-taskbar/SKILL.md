---
name: restart-taskbar
description: Restart the robos-desktop taskbar dock and desktop-manager service inside the RobOS VM or local system.
---

# Restart RobOS Taskbar and Desktop Manager

Restart the `robos-desktop` taskbar dock and `desktop-manager` service inside the RobOS VM or local system.

## Steps

### 1. Send launch/restart command via Desktop Manager socket

If Desktop Manager is running, trigger taskbar launch/focus via socket IPC:

```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost "node -e 'const s = require(\"net\").connect(\"/run/user/1000/robos-dm.sock\", () => { s.write(JSON.stringify({launch: \"robos-desktop\"})); s.end(); });'"
```

### 2. Full process restart fallback (if socket unavailable)

```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost '
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/1000
export XAUTHORITY=$(find /run/user/1000 -name ".mutter-Xwaylandauth.*" 2>/dev/null | head -1)

nohup /usr/bin/electron /usr/local/share/robos/robos-desktop/main.js --no-sandbox --disable-gpu --disable-dev-shm-usage </dev/null >/tmp/desktop.log 2>&1 & disown
'
```

### 3. Verify process status

```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost "ps -ef | grep -E 'robos-desktop/main.js' | grep -v grep"
```
