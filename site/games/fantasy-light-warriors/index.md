---
layout: game
game_id: fantasy-light-warriors
title: "Fantasy: Light Warriors (WIP)"
permalink: /games/fantasy-light-warriors/
description: "A clean-room 8-bit 4-hero party JRPG in Godot 4 built from a 1,206-node RobOS Knowledge Graph, featuring 2-step NES shop interiors, 7 isolated headless Cucumber suites, and a 12-milestone Act I autonomous AI playthrough."
bg_poster: /assets/elearning/jrpg-kgraph/part2/m7-s3-garland-boss-battle.png
accent: "#38bdf8"
og_image_alt: "Fantasy: Light Warriors (WIP) — Clean-Room 8-Bit Party JRPG in Godot 4"
schema_type: VideoGame
keywords: "Fantasy Light Warriors, RobOS 2D JRPG, 8-bit party RPG, Godot 4 RPG, Coneria, autonomous AI playthrough, Cucumber E2E game testing"
---
<section class="g-hero wrap">
  <p class="kicker">RobOS 2D Party RPG Engine · Godot 4.3 · Work in Progress (Act I)</p>
  <h1 class="g-title">Four Warriors of Light,<br>restore the Crystals.</h1>
  <p class="lead">A clean-room 8-bit 4-hero party JRPG in Godot 4 built from a 1,206-node RobOS Knowledge Graph. All maps, sprites, shop counters, and chiptune tracks in <code>games/fantasy-light-warriors</code> are procedurally generated from semantic data, verified by 7 isolated headless Cucumber suites and a 12-milestone autonomous AI playthrough from Coneria to defeating Garland.</p>
  <div class="cta">
    <a class="btn" href="#play">Play &amp; Run AI Playthrough</a>
    <a class="btn btn-ghost" href="#act-1-milestones">Act I Milestones</a>
    <a class="btn btn-ghost" href="{{ '/elearning/how-to-recreate-classic-jrpg-using-kgraph-parsing-with-automated-playthrough-part-2/' | relative_url }}">Take the Part 2 Course</a>
    <a class="btn btn-ghost" href="{{ '/blog/jrpg-kgraph-parser-and-playthrough-part-2/' | relative_url }}">Read the Part 2 Blog</a>
    <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/fantasy-light-warriors" target="_blank" rel="noopener">Source on GitHub</a>
  </div>
  <span class="scroll">Scroll ↓</span>
</section>
{% include game-kgraph.html %}

<section class="g-sec">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Work-in-Progress Release · Act I Complete</p>
      <h2 class="h2">A 4-hero 8-bit party RPG engineered from a Knowledge Graph</h2>
      <p class="sec-p"><strong>Fantasy: Light Warriors (WIP)</strong> is our second clean-room 8-bit JRPG in <code>games/</code> alongside <a href="{{ '/games/quest-warrior-dragon/' | relative_url }}">Quest: Warrior Dragon</a>. While the full 1,206-node Knowledge Graph (128 enemies, 64 spells, 40 weapons, 40 armors, 70 shops, 61 map grids) is already parsed, the playable Godot 4 release currently covers <strong>Act I: Coneria to the Temple of Fiends</strong> (Milestones <code>01</code> through <code>12</code>) with 100% headless test coverage.</p>
      <div class="grid3">
        <div class="card"><h3>Four Light Warriors</h3><p>Form a 4-hero party from 6 base classes (<code>FIGHTER</code>, <code>THIEF</code>, <code>BLACK BELT</code>, <code>RED MAGE</code>, <code>WHITE MAGE</code>, <code>BLACK MAGE</code>) with authentic 8-bit hit-count scaling, evasion, and Vancian spell charge slots.</p></div>
        <div class="card"><h3>2-Step Shop Interiors</h3><p>Stepping onto a Coneria shop doorway transitions into a dedicated black-background sub-scene with the merchant behind the counter, price list, gold box, and pointing glove cursor (<code>Buy / Exit</code>).</p></div>
        <div class="card"><h3>In-Room vs Out-of-Room Palettes</h3><p>Towns, castles, and dungeons distinguish outer corridor tiles from interior room tiles so treasure chests, throne rooms, and inner sanctums render and trigger accurately.</p></div>
        <div class="card"><h3>7 Isolated Cucumber Suites</h3><p>Before running the full playthrough, 7 isolated Gherkin feature suites verify party creation, map transitions, NPC dialogue, all 6 shop types, dungeon chests, and boss combat in seconds.</p></div>
        <div class="card"><h3>12-Milestone AI Playthrough</h3><p><code>PlayGameBrain.gd</code> plays Act I end-to-end using only real input events over port <code>8090</code>, recording one H.264 MP4 video and JSON checkpoint per milestone in <code>100.9s</code> with <code>0</code> deaths.</p></div>
        <div class="card"><h3>100% Clean-Room Assets</h3><p><code>tools/generate_clean_room_assets.py</code> synthesizes all <code>1024×1024</code> pixel-art maps, class/NPC/enemy sprites, shop counters, and 14 chiptune MP3 tracks directly from JSON data.</p></div>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="act-1-milestones">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Stepped AI Playthrough &amp; Checkpoints</p>
      <h2 class="h2">Act I: All 12 Verified Milestones (Coneria to Garland)</h2>
      <p class="sec-p">Each milestone boots Godot 4 under <code>Xvfb :98</code>, loads the prior milestone's JSON checkpoint over <code>POST /api/v1/command</code>, lets <code>PlayGameBrain.gd</code> drive the party to the objective, and exports a video, screenshot, and save checkpoint.</p>

      <div class="facts">
        <div><b>12 / 12</b><span>Act I Milestones Passed</span></div>
        <div><b>7 / 7</b><span>Isolated Cucumber Suites</span></div>
        <div><b>100.9s</b><span>Total Stepped Run Time</span></div>
        <div><b>0</b><span>Party Deaths</span></div>
      </div>

      <table class="t" style="margin-top:20px">
        <tr><th>#</th><th>Milestone ID</th><th>Map</th><th>Objective</th><th>Duration</th><th>Status</th></tr>
        <tr><td><strong>01</strong></td><td><code>create-light-warriors</code></td><td><code>TitleScreen → Coneria</code></td><td>Confirm 4 Light Warriors &amp; spawn at Coneria <code>(16, 21)</code> with <code>400 G</code></td><td>3.76s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>02</strong></td><td><code>talk-coneria-guard</code></td><td><code>Coneria</code></td><td>Walk to gate guard at <code>(18, 20)</code> and verify directional dialogue</td><td>3.73s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>03</strong></td><td><code>buy-rapier-coneria</code></td><td><code>Coneria Weapon Shop</code></td><td>Enter shop at <code>(11, 10)</code>, buy &amp; equip Rapier and Iron Hammer</td><td>8.62s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>04</strong></td><td><code>buy-chain-mail-coneria</code></td><td><code>Coneria Armor Shop</code></td><td>Enter shop at <code>(6, 10)</code>, buy &amp; equip Chain Mail (<code>+15 DEF</code>)</td><td>4.94s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>05</strong></td><td><code>buy-cure-coneria</code></td><td><code>Coneria White Magic</code></td><td>Enter shop at <code>(7, 4)</code>, teach White Mage <code>CURE</code> &amp; <code>RUSE</code></td><td>5.66s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>06</strong></td><td><code>buy-fire-coneria</code></td><td><code>Coneria Black Magic</code></td><td>Enter shop at <code>(3, 4)</code>, teach Black Mage <code>FIRE</code> &amp; <code>LIT</code></td><td>4.43s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>07</strong></td><td><code>enter-coneria-castle</code></td><td><code>Overworld → Castle 1F</code></td><td>Exit Coneria south and enter Coneria Castle 1F at <code>(12, 35)</code></td><td>22.03s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>08</strong></td><td><code>talk-king-coneria</code></td><td><code>Coneria Castle 2F</code></td><td>Climb stairs to Throne Room <code>(12, 5)</code> and accept the King's quest</td><td>7.88s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>09</strong></td><td><code>march-to-temple-of-fiends</code></td><td><code>Overworld → Temple</code></td><td>March northwest across Overworld, defeat <code>IMP</code>, enter Temple</td><td>13.74s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>10</strong></td><td><code>chest-tof-heal-potion</code></td><td><code>Temple of Fiends</code></td><td>Loot northwest room chests at <code>(3, 3)</code> and <code>(2, 3)</code> (Heal Potion, Cabin)</td><td>10.44s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>11</strong></td><td><code>chest-tof-leather-cap</code></td><td><code>Temple of Fiends</code></td><td>Loot southwest room chest at <code>(2, 32)</code> (Leather Cap)</td><td>9.21s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
        <tr><td><strong>12</strong></td><td><code>defeat-garland-1</code></td><td><code>Temple Inner Sanctum</code></td><td>Open center sanctum door <code>(20, 24)</code>, confront &amp; defeat Garland (<code>106 HP</code>)</td><td>6.46s</td><td><span style="color:#4caf50;font-weight:700">● PASS</span></td></tr>
      </table>

      <div class="shots" style="margin-top:28px">
        <figure class="wide"><img loading="lazy" src="{{ '/assets/elearning/jrpg-kgraph/part2/m8-s3-robos-game-playthrough-viewer.png' | relative_url }}" alt="RobOS Game Playthrough inspecting all 12 completed milestones of Fantasy: Light Warriors"><figcaption>Inspecting all 12 completed Act I milestones, live party telemetry, and recorded video proof in the RobOS Game Playthrough desktop viewer.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/elearning/jrpg-kgraph/part2/m5-s3-party-create-and-port-8090.png' | relative_url }}" alt="Arriving in Coneria with 4 Light Warriors and inspecting port 8090 state"><figcaption>Milestone #1: Arriving in Coneria at (16, 21) with 400 Gold and live JSON telemetry on port 8090.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/elearning/jrpg-kgraph/part2/m6-s1-weapon-shop-welcome.png' | relative_url }}" alt="Coneria Weapon Shop 2-step interior greeting"><figcaption>Milestone #3 (Step 0): Entering the Coneria Weapon Shop interior with the pointing glove cursor on Buy.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/elearning/jrpg-kgraph/part2/m6-s2-weapon-shop-bought-exit.png' | relative_url }}" alt="Coneria Weapon Shop after purchasing Rapier and Hammer"><figcaption>Milestone #3 (Step 1): Purchasing Rapier &amp; Hammer (400 G → 380 G) advances the cursor to Exit.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/elearning/jrpg-kgraph/part2/m7-s3-garland-boss-battle.png' | relative_url }}" alt="Defeating Garland in the Temple of Fiends"><figcaption>Milestone #12: Defeating Garland (106 HP → 0 HP) in the Temple of Fiends inner sanctum.</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="play">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Play &amp; Verify from Source</p>
      <h2 class="h2">Launch the game, run the 7 Cucumber suites, and replay milestones</h2>
      <pre class="code"><button data-copy>Copy</button><code># 1. Regenerate 100% clean-room maps, sprites, shop counters, and chiptune MP3s
python3 games/fantasy-light-warriors/tools/generate_clean_room_assets.py

# 2. Launch Fantasy: Light Warriors (WIP) interactively in Godot 4
godot4 --path games/fantasy-light-warriors

# 3. Run all 7 isolated headless Cucumber E2E suites (under Xvfb :98)
cd games/fantasy-light-warriors && behave tests/e2e/features/

# 4. Run the 12-milestone stepped AI playthrough (records one video + checkpoint per milestone)
python3 games/fantasy-light-warriors/tests/e2e/play_full_game.py --stepped

# 5. Replay a single milestone from its prior save checkpoint (e.g., Milestone #3: Coneria Weapon Shop)
python3 games/fantasy-light-warriors/tests/e2e/play_full_game.py --stepped --only 3

# 6. Open the RobOS Game Playthrough viewer pointed at games/fantasy-light-warriors
npx electron packages/game-playthrough --no-sandbox --game-dir games/fantasy-light-warriors</code></pre>
      <div class="cta" style="justify-content:flex-start;margin-top:18px">
        <a class="btn" href="{{ '/elearning/how-to-recreate-classic-jrpg-using-kgraph-parsing-with-automated-playthrough-part-2/' | relative_url }}">Interactive Part 2 Course →</a>
        <a class="btn btn-ghost" href="{{ '/blog/jrpg-kgraph-parser-and-playthrough-part-2/' | relative_url }}">Part 2 Engineering Blog</a>
        <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/fantasy-light-warriors" target="_blank" rel="noopener">Source on GitHub</a>
      </div>
    </div>
  </div>
</section>
