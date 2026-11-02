# Handoff: JRPG Parse Portal, FF1 KGraph, GitHub Pages KGraph viewers

Started in a cloud session that could not reach fan sites (its network policy blocked
strategywiki.org, finalfantasy.fandom.com, vgmaps.com, spriters-resource.com,
gamefaqs.gamespot.com, en.wikipedia.org, datacrystal.tcrf.net). No code was written yet.
Continue locally, where those sites are reachable.

## The request

1. **JRPG Parse Portal**: a new RobOS app that acquires everything needed to remake a classic
   JRPG from fan resources (wikis, walkthroughs, map atlases, sprite sheets, formula guides),
   using the RobOS agent (`packages/robos-lib/ai-agent.js`, `ask(prompt)`) to find fan sites
   and fill each asset type. The existing `packages/kgraph-parse-portal` has the right idea but
   is sloppy; build the JRPG portal as its own package rather than bolting onto it.
2. **Dragon Warrior I (USA) → KGraph** is the working example to reproduce through the portal.
3. **Final Fantasy I (USA)**: acquire map images, character/class sprites, enemies, menu types,
   rule engine (formulas), items/weapons/armor/spells/shops, encounters, game milestones and
   story progression, the same way DW1 was done. Publish the KGraph folder to a new **public**
   repo `nddipiazza/kgraph-final-fantasy`.
4. **KGraph Explorer feature**: build a GitHub Pages KGraph viewer site from a KGraph folder.
   Each node may have its own custom renderer, else its parent type's renderer, else a generic
   one. Point it at the FF1 KGraph folder and build the full site with the RobOS agent.

## Decisions already made by the user

- Data comes from real fan sites (crawl them), not from agent recall.
- **The AI writes scripts that access the sites; it does not read the sites itself.** Every
  fan source gets a checked-in, re-runnable fetch-and-extract script. The agent's job is to
  author and fix those scripts; the scripts do the fetching and produce the records. Anyone
  can rerun them to reproduce or refresh the KGraph without an AI in the loop.
- Art: the public repo holds **original procedural art** generated from the data (as DW1 does
  with `games/quest-warrior-dragon/tools/generate_original_assets.py`), plus attributed links to
  the fan-site pages that show the real art. Do not rehost ripped Square Enix sprites or maps.

## What exists today (read these first)

- DW1 remake data: `games/quest-warrior-dragon/data/v1/*.json` (monsters, spells, weapons,
  armor, shields, items, quest_items, locations, map_grids, npcs, dialogue, shops,
  chest/door/stair registries, encounter_zones, worldmap_zones, levels, combat_formulas,
  milestones, sprite_frames, tiles_meta) with JSON Schemas in `schemas/v1/`.
  How it was built: `docs/projects/quest-warrior-dragon.md` ("How we built it").
- DW1 → KGraph today: `games/quest-warrior-dragon/tools/generate_kgraph_package.py` writes
  `.robos/kgraphs/jrpg/package.jsonld` (monsters, spells, equipment, items, locations only;
  nodes under `robos:nodes`). Milestones, formulas, maps, NPCs, shops are not in it yet.
- Old portal: `packages/kgraph-parse-portal/` (Electron `main.js`, HTTP `server.js` on 19192,
  `lib/fs-mime-classifier.js`, Tika/Luxir bridges). Snapshot port registry:
  `packages/robos-lib/snapshot-cli.js` (`kgraph-parse-portal: 19192`, `robos-graph: 19161`).
- KGraph Explorer: `packages/robos-graph/` (`main.js` IPC handlers, `renderer/app.js`,
  `bin/kgraph-cli.js`, `lib/graph-store.js`). Existing static-site generators to borrow from:
  `lib/documentation-web-generator.js`, `lib/elearning-web-generator.js`.
- Agent: `packages/robos-lib/ai-agent.js` exports `ask(prompt, { providerId })`.
- New-app conventions: `plugins/robos/skills/create-robos-app/SKILL.md` (package layout,
  `.desktop`, `robos-icons` BUILTIN_APPS, AGENTS.md table, `node scripts/sync-app-docs.js`,
  `.robos/packages.yaml`). Tests: `packages/robos-test/tests/sdlc-graph/kgraph-parse-portal.test.js`
  is the pattern.

## Proposed design

### `packages/jrpg-parse-portal/`
- `lib/asset-taxonomy.js`: asset types with required fields and KGraph class: Game, WorldMap,
  Location, MapImage, Tileset, CharacterClass (+ class change), PartySprite, NPC, Dialogue,
  Enemy, Boss, EnemySprite, EncounterFormation/Zone, Item, Weapon, Armor, Spell, Shop,
  MenuScreen/UI type, RuleFormula (damage, hit, evade, crit, run, spell resist, level-up
  growth), LevelTable, Milestone/StoryBeat (ordered, with prerequisites and completion
  check), Vehicle/Transport (FF1: ship, canoe, airship), MusicTrack.
- `lib/source-registry.js`: per-game fan-source catalog mapping URLs → asset types it fills
  (DW1 USA and FF1 USA), plus search-query templates so the agent can find sources for any
  other game.
- `sources/<game>/<source>.js`: one scraper script per fan source (for example
  `sources/ff1-usa/strategywiki-enemies.js`, `sources/ff1-usa/vgmaps-maps.js`). Each exports
  `{ id, url(s), assetTypes, fetch(ctx), extract(raw) }`, uses the shared fetch helper, and
  returns records for its asset types. These are ordinary code, reviewed and committed like
  any other.
- `lib/fetch.js`: shared HTTP helper with an on-disk cache (`.cache/<host>/...`), polite rate
  limit, user agent, robots.txt check, and MediaWiki helpers
  (`api.php?action=parse&prop=wikitext`, a generic wikitable parser).
- `lib/script-author.js`: the agent step. Given a game, an asset type, a source URL and a
  cached sample of that page (fetched by the helper, not by the agent), it asks
  `ai-agent.ask()` to write or repair the scraper script, then runs it and checks the output
  against the asset type's required fields. Failing runs go back to the agent with the error
  and the script, never to the agent with a request to read the page and type the data.
- `lib/acquire.js`: runs the scraper scripts for a game, merges their records, and stamps
  every record with provenance (source URL, fetch date, script id and version). Missing
  required fields fail loudly.
- `lib/importers/quest-warrior-dragon.js`: DW1 local data → KGraph folder (the proof case,
  covering all asset types including milestones, formulas and maps).
- `lib/procedural-art.js`: deterministic original SVG/PNG sprites, tiles and map renders from data.
- `lib/kgraph-folder.js`: writes `<out>/package.jsonld`, `<out>/nodes/<type>/<id>.jsonld`,
  `<out>/assets/`, `<out>/renderers/` and a coverage report (`coverage.json`: per asset type,
  filled / missing / sources).
- `bin/jrpg-portal.js`: `plan <game>`, `acquire <game> --out <dir> [--types ...]`,
  `import-dw1 --out <dir>`, `coverage <dir>`.
- Electron UI: pick game, asset-type coverage grid, sources per type, run acquisition, log.
  Register a new snapshot port, icon, `.desktop`, AGENTS.md row, docs page.

### Explorer: GitHub Pages site generator (`packages/robos-graph/lib/kgraph-site-generator.js`)
- Input: a KGraph folder. Output: static SPA (`index.html`, `data/graph.json`, `assets/`,
  `renderers/`, `.nojekyll`) plus `.github/workflows/pages.yml` for deployment.
- Renderer resolution per node: `robos:renderer` on the node → renderer registered for its
  most specific `@type` → walk `rdfs:subClassOf` parents (declared in the folder's ontology,
  e.g. `jrpg:Boss ⊂ jrpg:Enemy ⊂ jrpg:Combatant`) → generic property/relationship renderer.
  Custom renderers are plain browser JS in `<kgraph>/renderers/*.js` declared in
  `renderers.json`; built-ins for Enemy, Map/Location, Milestone timeline, Shop, Formula.
- `--agent` option asks the RobOS agent to write renderer scripts (saved into
  `<kgraph>/renderers/`) for types that only have the generic one; same rule: the agent writes
  code, the generator runs it.
- Wire into `bin/kgraph-cli.js` (`kgraph site build <folder> --out <dir>`) and an Explorer
  IPC handler + button.

## Order of work

1. Taxonomy + KGraph folder writer + DW1 importer; check DW1 coverage is complete.
2. Site generator with renderer resolution; build the DW1 site and look at it in a browser.
3. Source registry for FF1; have the agent write a scraper script per source, run them,
   fill every asset type, generate original art.
4. Build the FF1 site; create public `nddipiazza/kgraph-final-fantasy`, push the KGraph folder
   and site, enable GitHub Pages.
5. Tests in `packages/robos-test/tests/`, docs, app registration.
