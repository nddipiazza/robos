---
layout: game
title: "Quest: Warrior Dragon"
permalink: /games/quest-warrior-dragon/
description: "A clean-room NES-authentic 2D JRPG in Godot 4 featuring 29 interconnected maps, 40 monsters, 10 spells, in-engine Stride AI, Cucumber checkpoint E2E tests, and 100% verified global map reachability."
bg_poster: /assets/games/quest-warrior-dragon/05_world_map_alefgard_overworld.png
accent: "#00bcd4"
og_image_alt: "Quest: Warrior Dragon — NES-authentic 2D JRPG in Godot 4"
schema_type: VideoGame
keywords: "Quest Warrior Dragon, RobOS 2D JRPG, Dragon Warrior clean-room RPG, Godot 4 8-bit RPG, Alefgard overworld, autonomous AI playthrough"
---
<section class="g-hero wrap">
  <p class="kicker">RobOS 2D RPG Engine · Godot 4.3</p>
  <h1 class="g-title">Descendant of Erdrick,<br>restore the light.</h1>
  <p class="lead">An NES-authentic 8-bit 2D RPG rebuilt from a declarative Knowledge Graph with 100% clean-room procedural pixel art &amp; chiptune audio, an in-engine autonomous Stride AI, chained Cucumber checkpoint tests, and a headless global pathfinding audit proving every tile, chest, door, shrine, and boss in Alefgard is reachable.</p>
  <div class="cta">
    <a class="btn" href="#play">Play it</a>
    <a class="btn btn-ghost" href="#proof-of-viability">Proof of Viability</a>
    <a class="btn btn-ghost" href="{{ '/games/quest-warrior-dragon/proof-of-viability.html' | relative_url }}">Interactive 20-Slide Tour</a>
    <a class="btn btn-ghost" href="{{ '/games/quest-warrior-dragon/ai-playthrough/' | relative_url }}">AI Playthrough</a>
    <a class="btn btn-ghost" href="{{ '/games/quest-warrior-dragon/docs/' | relative_url }}">Read the docs</a>
  </div>
  <span class="scroll">Scroll ↓</span>
</section>

<section class="g-sec">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">The game</p>
      <h2 class="h2">The 1986 console RPG classic, engineered as verifiable data</h2>
      <p class="sec-p">Every map, staircase, locked door, treasure chest, shop inventory, monster stat block, and spell formula lives in typed JSON registries under <code>data/v1/</code>. The Godot 4 engine renders clean-room procedural tilemaps, executes authentic turn-based battles and dungeon darkness radii, and exposes a live HTTP telemetry &amp; AI control server.</p>
      <div class="grid3">
        <div class="card"><h3>29 Connected Maps</h3><p>Explore the 124×124 Alefgard overworld, 6 towns, Tantegel Castle &amp; Basement, 4-floor Garin's Grave, Mountain Cave, Erdrick's Cave, Swamp Cave, 2 holy shrines, and 8 floors of Charlock Castle.</p></div>
        <div class="card"><h3>In-Engine Stride AI</h3><p><code>AIEngine.gd</code> plays the game strictly via real player inputs (<code>move_up/down/left/right</code>, <code>ui_accept</code>, <code>cmd_menu</code>), holding continuous multi-tile strides across straightaways.</p></div>
        <div class="card"><h3>Player AI vs Enemy AI</h3><p>Launch with <code>--demo</code> to watch the autonomous Hero AI navigate dungeons, unlock doors, manage HP with Herbs &amp; spells, and battle the Enemy AI without human intervention.</p></div>
        <div class="card"><h3>Chained Checkpoints</h3><p>Cucumber BDD scenarios chain JSON save states from New Game (King Lorik) through finding the Magic Key, unlocking the Throne Room door, descending stairs, and exiting to the World Map.</p></div>
        <div class="card"><h3>100% Clean-Room Assets</h3><p>All 29 map backgrounds, 40 monster sprites, character walk sheets, and 28 chiptune MP3 tracks are synthesized procedurally by <code>tools/recreate_clean_room_assets.py</code>.</p></div>
        <div class="card"><h3>Global BFS Audit</h3><p>A headless Godot pathfinding test walks all 15,227 connected <code>(map, col, row)</code> states from <code>ThroneRoom (3,5)</code> to prove 100% reachability of every chest, relic, and boss.</p></div>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="proof-of-viability">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Autonomous Agent Governance &amp; Map Completeness</p>
      <h2 class="h2">Proof of Viability: Global BFS Pathfinding &amp; 20-Slide Tour</h2>
      <p class="sec-p">In a 29-map RPG with multi-floor dungeon loops, locked doors, overworld bridges, and shrine teleporters, a single off-by-one coordinate in a stair registry or an unwalkable bridge tile can silently make an endgame relic impossible to obtain. RobOS eliminates soft-locks with <code>tests/test_map_completeness.gd</code> — a headless multi-map Breadth-First Search (BFS) verifier that starts at New Game (<code>tantegel-castle-2f @ 3,5</code>) and proves every map, stair, door, chest, and quest milestone is reachable.</p>

      <div class="facts">
        <div><b>29 / 29</b><span>Maps Reachable (100%)</span></div>
        <div><b>86 / 86</b><span>Bidirectional Stairs Verified</span></div>
        <div><b>40 / 40</b><span>Treasure Chests Reachable</span></div>
        <div><b>15,227</b><span>Walkable (map, col, row) States</span></div>
      </div>

      <div style="margin-top:32px">
        <figure class="wide" style="margin:0;border:1px solid var(--border);border-radius:10px;overflow:hidden">
          <img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/dw_pathfinding_pipeline.jpg' | relative_url }}" alt="RobOS Quest: Warrior Dragon Multi-Map BFS Pathfinding & Completeness Verification Pipeline" style="width:100%;height:auto;display:block">
          <figcaption style="padding:10px 14px;background:#141f36;font-size:0.85rem;color:#b9b3a4">Architectural schematic of the Quest: Warrior Dragon global pathfinding &amp; map completeness pipeline: Declarative World Graph Registries ➔ Headless Godot 4 BFS Verifier ➔ 100% Reachability Audit &amp; 20-Slide Interactive Showcase.</figcaption>
        </figure>
      </div>

      <h3 style="font-size:1.35rem;margin-top:36px;color:#fff">Verified Quest Relic &amp; Milestone Shortest Paths from New Game Start</h3>
      <table class="t" style="margin-top:12px">
        <tr><th>Milestone / Relic</th><th>Map Key</th><th>Coordinate</th><th>Min BFS Steps</th><th>Shortest Multi-Map Transition Route</th><th>Status</th></tr>
        <tr><td><strong>King Lorik Audience</strong></td><td><code>tantegel-castle-2f</code></td><td><code>(3, 5)</code></td><td>0</td><td><code>tantegel-castle-2f</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Throne Room Magic Key</strong></td><td><code>tantegel-castle-2f</code></td><td><code>(6, 5)</code></td><td>3</td><td><code>tantegel-castle-2f</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Stones of Sunlight</strong></td><td><code>tantegel-castle-b1</code></td><td><code>(5, 6)</code></td><td>58</td><td><code>tantegel-castle-2f → tantegel-castle-1f → tantegel-castle-b1</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Erdrick's Tablet</strong></td><td><code>erdricks-cave-b2</code></td><td><code>(10, 4)</code></td><td>148</td><td><code>tantegel-castle-2f → tantegel-castle-1f → world-map → erdricks-cave-b1 → b2</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Princess Gwaelin Rescue</strong></td><td><code>swamp-cave-b1</code></td><td><code>(6, 20)</code></td><td>172</td><td><code>tantegel-castle-2f → tantegel-castle-1f → world-map → swamp-cave-b1</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Fairy Flute (Kol)</strong></td><td><code>kol-1f</code></td><td><code>(10, 7)</code></td><td>187</td><td><code>tantegel-castle-2f → tantegel-castle-1f → world-map → kol-1f</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Staff of Rain Shrine</strong></td><td><code>northern-cave-b1</code></td><td><code>(4, 5)</code></td><td>202</td><td><code>tantegel-castle-2f → tantegel-castle-1f → world-map → northern-cave-b1</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Fighter's Ring</strong></td><td><code>mountain-cave-b2</code></td><td><code>(3, 3)</code></td><td>220</td><td><code>tantegel-castle-2f → tantegel-castle-1f → world-map → mountain-cave-b1 → b2</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Erdrick's Armor</strong></td><td><code>hauksness-1f</code></td><td><code>(19, 13)</code></td><td>233</td><td><code>tantegel-castle-2f → tantegel-castle-1f → world-map → hauksness-1f</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Silver Harp (Garin's B4)</strong></td><td><code>garinham-b4</code></td><td><code>(6, 1)</code></td><td>265</td><td><code>tantegel-castle-2f → ... → garinham-1f → b1 → b2 → b3 → garinham-b4</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Rainbow Drop Shrine</strong></td><td><code>southern-cave-b1</code></td><td><code>(6, 6)</code></td><td>284</td><td><code>tantegel-castle-2f → ... → swamp-cave-b1 → world-map → southern-cave-b1</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Erdrick's Sword</strong></td><td><code>charlock-castle-b2</code></td><td><code>(6, 6)</code></td><td>470</td><td><code>... → charlock-castle-1f → b1 → b2 → b3 → b2 → b1 → charlock-castle-b2</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>Dragonlord's Altar</strong></td><td><code>charlock-castle-b7</code></td><td><code>(20, 12)</code></td><td>560</td><td><code>... → charlock-castle-1f → b1 → b2 → b3 → b4 → b5 → b6 → charlock-castle-b7</code></td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
      </table>

      <div class="shots" style="margin-top:28px">
        <figure class="wide"><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/20_charlock_b7_dragonlord_battle.png' | relative_url }}" alt="The Dragonlord's true form in battle in Charlock"><figcaption>Slide 20 (560 Min Steps): Confronting the Dragonlord's true form in Charlock after verifying all 29 maps and 40 chests.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/02_throne_room_chests_and_key.png' | relative_url }}" alt="Throne room with TAKE selected at a chest"><figcaption>Slide 2 (3 Steps): Claiming the Magic Key, Torch, and 120 Gold in King Lorik's Throne Room.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/05_world_map_alefgard_overworld.png' | relative_url }}" alt="Alefgard overworld outside Tantegel Castle"><figcaption>Slide 5 (39 Steps): Stepping onto the 124×124 Alefgard overworld outside Tantegel Castle.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/15_hauksness_erdricks_armor.png' | relative_url }}" alt="Ruins of Hauksness"><figcaption>Slide 15 (233 Steps): Navigating the Ruins of Hauksness to claim Erdrick's Armor at (19,13).</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/19_charlock_b2_erdricks_sword.png' | relative_url }}" alt="Charlock B2: Thou dost find the Erdrick's Sword!"><figcaption>Slide 19 (470 Steps): Discovering Erdrick's Sword in Charlock B2 via the B1-B2-B3-B2-B1-B2 stair loop.</figcaption></figure>
      </div>

      <div class="cta" style="justify-content:flex-start;margin-top:24px">
        <a class="btn" href="{{ '/games/quest-warrior-dragon/proof-of-viability.html' | relative_url }}">Open Full 20-Slide Interactive Showcase &amp; Audit Ledger →</a>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="ai-playthrough">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">AI Playthrough</p>
      <h2 class="h2">Reachable is not beatable &mdash; so the engine plays the whole game</h2>
      <p class="sec-p">The BFS audit proves every tile can be reached. The <strong>AI Playthrough</strong> proves the game can be <em>won</em>: <code>PlayGameBrain.gd</code> takes over the controller and plays from King Lorik's throne room to the Dragonlord using only real inputs and the IPC state feed, seeking the next entry of a 70-milestone registry (every chest, every purchase, every quest item, every level gate). A Python driver cuts one video and one save checkpoint per milestone, deadlock watchdogs in the brain and in the driver catch hangs, and a GNOME tray icon with a progress ring plus a live dashboard let you follow a two-hour run at a glance. Every bug it hit so far was a game bug.</p>
      <div class="shots" style="margin-top:22px">
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-live.png' | relative_url }}" alt="Game Playthrough live view after the winning run: 74 / 74 milestones and the closing credits"><figcaption>The live view at the end of the winning run: 74 / 74 milestones, level 21, 2,621 battles, 6 deaths.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-39.png' | relative_url }}" alt="Milestone card #39 Grind + Buy Broad Sword at Rimuldar with its video and checkpoint: broad_sword, 746 gold"><figcaption>Every finished milestone is a card with its own video and the checkpoint saved after it.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m44-swamp-cave-gwaelin.png' | relative_url }}" alt="Swamp Cave: Princess Gwaelin asks to be taken back to her father"><figcaption>Milestone #41: Princess Gwaelin rescued at level 11.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-hurt-spell-skeleton.png' | relative_url }}" alt="Battle spell list with HURT selected against a Druin"><figcaption>From a milestone video: HURT picked from the battle spell list.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m46-rimuldar-broad-sword.png' | relative_url }}" alt="Broad Sword is now equipped, Rimuldar"><figcaption>Milestone #39: 1500 gold for the Broad Sword at Rimuldar.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/tray-menu.png' | relative_url }}" alt="GNOME top bar with the Game Playthrough tray icon and its context menu after the winning run"><figcaption>The tray icon: status, milestones, level, battles, deaths, current objective, stop run, open latest video.</figcaption></figure>
      </div>
      <div class="cta" style="justify-content:flex-start;margin-top:24px">
        <a class="btn" href="{{ '/games/quest-warrior-dragon/ai-playthrough/' | relative_url }}">Read the AI Playthrough docs &amp; see the full screenshot gallery →</a>
        <a class="btn btn-ghost" href="{{ '/blog/' | relative_url }}#ai-playthrough-quest-warrior-dragon">Blog post</a>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="play">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Play &amp; Verify</p>
      <h2 class="h2">Run the game, autonomous Demo AI, and headless pathfinding tests</h2>
      <pre class="code"><button data-copy>Copy</button><code># Launch Quest: Warrior Dragon normally or in Autonomous Demo Mode (Player AI vs Enemy AI)
godot --path games/quest-warrior-dragon
godot --path games/quest-warrior-dragon -- --demo

# Run the Headless Global BFS Map Completeness & Pathfinding Audit (+ generate 20 slideshow screenshots)
python3 games/quest-warrior-dragon/tests/test_map_completeness.py
python3 games/quest-warrior-dragon/tests/test_map_completeness.py --screenshots

# Run the Chained Cucumber Checkpoint E2E Scenarios (Throne Room -> Key -> Door -> Castle 1F -> World Map)
xvfb-run -a behave games/quest-warrior-dragon/tests/e2e/features/king_to_world_map.feature

# Let the robos-jrpg AI play the ENTIRE game as a user would ("play the game" mode: real inputs + IPC state only)
python3 games/quest-warrior-dragon/tests/e2e/play_full_game.py
python3 games/quest-warrior-dragon/tests/e2e/play_full_game.py --stepped   # one video + checkpoint per milestone, tray icon + dashboard</code></pre>
      <p class="sec-p">The BFS audit proves every tile is reachable; the <strong><a href="{{ '/games/quest-warrior-dragon/ai-playthrough/' | relative_url }}">AI full-game playthrough</a></strong> proves the game is beatable. <code>PlayGameBrain.gd</code> takes over the controller and seeks the next entry of an ordered milestone registry (<code>data/v1/milestones.json</code>: every weapon and armor purchase, every treasure chest, each quest, the Dragonlord, the ending) from King Lorik's throne room to the credits &mdash; no teleports, no stat edits. A Python driver watches over the IPC web service, asserts invariants (never standing on water, HP never negative) and writes a JSON report with a video, a save checkpoint and a screenshot per milestone.</p>
      <div class="cta" style="justify-content:flex-start;margin-top:18px">
        <a class="btn" href="{{ '/v1/projects/quest-warrior-dragon/' | relative_url }}">Engine &amp; Architecture Guide</a>
        <a class="btn btn-ghost" href="{{ '/games/quest-warrior-dragon/proof-of-viability.html' | relative_url }}">Interactive 20-Slide Report</a>
        <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/quest-warrior-dragon" target="_blank" rel="noopener">Source on GitHub</a>
      </div>
    </div>
  </div>
</section>
