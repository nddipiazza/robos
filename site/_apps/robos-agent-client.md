---
title: "RobOS Agent Client"
package: robos-agent-client
category: "libraries"
component_type: component
permalink: /robos-agent-client/
summary: "RobOS Agent Client — agent CLI provider catalogs (Codex, AGY, Claude Code, GitHub Copilot) and the work-task backend invocations and runner used by Task Implementer, Dev Central and PR Review"
description: "RobOS Agent Client — agent CLI provider catalogs (Codex, AGY, Claude Code, GitHub Copilot) and the work-task backend invocations and runner used by Task Implementer, Dev Central and PR Review"
---

RobOS Agent Client — agent CLI provider catalogs (Codex, AGY, Claude Code, GitHub Copilot) and the work-task backend invocations and runner used by Task Implementer, Dev Central and PR Review


## Provider discovery and invocation

`providers.js` is the provider catalog used by the shared agent selector. It discovers coding-agent CLIs, their sign-in state and model choices for Codex, AGY (Antigravity), Claude Code and GitHub Copilot. Reading the catalog does not start a model.

`one-shot.js` provides one-shot invocation support. `lib/` contains the task backend and runner used by [Task Implementer](/task-implementer/), [Dev Central](/dev-central/) and [PR Review](/pr-review/).

For user setup and the optional direct API path, see [AI agents and API mode](/ai-providers/).

## Source

Browse [`packages/robos-agent-client`](https://github.com/nddipiazza/robos/tree/main/packages/robos-agent-client) for implementation and exports.
