---
title: Why RobOS
layout: default
parent: RobOS for Teams
nav_order: 1
permalink: /why-robos.html
---

# Why RobOS
{: .no_toc }

The problem RobOS is built around, the approach it takes, what exists in the repository today, and where it falls short. Read this if you are deciding whether to evaluate RobOS.
{: .fs-6 }

## The problem

Coding agents such as Claude Code, Codex, GitHub Copilot CLI and Antigravity can produce a large diff in one run. Four things make that hard to manage:

- A reviewer has to understand a change they did not write, often across many files.
- A diff shows which lines changed, not which services, schemas or consumers depend on them.
- Passing CI shows only what the existing tests cover.
- An agent usually runs as you, in your home directory, with your credentials, and the prompts you send can contain secrets.

RobOS is a set of desktop apps and libraries aimed at those four points. It does not remove the need for a human reviewer. It tries to give the reviewer better inputs.

![Many user stories and feature requests funneling down to one developer typing code by hand]({{ '/assets/images/typing-bottleneck.jpg' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs, showing the typing bottleneck that agents are meant to remove. The text on this page says what is built today.*

## The approach

| Problem | What RobOS provides | Where to read more |
|:---|:---|:---|
| Understanding a change | PR Review, an Electron app that walks a reviewer through a pull request in stages. In reviewer mode, by default, the diff view and the approve controls stay locked until the reviewer passes a knowledge check (80% pass mark by default); local reviews have no lock. | [PR Review Theater]({{ site.baseurl }}{% link pr-review-theater.md %}) |
| Impact beyond the diff | A knowledge graph stored as JSON-LD under `.robos/`, validated with SHACL shapes. `robos-graph` can diff two graph states and list the services, teams and contracts that the changed nodes touch. | [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}) |
| "Tests pass" as the only proof | An evidence runner in PR Review asks an agent to run scenarios and attach artifacts. A scenario reported as passed is rejected if it has no artifact file inside the run directory. The test harness in `packages/robos-test` can add Piper text-to-speech narration to a recording with ffmpeg. | [Walkthroughs and proof of work]({{ site.baseurl }}{% link walkthroughs.md %}) |
| Agents cannot use the desktop tools | RobOS apps expose DOM inspection through `snapshot-cli.js` in `robos-lib`, and `robos-mcp-router` is a router for the Model Context Protocol (MCP) servers listed in `~/.config/robos/mcp/servers.json`. | [Apps]({{ site.baseurl }}{% link apps.md %}) |
| Secrets and personal data in prompts | A prompt scanner in `robos-lib/prompt-security.js`, used by the AI text area, Agent Chat, `AgentSession` and the embedded agent router. Modes are `redact` (default), `block`, `warn`, `audit-only` and `off`. | [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}) |
| Many agent CLIs | Agents Manager lists Claude Code, GitHub Copilot CLI, Codex and Antigravity sessions in one window. RobOS skills are `SKILL.md` files under `plugins/robos/skills/`. | [Skills]({{ site.baseurl }}{% link robos-skills.md %}) |

Most RobOS apps are Electron apps written in plain JavaScript, and most of their state is plain files: settings under `~/.config/robos/` and project data under `.robos/` in your repository. The license is Apache-2.0. The [Apps]({{ site.baseurl }}{% link apps.md %}) page lists every app with its package.

## What is built and what is not

Built, with code in the repository:

- The PR Review app with the staged review, the knowledge-check gate, and the evidence runner.
- The knowledge graph library, its explorer app, SHACL validation, graph diff and blast-radius analysis.
- The prompt security scanner and its five modes.
- Agents Manager, including a panel for the Unified Harness Protocol router, and the `robos-agent-client` package.
- Per-user settings in RobOS Preferences, including the AI provider and GitHub account selectors.

Not built, or not what the older documentation said:

- Automatic model selection by task difficulty. The Agent Tiers settings are stored but nothing reads them. See [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}).
- Isolated agent accounts. Agent Daemon and Agent Profile Daemon create a home directory and environment variables for a task. They do not create separate Linux users or resource limits, so they are not a security boundary.
- Live agent desktop streaming. The Desktop Agents Viewer draws simulated screens from sample data.
- A server-side review gate. The knowledge check is enforced in the PR Review window. It is a prompt to the reviewer, not an access control on the repository.

## Limits to plan for

- **Platform.** The install scripts use `apt`, and the VM image is Ubuntu. Treat Debian-based Linux with a desktop as the supported setup unless the [Get started]({{ site.baseurl }}{% link getting-started.md %}) page says otherwise.
- **You bring the agents.** RobOS drives agent CLIs that you install and sign in to yourself. It does not supply models or API keys.
- **The graph needs upkeep.** Blast-radius results come from the relationships recorded in the graph. Missing or stale relationships give missing or stale impact results.
- **Evidence is checked for presence, not meaning.** The evidence runner confirms that artifacts exist. A person still has to look at them.
- **Some features need extra software.** Examples are Docker for the HarnessRouter container, Xvfb and ffmpeg for recorded test runs, and `pass` with GPG for the password apps.

If a feature you need is not listed above, check the app's own page under [Apps]({{ site.baseurl }}{% link apps.md %}) and the [Roadmap]({{ site.baseurl }}{% link roadmap.md %}) before assuming it exists.
