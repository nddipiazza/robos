---
title: "Task Implementer"
package: task-implementer
category: ai-agents
icon: task-implementer.svg
summary: "Pick a GitHub or Jira task, choose a developer persona and coding agent, and run the agent on it with streamed output."
description: "Lists tasks from the active task server, builds a prompt from the task and a role persona, and runs the chosen coding-agent CLI (Codex, AGY, Claude Code or GitHub Copilot) in your account. It also generates an ordered plan for Jira tasks."
---

Task Implementer launches one coding-agent process per task, using the agent, model and reasoning effort picked in the shared `<robos-agent-selector>`: Codex (`codex`), AGY (`agy`), Claude Code (`claude`) or GitHub Copilot (`copilot`).

For how this app fits with the others when you build an app, see the Build apps guides: [on your own](/build-apps/solo/) or [as a team](/build-apps/teams/).

{: .warning }
Implementation runs start the chosen agent CLI as your user, in the app's working directory, with approval prompts turned off (`codex exec --sandbox workspace-write`, `claude -p --dangerously-skip-permissions`, `copilot -p --allow-all-tools`, or `agy --print --dangerously-skip-permissions`). The agent can read and write files and run commands without asking. The app does not create a sandbox, a temporary account or a virtual display. Use it only on repositories and machines where that is acceptable. The prompt asks the agent to create a feature branch, commit and push it, and not to open a pull request.

## Requirements

- At least one supported coding-agent CLI on the PATH and signed in: `codex`, `agy`, `claude` or `copilot`.
- A task server in `~/.config/robos/settings.json`. For GitHub, the `gh` CLI. For Jira, the `robos-task-client` package, and the API token in `pass` at the server's `token_pass_path`. If none is configured, the window shows **Open Task Servers**; see [Task Servers]({{ '/apps/task-servers/' | relative_url }}).

## Use it

The window has three tabs: **Tasks**, **Dependencies** and **Plan**.

1. In **Tasks**, choose **Open**, **Closed** or **All**. GitHub shows up to 50 issues (`gh issue list`). Jira uses a JQL search for up to 50 issues.
2. Select a task. The header shows a persona (**Frontend Web Developer** is an example). Change it in the drop-down. Pick the **AI agent**, **Model** and (when the model supports it) **Effort** in the agent selector below the header; the choice is saved in `~/.config/robos/task-implementer-agent.json`. The **Directives** panel holds the persona's development guidance, editable for this run, with **Reset to Role Default**. Add hints in the extra-context box. **Open** opens the task in your browser.
3. Click **Start Agent**. Output streams into **Agent Output**; **Stop** ends the process and **Clear** empties the pane.
4. To review the result, click **Review branch...**. Choose the checkout of the implementation branch and the app opens [PR Review]({{ '/apps/pr-review/' | relative_url }}) on it.

**Plan** and **Dependencies** work on the loaded tasks. **Generate Plan** runs the selected agent in read-only / plan mode to order the loaded tasks (the prompt is written for Jira tasks), taking parent-child links, issue types, priority and blockers into account, plus your context text. The log appears under **Generation Log**, and the plan is saved to `~/.config/robos/plans/<server-id>.json`.

## Personas

Personas come from `packages/robos-lib/agent-personas.js`: Software Architect, Frontend Web Developer, Game Developer, Backend Systems Developer, Data & Storage Engineer, DevOps & Cloud Engineer, Non-Headless Developer and Human + Agent Desktop Co-Pilot. A persona is a system prompt plus development guidance, planning and implementation directives. When you do not pick one, the app guesses from the task's persona or role fields, whether it is an epic, and its labels and text.

Use **Agent Personas** to edit them, add custom ones (saved in `~/.config/robos/agent-personas.json`) or **Restore Defaults**.

The two GUI personas change two things only: the `DISPLAY` variable (`:99`, or `ROBOS_XVFB_DISPLAY`, for Non-Headless Developer; your current display for the co-pilot) and the prompt text, which tells the agent to use an isolated Xvfb display, tmpfs storage and IDE bridge tools. The app does not start Xvfb or mount storage itself, so those only work if your environment already provides them.
