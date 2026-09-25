---
name: vm-status
description: Check the current status of the RobOS QEMU VM, SSH reachability, memory, disk, display, and installed apps.
---

# RobOS VM Status

Check the current status of the RobOS VM.

## Steps

Run all checks in parallel where possible:

### 1. QEMU process

```bash
pgrep -af 'qemu.*robos'
```

Report: running (with PID) or not running.

### 2. SSH connectivity

```bash
ssh -p 2224 -o StrictHostKeyChecking=no -o ConnectTimeout=3 robos@localhost 'echo SSH_OK' 2>/dev/null
```

### 3. System info (if SSH is available)

```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost '
  echo "--- Uptime ---"
  uptime
  echo "--- Memory ---"
  free -h | head -2
  echo "--- Disk ---"
  df -h / | tail -1
  echo "--- Display ---"
  echo $DISPLAY
  echo "--- RobOS Apps ---"
  ls /usr/local/share/robos/ 2>/dev/null | wc -l
  echo "apps installed"
  echo "--- Desktop Files ---"
  ls /usr/share/applications/*.desktop 2>/dev/null | grep -v "^/usr/share/applications/[a-z]" | wc -l
  echo "robos .desktop files"
'
```

### 4. Disk image

```bash
ls -lh infra/desktop/output/robos.qcow2 2>/dev/null
```

### 5. Report

Summarize in a compact status block:
- VM: running/stopped
- SSH: available/unavailable
- Uptime, memory, disk usage
- Number of RobOS apps installed
- Disk image size
