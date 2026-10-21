# 🐉 Dragon Warrior (NES) — Godot 4 Recreation

![Godot](https://img.shields.io/badge/Godot-4.5-478cbf?logo=godotengine&logoColor=white)
![Renderer](https://img.shields.io/badge/renderer-GL%20Compatibility-blue)
![Status](https://img.shields.io/badge/status-in%20construction-yellow)
![Fan project](https://img.shields.io/badge/type-non--commercial%20fan%20project-lightgrey)

A fan recreation of the original **Dragon Warrior** (Dragon Quest) for the NES, built in **Godot
4.5** (GL Compatibility renderer). Overworld, towns, dungeons, turn-based battles, shops, and NPC
dialogue are being rebuilt scene by scene, backed by game data scraped and cleaned from a public
NES strategy-guide archive.

> Based on work licensed to Nintendo. © 1986 Enix. This is a non-commercial fan project made for
> fun and for learning — not for sale, not affiliated with Square Enix/Nintendo.

## 📖 Table of contents

- [Quick start](#quick-start)
- [Development & Environment Setup](#-development--environment-setup)
- [Project layout](#project-layout)
- [Architecture at a glance](#architecture-at-a-glance)
- [Contract-based Web Service](#contract-based-web-service-game-control--telemetry)
- [Where to start](#where-to-start)
- [Learning resources](#learning-resources--new-to-godot-or-game-dev-start-here)
- [In Construction — Roadmap](#in-construction--roadmap-to-a-playable-build)
- [Meet the crew 👨‍👩‍👧‍👦](#meet-the-crew-)
- [Contributing](#contributing)

---

## Quick start

**Requirements:** Godot 4.3+ (GL Compatibility feature profile). The project resolves the engine binary automatically via `DW_GODOT_BIN`, PATH (`godot4.exe`/`godot4`), or standard install paths (`%LOCALAPPDATA%\Programs\Godot\godot.exe`, `%ProgramFiles%\Godot\godot.exe`, `~/.local/bin/godot4`, `/usr/bin/godot4`).

```bash
# Clone the repository
git clone <this-repo>
cd dragon-warrior

# Launch full game flow
./play.sh        # Linux/macOS / Git Bash
.\play.ps1       # Windows PowerShell
```

`play.sh` / `play.ps1` launches the game exactly as an exported build would: **Title Screen → press any key → Save Select → resume a save or begin a new quest.** This is the real entry point (`project.godot`'s `run/main_scene`) — no debug shortcuts, no preset hero stats.

You can also open `project.godot` directly in the Godot editor and hit Play.

### Developing / testing a specific scene

Don't play through the whole game every time you want to test one map or fight. Use the debug launcher instead — see `.agents/skills/debug-launcher/SKILL.md` for the full flag reference:

```bash
# Jump straight into any scene with a preset hero state (Linux/macOS)
./debug.sh --scene Castle1F --tile 8,8 --facing up --gold 120 --items "Herb;Torch"

# Windows PowerShell:
.\debug.ps1 -Scene Castle1F -Tile 8,8 -Facing up -Gold 120 -Items "Herb;Torch"

# Isolated battle testing — skip the overworld encounter roll entirely
./debug.sh --scene BattleTest --monster axe_knight --hero-level 15 --hero-hp 80 --hero-hp-max 80
# Windows PowerShell:
.\debug.ps1 -Scene BattleTest -Monster axe_knight -HeroLevel 15 -HeroHp 80 -HeroHpMax 80

# GUI version with clickable presets + saved milestone states
./launcher.sh   # Linux/macOS
.\launcher.ps1  # Windows PowerShell
```

After changing any imported asset (map images, sprite sheets, the overworld terrain mask):

```bash
godot --import --quit --path .
```

### Generating typed v1 data classes

The Godot model classes under `src/generated/v1/` are generated from the v1 JSON Schema bundle.
Regenerate them after changing anything under `schemas/v1/`:

```bash
./generate-schema-classes.sh
```

This requires Node.js 20 or newer and runs the pinned
[`json-schema-to-gdscript` v0.1.0 release artifact](https://github.com/nddipiazza/json-schema-to-gdscript/releases/tag/v0.1.0).

---

## 🛠️ Development & Environment Setup

> [!TIP]
> For step-by-step developer environment setup across Windows, WSL 2, and macOS/Linux, see the standalone **[DEVELOPMENT.md](DEVELOPMENT.md)** guide.

This section covers setting up your development environment, developer tooling, environment variables, and E2E testing dependencies on Windows, WSL 2, and Linux/macOS.

### 1. Developer Tooling & Dependencies

| Tool | Recommended Version | Purpose | Installation Guide |
| :--- | :--- | :--- | :--- |
| **Godot Engine** | `4.3`+ | Core game engine | Download from [godotengine.org](https://godotengine.org/download). Place `godot4.exe` / `godot4` on PATH or in standard install locations (`%LOCALAPPDATA%\Programs\Godot\godot.exe`, `%ProgramFiles%\Godot\godot.exe`, `~/.local/bin/godot4`, `/usr/bin/godot4`). |
| **Python** | `3.12`+ | E2E Cucumber runner & report generator | Install via `winget install Python.Python.3.12` (Windows) or `sudo apt install python3 python3-pip` (Linux/WSL). |
| **FFmpeg** | `6.0`+ / `9.0` | Playthrough MP4 video recording for test reports | Install via `winget install Gyan.FFmpeg` (Windows) or `sudo apt install ffmpeg` (Linux/WSL). |
| **WSL 2** | Ubuntu 22.04+ | Headless Xvfb virtual display testing & video capture | Install via `wsl --install -d Ubuntu` (Windows). |
| **Node.js** | `20`+ | Type-safe schema class generator | Install via `winget install OpenJS.NodeJS` or `nvm`. |

### 2. Quick Setup Commands

#### Windows (PowerShell / CMD)
```powershell
# 1. Install Python 3.12 & FFmpeg via Winget
winget install Python.Python.3.12 Gyan.FFmpeg --accept-source-agreements --accept-package-agreements

# 2. Install Python test suite packages
python -m pip install behave behave-html-formatter

# 3. Configure UTF-8 encoding for PowerShell sessions
$env:PYTHONUTF8="1"; $env:PYTHONIOENCODING="utf-8"

# 4. Verify Godot resolution
.\play.ps1
```

#### WSL 2 (Ubuntu)
```bash
# 1. Install system packages
sudo apt update && sudo apt install -y python3-pip python3-behave xvfb ffmpeg unzip
pip install behave-html-formatter

# 2. Download Godot 4.3 binary
mkdir -p ~/.local/bin
curl -sSL https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_linux.x86_64.zip -o /tmp/godot.zip
unzip -o /tmp/godot.zip -d ~/.local/bin/ && mv ~/.local/bin/Godot_v4.3-stable_linux.x86_64 ~/.local/bin/godot4
chmod +x ~/.local/bin/godot4

# 3. Run full E2E test suite with MP4 video recording
python3 run_cucumber_tests.py
```

### 3. Environment Variables Reference

| Variable | Description | Default / Fallback |
| :--- | :--- | :--- |
| `DW_GODOT_BIN` | Explicit path to Godot 4 executable | `godot4.exe` / `godot4` on PATH, standard install paths (`%LOCALAPPDATA%\Programs\Godot`, `%ProgramFiles%\Godot`, `~/.local/bin/godot4`, `/usr/bin/godot4`) |
| `FFMPEG_BIN` | Explicit path to FFmpeg executable | `ffmpeg.exe`, Winget install path, `/usr/bin/ffmpeg` |
| `PYTHONUTF8` | Enables UTF-8 stdout mode in Python (Windows) | Set to `1` on Windows CMD / PowerShell |
| `PYTHONIOENCODING` | Output encoding for Python scripts | Set to `utf-8` |
| `DW_SCENE` | Default scene override for `debug.sh` / `debug.ps1` | `Castle1F` |
| `DW_GOLD` | Default gold override for `debug.sh` / `debug.ps1` | `120` |

### 4. Running End-to-End (E2E) Cucumber Tests

The E2E test suite uses **Behave** (Cucumber BDD) and connects to Godot's internal HTTP Web Service API (`http://127.0.0.1:8080`):

- **Natively on Windows**:
  ```powershell
  $env:PYTHONUTF8="1"; $env:PYTHONIOENCODING="utf-8"
  python run_cucumber_tests.py tests/e2e/features/smoke_throne_room.feature
  ```
- **In WSL 2 (with MP4 Video Artifact Recording)**:
  ```powershell
  wsl -d Ubuntu -u root sh -c "cd /path/to/dragon-warrior && python3 run_cucumber_tests.py"
  ```
- **View Interactive HTML Report**:
  Open `tests/e2e/reports/index.html` in your browser.

### 5. Developer Workflows & Agent Skills

Detailed step-by-step guides for expanding game maps, adding items, configuring NPCs, and modifying schemas:

- [Debug Launcher Workflow](file://.agents/skills/debug-launcher/SKILL.md)
- [Create New Map Guide](file://.agents/skills/create-new-map/SKILL.md)
- [Create New Dungeon Floor Guide](file://.agents/skills/create-new-dungeon-floor/SKILL.md)
- [Add NPC Dialogue Guide](file://.agents/skills/add-npc-dialogue/SKILL.md)
- [Add Item / Equipment Guide](file://.agents/skills/add-item-or-equipment/SKILL.md)
- [Add Monster Encounter Guide](file://.agents/skills/add-monster-encounter/SKILL.md)
- [Game Data Pipeline](file://.agents/skills/game-data-pipeline/SKILL.md)
- [Tilemap Walkability Reference](file://.agents/skills/tilemap-walkability/SKILL.md)

---

## Project layout

```
scenes/            Godot scenes — one .tscn per map/screen (TitleScreen, SaveSelect, WorldMap,
                    Castle1F, town scenes, dungeon floors, BattleOverlay, ...)
scripts/            Matching GDScript per scene, plus shared classes:
                      GameState.gd        — autoload; all state persisted across scene changes
                      TileWalkability.gd  — autoload
                      DungeonMap.gd       — shared base class for newer dungeon floors
                      BattleOverlay.gd    — turn-based battle system
                      DebugLaunch.gd      — parses debug.sh/launcher.sh args, injects GameState
data/v1/            ★ Consolidated, clean v1 JSON game data — monsters, spells, weapons, armor,
                    shields, items, shops, levels, encounter zones/rates, combat formulas, etc.
                    See GAME_DATA_README.md and DATA_STORE_V1_SPEC.md for schema details.
<category>/         Scraped source pages per category (monsters/, spells/, arms/, items/,
                    locations/, shops/, encounters/, bosses/, treasures/, doors/, levels/, ...)
                    — reference material, not runtime data (see game-data-pipeline.md).
assets/             Sprites, tile sheets, map images, music (assets/music/mp3/, 90+ tracks),
                    title-screen.png
walkthrough/        Full text walkthrough of the original NES game, used as a design reference
docs/               tile-walkability.md, combat formula guide, tile reference image
tools/              gen_worldmap_terrain.py / gen_grid_views.py (asset generators),
                    debug-launcher/ (Electron GUI wrapping debug.sh, with save-state presets)
.agents/skills/    Task-oriented skill docs — READ THESE before implementing new content
                    (see "Where to start" below)
```

---

## Architecture at a glance

- **`GameState` (autoload)** holds everything that must survive a scene change: hero stats, gold,
  inventory, spawn tile/facing, opened chests, unlocked doors, known spells, equipped
  weapon/armor, and the rainbow-bridge flag. Every scene transition goes through it — never pass
  state directly between scenes.
- **One scene + one script per map.** Newer dungeon floors (`GarinhamB1-4`, `MountainCaveB1-2`,
  `CharlockCastleB1-6`, `SwampCave`, `ErdricksCaveB1-2`, `TantegelBasement`) extend the shared
  `DungeonMap.gd` base class and only override a handful of methods (~20-line scripts). Older
  scenes (`Castle1F.gd`, `ThroneRoom.gd`, `WorldMap.gd`) are larger, standalone scripts that predate
  that pattern.
- **Two walkability strategies** (see `.agents/skills/tilemap-walkability/SKILL.md`): hand-coded
  `MAP_GRID` const + `WALKABLE` dict for small indoor maps, vs. color-sampled terrain mask
  (`tools/gen_worldmap_terrain.py`) for the 124×124 overworld.
- **Turn-based battles** run in `BattleOverlay.gd`, instantiated on top of the current scene by
  `WorldMap._start_battle()` (random encounters) or directly by `BattleTest.gd` (debug/testing).
  Monster and spell data are loaded live from `data/v1/monsters.json` / `data/v1/spells.json`.
- **Game data has two tiers**, and it's important to know which one you're editing — see
  `.agents/skills/game-data-pipeline/SKILL.md`. In short: `data/v1/monsters.json`, `spells.json`,
  `weapons.json`, `armor.json`, `shields.json`, `items.json`, `shops.json`, `encounter_zones.json`
  etc. **are loaded at runtime**. The per-map registries (`chest_registry.json`,
  `door_registry.json`, `npc_registry.json`, `dialogue.json`) are currently
  **reference-only** — actual chest/door/NPC placement is hardcoded per scene script.

---

## 🌐 Contract-Based Web Service (Game Control & Telemetry)

An embedded HTTP REST web service (`GameControlServer.gd` autoload) runs when the game is active, allowing external scripts, web applications, and automation engines to control the game and read real-time telemetry.

- **OpenAPI 3.0 Contract:** Defined in [`docs/api_contract.json`](docs/api_contract.json) and [`docs/api_contract.yaml`](docs/api_contract.yaml).
- **Detailed Documentation:** See [`docs/web-service.md`](docs/web-service.md) for endpoint usage, state schemas, and payload examples.
- **Endpoints:**
  - `GET /health` — Service status & FPS.
  - `GET /contract` — Live OpenAPI 3.0 JSON specification.
  - `GET /api/v1/state` — Full snapshot of active scene, hero position, stats, dialog text, command window, battle info, and encounter RNG.
  - `POST /api/v1/input` — Inject keyboard keys (`z`, `x`, `b`, `up`, `down`, `left`, `right`) or action events (`move_up`, `ui_accept`, etc.).
  - `POST /api/v1/command` — Direct game actions (`load_scene`, `trigger_encounter`, `teleport`, `open_menu`, `select_command`).
- **Integration Test:** Run `python3 tools/test_web_service.py` to verify web service functionality.

---

## Where to start

.agents/skills/ has a task-oriented skill for nearly everything you'd want to build next:

| Task | Skill doc |
|---|---|
| Understand the data pipeline / what's live vs. reference-only | `game-data-pipeline.md` |
| Build a new town/overworld scene | `create-new-map.md` |
| Build a new dungeon floor | `create-new-dungeon-floor.md` |
| Tile walkability (small maps vs. overworld) | `tilemap-walkability.md` |
| Add an NPC + dialogue | `add-npc-dialogue.md` |
| Add a shop | `add-shop.md` |
| Add a treasure chest | `add-treasure-chest.md` |
| Add a locked door | `add-locked-door.md` |
| Add/balance a monster or encounter zone | `add-monster-encounter.md` |
| Add/balance a spell | `add-spell.md` |
| Add an item/weapon/armor/shield | `add-item-or-equipment.md` |
| Set/change a scene's background music | `associate-music-to-map.md` |
| Add a new character sprite | `sprite-and-character-setup.md` |
| Debug launcher flags & workflow | `debug-launcher-workflow.md` |

Read the matching skill doc *before* touching a system — most of them document a real gap in the
current implementation that you'd otherwise rediscover the hard way.

---

## Learning Resources — new to Godot or game dev? Start here

This project is **under construction, and that's the point — it's a great codebase to learn on.**
The scenes, data pipeline, and battle system are small and readable enough to trace end-to-end, and
the "In Construction" epics below are scoped as approachable first contributions. If you're new to
any part of the stack, these resources will get you unstuck fast.

### Godot & GDScript (the core engine/language this project uses)
- [Godot Docs — Step by step](https://docs.godotengine.org/en/stable/getting_started/step_by_step/index.html) — official beginner walkthrough (nodes, scenes, signals, scripting).
- [Godot Docs — GDScript reference](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/index.html) and [style guide](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html) — this repo follows the official style guide (tabs, `snake_case`, typed variables where practical).
- [Godot Docs — 2D](https://docs.godotengine.org/en/stable/tutorials/2d/index.html) and [Using TileMaps](https://docs.godotengine.org/en/stable/tutorials/2d/using_tilemaps.html) — directly relevant to `.agents/skills/tilemap-walkability/SKILL.md`.
- [Godot Docs — Autoloads (singletons)](https://docs.godotengine.org/en/stable/tutorials/scripting/singletons_autoload.html) — explains the pattern behind `GameState.gd`/`TileWalkability.gd`.
- [Godot Docs — Signals](https://docs.godotengine.org/en/stable/getting_started/step_by_step/signals.html) — used throughout for scene transitions and battle events (e.g. `battle_ended`).
- [GDQuest](https://www.gdquest.com/) — free and paid Godot tutorials, strong on 2D and good coding practices.
- [KidsCanCode Godot Recipes](https://kidscancode.org/godot_recipes/4.x/) — short, focused recipes for common 2D gameplay problems (movement, tile-based grids, state machines).

### Game architecture concepts used in this project
- [Game Programming Patterns](https://gameprogrammingpatterns.com/) (free online book by Robert Nystrom) — see the *State*, *Singleton*, and *Data Locality* chapters, which map directly onto `GameState.gd`, the DungeonMap base-class pattern, and the JSON data files.
- [Data-oriented / data-driven game design](https://gameprogrammingpatterns.com/data-locality.html) — why monster/spell/item stats live in `data/*.json` instead of being hardcoded, and the target end-state for chest/door/NPC registries (see `.agents/skills/game-data-pipeline/SKILL.md`).

### Turn-based RPG mechanics (what Epic 1 is trying to complete)
- The original NES **Dragon Warrior manual and strategy guide** are the ground truth for formulas — see `docs/formula_guide_ryan8bit.txt` and `data/combat_formulas.json` in this repo before inventing new balance numbers.
- `walkthrough/full_walkthrough.md` documents the intended story flow, dialogue, and item effects if you want to see what a system *should* do before writing the code for it.

### Supporting tech in this repo
- **Python** (`tools/gen_worldmap_terrain.py`, `tools/gen_grid_views.py`) — [The Python Tutorial](https://docs.python.org/3/tutorial/) if you're new to it. Used for offline asset/data generation, not runtime logic.
- **Electron** (`tools/debug-launcher/`) — [Electron docs](https://www.electronjs.org/docs/latest/) if you want to extend the debug launcher GUI (it's a thin wrapper that shells out to `debug.sh`).
- **JSON as a data format** — [MDN: Working with JSON](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON) if JSON schemas are new to you; `GAME_DATA_README.md` documents every field this project actually uses.
- **Git & GitHub basics** — [GitHub Docs: Get started](https://docs.github.com/en/get-started) if you're new to version control; this repo pushes straight to `main`, so small, focused commits are appreciated.

### How to get oriented fast
1. Read `.agents/skills/game-data-pipeline/SKILL.md` first — it explains what's "live" vs. reference-only, which resolves 80% of "wait, why doesn't this data show up in-game?" confusion.
2. Pick one unchecked box from an epic below that matches something you already know (Python? Epic 2 registry-wiring. GDScript state machines? Epic 1 level-up. Never touched Godot? Epic 3's missing caves are a great first `create-new-dungeon-floor.md` exercise).
3. Run `./debug.sh` to jump straight to the scene you're working on instead of playing through the whole game — see `.agents/skills/debug-launcher/SKILL.md`.
4. Open a PR (or push directly, per this repo's current workflow) with a small, testable change — one epic checkbox is a good PR size.

---

## In Construction — Roadmap to a Playable Build

> [!NOTE]
> For the comprehensive, actively-updated master task list covering all remaining milestones, systems, quests, and sprint plans, see **[`TODO.md`](TODO.md)**.

The overworld, ~20 dungeon floors, shops, and turn-based battle core all run today (`./play.sh`
boots a real Title Screen → Save Select → Throne Room flow). But several core NES systems are
either stubbed out or entirely missing. This section tracks the epics standing between "it runs"
and "it's a complete, winnable game."

### Epic 1 — Progression systems (highest priority; blocks a winnable run)
- [ ] **Level-up on victory.** `BattleOverlay._after_enemy_act()`/win path currently only adds raw
  XP to `GameState.hero_stats["exp"]` — nothing checks `data/levels.json` to bump level, HP/MP
  max, str/agl/atk/def, or grant newly-learned spells. Without this the hero can never grow
  stronger than their starting stats.
- [ ] **Spell learning.** `data/levels.json`'s `Spell Learned` column is documented but nothing
  appends to `GameState.spells` when the hero levels past that threshold (see `add-spell.md`).
- [ ] **Equip flow.** Purchasing a weapon/armor/shield in a shop adds it to `_inventory` but never
  sets `GameState.weapon`/`armor`, and there's no STATUS/ITEM menu action to equip a
  previously-purchased item. Combat math (`data/combat_formulas.json`) already expects these
  fields to be correct.
- [ ] **Consumable item effects.** Using an Herb (or any non-key item) from the ITEM menu just
  prints its `desc` — no HP restore, no Fairy Water repel effect, no Wings warp-to-Tantegel, no
  Torch dark-room lighting. See `add-item-or-equipment.md`.

### Epic 2 — World-content parity with the registries
`data/chest_registry.json`, `door_registry.json`, and `npc_registry.json` document real NES chest
counts, door locations, and NPC placement per map, but **no script reads them** — content is
hand-copied into each scene script instead (see `game-data-pipeline.md`). Options, roughly in order
of leverage:
- [ ] Wire chests into `DungeonMap.gd` (`_cmd_take`/`_cmd_search` are currently permanent stubs
  there — only `Castle1F.gd` has a working chest implementation to port from). See
  `add-treasure-chest.md`.
- [ ] Wire locked doors into `DungeonMap.gd` (`_cmd_door` is a stub there too). See
  `add-locked-door.md`.
- [ ] Decide whether to keep hardcoding NPCs/dialogue per scene or migrate to reading
  `npc_registry.json` + `dialog.json`/`dialogue.json` directly, and follow through consistently.
- [ ] Audit every existing town/dungeon scene against its registry entries for missing chests,
  doors, or NPCs (registries are the source of truth for *what should exist*, even before they're
  wired into code).

### Epic 3 — Missing maps
- [ ] **Northern Cave** (Staff of Rain) — referenced as `StaffOfRainCave` in the debug launcher's
  scene map but no `.tscn`/`.gd` exists yet.
- [ ] **Southern Cave** (Goldman / Rainbow Drop recipe) — referenced as `RainbowDropCave`, also
  not yet built.
- [ ] Verify Garinham's Grave (Silver Harp) content is fully represented across `GarinhamB1-4`.

### Epic 4 — Story-critical items & triggers
Key-item effects that gate the back half of the game aren't implemented yet:
- [ ] Fairy Flute → put Golem (Cantlin-area boss) to sleep.
- [ ] Rainbow Drop → build the bridge to Charlock Island (`GameState.bridge_built` exists but
  nothing currently sets it from using the item at the correct overworld tile).
- [ ] Erdrick's Token / Erdrick's Sword / Erdrick's Armor pickup-and-equip flow.
- [ ] Princess Gwaelin rescue + escort-back-to-castle sequence (Swamp Cave → Tantegel).
- [ ] Dragonlord's offer/refusal dialogue branch and both battle forms (transform code exists in
  `BattleOverlay._dragonlord_transform()` — confirm the surrounding story trigger is wired up).

### Epic 5 — Save/load completeness
`SaveSelect.gd` currently reads real saves from `user://saves/*.json` if present, and otherwise
falls back to the fixture files in `data/v1/save-states/` so the picker has
something to show. There is **no in-game "save my progress" action yet**:
- [ ] Add a save-game action (e.g. talking to King Lorik, per the original NES flow — see
  `data/dialog.json`'s `king_lorik_save` line) that serializes current `GameState` to
  `user://saves/<slot>.json`.
- [ ] Decide on a slot model (fixed number of slots vs. freeform names) and build the corresponding
  SaveSelect UI (overwrite confirmation, delete, etc.).
- [ ] Remove/relabel the debug-fixture fallback once real saves are the common path.

### Epic 6 — Polish & parity details
- [ ] Sound effects coverage pass (battle hits, spell casts, menu blips) against the original.
- [ ] Battle message pacing / animation timing pass against NES reference (`docs/formula_guide_ryan8bit.txt`).
- [ ] Full audit of `walkthrough/full_walkthrough.md` against implemented content to catch any
  missed dialogue, hints, or side content.
- [ ] Export presets (Windows/Linux/Web) once the above epics are functionally complete.

---

## Meet the crew 👨‍👩‍👧‍👦

This is a family project! Everyone pitches in on completing the core game before we get to the fun
custom stuff. Work is tracked as **Epics** (`epic` label) and **Tasks** (`task` label) in the
repo's [Issues tab](../../issues) — each task issue includes acceptance criteria, how to test it,
and a step-by-step guide for prompting GitHub Copilot in VS Code to build it. Pick any unassigned
task issue that matches your skill level and assign it to yourself.

| Contributor | Role |
|---|---|
| [@nddipiazza](https://github.com/nddipiazza) | Project lead — architecture, reviews, core systems |
| [@leoledipiazza](https://github.com/leoledipiazza) | Developer |
| [@vcdipiazza](https://github.com/vcdipiazza) | Developer |
| [@bellajalyndipiazza-ship-it](https://github.com/bellajalyndipiazza-ship-it) | Developer |

New family contributors welcome — pick an unassigned task issue below, or ask for a
beginner-friendly task tailored to what you already know.

---

## Contributing

There's no formal build/lint/test pipeline yet — validation is done by running scenes in the
Godot editor or via `debug.sh`/`play.sh` and checking the console for `SCRIPT ERROR`/`push_error`
output. When adding a new scene or script, re-run the project's headless import
(`godot --import --quit --path .`) and boot the affected scene once via `debug.sh` before
committing.

### Ground rules

1. **Finish the core game before customizing it.** The goal is a complete, winnable, faithful
   recreation first (see the roadmap above). Fun custom monsters/spells/items come *after* Epics
   1–6 are done, not before — this keeps everyone working toward the same finish line instead of
   diverging early.
2. **Check the open GitHub Issues before starting work** — most beginner-friendly tasks are broken
   out into an issue with a full step-by-step tutorial (setup, code pointers, exact testing steps).
   If you don't see a task that fits your skill level, ask and one will be created for you.
3. **Test before you submit.** Run the affected scene via `debug.sh` (or the Godot editor's Run
   Current Scene) and confirm no errors in the Output panel before opening a pull request.
4. **Small, focused pull requests** — one roadmap checkbox per PR is a good size. Describe what you
   changed and how you tested it in the PR description.
