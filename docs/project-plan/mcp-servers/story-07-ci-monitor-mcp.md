---
nav_exclude: true
---

# Story: CI Monitor MCP Server

**Epic:** [First-Class MCP Server Support](epic.md)  
**Status:** Done  
**Points:** 3  

## Description

MCP server exposing CI/CD pipeline data to AI agents.

Tools:
- `robos_ci_get_status` — Get CI status for a branch/PR
- `robos_ci_list_runs` — List recent CI runs with outcomes
- `robos_ci_get_logs` — Get build/test logs for a run
- `robos_ci_get_failures` — Get failed tests with error details
- `robos_ci_retry_run` — Retry a failed CI run
- `robos_ci_get_deployments` — List recent deployments

Resources:
- `robos://ci-monitor-mcp/ci/current` — CI status for active branch
- `robos://ci-monitor-mcp/ci/runs/{id}/logs` — Full logs for a CI run
- `robos://ci-monitor-mcp/ci/deployments/latest` — Most recent deployment

## Acceptance Criteria

- [x] AI agent can check CI status and read failure logs
- [x] Agent can diagnose test failures from log content
- [x] Deployment status queryable
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/mcp-servers/ci-monitor-mcp.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/ci-monitor-mcp/`.
