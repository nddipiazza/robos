---
name: test-container
description: Run RobOS Electron desktop apps in an isolated Docker container with Xvfb and Picom/Mutter compositor.
---

# Run RobOS Containerized Headless E2E Tests

## Choose validation before running it

Apply RobOS change-scoped validation (`packages/robos-agent-client/validation-policy.js`).
Inspect the actual change and identify the cheapest check that covers its risk.
Prose-only documentation changes do not trigger app builds, dependency installation,
unit/integration/e2e tests, service startup or proof recording. Executable examples,
configuration and contract changes need checks for the behavior they affect.
Reuse relevant passing CI or local results; do not repeat checks at each stage.
Broaden validation only for a concrete uncovered risk, relevant failure or explicit
task-specific requirement. Stop when sufficient checks pass. Report inapplicable
checks briefly as not needed, never as failed or falsely passed.


Run RobOS Electron desktop apps in an isolated Docker container powered by Xvfb and Picom/Mutter compositor. Fast, zero host side-effects, full DOM snapshot and health assertion support.

## Input

$ARGUMENTS — Optional test script or flags:
- (no args): runs standard full test suite; use only when a full run is explicitly requested or justified by change impact (`packages/robos-test`)
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
