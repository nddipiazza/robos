---
title: "CI Monitor MCP Server"
package: ci-monitor-mcp
category: services
summary: "An MCP server that lets agents list Buildkite builds and read failed-job logs, backed by the connection set up in CI Monitor."
description: "ci-monitor-mcp exposes six robos_ci_* tools and two resources. It reads Buildkite only, never retries builds, and returns an empty list for deployments."
---

This package is both an MCP server and a small Electron console window for watching its calls. Agents use the tools to check CI without opening Buildkite.

## Tools and resources

| Tool | Returns |
|---|---|
| `robos_ci_list_runs` | The 30 most recent builds (optionally filtered by `status` or `branch`). Run IDs look like `buildkite:organization:pipeline:number`. |
| `robos_ci_get_status` | The latest build on an exact branch name, or null. |
| `robos_ci_get_logs` | The failed-job logs for a run ID from `robos_ci_list_runs`. |
| `robos_ci_get_failures` | Failed jobs, commit, log excerpt and artifact link for a run ID. |
| `robos_ci_retry_run` | Always an error. The integration is read-only; retry in Buildkite. |
| `robos_ci_get_deployments` | An empty list. Deployments are not tracked. |

Resources: `robos://ci-monitor-mcp/ci/current` and `robos://ci-monitor-mcp/ci/deployments/latest`.

## Buildkite connection

The server uses the Buildkite connection saved in [CI Monitor]({{ '/apps/ci-monitor/' | relative_url }}) (`~/.config/robos/ci-providers.json`), which points to a token in `pass`. If no connection exists, the tools fail with "Configure Buildkite in CI Monitor before using CI tools." Token and network errors are returned as errors; the live service never invents sample data.

## The console window

The window has **Inspect Failed Tests** and **Retry Failed Pipeline** buttons, counters (runs, pass rate, tools, deployments), a runs table, a log pane and a **Live CI MCP Protocol Trace** with **Clear Trace**. It calls the same service over Electron IPC.

## Demo mode

`createCIMonitorMCPServer({ demo: true })` (or passing `runsFile`) swaps in a sample service with two fake runs stored in `~/.config/robos/ci/runs.json`, where a retry flips a failed run to passed. This exists for the repository's tests and demos; the app itself starts the live service.

## Registration

When the server is created it records its tool and resource names in `~/.config/robos/mcp/servers.json`. It opens no port unless a `port` option is passed. The `robos-mcp-router` reads that registry. Run the window with `electron packages/ci-monitor-mcp`; `npm test` there runs `node --test`.

Source: [`packages/ci-monitor-mcp`](https://github.com/nddipiazza/robos/tree/main/packages/ci-monitor-mcp).
