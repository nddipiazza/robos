# Install Dev Machine Dependencies

Audit, verify, and install all host development dependencies for every component of RobOS.

## Input

$ARGUMENTS — Optional flags:
- `--check`: Perform a dry-run check of system dependencies without installing anything.
- `--sys`: Install system (APT) packages and configure KVM group permissions only.
- `--npm`: Install NPM package dependencies across RobOS packages only.

## Components Covered

1. **QEMU / KVM Hypervisor & VM Building**: `qemu-system-x86`, `qemu-utils`, `xorriso`, `genisoimage`, `wget`, `python3`, `gettext-base` (`envsubst`), `pass`, `virt-viewer`, KVM user group permissions.
2. **Electron Runtime & GUI Libraries**: `libgtk-3-0`, `libnotify4`, `libnss3`, `libxss1`, `libxtst6`, `xdg-utils`, `libatspi2.0-0`, `libdrm2`, `libgbm1`, `libasound2`, `libsecret-1-0`, `libsecret-1-dev`.
3. **Java & IntelliJ Plugin Development**: `openjdk-17-jdk`, `gradle`.
4. **Desktop Automation & Video Recording**: `xdotool`, `wmctrl`, `x11-utils`, `ffmpeg`.
5. **Node.js & RobOS Package Dependencies**: Node.js 20+, npm package installations across `installer/` and `packages/*/`.

## Steps

### 1. Execute Dependency Setup Script

Run the automated dependency script:

```bash
bash scripts/install-dev-deps.sh $ARGUMENTS
```

### 2. Verify Installation Status

Run a dry-run preflight check:

```bash
bash scripts/install-dev-deps.sh --check
```

### 3. Report

Provide a summary of:
- Installed APT packages
- KVM group access status
- Node.js & NPM versions
- Installed package NPM dependencies
- Next steps for building and running RobOS (`infra/desktop/build.sh`, `infra/desktop/run.sh`, `dev-harness`)
