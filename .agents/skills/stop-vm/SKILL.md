---
name: stop-vm
description: Gracefully shut down or terminate the RobOS QEMU virtual machine.
---

# Stop the RobOS VM

Gracefully shut down the RobOS QEMU virtual machine.

## Steps

### 1. Check if VM is running

```bash
pgrep -af 'qemu.*robos'
```

If not running, inform the user and stop.

### 2. Graceful shutdown via SSH

Try a clean shutdown first:

```bash
ssh -p 2224 -o StrictHostKeyChecking=no -o ConnectTimeout=5 robos@localhost 'sudo shutdown now' 2>/dev/null
```

### 3. Wait for process to exit

Wait up to 30 seconds for the QEMU process to terminate:

```bash
for i in $(seq 1 6); do
  pgrep -f 'qemu.*robos' || break
  sleep 5
done
```

### 4. Force kill if still running

If the process is still alive after 30 seconds:

```bash
kill $(pgrep -f 'qemu.*robos')
```

### 5. Confirm shutdown

Verify the QEMU process is gone and report to the user.
