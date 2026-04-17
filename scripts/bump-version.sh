#!/usr/bin/env bash
# Bump the RobOS version. Updates VERSION file, all package.json files, and creates a git tag.
#
# Usage:
#   bash scripts/bump-version.sh patch   # 0.0.1 → 0.0.2
#   bash scripts/bump-version.sh minor   # 0.0.1 → 0.1.0
#   bash scripts/bump-version.sh major   # 0.0.1 → 1.0.0
#   bash scripts/bump-version.sh 1.2.3   # Set explicit version

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$REPO_ROOT/VERSION"

if [ ! -f "$VERSION_FILE" ]; then
  echo "ERROR: VERSION file not found at $VERSION_FILE" >&2
  exit 1
fi

CURRENT=$(cat "$VERSION_FILE" | tr -d '[:space:]')
echo "Current version: $CURRENT"

# Parse current version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

BUMP="${1:-patch}"

case "$BUMP" in
  patch)
    PATCH=$((PATCH + 1))
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  [0-9]*)
    # Explicit version
    IFS='.' read -r MAJOR MINOR PATCH <<< "$BUMP"
    ;;
  *)
    echo "Usage: $0 patch|minor|major|<version>" >&2
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Update VERSION file
echo "$NEW_VERSION" > "$VERSION_FILE"

# Update all package.json files
for pkg in "$REPO_ROOT"/packages/*/package.json; do
  if [ -f "$pkg" ]; then
    # Use node for reliable JSON editing
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
      p.version = '$NEW_VERSION';
      fs.writeFileSync('$pkg', JSON.stringify(p, null, 2) + '\n');
    "
  fi
done

echo ""
echo "Updated:"
echo "  VERSION → $NEW_VERSION"
echo "  $(ls "$REPO_ROOT"/packages/*/package.json | wc -l) package.json files"
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m 'chore: bump version to $NEW_VERSION'"
echo "  git tag v$NEW_VERSION"
echo "  git push && git push --tags"
