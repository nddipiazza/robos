---
title: Run commands in an ephemeral agent profile
layout: default
parent: Agent harness and security
grand_parent: Training
nav_order: 2
permalink: /training/harness-and-security/agent-profiles.html
redirect_from:
  - /training/agent-harness-engineering/03-ephemeral-sandboxes-and-custom-personas.html
---

# Run commands in an ephemeral agent profile
{: .no_toc }

`packages/robos-profiled` creates a throwaway home directory with its own environment, runs a command in it, and deletes the directory afterwards. This lesson shows the commands and spells out what a profile isolates and what it does not, because the name suggests more than the code does.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What a profile is

A profile is named `my-agent-<name>`. Creating one does this:

| Does | Does not |
|:---|:---|
| Creates a home directory with mode `0700` and writes `.bashrc` and `.profile` | Create a Linux user. Commands run as the user who started the command. |
| Mounts that directory as a `tmpfs` of `2G`, but only when the daemon runs as root | Mount anything when the daemon runs as a normal user. The home is then an ordinary directory under `~/.config/robos/profiled/homes/`. |
| Copies `~/.Xauthority` and points `DISPLAY` at your current display | Start a virtual display. Windows an agent opens appear on your desktop. |
| Symlinks your SSH agent socket and GPG agent socket, and copies `~/.gitconfig` | Apply the recorded `groups`, `scope` or `memoryMb`. They are stored in the profile but nothing enforces them. The `uid` is only used to `chown` `.Xauthority` when the daemon runs as root. |
| Writes `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` and `GITHUB_TOKEN` into the profile's `.bashrc` | Limit network access, processes or which files outside the profile the command can read or write |
| Deletes the directory when the profile is terminated | |

So a profile gives a command a clean `HOME`: nothing from your real `~` (npm cache, `~/.claude`, `~/.config/gh`) is picked up through that variable. It is not a security boundary. The command runs with your user's permissions and can still open absolute paths such as `/home/you/.ssh`.

{: .warning }
If any of the four API key variables is set in the daemon's environment, its value is written in plain text into the profile's `.bashrc`. If it is not set, a placeholder `sk-robos-mock-<name>` is written, and the profile's `apiTokensInjected` list still names the variable.

## Start the daemon

The daemon is part of the `robos-profiled` Electron app. Starting the app starts the daemon and opens the window titled RobOS Ephemeral Profile Manager:

```bash
electron packages/robos-profiled
```

The daemon listens on a Unix socket at `~/.config/robos/profiled/profiled.sock` and keeps its state in `~/.config/robos/profiled/profiles.json`. The window has **+ Provision Profile**, which asks for a name, a role and a model, and **Spawn 4x Swarm**, which creates four profiles at once.

## Create, inspect, run and terminate

The two helper scripts live in the package folder. `robos-profile` needs `python3` to talk to the socket.

```bash
packages/robos-profiled/robos-profile create reviewer --role "Code Reviewer"
packages/robos-profiled/robos-profile list
packages/robos-profiled/robos-profile inspect my-agent-reviewer
```

`create` prints the profile as one line of JSON. An abridged example:

```json
{
  "ok": true,
  "profile": {
    "name": "reviewer",
    "username": "my-agent-reviewer",
    "home": "/home/you/.config/robos/profiled/homes/my-agent-reviewer",
    "tmpfs": true,
    "quota": "2G",
    "display": ":0",
    "sshForwarded": true,
    "gitAuthor": "Your Name <you@example.com>",
    "apiTokensInjected": ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN"],
    "role": "Code Reviewer",
    "model": "claude-sonnet-4-20250514",
    "status": "active"
  }
}
```

The `model` is only recorded. Nothing starts a model from it. The `tmpfs` field is always `true`, whether or not a mount happened. To see whether the home is really in memory, run `mount | grep my-agent-`. Likewise `sshForwarded` and `gpgForwarded` are `true` even when the host socket does not exist. The daemon then writes a placeholder file instead of a symlink.

Run a command inside a profile with `robos-run-as`. It creates the profile if needed, sets `HOME`, `ROBOS_AGENT=1` and `ROBOS_AGENT_NAME`, sources the profile's `.bashrc`, then runs your command:

```bash
packages/robos-profiled/robos-run-as --agent tester npm test
```

Remove the profile and its directory with the full name:

```bash
packages/robos-profiled/robos-profile terminate my-agent-tester
```

## Known issues

- Terminate with the full name, `my-agent-<name>`. The daemon marks the profile terminated for either form, and removes the forwarded sockets and `.gitconfig`. It deletes and unmounts the home directory only when it is given the full name. `robos-profile terminate tester` and `robos-run-as --autoclean`, which passes the short name, leave the home directory behind, including the `.bashrc` that holds the API keys. Delete it by hand. If it is a `tmpfs`, run `sudo umount` on it first.
- `robos-profile` reads one 8 KB reply from the socket. That fits a single profile but would cut off a `list` reply with more than a handful of profiles.

## Ephemeral display for GUI agents

If an agent needs a display that does not appear on your desktop, that comes from a virtual X server, not from a profile. The built-in Non-Headless Developer persona sets `DISPLAY=:99` and expects you to run one yourself. See [Choose and customize agent personas]({{ '/training/agent-tasks/agent-personas.html' | relative_url }}). The Docker test image starts `Xvfb :99 -screen 0 1920x1080x24+32` in `infra/docker/entrypoint.sh`.

The source is in [`packages/robos-profiled`](https://github.com/nddipiazza/robos/tree/main/packages/robos-profiled), and the app page is [robos-profiled]({{ '/apps/robos-profiled/' | relative_url }}).
