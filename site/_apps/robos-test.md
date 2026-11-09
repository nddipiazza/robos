---
title: "RobOS Test"
package: robos-test
category: "libraries"
component_type: component
permalink: /robos-test/
redirect_from:
  - /apps/robos-test/
summary: "Shared unit, E2E, DOM snapshot, mock-server, and recorded video walkthrough harness for RobOS apps and KGraph packages."
description: "Test and proof-of-work harness in packages/robos-test: Electron app launcher, DOM snapshot assertions, mock GitHub/Gitea/Jira/Drive servers, Xvfb video recording, and Node.js unit and E2E suites."
related:
  - /pr-review/
  - /robos-reviewer/
  - /robos-lib/
---

`packages/robos-test` is the unified verification harness for RobOS desktop apps, shared libraries, MCP servers, and Knowledge Graph generators, built on Node's native `node:test` runner with zero external framework lock-in.

## Core modules (`lib/`)

- **`lib/harness.js` & `lib/snapshot.js`**: Launches Electron apps in isolated temporary `ROBOS_CONFIG_DIR` sandboxes, connects to each app's DOM snapshot HTTP server (`19100–19231`), evaluates assertions, and captures PNG screenshots without VNC.
- **`lib/recorder.js`, `lib/narrator.js` & `lib/demo-runner.js`**: Records 1080p walkthrough videos inside Xvfb virtual framebuffers with on-screen step narration HUDs, optional TTS audio, and WebVTT tracks.
- **`lib/mock-jira-server.js`, `lib/mock-gdrive-server.js` & `lib/gitea-forge.js`**: Local deterministic servers for offline verification of [Task Servers](/task-servers/), [Config Sync](/config-management/), and Git pull-request workflows.
- **`lib/vm-smoke.js`**: End-to-end SSH and app-health verification against a running QEMU/KVM RobOS appliance VM.

## Running tests

```bash
# Run unit suites across apps, KGraph, eLearning, and shared libraries
cd packages/robos-test
npm run test:unit

# Run KGraph workspace, topology, and SHACL inspector suites
npm run test:kgraph-workspace

# Run containerized Xvfb + Electron E2E suites
../../scripts/e2e-container.sh
```

Source: [`packages/robos-test`](https://github.com/nddipiazza/robos/tree/main/packages/robos-test).
