---
title: "cRPG Game Builder Academy"
package: crpg-game-builder-elearning
category: learning
summary: "Desktop Electron wrapper for the interactive RobOS cRPG Game Builder & Tactical Engine Academy course."
description: "Electron course viewer in packages/crpg-game-builder-elearning that opens the interactive RobOS cRPG Game Builder & Tactical Engine Academy curriculum from a repository checkout."
icon: crpg-game-builder-elearning.svg
permalink: /crpg-game-builder-elearning/
redirect_from:
  - /apps/crpg-game-builder-elearning/
related:
  - /elearning/crpg-game-builder/
  - /robos-elearning/
  - /crpg-editor/
---

`packages/crpg-game-builder-elearning` opens a dedicated `1400×900` Electron window over the self-contained **RobOS cRPG Game Builder & Tactical Engine Academy** course (`docs/projects/crpg-realm/create-your-own-game/elearning/index.html`, also playable in any browser at [`/elearning/crpg-game-builder/`](/elearning/crpg-game-builder/)).

## Curriculum & offline build

The course walks through designing a party-based isometric cRPG in Godot 4 with the RobOS Knowledge Graph: campaign JSON-LD modeling, 5-ft blockmap calibration, D&D 5e combat and spell resolution, traps, doors, and autonomous verification with the Infinity AI harness. `build-course.js` compiles the course modules into the standalone HTML bundle.

Because `main.js` loads `../../docs/projects/crpg-realm/create-your-own-game/elearning/index.html` via `loadFile`, launch it from a repository checkout (or update the `Exec=` path in `crpg-game-builder-elearning.desktop` to match your clone location):

```bash
electron packages/crpg-game-builder-elearning
```

For the full engine reference, see [Realm of Heroes CRPG](/projects/crpg-realm/) and [RobOS eLearning](/robos-elearning/). Source: [`packages/crpg-game-builder-elearning`](https://github.com/nddipiazza/robos/tree/main/packages/crpg-game-builder-elearning).
