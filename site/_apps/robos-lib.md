---
title: "RobOS Lib"
package: robos-lib
category: "libraries"
component_type: component
permalink: /robos-lib/
summary: "RobOS shared utilities — categories, .desktop file parsing, app registry"
description: "RobOS shared utilities — categories, .desktop file parsing, app registry"
---

RobOS shared utilities — categories, .desktop file parsing, app registry


## Shared runtime modules

`index.js` exports the app categories, desktop-file parser, app discovery and grouping helpers, `GitOpsSDLCParser`, prompt-security helpers, agent personas, voice clients and dashboard helpers.

Other utilities are loaded directly by file:

| Module | Purpose |
| --- | --- |
| `ai-agent.js` | One-shot requests through the active coding-agent CLI, with prompt security |
| `agent-selector.js` | Shared agent selection UI |
| `config-sync.js` | Back up, move and share RobOS configuration |
| `snapshot-cli.js` | Inspect app DOM state and capture screenshots |
| `app-mesh-engine.js` | Shared networking support for App Mesh |

Read [AI agents and API mode](/ai-providers/), [Config management](/config-management/) and [RobOS App Mesh](/app-mesh/) for the corresponding workflows.

## Source

Browse [`packages/robos-lib`](https://github.com/nddipiazza/robos/tree/main/packages/robos-lib) for implementation and exports.
