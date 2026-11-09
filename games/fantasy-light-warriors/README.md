# Fantasy: Light Warriors (WIP)

**Fantasy: Light Warriors (WIP)** (`games/fantasy-light-warriors`) is a clean-room 8-bit 4-hero party JRPG built in **Godot 4.3** from a declarative **RobOS Knowledge Graph**.

> **Work-in-Progress (Act I Playable & AI-Verified):** The current release covers **Act I: Coneria to the Temple of Fiends** (Milestones `01` through `12`, culminating in defeating Garland, rescuing Princess Sara, and building the North Bridge). All maps, sprites, shop interiors, and 8-bit chiptune tracks in `assets/` are 100% procedurally generated from semantic JSON data by [`tools/generate_clean_room_assets.py`](./tools/generate_clean_room_assets.py).

## Architecture & Highlights

- **Declarative KGraph & JSON Data (`data/`)**:
  - `data/maps/*.json`: 64x64 tile matrices, walkability flags, shop triggers, doors, stairs, NPC spawns, and treasure chest indices.
  - `data/enemies.json`, `data/spells.json`, `data/classes_and_xp.json`, `data/encounters.json`, `data/chests_and_npcs.json`: Full 8-bit combat formulas, 12 hero classes, 64 spells, and 128 monster stat profiles.
  - `data/v1/milestones.json`: Ordered 12-milestone registry for Act I (`01-create-light-warriors` through `12-defeat-garland-1`).
- **Authentic 2-Step 8-Bit Shop Interiors (`scripts/FF1MapScene.gd`)**:
  - Stepping onto a shop doorway in Coneria transitions into a dedicated black-background shop sub-scene displaying the merchant behind a wooden counter, the shop header, item prices, the pointing glove cursor, the party's gold pouch, and the four Light Warriors.
- **In-Engine Autonomous AI & HTTP Control Bridge (`scripts/PlayGameBrain.gd`, `scripts/GameControlServer.gd`)**:
  - Exposes `GET /health`, `GET /api/v1/state`, `POST /api/v1/input`, and `POST /api/v1/command` on `127.0.0.1:8090` so external test harnesses and the **RobOS Game Playthrough** desktop app can drive or inspect the game in real time.
- **7 Isolated Headless Cucumber Suites (`tests/e2e/features/`)**:
  - `01_start_new_game_and_create_party.feature`
  - `02_smoke_maps_and_transitions.feature`
  - `03_npc_dialogues.feature`
  - `04_shops_and_inn.feature`
  - `05_treasure_chests.feature`
  - `06_random_encounters_and_boss.feature`
  - `07_checkpoint_kill_garland_1.feature`

## Quick Start

```bash
# 1. Regenerate 100% clean-room maps, sprites, shop counters, and chiptune MP3s
python3 games/fantasy-light-warriors/tools/generate_clean_room_assets.py

# 2. Launch Fantasy: Light Warriors interactively in Godot 4
godot4 --path games/fantasy-light-warriors

# 3. Run the 7 isolated headless Cucumber E2E test suites (under Xvfb :98)
cd games/fantasy-light-warriors && behave tests/e2e/features/

# 4. Run the 12-milestone stepped AI playthrough (records per-milestone MP4 + JSON checkpoints)
python3 games/fantasy-light-warriors/tests/e2e/play_full_game.py --stepped

# 5. Open the RobOS Game Playthrough viewer pointed at Fantasy: Light Warriors
npx electron packages/game-playthrough --no-sandbox --game-dir games/fantasy-light-warriors
```
