---
title: "Task Planner"
package: task-planner
category: ai-agents
icon: task-planner.svg
summary: "Describe a feature or pick a template, have GitHub Copilot draft epics and tasks, edit them, and create them as issues on your task server."
description: "Also called Task Explorer in its window and launcher. It generates a task list with gh copilot, creates GitHub or Jira issues, and manages linked project plans in the knowledge graph."
---

Task Planner (the window and `.desktop` entry are named **RobOS Task Explorer**) turns a plain-language description into a list of epics and tasks, lets you edit it, and creates the tickets on your task server.

## Requirements

- A task server in `~/.config/robos/settings.json`. GitHub needs the `gh` CLI signed in. Jira needs its URL, a username and an API token in `pass` (`token_pass_path`). If none is set the window shows **Open Task Servers**; see [Task Servers]({{ '/apps/task-servers/' | relative_url }}).
- The `gh copilot` extension. Generation runs `gh copilot -p <prompt> --allow-all-tools --silent` and gives up after 3 minutes.

## Plan new work

1. Pick a project in the **Projects** list, or create one, and click **+ Plan New Feature**. Fill in the tech stack and architecture context, the microservices or repositories involved, and optionally a **Parent Epic** (for Jira, an existing epic).
2. Either describe the work in the prompt box and click **Generate with AI**, or choose a template. **Browse All Templates** opens the library; there are 67 built-in templates in ten categories (Services & APIs, Front-End Applications, Game Development, Mobile Applications, Libraries & SDKs, Knowledge Graph & Schemas, Data & Storage, Cloud & Infrastructure, DevOps & Observability, RobOS Platform & Agent Extensions). A template opens a form, and **Generate Task Plan** turns your answers into tasks. **Create Custom Template** saves your own under `~/.config/robos/task-planner/custom-templates/`.
3. The AI may ask follow-up questions as an "Interactive Architecture Form" (Previous / Next Question) before **Generate Epics & Tasks**.
4. The result appears under **Project Tasks & Epics**. Use **+ Add Epic** and **+ Add Task** to edit it, and **Save to Project** to keep it locally in `~/.config/robos/task-planner/projects/`.
5. **Sync All to Server** creates the issues: `gh issue create` for GitHub (with a `role:<persona>` label added), or the Jira REST API. A link between a blocker and a blocked task is created too.

## Personas

Each generated task is assigned a developer persona (for example Software Architect, Frontend Web Developer, Backend Systems Developer), and the prompt includes the persona list. **Agent Personas & Prompts** lets you edit them, add custom ones, or **Restore Defaults**. They are the same personas that [Task Implementer]({{ '/apps/task-implementer/' | relative_url }}) uses.

## KGraph Project Plans

**KGraph Project Plans** is a separate workflow for plans over issues that already exist. Start the app with `ROBOS_GRAPH_ROOT` set to the directory that contains `.robos`. You paste a version-1 plan that lists existing GitHub issue URLs. **Preview plan** reads those issues with your `gh` login and validates the graph, and **Save reviewed plan** writes the plan to the project node. It does not create, close or approve GitHub issues. A command-line equivalent is `packages/task-planner/bin/project-plan.js` with `list`, `view`, `export`, `propose --file` and `apply --file`. The format, status values and limits are in `packages/task-planner/PROJECT-PLANS.md`.

## Run it

Launch from the app launcher, or run `npm start` in `packages/task-planner`.
