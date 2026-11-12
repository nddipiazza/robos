---
title: "RobOS RTS"
layout: default
parent: Projects
permalink: /projects/robos-rts/
nav_order: 4
description: "Play the Ashfall Signal campaign or skirmish across three maps and three factions. Learn Starfall Command's controls, tech paths, map editor and test tools."
---

# RobOS RTS: Starfall Command
{: .no_toc }

Starfall Command is a Godot 4.3 real-time strategy game. Play the **Ashfall Signal** single-player campaign or skirmish against the AI on Frontier Hunters, Iron Narrows, or Glassline Basin. Pick Meridian Guard, Gnarl Brood, or Aurelian Concord independently for either side in skirmish. The deterministic simulation runs at 64 ticks per second and supports interactive play, scripted bots, and headless tests.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

![Starfall Command title screen with Skirmish, Scenarios, Map Editor and Settings](/assets/blog/starfall-command-100-point-roadmap/title-screen.webp){: .robos-zoomable-img }

## Run it

Starfall Command opens on a title screen. Choose **Campaign** for Ashfall Signal, **Skirmish** for 1 vs. AI, **Scenarios** for practice and showcases, or **Map Editor** to create a battlefield. **Settings** contains sound, overhead health bars, mouse edge scrolling and a choice of Standard or Grid command hotkeys. Grid uses **QWERT**, **ASDFG**, **ZXCVB**, and **UHJKL** when the card needs a fourth row. Hotkeys named below use the Standard layout. Navigate with the mouse or the arrow keys and **Enter**. **Esc** returns from a setup page.

The official soundtrack is [*Bloodlines* by Pathless Land](https://pathlessland.bandcamp.com/album/bloodlines-2), used with permission from [Mattowarrior](https://www.youtube.com/user/Mattowarrior777). The full album plays in order across the title screen and matches and turns down during dialogue. **Music volume** in Settings controls the soundtrack separately from sound effects. **Master volume** controls both.

During a battle, **F8 → Main menu** pauses the match. **Resume Match** restores the battlefield, camera, and control groups. The editor also has a **Main Menu** button and keeps its current draft while the game is open.

Press **Alt+Enter** or **Shift+F11** to switch between fullscreen and your previous window mode. The title screen’s **Settings** menu and the **F8** pause menu both have a **Toggle fullscreen** button.

Use `-- --skip-title` to open the default battlefield directly or `-- --scenario=<slug>` to launch a scenario.

From a source checkout, use Godot 4.3 or newer. On Linux or macOS, set `GODOT_BIN` if `godot4` or `godot` is absent from `PATH`.

```bash
games/robos-rts/play.sh
```

On Windows, open `games/robos-rts/project.godot` in Godot and press **F5** to launch the project. You can also launch directly from the repository root in PowerShell.

```powershell
& "C:\path\to\Godot_v4.3-stable_win64.exe" --path .\games\robos-rts
```

In **Skirmish**, pick a map, both factions, and a difficulty. AI profiles include Rush, Balanced, Economy and Siege. Playback runs from 1× to 8×. **F8** opens match options during play, and **F1** opens the controls overlay. If you want the current roadmap mechanics in a packaged build, compare its source revision with [the roadmap build](https://github.com/nddipiazza/robos/commit/801e889558100575837d4288052720e08d508bf7).

## Ashfall Signal campaign

1. **Cut the Signal.** Start on the southeast road and follow it through the lower junction, town square and detention convoy to the relay headquarters at the top of the map. Keep Captain Vale alive and destroy the headquarters. Two groups of survivors join you along the route. Target all six propaganda statues to complete the optional objective.
2. **The White Ridge Job.** Gather resources, train an army and attack the Directorate excavation. A Muster Hall with a completed Research Module can train Triage Specialists. Resource caches and the besieged militia outpost offer help along the way. Destroy the dig site's Hub, Hall and Workshop to expose the artifact, then send a soldier to collect it.
3. **Hold for Dawn.** Defend two bridges and cover the river against airborne Gnarl Brood. The rescue transport enters when the 20:00 evacuation clock reaches zero and must reach the landing pad. As optional objectives, rescue three militia squads and bring both field artifacts back to the Colony Hub. The HUD shows the evacuation clock and objectives over the battlefield. Watch your approaches to spot incoming waves.
4. **The Last Road.** Take two Torchguards and two Triage Specialists west to Bracken. Claim the settlement, then escort its trucks north to the colony ships until at least 50 colonists reach safety. Garrison the roadside bunkers and keep infantry with each convoy. If a truck is destroyed, protect the survivors on foot. Hard and Brutal fail at 20 colonist losses. Three guarded Brood samples lie off the convoy route.

The three battlefields measure 132×153, 140×152 and 168×161 Starfall world units. The first two maps use walkable terrain outlines to keep squads on the roads, plazas and paths between them. The defense map puts the outpost on the southeast plateau with two diagonal river crossings.

| Mission | Player roster |
| --- | --- |
| Cut the Signal | Captain Vale and Riflemen. Reinforcements join as you clear the road. |
| The White Ridge Job | Pioneers, Riflemen and Triage Specialists. Build Colony Hubs, Provision Silos, Aether Taps and Muster Halls. Attach a Research Module to train Triage Specialists. |
| Hold for Dawn | Adds Field Bunkers, Sentry Turrets and the Field Armory. Bunkers shelter up to four infantry. The Field Armory researches level-one infantry weapons and armor. |
| The Last Road | Adds Torchguards at Muster Halls with a Research Module, and Fabrication Modules for parallel Rifleman production. The settlement's Contract Post can call up to three squads of four Roadwardens for 250 Crystal per squad. |

Player research unlocks in **Hold for Dawn** on Normal, Hard and Brutal. The Research Module in **The White Ridge Job** unlocks Triage Specialist training. The prebuilt Field Armory offers **+1 Infantry Weapons** and **+1 Infantry Armor** for 100 Crystal and 100 Aether each. Each takes **2:40 on the mission clock**. Both take **5:20** in one Armory queue. Ground troops can pick up Crystal and Aether caches just beyond either bridge to fund early research.

Choose a difficulty in **Campaign** before launching. **Restart Mission**, **Retry Mission**, and **Replay Mission** open a difficulty picker with the current setting selected. **Next Mission** carries that setting forward.

Starting in **The White Ridge Job**, select a completed Muster Hall and press **L** to lift off. Right-click to fly, then press **L** again and click a clear landing site. Production pauses during flight and resumes after landing.

| Difficulty | What changes |
| --- | --- |
| Casual | Enemies have half health. Raids are smaller, and Hold for Dawn uses ground waves with no Field Armory or Sentry Turret. |
| Normal | Standard defenders, raids and evacuation waves. |
| Hard | Extra road and cache guards, earlier attacks, and Brood incursions inside the perimeter. The White Ridge Directorate gets +1 weapons, +1 armor and stronger healing on Hard and Brutal. |
| Brutal | Heavier garrisons and raids, enemy focus fire on medics, and earlier air attacks. Hold for Dawn also spawns a destructible reinforcement tunnel. |

Cyan markers show the current objective and gold markers show bonus objectives within current vision. The mission panel lists objectives even while their locations are hidden. **Space** or **Esc** skips a cutscene. The campaign saves completed missions locally and unlocks the next mission on victory. **F8** opens pause settings, restart and the main menu. **Resume Mission** returns to the active attempt during the same game session.

### Hold for Dawn rescue guide

The militia calls come at the same point on the evacuation clock on every difficulty.

| Time remaining | Distress call |
| --- | --- |
| 17:30 | Northeast road, beyond the right bridge |
| 14:00 | Lowland ruins north of the river |
| 9:00 | Western road beyond the west crossing |

Each distress call gives its squad three game minutes of cover. The Brood can kill the militia once that cover runs out. Friendly ground troops can recruit any survivors on contact, and a soldier already at the beacon can recruit the squad as soon as it appears. The new recruits move toward your nearest rescuer and get six game seconds of cover to withdraw.

Keep Riflemen in both starting bunkers, leave idle Pioneers nearby for Auto-Repair, and build extra Sentry Turrets to cover the river and landing pad. Use **P**, then click the terrain to patrol, and send two Riflemen per bridge to scout the crossings. Take Triage Specialists with the rescue expeditions. The later rescue sites have heavier escorts on Hard and Brutal. Waves get closer together in the final minutes, and on Brutal a destructible tunnel opens with 3:45 remaining. Hold for Dawn runs at 1× on Casual and Normal, 1.2× on Hard, and 1.4× on Brutal. Those speeds affect wall-clock time while the evacuation clock and distress milestones use game time.

#### Full mission playthrough

Watch the opening build, the bridge patrols, all three rescues, and the Rampart touchdown.

{% include starfall-hold-for-dawn-video.html %}

The [mission write-up]({{ '/blog/starfall-command-hold-for-dawn/#watch-hold-for-dawn' | relative_url }}) covers the design of the rescue objectives and the final defense.

## Skirmish maps

The lobby preview shows terrain, candidate starts, expansions, crossings and special features before launch. Filter the map pool by size, start count, default deposit rule and terrain features. Set finite or unlimited deposits independently of a map’s default. A same-seed rematch preserves map, factions, start assignments and the deposit rule.

| Map | Size | Candidate starts | Default deposits | Terrain |
|:---|---:|---:|:---|:---|
| Frontier Hunters | 256 × 256 | 8 | Unlimited | Waterways, land crossings and interior expansions |
| Iron Narrows | 128 × 96 | 2 | Finite | Two open crossings with brush and watch stations, plus a crossing sealed by a Shale Barrier |
| Glassline Basin | 160 × 112 | 2 | Finite | Two lanes around a central bluff, four expansions, brush, two watch stations and two Shale Barriers |

### Frontier Hunters

Frontier Hunters is a **256×256** map with two distinct starts drawn from eight perimeter bases. Each commander begins with their faction's main base, **12 workers**, 50 crystal and no aether or army. Workers immediately gather. Crystal fields and aether vents are inexhaustible by default. Winding waterways divide the outer bases and interior expansion sites, with land crossings connecting the battlefield. Pathfinding, building placement, the 3D view and the minimap share this terrain.

![Frontier Hunters: the full 256×256 battlefield with waterways, crossings and expansion resources]({{ '/assets/images/robos-rts/34-frontier-hunters-map.png' | relative_url }}){: .robos-zoomable-img }

**Win by destroying every opposing structure**, including expansions and unfinished construction, or by accepting the opponent's surrender. Losing a main base or all workers alone does not end the match. The terminal result freezes the simulation and rejects further commands. Supply is capped at 200. Construction and training use the unit registry's full durations; accelerated play advances the same simulation faster.

Click a visible deposit to inspect its remaining reserves. When your workers empty a finite field or vent, the HUD reports the depletion. Hover over supply to see deployed and reserved supply, free capacity and capacity under construction. Selecting several producers shows each building's queue count and active job progress on its portrait.

Depleted crystal fields disappear and free their footprint. Rich crystal pays seven per load and rich aether pays six. Mark either deposit as rich in the Map Editor’s inspector. Hover the crystal or aether counter to see deliveries over the last 60 game seconds.

Select workers, press **Alt+H**, then click a friendly extractor to fill up to three gas slots. Workers assigned to an extractor under construction wait for it to finish. When a base is lost, workers look for a reachable surviving drop-off and its crystal line. Select a headquarters to see its automatic worker rally.

### Skirmish factions

Pick **Your faction** and **AI faction** independently on the skirmish setup screen. Both default to Meridian Guard. **Random** chooses a faction from the match seed, and a same-seed rematch preserves the factions and starting sites. The results screen lists both resolved factions.

| Faction | Main base | Supply | Aether |
|:---|:---|:---|:---|
| Meridian Guard | Colony Hub | Provision Silo | Aether Tap |
| Gnarl Brood | Brood Nest | Brood Pod | Spore Tap |
| Aurelian Concord | Heartstone | Resonator | Aether Prism |

**Gnarl Brood.** Foragers grow into structures, freeing their supply slot as construction begins. Cancel unfinished Forager construction to recover the worker and 75% of the paid cost. In skirmish, each completed Brood Nest begins with three brood slots. A paid unit consumes one slot and hatches alongside other active jobs. One natural slot regenerates every 12 seconds, up to three. A Brood Keeper can add bonus slots, up to five total. **Y** sets the army rally. **G** or right-clicking a usable deposit sets the Forager rally.

**Aurelian Concord.** Motes can leave after starting a summon. With a Mote selected, press **B**, then **G** to place a Waystone in a friendly power field. A completed Resonator provides an 18-unit field, and an anchored Lumen Carrier provides a temporary 12-unit field. Select a power source or a Waystone to inspect coverage. A Waystone pauses its paid queue when it loses all coverage and resumes when power returns.

### Scouting and fog of war

With fog enabled, a unit on low ground needs a friendly spotter or a recon sweep to see uphill. Units on high ground share their sight with the rest of the army. Select a completed Colony Hub, press **E** and click the battlefield or minimap to reveal an area for 10 seconds. The Hub starts with 50 energy, regenerates 0.75 energy per second and can store 200.

Skirmishers use **C** to toggle Phase Cloak. Activation costs 25 energy and sustaining it costs four energy per second. Skitterlings use **B** to burrow or surface. Ordinary sight shows the terrain but leaves cloaked and burrowed enemies hidden. A Sentry Turret, Spore Watch, powered Aegis Relay, Veilseeker or active recon sweep can reveal them where you have sight. Select a detector to inspect its radius.

Black terrain is unexplored. Dim terrain has been explored, and lit terrain is within friendly sight. Send a Pioneer ahead to find the opposing base or check an expansion. Enemy troops disappear when they leave sight, and combat outside your vision produces no new visible effects or world sounds. A building you previously saw leaves a **Last seen** footprint and a minimap marker until you scout the site again. A unit that loses sight of its focus-fire target moves to the last known position and attacks enemies it spots on the way.

Each side shares sight across its own units and structures. Sight uses a four-unit grid and accounts for elevation on maps with high ground. Skirmishes enable fog by default. Scenario authors can set `"fog_of_war": true` to opt in.

Brush cover is walkable. It conceals biological combat units from enemy sight until an enemy comes within six world units or exposes them with detection. Workers and vehicles remain visible under normal sight rules.

The two open Iron Narrows crossings each have a watch station. Keep a ground unit inside the four-unit ring to reveal 32 world units around the station. The station goes neutral when the ring is empty or contested. Scenario authors can place stations in the map's `watch_stations` list with `x` and `y` coordinates.

Right-click a Shale Barrier with combat units selected to break it. Its minimap marker disappears and ground units can cross. Scenario authors can place barriers with the map's `route_blockers` list.

Train a **Triage Specialist** from a Muster Hall with **E**. Auto-Heal starts enabled. Right-click **Treat Wounds** to toggle it. The button glows when enabled, and the Specialist spends energy on the highest-cost wounded biological ally in range while idle, holding position or attack-moving. Right-click a wounded ally to follow and treat them directly. Once a Waystone is complete, a Mote can press **B** twice to summon an **Aegis Relay** in a power field. The Relay restores nearby allied shields, including during combat, and stops when unpowered. Both spend one energy per point restored and show their remaining energy when selected.

Train a **Kestrel Interceptor** at an Airframe Hangar with **A**. It flies over cliffs, water and ground units and fires at aircraft. **E** switches between air-only Interceptor Mode and ground-only Assault Mode after a 1.5-second transition. Landing requires clear ground. Riflemen, Sentry Turrets, Bile Crawlers and Skirmishers can hit both domains. The selected weapon panel lists valid targets, and aircraft appear as diamonds on the minimap.

For automation, call `get_observation(player=1)` for that player's sight, or pass player `0` for the full observer view used in test assertions. The player view includes the visibility grid and last-seen buildings. It omits hidden units, the opponent's start assignment and economy, and private orders. Map geometry and candidate start locations remain public. The local control server also exposes the observer view for diagnostics.

The AI scouts candidate starts with a worker, intercepts visible raids with a limited defensive group, and keeps mining and producing. It reroutes armies around blocked crossings. On Hard it can split a paid wave between two visible objectives with viable routes and regroup after a target falls. It buys counters to observed aircraft and detected stealth through normal production. All difficulties use the same starting resources, prices and combat statistics. Difficulty changes decision frequency, worker targets and production capacity.

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

`--record` needs FFmpeg and a rendered game. On Windows, use `--realtime --speed=2 --record-window` with an FFmpeg build that includes `gfxcapture` for continuous 720p30 video. It records the isolated game window while the simulation runs. `--show-window` brings the test window on-screen, and `--keep-open` leaves it at the result for manual play through F8. Each run writes its authored map, action log, game-state samples, frame timings and, when rendered, a result screenshot under `tests/e2e/reports/realtime/`. Recording adds an MP4 and WebVTT captions. Finished artifacts are also archived in `~/.robos/development/walkthroughs/rts-live-<scenario>/`, with timestamped history. The proof records both requested speed and achieved game seconds per wall second.

Real-time simulation retains fixed 64 Hz ticks but yields after an 8 ms frame budget, allowing input and drawing during fast-forward overload. Requested 8× playback can run slower when CPU capacity is exhausted. Static terrain, decoration and unlimited crystal facets are combined in spatial chunks; human units use shared MultiMesh batches. Offscreen units and combat effects are culled conservatively, and effect allocation is capped. Static minimap terrain/resources render once into a cached viewport, while unit markers and camera bounds remain live. Navigation smoothing uses bounded visibility searches, steering reuses each tick's nearby-unit query, target acquisition searches hostile spatial grids, and harvesting uses cached town-hall/extractor links.

The control server buffers incomplete requests and partial responses without sleeping on the frame thread. Capture encoding runs on a worker when `/screenshot` receives `"async":true`, and `/capture` reports completion. The `--record` workflow samples JPEG screenshots, which still require GPU readback on the frame thread. `--record-window` records continuously in a separate FFmpeg process. `GET /performance` reports frame percentiles, simulation/HUD time, rendering draw counts, navigation/steering totals and readback cost. The responsiveness feature checks that incomplete clients and asynchronous PNG encoding keep the live clock moving without a 100 ms frame stall. `tests/e2e/performance_probe.py --warmup=180 --speed=1` measures normal play after a paid army build. `tests/test_render_batches.gd` verifies constant body batch counts from one to eighty units and prevents geometry accumulating across map reloads within one frame.

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

*The complete live match, captured at 1080p and 10 FPS with on-screen step narration. These media files are served by the front site at `/assets/games/rts/`; the guide itself lives under `/`.*

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
| Terrain Brush (B) | Paint land, water, cliffs, plateaus or brush cover. Right-drag paints land. A full drag is one undo step. |
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

Selected friendly weapons show readiness, wind-up and cooldown. A visible splash attack marks the target area with a shrinking orange arc before impact. Breachers favor armored targets and Blight Hurlers favor structures when they can hit them. A direct attack order chooses the target explicitly.

### Selecting units

Drag a box to select a squad. In a mixed selection the gold-bordered type is the active subgroup, which owns the command card; press **Tab** to cycle it. Double click selects every unit of that type on screen.

The slots **1–9, then 0** above the selection panel save your own living units and structures. Hover a slot for instructions; its gold border indicates that its members match the current selection. Use the keyboard or the same modifiers while clicking a slot:

| Controls | Result |
|:---|:---|
| Ctrl + number / Ctrl + click | Replace the group with the current selection. An empty selection clears it. Command also works on macOS. |
| Ctrl + Shift + number / Ctrl + Shift + click | Add the selected units to the group without duplicates. |
| Alt + number / Alt + click | Replace this group with the selected units and remove those units from every other group. |
| Alt + Shift + number / Alt + Shift + click | Add selected units here and remove those incoming units from every other group. |
| Number / click | Recall the group, replacing the selection. An empty group preserves the selection. |
| Shift + number / Shift + click | Add the group to the current selection. |
| Double tap a number / double click a slot | Recall and center the camera on the first surviving member. |

Destroyed units are removed from groups. Groups reset when a new scenario loads or the viewed faction changes. F1 also lists the shortcuts.

To split a scouting or flanking squad from an army on **1**, select that squad and press **Alt+2**. The squad stays selected and moves to **2**; recalling **1** leaves it behind. Use **Alt+Shift+2** to join an existing flanking group. With an empty or enemy-only selection, either Alt shortcut leaves saved squads intact. Ordinary Ctrl assignment still permits overlapping groups.

Control-group regression checks run through the same input handlers as play:

```bash
cd games/robos-rts
godot --headless --path . --script res://tests/test_control_groups.gd
python run_cucumber_tests.py --backend --tags=@control_groups
python run_cucumber_tests.py --human --tags=@control_groups
RTS_MODE=human python -m behave tests/e2e/features/ui
```

The direct checks cover all slots, box selection, structures, ownership, destroyed members, clearing, exclusive squad moves, key repeat, player/scenario resets and the audio listener's player. Cucumber checks use mouse selection and keyboard input through the public API; the rendered HUD feature verifies modifier clicks, squad splitting into slot 0, additive recall and double-click camera focus, and saves `tests/e2e/reports/control-groups.png`.

![Eight units box-selected: six Riflemen, a Breacher and a Howitzer]({{ '/assets/images/robos-rts/06-squad-selection.jpg' | relative_url }}){: .robos-zoomable-img }

![Control group tabs above the selection panel and the idle worker button at the left]({{ '/assets/images/robos-rts/12-control-groups-idle-workers.jpg' | relative_url }}){: .robos-zoomable-img }

*Control group slots sit above the selection panel. The idle worker button at the left appears only while a Pioneer has nothing to do; **.** selects the next one.*

### Commands, costs and tooltips

Each button on the command card shows its hotkey in the corner. Hover one for the cost in crystal, aether and supply, the build time and a description. Buttons you cannot use yet are dimmed, and the tooltip says why.

![Tooltip for Train Breacher showing cost, stats and description]({{ '/assets/images/robos-rts/08-command-card-tooltip.jpg' | relative_url }}){: .robos-zoomable-img }

### Production

Producers have a five-slot queue. Active jobs show progress in the queue and above the building. Most producers work through one job at a time. A Fabrication Module opens a second line for eligible light infantry, and skirmish Brood Nests hatch multiple paid jobs using brood slots.

Tap a training hotkey to queue one unit. Hold it to keep queuing one at a time after a short delay. Hold **Shift** when clicking a training button or pressing its hotkey to order up to five units at once. Orders fill the shortest queues across eligible selected buildings as resources, supply and queue space allow.

Training orders pay crystal and aether when queued. Each unit claims supply when its production starts. A job at the front waits for free capacity and plays a “Supply required” alert. Right-click a unit in the production panel to cancel its slot and refund its costs. Canceling a job that has started also releases its supply.

With a worker-producing building selected, right-click a visible crystal field or your completed Aether Tap to rally new workers straight to gathering. The teal rally flag marks a resource target. Rally to open ground to move new workers there instead.

Right-click a friendly mobile unit to follow it. With a production building selected, the same click rallies new units to follow that unit as it moves. If the target dies, future units move to the original rally point. Hold **Shift** when setting a rally to append up to eight waypoints. A follow or gather target can end the route.

At a finished Workshop, press **W** for weapons research or **G** for armor research. Each of the three levels adds one damage per hit or one armor to Meridian Guard combat units, including units already in the field. Research costs crystal and aether, shares the Workshop queue with Howitzers, and can be cancelled for a refund while queued or in progress.

![Muster Hall with four units queued]({{ '/assets/images/robos-rts/07-production-queue.jpg' | relative_url }}){: .robos-zoomable-img }

When you cannot afford something, or you are at your supply cap, the game says so:

![Supply shown in red at 15 of 15 with the message "Supply blocked"]({{ '/assets/images/robos-rts/14-supply-blocked.jpg' | relative_url }}){: .robos-zoomable-img }

### Building

Select a worker and press **B** for Basic or **V** for Advanced when available (**Z** and **X** in Grid). Choose a structure and left-click a valid footprint. The preview turns green where you can build and red where you cannot. Extractors snap to a free aether vent. Press **Esc** or right-click to cancel placement. Press **Esc** again or click Back to return to worker orders.

Hold **Shift** while placing to queue more copies, then release it to exit placement. With a group selected, each unqueued placement assigns the nearest available worker. **Shift + right-click** a deposit to queue harvesting after construction.

| Worker | How construction works |
| --- | --- |
| Pioneer | Stays with the foundation. Press **T** to halt, then right-click the foundation with another Pioneer to resume. Select the foundation and press **X** to recover 75% of the cost. |
| Forager | Each placement consumes one Forager once the morph begins. Select an unfinished morph and press **Esc** to recover the Forager and 75% of the cost. |
| Mote | A single Mote can start several summons in sequence. Each structure progresses independently after the Mote moves on. |

| Worker | Structure | Standard | Grid |
| --- | --- | --- | --- |
| Pioneer | Colony Hub | B → C | Z → Q |
| Pioneer | Aether Tap | B → R | Z → W |
| Pioneer | Provision Silo | B → S | Z → E |
| Pioneer | Muster Hall | B → B | Z → A |
| Pioneer | Field Armory (campaign) | B → E | Z → S |
| Pioneer | Field Bunker (campaign) | B → U | Z → Z |
| Pioneer | Sentry Turret | B → T | Z → X |
| Pioneer | Workshop | V → F | X → A |
| Pioneer | Airframe Hangar | V → S | X → Z |
| Forager | Brood Nest | B → H | Z → Q |
| Forager | Spore Tap | B → E | Z → W |
| Forager | Brood Pod | B → P | Z → R |
| Forager | Growth Node | B → C | Z → T |
| Forager | Spore Watch | B → A | Z → X |
| Forager | Blight Spire | V → S | X → E |
| Forager | Tunnel Mouth | V → N | X → A |
| Mote | Heartstone | B → N | Z → Q |
| Mote | Aether Prism | B → A | Z → W |
| Mote | Resonator | B → E | Z → E |
| Mote | Waystone | B → G | Z → A |
| Mote | Aegis Relay | B → B | Z → C |

A completed Muster Hall unlocks the Pioneer's Advanced page. A completed Brood Nest unlocks the Forager's Advanced page. The Aegis Relay requires a completed Waystone.

Pioneers start with **Auto-Repair** enabled and repair nearby friendly mechanical units and buildings while idle. Right-click the **Repair** button to toggle it. To issue a repair order directly, right-click the target or press **R** and select it. Both methods spend crystal in proportion to the health restored.

With a Muster Hall finished, select a Pioneer and press **B**, then **T** to build a Sentry Turret. It costs 125 crystal, fires automatically on visible targets, and can be repaired like other mechanical structures.

![Placement footprint shown in green for a Provision Silo]({{ '/assets/images/robos-rts/09-build-placement.jpg' | relative_url }}){: .robos-zoomable-img }

![Placement footprint in red next to a crystal field, with the message "Too close to a resource"]({{ '/assets/images/robos-rts/10-build-placement-blocked.jpg' | relative_url }}){: .robos-zoomable-img }

![A Provision Silo under construction with a progress bar in the selection panel]({{ '/assets/images/robos-rts/11-construction-in-progress.jpg' | relative_url }}){: .robos-zoomable-img }

### Other views

The **F8** menu saves your overhead health-bar preference. Choose selected or damaged units, always show, or off. The selection panel still shows health and shields, and construction and production still show progress.

![The whole canyon at maximum zoom with the minimap showing the camera outline]({{ '/assets/images/robos-rts/03-canyon-overview.jpg' | relative_url }}){: .robos-zoomable-img }

*Zoomed out with the mouse wheel. The white outline on the minimap is the camera. Left click on the minimap jumps there; right click gives orders.*

![The controls overlay opened with F1]({{ '/assets/images/robos-rts/13-controls-overlay.jpg' | relative_url }}){: .robos-zoomable-img }

## Economy

Workers gather **crystal** from fields and **aether** through their faction’s extractor on a vent. They deliver each load to a reachable main base. Main bases, faction supply structures and Brood Drift Sacs provide capacity. Units in training or transit still count against supply.

During an active crystal harvest order, workers pass through mobile units on the outbound and delivery legs. Buildings, deposits and terrain still constrain their routes, and workers remain targetable. Each patch serves one miner at a time, so automatic assignments and group gather orders fill open local patches first. A teal load marks returning crystal carriers. Stop or move a worker to restore normal body blocking.

The numbers over each friendly base and Aether Tap show assigned workers against a target of two per nearby crystal patch or three per tap. The count turns gold when oversaturated. Press **C** to deliver a carried load to the nearest completed base, or right-click a friendly base to choose the drop-off. A worker already gathering resumes that assignment after delivery.

With a Colony Hub selected, press **D** and click a completed friendly Provision Silo to spend 50 Hub energy on eight additional supply. Each Silo can receive one reinforcement. Select a completed Silo and press **V** to salvage it after five seconds for 75% of its cost. Damage or a second press cancels salvage.

![Pioneers mining crystal beside the Colony Hub]({{ '/assets/images/robos-rts/02-gathering-crystal.jpg' | relative_url }}){: .robos-zoomable-img }

![An Aether Tap on a vent beside the Workshop]({{ '/assets/images/robos-rts/22-aether-tap.jpg' | relative_url }}){: .robos-zoomable-img }

## Map

Ground units route around structures, crystal fields, geysers, cliffs and other impassable terrain. A move click inside a blocked footprint projects to reachable ground at its edge. If a route changes, units can recover through a usable crossing. Queued commands keep their order as the lead move resolves. On Starfall Canyon, a ramp connects the sandstone plateau to the low ground.

![A squad walking down the ramp from the plateau to the low ground]({{ '/assets/images/robos-rts/04-ramp-descent.jpg' | relative_url }}){: .robos-zoomable-img }

Select a completed Provision Silo and press **R** to lower it. Ground units can walk across it, and it still provides supply. Press **R** again once the footprint is clear to raise it and block the path.

![An extended Provision Silo blocking a gap between two cliffs]({{ '/assets/images/robos-rts/31-silo-gate-extended.jpg' | relative_url }}){: .robos-zoomable-img }
![The same silo retracted, with a Howitzer driving over it]({{ '/assets/images/robos-rts/32-silo-gate-retracted.jpg' | relative_url }}){: .robos-zoomable-img }

## Factions

Click **TECH** on the faction badge to see live prerequisites, production options and research costs. The tables list crystal first and aether second. Damage shows attacks per volley where a weapon fires more than once.

### Meridian Guard

Meridian builds around infantry, artillery and separate air production. The opening chain is **Provision Silo → Muster Hall → Workshop → Airframe Hangar**.

- At a Muster Hall, **C** builds a Fabrication Module for two simultaneous eligible light infantry jobs. **X** builds a Research Module on the same pad. Research **Efficient Surge** with **T** for 100 crystal and 100 aether. It reduces the Rifleman and Breacher’s health cost from 10 to 5 while keeping the 11-second effect. Losing the required attachment pauses an active dependent research job until a compatible module returns.
- **L** lifts a completed Muster Hall or Workshop. While airborne, production pauses and the attachment stays behind. Use **L** again and target a clear landing site. A Hall can reconnect to a compatible detached module.
- **B** queues the per-Hub Operations upgrade once a Muster Hall is complete. It costs 150 crystal and 50 aether. On the upgraded Hub, **M** spends 50 energy to send a Prospector to a visible crystal patch. It brings back double crystal for 45 seconds and uses zero supply.
- A Rampart boards up to six nearby eligible ground troops with **L**. **U** sends it to unload at a clear site. Passengers retain their supply and control groups. A shot-down transport loses its passengers.
- Select Riflemen, Breachers or Triage Specialists and right-click a friendly Field Bunker to send them inside. A badge above the bunker shows how many slots are occupied. Select the bunker to see the garrison portraits, press **L** to load nearby infantry or **U** to unload. Riflemen and Breachers fire their own weapons from cover.
- A Howitzer can emplace for range 31 and splash damage. Mobilize it to move again.

![Rampart Transport with two passengers aboard](/assets/blog/starfall-command-100-point-roadmap/rampart-transport.webp){: .robos-zoomable-img }

![Pioneer, Rifleman, Breacher, Howitzer and an emplaced Howitzer]({{ '/assets/images/robos-rts/15-roster-meridian-guard.jpg' | relative_url }}){: .robos-zoomable-img }

| Unit | Crystal / aether | Supply | Health | Shield | Damage | Range | Role |
|:---|---:|---:|---:|---:|---:|---:|:---|
| Pioneer | 50 | 1 | 45 | 0 | 5 | 1.6 | Builds structures and gathers crystal and aether. Fragile; keep it out of fights. |
| Rifleman | 50 | 1 | 45 | 0 | 6 | 12.5 | Cheap ranged infantry. Surge Injector trades 10 HP for faster movement and fire rate. Strong when kiting melee units. |
| Breacher | 100 / 25 | 2 | 125 | 0 | 10 | 14.5 | Armored line infantry. Breach Charges deal bonus damage to armored targets and slow them. |
| Howitzer (mobile) | 150 / 125 | 3 | 175 | 0 | 15 | 16.5 | Mobile artillery. Emplace it to reach range 31 with splash damage. |
| Howitzer (Emplaced Mode) | 150 / 125 | 3 | 175 | 0 | 40 | 31.0 | Deployed artillery. Minimum range 5. Allies take half the usual splash damage. Cannot move until mobilized. |
| Triage Specialist | 75 / 25 | 2 | 60 | 0 | — | — | Heals friendly biological units using energy. |
| Kestrel Interceptor | 125 / 100 | 3 | 125 | 0 | 20 | 14 | Air-only missiles. Press **E** to land and switch to ground-only autocannons. |
| Rampart Transport | 100 / 100 | 2 | 150 | 0 | — | — | Carries up to six eligible ground troops. |

| Structure | Crystal / aether | Supply | Health | Shield | Role |
|:---|---:|---:|---:|---:|:---|
| Colony Hub | 400 | +15 | 1500 | 0 | Main base. Trains Pioneers, receives gathered resources and provides 15 supply. |
| Provision Silo | 100 | +8 | 400 | 0 | Provides 8 supply. Extended, it blocks the path; retract it to let units through. |
| Provision Silo (Retracted) | 100 | +8 | 400 | 0 | Provides 8 supply. Retracted into the ground, so units can walk over it. |
| Aether Tap | 75 | - | 500 | 0 | Extracts aether from a vent. Pioneers carry it back to the Colony Hub. |
| Muster Hall | 150 | - | 1000 | 0 | Trains Riflemen, Breachers, and Triage Specialists. Requires a Provision Silo. |
| Workshop | 150 / 100 | - | 1250 | 0 | Builds Howitzers and researches weapons and armor. Requires a Muster Hall. |
| Fabrication Module | 50 / 25 | - | 350 | 0 | Adds a second light infantry production line. |
| Research Module | 50 / 50 | - | 350 | 0 | Enables Efficient Surge research at the connected Hall. |
| Airframe Hangar | 150 / 100 | - | 540 | 0 | Trains Kestrels and Ramparts. Requires a Workshop. |
| Sentry Turret | 125 | - | 350 | 0 | Defensive cannon and detector. Requires a Muster Hall. |

![Colony Hub, Muster Hall and Workshop]({{ '/assets/images/robos-rts/18-structures-meridian-guard.jpg' | relative_url }}){: .robos-zoomable-img }

![Provision Silo extended and retracted, and an Aether Tap]({{ '/assets/images/robos-rts/19-structures-silo-and-aether-tap.jpg' | relative_url }}){: .robos-zoomable-img }

### Gnarl Brood

The Brood Nest supplies workers, ground troops and aircraft. Completed Nests spread **living ground**. Skitterlings, Bile Crawlers, Blight Hurlers and Carapace Bulwarks move 30% faster on it. The minimap shows visible coverage. A Forager can grow a **Growth Node** on active friendly living ground to extend it. Exclusive coverage gradually recedes when its last source is lost.

- **Seed Clutch** (**E** on a Brood Keeper) spends 25 energy at a friendly Nest to add two brood slots after 12 seconds, up to five total.
- **B** burrows or surfaces a Skitterling. Underground it has reduced sight, cannot move or attack, and can be revealed by detection. Surfacing requires room.
- A **Blight Spire** unlocks the paid Carapace Bulwark evolution, **Corrosive Miasma** and **Tunnel Mouths**. Evolve a Bile Crawler with **E** for 75 crystal, 50 aether and one additional supply. It takes six seconds and preserves the unit’s health percentage. The Bulwark trades ranged anti-air for armored ground melee.
- **E** on a Blight Hurler spends 50 energy on Corrosive Miasma. A one-second warning precedes eight seconds of slowing and damage to enemy ground troops in the circle.
- Select a completed Tunnel Mouth and press **L** to link it to another completed entrance you own. **S** sends up to six nearby ground troops. One squad can travel at a time. A blocked exit holds the squad until there is room. If the destination falls, the surviving source tries to release the squad locally.

![Purple Brood living ground around a Nest and Growth Node, also visible on the minimap](/assets/blog/starfall-command-100-point-roadmap/brood-growth-node.webp){: .robos-zoomable-img }

![Forager, Skitterling, Bile Crawler and Blight Hurler]({{ '/assets/images/robos-rts/16-roster-gnarl-brood.jpg' | relative_url }}){: .robos-zoomable-img }

| Unit | Crystal / aether | Supply | Health | Shield | Damage | Range | Role |
|:---|---:|---:|---:|---:|---:|---:|:---|
| Forager | 50 | 1 | 40 | 0 | 5 | 1.6 | Worker. Gathers crystal and returns it to the Brood Nest. |
| Skitterling | 25 | 1 | 35 | 0 | 5 | 1.9 | Very fast, cheap melee swarm unit. Dangerous in numbers, weak to splash damage. |
| Bile Crawler | 75 / 25 | 2 | 145 | 0 | 16 | 10.5 | Armored acid spitter with mid range. Good against structures and armored units. |
| Blight Hurler | 100 / 100 | 3 | 120 | 0 | 18 | 15.0 | Lobs corrosive blight that splashes. Bonus damage to structures. |
| Brood Keeper | 125 / 25 | 2 | 145 | 0 | 9 | 8 | Ground and air defense plus Seed Clutch. |
| Carapace Bulwark | 75 / 50 evolution | 3 | 235 | 0 | 24 | 2.2 | Evolved Crawler with bonus melee damage against Armored targets. |
| Drift Sac | 100 | 0 | 115 | 0 | — | — | Unarmed flying scout that adds eight supply while alive. |
| Needlewing | 100 / 100 | 2 | 90 | 0 | 9 | 9 | Fast ground-harassing aircraft. |

| Structure | Crystal / aether | Supply | Health | Shield | Role |
|:---|---:|---:|---:|---:|:---|
| Brood Nest | 300 | +15 | 1500 | 0 | Main base, living-ground source and paid hatchery. |
| Brood Pod | 75 | +8 | 400 | 0 | Ground supply structure. |
| Spore Tap | 50 | - | 500 | 0 | Extracts aether. |
| Spore Watch | 100 | - | 300 | 0 | Reveals concealed enemies within detection range and friendly sight. |
| Growth Node | 60 | - | 220 | 0 | Extends living ground from active friendly coverage. |
| Blight Spire | 200 / 150 | - | 700 | 0 | Unlocks the Bulwark evolution, Miasma and Tunnel Mouths. |
| Tunnel Mouth | 125 / 75 | - | 510 | 0 | One half of a linked troop passage. |

![The Brood Nest with its Foragers and crystal fields]({{ '/assets/images/robos-rts/20-brood-base.jpg' | relative_url }}){: .robos-zoomable-img }

### Aurelian Concord

Concord relies on shields, powered production and timed support. Aegis shields regenerate out of combat. Skirmishers can **Phase Step** up to 18 units, and Spire Walkers cross cliffs.

- **B** on a Heartstone spends 50 energy to boost unit training at a friendly powered producer by 50% for 12 seconds. **R** spends 50 energy on **Defensive Recall**. Mobile allies present at cast that stay in the eight-unit marker for three seconds return through clear exits at that Heartstone.
- Select a Resonator or Waystone to see overlapping fields. Amber marks Waystones that would lose their only active source. A Lumen Carrier can anchor for up to 24 seconds and recharge for 18 seconds afterward.
- Research **Fast Deployment** at a powered Waystone for 150 crystal and 150 aether with **F**. Then use **D** to send the next paid trainee to a visible powered site. A successful landing starts a 20-second cooldown. If the site becomes unavailable, the trainee uses the normal exit and rally.
- A Farsight Wisp scouts for 36 seconds. A Veilseeker supplies mobile detection in a 12-unit radius. A powered Aegis Relay supplies detection and spends energy restoring shields.
- An Aegis Warden spends 50 energy on **Phase Barrier** (**F**) to block ground paths in a three-unit radius for eight seconds. **Lattice Burst** (**T**) spends 75 energy. It gives a one-second warning, then hits friendly and enemy ground and air units with four pulses inside a five-unit radius.
- The **Crownspire** requires a completed Aegis Relay and trains at a powered Waystone. Its lance is strongest against Massive targets. Two cheaper Kestrels defeated one under return fire in the paid counter test.

![Concord power overlay showing Waystones with one, two or zero sources](/assets/blog/starfall-command-100-point-roadmap/concord-power.webp){: .robos-zoomable-img }

![Mote, Sunblade, Skirmisher and Spire Walker]({{ '/assets/images/robos-rts/17-roster-aurelian-concord.jpg' | relative_url }}){: .robos-zoomable-img }

| Unit | Crystal / aether | Supply | Health | Shield | Damage | Range | Role |
|:---|---:|---:|---:|---:|---:|---:|:---|
| Mote | 50 | 1 | 20 | 20 | 5 | 1.8 | Worker. Gathers crystal and summons structures that complete on their own. |
| Sunblade | 100 | 2 | 100 | 50 | 16x2 | 2.1 | Shielded melee warrior with twin light blades. Rush closes the gap quickly. |
| Skirmisher | 125 / 50 | 2 | 80 | 80 | 13 | 15.5 | Shielded ranged unit. Phase Step teleports it out of danger or onto high ground. |
| Spire Walker | 300 / 200 | 6 | 200 | 150 | 20x2 | 21.0 | Towering walker with splash prism beams. Strong against light units and can step over cliff walls. |
| Lumen Carrier | 150 / 75 | 3 | 120 | 80 | — | — | Anchors to provide a temporary power field. |
| Farsight Wisp | 45 | 1 | 22 | 0 | — | — | Disposable flying scout with ordinary sight. |
| Veilseeker | 100 / 75 | 2 | 65 | 55 | — | — | Ground detector. |
| Aegis Warden | 100 / 75 | 2 | 55 | 75 | — | — | Casts Phase Barrier and Lattice Burst. |
| Crownspire | 400 / 300 | 8 | 240 | 120 | 18 | 18 | Heavy flyer with 62 bonus damage against Massive units. |

| Structure | Crystal / aether | Supply | Health | Shield | Role |
|:---|---:|---:|---:|---:|:---|
| Heartstone | 400 | +15 | 1000 | 1000 | Aurelian main base. Summons Motes and provides 15 supply. |
| Resonator | 100 | +8 | 200 | 200 | Provides 8 supply. |
| Waystone | 150 | - | 500 | 500 | Powered combat and support production, plus Fast Deployment research. |
| Aether Prism | 75 | - | 250 | 250 | Extracts aether. |
| Aegis Relay | 100 | - | 150 | 150 | Powered detector and shield support. Unlocks the Crownspire. |

![The Heartstone, Resonator and Waystone]({{ '/assets/images/robos-rts/21-concord-base.jpg' | relative_url }}){: .robos-zoomable-img }

![Brood Nest beside the Concord structures]({{ '/assets/images/robos-rts/19b-structures-brood-and-concord.jpg' | relative_url }}){: .robos-zoomable-img }

## Combat

Press **K** to toggle Hold Fire on armed combat units and finished Sentry Turrets. Explicit targeting still works. To deliberately attack a friendly unit or structure, press **A** and **Alt-click** the target. Friendly losses do not count as enemy kills.

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

[100-point Starfall Command roadmap](/projects/starfall-sc2-roadmap/)

| Input | Action |
|:---|:---|
| Left click or drag | Select; drag for a box |
| Ctrl / Shift + click a selected portrait | Keep only that unit type / remove that unit from the selection |
| Double click | Select all of that type on screen |
| Right click | Move, attack, gather, or set a rally point |
| Shift | Queue orders; add to or remove from the selection |
| Mouse wheel, middle drag | Zoom, pan |
| Arrow keys or screen edge | Pan. Mouse edge scrolling is available in Settings. |
| Hold Alt | Temporarily show overhead health bars. |
| Pause / F12 | Pause or resume the battle. |
| Home / Page Up / Page Down | Center on the selection or change zoom. |
| Alt + G, then click | Ping the battlefield or minimap. |
| Alt + R | Toggle selected weapon ranges, including minimum range. |
| Ctrl + Backspace | Remove the last future order while keeping the current job. |
| **,** / Ctrl + **,** | Cycle or select all idle combat production. The HUD button supports the same modifiers. |
| Alt + Y | Reset the rally routes of selected producers. |
| Letter in a button's corner | Use that command |
| Ctrl + number, number (1–9, 0) | Set, recall a control group; Alt moves selected units from other groups |
| Tab / Shift + Tab | Cycle the active subgroup forward or backward. |
| **.** / Ctrl + . | Cycle idle workers or select them all. Ctrl + click on the idle worker button also selects them all. |
| Space | Cycle through the last six attack alerts, or jump home if none exist. Click a red minimap diamond to reopen that alert. |
| Ctrl + F | Track the first selected friendly mobile unit. Pan, jump the camera or press the shortcut again to stop. |
| Esc | Cancel placement or targeting |
| F1 | Controls overlay |
| F8 | Match settings, new game, surrender, map editor and completed match results |
| Ctrl + Enter on the scorecard | Rematch the same AI settings, map seed and start positions with fresh scores |
| O after the match | Enter Observer mode from the scorecard. Press again to cycle full visibility, player vision and AI vision. |
| F2 / Ctrl + F2 | Select all friendly army units. Ctrl + F2 switches the viewed faction in showcase scenarios. |
| Shift + F2 | Select friendly combat units that are outside every control group. |
| Ctrl + click / double click | Select friendly units of the clicked type on screen. Shift adds them to the selection. |
| Ctrl + F3 / F4 / F9 / F11 | Save the current camera position and zoom. Press the same function key alone to return. |
| Backspace | Cycle through completed friendly bases without changing selection or zoom. |
| P, then click terrain | Patrol between the starting point and the clicked point, engaging visible enemies along the way. Stop or give a new order to end the patrol. |
| Shift + Stop / Hold Position | Queue the stationary order after the current orders. |
| M / A / P / Y, then click the minimap | Place a move, attack-move, patrol or rally order without moving the camera. Hold Shift to queue unit orders. |
| F5, F6, F7 | Toggle the faction AIs in showcase scenarios |

Ground movement orders aimed into cliffs, buildings, or deposits end at a reachable edge. Troops route around crystal fields and aether vents. Workers reach the edge of their deposit and can pass through other mobile units during active crystal gathering.

In **Settings**, choose the camera pan speed and when unit order lines appear. Hold **Shift** to place several targeted move, attack, or rally waypoints after one command activation.

The build preview marks blocked tiles in red, valid placements in green, and conflicts with queued footprints in amber. Extractors snap to the vent. A Meridian foundation displays its assigned builder or indicates that it needs a replacement.

## Scripting and bots

The game runs an HTTP/JSON server (port 18095, or `RTS_WEB_SERVICE_PORT`). The Cucumber tests and external bots use the same endpoints, and the Python SDK `robos_rts_bot_sdk.py` wraps them:

| Endpoint | Purpose |
|:---|:---|
| `GET /health`, `POST /observation` | Status; full observation of units, resources and players |
| `POST /action` | Issue a command to unit tags, or to every unit of a type and owner |
| `POST /step`, `POST /pause` | Advance ticks; pause real-time play (`/step` still works) |
| `POST /playback`, `GET /performance` | Control live speed/pause without stepping; inspect frame timings |
| `POST /scenario` | Load a scenario by slug or inline definition. For a campaign slug, set `difficulty` to `casual`, `normal`, `hard`, or `brutal`. |
| `POST /match` | Start or surrender a skirmish, or send `{"action":"rematch"}` after it ends to replay the opening. New games accept `map_id`, `unlimited_resources`, `player_faction`, and `ai_faction`. Faction values are `humans`, `monsters`, `aliens`, or `random`. The finished match contains both sides' scorecard totals. |
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

The [completed 100-point roadmap](/projects/starfall-sc2-roadmap/) records the gameplay and hardening work. At [`801e8895`](https://github.com/nddipiazza/robos/commit/801e889558100575837d4288052720e08d508bf7), 100 rendered gameplay scenarios, two rendered title-screen scenarios, 33 deterministic backend scenarios and ten focused Godot suites passed. All four paid Frontier Hunters build orders reached structure elimination. The focused audio check verified 46 sound effects and 296 voice streams. The October live recording above covers a separate frame-clock run.

From `games/robos-rts`, install Python’s `behave` package and set `GODOT_BIN` to the Godot executable. These shell commands run the three Cucumber layers. In PowerShell, set the same variables with `$env:RTS_MODE = 'human'` and `$env:RTS_TEST_TITLE = '1'` before the relevant Python commands.

```bash
python run_cucumber_tests.py --backend
RTS_MODE=human python -m behave tests/e2e/features/ui
RTS_MODE=human RTS_TEST_TITLE=1 python -m behave tests/e2e/features/startup
```

Use the rendered layer to verify actual hotkeys, clicks and overlays. The backend drives the same engine through the public action and step API. The [roadmap engineering post](/blog/starfall-command-100-point-roadmap/) describes how the fixtures prove the new mechanics.

## Regenerating these screenshots

The title and roadmap screenshots come from the rendered suites above. They save evidence under `tests/e2e/reports/`. For the earlier canyon JPEGs, `games/robos-rts/capture_screenshots.py` starts the game under Xvfb and drives it through `/input`, `/ui` and `/step`.

```bash
games/robos-rts/capture_screenshots.py --only 05,06
```

It needs `xvfb-run`, Godot 4.3 and Pillow.
