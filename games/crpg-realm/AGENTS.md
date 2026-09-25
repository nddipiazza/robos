# AGENTS.md: robos-crpg (Realm of Heroes)

A party-based, Infinity Engine-style cRPG on Godot 4.3 with D&D 5e SRD rules. This file is for agents that change the game or its tests. For the repo-wide conventions, see the root [AGENTS.md](../../AGENTS.md).

The one idea to hold onto: **the Infinity AI engine can play any combatant, party member or NPC, so an end-to-end test is the engine set up with a map, a game state and AI directives, then asserted with Cucumber.**

## The test pyramid

Most proof lives at the fast, headless base. Only a few tests at the top pay the time and CPU cost of proving that a real person can play the game.

```
            ▲  Real-player playthroughs (minutes each, CPU heavy, video)
           ▲▲▲   tests/e2e/features/full_playthroughs/, qa_player/
          ▲▲▲▲▲    Legacy scene and UI features (seconds each, video)
         ▲▲▲▲▲▲▲     tests/e2e/features/normal/, tests/e2e/features/spells/
      ▲▲▲▲▲▲▲▲▲▲▲▲▲   Infinity AI scenario engine, headless (milliseconds each)
                       tests/e2e/features/engine/   ← write new tests here first
```

| Layer | What it proves | Where | How it runs | Cost |
|---|---|---|---|---|
| **Base: map library unit tests** | Blockout geometry, rendering and validation | `packages/robos-crpg-blockout/tests/` | `python3 -m unittest discover -s tests` | Well under a second |
| **Base: scenario engine** | Rules, content, Infinity AI decisions, any dropped-in scenario, fuzzed battles, coverage | `tests/e2e/features/engine/` | Headless Godot, `CRPG_MODE=backend` | The whole suite, fuzzed battles included, in about a minute and a half |
| **Middle: scene and UI features** | The real scenes, HUD, dialogue, shop, fog of war and legacy tactical battles render and respond | `tests/e2e/features/normal/`, `tests/e2e/features/spells/` | Xvfb, video per scenario, BDD overlays | Seconds per scenario |
| **Top: real-player playthroughs** | A person can create a character and play the campaign start to finish, driven through clicks and keys | `tests/e2e/features/full_playthroughs/`, `qa_player/` | Xvfb, video, long runs | Minutes per scenario, CPU heavy; run before releases, not on every change |

**Rules of thumb:**

- A new rule, spell, monster, item, condition or AI behaviour gets a **base** test in `features/engine/`. It must pass headless.
- Touch the middle layer only when you change a scene or its UI.
- Add to the top layer only for a new end-to-end journey a player takes. Keep that layer small.
- The same engine features also run in human mode, with video and pauses, when you need to show the proof to a person.

## Running tests

```bash
# Base layer, fastest: headless, no video, no pauses
CRPG_MODE=backend python3 -m behave tests/e2e/features/engine

# Base layer, "prove it to a human": video, splash card, BDD step bar, proof panel,
# Infinity AI inputs shown as cursor clicks, pauses between turns
python3 -m behave tests/e2e/features/engine

# A subset (the coverage gate needs the whole folder, so skip it)
CRPG_MODE=backend python3 -m behave tests/e2e/features/engine/04_spells.feature --tags=-coverage_gate

# Through the runner, with the HTML report and embedded videos
python3 run_cucumber_tests.py --engine --backend
python3 run_cucumber_tests.py --engine --human
python3 run_cucumber_tests.py --spells          # middle layer
python3 run_cucumber_tests.py --playthrough     # top layer
```

| Variable | Meaning | Default |
|---|---|---|
| `CRPG_MODE` | `backend` (headless, fastest) or `human` (video and overlays) | `human` |
| `CRPG_TURN_PACE` | Seconds between Infinity AI turns in human mode | `0.7` |
| `CRPG_SHOW_PAUSE` | Seconds to hold after each action in human mode | `0.9` |
| `CRPG_WEB_SERVICE_PORT` | Port of the game's control API | `18090` |
| `CRPG_DISPLAY` | Xvfb display in human mode | `:99` |
| `REPORTS_DIR` | Where videos, telemetry and reports go | `tests/e2e/reports` |

Videos land in `$REPORTS_DIR/videos/`, one per scenario, in human mode only.

## Setting up the game state

An engine scenario is a **`robos:CRPGTestScenario`** KGraph node. Its SHACL shapes live in the KGraph registry (`packages/robos-graph/lib/shacl-validator.js`, `testing` package), next to the shapes it's built from:

| KGraph type | What it holds |
|---|---|
| `robos:CRPGTestScenario` | Title, `seed`, `map`, `party`, `enemies`, `allies`, `traps`, `directives`, `maxRounds`, `reactions`, scripted `dice`, preferred `executionMode` |
| `robos:CRPGBattleMap` | `width` and `height` in feet, optional `mapZone` link to a `robos:CRPGMapZone` |
| `robos:CRPGCombatant` | `actorId`, then `characterClass` + `race` + `level` for party members, or `monster` (or a custom stat block with `attacks`) for enemies and NPC allies |
| `robos:InfinityAIDirective` | How the Infinity AI plays one actor or a whole side |
| `robos:CRPGPlayerInput` | One scripted player command: `type`, `round`, `target`, `spell`, `item`, `point`, `to` |

You can give the state to the engine three ways; all three produce the same thing.

**1. A drop-in KGraph file** (`scenarios/<slug>.jsonld`). This is the preferred way for anything reusable:

```gherkin
Given the cRPG test scenario "crypt-skeleton-patrol" from the knowledge graph
```

**2. Inline JSON in a doc string**, for one-off or custom stat blocks. Plain engine keys or `robos:` keys both work:

```gherkin
Given a cRPG test scenario
  """
  {"name": "Gate guard", "seed": 52, "map": {"width": 60, "height": 40},
   "party":   [{"id": "vance", "class": "fighter", "level": 1, "x": 0, "y": 0}],
   "allies":  [{"id": "gate_guard", "monster": "corrupted-guard", "x": 10, "y": 0}],
   "enemies": [{"id": "hound", "monster": "corrupted-hound", "count": 2, "x": 30, "y": 0}],
   "traps":   [{"id": "dart", "trap": "poison-dart-trap", "x": 20, "y": 10}]}
  """
```

**3. Tables**, for readable rule tests:

```gherkin
Given a cRPG test scenario "Attack rules" with seed 11
And the party
  | id    | class   | race     | level | x | y | inventory      | spells                  |
  | vance | fighter | human    | 1     | 0 | 0 | potion-healing |                         |
  | ignis | wizard  | elf      | 5     | 0 | 10|                | magic-missile, fireball |
And the enemies
  | id       | monster  | count | x  | y |
  | skeleton | skeleton | 3     | 60 | 0 |
And the traps
  | id  | trap           | x  | y |
  | pit | spike-pit-trap | 30 | 0 |
And the round limit is 12
```

Party columns: `id`, `name`, `class`, `race`, `level`, `x`, `y`, `hp`, `ac`, `weapon`, `armor`, `shield`, `spells`, `inventory`, `accessories`, `conditions`. Enemy and ally columns: `id`, `monster`, `count`, `name`, `x`, `y`, `hp`, `ac`. A party member with only a class gets that class's kit (weapon, armor, spells) and ability scores plus racial bonuses. HP, AC, spell slots, spell DC, extra attacks and sneak attack dice are derived from class, race and level.

The engine refuses a scenario with unknown content, invalid directives, combatants off the map or two creatures on one square. It reports every problem at load time.

**Adjusting state mid-scenario.** Every change below is recorded as a `state_patched` event, so the audit trail stays complete:

```gherkin
Given "vance" is at 3 HP
And "guard" is paralyzed for 3 rounds
And "elora" is standing at 25,5
And "ignis" has 0 level-3 spell slots
And "ignis" has no spell slots left
And "thrumbar" carries "potion-healing"
```

**Scripting dice.** Scripted values are used before random ones. A value tied to a die size ("d8") waits for the next die of that size, even if other dice are rolled first:

```gherkin
Given the next d20 roll is 20
And the next d8 rolls are 4, 5
# any die, in order
And the next dice rolls are 3, 3
```

Everything else is seeded, so the same scenario and seed always replay the same battle.

## Configuring the Infinity AI

The Infinity AI plays every combatant nobody else is controlling. Each decision comes out as a **player input**: the same command a person would click. It's recorded as a `player_input` event with its reason, and shown as a virtual-cursor click in human mode.

A directive steers one actor (`actor`) or a side (`side`: `party`, `enemy` or `all`). Actor-level fields override side-level ones:

| Field | Values | Default |
|---|---|---|
| `controller` | `infinity_ai`, `scripted`, `idle` | `infinity_ai` |
| `inputs` / `robos:scriptedInputs` | Ordered player inputs, played before the AI takes over. A scripted player can move and then act in the same turn. | none |
| `targetPriority` | `nearest`, `lowest_hp`, `highest_hp`, `weakest_ac`, `spellcaster` | `nearest` |
| `focusTarget` | Actor id to attack whenever it's valid | none |
| `preferSpells` / `forbidSpells` | Spell ids | none |
| `useSpells` | `false` to fight with weapons only | `true` |
| `healThreshold` / `potionThreshold` | Fraction of max HP that triggers healing | `0.5` |
| `movement` | `advance`, `hold`, `kite` | `advance` |
| `areaMinTargets` | Foes an area spell must catch | `2` |
| `allowFriendlyFire` | Let area spells catch allies | `false` |

```gherkin
And the Infinity AI directives
  | side  | actor   | controller  | targetPriority | forbidSpells | movement |
  | party |         | infinity_ai | lowest_hp      |              |          |
  |       | ignis   | infinity_ai |                | fireball     | kite     |
  |       | malakor | idle        |                |              |          |
And the scripted player inputs for "elora"
  | round | type   | to    | trap | target |
  | 1     | move   | 25,5  |      |        |
  | 1     | search |       |      |        |
  | 2     | disarm |       | dart |        |
```

Directives can also be a JSON doc string (`And the Infinity AI directives` followed by `"""[{...}]"""`).

The default AI's priorities, in order:

1. Heal an ally below the heal threshold.
2. Drink a potion when below the potion threshold.
3. Cast an area spell that catches enough foes and no allies.
4. Cast a single-target spell.
5. Close in and attack, using a fighter maneuver on tough foes.
6. Dodge when nothing is in reach.

## Playing the scenario

```gherkin
# a player input from the test
When "vance" attacks "guard"
When "ignis" casts "fireball" at point 90,0
When "thrumbar" casts "cure-wounds" at "ignis"
When "vance" casts "rallying-stomp"
When "vance" uses "potion-healing" on "thrumbar"
When "vance" moves to 30,0
When "vance" disengages and moves to 0,25
When "vance" takes the disengage action
When "vance" dodges
When "elora" searches for traps
When "elora" disarms "dart"
# one creature's turn, out of order
When the Infinity AI plays "malakor"'s turn
# initiative order
When the Infinity AI plays the next 4 turns
When the Infinity AI plays up to 3 rounds
When the Infinity AI plays the battle to the end
When the Infinity AI plays 100 random scenarios from seed 1
```

## Asserting scenarios

Every Then step reads live state back from the engine. In human mode, it also posts that evidence to the on-screen proof panel.

```gherkin
# Combatants
# also: at most / at least N HP, full HP
Then "guard" has 7 HP
Then "vance" has 12 max HP and AC 18
Then "vance" has AC 20
Then "hero" has speed 25
# also: alive, standing, down
Then "ignis" is dead
# any condition id; also: is not <condition>
Then "guard" is paralyzed
Then "vance" is at 15,40
Then "a" and "b" are in different squares
Then "ignis" has 0 death save successes and 2 failures
Then "ignis" has 3 level-1 spell slots left
Then "vance" has 0 maneuvers left
Then "vance" has 0 "potion-healing" left

# The last action
Then the action succeeds
# no_slot, spell_not_known, target_unseen, countered, sanctuary, …
Then the action is refused because "out_of_range"
# misses, is a critical hit
Then the attack hits
# with disadvantage
Then the attack was rolled with advantage
# took at least N <type> damage, took no damage
Then "guard" took 9 force damage
Then the damage included 2d6 of sneak attack
Then "guard" was not affected

# The Infinity AI's decisions
Then the Infinity AI made "thrumbar" cast "healing-word"
# attack / cast / use / target
Then the Infinity AI made "vance" attack "guard_b"
# move / dodge / wait
Then the Infinity AI made "vance" dodge
Then the Infinity AI never made "ignis" cast "fireball"
Then every input "vance" gave came from its script

# The battle
# defeat, timeout
Then the outcome is "victory"
Then the battle has ended
Then the battle lasted at most 6 rounds
Then the event log shows "reacts with Shield"

# Proof the engine is sound (end long scenarios with these)
Then the engine audit is clean
Then replaying the scenario produces the identical battle
Then every random battle finished with a clean audit
Then every random battle replayed identically
Then every scenario file conforms to the robos:CRPGTestScenario SHACL shapes
Then loading this scenario fails with "unknown monster 'beholder'"
# coverage gate only
Then the engine has exercised every spells in the content data
# coverage gate only
Then the engine has exercised every rule path it defines
```

**What "the engine audit is clean" checks** after every event:

- HP stays between 0 and max, and the dead have 0 HP.
- The dead and incapacitated don't act.
- Every die an event reports is in the dice log.
- Attack, damage, heal and save arithmetic is right, including advantage and disadvantage and natural 1s and 20s.
- Resistance, vulnerability and immunity apply correctly.
- Spell slots never go negative.
- No two living creatures end a move in the same square.

The step definitions live in `tests/e2e/features/steps/engine_steps.py`. If you add a step whose text starts with `"{actor}" is`, register it **above** the catch-all `"{actor}" is {condition}` at the bottom of the file, because behave tries steps in registration order.

## Adding content or rules

1. Put the mechanics in the data: `mechanics` in `data/v1/spells.json`; `creatureType` and resistances or immunities in `monsters.json`; `armorType`, `rangeFeet`, `use` and `grants` in `items.json`. Don't change existing fields; the legacy scenes read them.
2. If it needs new rules, add them in `scripts/engine/ScenarioEngine.gd`, and mark each new path with `_cov_rule("area.name")` so the coverage gate demands a test for it.
3. Add a base-layer feature in `tests/e2e/features/engine/` with scripted dice and exact numbers. Then run the whole folder: `99_coverage_gate.feature` fails until every content id and rule path is exercised.
4. For a reusable fight, add a `scenarios/<slug>.jsonld` KGraph node and an example row in `01_kgraph_drop_in_scenarios.feature`.

## Maps: blockouts from KGraph data

Battle maps are **blockouts** (greyboxes): flat, labelled shapes for walls, buildings, doors, trees and props, used as the scenario background and as the collision grid. Art can replace the picture later without changing gameplay.

- A map is a `robos:CRPGBattleMap` node in `maps/<slug>.jsonld`, and its static scene objects are `robos:CRPGMapObject` nodes: `wall`, `building`, `door`, `pillar`, `tree`, `rock`, `statue`, `crate`, `barrel`, `table`, `altar`, `bed`, `chest`, `fence`, `pit`, `water`, `rubble`, `stairs`, `bush`, `road`, `bridge`, `rug`, `zone`.
- Build it with the [robos-crpg-blockout](../../packages/robos-crpg-blockout/README.md) Python library. That renders `assets/blockouts/<slug>.png` and writes the 5-ft collision grid into the map node:

  ```bash
  cd ../../packages/robos-crpg-blockout && python3 -m robos_crpg_blockout build ../../games/crpg-realm/maps/*.jsonld
  ```

- A scenario references a map by id (`"robos:map": {"@id": "urn:robos:crpg:battle-map:<slug>"}`), or with `Given the battle map "<slug>"` in a feature.
- The engine then pathfinds around obstacles, blocks attacks and spells without line of sight, keeps fireballs from going through walls, adds cover to AC and charges double for difficult terrain. `11_blockout_maps.feature` proves each of these on the `test-wall-room` and `test-doors` maps, and fails if any map's grid is out of date with its objects.
- After editing a map's objects, rebuild it. The engine refuses a map that has objects but no grid.

## Browser build (itch.io)

`./export_web.sh` exports the game with Godot 4.3's single-threaded web template and writes `build/web/` plus `build/realm-of-heroes-web.zip` (git-ignored). It needs the Godot 4.3 web export templates in `~/.local/share/godot/export_templates/4.3.stable/`.

- The export preset (`export_presets.cfg`) packs the `data/`, `mods/` and `scenarios/` JSON explicitly, because Godot only packs imported resources by default. It leaves out `tests/`, `qa_player/` and `docs/`.
- In browser builds, `GameControlServer` doesn't start (browsers can't open TCP servers), and `QAOverlay` hides its test panels but keeps the game cursor. E2E tests always run against desktop builds.
- On itch.io, upload the zip as an HTML game, tick "This file will be played in the browser", and set the viewport to 1280×720 with the fullscreen button on. The SharedArrayBuffer option isn't needed.

## Demo mode

The demo mode plays the e2e test pyramid inside the game with the BDD HUD (scenario splash, step bar, proof panel) visible, looping through the suite. It features a persistent autoload controller (`DemoController.gd` at CanvasLayer 124) that survives scene changes and supports instant toggling between two distinct playback modes:

- **Dual Modes:**
  - **Demo Arena (`Mode.DEMO` / "🎭 Mode: Demo Arena"):** Plays the engine layer (`tests/e2e/features/engine/`) live inside `ScenarioArena.tscn` via `scripts/demo/EngineSteps.gd`. Visualizes dice rolls, initiative order, combatants, SMR outcomes, and step audits.
  - **Real cRPG Mode (`Mode.REAL` / "🎮 Mode: Real cRPG"):** Plays full-game campaign journeys (`tests/e2e/features/full_playthroughs/`) and scene tests (`normal/`, `spells/`) directly in the **real Godot cRPG scenes** (`CharacterSelect.tscn`, `Homestead.tscn`, `VillageSquare.tscn`, `GarrisonKeep.tscn`, `TacticalBattle.tscn`, `VictoryScreen.tscn`) via `scripts/demo/RealSteps.gd`. Simulates character creation, movement, looting, NPC dialogues, shop trading, RTwP tactical pauses, spell casting, ranged attacks, and the Malakor encounter.
  - **Mode Toggle:** Click the `[ 🎭 Mode: Demo Arena ]` / `[ 🎮 Mode: Real cRPG ]` button on the bottom bar or press `M` to seamlessly toggle between modes at any time. Clicking any test in the test pyramid drawer automatically loads the corresponding scene and switches mode as needed.
- **How to open:**
  - In the character creation screen, click **"🎭 Demo Arena"** or **"🎮 Real cRPG Demo"** in the top-right.
  - From CLI / desktop: pass `--demo` for Demo Arena or `--real-demo` (or `--demo=real`) for Real Mode (e.g. `~/apps/godot4 --path . --demo` or `~/apps/godot4 --path . --real-demo`).
  - In browser builds: append `?demo` or `?real` to the URL (e.g. `http://localhost:8080/?demo` or `http://localhost:8080/?real`).
- **In-game runner parity:**
  - `tests/e2e/features/engine/12_in_game_runner_parity.feature` exercises every engine scenario through the in-game runner via `POST /api/v1/demo/run_all`.
  - Whenever you add a new step to `tests/e2e/features/steps/engine_steps.py`, **port the step to `scripts/demo/EngineSteps.gd`**, or in-game runner parity will fail.
- **Controls & Round Timer:**
  - **Round Pace / Combat Timer:** Combat rounds default to a relaxed 1.4s/turn (slowed 2x). You can dynamically adjust the combat timer during battles using the bottom control bar (`🐢 Slower` / `Faster 🐇` buttons and the pace slider) or keyboard shortcuts `[` / `-` (slower) and `]` / `+` (faster). Range: 0.4s to 6.0s/turn.
  - **Navigation & Playback:** `M` toggles Demo Arena / Real cRPG mode, `Space` pauses/resumes, `Left` / `Right` steps between scenarios, `T` toggles the test pyramid navigator drawer, `1`–`5` adjusts overall speed (`0.25x` to `4.0x`), and `Esc` exits back to character selection.

## Engine map

| File | Role |
|---|---|
| `scripts/engine/Dice.gd` | Seeded dice, scripted rolls, roll log (autoload `Dice`) |
| `scripts/engine/ScenarioEngine.gd` | Rules core, Infinity AI, audit, coverage, fuzz (autoload `ScenarioEngine`) |
| `scripts/engine/ScenarioArena.gd`, `scenes/ScenarioArena.tscn` | Human-mode rendering of any scenario |
| `scripts/GameControlServer.gd` | `/api/v1/scenario/*` control API |
| `scenarios/*.jsonld` | Drop-in `robos:CRPGTestScenario` KGraph nodes |
| `maps/*.jsonld`, `assets/blockouts/*.png` | `robos:CRPGBattleMap` blockout maps and their rendered backgrounds |
| `../../packages/robos-crpg-blockout/` | Python library and CLI that builds blockout maps |
| `tests/e2e/validate_scenarios_kgraph.js` | Validates scenario files against the KGraph SHACL shapes |
| `docs/scenario-engine-plan.md` | Strategy, API and progress |

The legacy encounters in `TacticalBattle.gd` and `CombatManager.gd` still use their own hand-built rules. Moving them onto the scenario engine is the next step in the plan.
