---
title: "Task Servers"
package: task-servers
category: arch-planning
icon: task-servers.svg
summary: "Settings screen where you add Jira and GitHub issue trackers, store a pass path for the token, and test the connection."
description: "Writes the task_servers list in ~/.config/robos/settings.json, which Task Planner, Task Implementer, Task Board, Report Builder and Stage Demo read. Only Jira and GitHub forms can test a connection."
---

Task Servers holds the connection details for the issue trackers that other RobOS apps use. It does not show issues itself.

## Use it

1. Click the plus button and choose a type: **Gitea (Local OSS Forge)**, **Jira / Atlassian**, **GitHub Issues**, **GitLab Issues**, **Linear** or **Azure DevOps**.
2. Fill in the form.
   - **Jira:** Jira Base URL, Username / Email, API Token, and Project Keys. The token field takes a `pass` entry, chosen with **Select pass entry**, so the token is read from your password store and not saved in `settings.json`.
   - **GitHub:** GitHub API URL (blank for github.com, or a GitHub Enterprise API URL), **Use Git client account** (use the `gh` CLI login; otherwise a Personal Access Token from `pass`), a list of repositories as Org / Owner and Repository pairs, and labels to include.
   - **Gitea, GitLab, Linear, Azure DevOps:** a generic form with an API / instance URL and username or email.
3. Click **Test Connection** (Jira and GitHub forms only). Jira is checked with `curl` against the Jira API, GitHub with `gh api user` or `curl` against `<api url>/user`. Other types have no test.
4. Changes are saved to the `task_servers` array in `~/.config/robos/settings.json`. Delete a server with the X next to it in the list.

The server entries are also mirrored into the knowledge graph as task server nodes when `packages/robos-graph` is available.

## Who reads the list

| App | Server types it uses |
|---|---|
| [Task Planner]({{ '/apps/task-planner/' | relative_url }}) | GitHub (via `gh`) and Jira |
| [Task Implementer]({{ '/apps/task-implementer/' | relative_url }}) | GitHub and Jira |
| [Task Board]({{ '/apps/task-board/' | relative_url }}) | GitHub only |
| [Report Builder]({{ '/apps/report-builder/' | relative_url }}) | The first repository of the server, through `gh` |
| [Stage Demo]({{ '/apps/stage-demo/' | relative_url }}) | GitHub only |

Those apps use the server whose `id` equals `active_task_server` in `settings.json`, or the first server in the list if that key is not set. This app has no control for `active_task_server`, so order the list or set the key by hand. The other types can be saved but the apps above do not use them.

## Run it

Launch **RobOS Task Servers** from the app launcher, or run `npm start` in `packages/task-servers`.
