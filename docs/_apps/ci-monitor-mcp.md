---
title: "CI Monitor MCP Server"
package: ci-monitor-mcp
category: services
summary: "CI/CD Monitor Model Context Protocol (MCP) Server for RobOS"
description: "CI/CD Monitor Model Context Protocol (MCP) Server for RobOS"
---


## Buildkite connection

The default server uses the Buildkite connection configured in CI Monitor and
resolves its credential through `pass`. It never returns sample success data.
Sample runs are available only to explicit demo/test fixtures.

`robos_ci_list_runs` returns the most recent 30 builds and IDs in the form
`buildkite:organization:pipeline:number`. Pass those IDs to `robos_ci_get_logs`
(failed-job logs) or `robos_ci_get_failures` (failed jobs, commit, log excerpt,
and artifact link). `robos_ci_get_status` returns the latest exact branch match
or null. Token/network errors are surfaced as errors.

This connection is read-only: `robos_ci_retry_run` reports that retries must be
performed in Buildkite. No successful retry is simulated. Deployment data is
not available and returns an empty list.
