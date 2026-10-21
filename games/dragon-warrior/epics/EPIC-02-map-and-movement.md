# EPIC-02: Declarative World Map & Grid Movement Engine

## Overview
Implement tile walkability, grid-based player movement, location/dungeon transition handlers, and encounter zone roll mechanics based on declarative map specifications.

---

## Data Specs
- `data/locations.json` — Town and castle bounds, spawn points.
- `data/dungeons.json` — Dungeon floor metadata.
- `data/stair_registry.json` — Stair connections and teleports.
- `data/tile_walkability.json` — Passable vs blocked tile flags.
- `data/encounter_zones.json` — Zone monster encounter tables and encounter rates.

---

## Parallelizable Task Cards

### TASK-02.1: Tile Walkability & Grid Movement Controller
- **Owner**: Dev / AI Agent A
- **Files**: `src/systems/MapEngine.gd`, `scripts/TileWalkability.gd`
- **Requirement**: Check grid collision before moving hero 1 tile in target direction (up, down, left, right).
- **Acceptance Criteria**:
  - Hero cannot walk into water, walls, or blocked tiles.
  - Emits `EventBus.player_moved(tile_pos, facing)`.

### TASK-02.2: Location & Stair Transition Engine
- **Owner**: Dev / AI Agent B
- **Files**: `src/systems/SceneManager.gd`, `data/stair_registry.json`
- **Requirement**: Check hero tile position against stair/door coordinates and perform location/floor transition.
- **Acceptance Criteria**:
  - Walking onto Tantegel Castle stairs loads target floor and sets hero spawn tile.
  - Emits `EventBus.map_changed(location_id, floor_id, target_tile)`.

### TASK-02.3: Random Encounter Roll Generator
- **Owner**: Dev / AI Agent C
- **Files**: `src/systems/EncounterEngine.gd`, `data/encounter_zones.json`
- **Requirement**: Roll encounter probability on each overworld/dungeon step based on zone encounter rate.
- **Acceptance Criteria**:
  - Safe zones (towns, castle main floor) have 0 encounter rate.
  - Overworld steps roll encounter and emit `EventBus.encounter_triggered(zone_id, monster_id)`.
