---
layout: game
game_id: midterms-2026
title: "Midterms 2026: Battle for the Hill"
permalink: /games/tabletop-rpg/midterms-2026/
description: "Play Midterms 2026: Battle for the Hill, a standalone satirical tabletop dungeon crawler. Explore the Capitol, fight fantasy monsters and watch the AI playthrough."
bg_poster: /assets/games/storefront/tabletop-rpg-background.jpg
accent: "#e0b252"
og_image_alt: "Midterms 2026 tabletop dungeon gameplay in the Capitol"
schema_type: VideoGame
---
{% assign midterms = site.data.games['midterms-2026'] %}
<section class="g-hero wrap">
  <p class="kicker">Standalone tabletop adventure · Political satire</p>
  <h1 class="g-title">Midterms 2026<br>Battle for the Hill</h1>
  <p class="lead">Take a party of unlikely political heroes through a fantasy Capitol dungeon. Explore hidden chambers, roll combat dice, cast spells and defeat the three Hydra bosses in this fictional, satirical adventure.</p>
  <div class="cta"><a class="btn" href="#browser-game">Play in your browser</a>{% include game-download-button.html %}<a class="btn btn-ghost" href="{{ midterms.ai_playthrough_url }}">Watch the AI playthrough</a></div>
</section>

<section class="g-sec" id="browser-game">
  <div class="wrap"><div class="panel-g">
    <p class="eyebrow">Click to play · No installation</p>
    <h2 class="h2">Play Midterms 2026</h2>
    <p class="sec-p">The browser edition runs locally in your browser. Use a desktop browser with a mouse and keyboard, and open fullscreen for the clearest view of the board.</p>
    {% if midterms.itch_url %}
    <a class="btn" href="{{ midterms.itch_url }}">Launch browser game on itch.io</a>
    {% else %}
    <p class="sec-p">The browser edition is being prepared. Desktop builds are listed below.</p>
    {% endif %}
  </div></div>
</section>

{% include game-downloads.html %}

<section class="g-sec" id="about">
  <div class="wrap"><div class="panel-g">
    <h2 class="h2">Storm the Capitol dungeon</h2>
    <p class="sec-p">Lead Barack Obama, Donald Trump, Hillary Clinton and Bernie Sanders through a fictional fantasy dungeon, with turn-based movement, fog of war, treasure and tactical combat. Defeat Talarixon, Brownsted and El-Rogers to complete Battle for the Hill.</p>
    <figure><img src="{{ '/assets/games/storefront/tabletop-rpg-gameplay.gif?v=72f644ab' | relative_url }}" alt="Midterms 2026 gameplay: heroes explore the Capitol dungeon and resolve combat" width="960" height="540" style="width:100%;height:auto;border-radius:12px"><figcaption>Actual gameplay, shown at a slower pace so you can follow the turns.</figcaption></figure>
    <p class="sec-p">This release opens directly into the election campaign and includes the game engine. It is a standalone edition of the campaign in <a href="{{ '/games/tabletop-rpg/' | relative_url }}">RobOS Tabletop RPG</a>.</p>
    <div class="cta"><a class="btn btn-ghost" href="https://www.youtube.com/watch?v=7HkZARyvqmM">Watch the full AI playthrough</a><a class="btn btn-ghost" href="{{ '/games/tabletop-rpg/proof-of-viability-election-2026.html' | relative_url }}">Playthrough report and evidence</a></div>
  </div></div>
</section>

{% include game-kgraph.html %}

<section class="g-sec" id="play">
  <div class="wrap"><div class="panel-g">
    <h2 class="h2">Open source, built with RobOS</h2>
    <p class="sec-p">A Godot game built with AI coding agents and generated visual content. No AI account or service is required to play. This is a development build and a work of political satire.</p>
    <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/tabletop-rpg">Browse the shared engine and campaign source</a>
  </div></div>
</section>
