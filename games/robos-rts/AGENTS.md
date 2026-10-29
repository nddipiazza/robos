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

The default playable mode is **Frontier Hunters**, one human versus one AI using Meridian Guard units. `scenarios/frontier-hunters.jsonld` defines the rich eight-start map. Each seat gets a distinct seeded random start, one Colony Hub, 12 Pioneers, 50 crystal and no aether. `SimEngine.match_state` tracks annihilation/surrender and freezes completed matches. `RTSSkirmishAI.gd` builds through paid commands; difficulty affects decisions, not resources. The F8 match menu selects difficulty, strategy and game speed. `starfall-canyon` retains the three-faction mechanics showcase.

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

- **First Strike campaign**: F8 or `play.ps1 -Mission` opens `campaign-first-strike`. Start paused at briefing with one Colony Hub, 12 harvesting Pioneers, 150 crystal and zero army. `RTSCampaign.gd` owns briefing/objectives/retry and results. `POST /mission` starts/restarts the same mission. The finite `guard_area` enemy stays near its stronghold; no production or economy cheats. Victory requires all enemy units and structures gone; defeat requires losing all player structures. About 40 Riflemen is a recommendation, never a supply gate. Preserve the 28-and-36-loss / 40-win straight-assault contracts in `test_campaign.gd` and the paid full build in `tests/e2e/campaign_walkthrough.py`; the latter must use only player 1 commands and pay for every unit/building. `--record` uses the live clock without `/step`, text narration, MP4/VTT and walkthrough archiving. Battle telemetry must register new units and count lifespan from spawn, retaining dead records through mission completion.

- Registry-wide outcome tests: `python run_balance_tests.py --jobs=3` runs isolated headless unit, combat ability, economy, coverage and matchup suites. Independent numeric contracts specify damage/cadence/movement/cost/time thresholds and actual natural-health duel winners. `tests/data/matchup_expectations.json` covers all combat pairs in both type/owner placements; never auto-regenerate it to bless a failure. Coverage must fail when a new unit/ability lacks a behavioral test. Probe mode is observation-only, never a passing balance suite. Preserve one fire event per volley, apply armor to each declared strike, and keep audio work separate from these test changes.

- Individual crowd routing: `RTSUnitAvoidance.gd` caches bounded local body/terrain detours, with at most one plan per owner per tick and retry cooldowns. Keep mobile bodies out of the global terrain grid. Release stale routes when the blocker moves or a new command replaces them; stop routing when a unit can fire. Preserve hold-position allies and priority yielding for idle workers. Pursuit must honor dry-map terrain as well as water. Verify `test_unit_crowd_navigation.gd`, `06_crowd_navigation.feature`, existing push/micro/navigation checks and the rendered walkthrough's allied-line proof. `allied_detours` is measured telemetry; the durable-target fixture does not alter ordinary battle health.

- Fullscreen startup uses the active display and a 1920×1080 scaled canvas. `RTSDisplay.gd` fits explicit `--windowed` and test launches to the desktop; Alt+Enter toggles modes. Bot mouse coordinates are canvas coordinates, consistent with `/ui` projection, even in scaled windows.
- **Battle Lab**: `riflemen-vs-riflemen` is the first unit-battle fixture (10 vs 10, mirrored formations). F8 opens it; Enter/Fight starts, P pauses, F9 resets. `RTSBattleLab.gd` shows live counts and frames/selects blue. `SimEngine` owns ready/playing/finished state, one-shot attack-move orders and army-elimination victory; do not substitute scripted outcomes. `POST /battle` starts/resets it. Run `--backend --tags=@unit_battle` and `python tests/e2e/battle_walkthrough.py` for backend replay and rendered live-clock/input proof.
- Rifle periods include wind-up; carry fractional cooldown remainders across shots. Surge scales the attack clock, including recovery. `test_rifle_attack.gd` verifies hitscan timing and move cancellation. `RTSRifleFX.gd` is cosmetic only: bounded preallocated batches and shared shadow-free lights, no per-shot scene/resource allocation. `test_rifle_fx.gd` checks pooling and interpolated display positions; run it rendered. Measure performance separately from GPU readback/recording and do not run heavy backend matches while the user playtests.
- Battle results: `RTSBattleStats.gd` retains starting-unit records after death, measures effective damage separately from armor/overkill, and freezes a deterministic `match.results` snapshot on completion. `RTSBattleResults.gd` opens automatically with comparison tables, DPS timeline, MVP/lowlights, full unit records and type economics. Esc closes, R reopens, F9 resets; JSON export goes to `~/.config/robos/rts/battle-results/`. Do not label hitscan shot completion as aiming accuracy, double-count overkill as effective damage, or include wall-clock timing in the replay snapshot. Verify `test_battle_stats.gd`, the battle feature and rendered walkthrough when changing telemetry/results.

- `scripts/RTSMain.gd` input, selection, commands, in-world overlays; `scripts/RTSHud.gd` screen-space HUD; `scripts/RTSWorld3D.gd` terrain, entities and effects; `scripts/RTSModels.gd` procedural models (also used by `scripts/RTSIcons.gd` to render HUD portraits). Headless runs skip all of it.
- HUD rule: show only live, useful RTS information (resources, selection, queues, costs). No decorative stat boxes or summary counters.
- Control server extras: `/ui`, `/input`, `/pause`, `/camera` focus mode, `/scenario` slug `default`. Scenarios may set `paused` and `decor`.
- `./capture_screenshots.py` regenerates `docs/assets/images/robos-rts` from the running game.
- Naming: keep all names original; do not reintroduce names or terms from commercial RTS games.
