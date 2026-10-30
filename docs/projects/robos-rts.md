---
title: "RobOS RTS"
layout: default
parent: Projects
permalink: /projects/robos-rts/
nav_order: 4
description: "Starfall Command: 1 player vs AI on Frontier Hunters, a 256×256 map with eight starts, unlimited deposits, a Godot 4 map editor and live gameplay tests."
---

# RobOS RTS: Starfall Command
{: .no_toc }

A real-time strategy game in Godot 4.3, in `games/robos-rts`. The default mode is **Frontier Hunters: one human versus one AI**, building from scratch on a rich eight-start map. The engine also contains three asymmetric factions and isolated mechanics scenarios. The simulation is deterministic and runs at a fixed 64 ticks per second, separately from rendering, so the same game can be played by a person, driven by a script, or run headless in tests.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

![Frontier Hunters combat: the player's Riflemen attack the Hard Siege AI base](/assets/games/rts/frontier-hunters-live.jpg){: .robos-zoomable-img }

*A frame from the live Rush versus Hard Siege test on Frontier Hunters. The older canyon and three-faction screenshots below illustrate isolated engine mechanics.*

The game takes its conventions from the RTS genre in general: base building, a worker economy, control groups, a minimap and a command card. Open-source RTS projects such as OpenRA, 0 A.D., Warzone 2100 and Beyond All Reason are good references for the genre. Names and models are original to this repository; the map editor credits its reused open-source brush and fill cores below.

## Run it

You need Godot 4.3 (`GODOT_BIN`, `godot4` or `godot` on your `PATH`).

```bash
games/robos-rts/play.sh
```

Without a display, the headless Cucumber suite needs Python with `behave`:

```bash
cd games/robos-rts
./run_cucumber_tests.py --backend
```

The window opens with match setup. Choose Easy, Normal or Hard AI, its Rush, Balanced, Economy or Siege strategy, and a speed from 1× to 8×. Press **F8** during play to resume, start a new match, or surrender; **F1** opens the controls overlay.

The game starts fullscreen on the active display with a **1920×1080 interface canvas** that scales while preserving its aspect ratio. **Alt+Enter** switches to a centered 1600×900 window, reduced to fit smaller desktops, and back to fullscreen. `--windowed` and automated test launches use the fitted window.

Move the pointer to an edge of the game view to scroll the camera, including diagonally at corners. **F8 → Mouse scroll speed** adjusts this independently of arrow-key speed; 0 disables it. The preference is saved in `~/.config/robos/rts/controls.cfg`. Scrolling stops outside the focused game window and while a menu, briefing, help overlay or results screen is open. Double-click a unit or structure to select **all your matching entities across the map**, including those outside the current view; Shift adds them to the existing selection.

When multiple production buildings are selected, the command card combines all their trainable units. Each has a button and a unique displayed hotkey, including selections containing different kinds of building. One press trains one unit at a compatible completed building with the shortest queue. Hold the hotkey to train immediately, wait **350 ms**, then repeat every **75 ms**; releasing it, changing selection, opening a menu or losing focus stops the repeat. Full queues, supply and resource limits still apply. The combined production list shows every selected building, active progress and queued unit types; scroll it to inspect additional rows.

Selecting a constructing worker leaves its build order running. Use **Stop / Halt (S)** to interrupt it; the unfinished structure retains its paid progress. Select a compatible worker and right-click that structure to resume. This reuses the same foundation without another charge. An actively assigned builder must be halted before another worker can take over. Queued follow-up tasks run after construction finishes.

## Recent gameplay improvements

**F3 / Army** selects all living owned combat units, including offscreen, excluding workers/buildings. Right-click an active or waiting production queue icon for a full refund of its paid crystal/aether and reserved supply. Cancellation works in both single-building and combined queue views, preserving other entries and current progress. Right-click crystal or a friendly Aether Tap with a producer selected to send new workers straight to gathering. An explicit ground rally moves new workers to that point; depleted or destroyed resource rallies fall back safely. Military units never harvest.

Development work is tracked in `docs/planning/robos-rts-backlog.json`, outside the game. No planning screens or development todos appear in gameplay.

Large selections now reuse their portrait layout instead of sorting the same units every frame. A five-round headless component microbenchmark measured 200-unit layout calls at 0.732 ms before and 0.122 ms after caching; this is not a whole-game FPS claim. Selection order, deaths, morphs and production ownership changes invalidate the cache, while health and movement remain live. `tests/test_selection_layout.gd` proves those invalidation cases; `tests/data/selection-layout-benchmark.json` records the measurements.

```bash
cd games/robos-rts
python run_balance_tests.py --suite improvements --suite controls --suite economy --jobs=1
python tests/e2e/improvements_walkthrough.py
```

The tests prove refunds, supply release, queue continuity, actual resource income, ground/aether/depleted rallies and army ownership. The rendered walkthrough exercises native queue cancellation in both views and worker resource rallies; proof and captions are archived under `~/.robos/development/walkthroughs/rts-player-controls/`.

## Campaign: First Strike

Choose **Campaign: First Strike** from the F8 menu, or run `games/robos-rts/play.ps1 -Mission` on Windows (`-Windowed` is optional). Other platforms can use `games/robos-rts/play.sh -- --scenario=campaign-first-strike`.

You begin with a Colony Hub, 12 gathering Pioneers, 150 crystal and no army. Build Provision Silos and Muster Halls, train roughly **40 Riflemen (40 army supply)**, then attack the eastern stronghold through the canyon. With the original workers that means 52 total supply; five Silos raise capacity to 55. There is ample finite crystal and no time limit. The enemy garrison guards its base, without free reinforcements or attacks during your buildup. Destroy the Brood Nest **and every defender** to win; losing your army allows another attempt, while losing all your structures ends the mission.

The briefing explains the build order; the live objective panel shows Riflemen, surviving defenders and the nest's status. Click **Hide objectives** to collapse it to a small **Show objectives** button; click again to restore it. **Enter** begins, **P** pauses, **F9** restarts at the briefing and **R** reopens the end-of-mission statistics. The results retain newly trained units and measure each unit's lifetime from its creation. The 40-supply recommendation is a combat balance target, not a victory gate: strong micro, different units or multiple assaults can change the number required.

`scenarios/campaign-first-strike.jsonld` contains the map, economy, fixed garrison and mission metadata. `POST /mission {"action":"start"}` / `{"action":"restart"}` use the same engine operations as the interface. A normal straight assault without Surge is checked with 28 and 36 Riflemen losing and 40 winning within survivor/time thresholds. A separate end-to-end controller pays for all construction and all 40 Riflemen through ordinary player commands, then wins the actual mission. The rendered recording uses the live frame clock and keyboard Begin/Restart inputs:

```bash
cd games/robos-rts
python run_balance_tests.py --suite campaign --jobs=1
python tests/e2e/campaign_walkthrough.py
python tests/e2e/campaign_walkthrough.py --record
```

The narrated MP4, captions, screenshots and progression proof are archived under `~/.robos/development/walkthroughs/rts-first-strike/`.

## Battle Lab: Riflemen versus Riflemen

Choose **Battle Lab: 10 Riflemen vs 10 Riflemen** from the F8 menu, or launch directly:

```bash
games/robos-rts/play.sh -- --scenario=riflemen-vs-riflemen
```

On Windows, use `games/robos-rts/play.ps1 -BattleLab` (optionally `-Windowed`). The launcher accepts `GODOT_BIN` or Godot on PATH; it also recognizes the local cached Godot 4.3 runtime.

Two mirrored formations start with ten full-health Riflemen each on open ground. No economy, upgrades, reinforcements or AI micro affect this comparison. **Fight / Enter** sends both squads toward the center using the engine's ordinary attack-move commands. The blue squad starts selected: watch, or take over with right-click movement/targeting and **A + click** attack-move. **P** pauses/resumes; **F9 / Reset** restores both squads, their health and the deterministic seed. **Frame armies** recenters the view. Live survivor counts and elapsed game time remain visible; elimination freezes the result. This first matchup establishes the reusable unit-battle mode; other matchups can supply their own scenario formations.

`scenarios/riflemen-vs-riflemen.jsonld` is the source-backed `robos:RTSTestScenario`. `POST /battle {"action":"start"}` and `{"action":"reset"}` expose the same operations as the buttons; observations report `match.mode=unit_battle`, ready/playing/finished status, winner and `army_eliminated` reason. The winner comes from normal combat; the fixture does not force a draw or prescribe a winner.

```bash
cd games/robos-rts
python run_cucumber_tests.py --backend --tags=@unit_battle --format=progress
python tests/e2e/battle_walkthrough.py
```

The backend scenario checks mirrored full-health squads, combat elimination, command rejection after completion, a frozen result and identical replay after reset. The rendered walkthrough clicks the Fight button, pauses, overrides blue with a right-click, resets with F9, runs a complete fight on the live frame clock, and checks fullscreen/windowed switching. It uses zero `/step` requests. Outputs include MP4, WebVTT, screenshots and JSON proof under `tests/e2e/reports/battle/` and `~/.robos/development/walkthroughs/rts-riflemen-vs-riflemen/`. The walkthrough requires Python `behave` and ffmpeg (on PATH or via `imageio-ffmpeg`).

### Unit and ability outcome contracts

Run the registry-wide behavioral and balance suites in parallel:

```bash
cd games/robos-rts
python run_balance_tests.py --jobs=3
python run_balance_tests.py --suite=combat --jobs=1
```

Each suite owns an isolated headless Godot process and control port. Windows test processes use below-normal scheduling priority; the runner does not attach to or change an open game. `GODOT_BIN` selects the engine. Logs and a machine-readable `summary.json` live in timestamped folders under `tests/e2e/reports/balance/`. A timeout, failed assertion, engine error, missing result or uncovered registry entry fails the run. Coverage auditing always runs, including when selecting one suite.

`test_unit_contracts.gd` checks every unit and morph: spawned durability, shields, per-hit armor, movement distance, supply behavior, weapon range/dead zones, damage, attribute bonuses and cadence. Each mobile type also has a natural-health duel with a specified winner, surviving-health interval and completion-time window. Structures have durability, supply and production contracts rather than invented offensive victories.

`test_combat_abilities.gd` tests Surge on both Riflemen and Breachers: ten HP cost, 1.5× movement and attack rate, expiration, invalid use, and boosted mirror-duel victories on either side. Other contracts cover Phase Step distance/cooldown/rejected-command side effects; Sunblade Rush speed and duration; Emplace/Mobilize identity, radius, mobility and damage; silo gate transitions; shield regeneration, concussive slow, cliff-walking, splash boundaries, and multi-hit/per-strike armor with no duplicate kill credit.

`test_economy_abilities.gd` covers every declared training and construction command, all workers' harvesting, and shared commands. It checks actual paid costs, full match-mode completion times within two ticks, supply, queue capacity, prerequisites, invalid casters/placement/resources, finite deposit conservation, owned aether extraction, rally movement, and worker-dependent construction versus autonomous Mote summoning. Explicit mechanic dummies may isolate damage or timing; expected-win duels retain natural unit stats.

`test_matchup_matrix.gd` tests every unordered combat-unit pair, including mirrors. Units start at full HP/shields on open ground, with centers twenty world units apart, seed 42 and active abilities off. Types swap between the left/owner-one and right/owner-two positions; same-type mirrors repeat identically to verify determinism. Each duel must end through combat elimination with the declared winner, exactly one survivor, one credited kill/loss, and duration and remaining-health bounds from `tests/data/matchup_expectations.json`. These envelopes pin this fixture's balance; they are not claims about other army sizes, terrain, spacing or micro.

Expectations are reviewed values, separate from the registry under test. New roster/ability entries fail coverage until they receive behavioral contracts. Balance changes require reviewing the winning matchups and thresholds; do not widen bounds or regenerate expectations just to hide a regression. `--probe-matchups` on the matrix script writes observations only and never edits or approves the expectation file. The coverage audit rejects missing, stale or duplicate pairs.

The suites exposed and now guard fixes for ignored second strikes, splash beyond its center-distance radius, morphs retaining the previous collision radius, rejected Phase Step commands canceling attacks, stale teleport routes, invalid movement/harvest/rally casters, and construction starting with ten percent of its duration already complete. A weapon volley still emits a single fire signal, preserving the audio/visual event boundary.

### Moving around teammates

Units trying to reach an enemy now detect blocking allies ahead and plan a short route around their bodies. A separate local A* grid includes body radii and static terrain; the global terrain grid remains unchanged. Units cache the detour, discard it when the blocker moves away, and stop detouring once they have a shot. Higher-priority vehicles can still ask idle workers to yield, while hold-position teammates stay planted. Manual movement replaces the cached route. Enemy pursuit uses the terrain navigator on dry maps too, so cliffs and structures do not trap a chasing unit against their near edge.

Local planning is bounded to a 31×31 neighborhood, with at most one rebuild per owner per simulation tick and cooldowns between retries. This avoids giving one side all the planning slots and limits work during crowded fights. Collision steering still handles immediate separation. The results screen records successful allied detour plans under **Weapons & Micro** and in each unit's record; `/performance` reports their cost as `profile_usec.crowd_navigation`.

`allied-crowd-flank.jsonld` is an isolated navigation fixture: one rear Rifleman must get around nine hold-position teammates and shoot a durable target. Its public-API scenarios cover both orientations, require crossing beyond the line's end, and verify that every holding unit stayed put. `tests/test_unit_crowd_navigation.gd` also checks deterministic replay and pursuit around a dry-map cliff. The narrated rendered walkthrough shows the detour before the standard 10-versus-10 battle, which retains normal health and combat rules.

### Rifle attack cycle and presentation

Rifle damage lands instantly at the damage point, independently of the cosmetic tracer. A move command before that point cancels the shot; after it, movement cancels the recovery animation while the weapon cooldown continues. The period measures the complete interval between shots, including wind-up. Fractional tick remainders carry between cycles rather than adding a wind-up or rounding delay to every shot. Surge advances the attack clock at 1.5×, affecting both wind-up and recovery without letting move commands bypass cooldown. Armor subtracts from a hit with a 0.5 minimum.

The reference catalog uses a 0.8608 period, 0.05 damage point and 0.75 recovery for its rifle. RobOS converts these timing values by 1.4 to match faster playback seconds; its existing 2.5× world-distance scale remains separate. Sources: [exported game weapon data](https://github.com/Ahli/sc2xml/blob/master/mods/liberty.sc2mod/base.sc2data/gamedata/weapondata.xml), [Blizzard's fixed-loop and game-speed documentation](https://github.com/Blizzard/s2client-proto/blob/master/docs/protocol.md#game-speed). The fixture retains fixed attack timing; it adds no random attack jitter.

Rifle visuals use a soft directional barrel-tip flash, warm ground glow, a moving tracer capped at 0.28 world units, and small impact sparks. Four preallocated MultiMesh batches hold these cosmetics; three shared lights illuminate firing groups with shadows disabled. Firing allocates no new scene nodes, meshes or materials. The render variants warm before Fight becomes available, avoiding first-shot shader compilation during combat. Paused captures retain effects; reset clears them. Hold Shift to show squad order lines in the arena. The renderer interpolates positions between the deterministic simulation ticks so a 60 Hz display does not show the uneven stepping of a 64 Hz simulation. None of these visual effects decides whether a shot hits.

`tests/test_rifle_attack.gd` checks shot intervals with and without Surge, instant six-damage hits, cancellation before firing, movement during recovery and minimum damage. `tests/test_rifle_fx.gd` checks the bounded effect pool, expiry/reset and movement interpolation. Run the latter with a rendered Godot instance. The walkthrough first measures a whole fight **without recording**, enforcing a frame p95 below 33.34 ms, a maximum below 100 ms and at least 0.9 game seconds per wall second; its JSON keeps those measurements separate from capture overhead. Close heavy background test runs before interactive play.

### Battle results

Army elimination automatically opens a results screen. **Overview** compares deployed and surviving armies, losses, kills, survival and kill/loss ratios, supply, crystal/aether values lost and destroyed, resource trades, remaining HP/shields, damage and average DPS. A damage timeline plots each side's effective DPS in fixed one-second buckets (the final partial bucket uses its actual duration). Individual MVPs rank by kills, then effective damage; lowlights identify the lowest-damage unit on each side.

**Weapons & Micro** separates HP and shield damage, direct and splash damage, overkill, enemy armor prevention, HP healing, shield regeneration, shots, attack starts, canceled wind-ups and recoveries, first-shot and peak-DPS timing, Surge uses/HP costs, displacement, and sampled movement/attack-state time summed across units. The hitscan model has no aiming-accuracy roll, so the screen does not invent an accuracy percentage. Damage means actual health/shields removed; overkill is recorded separately.

**Unit Breakdown** retains every starting unit, including casualties. Select a row for its complete record: health, shields, lifetime, kills, effective damage, shots and mean shot interval, DPS over its own lifetime, costs and value destroyed, movement, timing and micro counters. **Unit Type Efficiency** groups deployed/lost units, kills, damage and starting value, with kills and damage per 100 resources. Resource trade ratios weight crystal and aether equally; zero-loss ratios display "No losses".

**Esc / View battlefield** closes the results, **R / Results** reopens them, and **F9 / Reset armies** clears the report and restores the fixture. **Save full JSON report** writes the deterministic snapshot under `~/.config/robos/rts/battle-results/` and displays the saved path. The same report is available at `observation.match.results`; it includes scenario, seed, ticks, duration, winner, outcome reason, side totals, retained unit records, timeline and metric definitions. No wall-clock measurements affect deterministic replay.

`RTSBattleStats.gd` records battle-only events without retaining all simulation ticks. `tests/test_battle_stats.gd` uses a hand-calculated fixture to verify HP/shield damage, armor prevention, overkill, splash, casualty value, frozen results, reset and regeneration. The battle E2E reconciles damage, kills, costs and the timeline and repeats the same report after reset. The rendered walkthrough verifies automatic display, all tabs, export, close/reopen and reset through real input.

## Frontier Hunters

This mode focuses on a Meridian Guard mirror match on a **256×256** map. Two distinct starting sites are selected randomly from the map's eight perimeter bases. Each commander starts with one Colony Hub, **12 Pioneers**, 50 crystal and no aether or army. Workers immediately gather. Crystal fields and aether vents are **inexhaustible**. Winding waterways divide the outer bases and interior expansion sites, with land crossings connecting the battlefield. Pathfinding, building placement, the 3D view and the minimap share this terrain.

![Frontier Hunters: the full 256×256 battlefield with waterways, crossings and expansion resources]({{ '/assets/images/robos-rts/34-frontier-hunters-map.png' | relative_url }}){: .robos-zoomable-img }

**Win by destroying every opposing structure**, including expansions and unfinished construction, or by accepting the opponent's surrender. Losing a main base or all workers alone does not end the match. The terminal result freezes the simulation and rejects further commands. Supply is capped at 200. Construction and training use the unit registry's full durations; accelerated play advances the same simulation faster.

The AI harvests, builds supply and production, trains workers and armies, then attacks and searches for remaining structures. Economy saves for a second base; Siege builds gas extraction and a Workshop for Howitzers. Difficulty changes decision frequency, worker targets and production capacity. All difficulties use paid engine commands with identical starting resources, costs and combat statistics.

The bot API starts a replayable match with `POST /match {"seed":42,"difficulty":"hard","strategy":"rush"}`. Omit the seed for a fresh random assignment. `POST /match {"action":"surrender","player":1}` concedes. Observations include match status, winner, reason, seed and starting-site assignments. Existing mechanics scenarios remain available by slug; `starfall-canyon` loads the older three-faction showcase.

### Accelerated build-order tests

```bash
cd games/robos-rts
python run_cucumber_tests.py --backend --name="Frontier|Build orders|unattended|Destroying|Surrender|Illegal|Seeded"
```

`tests/e2e/features/engine/03_frontier_hunters.feature` plays Rush, Siege and Economy builds against different AI difficulties through the public observation/action/step API. The player controller starts with the same opening as a person and pays for every building and unit. Tests advance four game seconds per request, with a bounded game-time budget; reaching the budget is a failure, never an invented victory. JSON progression traces and final observations are written under `tests/e2e/reports/`.

Additional checks cover deterministic seeded replay, selection of every start site, an unattended human defeat, surrender/restart, invalid production and building placement, and a base-race fixture proving that an unfinished expansion keeps its owner alive even after the main base falls.

### Live gameplay and frame performance tests

```bash
cd games/robos-rts
python run_cucumber_tests.py --realtime-headless --speed=8
python run_cucumber_tests.py --realtime --speed=8 --record
python run_cucumber_tests.py --realtime --tags=@performance
```

The live suite uses the map editor to modify, save and reload each map, then starts a paused F5 playtest and checks the standard opening. A player-side controller builds Rush, Siege or Economy through paid commands against the built-in opponent. Only the live frame clock advances time: the live SDK rejects `/step`, and the engine reports a counter proving no manual step requests occurred. Matches must reach an actual structure-elimination result, including the unattended-player defeat case. The deterministic suite remains useful for smaller mechanics fixtures.

`--record` needs ffmpeg and a rendered game; `--show-window` displays the test window on Windows, and `--keep-open` leaves it at the result for manual play through F8. Each run writes its authored map, action log, game-state samples, frame timings and, when rendered, a result screenshot under `tests/e2e/reports/realtime/`. Recording adds a captioned MP4 and WebVTT. Finished artifacts are also archived in `~/.robos/development/walkthroughs/rts-live-<scenario>/`, with timestamped history. The proof records both requested speed and achieved game seconds per wall second.

Real-time simulation retains fixed 64 Hz ticks but yields after an 8 ms frame budget, allowing input and drawing during fast-forward overload. Requested 8× playback can run slower when CPU capacity is exhausted. Static terrain, decoration and unlimited crystal facets are combined in spatial chunks; human units use shared MultiMesh batches. Offscreen units and combat effects are culled conservatively, and effect allocation is capped. Static minimap terrain/resources render once into a cached viewport, while unit markers and camera bounds remain live. Navigation smoothing uses bounded visibility searches, steering reuses each tick's nearby-unit query, target acquisition searches hostile spatial grids, and harvesting uses cached town-hall/extractor links.

The control server buffers incomplete requests and partial responses without sleeping on the frame thread. Capture encoding runs on a worker when `/screenshot` receives `"async":true`; `/capture` reports completion. Live recording uses JPEG frames to avoid PNG encoding stalls, while screenshots can still use PNG. GPU readback remains on the frame thread and is measured separately. `GET /performance` reports frame percentiles, simulation/HUD time, rendering draw counts, navigation/steering totals and readback cost. The responsiveness feature checks that incomplete clients and asynchronous PNG encoding keep the live clock moving without a 100 ms frame stall. `tests/e2e/performance_probe.py --warmup=180 --speed=1` measures normal play after a paid army build. `tests/test_render_batches.gd` verifies constant body batch counts from one to eighty units and prevents geometry accumulating across map reloads within one frame.

### Verified run: October 23, 2026

| Check | Result |
|:---|:---|
| Complete backend suite | 20 scenarios, 128 steps passed |
| Live frame-clock suite, headless rendering | 6 scenarios, 40 steps passed; zero manual step requests |
| Rendered match and responsiveness | 2 scenarios, 13 steps passed |
| Normal-speed paid army, 180-second warm-up | Roughly 80 units; observed 49–60 FPS; final rolling frame p95 26.952 ms, max 72.047 ms |
| Rendered Rush vs Hard Siege, seed 29 | Structure-elimination victory at 259.55 game seconds; requested 8×, achieved 2.58× during recording |

The normal-speed probe used Godot 4.7.2's compatibility renderer on a GTX 1050 Ti at 1920×1080 and passed its p95 ≤33.34 ms and maximum ≤100 ms budgets. Results depend on hardware and workload. The recorded test had a worst frame of 55.773 ms and a maximum per-window p95 of 40.133 ms. Navigation between all starting sites, spatial queries against brute force, editor document round trips and render batching regressions also passed.

<video controls playsinline preload="metadata" poster="/assets/games/rts/frontier-hunters-live.jpg" style="width:100%;height:auto">
  <source src="/assets/games/rts/frontier-hunters-live.mp4" type="video/mp4">
  <track kind="captions" src="/assets/games/rts/frontier-hunters-live.vtt" srclang="en" label="English walkthrough" default>
</video>

*The complete live match, captured at 1080p and 10 FPS with on-screen step narration. These media files are served by the front site at `/assets/games/rts/`; the guide itself lives under `/v1/`.*

Download the [recorded match proof](/assets/games/rts/frontier-hunters-live-proof.json) and [normal-speed frame samples](/assets/games/rts/frontier-hunters-performance.json). The match proof includes paid commands, progression events, the terminal observation and frame measurements from the video run.

## Map editor

Choose **Map editor** from the F8 menu, or run:

```bash
games/robos-rts/map-editor.sh frontier-hunters
```

The editor opens the playable map with terrain, resources, start locations and expansion markers. **Hunters Template** creates a custom copy; **New** starts a blank 256×256 map. Open File and Save As support maps outside the built-in scenario folder. Saves replace the file atomically, and opening another map prompts before discarding unsaved edits.

![The Frontier Hunters map open in the editor with terrain tools, numbered starts, expansion sites and validation]({{ '/assets/images/robos-rts/35-frontier-map-editor.png' | relative_url }}){: .robos-zoomable-img }

| Tool | Use |
|:---|:---|
| Terrain Brush (B) | Paint land, water, cliffs or plateaus with an adjustable brush; right-drag paints land. A full drag is one undo step. |
| Bucket Fill (V), Sample (I) | Fill a connected terrain region, or sample terrain into the brush. |
| Start Location (S), Expansion (A) | Place and move numbered base sites. Skirmishes support two to eight possible starts. |
| Land Crossing (C) | Drag a crossing across a waterway; select and resize its rectangle. |
| Resource and unit tools | Place, move, duplicate and inspect deposits, units and structures. |
| Layer toggles | Show or hide grid, resources, units and start/expansion markers. |
| Ctrl+Z / Ctrl+Y | Undo and redo edits, including whole brush strokes and fills. |
| F5 / F10 | Playtest the current map, then return with the document and undo history intact. |

Validation blocks playtests with invalid starting locations or resources in impassable terrain. The same authored terrain changes navigation and the rendered game. Switching the play mode to **Scenario / Campaign** uses explicit unit placements; **1 Player vs AI** uses random starts and the standard opening. Campaign objectives and future multiplayer metadata are retained during save/reload, including fields the current editor does not interpret. Campaign scripting and network multiplayer execution remain separate engine work.

The terrain brush and bounded bucket-fill cores reuse MIT-licensed code from [Crusade RTS](https://github.com/saman-mb/crusade-rts), with its license and pinned source revision in `games/robos-rts/third_party/crusade/`. Rendering, map persistence and simulation integration remain native to RobOS. The editor authoring tests exercise a mouse stroke, undo/redo, save, playtest, return and validation gates. `tests/test_map_editor_document.gd` verifies preservation of campaign and multiplayer metadata; `tests/test_frontier_navigation.gd` checks routes between every pair of starts.

## The screen

The layout follows RTS convention: resources top-right, minimap bottom-left, the selection in the middle and the command card bottom-right. Everything on screen reads live simulation state. Health bars appear only on selected, damaged or under-construction units.

![A Rifleman selected: portrait, health, damage, range and the command card]({{ '/assets/images/robos-rts/05-unit-panel-rifleman.jpg' | relative_url }}){: .robos-zoomable-img }

*One unit selected. The portrait is rendered from the unit's own 3D model. The panel lists health, damage with damage per second, range, armor and speed, plus the weapon's name and any bonus damage. The command card shows what the unit can do.*

### Selecting units

Drag a box to select a squad. In a mixed selection the gold-bordered type is the active subgroup, which owns the command card; press **Tab** to cycle it. Double click selects every unit of that type on screen. Ctrl+1 to 9 sets a control group and the number recalls it; double press to center the camera.

![Eight units box-selected: six Riflemen, a Breacher and a Howitzer]({{ '/assets/images/robos-rts/06-squad-selection.jpg' | relative_url }}){: .robos-zoomable-img }

![Control group tabs above the selection panel and the idle worker button at the left]({{ '/assets/images/robos-rts/12-control-groups-idle-workers.jpg' | relative_url }}){: .robos-zoomable-img }

*Control group tabs sit above the selection panel. The idle worker button at the left appears only while a Pioneer has nothing to do; **.** selects the next one.*

### Commands, costs and tooltips

Each button on the command card shows its hotkey in the corner. Hover one for the cost in crystal, aether and supply, the build time and a description. Buttons you cannot use yet are dimmed, and the tooltip says why.

![Tooltip for Train Breacher showing cost, stats and description]({{ '/assets/images/robos-rts/08-command-card-tooltip.jpg' | relative_url }}){: .robos-zoomable-img }

### Production

Structures have a five-slot production queue. The first slot shows progress. The structure also shows a progress bar in the world while it is producing.

![Muster Hall with four units queued]({{ '/assets/images/robos-rts/07-production-queue.jpg' | relative_url }}){: .robos-zoomable-img }

When you cannot afford something, or you are at your supply cap, the game says so:

![Supply shown in red at 15 of 15 with the message "Supply blocked"]({{ '/assets/images/robos-rts/14-supply-blocked.jpg' | relative_url }}){: .robos-zoomable-img }

### Building

Select a Pioneer, press the build hotkey and place the structure. The footprint turns green where you can build and red where you cannot, and a click on an invalid spot tells you why. Aether Taps snap to a free aether vent.

![Placement footprint shown in green for a Provision Silo]({{ '/assets/images/robos-rts/09-build-placement.jpg' | relative_url }}){: .robos-zoomable-img }

![Placement footprint in red next to a crystal field, with the message "Too close to a resource"]({{ '/assets/images/robos-rts/10-build-placement-blocked.jpg' | relative_url }}){: .robos-zoomable-img }

![A Provision Silo under construction with a progress bar in the selection panel]({{ '/assets/images/robos-rts/11-construction-in-progress.jpg' | relative_url }}){: .robos-zoomable-img }

### Other views

![The whole canyon at maximum zoom with the minimap showing the camera outline]({{ '/assets/images/robos-rts/03-canyon-overview.jpg' | relative_url }}){: .robos-zoomable-img }

*Zoomed out with the mouse wheel. The white outline on the minimap is the camera. Left click on the minimap jumps there; right click gives orders.*

![The controls overlay opened with F1]({{ '/assets/images/robos-rts/13-controls-overlay.jpg' | relative_url }}){: .robos-zoomable-img }

## Economy

Pioneers gather **crystal** from fields and **aether** through an Aether Tap built on a vent, and carry it back to the nearest main base. Supply comes from main bases and Provision Silos; units and queued units count against it.

![Pioneers mining crystal beside the Colony Hub]({{ '/assets/images/robos-rts/02-gathering-crystal.jpg' | relative_url }}){: .robos-zoomable-img }

![An Aether Tap on a vent beside the Workshop]({{ '/assets/images/robos-rts/22-aether-tap.jpg' | relative_url }}){: .robos-zoomable-img }

## Map

Starfall Canyon has two levels. The Meridian Guard start on a sandstone plateau; the Gnarl Brood and the Aurelian Concord start on the low ground to the east. A single ramp connects them, flanked by cliff walls that ground units cannot cross.

![A squad walking down the ramp from the plateau to the low ground]({{ '/assets/images/robos-rts/04-ramp-descent.jpg' | relative_url }}){: .robos-zoomable-img }

A Provision Silo can be retracted into the ground so units can walk over it, or extended to block the path again:

![An extended Provision Silo blocking a gap between two cliffs]({{ '/assets/images/robos-rts/31-silo-gate-extended.jpg' | relative_url }}){: .robos-zoomable-img }
![The same silo retracted, with a Howitzer driving over it]({{ '/assets/images/robos-rts/32-silo-gate-retracted.jpg' | relative_url }}){: .robos-zoomable-img }

## Factions

The three factions are asymmetric rather than reskins of each other. Costs are crystal, then aether. Damage shows attacks per volley where a weapon fires more than once.

### Meridian Guard

Human colonists. Cheap infantry, armored line troops and artillery. Rifleman and Breacher can use **Surge Injector**, which costs 10 health for 11 seconds of faster movement and fire. A Howitzer can **emplace** to reach range 31 with splash damage, at the price of being unable to move.

![Pioneer, Rifleman, Breacher, Howitzer and an emplaced Howitzer]({{ '/assets/images/robos-rts/15-roster-meridian-guard.jpg' | relative_url }}){: .robos-zoomable-img }

| Unit | Crystal / aether | Supply | Health | Shield | Damage | Range | Role |
|:---|---:|---:|---:|---:|---:|---:|:---|
| Pioneer | 50 | 1 | 45 | 0 | 5 | 1.6 | Builds structures and gathers crystal and aether. Fragile; keep it out of fights. |
| Rifleman | 50 | 1 | 45 | 0 | 6 | 12.5 | Cheap ranged infantry. Surge Injector trades 10 HP for faster movement and fire rate. Strong when kiting melee units. |
| Breacher | 100 / 25 | 2 | 125 | 0 | 10 | 14.5 | Armored line infantry. Breach Charges deal bonus damage to armored targets and slow them. |
| Howitzer (mobile) | 150 / 125 | 3 | 175 | 0 | 15 | 16.5 | Mobile artillery. Emplace it to reach range 31 with splash damage. |
| Howitzer (Emplaced Mode) | 150 / 125 | 3 | 175 | 0 | 40 | 31.0 | Deployed artillery. Range 31 with splash damage, minimum range 5. Cannot move until mobilized. |

| Structure | Crystal / aether | Supply | Health | Shield | Role |
|:---|---:|---:|---:|---:|:---|
| Colony Hub | 400 | +15 | 1500 | 0 | Main base. Trains Pioneers, receives gathered resources and provides 15 supply. |
| Provision Silo | 100 | +8 | 400 | 0 | Provides 8 supply. Extended, it blocks the path; retract it to let units through. |
| Provision Silo (Retracted) | 100 | +8 | 400 | 0 | Provides 8 supply. Retracted into the ground, so units can walk over it. |
| Aether Tap | 75 | - | 500 | 0 | Extracts aether from a vent. Pioneers carry it back to the Colony Hub. |
| Muster Hall | 150 | - | 1000 | 0 | Trains Riflemen and Breachers. Requires a Provision Silo. |
| Workshop | 150 / 100 | - | 1250 | 0 | Builds Howitzers. Requires a Muster Hall. |

![Colony Hub, Muster Hall and Workshop]({{ '/assets/images/robos-rts/18-structures-meridian-guard.jpg' | relative_url }}){: .robos-zoomable-img }

![Provision Silo extended and retracted, and an Aether Tap]({{ '/assets/images/robos-rts/19-structures-silo-and-aether-tap.jpg' | relative_url }}){: .robos-zoomable-img }

### Gnarl Brood

A monster swarm. Fast, cheap units that overwhelm in numbers and are punished by splash damage. They have one main structure, the Brood Nest, which spawns every unit.

![Forager, Skitterling, Bile Crawler and Blight Hurler]({{ '/assets/images/robos-rts/16-roster-gnarl-brood.jpg' | relative_url }}){: .robos-zoomable-img }

| Unit | Crystal / aether | Supply | Health | Shield | Damage | Range | Role |
|:---|---:|---:|---:|---:|---:|---:|:---|
| Forager | 50 | 1 | 40 | 0 | 5 | 1.6 | Worker. Gathers crystal and returns it to the Brood Nest. |
| Skitterling | 25 | 1 | 35 | 0 | 5 | 1.9 | Very fast, cheap melee swarm unit. Dangerous in numbers, weak to splash damage. |
| Bile Crawler | 75 / 25 | 2 | 145 | 0 | 16 | 10.5 | Armored acid spitter with mid range. Good against structures and armored units. |
| Blight Hurler | 100 / 100 | 3 | 120 | 0 | 18 | 15.0 | Lobs corrosive blight that splashes. Bonus damage to structures. |

| Structure | Crystal / aether | Supply | Health | Shield | Role |
|:---|---:|---:|---:|---:|:---|
| Brood Nest | 300 | +15 | 1500 | 0 | Monster main base. Spawns Foragers, Skitterlings, Bile Crawlers and Blight Hurlers. |

![The Brood Nest with its Foragers and crystal fields]({{ '/assets/images/robos-rts/20-brood-base.jpg' | relative_url }}){: .robos-zoomable-img }

### Aurelian Concord

Shielded warriors. Every unit and structure has an Aegis Shield that absorbs damage first and regenerates after a few seconds out of combat; a faint bubble flashes when it takes a hit. Skirmishers can **Phase Step** to teleport 18 range, and the Spire Walker steps over cliff walls.

![Mote, Sunblade, Skirmisher and Spire Walker]({{ '/assets/images/robos-rts/17-roster-aurelian-concord.jpg' | relative_url }}){: .robos-zoomable-img }

| Unit | Crystal / aether | Supply | Health | Shield | Damage | Range | Role |
|:---|---:|---:|---:|---:|---:|---:|:---|
| Mote | 50 | 1 | 20 | 20 | 5 | 1.8 | Worker. Gathers crystal and summons structures that complete on their own. |
| Sunblade | 100 | 2 | 100 | 50 | 16x2 | 2.1 | Shielded melee warrior with twin light blades. Rush closes the gap quickly. |
| Skirmisher | 125 / 50 | 2 | 80 | 80 | 13 | 15.5 | Shielded ranged unit. Phase Step teleports it out of danger or onto high ground. |
| Spire Walker | 300 / 200 | 6 | 200 | 150 | 20x2 | 21.0 | Towering walker with splash prism beams. Strong against light units and can step over cliff walls. |

| Structure | Crystal / aether | Supply | Health | Shield | Role |
|:---|---:|---:|---:|---:|:---|
| Heartstone | 400 | +15 | 1000 | 1000 | Aurelian main base. Summons Motes and provides 15 supply. |
| Resonator | 100 | +8 | 200 | 200 | Provides 8 supply. |
| Waystone | 150 | - | 500 | 500 | Summons Sunblades, Skirmishers and Spire Walkers. |

![The Heartstone, Resonator and Waystone]({{ '/assets/images/robos-rts/21-concord-base.jpg' | relative_url }}){: .robos-zoomable-img }

![Brood Nest beside the Concord structures]({{ '/assets/images/robos-rts/19b-structures-brood-and-concord.jpg' | relative_url }}){: .robos-zoomable-img }

## Combat

Weapons have a wind-up before damage lands and a recovery after it. Moving during the recovery cancels it, which is what makes stutter-step kiting work: the built-in AI does it, and so can a player or a bot.

![Riflemen holding range against a pack of Skitterlings]({{ '/assets/images/robos-rts/26-kiting-approach.jpg' | relative_url }}){: .robos-zoomable-img }
![Riflemen firing while backing away]({{ '/assets/images/robos-rts/27-kiting-volley.jpg' | relative_url }}){: .robos-zoomable-img }

An emplaced Howitzer line at the canyon choke deals splash damage to a wave. The dark discs are scorch marks left where units died; they fade after a while.

![Three emplaced Howitzers with Rifleman spotters]({{ '/assets/images/robos-rts/23-howitzer-line-emplaced.jpg' | relative_url }}){: .robos-zoomable-img }
![A splash shell leaving a Howitzer]({{ '/assets/images/robos-rts/24-howitzer-splash-volley.jpg' | relative_url }}){: .robos-zoomable-img }
![The same position after the wave has been destroyed]({{ '/assets/images/robos-rts/25-howitzer-aftermath.jpg' | relative_url }}){: .robos-zoomable-img }

Aurelian Skirmishers keep their shields up by teleporting out when a shield breaks, and a Spire Walker can walk straight across the cliff wall:

![Skirmishers and a Spire Walker advance toward a Brood pack]({{ '/assets/images/robos-rts/28-concord-advance.jpg' | relative_url }}){: .robos-zoomable-img }
![A Skirmisher mid Phase Step]({{ '/assets/images/robos-rts/29-phase-step-burst.jpg' | relative_url }}){: .robos-zoomable-img }
![A Spire Walker firing across a cliff wall it has just walked over]({{ '/assets/images/robos-rts/30-spire-walker-cliff-walk.jpg' | relative_url }}){: .robos-zoomable-img }

When something of yours is hit, the minimap pings and the game says so; **Space** jumps the camera there.

![A three-way battle with all three built-in AIs enabled]({{ '/assets/images/robos-rts/33-three-way-battle.jpg' | relative_url }}){: .robos-zoomable-img }

## Controls

| Input | Action |
|:---|:---|
| Left click or drag | Select; drag for a box |
| Double click | Select all your units or structures of that type across the map |
| Right click | Move, attack, gather, or set a rally point |
| Shift | Queue orders; add to or remove from the selection |
| Mouse wheel, middle drag | Zoom, pan |
| Arrow keys | Pan |
| Letter in a button's corner | Use that command |
| Ctrl + 1 to 9, 1 to 9 | Set, recall a control group |
| Tab | Cycle the active unit type |
| **.** | Select the next idle worker |
| Space | Jump to the last attack alert, or home |
| Esc | Cancel placement or targeting |
| F1 | Controls overlay |
| F8 | Match menu: settings, new game, surrender and map editor |
| F2 | Switch the viewed faction in showcase scenarios |
| F5, F6, F7 | Toggle the faction AIs in showcase scenarios |

## Scripting and bots

The game runs an HTTP/JSON server (port 18095, or `RTS_WEB_SERVICE_PORT`). The Cucumber tests and external bots use the same endpoints, and the Python SDK `robos_rts_bot_sdk.py` wraps them:

| Endpoint | Purpose |
|:---|:---|
| `GET /health`, `POST /observation` | Status; full observation of units, resources and players |
| `POST /action` | Issue a command to unit tags, or to every unit of a type and owner |
| `POST /step`, `POST /pause` | Advance ticks; pause real-time play (`/step` still works) |
| `POST /playback`, `GET /performance` | Control live speed/pause without stepping; inspect frame timings |
| `POST /scenario` | Load a scenario by slug (`default` for the main map) or an inline definition |
| `POST /directive` | Turn a built-in AI mode on or off for a player |
| `POST /select`, `POST /camera`, `POST /ui` | Selection, camera and HUD state |
| `POST /input` | Inject mouse and key events through the real input handlers |
| `POST /screenshot`, `GET /capture` | Save a frame; optionally encode asynchronously and poll completion |

```python
from robos_rts_bot_sdk import RTSClient

c = RTSClient("127.0.0.1", 18095)
c.load_scenario_slug("stutter-step-micro")
c.step(120)
riflemen = [u["tag"] for u in c.get_observation()["units"] if u["unit_type"] == "rifleman"]
c.command("attack_move", tags=riflemen, x=70.0, y=40.0)
```

Scenarios are JSON-LD files in `games/robos-rts/scenarios`. Besides units, resources and map obstacles, a scenario can set `paused` and `decor`; the two roster scenarios use both.

## Tests

`python run_balance_tests.py --suite controls --suite economy --jobs=1` checks class selection, camera speed, mixed production, held-key timing and construction Stop/resume contracts. `python tests/e2e/player_controls_walkthrough.py` verifies the rendered controls with native input in isolated fixtures and archives a narrated screenshot walkthrough to `~/.robos/development/walkthroughs/rts-player-controls/`.

`games/robos-rts/tests/e2e/features/engine` covers combat mechanics, paid skirmish builds and map authoring. `features/realtime` plays editor-authored matches on the live clock and checks frame responsiveness during control traffic and capture. Full build orders take longer than isolated mechanics fixtures.

## Regenerating these screenshots

Every image on this page is a frame from the game itself. `games/robos-rts/capture_screenshots.py` starts the game under Xvfb, drives it through `/input`, `/ui` and `/step`, and writes the JPEGs:

```bash
games/robos-rts/capture_screenshots.py --only 05,06
```

It needs `xvfb-run`, Godot 4.3 and Pillow.
