---
title: Run an agent on a task
layout: default
parent: Plan and run agent tasks
grand_parent: Training
nav_order: 3
permalink: /training/agent-tasks/run-an-agent.html
redirect_from:
  - /training/for-non-developers/04-task-implementer-and-sandboxes.html
---

# Run an agent on a task
{: .no_toc }

Task Implementer (`packages/task-implementer`) lists the issues on your task server, builds a prompt from the issue and a persona, and starts the Claude Code CLI on it. This lesson covers one run from issue to a pushed branch, and what the app does and does not do for you.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What it does and does not do

Task Implementer is a task picker and prompt builder around one command:

```text
claude -p <prompt> --output-format stream-json --verbose --dangerously-skip-permissions
```

It streams the agent's text into the window. Everything else is up to the agent and your machine.

{: .warning }
Task Implementer does not clone the repository, create a sandbox, mount a RAM disk or set a working directory. The agent runs as your user in the directory the app was launched from, with permission prompts turned off. Start the app from a checkout you are willing to let an agent edit, and keep secrets out of that environment.

## Prerequisites

- A task server in the Task Servers app. For GitHub the app runs `gh issue list --repo <repo> --limit 50`, so `gh` must be signed in. For Jira it reads the API token from `pass`. With no server it shows "No task server configured." and an **Open Task Servers** button.
- The `claude` CLI on your `PATH`, already logged in.
- A local checkout of the repository the issues belong to, on a clean working tree.

## Run one task

1. From a terminal, change into your checkout and start the app. The agent inherits this directory.

   ```bash
   cd ~/src/my-repo
   electron /path/to/robos/packages/task-implementer
   ```

2. In the **Tasks** tab, pick **Open**, **Closed** or **All** and optionally search by title or key. Click an issue. The task list shows the persona each issue resolves to.
3. Check the persona in the dropdown above the output. Click **Directives** to read or edit the text that will be added to the prompt. Both are covered in [Choose and customize agent personas]({{ '/training/agent-tasks/agent-personas.html' | relative_url }}).
4. Optionally type notes in the context box, such as the path of the repository or constraints. The box has `@` completion for files.
5. Click **Start Agent**. Output appears under **Agent Output**. The status line ends with "Agent finished successfully." or "Agent exited with code N." Click **Stop** to kill the process.

## What the agent is told

Task Implementer joins these parts into one prompt:

1. The persona's role prompt and development guidance, or your edited directives.
2. The issue key, title, body and labels, then your notes.
3. Writing rules for external text: PR descriptions, issue bodies and commit messages should describe the product change, with no slogans, and should not mention RobOS, its personas or workflow stages unless RobOS is the subject of the change.
4. A commit rule: commit after every completed iteration, stage explicit paths instead of `git add -A`, keep RobOS evidence under `~/.robos` rather than in the checkout, verify the commit with `git log -1`, and ask a question about unrelated edits instead of discarding them.
5. The delivery workflow: create a feature branch (the requested branch, otherwise `codex/<task-key>`), implement and test, commit, push to `origin`, and do not create a pull request. The agent reports the workspace path, repository, branch, base branch, validation and evidence locations.

The prompt never asks for a PR. Creating one is a separate, manual step.

## Review the branch before opening a pull request

1. When the agent has pushed its branch, click **Review branch...** next to **Start Agent**.
2. Choose the folder of the checkout that has the feature branch checked out.
3. PR Review opens in local review mode on the diff between that branch and `origin/HEAD` (or `origin/main` if that is not set). The review manifest is stored under `~/.robos/local-reviews/<id>/review.json`.
4. Use **Open in IDE** in PR Review to open the checkout in an installed IDE. It lists the launchers it finds on your `PATH`, in `/snap/bin` and in `~/.local/bin`: IntelliJ IDEA, VS Code, Cursor, WebStorm, PyCharm, GoLand, CLion, Rider, RustRover, VSCodium, Zed, Windsurf and Sublime Text.
5. Click **Create PR** in PR Review when you are satisfied. The stages and sign-off are described on the [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}) page.

| Message | Cause | Fix |
|:---|:---|:---|
| Select the feature-branch checkout produced by Task Implementer. | The folder is on `main`, `master` or a detached HEAD. | Check out the feature branch, then choose the folder again. |
| This review requires a GitHub origin. | `origin` is not a `github.com` URL. | Set `origin` to the GitHub repository. |
| Wait for Task Implementer to finish before reviewing its branch. | An agent is still running for that task. | Wait, or click **Stop**. |
| Agent already running for this task | A run for the same issue is active. | Wait for it, or click **Stop**. |

## The other tabs

- **Dependencies** shows tasks as a tree by parent issue. Jira supplies parent and blocking links. GitHub issues carry none, so the tree is flat.
- **Plan** has a context box and **Generate Plan**. It asks `claude -p` to order the loaded tasks and returns a rationale for each position. The result is saved to `~/.config/robos/plans/<server id>.json`. **Implement** on a row opens that task on the **Tasks** tab.

## Persona display and isolation

If the persona's execution mode is `ephemeral-gui` (the built-in Non-Headless Developer), the agent is started with `DISPLAY=:99`, or the value of `ROBOS_XVFB_DISPLAY`. Task Implementer does not start an X server. Start one first, or the agent has no display:

```bash
Xvfb :99 -screen 0 1920x1080x24 &
```

Every other persona starts the agent on your current `DISPLAY`. Nothing in Task Implementer limits which files or commands an agent can touch. For a separate home directory, see [Run commands in an ephemeral agent profile]({{ '/training/harness-and-security/agent-profiles.html' | relative_url }}), and read its limits first.
