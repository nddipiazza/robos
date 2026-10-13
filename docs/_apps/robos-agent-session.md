---
title: "Agent Session Library"
package: robos-agent-session
category: services
summary: "Node.js client for the agentd socket, plus a small demo window and a simulated test-driven-development runner."
description: "A library that other RobOS apps use to spawn, list, inspect and terminate sub-agent sessions through robos-agentd. The package's own window is a demo, not a product screen."
---

`robos-agent-session` is mainly a library. Its window exists to demonstrate the API.

## The library

`index.js` exports `RobOSAgentSession`, `AutonomousEDDRunner` and `EDD_PHASES`. `RobOSAgentSession` talks to [Agent Daemon]({{ '/apps/robos-agentd/' | relative_url }}) over the Unix socket `~/.config/robos/agentd/agentd.sock` (override with the `socketPath` option). If the socket is missing, calls resolve to `{ ok: false, error: "Socket not found at ..." }`. You can also pass an in-process `daemon` object to skip the socket.

| Method | What it sends |
|---|---|
| `spawnAgentSession(taskId, options)` | `spawn` |
| `listAgentSessions()` | `list`; returns an array |
| `inspectAgentSession(taskId)` | `inspect` |
| `sendAgentCommand(taskId, command)` | `appendLog` with the line `[COMMAND_DISPATCH] <command>`. It records the command in the session log; it does not execute it. |
| `terminateAgentSession(taskId)` | `terminate` |
| `wipeAllSessions()` | `wipeAll` |
| `runEDD(config)` | Runs the local EDD runner (below). |

The object is an `EventEmitter` and emits `session:spawned`, `session:command`, `session:terminated` and `session:wiped`.

## The EDD runner

`lib/edd-runner.js` steps through the phases ingestion, red verification, implementation, green verification, regression check and completed, and logs each one. The red and green checks are simulated: the runner returns fixed results and only calls `fabric.dispatchRequest` if you pass a `fabric` object. Treat it as a scaffold for the phase model, not a test runner. [Knowledge Graph Explorer]({{ '/apps/robos-graph/' | relative_url }}) loads it.

## The demo window

`main.js` opens **RobOS Agent Session Client Demo**. It starts its own in-process agent daemon, so it does not need `robos-agentd` to be running. The window has **+ Spawn via Library**, **Refresh** and **Send Command** controls, a session list and an event log. There is no `.desktop` launcher.

## Tests

`npm test` in the package runs `node --test`.
