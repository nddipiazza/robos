---
title: Choose and customize agent personas
layout: default
parent: Plan and run agent tasks
grand_parent: Training
nav_order: 4
permalink: /training/agent-tasks/agent-personas.html
description: "A persona is a role prompt. Task Implementer adds it to the issue text before it starts an agent, and Task Planner labels each planned task with one. This lesson shows how a persona is chosen for..."
---

# Choose and customize agent personas
{: .no_toc }

A persona is a role prompt. Task Implementer adds it to the issue text before it starts an agent, and Task Planner labels each planned task with one. This lesson shows how a persona is chosen for an issue, how to edit the built-in ones, and how to add your own.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What a persona changes

A persona is a set of text fields plus an execution mode. It is defined in `packages/robos-lib/agent-personas.js`. When you start an agent, Task Implementer uses:

- `systemPrompt`, sent as the role directive.
- `developmentGuidance`, sent as the guidance for that role. Whatever is in the **Directives** box replaces it for this run.
- `executionMode`, which sets the environment variable `ROBOS_AGENT_MODE` for the agent and decides its `DISPLAY` (see below).

A persona does not restrict tools, files, network access or the model. The agent is the same `claude` process with the same permissions whichever persona you pick. It only gets different instructions.

## Built-in personas

| Slug | Role | Execution mode |
|:---|:---|:---|
| `software-architect` | Software Architect | headless |
| `frontend-web-dev` | Frontend Web Developer | headless |
| `game-dev` | Game Developer | headless |
| `backend-dev` | Backend Systems Developer | headless |
| `data-engineer-dev` | Data & Storage Engineer | headless |
| `devops-engineer` | DevOps & Cloud Engineer | headless |
| `non-headless-dev` | Non-Headless Developer | `ephemeral-gui` |
| `human-agent-copilot` | Human + Agent Desktop Co-Pilot | `desktop-session` |

Headless is the label used when a persona sets no mode. The three modes differ only in what Task Implementer sets for the agent:

| Mode | `DISPLAY` for the agent | Notes |
|:---|:---|:---|
| `headless` | Your current `DISPLAY`, or `:0` | The default. |
| `ephemeral-gui` | `:99`, or `ROBOS_XVFB_DISPLAY` | You must run an X server there, for example `Xvfb :99 -screen 0 1920x1080x24 &`. |
| `desktop-session` | Your current `DISPLAY`, or `:0` | Same as headless. The persona text asks the agent to pair with you in your open IDE. |

The Non-Headless Developer and Co-Pilot prompts tell the agent to use the IDE bridge tools (`robos_ide_set_breakpoint`, `robos_ide_get_thread_state`, the `robos_ide_refactor_*` tools) and the Chrome DevTools MCP. Those tools exist only if you have installed and enabled the [IDE Bridge MCP]({{ '/apps/ide-bridge-mcp/' | relative_url }}) and a Chrome DevTools MCP server for your agent. The persona does not install them.

## How a persona is chosen for an issue

Issues from GitHub and Jira carry no persona field, so Task Implementer decides from the issue text. It tries these in order and stops at the first match:

1. A label `role:<slug>`, for example `role:game-dev`.
2. Keyword rules on the title, body and labels. They are checked in this order: game (`godot`, `rpg`, `game`, `sprite`, `gdscript`), data (`database`, `sql`, `postgres`, `migration`, `kafka`, `schema`), frontend (`frontend`, `react`, `web`, `ui`, `component`, `css`, `view`), devops (`kubernetes`, `helm`, `docker`, `pipeline`, `deploy`), architecture (`architecture`, `adr`, `shacl`, `kgraph`, `design`), non-headless, co-pilot, then backend (`api`, `rest`, `grpc`, `service`).
3. If nothing matches, Backend Systems Developer.

{: .tip }
The keyword rules are broad. A backend issue that mentions a "view" or "web" will be treated as frontend work. When the guess matters, add a `role:<slug>` label to the issue, or change the persona in the dropdown above the output before you click **Start Agent**.

Task Planner assigns a persona to each planned task from the model's answer or, for templates, from the keyword rules in `agent-personas.js`. On GitHub it does not write the persona to the issue, so the label is the only way to carry the choice into Task Implementer. See [Plan a feature in Task Planner]({{ '/training/agent-tasks/plan-a-feature.html' | relative_url }}).

## Edit a persona in the app

1. In Task Implementer or Task Planner, click **Agent Personas** (Task Planner labels it **Agent Personas & Prompts**) in the header.
2. Pick a role in the left list.
3. Edit the fields: Role & Title, Specialization & Description, Core System Prompt (Persona Directive), RobOS Development & Architectural Guidance, Planning Directive (Epic Breakdown) and Implementation Directive (Task Execution).
4. Click **Save Persona Changes**. Click **Add Custom Persona** to start a new one.

Changes are saved to `~/.config/robos/agent-personas.json`. **Restore Defaults** deletes that file, which also removes your custom personas.

The Core System Prompt and the Development Guidance go into the agent prompt. The Implementation Directive appears, together with the guidance, in the **Directives** box. The Planning Directive is saved with the persona, but no app sends it to an agent today. Task Planner's generation prompt includes only each persona's role, ID and description.

## Add a persona in a file

`~/.config/robos/agent-personas.json` is a JSON array. An entry whose `id` or `slug` matches a built-in persona overrides the fields you set and keeps the rest. Any other entry is added as a custom persona. This file adds a persona that is picked by the label `role:release-engineer`:

```json
[
  {
    "id": "urn:robos:agent:release-engineer",
    "slug": "release-engineer",
    "role": "Release Engineer",
    "title": "Release Engineer Agent",
    "description": "Prepares changelogs and release branches.",
    "executionMode": "headless",
    "systemPrompt": "You are a release engineer.",
    "developmentGuidance": "1. Never push tags.\n2. Update CHANGELOG.md."
  }
]
```

Reopen the app to load it. The app form has no field for `executionMode`, so set it here if you need `ephemeral-gui` or `desktop-session`.

The knowledge graph also holds `robos:AgentPersona` nodes in the organization package. Task Implementer and Task Planner do not read them, and editing a persona in the app does not change them.

## Check which personas are loaded

From a checkout, this prints the slug of every persona, built-in and custom. Custom ones are marked with an asterisk:

```bash
node -e "const p = require('./packages/robos-lib/agent-personas'); console.log(p.loadAgentPersonas().map(x => x.slug + (x.isDefault ? '' : '*')).join(' '))"
```
