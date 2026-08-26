#!/usr/bin/env bash
# Install host development dependencies for all components of RobOS.
# 
# Usage:
#   bash scripts/install-dev-deps.sh          # Install all dependencies
#   bash scripts/install-dev-deps.sh --check  # Check missing dependencies only
#   bash scripts/install-dev-deps.sh --sys    # Install system (apt) dependencies only
#   bash scripts/install-dev-deps.sh --npm    # Install npm package dependencies only

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CHECK_ONLY=false
SYS_ONLY=false
NPM_ONLY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --check)
            CHECK_ONLY=true
            shift
            ;;
        --sys)
            SYS_ONLY=true
            shift
            ;;
        --npm)
            NPM_ONLY=true
            shift
            ;;
        *)
            echo "Unknown argument: $1" >&2
            echo "Usage: $0 [--check|--sys|--npm]" >&2
            exit 1
            ;;
    esac
done

echo "====================================================="
echo "        RobOS Dev Machine Dependency Setup           "
echo "====================================================="
echo ""

# Function: Resolve package name (handles t64 transition on Ubuntu 24.04+ / 26.04+)
resolve_pkg() {
    local base_pkg="$1"
    if dpkg -s "$base_pkg" &>/dev/null; then
        echo "$base_pkg"
    elif dpkg -s "${base_pkg}t64" &>/dev/null; then
        echo "${base_pkg}t64"
    elif apt-cache policy "${base_pkg}t64" 2>/dev/null | grep -q "Candidate:" && ! apt-cache policy "${base_pkg}t64" 2>/dev/null | grep -q "Candidate: (none)"; then
        echo "${base_pkg}t64"
    else
        echo "$base_pkg"
    fi
}

# Base required system APT packages categorized by RobOS component
BASE_APT_DEPS=(
    # --- 1. QEMU / KVM & VM Building Tools ---
    qemu-system-x86
    qemu-utils
    xorriso
    genisoimage
    wget
    python3
    gettext-base   # Provides envsubst
    pass           # GPG password store for credentials
    virt-viewer    # SPICE viewer for VM display

    # --- 2. Electron & Desktop GUI Runtime Libraries ---
    libgtk-3-0
    libnotify4
    libnss3
    libxss1
    libxtst6
    xdg-utils
    libatspi2.0-0
    libdrm2
    libgbm1
    libasound2
    libsecret-1-0
    libsecret-1-dev

    # --- 3. Java & IDE Plugin Development ---
    openjdk-17-jdk
    gradle

    # --- 4. Automation & Video Recording Tools ---
    xdotool
    wmctrl
    x11-utils
    ffmpeg
    curl
    gnupg
)

# -----------------------------------------------------------------------------
# Function: Check system dependencies
# -----------------------------------------------------------------------------
check_dependencies() {
    echo "[?] Checking host system dependencies..."
    local missing=()

    for base_pkg in "${BASE_APT_DEPS[@]}"; do
        local pkg
        pkg=$(resolve_pkg "$base_pkg")
        if ! dpkg -s "$pkg" &>/dev/null; then
            missing+=("$pkg")
        fi
    done

    # Check Node.js
    if command -v node &>/dev/null; then
        NODE_VER=$(node -v)
        echo "  [✓] Node.js installed: $NODE_VER"
    else
        echo "  [✗] Node.js is NOT installed"
    fi

    # Check KVM group
    if groups "$USER" 2>/dev/null | grep -q '\bkvm\b'; then
        echo "  [✓] User '$USER' is in 'kvm' group"
    else
        echo "  [✗] User '$USER' is NOT in 'kvm' group"
    fi

    if [ ${#missing[@]} -eq 0 ]; then
        echo "  [✓] All required APT packages are installed!"
    else
        echo "  [✗] Missing ${#missing[@]} APT package(s): ${missing[*]}"
    fi

    echo ""
}

if [ "$CHECK_ONLY" = true ]; then
    check_dependencies
    exit 0
fi

# -----------------------------------------------------------------------------
# Step 1: Install APT System Dependencies
# -----------------------------------------------------------------------------
if [ "$NPM_ONLY" = false ]; then
    echo "[1/4] Installing system APT packages for RobOS components..."
    
    if command -v apt-get &>/dev/null; then
        echo "Updating package lists..."
        sudo apt-get update -qq
        
        RESOLVED_APT_DEPS=()
        for base_pkg in "${BASE_APT_DEPS[@]}"; do
            RESOLVED_APT_DEPS+=("$(resolve_pkg "$base_pkg")")
        done
        
        echo "Installing APT packages: ${RESOLVED_APT_DEPS[*]}"
        sudo apt-get install -y "${RESOLVED_APT_DEPS[@]}"
    else
        echo "WARNING: apt-get not found. Please install required packages manually." >&2
    fi

    echo ""

    # Ensure user is added to kvm group
    echo "[2/4] Configuring KVM user permissions..."
    if getent group kvm &>/dev/null; then
        if ! groups "$USER" 2>/dev/null | grep -q '\bkvm\b'; then
            echo "Adding $USER to kvm group..."
            sudo usermod -aG kvm "$USER" || true
            echo "  Added $USER to kvm group (re-login or run 'newgrp kvm' to apply)."
        else
            echo "  User $USER is already in kvm group."
        fi
    fi

    echo ""
fi

# -----------------------------------------------------------------------------
# Step 2: Node.js Verification
# -----------------------------------------------------------------------------
if [ "$SYS_ONLY" = false ]; then
    echo "[3/4] Verifying Node.js environment..."
    if ! command -v node &>/dev/null; then
        echo "Node.js not found! Installing Node.js 20 LTS via Nodesource..."
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --overwrite
        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
        sudo apt-get update -qq
        sudo apt-get install -y nodejs
    fi
    echo "  Node.js version: $(node -v)"
    echo "  NPM version:     $(npm -v)"
    echo ""

    # -----------------------------------------------------------------------------
    # Step 3: RobOS Packages NPM Dependencies
    # -----------------------------------------------------------------------------
    echo "[4/4] Installing npm dependencies across RobOS packages..."

    # Install dev harness & root packages if package.json exists
    if [ -f "$REPO_ROOT/installer/package.json" ]; then
        echo "  Installing installer dependencies..."
        (cd "$REPO_ROOT/installer" && npm install --quiet)
    fi

    for pkg_json in "$REPO_ROOT"/packages/*/package.json; do
        if [ -f "$pkg_json" ]; then
            pkg_dir="$(dirname "$pkg_json")"
            pkg_name="$(basename "$pkg_dir")"
            # Only run npm install if dependencies or devDependencies exist
            if grep -qE '"dependencies"|"devDependencies"' "$pkg_json"; then
                echo "  Installing dependencies for package: $pkg_name..."
                (cd "$pkg_dir" && npm install --quiet)
            fi
        fi
    done

    echo ""
fi

echo "====================================================="
echo "  RobOS Dev Machine Dependency Installation Complete! "
echo "====================================================="
echo ""
echo "Next steps:"
echo "  1. Build QEMU VM disk image:  infra/desktop/build.sh"
echo "  2. Launch first-boot VM:      infra/desktop/run.sh --firstboot"
echo "  3. Test apps in dev-harness:  node packages/robos-test/lib/harness.js --list-apps"
