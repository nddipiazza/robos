# Infinity AI scenario engine

The Infinity AI engine can play any combatant: party members, enemies and NPC allies. An end-to-end test is the engine set up with a map, a game state and AI directives from a KGraph node; Cucumber then asserts on what happened.

## Why it was needed

The playable demo worked, but the engine couldn't take an arbitrary scenario:

- **Encounters were hard-coded.** `TacticalBattle.gd` assumes three party nodes (`hero`, `elora`, `thrumbar`), fixed enemy ids and per-encounter setup functions. `/api/v1/setup_state` picked scenes by keyword.
- **Nothing was reproducible.** Rules rolled with unseeded `randi()`, so tests could only prove outcomes by forcing them.
- **Rules were hero-centric.** Healing read the *hero's* WIS whoever cast it, and every hit was logged as slashing.
- **Content data wasn't mechanical.** `spells.json` had no save stat, area or effect.

## The strategy

1. **Deterministic dice.** `Dice` autoload with a seed, scripted rolls and a log of every roll and why it was made. Same seed + same scenario = same battle.
2. **A drop-in scenario format that is a KGraph type.** `robos:CRPGTestScenario`, with `robos:CRPGBattleMap`, `robos:CRPGCombatant`, `robos:InfinityAIDirective` and `robos:CRPGPlayerInput`, are SHACL shapes in the KGraph registry (`packages/robos-graph/lib/shacl-validator.js`, `testing` package).
3. **A generic, data-driven engine core** (`scripts/engine/ScenarioEngine.gd`). One combatant model for party, enemies and NPCs: initiative, turns, attacks, spells, reactions, conditions, dying, movement, traps, items, victory, defeat or timeout.
4. **Mechanics in the content data.** `spells.json` → `mechanics`; `monsters.json` → creature type, resistances, immunities, token; `items.json` → `armorType`, `rangeFeet`, `use`, `grants`.
5. **An engine that audits itself.** After every event: HP stays within 0 and max, the dead don't act, every reported die exists in the dice log, attack, damage, heal and save arithmetic is right, resistances apply correctly, slots never go negative, and no two creatures end a move in one square.
6. **One Gherkin vocabulary, three layers of proof.** Exact rules tests with scripted dice; a content matrix over everything in `data/v1`; drop-in and fuzz battles that must finish with a clean audit and replay identically.
7. **A coverage gate.** `99_coverage_gate.feature` fails if any content id, or any rule path the engine defines (`_cov_rule(...)`), was never exercised.
8. **Move the demo onto the engine.** Still to do: rewire the hand-built encounters (golems, goblin crowd, 3v3 rounds) onto the scenario engine so the playable game and the proofs share one engine.

## Dropping in a scenario

Write a `robos:CRPGTestScenario` node to `scenarios/<slug>.jsonld`:

```json
{
  "@context": {"robos": "https://robos.dev/ns/sdlc#", "dcterms": "http://purl.org/dc/terms/"},
  "@id": "urn:robos:crpg:test-scenario:my-fight",
  "@type": ["robos:CRPGTestScenario"],
  "dcterms:title": "My fight",
  "robos:seed": 42,
  "robos:map": {"@type": "robos:CRPGBattleMap", "dcterms:title": "Crypt", "robos:width": 120, "robos:height": 80},
  "robos:party": [
    {"@type": "robos:CRPGCombatant", "robos:actorId": "vance", "robos:characterClass": "fighter", "robos:race": "human", "robos:level": 3, "robos:position": [10, 20]}
  ],
  "robos:enemies": [
    {"@type": "robos:CRPGCombatant", "robos:actorId": "skeleton", "robos:monster": "skeleton", "robos:count": 3, "robos:position": [70, 10]}
  ],
  "robos:directives": [
    {"@type": "robos:InfinityAIDirective", "robos:side": "party", "robos:controller": "infinity_ai", "robos:targetPriority": "lowest_hp"}
  ]
}
```

Then play it from a feature:

```gherkin
Given the cRPG test scenario "my-fight" from the knowledge graph
When the Infinity AI plays the battle to the end
Then the outcome is "victory"
And the engine audit is clean
And replaying the scenario produces the identical battle
```

Anything the engine doesn't recognise (an unknown monster, class, spell, item or condition; an invalid directive; a combatant off the map or two on one square) is rejected at load time with a clear error. Validate files against the KGraph shapes with:

```bash
node tests/e2e/validate_scenarios_kgraph.js scenarios/*.jsonld
```

Combatants can also carry `hp`, `ac`, `abilities`, `spells`, `slots`, `inventory`, `accessories`, `conditions`, `weapon`, `armor` and `shield`. An enemy without a `monster` id is a custom stat block with `attacks`. `robos:allies` adds NPCs who fight for the party.

## Infinity AI directives

Every decision the Infinity AI makes is recorded as a **player input**, the same command a person would click (`player_input` events, shown as virtual-cursor clicks in human mode). A directive steers one actor (`robos:actor`) or a whole side (`robos:side`: `party`, `enemy` or `all`); actor-level fields override side-level ones.

| Field | Values | Default |
|---|---|---|
| `controller` | `infinity_ai`, `scripted`, `idle` | `infinity_ai` |
| `scriptedInputs` | ordered `robos:CRPGPlayerInput` (`type`, `round`, `target`, `spell`, `item`, `point`, `to`), played before the AI takes over | none |
| `targetPriority` | `nearest`, `lowest_hp`, `highest_hp`, `weakest_ac`, `spellcaster` | `nearest` |
| `focusTarget` | actor id to attack whenever it's valid | none |
| `preferSpells` / `forbidSpells` | spell ids | none |
| `useSpells` | `false` to fight with weapons only | `true` |
| `healThreshold` / `potionThreshold` | fraction of max HP | `0.5` |
| `movement` | `advance`, `hold`, `kite` | `advance` |
| `areaMinTargets` | foes an area spell must catch | `2` |
| `allowFriendlyFire` | let area spells catch allies | `false` |

## Running the suite

| Mode | What you get | Command |
|---|---|---|
| **Backend** | Headless Godot, no video, no overlays or pauses: the whole engine suite runs in about a minute and a half | `CRPG_MODE=backend python3 -m behave tests/e2e/features/engine` |
| **Prove it to a human** | Xvfb video per scenario, a splash card, BDD step bar, proof panel, the AI's inputs as cursor clicks, and pauses so it can be followed | `python3 -m behave tests/e2e/features/engine` |

The runner takes the same switches: `python3 run_cucumber_tests.py --engine --backend` or `--engine --human`. Tune the human pacing with `CRPG_TURN_PACE` (seconds per turn) and `CRPG_SHOW_PAUSE` (seconds after each action).

The coverage gate needs the whole engine folder. When running a subset, add `--tags=-coverage_gate`.

## What the features cover

| Feature | Proves |
|---|---|
| `01_kgraph_drop_in_scenarios` | Every KGraph scenario file plays to the end with a clean audit and replays identically; the files conform to their SHACL shapes; bad scenarios are rejected |
| `02_attack_rules` | Stat derivation, crits, fumbles, AC ties, advantage and disadvantage, auto-crits, ranged-in-melee, sneak attack, range and dead-target refusals |
| `03_damage_and_dying` | Resistance, vulnerability, immunity, dropping to 0, massive damage, death saves, stabilising, damage while dying, healing from 0 |
| `04_spells` | Every spell, Shield and Counterspell reactions, saves, areas, conditions, and every casting refusal |
| `05_infinity_ai_directives` | Every directive knob, scripted inputs, idle NPCs, NPC allies, and a whole battle played by the AI on both sides |
| `06_items_and_traps` | Every potion, weapon, armor and accessory; spotting, searching, disarming and triggering traps |
| `07_movement` | Speed, dwarf speed, opportunity attacks, disengaging, standing from prone, restraint, occupied squares, map edges |
| `08_content_matrix` | Every class at levels 1 and 5, every race, every monster, every condition's effect |
| `09_fuzz_any_scenario` | Hundreds of randomly generated battles, each with a clean audit and an identical replay |
| `10_rule_edges` | The rarer rule paths: Bless on saves, Sanctuary pierced or broken, maneuvers exhausted, healing the dead, every trap type |
| `11_blockout_maps` | Walls, doors, pathfinding, line of sight, cover, difficult terrain and fireballs stopped by walls on blockout maps |
| `99_coverage_gate` | Every content id and every rule path was exercised |

## Engine API

`POST /api/v1/scenario/load` (`{"scenario": {...}}` or `{"file": "scenarios/x.jsonld"}`, plus `"mode": "human" | "backend"`), `/scenario/dice`, `/scenario/input` (a player input), `/scenario/act`, `/scenario/turn`, `/scenario/run` (`pace` for human mode), `/scenario/patch`, `/scenario/events`, `/scenario/fuzz`, `/scenario/coverage/reset`; `GET /api/v1/scenario/state`, `/scenario/audit`, `/scenario/dice_log`, `/scenario/coverage`, `/scenario/content`.

## Next steps

- Rewire the demo encounters in `TacticalBattle.gd` onto the scenario engine (strategy point 8).
- Register scenario instances in the `.robos/kgraphs/testing` package so the KGraph explorer lists them.
- Paint real art over the blockout backgrounds (gameplay reads the grid, so nothing else changes).
- Model rules the data doesn't use yet (concentration, upcasting, cover, line of sight through walls) and add them to the coverage gate as they land.
