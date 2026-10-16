---
title: "Task Board"
package: task-board
category: arch-planning
icon: task-board.svg
summary: "Read-only board and list view of the issues in the active GitHub task server, grouped by status."
description: "Fetches up to 100 issues with the gh CLI and shows them as Kanban columns or a sortable table. It has no swimlanes, WIP limits or drag and drop."
---

Task Board shows GitHub issues as columns and as a table. It only reads issues; it cannot create or change them.

## Requirements

- The `gh` CLI, signed in.
- A GitHub task server in `~/.config/robos/settings.json` (the active `task_servers` entry, or the first). Without one the board shows "No task server configured". A Jira server shows "Jira fetch requires robos-task-client (coming soon)", and other server types are unsupported. Set up servers in [Task Servers]({{ '/apps/task-servers/' | relative_url }}).

## Use it

- **Board** shows one column per status with a card count. **List** shows a table with Key, Summary, Status, Assignee, Type and Updated, and you can sort by clicking a column header.
- The filter row has an assignee drop-down (**All assignees**) and the state buttons **Open**, **Closed** and **All**. The refresh button reloads from GitHub. A search box filters by title, `#number` or label text. The assignee list and search work on the issues already loaded.
- Cards and rows are wired to open the issue in the browser, but the app does not request the issue URL from `gh` (the `--json` field list has no `url`), so clicking does nothing in the current code.

## How issues map to columns

The app runs `gh issue list --repo <org>/<repo> --limit 100 --state <state>`, so it shows at most 100 issues. An issue's status is the part after `state:` in any label that starts with `state:` (for example `state:in-progress`), and otherwise the GitHub state (`open` or `closed`). Columns are created from the statuses present in the results, in the order the issues are returned; you cannot define or reorder columns in the app. Type in the list is guessed from labels (`bug`, a label containing `feature`, or `chore`/`task`).

## Run it

Launch **Task Board** from the app launcher, or run `npm start` in `packages/task-board`.
