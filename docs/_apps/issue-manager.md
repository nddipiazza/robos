---
title: "Issue Manager"
package: issue-manager
category: arch-planning
icon: issue-manager.svg
summary: "Opens one GitHub issue, shows it with its workflow state, moves it between states by changing labels, and sets up a branch workspace for it."
description: "Issue Manager is a single-issue view started with an issue number, plus a configuration screen for issue types and workflows. It uses the gh CLI and has no board or issue list view."
---

Issue Manager is launched for one issue at a time, usually from another RobOS app. It has no Kanban board and no issue list.

## Start it

```bash
electron packages/issue-manager 123
electron packages/issue-manager config
```

The first form opens issue `#123` (a leading `#` is accepted). The second opens the workflow configuration. Without an argument the issue view reports that no repository or issue is selected.

## Requirements

The `gh` CLI, signed in, and a task server in `~/.config/robos/settings.json` (`task_servers`, with `active_task_server`) that lists the repository. Issues are fetched with `gh issue view`.

## The issue view

- The header shows the number, title, assignees and a type badge. The type is inferred from a label such as `bug`, `feature`, `task`, `chore`, `security`, `performance`, `question` or `type:<name>`.
- **Description** renders the issue body as Markdown, and **Steps to Reproduce** appears when the body has a heading such as `## Steps to reproduce`.
- **Workflow State** shows the issue's states as a pipeline. The current state is the issue label `state:<id>` (or the bare `<id>`), and the workflow's initial state when there is none. **Transitions** lists the moves the workflow allows. A transition runs `gh issue edit` to remove the old `state:<id>` label and add the new one (the label is created in purple if it does not exist), then runs the new state's `on_enter_script` (bash, with `ISSUE_NUM`, `ISSUE_TITLE`, `ORG`, `REPO`, `STATE_ID` and `STATE_LABEL` set) and `on_enter_prompt` (sent to `gh copilot` with all tools allowed) if the workflow defines them. It also writes the issue number to `~/.config/robos/active-issue`, which [Desktop Widgets]({{ '/apps/desktop-widgets/' | relative_url }}) shows as the active task.
- **Set Up Workspace** clones the repository with `gh repo clone` into `~/source/<org>/<repo>` if needed, fetches, and checks out the branch `issue-<number>`. A task server can supply its own `workspace_setup_script` instead, which runs with `ISSUE_NUM`, `ORG`, `REPO` and `REPO_DIR` set. **Open in VS Code** runs `code` on that folder.
- **AI Agent** has an **Ask** box. Your question is sent with the issue title and the first 800 characters of its body to `gh copilot -p ... --allow-all-tools`, and the output streams into the panel. This needs the GitHub Copilot CLI extension and runs with all tools allowed.
- The **GitHub** button opens the issue in a browser.

## The configuration view

The **Workflow Studio** screen edits the issue types and workflows of the active task server and saves them back to `settings.json` (**Save**, **Clear All**, **+ Add Issue Type**). **AI Generate** asks `gh copilot` for a JSON list of issue types and fills the form from it. Saving also appends a note to the daily file in the journal repository when `journal_repo` is set in the settings, committing and pushing it.

Source: [`packages/issue-manager`](https://github.com/nddipiazza/robos/tree/main/packages/issue-manager).
