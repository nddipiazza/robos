---
title: "RobOS Tabletop Quest Map Editor"
package: tabletop-quest-editor
category: games
icon: tabletop-quest-editor.svg
summary: "Layer 2 quest scenario designer on top of calibrated blockmaps: place doors, monsters, furniture, traps, secret doors and stairs, then launch or export cartridges."
description: "Author HeroQuest-style and Election 2026 tabletop quest maps on top of .blockmap.json geometry and export playable Godot 4 cartridges."
---

RobOS Tabletop Quest Map Editor is the Layer 2 scenario authoring tool for the HeroQuest-style game in `games/tabletop-rpg`. While [Tabletop Blockmap Creator]({{ '/apps/tabletop-blockmap-creator/' | relative_url }}) calibrates the underlying board artwork into rooms and corridors (`.blockmap.json`), the Quest Map Editor lets you place quest-specific encounters, furniture, doors, hazards, and victory triggers on top of that blockmap and save directly to a playable `.cartridge.json`.

## What you can author

- **Doors & Passages**: Place open/closed doors, secret doors, and blocked wall tiles along room boundaries and corridors.
- **Monsters & Bosses**: Filter the monster catalog by faction or campaign (including classic HeroQuest dungeon monsters and Election 2026 Hydra bosses) and place encounters into rooms or corridors.
- **Furniture & Treasures**: Place tables, treasure chests, bookshelves, racks, thrones, alchemist benches, and quest objectives with rotation and multi-tile footprints.
- **Traps, Hazards & Stairs**: Mark pit traps, falling block traps, spear traps, and the starting staircase square.
- **Quest Briefing & Test Play**: Edit quest title, briefing text, gold bounty, and wandering monster type, then bundle the cartridge and launch Godot 4 in Player or Game Master mode.

## Running it

```bash
electron packages/tabletop-quest-editor
# Or open a specific cartridge or blockmap directly:
./packages/tabletop-quest-editor/launch.sh --cartridge=heroquest-trial
./packages/tabletop-quest-editor/launch.sh --blockmap=first_light_dungeon.blockmap.json
```

Snapshot debug port: `19195`. Source: [`packages/tabletop-quest-editor`](https://github.com/nddipiazza/robos/tree/main/packages/tabletop-quest-editor).
