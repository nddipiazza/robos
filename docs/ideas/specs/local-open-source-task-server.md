---
title: "Proposal: local task server"
layout: default
nav_exclude: true
---

# Proposal: local task server
{: .no_toc }

A task tracker that runs on the developer's machine, so Task Board and agents keep working offline and without a Jira or GitHub account.
{: .fs-6 }

{: .important }
Proposal, not built. Only a minimal local task list exists today; see "What exists today".

## Proposal

- A small daemon backed by SQLite. The original spec put the database at `~/.config/robos/tasks.db`.
- Projects, epics, tasks and subtasks, with a Kanban status, priority, estimate, labels and comments.
- A "Local Task Server" entry in [Task Servers]({{ '/apps/task-servers/' | relative_url }}) with start, stop and reset controls.
- A `LocalTaskServerAdapter` in `packages/robos-task-client` so Task Board and Dev Central treat it like Jira or GitHub.
- Task tools for agents through `task-manager-mcp`.
- Optional export of tasks to YAML under `.robos/tasks/`.

The spec asked for permissively licensed dependencies (MIT or Apache-2.0) only.

![A local task server beside GitHub, Jira and Linear adapters, all reached through one task client by Task Servers, Task Board, Dev Central and agent tools]({{ '/assets/images/task-servers-architecture.jpg' | relative_url }}){: .robos-zoomable-img loading="lazy" }
*Concept diagram from the original design docs. The text on this page says what is built today.*

## What exists today

- `createAdapter` in `packages/robos-task-client/index.js` supports two server types, `jira` and `github`. Any other type throws "Unsupported task server type".
- The Task Servers app lists Gitea, Jira, GitHub, GitLab, Linear and Azure DevOps in its add menu, but only Jira and GitHub have their own forms (`packages/task-servers/renderer/app.js`).
- [Task Manager MCP]({{ '/apps/task-manager-mcp/' | relative_url }}) already keeps a local task list in `~/.config/robos/tasks/tasks.json` and exposes `robos_tasks_list`, `robos_tasks_get`, `robos_tasks_create`, `robos_tasks_update`, `robos_tasks_advance_workflow`, `robos_tasks_add_comment` and `robos_tasks_log_hours`. It is not a Task Servers provider and nothing in `packages/task-board` or `packages/dev-central` reads it.

## Source

Raw note: [`ideas/inbox/local-open-source-task-server.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/local-open-source-task-server.txt). The earlier long spec is in the git history of this file.
