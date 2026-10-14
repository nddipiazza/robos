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
  <div class="cta"><a class="btn" href="#play">Play it</a><a class="btn btn-ghost" href="#build">Build a quest</a><a class="btn btn-ghost" href="{{ '/games/tabletop-rpg/docs/' | relative_url }}">Read the docs</a></div>
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
<script src="{{ '/assets/site.js' | relative_url }}" defer></script>
