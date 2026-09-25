---
name: start-vm
description: Start the RobOS QEMU virtual machine with optional display flags (--firstboot, --vnc, --spice, --headless).
---

# Start the RobOS VM

Start the RobOS QEMU virtual machine.

## Input

$ARGUMENTS — Optional flags: `--firstboot` (attach cloud-init seed ISO for first-time provisioning), `--vnc` (VNC display on port 5912), `--spice` (SPICE-only display on port 5932), `--headless` (no display). Default is GTK display with SPICE clipboard sharing.

## Steps

### 1. Check if VM is already running

```bash
pgrep -f 'qemu.*robos' && echo "VM already running" || echo "VM not running"
```

If running, inform the user and stop. Do NOT start a second instance.

### 2. Verify disk image exists

```bash
ls -lh infra/desktop/output/robos.qcow2
```

If missing, tell the user to run `infra/desktop/build.sh` first.

### 3. Start the VM

Run the start script from the repo root. Use `--firstboot` only if the user explicitly requested it or if this is the first boot after a build.

```bash
cd infra/desktop && bash run.sh $ARGUMENTS
```

Run this in the **background** — the VM process is long-lived.

### 4. Wait for SSH to become available

Poll SSH connectivity (max 60 seconds, check every 5 seconds):

```bash
for i in $(seq 1 12); do
  ssh -p 2224 -o StrictHostKeyChecking=no -o ConnectTimeout=3 robos@localhost 'echo SSH_OK' 2>/dev/null && break
  sleep 5
done
```

### 5. Report status

Once SSH is up, report:
- VM is running (PID)
- SSH available on port 2224
- Display mode (GTK/VNC/SPICE/headless)
- If `--firstboot`: remind user that cloud-init provisioning takes several minutes and they can monitor with `tail -f /tmp/robos-gnome-serial.log`
