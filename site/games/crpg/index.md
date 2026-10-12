---
layout: game
title: "Realm of Heroes"
permalink: /games/crpg/
description: "Realm of Heroes: A Night Without Memory — a party-based, real-time-with-pause cRPG built by AI agents in RobOS."
bg_video: /assets/games/crpg-bg.mp4
bg_poster: /assets/games/crpg-bg-poster.jpg
accent: "#5ec8e5"
---
<section class="g-hero wrap">
  <p class="kicker">RobOS cRPG</p>
  <h1 class="g-title">Realm of Heroes</h1>
  <p class="lead">A Night Without Memory. Wake in a stranger's manor, gather a party and fight your way to the Garrison Keep in a real-time-with-pause tactical RPG.</p>
  <div class="cta"><a class="btn" href="#play">Play it</a><a class="btn btn-ghost" href="{{ '/games/crpg/docs/' | relative_url }}">Read the docs</a></div>
  <span class="scroll">Scroll ↓</span>
</section>

<section class="g-sec" id="about">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">The game</p>
      <h2 class="h2">Pause. Plan. Resolve.</h2>
      <p class="sec-p">Press Space to freeze the fight, queue moves, change formation or pick a spell, then unpause and watch it resolve. It is modelled on the Infinity Engine classics, with d20 combat, threat-driven enemy AI and a Baldur's Gate-style activity log.</p>
      <div class="grid3">
        <div class="card"><div class="ic">⏸️</div><h3>Real-time with pause</h3><p>Queue orders while time is frozen. Six formations, party leader swapping, and shift-click move queues.</p></div>
        <div class="card"><div class="ic">🎲</div><h3>d20 tactical combat</h3><p>Attack rolls versus AC with advantage and disadvantage, saving throws, and 3D area spells like Fireball (8d6, DC 14 DEX save).</p></div>
        <div class="card"><div class="ic">🐺</div><h3>Enemies that coordinate</h3><p>Enemies keep a threat table, switch targets, and alert packmates up to 950 px away.</p></div>
        <div class="card"><div class="ic">🧭</div><h3>Smart pathfinding</h3><p>Sub-tile A* with string-pulling smoothing. Characters clear corners instead of sticking to walls.</p></div>
        <div class="card"><div class="ic">🌫️</div><h3>Fog of war &amp; traps</h3><p>Hidden traps, rogue searches, <em>Find Traps</em>, and torch-lit exploration of catacombs.</p></div>
        <div class="card"><div class="ic">♟️</div><h3>3D miniature pawns</h3><p>Heroes and monsters render as tabletop miniatures with equipment that mounts to weapon, shield and helm sockets.</p></div>
      </div>
    </div>
  </div>
</section>

<section class="g-sec">
  <div class="wrap">
    <p class="eyebrow">Five acts</p>
    <h2 class="h2">From the Homestead to the Garrison Keep</h2>
    <div class="shots">
      <figure class="wide"><img loading="lazy" src="{{ '/v1/assets/images/crpg-realm/village_square_overview.png' | relative_url }}" alt="Oakhaven Village Square"><figcaption>Oakhaven Village Square, the hub map, with party HUD and activity log.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/v1/assets/images/crpg-realm/character_status_sheet.png' | relative_url }}" alt="Character sheet"><figcaption>Character sheet</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/v1/assets/images/crpg-realm/combat_battlefield.png' | relative_url }}" alt="Combat"><figcaption>Real-time-with-pause combat</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/v1/assets/images/crpg-realm/fog_of_war_reveal.png' | relative_url }}" alt="Fog of war"><figcaption>Fog of war reveal</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/v1/assets/images/crpg-realm/dozens_npc_dialogue.png' | relative_url }}" alt="Dialogue"><figcaption>Dialogue in the activity log</figcaption></figure>
    </div>
    <table class="t" style="margin-top:34px;background:rgba(8,9,14,.7)">
      <tr><th>Act</th><th>Scene</th><th>Highlights</th></tr>
      <tr><td>1</td><td>Homestead</td><td>Wake in the manor, loot the footlocker, meet the scout Elora.</td></tr>
      <tr><td>2</td><td>Village Square</td><td>The hub: 11 buildings, 12 townsfolk, a shop, the locked garrison gate.</td></tr>
      <tr><td>3</td><td>Whispering Forest</td><td>Dire wolves, a river and bridge, the hermit Varis.</td></tr>
      <tr><td>4</td><td>Ancient Catacombs</td><td>Four trap types, skeleton archers, a secret passage.</td></tr>
      <tr><td>5</td><td>Garrison Keep</td><td>The showdown with Captain Malakor.</td></tr>
    </table>
  </div>
</section>

<section class="g-sec" id="play">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Play</p>
      <h2 class="h2">Run it from source</h2>
      <p class="sec-p">You need <a style="text-decoration:underline" href="https://godotengine.org/download" target="_blank" rel="noopener">Godot 4.3</a> and Git. A browser build can be exported with <code>export_web.sh</code>.</p>
      <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos/games/crpg-realm
GODOT_BIN=/path/to/godot4 ./play.sh</code></pre>
      <div class="cta" style="justify-content:flex-start;margin-top:18px"><a class="btn" href="{{ '/v1/projects/crpg-realm/quick-start.html' | relative_url }}">Quick start guide</a><a class="btn btn-ghost" href="{{ '/v1/projects/crpg-realm/controls.html' | relative_url }}">Controls</a></div>
    </div>
  </div>
</section>

<section class="g-sec">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Make your own</p>
      <h2 class="h2">Build a campaign without writing code</h2>
      <p class="sec-p">Maps, characters, quests and items are JSON-LD data. Use the visual campaign editor, or follow the 12-chapter guide to add scenes, traps, enemies and spells.</p>
      <div class="cta" style="justify-content:flex-start"><a class="btn" href="{{ '/v1/projects/crpg-realm/campaign-editor-tutorial.html' | relative_url }}">Campaign editor tutorial</a><a class="btn btn-ghost" href="{{ '/v1/projects/crpg-realm/create-your-own-game.html' | relative_url }}">Create your own game</a></div>
    </div>
  </div>
</section>
<script src="{{ '/assets/site.js' | relative_url }}" defer></script>
