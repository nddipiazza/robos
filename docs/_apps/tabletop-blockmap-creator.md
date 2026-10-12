---
title: "RobOS Tabletop Blockmap Creator"
package: tabletop-blockmap-creator
category: "games"
icon: tabletop-blockmap-creator.svg
summary: "Visual calibration tool for dungeon board images: tile size, offset X/Y, 1-tile border, static corridor draw tool, and room boundary authoring"
description: "Visual calibration tool for dungeon board images: tile size, offset X/Y, 1-tile border, static corridor draw tool, and room boundary authoring"
---

# RobOS Tabletop Blockmap Creator

The **Tabletop Blockmap Creator** is the dedicated visual calibration and level geometry authoring tool for RobOS tabletop dungeon games (HeroQuest, First Light, and custom dungeon crawlers). It allows developers and designers to take **any raw image** (scans, fan-made maps, hand-drawn grids) and transform it into a precision-calibrated, reusable static board blockmap.

![Tabletop Blockmap Creator Architecture]({{ '/assets/images/architecture/tabletop-blockmap-creator-arch.jpg' | relative_url }})

## The Two-Layer Architecture

RobOS separates tabletop dungeon maps into two distinct architectural layers:

```mermaid
flowchart TD
    classDef l1 fill:#0f172a,stroke:#00bcd4,stroke-width:2px,color:#fff
    classDef l2 fill:#1e1b4b,stroke:#f59e0b,stroke-width:2px,color:#fff
    classDef tool fill:#042f2e,stroke:#10b981,stroke-width:2px,color:#fff

    subgraph Layer1["🗺️ Layer 1: Static Board Geometry (Permanent Physical Board)"]
        Art["Raw Board Artwork Image<br/>(first_light_dungeon.png, heroquest_board.png)"]:::l1
        Calib["Grid Calibration<br/>- Tile Size (px)<br/>- Pixel Offset X, Y<br/>- Add 1-Tile Border Checkbox"]:::l1
        StaticRooms["Permanent Room Boundaries<br/>(22 Authentic Rooms, Quadrants, Dimensions)"]:::l1
        StaticCorridors["Permanent Corridor Floor Walkways<br/>(Outer Perimeter, Inner Hallways)"]:::l1
    end

    subgraph Editor["🛠️ Tabletop Blockmap Creator (This Tool)"]
        DrawCorr["Corridor Draw Tool<br/>(Click & Drag to Toggle/Paint)"]:::tool
        DrawRoom["Room Draw Tool<br/>(Box Drag & Tile Edge Toggle)"]:::tool
    end

    subgraph Layer2["⚔️ Layer 2: Dynamic Quest Layer (HeroQuest Cartridges)"]
        Furn["Furniture Placement<br/>(Chests, Tables, Bookcases)"]:::l2
        Doors["Doors & Secret Passages<br/>(Closed, Open, Secret)"]:::l2
        Spawns["Monsters & Starting Stairs<br/>(Heroes, Dread Warriors, Witch Hand)"]:::l2
        Events["Quest Notes & Story Triggers<br/>(Notes A–G, Special Treasures)"]:::l2
    end

    Art --> Calib
    Calib --> Editor
    Editor --> StaticRooms
    Editor --> StaticCorridors
    StaticRooms --> Layer2
    StaticCorridors --> Layer2
```

### 1. Layer 1: Static Board Blockmap (Permanent Physical Cardboard)
Layer 1 represents the immutable physical board. It never changes between quests:
- **Tile Size (`tileSize`)**: Exact pixel width and height of each square tile.
- **Image Offsets (`offsetX`, `offsetY`)**: Pixel shift from the artwork border to the grid origin.
- **1-Tile Border Option**: Standard perimeter corridor bounding the four edges of the board.
- **Static Rooms**: Permanent walls and dimensions `[x, y, w, h]` for each printed chamber.
- **Static Corridors**: Which grid tiles are walkable floor vs. solid void.

### 2. Layer 2: Dynamic Quest Layer (Adventures & Cartridges)
Layer 2 builds on top of Layer 1 to create specific quests and missions:
- Placed furniture (alchemist bench, weapons racks, tombs, throne)
- Door placements between rooms and corridors (open, closed, secret)
- Wall blocks placed in specific corridors to restrict player movement
- Wandering monsters, starting stairs, and story trigger notes

---

## Interactive Controls & Tools

| Control | Description |
|---|---|
| **Tile Size (px)** | Fine-grain stepper (`-1`, `-0.1`, `+0.1`, `+1`) and slider to match the underlying artwork's square tiles. |
| **Offset X & Y (px)** | Nudge buttons (`-5`, `-1`, `+1`, `+5`) to shift the grid origin to the exact top-left corner of the board artwork. |
| **Add 1-Tile Border** | Checkbox that activates and protects the standard 1-tile outer perimeter corridor. |
| **Corridor Draw Tool** | Click and drag the mouse across tiles to paint, erase, or toggle corridor floor squares. |
| **Room Draw Tool** | Click and drag a box selection to instantly define a room boundary `[x, y, w, h]`, or toggle tile edges. |
| **Save Board Map** | Writes the calibrated geometry directly into the active cartridge and system board registry. |

---

## Launching the Editor

You can launch the Tabletop Blockmap Creator directly from the command line:

```bash
# Launch with default board (HeroQuest: First Light Side A)
./games/tabletop-rpg/blockmap-creator.sh

# Or launch with any specific image or cartridge
./games/tabletop-rpg/blockmap-creator.sh heroquest_board.png
./games/tabletop-rpg/blockmap-creator.sh --cartridge=heroquest-fortress-fire-king
```
