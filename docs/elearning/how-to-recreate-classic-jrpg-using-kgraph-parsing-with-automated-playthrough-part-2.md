# How to Rebuild a Classic Video Game, Part 2: Final Fantasy (NES 1990) from Coneria to Defeating Garland

Take the training wheels off from Part 1 and follow our real 82-file build of the 1990 North American NES release of Final Fantasy from start to finish: harvesting VGMaps and StrategyWiki tables into a private folder, quarantining GBA/PS1 remake files, closing the 5 gameplay blockers from the 6502 disassembly (including the 1990 critical-hit and indoor ceiling palette quirks), generating 50 clean-room NES-quantized assets, building the 4-hero Godot 4.3 engine with authentic 2-step Coneria shop interiors, passing 7 isolated headless Cucumber suites, and running the 12-milestone stepped AI playthrough in the RobOS Game Playthrough viewer.

- **Part 1 Prerequisite**: [How to Rebuild a Classic Video Game (Part 1)](/elearning/how-to-recreate-classic-jrpg-using-kgraph-parsing-with-automated-playthrough/)
- **Interactive Course URL**: [https://rowbose.com/elearning/how-to-recreate-classic-jrpg-using-kgraph-parsing-with-automated-playthrough-part-2/](https://rowbose.com/elearning/how-to-recreate-classic-jrpg-using-kgraph-parsing-with-automated-playthrough-part-2/)

---

## Module 1: From a Practice Demo to an 82-File Classic (~/Downloads/ff1)

What changes when you scale up from the 12-file Ember Quest demo in Part 1 to the 1990 North American NES release of Final Fantasy: reusable harvesting into ~/Downloads/ff1, why VGMaps town PNGs are cropped reference sheets rather than 64x64 tile grids, and how jrpg-parser.js scan quarantines GBA and PlayStation remake files before they pollute the 8-bit ruleset.

### Lab: Discover VGMaps and StrategyWiki targets into sources-manifest.json
- **Who**: Your AI agent runs a program
- **Description**: Run the reusable asset harvester in dry-run discovery mode against your saved VGMaps index and StrategyWiki slug to generate ~/Downloads/ff1/sources-manifest.json.
- **Agent Prompt**: `Run packages/robos-jrpg-parser/tools/harvest_jrpg_assets.py on ~/Downloads/ff1 with --vgmaps-index ~/Downloads/ff1/vgmaps-index.html, --map-prefix "FinalFantasy-", and --wiki-slug "Final_Fantasy" to generate sources-manifest.json, then summarize how many map PNGs and wiki pages were queued.`
```bash
python3 packages/robos-jrpg-parser/tools/harvest_jrpg_assets.py \
  --out-dir ~/Downloads/ff1 \
  --vgmaps-index ~/Downloads/ff1/vgmaps-index.html \
  --map-prefix "FinalFantasy-" \
  --wiki-slug "Final_Fantasy" --dry-run
```
- **Expected**: The script matches 27 FinalFantasy-*.png atlas links and 14 StrategyWiki guide pages, writing 41 targets into ~/Downloads/ff1/sources-manifest.json.
![Discover VGMaps and StrategyWiki targets into sources-manifest.json](/assets/elearning/jrpg-kgraph/part2/m1-s1-manifest-discovery.png)

### Lab: Inspect download-receipt.json to compare 4096x4096 Overworld vs cropped town PNGs
- **Who**: Your AI agent runs a program
- **Description**: Check the PNG IHDR dimensions recorded in ~/Downloads/ff1/download-receipt.json to see why the Overworld is an exact 256x256 tile grid while town sheets are cropped.
- **Agent Prompt**: `Inspect the first 7 entries of ~/Downloads/ff1/download-receipt.json and compare the pixel dimensions of FinalFantasy-World(Unmarked).png against FinalFantasy-Coneria.png and FinalFantasy-TempleOfFiends(Present).png.`
```bash
jq '.files[:7]' ~/Downloads/ff1/download-receipt.json
```
- **Expected**: FinalFantasy-World(Unmarked).png reports 4096x4096 (256x256 tiles of 16x16 px), whereas FinalFantasy-Coneria.png (987x544) and TempleOfFiends (805x594) are cropped visual reference sheets.
![Inspect download-receipt.json to compare 4096x4096 Overworld vs cropped town PNGs](/assets/elearning/jrpg-kgraph/part2/m1-s2-harvest-receipt.png)

### Lab: Run jrpg-parser.js scan to quarantine GBA, PS1, and modded files
- **Who**: Your AI agent runs a program
- **Description**: Classify every file in ~/Downloads/ff1 for the "NES (USA)" edition and verify that GBA Dawn of Souls, PS1 Origins, and modded forum threads are flagged usable: false.
- **Agent Prompt**: `Run node packages/robos-jrpg-parser/bin/jrpg-parser.js scan ~/Downloads/ff1 --edition "NES (USA)" and list the files that were marked usable: false.`
```bash
node packages/robos-jrpg-parser/bin/jrpg-parser.js scan ~/Downloads/ff1 --edition "NES (USA)"
```
- **Expected**: 61 NES (USA) files are marked usable: true, 12 saved-page _files folders are skipped, and 9 GBA/PS1/modded files (including shop.html) are quarantined as usable: false.
![Run jrpg-parser.js scan to quarantine GBA, PS1, and modded files](/assets/elearning/jrpg-kgraph/part2/m1-s3-scan-edition-quarantine.png)

## Module 2: Parsing the Guides, Quote Gates, and the 5 Gameplay Blockers

Running jrpg-parser.js parse and coverage on ~/Downloads/ff1: how deterministic table parsing and the verbatim quote gate prevent AI hallucinations, how cross-source conflicts are surfaced in parsed.json, and why fan guides alone left 5 concrete gameplay blockers.

### Lab: Run jrpg-parser.js parse and inspect the verbatim quote-gate drops
- **Who**: Your AI agent runs a program
- **Description**: Run the parser on ~/Downloads/ff1 into ~/kgraphs/final-fantasy-nes and verify that deterministic tables and quote-verified prose extraction work together.
- **Agent Prompt**: `Run node packages/robos-jrpg-parser/bin/jrpg-parser.js parse ~/Downloads/ff1 --out ~/kgraphs/final-fantasy-nes --title "Final Fantasy" --edition "NES (USA)" and tell me how many unverified agent quotes were dropped by the quote gate.`
```bash
node packages/robos-jrpg-parser/bin/jrpg-parser.js parse ~/Downloads/ff1 \
  --out ~/kgraphs/final-fantasy-nes \
  --title "Final Fantasy" --edition "NES (USA)"
```
- **Expected**: charts.js extracts 40 weapons, 40 armors, 64 spells, and 42 shops deterministically, while extract.js drops 4 unverified prose records whose quotes were not verbatim in the local files.
![Run jrpg-parser.js parse and inspect the verbatim quote-gate drops](/assets/elearning/jrpg-kgraph/part2/m2-s1-quote-gate-audit.png)

### Lab: Inspect cross-source conflicts and alias mismatches in parsed.json
- **Who**: Your AI agent runs a program
- **Description**: Query ~/kgraphs/final-fantasy-nes/parsed.json to see where the walkthrough prose and HTML tables disagreed on item names or prices.
- **Agent Prompt**: `Show me the conflicts array in ~/kgraphs/final-fantasy-nes/parsed.json and explain how the Mythril Sword vs Silver Sword naming conflict in Elfland was resolved.`
```bash
jq '.conflicts' ~/kgraphs/final-fantasy-nes/parsed.json
```
- **Expected**: The output lists the cross-source conflicts, including the GBA Mythril Sword prose alias normalized to the 1990 NES Silver Sword.
![Inspect cross-source conflicts and alias mismatches in parsed.json](/assets/elearning/jrpg-kgraph/part2/m2-s2-parsed-conflicts.png)

### Lab: Run jrpg-parser.js coverage to identify the 5 engine blockers
- **Who**: Your AI agent runs a program
- **Description**: Generate the completeness audit report for ~/kgraphs/final-fantasy-nes to see which five data categories are still missing after scraping web guides.
- **Agent Prompt**: `Run node packages/robos-jrpg-parser/bin/jrpg-parser.js coverage --out ~/kgraphs/final-fantasy-nes and summarize the five areas that still block battles, magic, leveling, and walking.`
```bash
node packages/robos-jrpg-parser/bin/jrpg-parser.js coverage --out ~/kgraphs/final-fantasy-nes
```
- **Expected**: Weapons and Shops are ready, but Enemy combat stats, Encounter zones, Class 50-level curves, Spell numeric power/accuracy, and 64x64 Map walkability grids are flagged as engine blockers.
![Run jrpg-parser.js coverage to identify the 5 engine blockers](/assets/elearning/jrpg-kgraph/part2/m2-s3-five-blockers-matrix.png)

## Module 3: Closing the Gaps from the 6502 Disassembly (Including the 1990 NES Bugs)

How we used Disch's commented 6502 NES disassembly and AstralEsper's mechanics guide to extract the missing binary tables (build_ff1_resources.py), preserve the three famous 1990 NES combat quirks, and reach 1,206 validated Knowledge Graph nodes.

### Lab: Extract the binary combat, spell, class, and chest tables into nes_data/
- **Who**: Your AI agent runs a program
- **Description**: Run build_ff1_resources.py and update_reference_guide.py in ~/Downloads/ff1 to decode the 128 enemies, 64 spells, 12 classes, 84 encounter zones, and 256 chests into JSON and Markdown tables.
- **Agent Prompt**: `Run python3 ~/Downloads/ff1/build_ff1_resources.py and python3 ~/Downloads/ff1/update_reference_guide.py, then list the JSON files generated in ~/Downloads/ff1/nes_data/.`
```bash
python3 ~/Downloads/ff1/build_ff1_resources.py && python3 ~/Downloads/ff1/update_reference_guide.py
```
- **Expected**: The scripts write enemies.json (128), spells.json (64), classes_and_xp.json (12 classes x 50 levels), encounters.json (84), treasures.json (256), and 61 map_grids/*.json files.
![Extract the binary combat, spell, class, and chest tables into nes_data/](/assets/elearning/jrpg-kgraph/part2/m3-s1-build-resources-run.png)

### Lab: Inspect IMP, GARLAND, CURE, and FIRE in nes_data/enemies.json and spells.json
- **Who**: Your AI agent runs a program
- **Description**: Verify the exact combat numbers for the opening overworld enemy (IMP), the Chapter 1 boss (GARLAND), and the Level 1 Coneria spells (CURE, RUSE, FIRE).
- **Agent Prompt**: `Query ~/Downloads/ff1/nes_data/enemies.json for IMP (id 0) and GARLAND (id 105), and ~/Downloads/ff1/nes_data/spells.json for CURE, RUSE, and FIRE.`
```bash
jq '.enemies[] | select(.id==0 or .id==105)' ~/Downloads/ff1/nes_data/enemies.json
jq '.spells[] | select(.name=="CURE" or .name=="FIRE" or .name=="RUSE")' ~/Downloads/ff1/nes_data/spells.json
```
- **Expected**: IMP shows HP 8, ATK 4, DEF 4; GARLAND shows HP 106, ATK 15, DEF 10, XP 130, Gold 250; CURE shows effectivity 16 and FIRE shows effectivity 10.
![Inspect IMP, GARLAND, CURE, and FIRE in nes_data/enemies.json and spells.json](/assets/elearning/jrpg-kgraph/part2/m3-s2-enemies-and-quirks.png)

### Lab: Re-run jrpg-parser.js parse to build the 1,206-node Knowledge Graph
- **Who**: Your AI agent runs a program
- **Description**: Run the parser again now that ff1_nes_agent_reference_guide.md includes the complete monster, spell, class, encounter, and chest tables.
- **Agent Prompt**: `Re-run node packages/robos-jrpg-parser/bin/jrpg-parser.js parse ~/Downloads/ff1 --out ~/kgraphs/final-fantasy-nes --title "Final Fantasy" --edition "NES (USA)" and report the total node count and blocker count.`
```bash
node packages/robos-jrpg-parser/bin/jrpg-parser.js parse ~/Downloads/ff1 \
  --out ~/kgraphs/final-fantasy-nes --title "Final Fantasy" --edition "NES (USA)"
```
- **Expected**: The parser writes 1,206 validated OSLC JSON-LD nodes (including 249 placed chests, 128 enemies, 84 encounter zones, 64 spells, 80 equipment items, and 42 shops) with 0 blockers.
![Re-run jrpg-parser.js parse to build the 1,206-node Knowledge Graph](/assets/elearning/jrpg-kgraph/part2/m3-s3-kgraph-1206-nodes.png)

## Module 4: 64x64 Tile Grids, Entrance Teleports, and the NES Indoor Ceiling Palette Trick

Decompressing the 64x64 RLE map matrices into map_grids/, tracing Coneria's 1-tile-wide south entrance street at (16, 21) so the party never spawns inside a tree, and decoding the Outside-Room vs Inside-Room Palette 0 swap that hides closed rooms behind white ceilings.

### Lab: Inspect map_00_coneria.json around (16, 21) and verify the 4 shop door coordinates
- **Who**: Your AI agent runs a program
- **Description**: Check the decompressed 64x64 tile matrix of Coneria at row y=21 columns 14..18 and list the exact (x,y) coordinates of the Weapon, Armor, White Magic, and Black Magic shop doors.
- **Agent Prompt**: `Inspect row 21 columns 14..18 of ~/Downloads/ff1/map_grids/map_00_coneria.json and list the (x,y) coordinates and shop_id values for the Weapon, Armor, White Magic, and Black Magic shops in Coneria.`
```bash
jq '{map: .name, size: [.width,.height], entrance_row_21: .grid[21][14:19]}' ~/Downloads/ff1/map_grids/map_00_coneria.json
```
- **Expected**: Row 21 slice [14..18] returns [14, 14, 16, 14, 14], confirming walkable brick tile 16 at x=16, and the shop doors sit at (11,10) Weapon, (6,10) Armor, (7,4) White Magic, and (3,4) Black Magic.
![Inspect map_00_coneria.json around (16, 21) and verify the 4 shop door coordinates](/assets/elearning/jrpg-kgraph/part2/m4-s1-coneria-south-gate-grid.png)

### Lab: Compare Outside-Room Palette 0 (+0x00) vs Inside-Room Palette 0 (+0x20)
- **Who**: Your AI agent runs a program
- **Description**: Inspect the 48-byte map palette table for the Temple of Fiends to see why Outside-Room Palette 0 draws solid white ceilings while Inside-Room Palette 0 draws silver-and-brown chests.
- **Agent Prompt**: `Show me Outside-Room Palette 0 (+0x00) and Inside-Room Palette 0 (+0x20) in ~/Downloads/ff1/map_grids/map_10_temple_of_fiends.json and explain why treasure chests looked like white/teal squares before the palette swap.`
```bash
jq '.palettes' ~/Downloads/ff1/map_grids/map_10_temple_of_fiends.json
```
- **Expected**: Outside-Room Palette 0 is [0x0F, 0x30, 0x30, 0x30] (white roof ceiling), whereas Inside-Room Palette 0 at +0x20 is [0x0F, 0x10, 0x17, 0x0F] (black, silver, and wood brown).
![Compare Outside-Room Palette 0 (+0x00) vs Inside-Room Palette 0 (+0x20)](/assets/elearning/jrpg-kgraph/part2/m4-s2-indoor-palette-swap.png)

### Lab: Locate the unlocked Temple of Fiends chests and Garland boss tile in map_10_temple_of_fiends.json
- **Who**: Your AI agent runs a program
- **Description**: Query the special tiles in map_10_temple_of_fiends.json to find the three unlocked Act I treasure chests and Garland's boss trigger tile.
- **Agent Prompt**: `Query ~/Downloads/ff1/map_grids/map_10_temple_of_fiends.json for all unlocked treasure chests and the boss trigger tile in the Temple of Fiends.`
```bash
jq '.special_tiles' ~/Downloads/ff1/map_grids/map_10_temple_of_fiends.json
```
- **Expected**: The query returns the northwest chests at (3,3) Heal Potion and (2,3) Cabin, the southwest chest at (4,14) Leather Cap, and Garland's boss tile at (19,5).
![Locate the unlocked Temple of Fiends chests and Garland boss tile in map_10_temple_of_fiends.json](/assets/elearning/jrpg-kgraph/part2/m4-s3-temple-chests-and-garland-tile.png)

## Module 5: Clean-Room Art (jrpg-generate-art) and the 4-Hero Godot 4.3 Engine (ff1-game)

Generating 50 clean-room NES-quantized assets with jrpg-generate-art, publishing the clean graph to ~/kgraphs/final-fantasy-nes-public, and building the 4-hero Godot 4.3 project (GameState.gd, TitleScreen.gd, PartyCreate.gd, FF1MapScene.gd, and GameControlServer.gd on port 8090).

### Lab: Publish the clean-room Knowledge Graph and verify zero source leaks
- **Who**: Your AI agent runs a program
- **Description**: Run jrpg-parser.js publish to export ~/kgraphs/final-fantasy-nes-public and verify that no StrategyWiki, VGMaps, or manual filenames remain in the public folder.
- **Agent Prompt**: `Run node packages/robos-jrpg-parser/bin/jrpg-parser.js publish --out ~/kgraphs/final-fantasy-nes --to ~/kgraphs/final-fantasy-nes-public and verify with grep that no source filenames appear in the exported folder.`
```bash
node packages/robos-jrpg-parser/bin/jrpg-parser.js publish \
  --out ~/kgraphs/final-fantasy-nes --to ~/kgraphs/final-fantasy-nes-public
grep -rn "StrategyWiki\|VGMaps\|CLV-P" ~/kgraphs/final-fantasy-nes-public/ | wc -l
```
- **Expected**: The parser writes 1,184 nodes and 50 clean-room generated images to ~/kgraphs/final-fantasy-nes-public, and grep returns 0 matches for any source filename.
![Publish the clean-room Knowledge Graph and verify zero source leaks](/assets/elearning/jrpg-kgraph/part2/m5-s1-clean-room-art-sheet.png)

### Lab: Generate ~/Downloads/ff1/ff1-game and run godot4 --headless --import
- **Who**: Your AI agent runs a program
- **Description**: Run build_ff1_godot_game.py to scaffold the Godot 4.3 project and rebuild Godot's binary .ctex texture caches in headless mode.
- **Agent Prompt**: `Run python3 ~/Downloads/ff1/build_ff1_godot_game.py followed by godot4 --headless --path ~/Downloads/ff1/ff1-game --import and confirm all scenes and textures import cleanly.`
```bash
python3 ~/Downloads/ff1/build_ff1_godot_game.py
godot4 --headless --path ~/Downloads/ff1/ff1-game --import
```
- **Expected**: The generator writes all 7 scenes and GDScript files, and Godot imports every texture cache cleanly with 0 errors.
![Generate ~/Downloads/ff1/ff1-game and run godot4 --headless --import](/assets/elearning/jrpg-kgraph/part2/m5-s2-godot-build-and-import.png)

### Lab: Boot the game headlessly and inspect the 4 Light Warriors over port 8090
- **Who**: Your AI agent runs a program
- **Description**: Start the Godot game inside Xvfb, advance past TitleScreen and PartyCreate into Coneria, and query GET http://127.0.0.1:8090/api/v1/state.
- **Agent Prompt**: `Launch ~/Downloads/ff1/ff1-game under Xvfb, advance from TitleScreen through PartyCreate into Coneria, and run curl -s http://127.0.0.1:8090/api/v1/state | jq . to inspect the party.`
```bash
curl -s http://127.0.0.1:8090/api/v1/state | jq .
```
- **Expected**: The JSON response shows scene: "Coneria", tile: [16, 21], gold: 400, party_created: true, and the 4 Light Warriors (ZEST, SAIL, ROBO, MAGE).
![Boot the game headlessly and inspect the 4 Light Warriors over port 8090](/assets/elearning/jrpg-kgraph/part2/m5-s3-party-create-and-port-8090.png)

## Module 6: Building the Authentic NES Shop Interior & Avoiding Infinite AI Loops

Why our first AI playthrough got stuck in a loop at Coneria's shop doors, and how we implemented the authentic NES 2-step Shop interior (WEAPON, ARMOR, WHITE, BLACK, INN, ITEM) with the shopkeeper counter, live Gold box, and white pointing-hand glove cursor (Buy -> Exit).

### Lab: Open the Coneria Weapon Shop (shop_id: 1) and inspect the initial Buy cursor state
- **Who**: Your AI agent runs a program
- **Description**: Walk the party onto the Coneria Weapon Shop door at (11, 10) and query port 8090 to verify shop_open, shop_id, shop_step, and shop_cursor.
- **Agent Prompt**: `Move the party to (11, 10) in Coneria to open the Weapon Shop and query http://127.0.0.1:8090/api/v1/state to verify shop_open, shop_id, shop_step, and shop_cursor.`
```bash
curl -s -X POST http://127.0.0.1:8090/api/v1/command -d '{"command":"teleport","map":"Coneria","x":11,"y":10}'
curl -s http://127.0.0.1:8090/api/v1/state | jq '{shop_open, shop_id, shop_step, shop_cursor, gold}'
```
- **Expected**: The state reports shop_open: true, shop_id: 1, shop_step: 0, shop_cursor: 0 (Buy), and gold: 400.
![Open the Coneria Weapon Shop (shop_id: 1) and inspect the initial Buy cursor state](/assets/elearning/jrpg-kgraph/part2/m6-s1-weapon-shop-welcome.png)

### Lab: Press ui_accept to buy Rapier and Hammer and verify the cursor advances to Exit
- **Who**: Your AI agent runs a program
- **Description**: Send a ui_accept input over port 8090 to execute the purchase at the Coneria Weapon Shop, then inspect the updated Gold, equipped weapons, and cursor index.
- **Agent Prompt**: `Send {"action":"ui_accept"} to http://127.0.0.1:8090/api/v1/input while inside the Coneria Weapon Shop, then check gold, bought_weapon_coneria, and shop_cursor.`
```bash
curl -s -X POST http://127.0.0.1:8090/api/v1/input -d '{"action":"ui_accept"}'
curl -s http://127.0.0.1:8090/api/v1/state | jq '{gold, bought_weapon_coneria, shop_step, shop_cursor}'
```
- **Expected**: Gold updates from 400 to 380, bought_weapon_coneria is true, shop_step is 1, and shop_cursor is 1 (pointing at Exit).
![Press ui_accept to buy Rapier and Hammer and verify the cursor advances to Exit](/assets/elearning/jrpg-kgraph/part2/m6-s2-weapon-shop-bought-exit.png)

### Lab: Complete the Coneria Armor, White Magic, and Black Magic shops (Milestones 3 to 6)
- **Who**: Your AI agent runs a program
- **Description**: Visit the Armor Shop (6, 10), White Magic Shop (7, 4), and Black Magic Shop (3, 4) to equip Chain Mail and learn CURE, RUSE, FIRE, and LIT.
- **Agent Prompt**: `Walk the party through the Coneria Armor Shop (6,10), White Magic Shop (7,4), and Black Magic Shop (3,4), buying each shop's upgrades, and inspect the party's equipped armor and spells.`
```bash
curl -s http://127.0.0.1:8090/api/v1/state | jq '{gold, flags: .flags, party_gear: [.party[] | {name, weapon, armor, spells}]}'
```
- **Expected**: All four Coneria shop flags are true, Gold is 70 G, ROBO knows CURE and RUSE, and MAGE knows FIRE and LIT.
![Complete the Coneria Armor, White Magic, and Black Magic shops (Milestones 3 to 6)](/assets/elearning/jrpg-kgraph/part2/m6-s3-magic-and-armor-shops.png)

## Module 7: The 7 Isolated Headless Cucumber Suites (Test Every Mechanic First)

How packages/robos-jrpg-parser/lib/playthrough.js generates modular Gherkin suites alongside the Knowledge Graph, and how we built and passed 7 isolated headless Cucumber features (01 through 07) to prove every game mechanic before running the full playthrough.

### Lab: Run 04_shops_and_inn.feature headlessly to verify all 6 Coneria shop and inn scenarios
- **Who**: Your AI agent runs a program
- **Description**: Execute the isolated shop and inn Cucumber feature file under Xvfb and verify that all 6 scenarios and 46 steps pass in under 12 seconds.
- **Agent Prompt**: `Run DISPLAY=:98 behave tests/e2e/features/04_shops_and_inn.feature --no-capture in ~/Downloads/ff1/ff1-game and report the scenario and step results.`
```bash
cd ~/Downloads/ff1/ff1-game && DISPLAY=:98 behave tests/e2e/features/04_shops_and_inn.feature --no-capture
```
- **Expected**: All 6 scenarios (46 steps) pass in ~11.3 seconds with 0 failures, proving every shop type works and exits cleanly.
![Run 04_shops_and_inn.feature headlessly to verify all 6 Coneria shop and inn scenarios](/assets/elearning/jrpg-kgraph/part2/m7-s1-behave-shops-and-inn.png)

### Lab: Run isolated suites 01 through 06 to verify maps, NPCs, chests, and combat
- **Who**: Your AI agent runs a program
- **Description**: Run all six isolated mechanic feature files (01_start_new_game through 06_random_encounters_and_boss) to confirm every building block passes before the full playthrough.
- **Agent Prompt**: `Run behave on features 01 through 06 in ~/Downloads/ff1/ff1-game/tests/e2e/features/ and confirm that party creation, map warps, NPC dialogues, shops, chests, and combat all pass.`
```bash
cd ~/Downloads/ff1/ff1-game && DISPLAY=:98 behave \
  tests/e2e/features/01*.feature tests/e2e/features/02*.feature \
  tests/e2e/features/03*.feature tests/e2e/features/04*.feature \
  tests/e2e/features/05*.feature tests/e2e/features/06*.feature
```
- **Expected**: All 6 feature files (18 scenarios, 126 steps) pass with 0 failures.
![Run isolated suites 01 through 06 to verify maps, NPCs, chests, and combat](/assets/elearning/jrpg-kgraph/part2/m7-s2-behave-chests-and-boss.png)

### Lab: Run 07_checkpoint_kill_garland_1.feature to verify the 3-part checkpoint chain to Garland
- **Who**: Your AI agent runs a program
- **Description**: Run the checkpoint-chained Act I Cucumber feature that saves a JSON checkpoint after outfitting in Coneria (Milestone 6), after talking to the King (Milestone 8), and after defeating Garland (Milestone 12).
- **Agent Prompt**: `Run DISPLAY=:98 behave tests/e2e/features/07_checkpoint_kill_garland_1.feature --no-capture in ~/Downloads/ff1/ff1-game and report how each scenario hands off its checkpoint.`
```bash
cd ~/Downloads/ff1/ff1-game && DISPLAY=:98 behave tests/e2e/features/07_checkpoint_kill_garland_1.feature --no-capture
```
- **Expected**: All 3 checkpoint-chained scenarios (21 steps) pass in ~72.1 seconds, ending with garland_defeated: true, princess_rescued: true, and bridge_built: true.
![Run 07_checkpoint_kill_garland_1.feature to verify the 3-part checkpoint chain to Garland](/assets/elearning/jrpg-kgraph/part2/m7-s3-garland-boss-battle.png)

## Module 8: The 12-Milestone Stepped AI Playthrough, the RobOS Game Playthrough Viewer & Where We Left Off

Running the complete 12-milestone stepped playthrough (play_full_game.py --fresh --stepped), inspecting per-milestone videos and checkpoints in the RobOS Game Playthrough desktop app (packages/game-playthrough), and reviewing where we left off at the North Bridge gateway to Chapter 2.

### Lab: Run play_full_game.py --fresh --stepped to clear all 12 Act I milestones
- **Who**: Your AI agent runs a program
- **Description**: Execute the full 12-milestone stepped playthrough from a fresh start at 3x speed and verify that every milestone produces an MP4 video, a JSON checkpoint, and a PNG screenshot.
- **Agent Prompt**: `Run python3 tests/e2e/play_full_game.py --fresh --stepped --time-scale 3.0 in ~/Downloads/ff1/ff1-game and summarize the 12 milestones in tests/e2e/reports/playthrough/playthrough.json.`
```bash
cd ~/Downloads/ff1/ff1-game && python3 tests/e2e/play_full_game.py --fresh --stepped --time-scale 3.0
```
- **Expected**: All 12/12 milestones (01-create-light-warriors through 12-defeat-garland-1) complete in ~100.9s with status: "completed" and deaths: 0.
![Run play_full_game.py --fresh --stepped to clear all 12 Act I milestones](/assets/elearning/jrpg-kgraph/part2/m8-s1-stepped-playthrough-12-of-12.png)

### Lab: Replay Milestone #3 alone (--stepped --only 3) and inspect Checkpoint #12
- **Who**: Your AI agent runs a program
- **Description**: Use --stepped --only 3 to load Checkpoint #2 and replay only the Coneria Weapon Shop milestone in 8 seconds, then inspect the final save state in checkpoints/12-defeat-garland-1.json.
- **Agent Prompt**: `Run python3 tests/e2e/play_full_game.py --stepped --only 3 --time-scale 3.0 in ~/Downloads/ff1/ff1-game, then inspect tests/e2e/reports/playthrough/checkpoints/12-defeat-garland-1.json.`
```bash
cd ~/Downloads/ff1/ff1-game
python3 tests/e2e/play_full_game.py --stepped --only 3 --time-scale 3.0
jq . tests/e2e/reports/playthrough/checkpoints/12-defeat-garland-1.json
```
- **Expected**: Milestone #3 replays from Checkpoint #2 in ~8.4s, and Checkpoint #12 confirms garland_defeated: true, princess_rescued: true, and bridge_built: true.
![Replay Milestone #3 alone (--stepped --only 3) and inspect Checkpoint #12](/assets/elearning/jrpg-kgraph/part2/m8-s2-checkpoint-single-replay.png)

### Lab: Launch the RobOS Game Playthrough desktop viewer pointed at ~/Downloads/ff1/ff1-game
- **Who**: You and your AI agent
- **Description**: Open the RobOS Game Playthrough Electron app with --game-dir ~/Downloads/ff1/ff1-game to browse all 12 milestone cards, watch the per-milestone MP4 clips, and inspect the checkpoints.
- **Agent Prompt**: `Launch packages/game-playthrough with npx electron --no-sandbox packages/game-playthrough --game-dir ~/Downloads/ff1/ff1-game so I can review the 12 Final Fantasy milestone videos and checkpoints.`
```bash
npx electron --no-sandbox packages/game-playthrough --game-dir ~/Downloads/ff1/ff1-game
```
- **Expected**: The RobOS Game Playthrough window opens showing "Final Fantasy (NES 1990)", 12 / 12 completed milestones on the left, and the video player and checkpoint inspector on the right.
![Launch the RobOS Game Playthrough desktop viewer pointed at ~/Downloads/ff1/ff1-game](/assets/elearning/jrpg-kgraph/part2/m8-s3-robos-game-playthrough-viewer.png)
