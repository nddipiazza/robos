---
layout: game
title: "Tabletop RPG"
permalink: /games/tabletop-rpg/
description: "A HeroQuest-inspired tabletop dungeon crawler with story cartridges, fog of war, and a Game Master mode, built in Godot 4 by RobOS agents."
bg_video: /assets/games/tabletop-bg.mp4
bg_poster: /assets/games/tabletop-bg-poster.jpg
accent: "#e0b252"
---
<section class="g-hero wrap">
  <p class="kicker">RobOS Tabletop RPG</p>
  <h1 class="g-title">Descend. Open the door.<br>Face what waits.</h1>
  <p class="lead">A HeroQuest-inspired dungeon crawler on a 26×19 board. Play the heroes, or sit behind the screen as the Game Master.</p>
  <div class="cta"><a class="btn" href="#play">Play it</a><a class="btn btn-ghost" href="{{ '/games/tabletop-rpg/docs/' | relative_url }}">Read the docs</a></div>
  <span class="scroll">Scroll ↓</span>
</section>

<section class="g-sec">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">The game</p>
      <h2 class="h2">The classic crawl, rebuilt as data</h2>
      <p class="sec-p">Each campaign is a self-contained <em>cartridge</em>: heroes, monsters, spells, furniture and quests. Doors lift the fog of war, dice decide every blow, and cinematic scenes carry the story.</p>
      <div class="grid3">
        <div class="card"><div class="ic">🎲</div><h3>Skulls &amp; shields</h3><p>Authentic combat dice, 2d6 movement and room-by-room exploration.</p></div>
        <div class="card"><div class="ic">🚪</div><h3>Fog of war</h3><p>Open a door and the room is revealed, monsters and all.</p></div>
        <div class="card"><div class="ic">🧙</div><h3>Player &amp; GM modes</h3><p>Lead the heroes, or play Zargon behind the GM screen and command the monsters.</p></div>
      </div>
      <table class="t" style="margin-top:30px">
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
    <h2 class="h2">Pick a quest</h2>
    <div class="shots">
      <figure class="wide"><img loading="lazy" src="{{ '/assets/games/tabletop-still-intro.jpg' | relative_url }}" alt="Quest introduction cinematic"><figcaption>In-game cinematic: the quest introduction.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/tabletop-still-heist.jpg' | relative_url }}" alt="Corridor scene"><figcaption>The Fortress of the Fire King: the corridor.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/v1/assets/images/tabletop-rpg/heroquest_board.jpg' | relative_url }}" alt="HeroQuest board"><figcaption>The 26×19 board</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/v1/assets/images/tabletop-rpg/first_light_caverns.jpg' | relative_url }}" alt="First Light caverns"><figcaption>First Light caverns</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/tabletop-still-witch.jpg' | relative_url }}" alt="Witch hand scene"><figcaption>Cinematic: the undead rise.</figcaption></figure>
    </div>
  </div>
</section>

<section class="g-sec" id="play">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Play</p>
      <h2 class="h2">Run it from source</h2>
      <p class="sec-p">You need <a style="text-decoration:underline" href="https://godotengine.org/download" target="_blank" rel="noopener">Godot 4</a> and Git.</p>
      <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos/games/tabletop-rpg
GODOT_BIN=/path/to/godot4 ./play.sh          # interactive
./play.sh --demo                              # autonomous demo mode</code></pre>
      <div class="cta" style="justify-content:flex-start;margin-top:18px"><a class="btn" href="{{ '/v1/projects/tabletop-rpg/' | relative_url }}">Engine guide</a><a class="btn btn-ghost" href="{{ '/v1/apps/robos-tabletop/' | relative_url }}">Tabletop Studio editor</a></div>
    </div>
  </div>
</section>
<script src="{{ '/assets/site.js' | relative_url }}" defer></script>
