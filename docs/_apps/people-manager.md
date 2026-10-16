---
title: "People Manager"
package: people-manager
category: arch-planning
summary: "Prototype roster screen for teams of people and AI agents, grouped by Team Topologies type. It shows built-in sample data."
description: "A prototype that lists sample teams with their human and agent members. Nothing is read from or saved to disk yet."
---

People Manager is a prototype. It displays a fixed sample organisation ("Acme Global Platform Engineering") to show how a roster of people and AI agents could look. It does not read your teams.

## What it shows

- A header with **+ New Team** and **+ Add AI Agent Persona** buttons, and a search box for teams.
- A team list. Each sample team has a Team Topologies type (platform, stream-aligned or enabling) and an interaction mode.
- For the selected team, the members: humans with a role, and agents with a model name, skills and MCP server names.

## What the buttons do

| Control | Behavior today |
|---|---|
| **+ New Team** | Shows an alert that says the team was saved to `.robos/teams.yaml`. No file is written. |
| **+ Add AI Agent Persona** | Adds the same fixed sample agent ("Codex Autonomous Refactorer") to the selected team, in memory. |
| **Bind MCP Skill** (on each agent) | Adds the skill `contract-drift-detector` to that agent, in memory. |

The roster lives in `main.js`. Changes are lost when you close the window. The header text mentions `.robos/teams.yaml` and the stat cards show fixed numbers; the app never reads that file.

## Run it

The package has no `.desktop` launcher. Run `npm start` in `packages/people-manager`.
