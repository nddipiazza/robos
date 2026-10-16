---
title: "Workflow Studio"
package: workflow-studio
category: arch-planning
icon: workflow-studio.svg
summary: "Define issue types, states and transitions for a GitHub task server, move an issue between states, and run a script or AI prompt when it enters a state."
description: "State is stored as state:<id> labels on GitHub issues. Each state can have a bash script and a gh copilot prompt that run on entry. The definitions live in ~/.config/robos/settings.json."
---

Workflow Studio is a small state machine for GitHub issues. You define the states an issue type moves through. Moving an issue changes its `state:` label and can start a script or an AI prompt.

## Requirements

- The `gh` CLI, signed in, for reading and labelling issues, and the `gh copilot` extension for the AI prompts.
- A GitHub task server in `~/.config/robos/settings.json` (see [Task Servers]({{ '/apps/task-servers/' | relative_url }})). The workflow definitions are saved on that server entry as `issue_types` and `workflows`.

## Two views

Start the app with no argument, or with `config`, to open the **Config** view. Start it with an issue number (for example `electron . 42` or `#42`) to open that **Issue** view directly.

**Config view.** Add issue types with **+ Add Issue Type**, then edit each type's states and transitions. A state has an id, label, colour, an initial flag, and two optional fields: a bash script (`on_enter_script`) and an AI prompt (`on_enter_prompt`). A new type starts with an Open and a Done state. **AI Generate** takes a description of your team and asks the configured AI provider for issue types, states and transitions as JSON, which you then review and **Save**. **Clear All** deletes every type and workflow after confirmation. Closing the window with unsaved changes asks whether to save.

**Issue view.** Shows the issue (title, labels, description, steps to reproduce if present), its **Workflow State**, and a button for each allowed transition. There are also **GitHub** (open the issue), **Set Up Workspace**, **Open in VS Code** and an **AI Agent** box to ask `gh copilot` a question about the issue.

## What a transition does

1. Removes the old `state:<id>` label and adds `state:<new id>` with `gh issue edit` (the new label is created if it does not exist), and writes the issue number to `~/.config/robos/active-issue`.
2. If the new state has `on_enter_script`, runs it with `bash -c`, with the environment variables `ISSUE_NUM`, `ISSUE_TITLE`, `ORG`, `REPO`, `STATE_ID` and `STATE_LABEL`. Output streams into an overlay.
3. If the new state has `on_enter_prompt`, runs `gh copilot -p <prompt> --allow-all-tools`. The placeholders `{number}`, `{org}`, `{repo}` and `{state}` (and `$NUMBER`, `$ORG`, `$REPO`, `$STATE`) are replaced first.

{: .warning }
Scripts and prompts run with your account and `--allow-all-tools`, with no confirmation. Only put commands in a workflow that you would run yourself.

**Set Up Workspace** runs your configured workspace setup script, or by default clones the repository to `~/source/<org>/<repo>` and checks out the branch `issue-<number>`. **Open in VS Code** runs `code` on that folder.

## Run it

Launch **Workflow Studio** from the app launcher, or run `npm start` in `packages/workflow-studio`.
