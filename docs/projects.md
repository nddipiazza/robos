---
title: Projects
layout: default
parent: Use RobOS
nav_order: 4
has_children: true
permalink: /projects/
redirect_from:
  - /projects/barista-order-api/
  - /projects/docu-vault-desktop/
  - /projects/pulse-metrics-cli/
  - /projects/urban-plant-tracker/
---

# Projects
{: .no_toc }

The sample projects in the RobOS repository: one web app and three games, each with its own pages, and four starter projects produced by the App Wizard's one-click presets.
{: .fs-6 }

## Applications and games

| Project | Kind | Location | What it is |
|:---|:---|:---|:---|
| [Get 'Em Gigs]({{ '/projects/getemgigs/' | relative_url }}) | Web app, Next.js | `packages/getemgigs` | A booking app for local bands. Bands trade attendance, lock deposits in an internal ledger and confirm attendance by scanning a QR code. |
| [Tabletop RPG]({{ '/projects/tabletop-rpg/' | relative_url }}) | Game, Godot 4.3 | `games/tabletop-rpg` | A turn-based dungeon crawler modelled on HeroQuest, with data-driven cartridges and an HTTP API that the tests use to play the game. |
| [Tactical cRPG Realm]({{ '/projects/crpg-realm/' | relative_url }}) | Game, Godot 4.3 | `games/crpg-realm` | A party-based, Infinity Engine-style RPG using D&D 5e SRD rules, tested end to end with Cucumber. |
| [RobOS RTS]({{ '/projects/robos-rts/' | relative_url }}) | Game, Godot 4.3 | `games/robos-rts` | A real-time strategy game with three asymmetric factions, an angled 3D camera, a deterministic 64 Hz simulation and an HTTP bot API. |

For how to build your own, see [Building apps]({{ site.baseurl }}{% link app-development-flow.md %}) and [Game development]({{ '/game-development.html' | relative_url }}).

## Starter projects from the App Wizard

The App Wizard's new-project page has four one-click presets. Each one fills in the project form, and the wizard then generates a folder in `packages/`, a `catalog-info.yaml` and an entry in `.robos/packages.yaml`. Four such folders are in the repository. They are starting points, not finished applications: each does only what the table says. Wizard usage is covered in [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}).

| Project | Archetype | Source | What the generated code does |
|:---|:---|:---|:---|
| Urban Plant Tracker | `robos:FrontEndApp` | [packages/urban-plant-tracker](https://github.com/nddipiazza/robos/tree/main/packages/urban-plant-tracker) | The `nextjs-vercel-web` web template with the name filled in: email and password accounts, abuse controls, SEO files, Cucumber end-to-end features and unit tests. The dashboard is a placeholder, and nothing in `src` is specific to plants. |
| Barista Order API | `robos:Microservice` | [packages/barista-order-api](https://github.com/nddipiazza/robos/tree/main/packages/barista-order-api) | A 36-line Node.js `http` server on port 3000 (or `PORT`) with no dependencies. `GET /api/health` returns a status object. Any other `/api/` path returns one fixed sample item. An `openapi.yaml` and a Dockerfile are included. |
| DocuVault Desktop | `robos:DesktopApp` | [packages/docu-vault-desktop](https://github.com/nddipiazza/robos/tree/main/packages/docu-vault-desktop) | An Electron window that shows a welcome card. It has no note editor, storage or encryption. `package.json` does not list Electron as a dependency. |
| Pulse Metrics CLI | `robos:ConsoleApp` | [packages/pulse-metrics-cli](https://github.com/nddipiazza/robos/tree/main/packages/pulse-metrics-cli) | `bin/cli.js` accepts `status`, `ping`, `report`, `--help` and `--version`. The output is fixed text: it does not ping anything or measure anything. |

The three non-web presets share a layout: a `dev-setup.sh` that checks for Node.js and git and runs `npm install`, a Dockerfile, a `catalog-info.yaml`, and a `package.json` whose `test` script is `node --test` with no test files behind it.

To see what the wizard produces, run the preset yourself, or read the generator in [packages/app-wizard/lib/generate-app.js](https://github.com/nddipiazza/robos/blob/main/packages/app-wizard/lib/generate-app.js) and the web template in `packages/app-wizard/templates/nextjs-vercel-web`.
