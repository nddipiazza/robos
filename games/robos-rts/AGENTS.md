# AGENTS.md: `robos-rts` (Starfall Command)

An open-source deterministic 64Hz Real-Time Strategy (RTS) game and engine built on **Godot 4.3**, featuring a **2.5D Angled 3D Perspective Camera**, **3 Asymmetric Factions (Humans, Monsters, Aliens)**, and an **HTTP/JSON observation / action / step bot API (`:18095`)** used identically for Cucumber E2E testing and custom AI bots.

## Core Architecture

1. **2.5D Angled 3D Perspective Renderer ([`scripts/RTSWorld3D.gd`](./scripts/RTSWorld3D.gd) & [`scripts/RTSMain.gd`](./scripts/RTSMain.gd))**:
   - Uses a `Camera3D` pitched at `-56°` (`fov = 42°`) projecting 3D elevated high-ground plateaus (`+2.2` elevation), sloped ramps, canyon cliff walls, 3D crystal crystals, aether vents, 3D unit/structure meshes, translucent Alien Aegis Shield bubbles, and ground selection tori.
   - Overlays health and shield bars, box selection, a command card that expands from 15 to 20 slots as needed, and a tactical minimap.
2. **3 Asymmetric Factions ([`scripts/engine/RTSData.gd`](./scripts/engine/RTSData.gd))**:
   - **Humans (`humans` / Meridian Guard)** use per-Hub Operations, Muster Hall attachments, liftable Halls and Workshops, and separate Airframe Hangar production for the Kestrel and Rampart.
   - **Monsters (`monsters` / Gnarl Brood)** use Nest slots, a bounded living-ground layer, Seed Clutch, Skitterling burrow, paid Carapace evolution and linked Tunnel Mouths.
   - **Aliens (`aliens` / Aurelian Concord)** use overlapping power fields, powered production and deployment, mobile detection, timed barriers, damage and recall, and the late-tech Crownspire.
   - See the [player guide](../../docs/projects/robos-rts.md) for costs, controls and complete tech paths. Keep live values in `RTSData.gd` and `SimEngine.gd`.
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

The game opens at the title screen. **Skirmish** offers Frontier Hunters, Iron Narrows and Glassline Basin, with independent faction selection or seeded Random for each seat. Each seat starts at a distinct seeded site with its own base, 12 workers, 50 crystal and no aether. `SimEngine.match_state` tracks annihilation and surrender and freezes completed matches. `RTSSkirmishAI.gd` uses paid commands for all factions. Its scouting, raid responses and counter purchases respect player-scoped visibility. Hard AI can split a paid wave between two visible objectives with viable routes. `starfall-canyon` retains the three-faction mechanics showcase.

Frontier Hunters is 256×256 with unlimited crystal/aether, waterways, land crossings and interior expansions. `terrain_tiles` are 4-unit brush overrides shared by rendering, collision, pathfinding and map persistence. Do not let resource amounts stand in for infinity: the `unlimited_resources` rule prevents depletion for both resources.

The map editor supports painting, bounded fill, sampling, numbered starts/expansions, crossings, editable deposits and unit placements, layers, atomic saves and F5/F10 playtest return. Campaign and future multiplayer metadata must survive round-trips even when the editor does not interpret it. Brush/fill primitives are vendored from Crusade RTS under MIT; retain `third_party/crusade/LICENSE` and its pinned provenance notice. Verify `tests/test_map_editor_document.gd`, `tests/test_frontier_navigation.gd` and the Cucumber authoring feature when changing map semantics.

`tests/e2e/features/engine/03_frontier_hunters.feature` and `tests/e2e/frontier_bot.py` play complete accelerated build orders through the public API. Keep this controller free of state injection, free units and forced winner flags; small explicit fixtures may isolate victory-rule regressions. Reports contain progression telemetry and final observations.

`features/realtime` creates maps through the editor, saves/reloads, enters a paused playtest, then plays paid builds to annihilation on the live frame clock. Run `python run_cucumber_tests.py --realtime-headless --speed=8` or `--realtime --record` for rendered MP4/VTT proof. Never use `/step` in these tests. Keep player commands restricted to player 1; the opponent must run independently. The test harness uses an isolated port and owns/terminates the actual Windows engine process, bypassing its console wrapper.

Keep network reads/writes nonblocking in the frame loop. Real-time catch-up yields after 8 ms; backend manual stepping stays deterministic. Requested fast-forward speed may exceed achieved playback under CPU load, so report both. Preserve static geometry batching, human MultiMesh instances, cached minimap terrain, hostile spatial grids and harvesting links. Detach old terrain before batching a replacement, even when multiple loads occur in one frame. Verify `tests/test_render_batches.gd` and `tests/test_spatial_query.gd` when changing these paths. Use asynchronous capture encoding for live recordings, measure the remaining GPU readback cost, and run `--realtime --tags=@performance`. `/performance` exposes frame/tick/HUD timings and draw counts; `tests/e2e/performance_probe.py --warmup=180 --speed=1` runs a paid-build workload before measuring normal play. Full-match proofs include frame samples and archive to `~/.robos/development/walkthroughs/`.

```bash
# Launch interactive 2.5D Angled 3D RTS game
./play.sh

# Open the Map Editor (optionally on an existing scenario slug or path)
./map-editor.sh siege-canyon-defense

# Launch the game directly into a scenario
./play.sh -- --scenario=siege-canyon-defense

# Run headless deterministic mechanics, skirmish and authoring tests
./run_cucumber_tests.py --backend
```

## View layer and tooling

- `scripts/RTSMain.gd` input, selection, commands, in-world overlays; `scripts/RTSHud.gd` screen-space HUD; `scripts/RTSWorld3D.gd` terrain, entities and effects; `scripts/RTSModels.gd` procedural models (also used by `scripts/RTSIcons.gd` to render HUD portraits). Headless runs skip all of it.
- HUD rule: show only live, useful RTS information (resources, selection, queues, costs). No decorative stat boxes or summary counters.
- Control server extras: `/ui`, `/input`, `/pause`, `/camera` focus mode, `/scenario` slug `default`. Scenarios may set `paused` and `decor`.
- `./capture_screenshots.py` regenerates `docs/assets/images/robos-rts` from the running game.
- Naming: keep all names original; do not reintroduce names or terms from commercial RTS games.
