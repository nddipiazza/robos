---
layout: game
title: "Tabletop RPG"
permalink: /games/tabletop-rpg/
description: "A HeroQuest-inspired tabletop dungeon crawler: five quests, fog of war, a talking story, a Game Master mode and the editors to build your own. Built in Godot 4 by RobOS agents."
bg_video: /assets/games/tabletop-bg.mp4
bg_poster: /assets/games/tabletop-bg-poster.jpg
accent: "#e0b252"
---
<section class="g-hero wrap">
  <p class="kicker">RobOS Tabletop RPG</p>
  <h1 class="g-title">Descend. Open the door.<br>Face what waits.</h1>
  <p class="lead">A HeroQuest-inspired dungeon crawler. Lead four heroes through five quests, or sit behind the screen as the Game Master. Then build quests of your own.</p>
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
        <div class="card"><div class="ic">🎲</div><h3>Skulls &amp; shields</h3><p>Every blow is a roll of combat dice. Skulls wound, shields block. Heroes roll 2d6 to move.</p></div>
        <div class="card"><div class="ic">🚪</div><h3>Fog of war</h3><p>You start in a lit chamber. Everything else stays hidden until a hero opens the door, monsters and all.</p></div>
        <div class="card"><div class="ic">🧙</div><h3>Player &amp; GM modes</h3><p>Lead the heroes, or play Zargon behind the GM screen and command the monsters.</p></div>
        <div class="card"><div class="ic">💬</div><h3>A story that talks</h3><p>Characters speak in dialogue bubbles, key moments stop on a message dialog, and every quest opens with an objectives briefing you can reopen from the toolbar.</p></div>
        <div class="card"><div class="ic">⚙️</div><h3>Quests are data</h3><p>Trigger events run a pipeline of actions, like dialogue and messages, so a quest can react to what the heroes do. No engine changes needed.</p></div>
        <div class="card"><div class="ic">🗺️</div><h3>Built to be edited</h3><p>A visual quest map editor, a board calibration tool and a cartridge studio ship with the game.</p></div>
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
    <p class="eyebrow">Cartridges</p>
    <h2 class="h2">Five quests, ready to play</h2>
    <div class="panel-g" style="margin-top:24px">
      <table class="t">
        <tr><th>#</th><th>Quest</th><th>Board</th><th>Reward</th></tr>
        <tr><td>1</td><td>The Trial</td><td>Fan Dungeon, 28×21</td><td>100 gold</td></tr>
        <tr><td>2</td><td>The Rescue of Sir Ragnar</td><td>Classic board</td><td>200 gold</td></tr>
        <tr><td>3</td><td>Lair of the Orc Warlord</td><td>First Light caverns</td><td>250 gold</td></tr>
        <tr><td>4</td><td>The Fortress of the Fire King</td><td>First Light dungeon, 26×19</td><td>400 gold</td></tr>
        <tr><td>5</td><td>The Crypt Guardian</td><td>First Light dungeon, 26×19</td><td>100 gold</td></tr>
      </table>
      <p class="sec-p" style="margin-top:16px">Quest 5 is the newest and the best place to see dialogue bubbles, the message dialog and the objectives briefing at work: break the dark seal and defeat the Crypt Guardian in his chamber.</p>
    </div>
    <div class="shots">
      <figure class="wide"><img loading="lazy" src="{{ '/assets/games/tabletop-still-intro.jpg' | relative_url }}" alt="Cinematic still from the quest introduction"><figcaption>In-game cinematic: the quest introduction.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/tabletop-still-heist.jpg' | relative_url }}" alt="Cinematic still of a dungeon corridor scene"><figcaption>Cinematic: the corridor, from The Fortress of the Fire King.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/v1/assets/images/tabletop-rpg/heroquest_board.jpg' | relative_url }}" alt="The HeroQuest board, a dungeon of rooms and corridors seen from above"><figcaption>The classic board</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/v1/assets/images/tabletop-rpg/first_light_caverns.jpg' | relative_url }}" alt="The First Light caverns board, a cave network seen from above"><figcaption>First Light caverns (Quest 3)</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/tabletop-still-witch.jpg' | relative_url }}" alt="Cinematic still of a witch's hand raising the undead"><figcaption>Cinematic: the undead rise.</figcaption></figure>
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
GODOT_BIN=/path/to/godot4 ./play.sh          # pick a quest from the menu
./play.sh --demo                              # watch the AI play a demo</code></pre>
      <p class="sec-p" style="margin-top:22px">Skip the menu by naming a quest, and mix in the options below.</p>
      <pre class="code"><button data-copy>Copy</button><code>./play.sh 4                  # The Fortress of the Fire King
./play.sh 5                  # The Crypt Guardian (dialogue and objectives)
./play.sh 2 --dm             # Rescue of Sir Ragnar, as the Game Master
./play.sh 3 --hard --reset   # Orc Warlord on hard mode, fresh save</code></pre>
      <table class="t" style="margin-top:22px">
        <tr><th>Option</th><th>What it does</th></tr>
        <tr><td><code>1</code> to <code>5</code></td><td>Start that quest, skipping the menu.</td></tr>
        <tr><td><code>--dm</code></td><td>Play Zargon, the Game Master, and command the monsters.</td></tr>
        <tr><td><code>--hard</code></td><td>Hard mode.</td></tr>
        <tr><td><code>--reset</code></td><td>Start a new game instead of resuming your save.</td></tr>
        <tr><td><code>--demo</code></td><td>Autonomous demo: the AI plays the turns for you.</td></tr>
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
      <a class="card" href="{{ '/v1/apps/tabletop-blockmap-creator/' | relative_url }}"><div class="ic">📐</div><h3>1. Blockmap Creator</h3><p>Line a grid up with a board image, mark corridors, and outline and name the rooms.</p><span class="go">Open →</span></a>
      <a class="card" href="https://github.com/nddipiazza/robos/tree/main/packages/tabletop-quest-editor" target="_blank" rel="noopener"><div class="ic">🗺️</div><h3>2. Quest map editor</h3><p>Place doors, furniture, monsters and start and exit stairs, and wire up dialogue and trigger events. It flags out-of-bounds furniture, doors with no wall and overlapping objects as you work, and you can dictate changes with the voice button.</p><span class="go">Source ↗</span></a>
      <a class="card" href="{{ '/v1/apps/robos-tabletop/' | relative_url }}"><div class="ic">🛠️</div><h3>3. Tabletop Studio</h3><p>Edit heroes, monsters, spells and quest briefings, bundle a cartridge, and launch the game as a hero or as the Game Master.</p><span class="go">Open →</span></a>
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
          <div class="ic">🗺️</div>
          <h3>1. How we make maps</h3>
          <p>We calibrate a board image in <strong>Tabletop Blockmap Creator</strong>, outline rooms and corridors, then place doors, secret passageways, furniture, monsters and border exit stairs in <strong>Tabletop Quest Map Editor</strong>. Heroes are equipped with custom starting loadouts and healing potions.</p>
        </div>
        <div class="card">
          <div class="ic">🧠</div>
          <h3>2. Determining AI viability</h3>
          <p>The autonomous Mentor AI runs in headless Docker/Xvfb. It enforces a strict decision hierarchy: emergency potion drinking at <code>BP &le; 4</code>, melee targeting, spellcasting (Sleep, Ball of Flame), room/corridor secret door scans, dead-end pruning, and negative border stair navigation.</p>
        </div>
        <div class="card">
          <div class="ic">📜</div>
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
        <a class="btn" href="{{ '/games/tabletop-rpg/proof-of-viability.html' | relative_url }}">Open Interactive 315-Transaction Report &rarr;</a>
        <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/tabletop-rpg/reports/proof_of_viability" target="_blank" rel="noopener">Evidence on GitHub &nearr;</a>
      </div>
    </div>
  </div>
</section>
<script src="{{ '/assets/site.js' | relative_url }}" defer></script>
