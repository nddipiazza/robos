---
title: "Report Builder"
package: report-builder
category: devops-cloud
icon: report-builder.svg
summary: "Ask a question about a repository's issues and pull requests and get a written report from GitHub Copilot."
description: "Fetches up to 200 issues and 200 pull requests with the gh CLI, asks gh copilot to answer your question from that data, and lets you save the report as JSON."
---

Report Builder answers questions such as "Stuck reviews" or "Workload distribution" about one GitHub repository. It collects recent issue and pull request data and passes it, with your question, to the GitHub Copilot CLI.

## Requirements

- The `gh` CLI, signed in, with the Copilot extension (the app runs `gh copilot`).
- A task server in `~/.config/robos/settings.json`. The app uses the active entry in `task_servers` (or the first one) and queries its first repository. Without one it shows "No task server configured". You can set this up in [Task Servers]({{ '/apps/task-servers/' | relative_url }}).

## Use it

1. Type a question in **Ask a question about your project**, or click an example chip: **PRs per developer**, **Stuck reviews**, **Close rate comparison**, **Workload distribution**.
2. Click **Generate Report**. The text streams into the **Report** panel. A request times out after three minutes.
3. Click **Save Report** to keep it, or **Clear** to discard it.
4. Click **Saved Reports** to browse earlier reports, and **Back** to return.

## How it works and limits

The main process runs `gh issue list` and `gh pr list` (`--state all --limit 200`), trims each result to 8000 characters, and sends them in the prompt to `gh copilot`. The answer is only as complete as that sample: older items beyond the limit are not included, and the model can misread the data. Treat the output as a draft.

Saved reports are JSON files in `~/.config/robos/reports/`.
