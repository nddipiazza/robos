# Build the RobOS VM

Build the RobOS QEMU disk image and cloud-init seed ISO from scratch.

## Input

$ARGUMENTS — Optional: `--clean` to delete existing output/ and rebuild from scratch.

## Steps

### 1. Check if VM is running

```bash
pgrep -af 'qemu.*robos'
```

If running, tell the user to stop the VM first (`/stop-vm`) before rebuilding.

### 2. Clean (if requested)

If `--clean` was passed:
```bash
rm -rf infra/desktop/output/
```

### 3. Check prerequisites

Verify required tools are installed:
```bash
which qemu-img qemu-system-x86_64 wget python3
which xorriso || which genisoimage
```

Report any missing tools.

### 4. Run the build

```bash
cd infra/desktop && bash build.sh 2>&1
```

This will:
- Download Ubuntu 22.04 cloud image (if not cached)
- Create 200GB sparse qcow2 disk
- Generate cloud-init seed ISO

### 5. Verify output

```bash
ls -lh infra/desktop/output/robos.qcow2 infra/desktop/output/seed.iso
```

### 6. Report

- Disk image size
- Seed ISO created
- Next step: run `/start-vm --firstboot` for initial provisioning
