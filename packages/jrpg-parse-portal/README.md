# JRPG Parse Portal

Rebuild a classic JRPG from fan resources. The portal acquires everything a remake needs (world and area maps, character and enemy sprites, encounter formations, equipment, items, spells, shops, menu screens, the rule engine, story milestones and music) from wikis, map atlases, walkthroughs and fan music archives, and writes it as a kgraph folder. KGraph Explorer's Pages site builder then turns that folder into a GitHub Pages viewer.

```bash
node packages/jrpg-parse-portal/bin/jrpg-portal.js profiles
node packages/jrpg-parse-portal/bin/jrpg-portal.js plan final-fantasy-usa
node packages/jrpg-parse-portal/bin/jrpg-portal.js discover final-fantasy-usa --provider claude-code --json > discovery.json
node packages/jrpg-parse-portal/bin/jrpg-portal.js acquire final-fantasy-usa --out ~/kgraphs/kgraph-final-fantasy --suggestions discovery.json
node packages/robos-graph/bin/kgraph-cli.js site build --graph ~/kgraphs/kgraph-final-fantasy --workflow
```

Or open the app (`electron packages/jrpg-parse-portal`): pick a game, check the plan, ask the robos agent for more fan sites, acquire, and publish.

## Asset types

| Asset type | Kgraph types |
| --- | --- |
| World map, area maps | `jrpg:WorldMap`, `jrpg:AreaMap` (both `jrpg:Map`) |
| Places | `jrpg:Town`, `jrpg:Castle`, `jrpg:Dungeon`, `jrpg:Region` (all `jrpg:Place`) |
| Playable classes, NPCs | `jrpg:PlayableClass`, `jrpg:NPC` (both `jrpg:Character`) |
| Enemies, bosses, formations | `jrpg:Enemy`, `jrpg:Boss` (a `jrpg:Enemy`), `jrpg:EncounterFormation` |
| Weapons, armor, items | `jrpg:Weapon`, `jrpg:Armor` (both `jrpg:Equipment`), `jrpg:Consumable`, `jrpg:KeyItem` (all `jrpg:Item`) |
| Spells, shops, menus | `jrpg:Spell`, `jrpg:Shop`, `jrpg:MenuScreen` |
| Rule engine | `jrpg:Formula`, `jrpg:StatDefinition`, `jrpg:StatusEffect`, `jrpg:Element`, `jrpg:ProgressionTable` (all `jrpg:Rule`) |
| Story | `jrpg:StoryMilestone` in order, with `jrpg:requires` / `jrpg:grants` linking key items and `jrpg:StoryFlag`s |
| Music | `jrpg:MusicTrack`, with fan arrangements |

`lib/asset-types.js` holds the hierarchy; it is written to `.robos/ontology.jsonld` in every kgraph folder, and the Pages viewer walks it to pick renderers.

## Game profiles

**Dragon Warrior (NES, USA)** reads the Quest: Warrior Dragon data store (`games/quest-warrior-dragon/data/v1`), which was itself acquired from public strategy guides, and copies its original generated art next to the graph.

**Final Fantasy (NES, USA)** reads:

- the Final Fantasy Wiki through its MediaWiki API: enemies with NES names, NES stats and NES sprites (both fights for the Fiends), formations, the six classes and their upgrades with battle and map sprites, starting stats and stat growth, weapons, armor, items, key items, spells, shops, statuses, elements, stat and magic formulas, menus, places and the soundtrack
- the Apoqliphoth walkthrough (parts 1-14) for the order of the main quest
- the VGMaps.com NES atlas for the world map and 27 town, castle and dungeon maps
- StrategyWiki for battle, formation and transport rules
- the RPGamer archive for fan MIDI/MOD arrangements, credited to their arrangers

Only what exists in the NES release is kept: remake-only enemies, items, dungeons, drops and NPCs are left out.

## Sources and credit

The portal identifies itself honestly (`RobOS-JRPG-Parse-Portal/1.0`), waits between requests to the same host and caches every response, so a re-run does not hit a site again. Sites that refuse automated clients (GameFAQs, Data Crystal, The Spriters Resource) are recorded as cited or manual sources and are never fetched around their refusal. Images and maps are linked where they are hosted, with credit; they are not copied into the kgraph folder. `--download-images` keeps a local copy in `cache/` (git-ignored) for remake work.

Each source is a `jrpg:Source` node; every fact points at its sources, and wiki-derived nodes link the page they came from. Anything the portal could not acquire is listed in `coverage.json` and the README of the folder (for Final Fantasy: the NES experience-per-level table).

## Robos agent

`discover` sends the user's active coding agent (RobOS Agents: Claude Code, Codex, Gemini CLI, Copilot, through `robos-lib/ai-agent`) a brief listing the asset types and the sources already known. The answer must be a JSON array; each suggestion is validated (http(s) only, known asset types) and probed, then recorded as an `agent-suggested` source. The agent's answer is data: nothing in it is run.

## Kgraph folder

```
.robos/kgraph.yaml                   package catalog
.robos/ontology.jsonld               JRPG types and their parents
.robos/kgraphs/<package>/package.jsonld
site/renderers/*.js                  renderers for the Pages viewer (the JRPG pack, plus any you or the agent add)
coverage.json                        asset-type coverage and acquisition notes
README.md
```

Tests: `node --test packages/robos-test/tests/jrpg-parse-portal/unit.test.js` (offline; Final Fantasy runs against a recorded copy of its fan sites) and `xvfb-run -a node --test packages/robos-test/tests/jrpg-parse-portal/portal.e2e.js`.
