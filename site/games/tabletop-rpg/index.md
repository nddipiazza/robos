---
layout: game
title: "Tabletop RPG"
permalink: /games/tabletop-rpg/
description: "A HeroQuest-inspired tabletop dungeon crawler featuring Quest 1: Custom Dungeon and Election 2026: Battle for the Hill, autonomous AI verification, fog of war, a talking story, Game Master mode, and the editors to build your own. Built in Godot 4 by RobOS agents."
bg_video: /assets/games/tabletop-bg.mp4
bg_poster: /assets/games/tabletop-bg-poster.jpg
accent: "#e0b252"
---
<section class="g-hero wrap">
  <p class="kicker">RobOS Tabletop RPG</p>
  <h1 class="g-title">Descend. Open the door.<br>Face what waits.</h1>
  <p class="lead">A HeroQuest-inspired dungeon crawler. Lead four heroes through the fully verified custom quest, or sit behind the screen as the Game Master. Then build quests of your own.</p>
  <div class="cta"><a class="btn" href="#play">Play it</a><a class="btn btn-ghost" href="#build">Build a quest</a><a class="btn btn-ghost" href="#proof-of-viability">Proof of Viability</a><a class="btn btn-ghost" href="{{ '/games/tabletop-rpg/docs/' | relative_url }}">Read the docs</a></div>
  <span class="scroll">Scroll ↓</span>
</section>

<section class="g-sec">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">The game</p>
      <h2 class="h2">The classic crawl, rebuilt as data</h2>
      <p class="sec-p">Each campaign is a self-contained <em>cartridge</em>: heroes, monsters, spells, furniture, maps and quests in one file. Doors lift the fog of war, dice decide every blow, and the story talks back.</p>
      <div class="grid3">
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/dice.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Skulls &amp; shields</h3><p>Every blow is a roll of combat dice. Skulls wound, shields block. Heroes roll 2d6 to move.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/door.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Fog of war</h3><p>You start in a lit chamber. Everything else stays hidden until a hero opens the door, monsters and all.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/wizard.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Player &amp; GM modes</h3><p>Lead the heroes, or play Zargon behind the GM screen and command the monsters.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/chat.svg" alt="" width="48" height="48" loading="lazy"></div><h3>A story that talks</h3><p>Characters speak in dialogue bubbles, key moments stop on a message dialog, and every quest opens with an objectives briefing you can reopen from the toolbar.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/gear.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Quests are data</h3><p>Trigger events run a pipeline of actions, like dialogue and messages, so a quest can react to what the heroes do. No engine changes needed.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/map.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Built to be edited</h3><p>A visual quest map editor, a board calibration tool and a cartridge studio ship with the game.</p></div>
      </div>
      <p class="sec-p" style="margin-top:30px">The four heroes. Body is hit points, Mind is mental strength for spells and resisting magic, and Attack and Defend are how many combat dice each hero rolls.</p>
      <table class="t" style="margin-top:12px">
        <tr><th>Hero</th><th>Body</th><th>Mind</th><th>Attack</th><th>Defend</th></tr>
        <tr><td>Barbarian</td><td>8</td><td>2</td><td>3</td><td>2</td></tr>
        <tr><td>Dwarf</td><td>7</td><td>3</td><td>2</td><td>2</td></tr>
        <tr><td>Elf</td><td>6</td><td>4</td><td>2</td><td>2</td></tr>
        <tr><td>Wizard</td><td>4</td><td>6</td><td>1</td><td>2</td></tr>
      </table>
    </div>
  </div>
</section>

<section class="g-sec">
  <div class="wrap">
    <p class="eyebrow">Playable Cartridges</p>
    <h2 class="h2">Featured Quests</h2>
    <div class="panel-g" style="margin-top:24px">
      <table class="t">
        <tr><th>Quest</th><th>Cartridge</th><th>Board</th><th>Monsters &amp; Bosses</th><th>Primary Objectives</th><th>Reward</th><th>Status</th></tr>
        <tr>
          <td><strong>Quest 1: Custom Dungeon</strong></td>
          <td><code>custom-quest.cartridge.json</code></td>
          <td>Classic board, 28×19</td>
          <td>23 monsters &bull; Boss Doomguard</td>
          <td>Slay Boss Doomguard, search ancient chambers for relics, escape through border stairs <code>[-1, 4]</code></td>
          <td>250 gold</td>
          <td><span style="color:#4caf50;font-weight:700">● 100% Verified Playable</span></td>
        </tr>
        <tr>
          <td><strong>Election 2026: Battle for the Hill</strong></td>
          <td><code>election-2026-quest-1.cartridge.json</code></td>
          <td>Capitol Catacombs, 26×19</td>
          <td>17 monsters &bull; 3 Two-Headed Capitol Hydras (<code>Talarixon</code>, <code>Brownsted</code>, <code>El-Rogers</code>)</td>
          <td>Lead the bipartisan hero party through the Capitol catacombs and slay all three two-headed Hydras in the Oval Office, Supreme Court, and Senate Cloakroom</td>
          <td>150 gold</td>
          <td><span style="color:#4caf50;font-weight:700">● 100% Verified Playable</span></td>
        </tr>
      </table>
      <p class="sec-p" style="margin-top:16px"><strong>Quest 1: Custom Dungeon</strong> — Mentor speaks: <em>&ldquo;Venture forth into the dungeon catacombs, vanquish the Dungeon Boss guarding the inner stronghold, explore the chambers for ancient relics, and make it to the exit stairs to escape.&rdquo;</em> Proven mathematically winnable across 296 turns, 21 combat rounds, and 315 audit transactions with zero casualties.</p>
      <p class="sec-p" style="margin-top:10px"><strong>Election 2026: Battle for the Hill</strong> — Mentor George W. Bush warns: <em>&ldquo;Two-headed bipartisan Hydras have seized the Capitol chambers — Talarixon in the Oval Office, Brownsted in the Supreme Court, and El-Rogers in the Senate Cloakroom!&rdquo;</em> Proven mathematically winnable across 266 turns, 15 combat rounds, and 283 audit transactions with 100% survival of all four bipartisan heroes.</p>

      <h3 style="font-family:'Cinzel',serif;font-size:1.15rem;margin-top:24px;color:#fff">Election 2026 Bipartisan Hero Roster</h3>
      <table class="t" style="margin-top:10px">
        <tr><th>Hero</th><th>Archetype</th><th>Body</th><th>Mind</th><th>Attack</th><th>Defend</th><th>Starting Loadout &amp; Spells</th></tr>
        <tr><td><strong>Barack Obama</strong></td><td>Barbarian Vanguard</td><td>10</td><td>3</td><td>4</td><td>2</td><td>Broadsword, Shield, Helmet, 2 Healing Potions</td></tr>
        <tr><td><strong>Donald Trump</strong></td><td>Dwarf Heavy Fighter</td><td>9</td><td>3</td><td>4</td><td>2</td><td>Shortsword, Shield, Helmet, Tool Kit, 2 Healing Potions</td></tr>
        <tr><td><strong>Hillary Clinton</strong></td><td>Woodland Elf Spellblade</td><td>8</td><td>4</td><td>3</td><td>2</td><td>Shortsword, Shield, Helmet, Earth/Water Spells (<em>Sleep, Heal Body, Rock Skin</em>), 2 Healing Potions</td></tr>
        <tr><td><strong>Bernie Sanders</strong></td><td>Elemental Wizard</td><td>6</td><td>6</td><td>1</td><td>2</td><td>Staff, Bracers, Cloak, Fire/Air/Earth Spells (<em>Ball of Flame, Fire of Wrath, Genie, Courage</em>), 2 Healing Potions</td></tr>
      </table>
    </div>
    <div class="shots">
      <figure class="wide"><img loading="lazy" src="{{ '/assets/games/proof-of-viability-election-2026/m19_el_rogers_slain_victory.jpg' | relative_url }}" alt="Hillary Clinton slays the final Hydra El-Rogers in the Senate Cloakroom for Quest Victory"><figcaption>Election 2026 (Step 266): Hillary Clinton slays the 3rd Hydra El-Rogers in the Senate Cloakroom for QUEST_COMPLETE.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability-election-2026/m13_talarixon_slain.jpg' | relative_url }}" alt="Barack Obama slays Talarixon in the Oval Office"><figcaption>Election 2026 (Step 153): Barack Obama slays Talarixon (Texas Hydra) in the Oval Office.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability-election-2026/m15_brownsted_slain.jpg' | relative_url }}" alt="Hillary Clinton slays Brownsted in the Supreme Court Chamber"><figcaption>Election 2026 (Step 196): Hillary Clinton slays Brownsted (Ohio Hydra) in the Supreme Court.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability/m19_reach_exit_complete.jpg' | relative_url }}" alt="Barbarian reaches border exit stairs [-1, 4] for quest victory"><figcaption>Custom Dungeon (Step 296): Barbarian reaches the exit stairs [-1, 4] for quest victory.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability/m08_boss_slain.jpg' | relative_url }}" alt="Dwarf slays Boss Doomguard in inner stronghold"><figcaption>Custom Dungeon (Step 111): Dwarf slays Boss Doomguard in the inner stronghold.</figcaption></figure>
    </div>
  </div>
</section>

<section class="g-sec" id="play">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Play</p>
      <h2 class="h2">Play it on your computer</h2>
      <p class="sec-p">The game runs as a native Godot 4 app, and there is no hosted browser version, so you run it locally. You need <a style="text-decoration:underline" href="https://godotengine.org/download" target="_blank" rel="noopener">Godot 4.3</a> and Git. If <code>godot</code> is already on your path, or lives in <code>~/.local/bin</code> or <code>~/apps</code>, the launcher finds it. Otherwise point <code>GODOT_BIN</code> at it.</p>
      <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos/games/tabletop-rpg
GODOT_BIN=/path/to/godot4 ./play.sh                                      # launch Quest 1: Custom Dungeon
TABLETOP_CARTRIDGE=election-2026-quest-1 ./play.sh --reset               # launch Election 2026: Battle for the Hill
TABLETOP_CARTRIDGE=election-2026-quest-1 ./play.sh --demo --reset        # watch Mentor AI beat Election 2026</code></pre>
      <p class="sec-p" style="margin-top:22px">Launch options and player modes:</p>
      <pre class="code"><button data-copy>Copy</button><code>./play.sh                            # launch Quest 1: Custom Dungeon (default)
./play.sh --demo                     # watch Mentor AI play autonomously
./play.sh --dm                       # play Zargon, the Game Master
./play.sh --hard --reset             # hard mode, fresh campaign save</code></pre>
      <table class="t" style="margin-top:22px">
        <tr><th>Option</th><th>What it does</th></tr>
        <tr><td><code>./play.sh</code></td><td>Launch the verified playable quest (Quest 1: Custom Dungeon).</td></tr>
        <tr><td><code>--demo</code></td><td>Autonomous demo: watch the Mentor AI solve and complete the quest turn-by-turn.</td></tr>
        <tr><td><code>--dm</code></td><td>Play Zargon, the Game Master, and command the monsters behind the screen.</td></tr>
        <tr><td><code>--hard</code></td><td>Hard mode: tougher monster encounters and tighter margins.</td></tr>
        <tr><td><code>--reset</code></td><td>Start a fresh game session instead of resuming save state.</td></tr>
      </table>
      <div class="cta" style="justify-content:flex-start;margin-top:18px"><a class="btn" href="{{ '/v1/projects/tabletop-rpg/' | relative_url }}">Engine guide</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/tabletop-rpg" target="_blank" rel="noopener">Source on GitHub</a></div>
    </div>
  </div>
</section>

<section class="g-sec" id="build">
  <div class="wrap">
    <p class="eyebrow">Build</p>
    <h2 class="h2">Make your own quest</h2>
    <p class="sec-p">Quests are plain cartridge files, and three tools write them. Together they take a board image all the way to a playable quest.</p>
    <div class="grid3">
      <a class="card" href="{{ '/v1/apps/tabletop-blockmap-creator/' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/blockmap.svg" alt="" width="48" height="48" loading="lazy"></div><h3>1. Blockmap Creator</h3><p>Line a grid up with a board image, mark corridors, and outline and name the rooms.</p><span class="go">Open →</span></a>
      <a class="card" href="https://github.com/nddipiazza/robos/tree/main/packages/tabletop-quest-editor" target="_blank" rel="noopener"><div class="ic"><img class="ic-img" src="/assets/icons/map.svg" alt="" width="48" height="48" loading="lazy"></div><h3>2. Quest map editor</h3><p>Place doors, furniture, monsters and start and exit stairs, and wire up dialogue and trigger events. It flags out-of-bounds furniture, doors with no wall and overlapping objects as you work, and you can dictate changes with the voice button.</p><span class="go">Source ↗</span></a>
      <a class="card" href="{{ '/v1/apps/robos-tabletop/' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/tools.svg" alt="" width="48" height="48" loading="lazy"></div><h3>3. Tabletop Studio</h3><p>Edit heroes, monsters, spells and quest briefings, bundle a cartridge, and launch the game as a hero or as the Game Master.</p><span class="go">Open →</span></a>
    </div>
    <pre class="code" style="margin-top:26px"><button data-copy>Copy</button><code># from games/tabletop-rpg
./blockmap-creator.sh                  # calibrate a board image
./quest-editor.sh first-light-dungeon  # lay out and script a quest</code></pre>
  </div>
</section>

<section class="g-sec" id="proof-of-viability">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Autonomous Agent Governance &amp; Game Design</p>
      <h2 class="h2">Proof of Viability: Can the AI beat your map?</h2>
      <p class="sec-p">Designing a dungeon is easy; proving that a custom quest is mathematically winnable, balanced, and free from soft-locks before a human player touches it is grueling. If a secret door is unfindable, an encounter deals fatal damage, or an exit stairway is blocked, players get frustrated.</p>
      <p class="sec-p" style="margin-top:10px">In RobOS, <strong>autonomous AI agents act as synthetic players</strong>. The Mentor AI drives all four heroes turn-by-turn under true fog of war, testing combat balance, secret passage detection, emergency potion use, and extraction navigation. It outputs a 100% verified proof-of-work transaction ledger and turn-by-turn visual evidence.</p>

      <div class="facts">
        <div><b>296</b><span>Autonomous Turns</span></div>
        <div><b>21</b><span>Combat Rounds</span></div>
        <div><b>315</b><span>Discrete Transactions</span></div>
        <div><b>100%</b><span>Hero Survival Rate (0/4 Casualties)</span></div>
      </div>

      <div class="grid3" style="margin-top:34px">
        <div class="card">
          <div class="ic"><img class="ic-img" src="/assets/icons/map.svg" alt="" width="48" height="48" loading="lazy"></div>
          <h3>1. How we make maps</h3>
          <p>We calibrate a board image in <strong>Tabletop Blockmap Creator</strong>, outline rooms and corridors, then place doors, secret passageways, furniture, monsters and border exit stairs in <strong>Tabletop Quest Map Editor</strong>. Heroes are equipped with custom starting loadouts and healing potions.</p>
        </div>
        <div class="card">
          <div class="ic"><img class="ic-img" src="/assets/icons/brain.svg" alt="" width="48" height="48" loading="lazy"></div>
          <h3>2. Determining AI viability</h3>
          <p>The autonomous Mentor AI runs in headless Docker/Xvfb. It enforces a strict decision hierarchy: emergency potion drinking at <code>BP &le; 4</code>, melee targeting, spellcasting (Sleep, Ball of Flame), room/corridor secret door scans, dead-end pruning, and negative border stair navigation.</p>
        </div>
        <div class="card">
          <div class="ic"><img class="ic-img" src="/assets/icons/scroll.svg" alt="" width="48" height="48" loading="lazy"></div>
          <h3>3. How they progressed</h3>
          <p>Every step, movement roll, melee attack, secret detection and door breach is recorded into an immutable 315-transaction audit ledger with turn-by-turn screenshots. The heroes slayed Boss Doomguard, uncovered 2 secret doors, and escaped onto border square <code>[-1, 4]</code>.</p>
        </div>
      </div>

      <div style="margin-top:32px">
        <figure class="wide" style="margin:0;border:1px solid var(--border);border-radius:10px;overflow:hidden">
          <img loading="lazy" src="{{ '/assets/games/proof-of-viability/tabletop_viability_pipeline.jpg' | relative_url }}" alt="Autonomous Quest Testing Pipeline: Stage 1 Map Authoring, Stage 2 Mentor AI Engine, Stage 3 Verification Artifacts" style="width:100%;height:auto;display:block">
          <figcaption style="padding:10px 14px;background:#141f36;font-size:0.85rem;color:#b9b3a4">Architectural schematic of the Tabletop RPG autonomous quest testing pipeline: from authoring tools to headless simulation and proof-of-work artifacts.</figcaption>
        </figure>
      </div>

      <h3 style="font-family:'Cinzel',serif;font-size:1.35rem;margin-top:40px;color:#fff">Turn-by-turn progression walkthrough</h3>
      <p class="sec-p" style="margin-top:8px">The autonomous playthrough of <code>custom-quest.cartridge.json</code> completed in 296 turns across 4 distinct tactical phases:</p>

      <div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px">
        <div class="card" style="padding:20px">
          <h4 style="color:var(--accent);font-size:1rem;margin-bottom:6px">Phase 1: South corridor breach &amp; vanguard (Turns 1–50)</h4>
          <p style="font-size:0.88rem;color:#b9b3a4">The heroes assemble at spiral stairwell <code>[7, 14]</code>, breach Door-1 into corridor y=18, eliminate the Goblin Sentry, and sweep corridor line-of-sight tiles for hidden pit traps.</p>
        </div>
        <div class="card" style="padding:20px">
          <h4 style="color:var(--accent);font-size:1rem;margin-bottom:6px">Phase 2: Stronghold breach &amp; Doomguard slain (Turns 51–114)</h4>
          <p style="font-size:0.88rem;color:#b9b3a4">Elf drops to 4 BP and autonomously consumes a Healing Potion (+2 BP, TX #68). The party breaches Door-2 into Room SE-21, engaging Boss Doomguard. Dwarf lands the killing blow with Shortsword (TX #117).</p>
        </div>
        <div class="card" style="padding:20px">
          <h4 style="color:var(--accent);font-size:1rem;margin-bottom:6px">Phase 3: Secret Door-6 escape &amp; north march (Turns 115–260)</h4>
          <p style="font-size:0.88rem;color:#b9b3a4">Elf searches Room SE-21 and discovers Secret Door-6 (TX #121). The party escapes through the eastern chamber sequence. Wizard and Dwarf consume healing potions, and pathfinding prunes the dead-end center room.</p>
        </div>
        <div class="card" style="padding:20px">
          <h4 style="color:var(--accent);font-size:1rem;margin-bottom:6px">Phase 4: Secret Door-9 &amp; border exit [-1, 4] (Turns 261–296)</h4>
          <p style="font-size:0.88rem;color:#b9b3a4">The party breaches Room NW-4. Elf sweeps and uncovers Secret Door-9 (TX #307). Rogar opens the door, and the Barbarian steps directly onto border stairs <code>[-1, 4]</code>, completing the quest with 250 gold bounty!</p>
        </div>
      </div>

      <div class="shots" style="margin-top:28px">
        <figure class="wide"><img loading="lazy" src="{{ '/assets/games/proof-of-viability/m19_reach_exit_complete.jpg' | relative_url }}" alt="Barbarian steps onto border exit stairs [-1, 4] for quest victory"><figcaption>Step 296 (TX #314–315): Barbarian steps onto negative border coordinate [-1, 4] to achieve QUEST_COMPLETE.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability/m08_boss_slain.jpg' | relative_url }}" alt="Boss Doomguard slain by Dwarf in inner stronghold"><figcaption>Step 111 (TX #117): Boss Doomguard slain in Room SE-21.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability/m09_secret_door6_found.jpg' | relative_url }}" alt="Elf discovers secret door-6 in room SE-21"><figcaption>Step 115 (TX #121): Elf uncovers Secret Door-6 escape route.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability/m05_elf_potion.jpg' | relative_url }}" alt="Elf consumes starting healing potion"><figcaption>Step 64 (TX #68): Elf consumes emergency Healing Potion (+2 BP).</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability/m17_secret_door9_found.jpg' | relative_url }}" alt="Elf discovers secret door-9 in room NW-4"><figcaption>Step 290 (TX #307): Secret Door-9 discovered in Room NW-4.</figcaption></figure>
      </div>

      <h3 style="font-family:'Cinzel',serif;font-size:1.35rem;margin-top:36px;color:#fff">Pivotal ledger turning points</h3>
      <table class="t" style="margin-top:14px">
        <tr><th>TX #</th><th>Step</th><th>Round</th><th>Actor</th><th>Action</th><th>Verification Significance</th></tr>
        <tr><td><b>#68</b></td><td>64</td><td>4</td><td>Elf</td><td><code>USE_ITEM</code></td><td>Emergency healing potion contingency triggered at BP &le; 4 (+2 BP, 6/6 max BP).</td></tr>
        <tr><td><b>#117</b></td><td>111</td><td>7</td><td>Dwarf</td><td><code>ATTACK</code></td><td>Boss Doomguard slain with Shortsword (2 skulls vs 0 shields, target HP: 0).</td></tr>
        <tr><td><b>#121</b></td><td>115</td><td>7</td><td>Elf</td><td><code>SEARCH_SECRETS</code></td><td>Searched Room SE-21; uncovered hidden Door-6 [16, 16] &harr; [17, 16].</td></tr>
        <tr><td><b>#160</b></td><td>152</td><td>9</td><td>Wizard</td><td><code>USE_ITEM</code></td><td>Wizard wounded to 3 BP, drinks starting Healing Potion (+1 BP, 4/4 max BP).</td></tr>
        <tr><td><b>#268</b></td><td>255</td><td>18</td><td>Dwarf</td><td><code>USE_ITEM</code></td><td>Dwarf wounded by Chaos Warriors to 4 BP, drinks Healing Potion (+3 BP, 7/7 max BP).</td></tr>
        <tr><td><b>#307</b></td><td>290</td><td>20</td><td>Elf</td><td><code>SEARCH_SECRETS</code></td><td>Searched Room NW-4; uncovered hidden Door-9 [0, 6] &harr; [1, 6] to outer corridor.</td></tr>
        <tr><td><b>#312</b></td><td>295</td><td>21</td><td>Rogar</td><td><code>DOOR_OPEN</code></td><td>Rogar kicks open Secret Door-9, revealing corridor path to border exit stairs.</td></tr>
        <tr><td><b>#314</b></td><td>296</td><td>21</td><td>Barbarian</td><td><code>REACH_EXIT</code></td><td>Barbarian steps onto [-1, 4] border exit stairs; triggers quest objective completion.</td></tr>
        <tr><td><b>#315</b></td><td>296</td><td>21</td><td>Party</td><td><code>QUEST_COMPLETE</code></td><td>Quest completed with 100% survival rate (0 casualties). 250 gold bounty awarded.</td></tr>
      </table>

      <div class="cta" style="justify-content:flex-start;margin-top:28px">
        <a class="btn" href="{{ '/games/tabletop-rpg/proof-of-viability.html' | relative_url }}">Open Custom Dungeon 315-TX Report &rarr;</a>
        <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/tabletop-rpg/reports/proof_of_viability" target="_blank" rel="noopener">Evidence on GitHub &nearr;</a>
      </div>

      <hr style="border:0;border-top:1px solid var(--border);margin:48px 0">

      <p class="eyebrow" id="proof-of-viability-election-2026">Featured Campaign Proof of Viability</p>
      <h2 class="h2">Election 2026: Battle for the Hill (266 Turns &bull; 3 Hydras Slain)</h2>
      <p class="sec-p">In <code>election-2026-quest-1.cartridge.json</code>, the bipartisan party — <strong>Barack Obama</strong> (Barbarian), <strong>Donald Trump</strong> (Dwarf), <strong>Hillary Clinton</strong> (Elf), and <strong>Bernie Sanders</strong> (Wizard) — must infiltrate the Capitol catacombs, survive multi-tile 2×1 Boss Hydras rolling up to 5 Attack Dice, trigger the Oval Office San Antonio Diesel cutscene, and slay all three two-headed Capitol Hydras (<strong>Talarixon</strong>, <strong>Brownsted</strong>, and <strong>El-Rogers</strong>) with the exit stairway hidden until victory.</p>

      <div class="facts">
        <div><b>266</b><span>Autonomous Turns</span></div>
        <div><b>15</b><span>Combat Rounds</span></div>
        <div><b>283</b><span>Discrete Transactions</span></div>
        <div><b>100%</b><span>Hero Survival Rate (4/4 Alive)</span></div>
      </div>

      <h3 style="font-family:'Cinzel',serif;font-size:1.35rem;margin-top:36px;color:#fff">Turn-by-turn progression walkthrough</h3>
      <p class="sec-p" style="margin-top:8px">The autonomous playthrough of <code>election-2026-quest-1.cartridge.json</code> completed in 266 turns across 4 tactical phases:</p>

      <div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px">
        <div class="card" style="padding:20px">
          <h4 style="color:var(--accent);font-size:1rem;margin-bottom:6px">Phase 1: West Wing breach &amp; Oval Office cutscene (Turns 1–55)</h4>
          <p style="font-size:0.88rem;color:#b9b3a4">The party starts at <code>[0, 13]</code>. Obama, Trump, and Hillary breach Rooms SW-8, NW-9, and SW-11. Hillary casts <em>Sleep</em> on Campaign Volunteer (TX #32), Obama scores first blood (TX #41), and Hillary kicks open the Oval Office door <code>[9, 9] &harr; [8, 9]</code> (TX #50–51), triggering the Talarixon San Antonio Diesel cutscene.</p>
        </div>
        <div class="card" style="padding:20px">
          <h4 style="color:var(--accent);font-size:1rem;margin-bottom:6px">Phase 2: Supreme Court breach &amp; arcane barrage (Turns 56–135)</h4>
          <p style="font-size:0.88rem;color:#b9b3a4">Trump breaches the Supreme Court Chamber <code>room-sw-5</code> (TX #67), revealing Brownsted (Ohio Hydra) and the Super PAC Demon. Bernie Sanders stays in rear line-of-sight, hurling <em>Ball of Flame</em> (TX #96), <em>Fire of Wrath</em> (TX #118), and the 5-dice <em>Genie</em> (TX #138) while Trump slays the Super PAC Demon (TX #130).</p>
        </div>
        <div class="card" style="padding:20px">
          <h4 style="color:var(--accent);font-size:1rem;margin-bottom:6px">Phase 3: Slaying Talarixon &amp; Brownsted (Turns 136–200)</h4>
          <p style="font-size:0.88rem;color:#b9b3a4">In Round 9, Barack Obama slays the 1st Hydra <strong>Talarixon (Texas Hydra)</strong> in the Oval Office with his Broadsword (TX #167). After emergency potion triage (+4 BP, TX #175), Hillary Clinton slays the 2nd Hydra <strong>Brownsted (Ohio Hydra)</strong> in the Supreme Court in Round 11 (TX #211).</p>
        </div>
        <div class="card" style="padding:20px">
          <h4 style="color:var(--accent);font-size:1rem;margin-bottom:6px">Phase 4: Senate Cloakroom &amp; El-Rogers vanquished (Turns 201–266)</h4>
          <p style="font-size:0.88rem;color:#b9b3a4">Obama breaches the Senate Cloakroom <code>room-se-4</code> (TX #221), revealing <strong>El-Rogers (Michigan Hydra)</strong> and the Mummy Lobbyist. Hillary slays the Lobbyist (TX #246), Obama, Trump, and Hillary surround the 2-square Hydra, and Hillary lands the finishing blow on El-Rogers (TX #282–283) for <code>QUEST_COMPLETE</code>!</p>
        </div>
      </div>

      <div class="shots" style="margin-top:28px">
        <figure class="wide"><img loading="lazy" src="{{ '/assets/games/proof-of-viability-election-2026/m19_el_rogers_slain_victory.jpg' | relative_url }}" alt="Hillary Clinton slays El-Rogers in Senate Cloakroom for Quest Complete"><figcaption>Step 266 (TX #282–283): Hillary Clinton slays El-Rogers (Michigan Hydra) in the Senate Cloakroom to trigger QUEST_COMPLETE with 4/4 heroes alive.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability-election-2026/m07_oval_office_breach.jpg' | relative_url }}" alt="Breaching the Oval Office and revealing Talarixon"><figcaption>Step 51 (TX #50–51): Breaching the Oval Office &amp; revealing Talarixon.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability-election-2026/m13_talarixon_slain.jpg' | relative_url }}" alt="Barack Obama slays Talarixon in Oval Office"><figcaption>Step 153 (TX #167): Barack Obama slays 1st Hydra Talarixon.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability-election-2026/m15_brownsted_slain.jpg' | relative_url }}" alt="Hillary Clinton slays Brownsted in Supreme Court"><figcaption>Step 196 (TX #211): Hillary Clinton slays 2nd Hydra Brownsted.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/proof-of-viability-election-2026/m18_final_hydra_assault.jpg' | relative_url }}" alt="Obama, Trump, and Hillary surround El-Rogers in the Senate Cloakroom"><figcaption>Step 261 (TX #276–277): Party surrounds El-Rogers in the Senate Cloakroom.</figcaption></figure>
      </div>

      <div style="margin-top:28px">
        <figure class="wide" style="margin:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#0d131f">
          <iframe src="https://www.youtube-nocookie.com/embed/7HkZARyvqmM" title="RobOS Tabletop RPG — Election 2026: Full 266-Turn Autonomous AI Playthrough" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="width:100%;aspect-ratio:16/9;display:block;border:0;background:#000"></iframe>
          <figcaption style="padding:10px 14px;background:#141f36;font-size:0.85rem;color:#b9b3a4">Full 266-turn autonomous playthrough: Mentor AI leading Barack Obama, Donald Trump, Hillary Clinton, and Bernie Sanders to vanquish all three Capitol Hydras. <a href="https://youtu.be/7HkZARyvqmM" target="_blank" rel="noopener">Watch on YouTube</a> · <a href="{{ '/assets/games/proof-of-viability-election-2026/election-2026-playthrough.webm' | relative_url }}" download>Download WebM</a></figcaption>
        </figure>
      </div>

      <h3 style="font-family:'Cinzel',serif;font-size:1.35rem;margin-top:36px;color:#fff">Election 2026 pivotal ledger turning points</h3>
      <table class="t" style="margin-top:14px">
        <tr><th>TX #</th><th>Step</th><th>Round</th><th>Actor</th><th>Action</th><th>Verification Significance</th></tr>
        <tr><td><b>#50–51</b></td><td>51</td><td>3</td><td>Hillary Clinton</td><td><code>STORY_TRIGGER</code></td><td>Breached Oval Office <code>[9, 9] &harr; [8, 9]</code>; triggered Talarixon &amp; San Antonio Diesel Plot cutscene.</td></tr>
        <tr><td><b>#67</b></td><td>65</td><td>4</td><td>Donald Trump</td><td><code>DOOR_OPEN</code></td><td>Breached Supreme Court Chamber <code>[12, 14] &harr; [12, 13]</code>, revealing Brownsted &amp; Super PAC Demon.</td></tr>
        <tr><td><b>#107</b></td><td>101</td><td>6</td><td>Donald Trump</td><td><code>USE_ITEM</code></td><td>Emergency Healing Potion consumed after Hydra ambush (+4 BP, restored to 8/9 BP).</td></tr>
        <tr><td><b>#130</b></td><td>120</td><td>7</td><td>Donald Trump</td><td><code>ATTACK</code></td><td>Slayed heavily armored Super PAC Demon (2 skulls vs 0 shields, target HP: 0).</td></tr>
        <tr><td><b>#138</b></td><td>128</td><td>7</td><td>Bernie Sanders</td><td><code>SPELL_CAST</code></td><td>Summoned Air spell <em>Genie</em> for 5-dice arcane strike on Brownsted (Ohio Hydra).</td></tr>
        <tr><td><b>#167</b></td><td>153</td><td>9</td><td>Barack Obama</td><td><code>ATTACK</code></td><td><strong>1st Hydra Slain:</strong> Talarixon (Texas Hydra) defeated with Broadsword (2 skulls vs 0 shields).</td></tr>
        <tr><td><b>#211</b></td><td>196</td><td>11</td><td>Hillary Clinton</td><td><code>ATTACK</code></td><td><strong>2nd Hydra Slain:</strong> Brownsted (Ohio Hydra) defeated with Shortsword (3 skulls vs 0 shields).</td></tr>
        <tr><td><b>#221</b></td><td>207</td><td>12</td><td>Barack Obama</td><td><code>DOOR_OPEN</code></td><td>Breached Senate Cloakroom <code>[17, 13] &harr; [17, 14]</code>, revealing final Hydra El-Rogers &amp; Lobbyist.</td></tr>
        <tr><td><b>#282–283</b></td><td>266</td><td>15</td><td>Hillary Clinton</td><td><code>QUEST_COMPLETE</code></td><td><strong>3rd Hydra Slain:</strong> El-Rogers (Michigan Hydra) defeated! Quest won with 4/4 heroes alive &amp; 150 gold bounty.</td></tr>
      </table>

      <div class="cta" style="justify-content:flex-start;margin-top:28px">
        <a class="btn" href="{{ '/games/tabletop-rpg/proof-of-viability-election-2026.html' | relative_url }}">Open Election 2026 283-TX Report &rarr;</a>
        <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/tabletop-rpg/reports/proof_of_viability_election_2026" target="_blank" rel="noopener">Election 2026 Evidence on GitHub &nearr;</a>
      </div>
    </div>
  </div>
</section>
<script src="{{ '/assets/site.js' | relative_url }}" defer></script>
