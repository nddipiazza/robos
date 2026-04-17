#!/usr/bin/env bash
# Build a versioned RobOS release locally.
#
# Produces:
#   release/robos-v<VERSION>-packages.tar.gz   — all RobOS packages
#   release/robos-v<VERSION>-seed.iso           — cloud-init seed ISO
#   release/robos-v<VERSION>.qcow2              — VM disk image (if --with-qcow2)
#   release/SHA256SUMS                          — checksums
#   release/RELEASE-NOTES.md                    — auto-generated from git log
#
# Usage:
#   bash scripts/release-build.sh              # Build packages + seed ISO
#   bash scripts/release-build.sh --with-qcow2 # Also build the full VM image
#   bash scripts/release-build.sh --dry-run    # Show what would be built

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION=$(cat "$REPO_ROOT/VERSION" | tr -d '[:space:]')
RELEASE_DIR="$REPO_ROOT/release"
INFRA_DIR="$REPO_ROOT/infra/desktop"
OUTPUT_DIR="$INFRA_DIR/output"

BUILD_QCOW2=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-qcow2) BUILD_QCOW2=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Usage: $0 [--with-qcow2] [--dry-run]"; exit 1 ;;
  esac
done

echo "============================================"
echo "  RobOS Release Build v$VERSION"
echo "============================================"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would produce:"
  echo "  release/robos-v${VERSION}-packages.tar.gz"
  echo "  release/robos-v${VERSION}-seed.iso"
  [ "$BUILD_QCOW2" = true ] && echo "  release/robos-v${VERSION}.qcow2"
  echo "  release/SHA256SUMS"
  echo "  release/RELEASE-NOTES.md"
  exit 0
fi

# Clean and create release dir
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# ── Step 1: Build packages tarball ────────────────────────────────────────────
echo "[1/5] Building packages tarball..."

cd "$REPO_ROOT"
tar czf "$RELEASE_DIR/robos-v${VERSION}-packages.tar.gz" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='__pycache__' \
  -C packages .

PKGS_SIZE=$(du -sh "$RELEASE_DIR/robos-v${VERSION}-packages.tar.gz" | cut -f1)
echo "  → robos-v${VERSION}-packages.tar.gz ($PKGS_SIZE)"

# ── Step 2: Build seed ISO (if build.sh infrastructure exists) ────────────────
echo "[2/5] Building seed ISO..."

if [ -f "$INFRA_DIR/build.sh" ]; then
  # Run the build script which produces seed.iso
  cd "$INFRA_DIR"
  bash build.sh 2>&1 | tail -5

  if [ -f "$OUTPUT_DIR/seed.iso" ]; then
    cp "$OUTPUT_DIR/seed.iso" "$RELEASE_DIR/robos-v${VERSION}-seed.iso"
    ISO_SIZE=$(du -sh "$RELEASE_DIR/robos-v${VERSION}-seed.iso" | cut -f1)
    echo "  → robos-v${VERSION}-seed.iso ($ISO_SIZE)"
  else
    echo "  ⚠ seed.iso not produced by build.sh — skipping"
  fi
else
  echo "  ⚠ infra/desktop/build.sh not found — skipping ISO"
fi

# ── Step 3: Copy qcow2 if requested ──────────────────────────────────────────
if [ "$BUILD_QCOW2" = true ]; then
  echo "[3/5] Copying qcow2 disk image..."
  if [ -f "$OUTPUT_DIR/robos.qcow2" ]; then
    cp "$OUTPUT_DIR/robos.qcow2" "$RELEASE_DIR/robos-v${VERSION}.qcow2"
    QCOW_SIZE=$(du -sh "$RELEASE_DIR/robos-v${VERSION}.qcow2" | cut -f1)
    echo "  → robos-v${VERSION}.qcow2 ($QCOW_SIZE)"
  else
    echo "  ⚠ robos.qcow2 not found — run build.sh first"
  fi
else
  echo "[3/5] Skipping qcow2 (use --with-qcow2 to include)"
fi

# ── Step 4: Generate checksums ────────────────────────────────────────────────
echo "[4/5] Generating checksums..."

cd "$RELEASE_DIR"
sha256sum robos-v${VERSION}* > SHA256SUMS 2>/dev/null || true
echo "  → SHA256SUMS"
cat SHA256SUMS

# ── Step 5: Generate release notes ────────────────────────────────────────────
echo "[5/5] Generating release notes..."

cd "$REPO_ROOT"
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

cat > "$RELEASE_DIR/RELEASE-NOTES.md" << NOTES
# RobOS v${VERSION}

## Installation

\`\`\`bash
# Download and extract packages
tar xzf robos-v${VERSION}-packages.tar.gz -C packages/

# Build the VM (requires QEMU/KVM)
infra/desktop/build.sh
infra/desktop/run.sh --firstboot
\`\`\`

## What's New

NOTES

if [ -n "$PREV_TAG" ]; then
  echo "Changes since $PREV_TAG:" >> "$RELEASE_DIR/RELEASE-NOTES.md"
  echo "" >> "$RELEASE_DIR/RELEASE-NOTES.md"
  git log "${PREV_TAG}..HEAD" --oneline --no-decorate >> "$RELEASE_DIR/RELEASE-NOTES.md"
else
  echo "Initial release." >> "$RELEASE_DIR/RELEASE-NOTES.md"
  echo "" >> "$RELEASE_DIR/RELEASE-NOTES.md"
  git log --oneline --no-decorate -20 >> "$RELEASE_DIR/RELEASE-NOTES.md"
fi

cat >> "$RELEASE_DIR/RELEASE-NOTES.md" << NOTES

## Checksums

\`\`\`
$(cat "$RELEASE_DIR/SHA256SUMS")
\`\`\`

## System Requirements

- QEMU/KVM with \`/dev/kvm\` access
- Node.js 20+
- 16 GB RAM, 100 GB disk space
NOTES

echo "  → RELEASE-NOTES.md"

echo ""
echo "============================================"
echo "  Release v$VERSION built successfully!"
echo "============================================"
echo ""
echo "Artifacts in: $RELEASE_DIR/"
ls -lh "$RELEASE_DIR/"
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m 'chore: release v$VERSION'"
echo "  git tag v$VERSION"
echo "  git push && git push --tags"
