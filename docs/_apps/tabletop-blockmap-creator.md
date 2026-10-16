---
title: "RobOS Tabletop Blockmap Creator"
package: tabletop-blockmap-creator
category: "games"
icon: tabletop-blockmap-creator.svg
summary: "Calibrate a dungeon board image to a tile grid and mark its corridors and rooms, then save the result into a game cartridge."
description: "Open a board image, set tile size and offsets, paint corridor tiles and define rooms, then write the map into a cartridge JSON file for the tabletop game."
---

Blockmap Creator turns a picture of a board into data the game can use. You line a square grid up with the artwork, mark which tiles are corridor floor, and outline the rooms. The geometry it writes is the fixed part of a map. Quest content (furniture, doors, monsters, notes) belongs to the cartridge and is edited in [Tabletop Studio]({{ '/apps/robos-tabletop/' | relative_url }}).

## Use it

1. Pick a **Board Preset** or click **Open Image...**. The presets are HeroQuest First Light Side A, HeroQuest Classic Stone Dungeon, First Light Side B and Fan Cavern Citadel. PNG, JPG, WebP and BMP images work.
2. In **Calibration**, set **Tile Size (px)** (steps of 1 and 0.1), **Offset X** and **Offset Y** (steps of 1 and 5) so the grid lines match the artwork. Set the grid columns and rows, or leave them on Auto. The status bar shows the image size and grid size, for example "1014 x 738 px" and "26 x 19 grid".
3. Choose a tool: **Select** (pan), **Corridor** with Toggle, Paint or Erase, **Room**, or **Erase**. For rooms, **Rectangle** takes a drag box and **Free Form** lets you click tiles and confirm with OK. **Undo** and **Redo** are available. Pan with middle-click or Space and drag, and zoom with the scroll wheel.
4. Edit each room's name, id, quadrant (NW, NE, SW, SE, Center) and shape in the **Active Room** panel. The **View Layers** section toggles the image, grid lines, coordinates, corridors and rooms and sets their opacity.
5. Click **Save Board Map** to write the map into a cartridge. Or use **Export JSON** to save it to a file, or **Copy JSON** to copy it.

**Save Board Map** updates the `maps` entry of `games/tabletop-rpg/cartridges/<slug>.cartridge.json` (width, height, rooms, doors, wall blocks, starting stair, calibration, background image) and keeps the rest of that map's data. The cartridge file must already exist.

## Launch options

The app is part of a repository checkout and reads `games/tabletop-rpg` for boards (`assets/boards`) and cartridges. Start it with:

```bash
./games/tabletop-rpg/blockmap-creator.sh                      # default: first_light_dungeon.png
./games/tabletop-rpg/blockmap-creator.sh heroquest_board.png  # a specific board image
./games/tabletop-rpg/blockmap-creator.sh --cartridge=heroquest-fortress-fire-king
```

`npm start` in `packages/tabletop-blockmap-creator` also works, and the package has a `launch.sh` that finds an Electron binary. A `--map=<image>` flag opens an image directly. `npm test` runs `node --test tests/*.test.js`.
