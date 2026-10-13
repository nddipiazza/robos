---
title: "Agent Profile Daemon"
package: robos-profiled
category: services
summary: "Creates short-lived agent profiles with their own home directory (tmpfs when run as root) and runs commands with that home and environment."
description: "Provisions a my-agent-<name> profile, forwards display, SSH and git settings into it, and removes it on termination. It does not create separate Linux users."
---

Agent Profile Daemon provisions "ephemeral agent profiles": a home directory plus environment variables that a command runs with. The window title is **RobOS Ephemeral Profile Manager**.

## What provisioning does

For a name such as `reviewer`, the daemon creates a profile `my-agent-reviewer` and:

- creates a home directory under `~/.config/robos/profiled/homes/` (or `/home` when run as root). Only when run as root does it mount a tmpfs there (`mount -t tmpfs`, default size 2G). As a normal user the directory is an ordinary folder and the profile is flagged as a mock mount;
- copies files from `/etc/skel` and writes a baseline `.bashrc` and `.profile`;
- sets up display variables (`DISPLAY`, `WAYLAND_DISPLAY`, `XAUTHORITY`) in the profile, and forwards the SSH agent socket, your git identity and the `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` and `GITHUB_TOKEN` values from your environment (a placeholder string is used when a key is not set);
- records a random UID, a scope name, group names (`video`, `render`, `audio`, `kvm`) and a memory value.

The UID, groups and scope are stored in the profile record only. The code does not run `useradd`, add the groups, or create a cgroup. Commands run as your own user with `HOME` and a few `ROBOS_*` variables changed.

On termination it removes the forwarded links, unmounts (as root) and deletes the home directory. State is in `~/.config/robos/profiled/profiles.json`.

## Use it

In the window, **+ Provision Profile** asks for a name, a role (Code Reviewer, Implementation Agent, Test Fabric Runner) and a model name, and **Spawn 4x Swarm** creates `swarm-1` to `swarm-4`. To open the window, run `electron . --no-sandbox` in `packages/robos-profiled`; there is no `.desktop` launcher.

While the app is open it listens on `~/.config/robos/profiled/profiled.sock`. Two scripts in the package use that socket and need `python3`:

```bash
robos-profile create reviewer --role "Code Reviewer"
robos-profile list
robos-profile inspect my-agent-reviewer
robos-profile terminate my-agent-reviewer

robos-run-as --agent worker-1 --autoclean npm test
```

`robos-run-as` creates the profile if needed, runs the command with the profile's `HOME` and environment, and with `--autoclean` terminates the profile when the command exits.
