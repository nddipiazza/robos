---
title: "CI Monitor"
package: ci-monitor
category: devops-cloud
icon: ci-monitor.svg
summary: "Lists recent GitHub Actions runs and Buildkite builds, shows job results and failed-job logs, and can re-run GitHub workflows."
description: "CI Monitor reads runs through the gh CLI or the Buildkite REST API, shows jobs and the tail of failed logs, and summarizes failures with simple pattern matching."
---

CI Monitor shows the latest 30 runs per repository, refreshed every 30 seconds. Choose **GitHub Actions** or **Buildkite** in the provider dropdown, then filter by **All Runs**, **In Progress**, **Completed** or **Failed** and by branch. Counters above the list show **Total**, **Passed**, **Failed** and **Running**.

## Requirements

| Provider | What you need |
|---|---|
| GitHub Actions | The `gh` CLI, signed in. The repositories come from the active task server in `~/.config/robos/settings.json` (`task_servers` and `active_task_server`), which must be of type `github`. Other server types show "CI Monitor requires a GitHub task server". |
| Buildkite | A Buildkite API token stored in `pass`, with organization access and the `read_builds` and `read_build_logs` scopes. |

## Open a run

Click a run to see its jobs and steps. For a failed run, **Failed Log** shows the last 80 lines of the failed job output for GitHub (`gh run view --log-failed`). **Run Log summary** classifies the log as a test failure, lint error, type error or build failure by matching keywords and suggests a next step. It is pattern matching, not a language model.

- GitHub runs have **Re-run** (`gh run rerun`) and **View on GitHub**.
- Buildkite runs have **Artifacts** instead of Re-run. RobOS only reads Buildkite builds; retry a build in Buildkite itself.

## Connect Buildkite

1. Select **Buildkite**, then **Connection**.
2. Enter the **Organization**, an optional **Pipeline** slug and the name of an existing `pass` entry (default `buildkite-api-access-token`).
3. Click **Verify & save**. The app lists builds with that token first and saves only if the request succeeds.

Only the `pass` entry name is stored, in `~/.config/robos/ci-providers.json` (mode 600). The token itself stays in `pass`, and the same connection is used by the DevOps integration catalog. Errors are reported as they are: a 401 reads "Buildkite rejected the token" and a 403 reads "Buildkite token lacks access".

In [PR Review Theater]({{ '/pr-review-theater.html' | relative_url }}), a failing Buildkite check has a **Read failure** button that opens the failed job output in the CI recovery dialog.

Source: [`packages/ci-monitor`](https://github.com/nddipiazza/robos/tree/main/packages/ci-monitor); the Buildkite client is in `packages/robos-lib/ci`.
