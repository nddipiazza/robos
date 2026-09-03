#!/bin/bash
# Top-level helper script for RobOS Containerized Headless E2E Tests (Option 1)
# Usage:
#   ./scripts/e2e-container.sh                         # Run full test suite in Docker
#   ./scripts/e2e-container.sh --build                 # Rebuild image and run
#   ./scripts/e2e-container.sh node packages/robos-test/tests/agents-manager/e2e.test.js
#   ./scripts/e2e-container.sh --interactive           # Drop into bash shell inside container

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../infra/docker/run.sh" "$@"
