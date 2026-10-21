# Dragon Warrior (Godot 4) — Copilot Instructions

A Godot 4.5 (GL Compatibility) recreation of Dragon Warrior (NES) for the SNES-era mechanics.

> 📘 **Repository Agent Guidelines**: See [AGENTS.md](file://AGENTS.md) for full project rules, architecture, GDScript conventions, and automated test runners.

## Running & debugging

- Launch any scene directly with a preset hero state via `./debug.sh`:
  ```bash
  ./debug.sh --scene Castle1F --tile 8,8 --facing up --gold 120 --items "Herb;Torch"
  ```
  Env vars (`DW_SCENE`, `DW_TILE`, `DW_GOLD`, `DW_HERO_LEVEL`, etc.) provide the same overrides.
  This always launches `res://scenes/DebugLaunch.tscn`, which reads the args and injects state into `GameState`
  before switching to the target scene — use this instead of the normal main scene when testing a specific map,
  battle, or hero state.
- `./launcher.sh` opens an Electron GUI (`tools/debug-launcher/`) with saved presets/save-states for the same
  debug launch flow (edit presets in `tools/debug-launcher/renderer/app.js`).
- Godot binary is `/snap/bin/godot4`; game must run with `--no-sandbox --disable-gpu --disable-dev-shm-usage`.
- After editing `assets/maps/dw1-over2.png` or other imported assets, re-import with:
  `godot --import --quit --path .`

## Architecture

- **Autoloads (singletons)**: `GameState` (`scripts/GameState.gd`) holds all persistent state across scene
  changes — hero stats, gold, inventory, spawn tile/facing, opened chests, unlocked doors, bridge-built flag,
  equipped weapon/armor/spells. `TileWalkability` (`scripts/TileWalkability.gd`) is the other autoload. Any
  scene transition must go through `GameState` (set `spawn_tile`/`spawn_facing`/`come_from`) rather than passing
  data directly between scenes.
- **One scene+script pair per map**: each `scenes/<Name>.tscn` pairs with `scripts/<Name>.gd`. Every map scene
  renders a background, handles tile-based hero movement, plays BGM, and transitions to other scenes on
  triggers (stairs, doors, map edges). New maps are built by copying `scripts/WorldMap.gd` (image-based
  overworld) or `scripts/Castle1F.gd` (tile-grid indoor/dungeon) as a starting template.
- **Two tilemap/walkability strategies** (see [.agents/skills/tilemap-walkability/SKILL.md](file://.agents/skills/tilemap-walkability/SKILL.md)):
  - Small maps (≤32×32, e.g. `Castle1F`, `ThroneRoom`): hand-coded `MAP_GRID` const (2D array of tile IDs) +
    a `WALKABLE` dictionary of passable tile IDs.
  - Large maps (e.g. `WorldMap`, 124×124): terrain is derived from `assets/maps/dw1-over2.png` by sampling the
    center pixel color of each 16×16 block. Regenerate the mask with `python3 tools/gen_worldmap_terrain.py`,
    which writes `assets/maps/worldmap_terrain.png` and `.json`; commit both after regenerating.
- **Game reference data** lives in `data/*.json` (monsters, spells, arms, items, locations, levels, encounters,
  treasures, doors, shops, dialog, sprite frames, name-stat tables) — see `GAME_DATA_README.md` for the full schema reference and `walkthrough/full_walkthrough.md` for story order.
- **Name → Stats system**: hero stats are modified by the numeric value of the hero's name (character→value
  table in `data/name-stats.json`; formula documented in `GAME_DATA_README.md`).
- Music tracks live in `assets/music/mp3/`; each scene sets its BGM in a `_start_music()` function called from
  `_ready()`.

## Task-specific skills

Consult `.agents/skills/<skill-name>/SKILL.md` for detailed how-to guides on common content-development tasks:
- `game-data-pipeline` (data pipeline & schemas)
- `create-new-map` / `create-new-dungeon-floor` (new map scenes)
- `tilemap-walkability` (collision & terrain masks)
- `add-npc-dialogue` / `add-shop` / `add-treasure-chest` / `add-locked-door`
- `add-monster-encounter` / `add-spell` / `add-item-or-equipment`
- `associate-music-to-map` / `sprite-and-character-setup` / `debug-launcher`

## Conventions

- GDScript: tabs for indentation, `snake_case` for functions/vars, `SCREAMING_CASE` for consts, typed
  variables/return types (`var gold: int = 0`, `func _ready() -> void:`).
- Tile size is always 16×16 px (scaled up for viewport 512×480 / VW=256, VH=240 in-scene).
- When adding a new scene, optionally register a debug preset in `tools/debug-launcher/renderer/app.js` so it's
  reachable from the debug launcher GUI.
