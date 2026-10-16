---
title: "AI Prompt Studio"
package: ai-prompt
category: ai-agents
icon: ai-prompt.svg
summary: "Type a task in plain English and run it through the Claude CLI or GitHub Copilot CLI, with optional skills attached as hints."
description: "AI Prompt sends your prompt to an installed agent CLI and shows the steps and result it returns. It scans prompts for secrets first and keeps the last 50 runs."
---

AI Prompt is a one-box front end for agent CLIs. You describe a task ("List all Docker containers and their port mappings"), the app wraps it in a prompt that asks for a JSON summary, runs the agent in a subprocess, and displays the steps and result.

## Requirements

You need at least one agent CLI installed and signed in:

- `claude` (Claude Code). The app runs `claude --print --output-format json` and sends the prompt on standard input.
- `gh` with the Copilot extension. The app runs `gh copilot -- -p <prompt> --allow-all-tools --silent`.

The agent is chosen in the prompt box (`<robos-ai-textarea>`); the app falls back to Copilot if the box reports none. If the agent is not signed in, the box offers a login that opens a terminal with `claude /login` or `gh auth login`. A run is stopped after five minutes.

{: .warning }
The agent is asked to run commands with its own shell tool on your machine, and the Copilot call uses `--allow-all-tools`. Treat a prompt like a command you type yourself.

## What you do in it

1. Optionally pick skills in the **Skills** sidebar (filter box at the top). Built-in skills come from `packages/skills-manager/skills-data.js`; custom ones from `~/.config/robos/skills.json`. A selected skill's name and command are added to the prompt as hints, and `$UPPER_CASE` placeholders in a command become parameter fields.
2. Type the task under **What do you want to do?**. Use `@` to mention a file; the typeahead lists the directory or searches the text indexes in `~/.config/robos/search-index/`.
3. Click **Run with AI**, or press `Ctrl+Enter` (`Cmd+Enter` on macOS).
4. Read the **Summary**, the list of steps (action, command, output) and the **Result**. **New Prompt** resets the form.

**Skills Manager** opens the skills editor (`/usr/local/share/robos/skills-manager`). **History** shows past runs; **Clear All** deletes them.

## Data and security

- History: `~/.config/robos/ai-prompt-history.json`, trimmed to the last 50 runs.
- Before a prompt leaves the app it passes through `PromptSecurityGuard` from `robos-lib`. Depending on the policy, the prompt is blocked or sensitive values are redacted.
- If the agent answers in plain text instead of JSON, the app shows that text as the result with no steps.

Source: [`packages/ai-prompt`](https://github.com/nddipiazza/robos/tree/main/packages/ai-prompt).
