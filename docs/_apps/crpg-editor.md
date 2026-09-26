---
title: "RobOS cRPG Editor"
package: crpg-editor
category: "games"
icon: crpg-editor.svg
summary: "Unified cRPG game editor for campaign management, character & NPC authoring, party inventory, and tactical maps"
---

# RobOS cRPG Editor

RobOS cRPG Editor is the unified game development and authoring environment for `robos-crpg` (Realm of Heroes). It consolidates campaign orchestration, independent D&D 5e character and NPC authoring, party inventory management, and tactical 2.5D battle map level design into a cohesive, production-grade desktop application.

![RobOS cRPG Editor Architecture]({{ '/assets/images/architecture/crpg-editor-architecture.jpg' | relative_url }})

## Unified Architectural Model

In RobOS cRPG development, entities are decoupled as first-class, independent Knowledge Graph objects:

- **Battle Maps** are independent entities (`games/crpg-realm/maps/<slug>.jsonld`, `@type: ["robos:CRPGBattleMap", "schema:Place"]`).
- **Characters & NPCs** are independent entities (`games/crpg-realm/characters/<slug>.jsonld`, `@type: ["robos:CRPGCharacter", "schema:Person"]`).
- **Campaigns** compose independent maps (`robos:maps`) and characters (`robos:characters`), with an active starting map (`robos:startingMap`), quest log (`robos:questLog`), and world flags (`robos:worldFlags`).

```mermaid
graph TD
    classDef camp fill:#1e293b,stroke:#00bcd4,stroke-width:2px,color:#fff
    classDef char fill:#1e293b,stroke:#a855f7,stroke-width:2px,color:#fff
    classDef map fill:#1e293b,stroke:#10b981,stroke-width:2px,color:#fff
    classDef inv fill:#1e293b,stroke:#f59e0b,stroke-width:2px,color:#fff

    subgraph CampaignStudio["📜 Campaign Studio"]
        Camp["CRPGCampaign<br/><b>dragonwarrior-1-usa</b>"]:::camp
        QuestLog["Quest Journal<br/>- Defeat Dragonlord<br/>- Rescue Gwaelin"]:::camp
        WorldFlags["World State Flags<br/>- ball_of_light_stolen<br/>- princess_rescued"]:::camp
    end

    subgraph CharactersStudio["👤 Characters & NPCs Studio"]
        Hero1["CRPGHero<br/><b>hero-of-alefgard</b><br/>Lvl 1 Fighter (15 HP)"]:::char
        NPC1["CRPGNPC<br/><b>npc-king-loric</b><br/>Role: king (save)"]:::char
        NPC2["CRPGNPC<br/><b>npc-princess-gwaelin</b><br/>Role: princess (talk)"]:::char
    end

    subgraph MapsStudio["🗺️ Tactical Maps Studio"]
        Map1["CRPGBattleMap<br/><b>tantegel-throne-room</b><br/>60x40 ft (Stone)"]:::map
        Blockout["Python Engine<br/><b>assets/blockouts/tantegel-throne-room.png</b><br/>5-ft Collision Matrix"]:::map
    end

    subgraph InventoryStudio["🎒 Inventory & Equipment"]
        Party["Active Party<br/><b>Hero of Alefgard</b>"]:::inv
        Purse["Shared Purse<br/><b>120 GP</b> (King's Chests)"]:::inv
        Gear["Equipped Slots<br/>Bamboo Pole, Small Shield, Clothes"]:::inv
    end

    Camp -->|robos:maps| Map1
    Camp -->|robos:startingMap| Map1
    Camp -->|robos:characters| Hero1
    Camp -->|robos:characters| NPC1
    Camp -->|robos:characters| NPC2
    Camp -->|robos:gameState| QuestLog
    Camp -->|robos:gameState| WorldFlags

    Map1 -->|robos_crpg_blockout| Blockout
    NPC1 -.->|placed in| Map1
    NPC2 -.->|placed in| Map1

    Camp -->|robos:heroes| Party
    Party --> Gear
    Camp --> Purse
```

## Core Modules

### 1. 📜 Campaign Management
- **Campaign Metadata**: Title, slug, setting, ruleset (D&D 5e SRD, Advanced 5e, RobOS Tactical), and difficulty mode.
- **Compositional Maps & Characters**: Checklists for selecting independent maps and characters that belong to this campaign, with automatic count badges.
- **Starting Map Selection**: Designates the primary spawn location (e.g. `tantegel-throne-room`).
- **Quest Journal & World Story Flags**: Narrative tracking with live status updates (active, completed, failed) and dynamic state flags.

### 2. 👤 Characters & NPCs Studio
- **Dual Entity Classification**: Supports full player heroes and non-player characters (NPCs) with seamless one-click switching.
- **Roster Filtering**: Instant pill filters (`All`, `Heroes`, `NPCs`) with role badges (`Hero`, `King`, `Princess`, `Guard`, `Merchant`, `Sage`).
- **NPC Scripting & Placement**: Configure NPC role, interaction type (`talk`, `save`, `shop`, `inn`, `rest`), assigned map placement, grid coordinate position (`col`, `row`), facing orientation, and multi-page dialogue scripts.
- **D&D 5e Hero Attributes**: Full ability scores (STR, DEX, CON, INT, WIS, CHA) with auto-computed modifiers, AC, HP Max, current HP, speed, initiative, prepared spells, and backstory.

### 3. 🗺️ Tactical Maps Studio
- **Independent Battle Arenas**: Author maps with customizable dimensions (width/height in feet), base terrain (stone, dirt, grass, dungeon floor), and background underlay art.
- **Object Hierarchies**: Place and manipulate obstacles, throne daises, stone archway columns, treasure chests, and doors with configurable collision (`blocked`, `difficult`, `open`) and opacity (`opaque`, `transparent`, `halfCover`).
- **Automated Blockout Compilation**: One-click `⚡ Build PNG & Grid` invokes the headless `robos_crpg_blockout` Python compiler to generate 5-ft cell collision matrices and static background PNGs in `games/crpg-realm/assets/blockouts/`.

### 4. 🎒 Party Inventory & Equipment
- **Active Party Assembly**: Check heroes into the active adventuring party and set party leader and tactical marching formations (Rank, Wedge, Line, Column, Square, Scatter).
- **Party Currency Purse**: Shared gold (GP), silver (SP), and copper (CP) purse.
- **Individual Equipment Slots**: Main hand, off hand, armor, helmet, cloak, boots, ring, and quick-access belt items with live AC impact calculations.

## Example: Dragon Warrior 1 (USA) Scaffolding

Using only user inputs in the editor, the full Dragon Warrior 1 (USA) starting campaign is authored:
1. **Map**: `tantegel-throne-room` (60×40 ft stone arena with King's throne dais, pillars, and 120 G chest).
2. **Hero**: `Hero of Alefgard` (Level 1 Fighter, descendant of Erdrick, 15 HP, 12 AC, HEAL/SIZZ spells).
3. **NPCs**:
   - `King Loric` (role: `king`, interaction: `save`, Tantegel Castle 2F placement, Ball of Light dialogue).
   - `Princess Gwaelin` (role: `princess`, interaction: `talk`, swamp cave rescue dialogue).
4. **Campaign**: `dragonwarrior-1-usa` (Alefgard world setting, Tantegel starting map, Dragonlord and Gwaelin quests).
5. **Inventory**: 120 GP starting purse, Bamboo Pole, Small Shield, Clothes, and Herb/Torch/Key stash.

### Visual Walkthrough

| 🗺️ Tantegel Throne Room Map | 👤 Hero of Alefgard |
|---|---|
| ![Tantegel Throne Room Map]({{ '/assets/images/screenshots/crpg-editor-tantegel-map.png' | relative_url }}) | ![Hero of Alefgard Sheet]({{ '/assets/images/screenshots/crpg-editor-hero-alefgard.png' | relative_url }}) |
| **👑 King Loric NPC** | **📜 Dragon Warrior 1 Campaign** |
| ![King Loric NPC Profile]({{ '/assets/images/screenshots/crpg-editor-king-loric.png' | relative_url }}) | ![Dragon Warrior 1 Campaign]({{ '/assets/images/screenshots/crpg-editor-campaign-dragonwarrior.png' | relative_url }}) |
| **🎒 Equipped Gear & Purse** | **⚡ Editor Overview** |
| ![Inventory and Equipment]({{ '/assets/images/screenshots/crpg-editor-inventory-equipped.png' | relative_url }}) | ![RobOS cRPG Editor Overview]({{ '/assets/images/screenshots/crpg-editor-overview.png' | relative_url }}) |
