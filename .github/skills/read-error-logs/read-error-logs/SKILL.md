---
name: read-error-logs
description: Inspect RobOS application failure logs, uncaught exceptions, and Electron error dialog events.
---

# Read RobOS Error & Failure Logs

Inspect RobOS application failure logs, uncaught exceptions, and Electron error dialog events.

## Input

$ARGUMENTS — optionally `--app <app-id>` or `--limit <n>`

## Steps

Execute the following commands to inspect failures from the RobOS VM:

### 1. Read Centralized Error Stream (VM)

```bash
ssh -p 2224 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null robos@localhost \
  "node /usr/local/share/robos/robos-lib/logs-cli.js --errors-only --limit 50"
```

### 2. Read App-Specific Logs (if app is known)

```bash
ssh -p 2224 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null robos@localhost \
  "node /usr/local/share/robos/robos-lib/logs-cli.js --app <app-id> --limit 50"
```

### 3. Check VM System Journal for Crashes

```bash
ssh -p 2224 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null robos@localhost \
  "journalctl -p err..emerg -n 30 --no-pager"
```

### When to use

- User mentions an error dialog or pop-up failure in RobOS
- Troubleshooting application crashes or unexpected UI behavior
- Verifying error handlers and exception logging
