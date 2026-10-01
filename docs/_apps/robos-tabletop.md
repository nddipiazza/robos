---
title: "RobOS Tabletop Studio"
package: robos-tabletop
category: "games"
icon: robos-tabletop.svg
summary: "Tabletop RPG & HeroQuest cartridge form editor, 26x19 board studio, and Godot 4 Player & DunMaster runner"
description: "Visual form editor for HeroQuest and tabletop RPG cartridges backed by RobOS Knowledge Graph, featuring dual Player and DunMaster runtime modes in Godot 4."
---

# RobOS Tabletop Studio

RobOS Tabletop Studio is the visual authoring environment and cartridge manager for tabletop dungeon crawler board games modeled after *HeroQuest*. Backed by the RobOS Knowledge Graph (`tabletop-game` package), it provides visual form editors for Quests, Heroes, Monsters, Spells, Furniture, and the 26×19 tactical board grid.

[Tabletop RPG Engine Guide]({{ "/projects/tabletop-rpg/" | relative_url }}){: .btn .btn-primary .mr-2 }

![HeroQuest Board Map]({{ "/assets/images/tabletop-rpg/heroquest_board.jpg" | relative_url }})

## Features

- **KGraph Data Form Editor**: Visually edit heroes (Barbarian, Dwarf, Elf, Wizard), monsters (Goblin, Orc, Fimir, Skeletons, Gargoyle, Verag Boss), elemental spell cards, and dungeon objects with instant W3C SHACL shape validation.
- **Cartridge Bundler**: Compiles campaigns into standalone `.cartridge.json` files.
- **26×19 Board Studio**: Interactive tile grid previewer highlighting outer corridors, rooms, doors, and the central chamber.
- **Dual Execution Roles**:
  - **Player Mode**: Play as the heroic adventurers exploring rooms, opening doors to lift fog of war, and fighting monsters.
  - **DunMaster (Dungeon Master / Zargon) Mode**: Play as the Evil Wizard! View all hidden rooms behind the DM screen, summon wandering monsters, and command monster attacks against the heroes.

```mermaid
flowchart LR
    Editor["RobOS Tabletop Studio<br/>(Electron GUI)"] -->|Bundles| Cart["heroquest-the-trial.cartridge.json"]
    Editor -->|Saves| KGraph[".robos/kgraphs/tabletop-game/"]
    Cart --> Player["Godot 4 Player Mode<br/>(Heroes vs Fog of War)"]
    Cart --> DM["Godot 4 DunMaster Mode<br/>(Zargon DM vs Autonomous Heroes)"]
```
