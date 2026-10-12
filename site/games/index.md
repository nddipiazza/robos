---
layout: game
title: Games
permalink: /games/
description: Two games built end to end by AI agents inside RobOS — a party cRPG and a HeroQuest-style tabletop dungeon crawler.
bg_video: /assets/games/tabletop-bg.mp4
bg_poster: /assets/games/tabletop-bg-poster.jpg
accent: "#e0b252"
---
<section class="g-hero wrap">
  <p class="kicker">Built by agents · Verified on video</p>
  <h1 class="g-title">RobOS Games</h1>
  <p class="lead">Two full games, designed from a knowledge graph, written by AI agents and tested by playing them on camera. Pick a world.</p>
  <div class="cta"><a class="btn" href="#worlds">Choose your game</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games" target="_blank" rel="noopener">View source</a></div>
  <span class="scroll">Scroll ↓</span>
</section>

<section class="g-sec" id="worlds">
  <div class="wrap">
    <div class="hub">
      <a href="{{ '/games/crpg/' | relative_url }}" style="background-image:url('{{ '/assets/games/crpg-bg-poster.jpg' | relative_url }}');--accent:#5ec8e5">
        <div class="in"><h2>Realm of Heroes CRPG</h2><p>A party-based, real-time-with-pause cRPG in the Infinity Engine tradition. Godot 4.3.</p><span class="go">Enter the realm →</span></div>
      </a>
      <a href="{{ '/games/tabletop-rpg/' | relative_url }}" style="background-image:url('{{ '/assets/games/tabletop-still-intro.jpg' | relative_url }}')">
        <div class="in"><h2>Tabletop RPG</h2><p>A HeroQuest-inspired dungeon crawler with cartridges, fog of war and a Game Master mode.</p><span class="go">Open the box →</span></div>
      </a>
    </div>
  </div>
</section>

<section class="g-sec">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">How these were made</p>
      <h2 class="h2">The game is data. The agents are the studio.</h2>
      <p class="sec-p">Both games are described in the RobOS knowledge graph: heroes, monsters, maps, quests and rules as validated data. Agents generate the engine code from that model, then a test harness plays the finished game and records every scenario to video, so you review proof instead of trusting a diff.</p>
      <div class="facts">
        <div><b>2</b><span>complete games</span></div>
        <div><b>Godot 4</b><span>engine</span></div>
        <div><b>Recorded</b><span>playthrough tests</span></div>
        <div><b>Apache-2.0</b><span>open source</span></div>
      </div>
      <p style="margin-top:26px"><a class="btn btn-ghost" href="{{ '/v1/game-development.html' | relative_url }}">How RobOS does game development</a></p>
    </div>
  </div>
</section>
