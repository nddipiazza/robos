---
title: "Manager Dashboard"
package: manager-dashboard
category: core-desktop
icon: manager-dashboard.svg
summary: "Team metrics for one GitHub repository: open issues, merged PRs, PR cycle time, deploy frequency, approval rate, tasks by stage and PRs per developer."
description: "Manager Dashboard reads issues, pull requests, deployments and contributors through the gh CLI for the first repository of the active task server and computes a few simple counts. It is read-only."
---

Manager Dashboard gives a team lead a quick read on one repository. Every number is computed in the window from `gh` output, and the page refreshes every five minutes.

## Requirements

The `gh` CLI, signed in, and a task server in `~/.config/robos/settings.json` (`task_servers`) with at least one repository. Only the first repository of the first task server is used. Without one the window shows "No task server configured."

## What you see

Choose a range (**Last 7 days**, **Last 14 days**, **Last 30 days** or **Last 90 days**) and optionally one developer from **All developers** (the repository's contributors).

| Card or panel | How it is computed |
|---|---|
| **Open Issues** | Issues in state open, from the latest 200 issues (all states). Not limited by the range |
| **PRs Merged** | Pull requests merged within the range (latest 200 PRs) |
| **Avg Cycle Time** | Mean time from PR creation to merge, for the PRs merged in the range, in days. It measures pull requests, not issues |
| **Deploy Frequency** | GitHub deployments created in the range, per week (latest 50 deployments) |
| **Review Approval Rate** | Share of the fetched PRs whose `reviewDecision` is `APPROVED`. Not limited by the range, and zero PRs shows 0% |
| **Tasks by Stage** | Issues grouped by their `state:<name>` label, or by open or closed when there is none |
| **Velocity by Developer** | Number of PRs per author in the range. It counts PRs, not story points |
| **PR Activity**, **Recent Deployments** | Lists of recent PRs and deployments |

Since the repositories are read through `gh`, GitHub rate limits apply, and a repository with more than 200 issues or PRs is only partly counted. Deployments are listed from GitHub's deployments API, so repositories that do not create GitHub deployments show `--`. For a per-deployment timeline see [Deploy Tracker]({{ '/apps/deploy-tracker/' | relative_url }}).

```bash
electron packages/manager-dashboard
```

Source: [`packages/manager-dashboard`](https://github.com/nddipiazza/robos/tree/main/packages/manager-dashboard).
