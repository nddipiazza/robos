---
name: robos-github-auth
description: Use before any code that reads or changes tasks/issues (GitHub, Jira, …) — go through the RobOS task servers and the robos-task-client adapters; never hand-roll `gh` calls, import buttons, GH_TOKEN, or a cached login.
---

# RobOS GitHub Auth & Task Servers

RobOS decides which GitHub account every GitHub-backed feature uses. Agents and app code must go through that
mechanism instead of calling `gh` with whatever happens to be in the environment.

## When to Use

Use this skill whenever you write or change code (or run commands) that:
- reads or writes GitHub issues, sub-issues, assignees, labels, or PRs for a RobOS task server;
- needs "me" / "@me" / the current user's GitHub login;
- adds a feature to Dev Central, Task Servers, Git Projects, PR Review, or anything using `task_servers`.

## How identity works

1. **Task servers** live in `~/.config/robos/settings.json` under `task_servers` (managed by `packages/task-servers`).
   A GitHub entry has `type: "github"`, `repos: [{org, repo}]`, optional `gh_api_url` (GitHub Enterprise), and
   `use_gh_cli` (default `true` = "Use Git client account"). `active_task_server` picks the default.
2. **The account** is the *Git client account* chosen in **RobOS Preferences → GitHub accounts** and stored by name only in
   `~/.config/robos/github-accounts.json` (`{ "git": "<login>", "copilot": "<login>" }`). Credentials stay in the `gh` keyring.
   Saving a selection runs `gh auth switch`, so the selected account is also `gh`'s active account.
3. **The library**: `packages/robos-lib/github-accounts.js`
   - `read().git` → selected login (use this for "me"; do **not** cache it or call `gh api user` for it)
   - `cleanEnv()` → env with `GH_TOKEN`, `GITHUB_TOKEN`, `GH_DEBUG` removed — pass it to every `gh` child process
   - `list()` / `save()` → signed-in accounts / change selection (Preferences UI only)

## Rules

- Spawn `gh` with `env: require('<path>/robos-lib/github-accounts').cleanEnv()`. Never rely on the ambient environment.
- Resolve the task server for a repo (`task_servers` entry whose `repos` contains it, else `active_task_server`) and honour
  `gh_api_url` by adding `--hostname <host>` for `gh api` calls.
- If `use_gh_cli === false` the server uses a token from `pass` (`gh_token_pass_path`) — do not silently fall back to `gh`;
  support it explicitly or fail with a message telling the user to enable "Use Git client account".
- Before bulk writes (assigning, labelling), confirm `gh api user --jq .login` equals `github-accounts.read().git`;
  if not, stop and tell the user to re-save the account in Preferences → GitHub accounts.
- Never print, store, or log tokens. Store account **names** only.
- Cloud/remote agent sessions usually have no linked GitHub identity. Say so plainly and implement the feature through the
  local RobOS code path (so it runs as the user's selected account) instead of asking the user to paste credentials.

## Where tasks come from — always the task server library

Tasks and issues for any RobOS UI come from the **configured task servers** (Jira, GitHub issues, … — there can be any number)
through `packages/robos-task-client`:

```js
const { createAdapter } = require('../robos-task-client');
const adapter = createAdapter(serverConfig);          // serverConfig = an entry of settings.task_servers
const { issues } = await adapter.searchIssues({ assignee: 'me' });   // common work-item shape
await adapter.updateIssue(key, { assignee: 'me' });                  // assign
await adapter.transitionIssueTo(key, 'in_progress');                 // status
```

- Work items share one shape (`key, summary, status, statusCategory, issueType, priority, assignee, parent, url, …`);
  `parent` carries hierarchy (Jira parent/epic, GitHub sub-issue). GitHub extras: `listHierarchy()`, `getSubIssues(n)`, `unassignIssue(n)`.
- **Do not** add "Import from GitHub", per-epic import dialogs, or bespoke `gh`/REST calls in an app. If the adapter lacks a
  capability (e.g. sub-issues), add it to `robos-task-client` so every app benefits, then use it.
- The adapters already run `gh` with the RobOS-selected account (`cleanEnv()`); keep it that way when you add methods.
- Show data from the task server even when it is not assigned to the user (assignment filters views, it must not hide the tree).

## Reference implementation

`packages/dev-central/lib/v2-tasks.js` — builds the epic/task tree from every task server via `createAdapter`, caches per server,
refreshes in the background, and writes assignments/status back through the adapter.
`packages/robos-task-client/github-adapter.js` — `listHierarchy()` (sub-issues via `parent_issue_url`), `getSubIssues()`.

## Validation

- `grep -rn "execFile('gh'\|spawnSync('gh'\|exec(\`gh" <changed files>` — outside `robos-task-client`/`robos-lib` there should be no hits; inside, every hit passes `cleanEnv()`.
- No UI offers manual import of tasks that a task server already provides.
- No `GH_TOKEN`/`GITHUB_TOKEN` read or set in changed code; no login cached outside `github-accounts.json`.
- With two `gh` accounts logged in, the code acts as the account selected in Preferences, not the other one.

## Workflow stages — never hard-code them

Task status is the RobOS workflow stage, not `todo/in_progress/review/done`. The single source of truth is `packages/robos-lib/default-workflow.jsonld` (read through `robos-lib/default-workflow`): Not started → Designed → Agent implementing → Local evidence review → Draft PR pipeline review → Human review → Closed.

- Build stage lists, colors, "is final" checks and transition targets from that library (Dev Central v2 receives them as `workflow` in the tree payload). Do not write stage names or `status === 'done'` in UI code; use the stage's `is_final` flag.
- Closed means the issue is actually closed in GitHub. On GitHub task servers a stage is written as a `state:<stage-id>` label, and moving to/from the final stage closes/reopens the issue.
- Old words (`TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`, `blocked`) may still appear in saved data or labels; map them at the edge (`canonStatus` in `dev-central/lib/v2-tasks.js`), `blocked` becomes a flag, not a stage.

## Never block the UI on task-server calls

`robos-task-client` adapters shell out to `gh` synchronously, so calling them on the Electron main thread freezes the whole app (assigning every issue in an epic takes ~30 s). All task-server and web-client work must run as a background job:

- Run adapter calls in worker threads (see `dev-central/lib/v2-worker.js` and the pool in `v2-tasks.js`), never directly in an IPC handler.
- IPC handlers that mutate return immediately with a `jobId`; progress is pushed to the window (`dc-v2-job` events) and the tree payload lists `busy` task ids.
- The UI shows a spinner on each affected row, a live progress toast with Cancel, and updates rows as each item finishes. Refresh/sync also shows a spinner.

## Agent runs carry task metadata

Any RobOS agent session that works on a task must be traceable to it so Dev Central can show a running-agent icon on that task (and its epic) and let the user open, steer or kill the session.

- Launch the agent with env vars: `ROBOS_AGENT_RUN_ID`, `ROBOS_LAUNCHED_BY` (app name), `ROBOS_TASK_ID`, `ROBOS_TASK_KEY`, `ROBOS_TASK_URL`, `ROBOS_TASK_REPO`, `ROBOS_TASK_SERVER`, `ROBOS_EPIC_KEY`, `ROBOS_TASK_STAGE`, `ROBOS_AGENT_MODE`; and say the task key in the prompt so branches and commits reference it.
- Publish the session to `~/.robos/agent-jobs/<sessionId>.json` via `robos-lib/agent-job-state` with `launchedBy`, `taskId`/`taskKey`/`taskUrl`, `runId`, `status`, `activity`, `childPid`. Dev Central matches runs to tasks by those fields.
- Dev Central's own launches are recorded in `~/.robos/agent-runs/<runId>.json` (+ `.log` of the agent's JSON lines); see `dev-central/lib/v2-agents.js`.
