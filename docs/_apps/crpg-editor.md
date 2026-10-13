---
title: "RobOS cRPG Editor"
package: crpg-editor
category: "games"
icon: crpg-editor.svg
summary: "Desktop editor for the cRPG in games/crpg-realm: campaigns, characters, items, enemies, spells, abilities and battle maps."
description: "The cRPG Editor reads and writes the JSON-LD content files of games/crpg-realm, can build map collision grids with a Python tool, and can launch a campaign in the Godot 4 game."
---

The cRPG Editor is the authoring tool for the `robos-crpg` game ("Realm of Heroes", in `games/crpg-realm`). Each campaign, character, map and so on is one JSON-LD file in that folder, so the files can be committed and reviewed like code. The game itself and its test suite are described in [Tactical cRPG & Infinity AI Engine]({{ '/projects/crpg-realm/' | relative_url }}); a worked example is the [Campaign Editor Tutorial]({{ '/projects/crpg-realm/campaign-editor-tutorial.html' | relative_url }}).

![The cRPG Editor Campaign tab showing campaign metadata, the list of included maps and the list of included characters]({{ '/assets/images/screenshots/crpg-editor-overview.png' | relative_url }})
{: .robos-zoomable-img }

*The Campaign tab: metadata and starting scene at the top, then the maps and characters the campaign includes. This capture is older and shows fewer tabs than the current app.*

## Tabs

| Tab | What you edit | Folder under `games/crpg-realm` |
|---|---|---|
| **Campaign** | Title, slug, world setting, rule system, difficulty, starting scene and map, story synopsis, which maps and characters are included, quest journal and world flags | `campaigns/` |
| **Characters & NPCs** | Heroes and non-player characters | `characters/` |
| **Items** | Items | `items/` |
| **Enemies** | Enemies | `enemies/` |
| **Spells** | Spells | `spells/` |
| **Abilities** | Abilities | `abilities/` |
| **Maps** | Battle maps: terrain, size in feet, optional artwork underlay and a list of placed objects (select, place and pan tools; `Ctrl+Z` undoes and `Ctrl+Y` redoes while the Maps tab is open) | `maps/` |

Events, scenes and imported art (portraits, icons, tokens, sprites, backgrounds, models) are also read from their folders under `events/`, `scenes/` and `assets/`. The editor creates any missing folder on start.

## Things the buttons do

- **Save** writes the open campaign as a `.jsonld` file in `campaigns/`.
- **Build PNG & Grid** (Maps) runs `python3 -m robos_crpg_blockout build <map>.jsonld --game-dir <folder>` from `packages/robos-crpg-blockout`. It writes a PNG to `assets/blockouts/` and stores blocked, opaque, difficult and cover cells in the map file. It needs `python3`. **Export PNG** copies the built image elsewhere.
- **Generate Cartridge** bundles the campaign into `<slug>.cartridge.json` with `CartridgeBundler` from `packages/crpg-builder`.
- **Render as Game** saves the campaign, bundles a cartridge into `cartridges/`, then starts Godot with `--path games/crpg-realm --cartridge <slug>` and `CRPG_MODE=real`. It looks for Godot 4 in `$GODOT_BIN`, `~/.local/bin/godot`, `~/.local/bin/godot4`, `~/apps/godot4`, `/usr/bin/godot4`, `/usr/local/bin/godot4` and `/usr/bin/godot`, and falls back to `games/crpg-realm/play.sh`. If none exists it reports "Godot 4 binary not found."

## Setup

```bash
electron packages/crpg-editor
```

Set `ROBOS_CRPG_DIR` to edit a game folder other than `games/crpg-realm`. Tests run with `npm test` in the package (`node --test tests/*.test.js`). Source: [`packages/crpg-editor`](https://github.com/nddipiazza/robos/tree/main/packages/crpg-editor).
