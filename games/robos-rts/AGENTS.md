# AGENTS.md: `robos-rts` (Starfall Command)

An open-source deterministic 64Hz Real-Time Strategy (RTS) game and engine built on **Godot 4.3**, featuring a **2.5D Angled 3D Perspective Camera**, **3 Asymmetric Factions (Humans, Monsters, Aliens)**, and an **HTTP/JSON observation / action / step bot API (`:18095`)** used identically for Cucumber E2E testing and custom AI bots.

## Core Architecture

1. **2.5D Angled 3D Perspective Renderer ([`scripts/RTSWorld3D.gd`](./scripts/RTSWorld3D.gd) & [`scripts/RTSMain.gd`](./scripts/RTSMain.gd))**:
   - Uses a `Camera3D` pitched at `-56°` (`fov = 42°`) projecting 3D elevated high-ground plateaus (`+2.2` elevation), sloped ramps, canyon cliff walls, 3D crystal crystals, aether vents, 3D unit/structure meshes, translucent Alien Aegis Shield bubbles, and ground selection tori.
   - Overlays crisp 2D screen-space HP & Shield bars, box selection, a `3x5` command card, and a tactical minimap.
2. **3 Asymmetric Factions ([`scripts/engine/RTSData.gd`](./scripts/engine/RTSData.gd))**:
   - **Humans (`humans` / Meridian Guard)**: `Pioneer` (construction & harvesting), `Rifleman` (Surge Injector + stutter-step kiting), `Breacher` (Concussive Slow + Armored bonus), `Howitzer` (Mobile Mode <-> Emplaced Mode 31-range splash), `Colony Hub`, `Provision Silo` (Raise/Lower choke gate), `Aether Tap`, `Muster Hall`, `Workshop`.
   - **Monsters (`monsters` / Gnarl Brood)**: `Forager`, `Skitterling` (ultra-fast melee swarm), `Bile Crawler` (armored acid ranged), `Blight Hurler` (corrosive plasma splash), `Brood Nest`.
   - **Aliens (`aliens` / Aurelian Concord)**: Regenerating **Aegis Shields** across all units & structures, `Mote` (autonomous summon construction), `Sunblade` (Light Blades + `Charge` speed burst), `Skirmisher` (`Phase Step` teleport micro!), `Spire Walker` (Prism Beam splash + **Cliff-Walk** over canyon walls), `Heartstone`, `Resonator`, `Waystone`.
3. **Decoupled 64Hz Simulation Core ([`scripts/engine/SimEngine.gd`](./scripts/engine/SimEngine.gd))**:
   - Runs at a deterministic 64Hz fixed step (`TICK_DT = 1.0 / 64.0`), completely decoupled from rendering FPS.
   - Implements funnel-smoothed A\* paths, RVO-style velocity steering, Allied `push priority` displacement & return-to-post, and `wind-up`/`recovery` stutter-step combat micro.
4. **Unified Bot & Testing API ([`scripts/GameControlServer.gd`](./scripts/GameControlServer.gd) & [`robos_rts_bot_sdk.py`](./robos_rts_bot_sdk.py))**:
   - The exact same `/observation`, `/action`, `/step`, `/directive`, and `/scenario` HTTP/JSON endpoints (`:18095`) and `RTSClient` / `RTSBotBase` Python SDK power both Cucumber E2E tests and custom external bots.

5. **Map Editor ([`scenes/MapEditor.tscn`](./scenes/MapEditor.tscn), [`scripts/editor/`](./scripts/editor/))**:
   - Top-down editor for `scenarios/*.jsonld`: paint cliff walls / high-ground plateaus / ramps (ramps descend west -> east), place mineral fields, vespene geysers, and unit/structure spawns (type, owner, count, spread, auto-harvest, HP/shield overrides), set player factions & starting resources, and pick `RTSCommanderAI` directive targets.
   - [`RTSMapDocument.gd`](./scripts/editor/RTSMapDocument.gd) is the UI-free model (undo/redo, hit-testing, validation, JSON-LD I/O); [`MapCanvas.gd`](./scripts/editor/MapCanvas.gd) draws and handles tools; [`MapEditor.gd`](./scripts/editor/MapEditor.gd) builds the panels.
   - **F5** playtests the map in `RTSMain`; **F10** in-game returns to the editor with undo history intact.
   - Automation: `POST /editor {"action": ...}` (`open`, `state`, `new`, `load`, `add_rect`, `add_resource`, `add_unit`, `set_field`, `set_map`, `set_player`, `set_directive`, `remove`, `undo`, `redo`, `save`, `playtest`) — `RobOSSC2Client.editor()` in the SDK.

## Running the Game & E2E Tests

```bash
# Launch interactive 2.5D Angled 3D RTS game
./play.sh

# Open the Map Editor (optionally on an existing scenario slug or path)
./map-editor.sh siege-canyon-defense

# Launch the game directly into a scenario
./play.sh -- --scenario=siege-canyon-defense

# Run headless deterministic 3-faction Cucumber E2E test suite (~5s for all 6 scenarios)
./run_cucumber_tests.py --backend
```

## View layer and tooling

- `scripts/RTSMain.gd` input, selection, commands, in-world overlays; `scripts/RTSHud.gd` screen-space HUD; `scripts/RTSWorld3D.gd` terrain, entities and effects; `scripts/RTSModels.gd` procedural models (also used by `scripts/RTSIcons.gd` to render HUD portraits). Headless runs skip all of it.
- HUD rule: show only live, useful RTS information (resources, selection, queues, costs). No decorative stat boxes or summary counters.
- Control server extras: `/ui`, `/input`, `/pause`, `/camera` focus mode, `/scenario` slug `default`. Scenarios may set `paused` and `decor`.
- `./capture_screenshots.py` regenerates `docs/assets/images/robos-rts` from the running game.
- Naming: keep all names original; do not reintroduce names or terms from commercial RTS games.
