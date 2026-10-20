---
title: Agent harness and security
layout: default
parent: Training
nav_order: 2
has_children: true
permalink: /training/harness-and-security/
redirect_from:
  - /training/agent-harness-engineering/
---

# Agent harness and security
{: .no_toc }

Two lessons on the parts of RobOS that sit between you and a coding agent: a guard that scans prompts, and a daemon that gives an agent a separate home directory.
{: .fs-6 }

These are two separate pieces of code. The shared AI library (`robos-lib/ai-agent`) calls the guard, and the profile daemon is independent of it. Neither is a filesystem or network sandbox. Each lesson says what it checks, where it runs and where it stops.

| Lesson | Code | What it is |
|:---|:---|:---|
| [Configure the prompt security guard]({{ '/training/harness-and-security/prompt-security-guard.html' | relative_url }}) | `packages/robos-lib/prompt-security.js` | A regex and entropy scanner that redacts or blocks prompt text before it is sent. |
| [Run commands in an ephemeral agent profile]({{ '/training/harness-and-security/agent-profiles.html' | relative_url }}) | `packages/robos-profiled` | A daemon that creates a throwaway home directory and environment for a command. |

For which agent CLI answers a request, see [AI agents and API mode]({{ site.baseurl }}{% link ai-providers.md %}). For how RobOS picks models for different jobs, see [Agent tiers]({{ site.baseurl }}{% link agent-tiers.md %}). For the role prompts given to agents, see [Choose and customize agent personas]({{ '/training/agent-tasks/agent-personas.html' | relative_url }}).
