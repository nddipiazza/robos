---
layout: game
title: Games
permalink: /games/
description: "Games built by AI agents inside RobOS, including Starfall Command: one player versus AI on Frontier Hunters, with a reusable Godot map editor and live gameplay tests, and RobOS Party Game, an AI-hosted party game on your TVs."
bg_video: /assets/games/tabletop-bg.mp4
bg_poster: /assets/games/tabletop-bg-poster.jpg
accent: "#e0b252"
og_image_alt: "RobOS Games — Games built by AI agents in Godot 4"
schema_type: CollectionPage
keywords: "RobOS Games, AI-built games, Godot 4 games, Realm of Heroes CRPG, Tabletop RPG, Starfall Command RTS, Quest Warrior Dragon JRPG, RobOS Party Game, AI party game, autonomous game testing"
---
<section class="g-hero wrap">
  <p class="kicker">Built by agents · Verified on video</p>
  <h1 class="g-title">RobOS Games</h1>
  <p class="lead">Games designed from a knowledge graph, written by AI agents and tested by playing them on camera. Pick a world.</p>
  <div class="cta"><a class="btn" href="#worlds">Choose your game</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games" target="_blank" rel="noopener">View source</a></div>
  <span class="scroll">Scroll ↓</span>
</section>

<section class="g-sec" id="worlds">
  <div class="wrap">
    <div class="hub three">
      <a href="{{ '/games/crpg/' | relative_url }}" style="background-image:url('{{ '/assets/games/crpg-bg-poster.jpg' | relative_url }}');--accent:#5ec8e5">
        <div class="in"><h2>Realm of Heroes CRPG</h2><p>A party-based, real-time-with-pause cRPG in the Infinity Engine tradition. Godot 4.3.</p><span class="go">Enter the realm →</span></div>
      </a>
      <a href="{{ '/games/tabletop-rpg/' | relative_url }}" style="background-image:url('{{ '/assets/games/tabletop-still-intro.jpg' | relative_url }}')">
        <div class="in"><h2>Tabletop RPG</h2><p>A HeroQuest-inspired dungeon crawler with cartridges, fog of war and a Game Master mode.</p><span class="go">Open the box →</span></div>
      </a>
      <a href="{{ '/games/robos-rts/' | relative_url }}" style="background-image:url('{{ '/assets/games/rts/frontier-hunters-live.jpg' | relative_url }}');--accent:#58b4ff">
        <div class="in"><h2>Starfall Command</h2><p>One player versus AI on a 256×256 battlefield with eight possible starts, unlimited deposits, a map editor and live gameplay tests.</p><span class="go">Take command →</span></div>
      </a>
      <a href="{{ '/games/quest-warrior-dragon/' | relative_url }}" style="background-image:url('{{ '/assets/games/quest-warrior-dragon/05_world_map_alefgard_overworld.png' | relative_url }}');--accent:#00bcd4">
        <div class="in"><h2>Quest: Warrior Dragon</h2><p>An NES-authentic 2D console RPG across 29 maps in Alefgard with in-engine Stride AI and 100% verified BFS map completeness.</p><span class="go">Begin the quest →</span></div>
      </a>
      <a href="{{ '/games/party-game/' | relative_url }}" style="background-image:url('{{ '/assets/games/party-game/finale.jpg' | relative_url }}');--accent:#ec4899">
        <div class="in"><h2>RobOS Party Game</h2><p>An AI host in a hooded mask runs mini games about your guests on your TVs. Phones are the controllers; the house is the game board.</p><span class="go">Start the party →</span></div>
      </a>
    </div>
  </div>
</section>

<section class="g-sec">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">How these were made</p>
      <h2 class="h2">The game is data. The agents are the studio.</h2>
      <p class="sec-p">The games are described in the RobOS knowledge graph: heroes, monsters, maps, quests and rules as validated data. Agents generate the engine code from that model, then a test harness plays the finished game and records scenarios to video, so you review proof alongside the diff.</p>
      <div class="facts">
        <div><b>Playable</b><span>game scenarios</span></div>
        <div><b>Godot 4</b><span>engine</span></div>
        <div><b>Recorded</b><span>playthrough tests</span></div>
        <div><b>Apache-2.0</b><span>open source</span></div>
      </div>
      <p style="margin-top:26px"><a class="btn btn-ghost" href="{{ '/v1/game-development.html' | relative_url }}">How RobOS does game development</a></p>
    </div>
  </div>
</section>
