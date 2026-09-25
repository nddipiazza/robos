---
name: build-vm
description: Build the RobOS QEMU/KVM virtual machine disk image and cloud-init provisioning ISO from scratch.
---

# Build RobOS VM

Build the RobOS virtual machine from scratch using QEMU/KVM and cloud-init.

## Steps

### 1. Stop any running VM
```bash
infra/desktop/clean.sh
```

### 2. Build the disk image and cloud-init ISO
```bash
infra/desktop/build.sh
```

This will:
- Download the Ubuntu 26.04 cloud image (if not cached)
- Create a 100 GB sparse qcow2 disk image (`infra/desktop/robos.qcow2`)
- Generate the cloud-init ISO (`infra/desktop/cloud-init.iso`) with user-data and meta-data

### 3. Start the VM with first-boot provisioning
```bash
infra/desktop/run.sh
```

On first boot:
- The cloud-init ISO is automatically attached
- cloud-init provisions the system (desktop, apps, packages, users)
- Progress is shown on the splash screen
- Takes ~5-10 minutes depending on network speed

### 4. Monitor provisioning progress

Via SSH (once available, port 2224):
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost "tail -f /var/log/cloud-init-output.log"
```

Or check status:
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost "cloud-init status"
```

### 5. Subsequent boots

After provisioning completes, start normally (cloud-init ISO is not attached):
```bash
infra/desktop/run.sh
```

## Validation

- Verify VM boots to GNOME desktop with auto-login (user: `robos`)
- Verify SSH access: `ssh -p 2224 robos@localhost` (password: `robos`)
- Verify RobOS panel and app launcher are functional
- Verify cloud-init finished with `status: done`
