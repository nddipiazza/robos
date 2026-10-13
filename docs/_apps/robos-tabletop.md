---
title: "RobOS Tabletop Studio"
package: robos-tabletop
category: "games"
icon: robos-tabletop.svg
summary: "Editor for HeroQuest-style quests, heroes, monsters, spells and boards that bundles cartridges and launches the Godot 4 game in player or game-master mode."
description: "Form-based editor over the tabletop-game knowledge graph package. It writes cartridge JSON files for the Godot game in games/tabletop-rpg and starts that game for you."
---

Tabletop Studio is the authoring front end for the HeroQuest-style game in `games/tabletop-rpg`. You edit quest data in forms, bundle it into a cartridge file, and the Godot 4 game plays that cartridge. For the game engine itself, see [Tabletop RPG]({{ '/projects/tabletop-rpg/' | relative_url }}).

## Requirements

- The repository checkout: the app reads and writes paths relative to the repo root (`.robos/kgraphs/tabletop-game/package.jsonld`, `games/tabletop-rpg/`) and uses `packages/robos-gaming` to bundle cartridges.
- Godot 4 to play. The app looks for `$GODOT_BIN`, `~/.local/bin/godot4`, `~/.local/bin/godot`, `~/apps/godot4`, `/usr/bin/godot4`, then `/usr/bin/godot`, and falls back to `games/tabletop-rpg/play.sh`. If none exist it reports "Godot 4 binary not found."

## What you do in it

The tabs are **Quest & Campaign**, **Heroes**, **Monsters & Bosses**, **Board & Map Studio** and **Spells & Items**.

- **Quest & Campaign.** A campaign holds quests. Each quest has a slug, title, ruleset (HeroQuest Classic, D&D 5e SRD Tabletop Grid, or OGL D20), starting square, gold bounty, a story briefing, a boss monster and a board theme. You can mark a quest complete, reset it, delete it, and trade items between quests.
- **Heroes and Monsters & Bosses.** Edit body and mind points, attack and defend dice, equipment, inventory and spells for heroes, and dice, movement, room and undead, boss or spellcaster flags for monsters. Each page also has a small action panel that rolls the dice.
- **Board & Map Studio.** Choose a board image and edit its map. The board options in the quest form are 28 x 21 (fan dungeon), and 26 x 19 (HeroQuest Classic Side A, First Light Side B). Undo and redo are available. To calibrate a new board image, use [Tabletop Blockmap Creator]({{ '/apps/tabletop-blockmap-creator/' | relative_url }}).
- **Spells & Items.** Elemental spell and item catalog.

Header buttons:

| Button | Action |
|---|---|
| **Pick Spells** | Opens the spell draft dialog. |
| **Hero Trade** | Opens the item trade dialog. |
| **Save to KGraph** | Writes the edited entities into `.robos/kgraphs/tabletop-game/package.jsonld`. |
| **Export Quest Pack** | Bundles the current quest to `games/tabletop-rpg/cartridges/<slug>.cartridge.json`. |
| **Play as Hero** | Opens the spell draft, bundles the quest, and starts Godot in player mode. |
| **Play as Game Master** | Bundles the quest and starts Godot in game-master mode. |

When the Godot window closes, the app reads the cartridge's quest status and, if the quest is marked completed, advances the campaign to the next quest.

## Run it

Launch from the app launcher, or run `npm start` in `packages/robos-tabletop`. `npm test` runs the tests in `tests/`.

{: .note }
The installed `.desktop` file in the repository points at a developer's home folder (`/home/ndipiazza/.local/bin/robos-tabletop`), so start it with `npm start` unless you have your own launcher.
