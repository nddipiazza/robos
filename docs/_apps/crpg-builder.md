---
title: "cRPG Builder"
package: crpg-builder
category: games
icon: crpg-builder.svg
summary: "Node command-line tools that turn the cRPG knowledge graph into a Godot 4 project skeleton and bundle campaigns into player cartridges."
description: "crpg-builder reads .robos/kgraphs/crpg/package.jsonld and writes JSON data files, GDScript models, scenes and project.godot. crpg-cartridge packs a campaign from games/crpg-realm into one .cartridge.json file."
related:
  - /apps/crpg-editor/
  - /projects/crpg-realm/
  - /projects/crpg-realm/campaign-editor-tutorial.html
  - /projects/crpg-realm/reference.html
---

`packages/crpg-builder` (npm name `robos-crpg-builder`) holds two command-line scripts and the libraries behind them. `bin/crpg-builder.js` generates a Godot 4 project from the cRPG knowledge graph. `bin/crpg-cartridge.js` bundles a campaign into a player cartridge for the [Realm of Heroes]({{ '/projects/crpg-realm/' | relative_url }}) game. The package has no dependencies and no window. Only `crpg-builder` is listed under `bin` in `package.json`, so run the cartridge script with `node`.

The [cRPG Editor]({{ '/apps/crpg-editor/' | relative_url }}) uses two parts of this package: `lib/cartridge-bundler.js` for **Generate Cartridge** and **Render as Game**, and `lib/token_generator.py` to make round battle tokens from portraits.

## generate

```bash
node packages/crpg-builder/bin/crpg-builder.js generate --target-dir /tmp/crpg-test
cd packages/crpg-builder && npm run generate -- --target-dir /tmp/crpg-test
```

`build` is an alias. The input is the JSON-LD package `.robos/kgraphs/crpg/package.jsonld` (change it with `--package-path`). The command validates the graph first and stops on any error. It then writes, under the target folder:

- `data/v1/`: `game.json`, `classes.json`, `npcs.json`, `monsters.json`, `spells.json`, `items.json`, `zones.json`, `encounters.json`, `quests.json`, `dialogue.json` and `events.json`. Missing stats are filled in from the D&D 5e SRD tables in `lib/srd-data.js`, and monster sprite sizes and animations come from the Flare catalog in `lib/flare-asset-catalog.js`.
- `schemas/v1/crpg_game_v1.schema.json`. It refers to `game.schema.json`, `monsters.schema.json` and other per-type schemas, which the builder does not write.
- `src/generated/v1/`: `MonsterData.gd`, `SpellData.gd`, `ItemData.gd`, `NPCData.gd` and the `DataStoreV1.gd` loader.
- `project.godot`, `tests/test_crpg_runner.gd`, and the scenes and scripts of the first three-map slice (`CharacterSelect`, `Homestead`, `VillageSquare`, `GarrisonKeep`, `VictoryScreen`, plus `DialogueBox`, `CombatManager`, `GameState`, `PartyHUD` and a few object scripts).

The data files, schema, models, `project.godot` and the test runner are overwritten on every run. Scenes and scripts are written only if the file does not exist yet. The scenes are fixed templates: they do not change with the zones in the graph. Dialogue lines exist only for the trees `partner-confrontation`, `blacksmith-inquiry` and `malakor-showdown`; any other dialogue tree gets an empty `nodes` object.

The output is not a complete game. `project.godot` lists `GameControlServer.gd`, `AudioManager.gd` and `QAOverlay.gd` as autoloads, but the builder does not write them, and it writes no files under `assets/`.

Without `--target-dir` (or `--target`) the output goes to `games/crpg-realm`. That folder was bootstrapped by the builder and then edited by hand, so a run there overwrites those edits. See the warning in the [CRPG reference]({{ '/projects/crpg-realm/reference.html#data-v1-files' | relative_url }}).

## validate

```bash
node packages/crpg-builder/bin/crpg-builder.js validate
```

Reads the package and checks it without writing anything. Errors (exit code 1): no `robos:CRPGGame` node, a `robos:startingZone` that is not a known `robos:CRPGMapZone`, a monster without `robos:spriteAssetRef`, a game event without `dcterms:title`, `robos:eventType` or `robos:infinityInteraction`, and a quest without a title, without `robos:questStages`, or with a `robos:questType` other than `main`, `side`, `faction`, `miscellaneous`, `radiant` or `companion`. A sprite reference that is not in the Flare catalog is a warning; the generator uses the skeleton sprite instead.

## create-game

```bash
node packages/crpg-builder/bin/crpg-builder.js create-game my-game --title "My Game" --target-dir /tmp/my-game
```

Sets the title, `--ruleset` (default `dnd5e`), `--combat` (default `real-time-with-pause`) and an engine architecture URN on the `robos:CRPGGame` node, or adds that node if the package has none, then runs `generate`. It saves this change into the knowledge graph package itself, whatever the target folder. The game id is used only when a new node is created. The closing message suggests `./play.sh`, but the builder does not write a `play.sh`.

`package.json` also has an `npm run diff` script. There is no `diff` command, so it prints the usage line, as does any other unknown command:

```
Usage: crpg-builder [generate|create-game <id>|validate] [--title <name>] [--target-dir <dir>] [--package-path <path>]
```

## crpg-cartridge

```bash
node packages/crpg-builder/bin/crpg-cartridge.js list
node packages/crpg-builder/bin/crpg-cartridge.js bundle rescue-the-princess [out-path]
node packages/crpg-builder/bin/crpg-cartridge.js bundle-all
node packages/crpg-builder/bin/crpg-cartridge.js inspect rescue-the-princess
```

The bundler always works on `games/crpg-realm`. It reads `campaigns/<slug>.jsonld` and pulls in the maps, characters, quests and story flow the campaign references. It also includes every file in `items/`, `enemies/` and `spells/`, whether or not the campaign uses it. Characters, enemies and spells without a `.glb` model get one picked from their slug or title (items too, when a rule matches), and maps without a background get one picked from the map slug. The result is written to `cartridges/<slug>.cartridge.json` unless you give an output path. `list` with no other argument is the default. The [campaign editor tutorial]({{ '/projects/crpg-realm/campaign-editor-tutorial.html#build-a-cartridge' | relative_url }}) walks through building and playing one.

## Asset scripts

These scripts write into `games/crpg-realm/assets`. None of them writes a license or attribution file next to the art.

- `scripts/fetch-flare-assets.js [dir]` downloads nothing. It draws solid-color placeholder PNGs (isometric tiles, sprite sheets and icons) at the paths listed in the Flare catalog.
- `scripts/fetch-flare-open-art.py` downloads backgrounds, class portraits, chest and door sprites, NPC sprites, music and sound effects from the `flareteam/flare-game` repository on GitHub (raw files from `master`), and crops or tints some of them. Files that already exist are skipped. It needs Pillow.
- `scripts/ingest-real-opensource-assets.py` replaces placeholder art with crops from Flare (enemy sprites, more portraits, item and spell icons, hero sprites, tiles) and a wolf sprite from `wolfs.7z` on OpenGameArt, which it unpacks to `/tmp/wolfs`. It needs Pillow and `py7zr`.

The script headers give the licenses as CC-BY-SA 3.0 and GPL for the Flare art, and CC-BY-SA 4.0 or CC0 for the wolf. `scripts/sync-aggregate.js` is unrelated to assets. It rebuilds `.robos/knowledge-graph.jsonld` from every `.robos/kgraphs/*/package.jsonld`.

## Other libraries

`lib/map-navigator.js` (`CRPGMapNavigator`) resolves a campaign's starting map, its map connections, locked and flag-gated passages, and story-event transports, and checks that every map can be reached. `lib/crpg-ontology.js` holds SHACL shapes for the cRPG node types. Only the tests use these two; `validate` does not. `lib/xvfb-agent-session.js` runs `games/crpg-realm/run_cucumber_tests.py` on an Xvfb display and lists the videos and telemetry it records.

## Tests

```bash
cd packages/crpg-builder
node --test tests/*.test.js
```

The tests use Node's built-in runner. They build into temporary folders inside `tests/` and delete them afterwards. They cover the builder, the bundler with the shipped campaigns, map connections and transports, and the 3D equipment and spell catalogs. `tests/xvfb-session.test.js` fails on a fresh checkout, because it expects recorded videos and telemetry under `games/crpg-realm/tests/e2e/reports`, which are not in the repository.
