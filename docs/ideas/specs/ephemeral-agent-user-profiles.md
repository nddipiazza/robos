---
title: "Proposal: agent Linux accounts and live agent desktops"
layout: default
nav_exclude: true
redirect_from:
  - /ideas/specs/robos-desktop-agents.html
---

# Proposal: agent Linux accounts and live agent desktops
{: .no_toc }

Run each agent as its own Linux user, and let you watch what it is doing on screen.
{: .fs-6 }

{: .important }
Proposal, not built. The directory-and-environment version of agent profiles exists; real accounts and real agent displays do not. This page replaces two older specs, one for ephemeral user profiles and one for desktop agents.

## Proposal

**Real accounts.**

- Create a Linux user per agent with its own UID and a `tmpfs` home, so parallel agents do not share dotfiles, browser profiles or caches.
- On exit, kill the agent's processes through a transient systemd scope or cgroup, unmount the home and delete the user.
- Pass the host's SSH agent, GPG agent, git identity and API tokens into the agent session without exposing them in the agent's files.

![Agent sandbox with a RAM-backed home, a virtual display, credential tunnel and teardown that wipes the profile]({{ '/assets/images/ephemeral-sandboxes-architecture.jpg' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs. The text on this page says what is built today.*

**Seeing the agent work.** The two older specs proposed different models, and the choice is open:

- Agent apps open windows on your own display next to host windows, with X authority and audio sockets shared.
- Each agent gets a virtual display (Xvfb or a headless Wayland compositor), streamed into the Desktop Agents viewer in a grid or picture-in-picture, with an input pass-through toggle.

![Desktop agent sessions architecture with a host daemon, virtual displays streamed to a viewer and a session library]({{ '/assets/images/secure-desktop-bridge-architecture.jpg' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs. The text on this page says what is built today.*

**Proof of work.** An agent that finishes a task puts its result on screen (the app running, the passing test run) and waits for you to confirm, with a toast notification.

![Five-phase implementation plan for desktop agents, from sub-user spawning to the proof of work protocol]({{ '/assets/images/desktop-agents-roadmap.jpg' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs, showing the five phases the earlier spec proposed. No dates were set; the text on this page says what is built today.*

## What exists today

- [Agent Profile Daemon]({{ '/apps/robos-profiled/' | relative_url }}) (`packages/robos-profiled`) builds a profile that is a directory plus environment variables. It mounts a `tmpfs` home when the daemon runs as root and otherwise uses a plain directory (`tmpfs-manager.js`). It copies the X authority file and links audio sockets into it (`display-bridge.js`), and forwards SSH, GPG and git identity (`identity-forwarder.js`). `robos-run-as --agent NAME COMMAND` runs a command with that environment. `spawnSwarm` in `daemon.js` creates several profiles at once.
- The profile's UID is a random number between 15000 and 24999. The code never calls `useradd` and sets no cgroup limits, so commands run as the host user with a different `HOME`.
- The taskbar (`packages/robos-desktop`) shows a count of active agent profiles and a "Kill & Wipe" button for each.
- [Agent Daemon]({{ '/apps/robos-agentd/' | relative_url }}) (`packages/robos-agentd`) keeps a registry of agent sessions behind a Unix socket and tunnels SSH and GPG sockets into each session's home. Its display engine only assigns display numbers and stream URLs. Nothing starts an X server or serves a stream.
- [Desktop Agents Viewer]({{ '/apps/desktop-agents/' | relative_url }}) (`packages/desktop-agents`) draws simulated screens on canvases from sample data.

## Source

Raw notes: [`ideas/inbox/ephemeral-agent-user-profiles.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/ephemeral-agent-user-profiles.txt) and [`ideas/inbox/robos-desktop-agents.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/robos-desktop-agents.txt). The earlier long specs are in the git history.
