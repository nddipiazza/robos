# Story 15-07: CI Monitor MCP Server

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
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
- `robos://ci/current` — CI status for active branch
- `robos://ci/runs/{id}/logs` — Full logs for a CI run
- `robos://ci/deployments/latest` — Most recent deployment

## Acceptance Criteria

- [ ] AI agent can check CI status and read failure logs
- [ ] Agent can diagnose test failures from log content
- [ ] Deployment status queryable
