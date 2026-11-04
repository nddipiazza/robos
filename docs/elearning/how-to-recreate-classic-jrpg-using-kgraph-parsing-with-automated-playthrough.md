# Recreating NES Final Fantasy (1990 USA) from Web Archives, ROM Tables, and a Knowledge Graph

This guide walks through the complete engineering process we used to take the 1990 North American NES release of *Final Fantasy* from a folder of downloaded web pages, map images, and 6502 disassembly tables to a playable Godot 4 game verified by automated Cucumber (`behave`) video playthroughs. Every file path, command, failure mode, and bug fix in this document comes directly from the actual build in `/home/ndipiazza/Downloads/ff1` and `/home/ndipiazza/kgraphs/final-fantasy-nes`.

---

## 1. Collecting the Reference Folder (`/home/ndipiazza/Downloads/ff1`)

Before a parser or an AI agent can model a classic RPG, it needs local reference material. If you only scrape a single walkthrough page, you get prose descriptions of where to go, maybe a list of weapons, and almost none of the math or tile geometry required to run the game. Conversely, if you try to hardcode thirty `curl` commands for one specific game, you have to throw the script away the moment you move on to *Dragon Warrior* or *Chrono Trigger*.

To keep the acquisition step reusable, we wrote `packages/robos-jrpg-parser/tools/harvest_jrpg_assets.py`. Instead of hardcoding map filenames, it takes a VGMaps console index page (`--vgmaps-index`), a filename prefix (`--map-prefix "FinalFantasy-"`), and a StrategyWiki guide slug (`--wiki-slug "Final_Fantasy"`). It parses the `<a href="...">` links out of the index HTML, builds `/home/ndipiazza/Downloads/ff1/sources-manifest.json`, fetches each file with a standard desktop browser `User-Agent` header (because VGMaps and Zophar reject Python's default `Python-urllib/3.x` string with `HTTP 403 Forbidden`), and writes `/home/ndipiazza/Downloads/ff1/download-receipt.json` containing the SHA-256 hash and PNG `IHDR` pixel dimensions of every file.

```bash
python3 packages/robos-jrpg-parser/tools/harvest_jrpg_assets.py \
  --out-dir /home/ndipiazza/Downloads/ff1 \
  --vgmaps-index /home/ndipiazza/Downloads/ff1/vgmaps-index.html \
  --map-prefix "FinalFantasy-" \
  --wiki-slug "Final_Fantasy"
```

When you inspect `download-receipt.json` after that run, an important physical detail jumps out right away. The unmarked Overworld map (`FinalFantasy-World(Unmarked).png`) is `4096×4096` pixels—an exact `256×256` grid of `16×16` pixel tiles. The town and dungeon maps on VGMaps, however, are *not* `1024×1024` (`64×64` tiles). `FinalFantasy-Coneria.png` is `987×544`, `FinalFantasy-ConeriaCastle.png` is `1127×640`, and `FinalFantasy-TempleOfFiends(Present).png` is `805×594`, because the human mapper cropped out the repeating outer border tiles and composited multiple floors or room callouts onto a single sheet. Keep that detail in mind—it is the reason we will pair the VGMaps visual references with the 6502 ROM's RLE-compressed `64×64` map grids in Module 4.

Alongside the VGMaps PNGs and the 14 StrategyWiki sub-pages (`strategywiki/Final_Fantasy-*.html`), our `/home/ndipiazza/Downloads/ff1` folder holds the official 84-page Nintendo instruction booklet (`CLV-P-NAAAE.pdf`), the NES audio rip (`Final Fantasy (1987-12-18)(Square).nsf` and `Final_Fantasy_OST_MP3.zip`), and Disch's commented 6502 NES disassembly (`nes_disassembly/`). Because those reference files are copyrighted, `/home/ndipiazza/Downloads/ff1` stays strictly outside the public Git repository.

![Stage 1: Asset Acquisition & ROM Pipeline](/assets/elearning/jrpg-kgraph/jrpg-acquisition-and-rom-pipeline.png)

---

## 2. Running `jrpg-parser.js` and Reading the Completeness Gap Audit

With `/home/ndipiazza/Downloads/ff1` populated, we invoke `packages/robos-jrpg-parser/bin/jrpg-parser.js` (which RobOS agents run automatically through the `.agents/skills/jrpg-parse-assets/SKILL.md` skill). The parser runs in three distinct steps: `scan`, `parse`, and `coverage`.

```bash
# 1. Inspect how the parser classifies every file in ~/Downloads/ff1
node packages/robos-jrpg-parser/bin/jrpg-parser.js scan /home/ndipiazza/Downloads/ff1

# 2. Run deterministic table extraction + quote-verified AI agent extraction
node packages/robos-jrpg-parser/bin/jrpg-parser.js parse /home/ndipiazza/Downloads/ff1 \
  --out /home/ndipiazza/kgraphs/final-fantasy-nes \
  --title "Final Fantasy" \
  --edition "NES (USA)"

# 3. Print the completeness audit and provenance notes
node packages/robos-jrpg-parser/bin/jrpg-parser.js coverage \
  --out /home/ndipiazza/kgraphs/final-fantasy-nes
```

Running `scan` first is not a formality. Real-world guide folders are messy: StrategyWiki's *Final Fantasy* pages include screenshots and tables from the GBA *Dawn of Souls* and PlayStation *Origins* remakes alongside the 1990 NES original. During `scan`, `packages/robos-jrpg-parser/lib/scan.js` inspects image dimensions, filenames, and HTML `<title>` tags. In our folder, it automatically quarantined `strategywiki/Final_Fantasy_1_GBA_*.png`, `strategywiki/Final_Fantasy_1_PSX_*.png`, and a saved forum thread (`shop.html`, titled *"Killing Chaos before it was cool: Let's Play Dawn of Souls FF1: Mod of Balance!"*) so their altered GBA/modded prices could not overwrite the NES shop tables.

During `parse`, the parser splits the work between two engines so neither does a job it is bad at:

1. **Deterministic Table Extraction (`lib/charts.js`)**: Structured HTML `<table>` and Markdown tables (weapons, armor, spells, shops, enemies, classes, encounter zones) are parsed by deterministic JavaScript code. It never asks an LLM to do arithmetic or copy 128 rows of numbers, and it cross-checks every number across files, recording any disagreements in `parsed.json` under `conflicts`.
2. **Quote-Verified Agent Extraction (`lib/extract.js`)**: Unstructured walkthrough prose (story milestones, battle formulas, place descriptions) is sent through `robos-lib/ai-agent` using your active CLI in `~/.config/robos/ai-provider.json`. Because any language model trained on the public internet knows *Final Fantasy* from dozens of ports, `lib/extract.js` enforces a hard **verbatim quote gate**: every JSON object returned by the agent must include a `quote` field containing the exact sentence from the local file. If that substring is not literally present in the source file, `lib/extract.js` drops the record on the spot. In our run, the quote gate caught and dropped 4 unverified records (`1` in `Final Fantasy 1 Walkthrough and stuff....html`, `1` in `Final_Fantasy-Items.html`, and `2` in `Final_Fantasy-Locations.html`).

### Why the Initial Wiki Scrape Could Not Run a Game

When we inspected `/home/ndipiazza/kgraphs/final-fantasy-nes/coverage.json` after parsing only the web guides and StrategyWiki tables, we compared what the graph had against what a game engine actually needs to execute a turn of combat or a step on a map. That comparison exposed five concrete blockers:

| Area | What the Wiki & Manual Scrape Gave Us | What Was Still Missing | Operational Impact |
| :--- | :--- | :--- | :--- |
| **Weapons, armor, shops** | Stats and prices for 80 pieces, 50 shops | 5 cross-source price/defense conflicts + Elfland `Mythril/Silver Sword` naming mismatch | **Ready once normalized** |
| **Battle rules** | 37 formulas extracted from guide prose | Unconfirmed author attribution & 3 NES-specific engine bugs | **Usable once verified** |
| **Enemies** | 124 enemies with HP, XP, Gold, weakness | `ATK`, `ACC`, `Hits`, `CRT`, `DEF`, `EVA`, `Magic Defense`, `Morale`, AI spell scripts | **Blocks battles** |
| **Encounters** | Nothing | Which 8 enemy formations appear on each overworld sector and dungeon floor | **Blocks battles** |
| **Classes** | 12 classes with class-change links | Level 1 starting stats, 49-level stat/MP growth tables, 50-level XP table | **Blocks progression** |
| **Spells** | 64 spells with level, price, school, prose effect | Numeric `Effectivity` (Power `E`) and `Accuracy` bytes required by the damage formula | **Blocks magic** |
| **Maps & World** | 27 VGMaps PNGs, partial chest notes | Exact `64×64` walkable tile grids, doors, warps, 256 chest `(x,y)` coordinates, NPCs | **Blocks walking & story** |

![Stage 2: KGraph Parser & Completeness Audit](/assets/elearning/jrpg-kgraph/jrpg-kgraph-parser-and-gap-analysis.png)

---

## 3. Extracting the Missing NES ROM Tables (`build_ff1_resources.py`)

To close every one of those five blockers with 100% NES accuracy, we cross-referenced **AstralEsper's NES Game Mechanics Guide** (`v0.85`, GameFAQs ID `57009`) against **Disch's 6502 NES Disassembly** (`/home/ndipiazza/Downloads/ff1/nes_disassembly/`) and wrote `/home/ndipiazza/Downloads/ff1/build_ff1_resources.py`.

First, verifying the disassembly settled the three famous NES combat quirks that trips up naive implementations:

- **The Weapon Critical Hit Pointer Bug**: Although the ROM's weapon table (`0C_8000_weapondata.bin`) has a byte intended for critical hit rate, a pointer bug in `LoadOneCharacterIBStats` loads the weapon's **1-based Inventory Index ID (`1` to `40`)** as its base critical hit rate out of `201`. That is why the Wooden Nunchuck (`ID 1`) crits at `1/201` while the Masamune (`ID 40`) crits at `40/201` (`~19.9%`). Unarmed Black Belts and Masters use `Level * 2`.
- **The Level-Up HP Formula**: On every level-up, a character gains `floor(VIT / 4) + 1` HP. If the level's bitmask in `0B_9094_levelupdata.bin` has bit `0x20` set (a "Strong HP" level), they gain an additional `20 + rand(0..5)` (`20` to `25`) HP.
- **Magic Hit Chance (Base 148) & Bugged Spells**: Intelligence is never read by the NES magic routine. Instead, base magic accuracy is `148` (`0x94`). If the target resists the spell's element, base accuracy drops to `0`; if the target is weak to the element, base accuracy increases by `+40` to `188`. The hit threshold is `Base + Spell Accuracy - Target Magic Defense` rolled against `0..200` (`200` always misses), and scoring a magic "hit" on a damage spell doubles its `rand(E..2E)` damage roll. Meanwhile, four spells in the NES ROM have classic assembly bugs: `LOCK` always misses, `LOK2` accidentally *increases* the target's Evade by `+20`, and `TMPR` and `SABR` fail to boost Attack.
- **Monster Evade Doubles as Initiative**: The 20-byte monster record in `0C_8520_enemydata.bin` does not have a separate Agility byte. A monster's `Evade` (`EVA`, byte 8) serves both as its physical dodge stat and its turn-order initiative base (`EVA + rand(0..49)`).

Running `python3 /home/ndipiazza/Downloads/ff1/build_ff1_resources.py` decodes the binary banks directly into `/home/ndipiazza/Downloads/ff1/nes_data/`:

- `enemies.json`: All 128 20-byte monster structs (`HP`, `XP`, `Gold`, `ATK`, `ACC`, `Hits`, `CRT`, `DEF`, `EVA`, `M.D`, `MOR`, categories, elemental weaknesses/resistances, status ailments) linked to all 44 enemy AI spell/special scripts from `0C_9020_aidata.bin`.
- `encounters.json`: All 128 battle formations (`0B_8400_battleformations.bin`) and the 8-slot weighted encounter tables (`12/64, 12/64, 12/64, 12/64, 6/64, 6/64, 3/64, 1/64`) for all 64 Overworld `32×32` sectors, 3 water domains, and 61 standard maps (`0B_8000_battledomains.bin`).
- `classes_and_xp.json`: All 12 classes with Level 1 starting stats from `bank_00.dat` (`$B040`), per-level `Hit%` and `M.D` growth (including the Master's bugged `+1/Lv` `M.D` growth), all 49 level-up stat/MP bitmasks (`0B_9094_levelupdata.bin`), and the 50-level XP threshold table.
- `spells.json`: All 64 player magic spells and 26 enemy special attacks (`0C_81E0_magicdata.bin`) with numeric `accuracy`, `power` (`effectivity`), elements, target bitmasks, and effect codes.
- `chests_and_npcs.json` and `dialogues.json`: All 256 treasure chests (`lut_Treasure` at `$B100` in `bank_00.dat`), 232 map NPC placements (`$B400`), and 256 DTE-compressed dialogue strings (`bank_0A.dat`).

We then ran `python3 /home/ndipiazza/Downloads/ff1/update_reference_guide.py` to write those tables into `/home/ndipiazza/Downloads/ff1/ff1_nes_agent_reference_guide.md` (and normalized Elfland's `Mythril/Silver Sword` to `Silver Sword`), extended `packages/robos-jrpg-parser/lib/charts.js` and `lib/kgraph.js` to parse the new columns, and re-ran `jrpg-parser.js parse`. The resulting graph in `/home/ndipiazza/kgraphs/final-fantasy-nes/.robos/knowledge-graph.jsonld` contains **1,206 validated nodes** with zero gameplay blockers.

---

## 4. Slicing 16×16 Tile Grids, Decoding RLE Map Banks, and Fixing the Indoor Ceiling Palette

As we saw in Module 1, VGMaps town and dungeon PNGs (`FinalFantasy-Coneria.png` at `987×544`, `FinalFantasy-TempleOfFiends.png` at `805×594`) are cropped visual reference sheets rather than `1024×1024` (`64×64` tile) grids. In `build_ff1_resources.py`, we still slice every `FinalFantasy-*.png` into deduplicated `16×16` tileset strips (`map_grids/vgmaps_16x16/*_tileset.png` and `*_grid.json`), but for the actual `64×64` walkable map matrices we decompress the RLE-encoded map streams directly from `bank_04.dat..bank_07.dat` into `/home/ndipiazza/Downloads/ff1/map_grids/map_00_coneria.json` through `map_60_titan_s_tunnel.json`.

Each map JSON file in `map_grids/` pairs the `64×64` integer tile grid with its 128-entry `tileDefinitions` dictionary decoded from `bank_00.dat` (`offset 0x0800 + tilesetId * 256`). Every tile definition carries `walkable` (`not bool(p1 & 0x01)`), `teleportType` (`warp_previous_floor`, `normal_teleport`, or `exit_to_overworld`), `specialType` (`treasure_chest`, `open_door_or_shop`, `locked_door_mystic_key`, `battle_or_boss_tile`, etc.), and `argByte` (which indexes into `lut_Treasure` for chests or `norm_x`/`norm_y`/`norm_m` for teleports).

### Why Indoor Rooms and Treasure Chests Initially Rendered as Blank White Squares

When we rendered the `1024×1024` (`64×64` × `16×16` px) runtime map PNGs (`ff1-game/assets/maps/coneria.png`, `coneria_castle_1f.png`, `coneria_castle_2f.png`, `temple_of_fiends.png`) from the ROM's `2×2` TSA metatiles and CHR graphics, we hit a classic NES hardware trick in `lut_SMPalettes` (`$A000` in `bank_00.dat`, offset `0x2000 + map_id * 0x30`, 48 bytes per map):

- **Bytes `0..15` (`+0x00`, Outside-Room Background Palettes)**: For dungeons and castles, Palette 0 (`bytes[0..3]`) is `[0x0F, 0x30, 0x30, 0x30]`, where all three non-zero colors are `0x30` (solid white)! Why? Because on the NES, indoor rooms and treasure chests are assigned `tsa_attr == 0` (Palette 0). While the player is walking in an exterior corridor, the NES PPU loads the Outside-Room palette so the interior of closed rooms is hidden behind a solid white roof ceiling.
- **Bytes `32..47` (`+0x20`, Inside-Room Background Palettes)**: The moment the player steps through a doorway onto an indoor tile, the NES swaps in the Inside-Room palette at offset `+0x20`, where Palette 0 (`bytes[32..35]`) is `[0x0F, 0x10, 0x17, 0x0F]`—black (`0x0F`), silver/iron (`0x10`), and rich wood brown (`0x17`). Those three colors are what draw the `16×16` NES treasure chest (CHR tiles `ul=0x2A, ur=0x2B, dl=0x3A, dr=0x3B`).

Replacing `map_pal[0:4]` with `in_room_pal[0:4]` (`[0x0F, 0x10, 0x17, 0x0F]`) whenever `map_pal[1:4] == [0x30, 0x30, 0x30]` immediately restored the interior floors and the silver-and-brown treasure chests across every town, castle, and dungeon map.

---

## 5. Clean-Room Art (`jrpg-generate-art`) & Building the Godot 4 Runtime (`ff1-game`)

To produce redistributable art alongside our local reference rips, the `.agents/skills/jrpg-generate-art/SKILL.md` skill drives `packages/robos-jrpg-parser/bin/jrpg-parser.js` (`plan`, `art`, and `publish`). Using `packages/robos-lib/ai-image.js` (which calls Gemini image generation through the signed-in Antigravity `agy` CLI) and `packages/robos-jrpg-parser/tools/nesify.py` (which quantizes generated images to the 54-color NES hardware palette and strips backgrounds), we generated 47 clean-room assets in `/home/ndipiazza/kgraphs/final-fantasy-nes/assets/generated/` (12 class battle sprites, 5 battle backdrops, 28 area maps, 1 world map, and 1 poster) and exported the clean public graph to `/home/ndipiazza/kgraphs/final-fantasy-nes-public`.

Next, `/home/ndipiazza/Downloads/ff1/build_ff1_godot_game.py` builds the playable Godot 4.3 (`gl_compatibility`) project in `/home/ndipiazza/Downloads/ff1/ff1-game`:

- **`scripts/GameState.gd`**: Loads `res://data/classes_and_xp.json`, `res://data/enemies.json`, and `res://data/spells.json` at startup, initializes the 4 Light Warriors (`ZEST` Fighter, `SAIL` Thief, `ROBO` White Mage, `MAGE` Black Mage) with exact NES Level 1 stats and `400 Gold`, and tracks quest flags (`king_intro_done`, `opened_chests`, `garland_defeated`, `princess_rescued`, `bridge_built`).
- **`scripts/TitleScreen.gd` & `scripts/PartyCreate.gd`**: Renders the classic NES blue-bordered prologue screen and the 4-slot party creation screen before transitioning into `res://scenes/Coneria.tscn`.
- **`scripts/FF1MapScene.gd`**: A single data-driven map, dialogue, chest `SEARCH`, and turn-based NES combat scene shared across `Coneria.tscn`, `ConeriaCastle1F.tscn`, `ConeriaCastle2F.tscn`, and `TempleOfFiends.tscn`.
- **`scripts/GameControlServer.gd`**: An autoloaded non-blocking TCP HTTP/JSON server listening on `127.0.0.1:8090` (`GET /api/v1/health`, `GET /api/v1/state`, `POST /api/v1/input`, `POST /api/v1/command`) so external agents and Cucumber step definitions can query exact game state and inject frame-accurate `InputEventAction` presses without fragile X11 keystroke timing or screen OCR.

Whenever map PNGs or sprites on disk are updated, we run `godot4 --headless --path /home/ndipiazza/Downloads/ff1/ff1-game --import` so Godot rebuilds its binary `.godot/imported/*.ctex` texture caches before launching the game.

---

## 6. Running the Cucumber (`behave`) Playthroughs and Fixing the Two Visual Bugs

In `/home/ndipiazza/Downloads/ff1/ff1-game/tests/e2e/features/`, three Gherkin feature files test the openingConeria-to-Garland milestone end to end:

1. `01_start_new_game.feature`: Boots `TitleScreen.tscn`, selects `NEW GAME`, confirms all 4 Light Warriors (`ZEST`, `SAIL`, `ROBO`, `MAGE`) in `PartyCreate.tscn`, enters `Coneria.tscn`, and walks up the central brick entrance street.
2. `02_town_and_king.feature`: Walks through Coneria speaking to townsfolk, enters `ConeriaCastle1F.tscn`, climbs to `ConeriaCastle2F.tscn`, and speaks to the King of Coneria (`king_intro_done = true`).
3. `03_dungeon_chest_and_boss.feature`: Enters `TempleOfFiends.tscn`, steps into the northwest treasure room to open chest `(3, 3)` (`Heal Potion`), then marches into the center chamber at `(19, 5)` to confront and defeat `GARLAND` (`garland_defeated = true`, `princess_rescued = true`, `bridge_built = true`).

Running `behave tests/e2e/features --no-capture` launches Godot inside `Xvfb :98` with `--write-movie <avi> --fixed-fps 60` and transcodes each run via `ffmpeg` into an H.264 MP4 in `tests/e2e/reports/videos/`.

### Why Passing Gherkin Assertions Was Not Enough: The Visual Frame Inspection Loop

On our first green test run, all 3 scenarios and 29 Gherkin steps passed (`0 failed`), yet inspecting the recorded MP4 videos revealed two glaring visual bugs:

1. **Bug 1 — Hero Stuck in a Tree at the End of `start_a_new_game_...mp4`**:
   In Scenario 1, the Gherkin assertion only checked `Then the current map scene should be "Coneria"`. We had set the default arrival coordinate to `Vector2i(15, 22)`. When we checked `map_00_coneria.json` around the south gate (`rows y=18..23`), we saw that Coneria's walkable brick entrance street is a single column wide at **`x=16` (`tileId=16`, matching `lut_EntrTele_X = 16`)**, flanked on both sides by unwalkable tree columns at **`x=15` and `x=17` (`tileId=14`)**! Spawning at `(15, 22)` placed the hero directly on top of the left border tree. Changing `spawn_tile` to `Vector2i(16, 21)` and adding `When the hero moves up 3 tiles` walked the hero cleanly up the brick road to `(16, 18)`.
2. **Bug 2 — Treasure Chests Rendering as Teal Boxes in `open_a_treasure_chest_...mp4`**:
   In Scenario 3, the functional step opened chest `(3, 3)` and added `Heal Potion` to `GameState.inventory`, but on screen the chests at `(2, 3)` and `(3, 3)` looked like flat teal squares. Extracting frame `0.5s` with `ffmpeg` (`ffmpeg -ss 0.5 -i ... -frames:v 1 /tmp/verify_chest.png`) exposed two compounding mistakes: first, `temple_of_fiends.png` had been rendered with Outside-Room Palette 0 (`[0x0F, 0x30, 0x30, 0x30]` solid white ceiling); second, `FF1MapScene.gd` was drawing a semi-transparent debug `ColorRect` (`_chest_markers`) over every chest tile, which alpha-blended with the white square into a solid teal box! Re-rendering the map with Inside-Room Palette 0 (`+0x20`: `[0x0F, 0x10, 0x17, 0x0F]`), removing the `_chest_markers` `ColorRect` overlay (while drawing a dark open-lid interior after a chest is opened), and re-running `godot4 --import` + `behave` restored the genuine silver-and-brown NES treasure chests.

![Stage 3: Godot 4 Runtime, Port 8090 Bridge & Cucumber Video Proof](/assets/elearning/jrpg-kgraph/jrpg-godot-cucumber-playthrough-harness.png)
