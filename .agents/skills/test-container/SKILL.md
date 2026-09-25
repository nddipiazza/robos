---
name: test-container
description: Run RobOS Electron desktop apps in an isolated Docker container with Xvfb and Picom/Mutter compositor.
---

# Run RobOS Containerized Headless E2E Tests

Run RobOS Electron desktop apps in an isolated Docker container powered by Xvfb and Picom/Mutter compositor. Fast, zero host side-effects, full DOM snapshot and health assertion support.

## Input

$ARGUMENTS — Optional test script or flags:
- (no args): runs standard full test suite (`packages/robos-test`)
- `--build`: rebuilds the Docker container image before running
- `node tests/agents-manager/e2e.test.js`: runs specific test file
- `-i`: drops into interactive bash shell in the Xvfb container

## Steps

### 1. Run the container test script

```bash
./scripts/e2e-container.sh $ARGUMENTS
```

### 2. Verify Output

Check test results for pass/fail statuses across app health checks, DOM snapshots, and scenario executions.
