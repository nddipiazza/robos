---
title: "Agent Daemon (agentd)"
package: robos-agentd
category: services
summary: "Keeps a registry of sub-agent sessions, each with its own home directory and environment, behind a Unix socket and a small window."
description: "Creates a per-task session record, home folder, shell environment and log, and archives the log on termination. It does not yet create Linux users, cgroups or virtual displays."
---

Agent Daemon manages "sub-agent sessions". A session is a record plus a home directory with a prepared shell environment. Other RobOS code, such as the [Agent Session Library]({{ '/apps/robos-agent-session/' | relative_url }}), asks the daemon to create and end sessions.

## What a session is today

When you spawn a session for a task id such as `fix-login`, the daemon:

- normalizes the id and names the session `agent-fix-login`;
- creates a home directory (mode 0700) under `~/.config/robos/agentd/homes/`, or under `/home` when the daemon runs as root;
- writes `.bashrc` and `.profile` that set `ROBOS_AGENT`, `ROBOS_TASK_ID`, `USER` and `HOME`, and starts a log at `.logs/session.log`;
- links your SSH agent and GPG agent sockets into that home (or writes a placeholder file when they are not found), copies your git name and email from `~/.gitconfig`, and adds `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` and `GITHUB_TOKEN` exports to `.bashrc`, using your environment values or a placeholder string if unset;
- assigns a display number (starting at `:10`) and a stream URL.

The record also stores a random UID, a scope name, a memory limit (default 2048 MB), a CPU share and a PID limit. These are bookkeeping values. The code does not create a Linux account, apply cgroup limits, start Xvfb or serve the stream URL, and it does not launch any process for the agent. The inspector's display preview is a canvas drawing.

On terminate, the daemon copies the log to `~/.config/robos/agentd/archives/<task-id>/session.log`, releases the display number, removes the socket links, and deletes the home directory. State is kept in `~/.config/robos/agentd/agents.json`.

## The window

The window is titled **RobOS Desktop Agents Manager**. **+ Spawn Sub-Agent** opens a form with Task ID, an engineering role (Lead Architect Agent, Senior Code Reviewer, BDD Test Implementer, Security & Compliance Auditor) and a memory limit. Each session card has an inspector with details and logs, and a **Terminate** button. **Purge All** terminates every active session. Run it with `npm start` in `packages/robos-agentd`; there is no `.desktop` launcher.

## Socket and CLI

While the app is open it listens on `~/.config/robos/agentd/agentd.sock` and accepts JSON such as `{"command":"list"}` (commands: `spawn`, `list`, `inspect`, `log`, `terminate`, `wipeAll`). The `robos-agent` script in the package wraps this, and needs `python3`:

```bash
robos-agent spawn fix-login --role "Senior Code Reviewer" --memory 2048
robos-agent list
robos-agent inspect fix-login
robos-agent logs fix-login
robos-agent kill fix-login
```

{: .note }
For ephemeral agent homes that can be mounted on tmpfs, see [Agent Profile Daemon]({{ '/apps/robos-profiled/' | relative_url }}).
