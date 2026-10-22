---
layout: game
title: "Dragon Warrior Docs"
permalink: /games/dragon-warrior/docs/
description: Engine guide, global BFS pathfinding audit, in-engine Stride AI, and Cucumber checkpoint E2E documentation for RobOS Dragon Warrior.
bg_poster: /assets/games/dragon-warrior/05_world_map_alefgard_overworld.png
accent: "#00bcd4"
---
<section class="game-doc wrap">
  <p class="eyebrow" style="color:var(--accent)">Dragon Warrior · 2D RPG Engine</p>
  <h1 class="g-title" style="font-size:clamp(2rem,5vw,3.4rem)">Documentation</h1>
  <p class="lead" style="margin-top:14px;color:#c9c2b2;max-width:65ch">Explore the 29-map declarative world graph, in-engine Stride AI, chained Cucumber checkpoint tests, global BFS reachability verifier, and the AI playthrough that plays the whole game.</p>
  <div class="grid3">
    <a class="card" href="{{ '/v1/projects/dragon-warrior/' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/book.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Engine &amp; Pathfinding Guide</h3><p>Architecture, 29-map BFS connectivity table, 14 quest milestones, Stride AI, and HTTP control server.</p><span class="go">Open →</span></a>
    <a class="card" href="{{ '/games/dragon-warrior/proof-of-viability.html' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/camera.svg" alt="" width="48" height="48" loading="lazy"></div><h3>20-Slide Interactive Showcase</h3><p>Step through all 20 pathfinding milestone screenshots from King Lorik's Throne Room to Dragonlord Form 2.</p><span class="go">Open →</span></a>
    <a class="card" href="{{ '/games/dragon-warrior/ai-playthrough/' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/robot.svg" alt="" width="48" height="48" loading="lazy"></div><h3>AI Playthrough</h3><p>The robos-jrpg engine plays the whole game with real inputs: 70-milestone registry, survival brain, per-milestone videos and checkpoints, deadlock watchdogs, tray icon and live dashboard.</p><span class="go">Open →</span></a>
    <a class="card" href="{{ '/v1/game-development.html' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/gamepad.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Game development in RobOS</h3><p>How RobOS models games in the Knowledge Graph and verifies them with autonomous AI agents.</p><span class="go">Open →</span></a>
  </div>
  <div class="doc-list" style="margin-top:44px">
    <div><h3>Project</h3>
      <a href="{{ '/games/dragon-warrior/' | relative_url }}"><b>Game page</b><span>→</span></a>
      <a href="{{ '/games/dragon-warrior/proof-of-viability.html' | relative_url }}"><b>Global Map Completeness &amp; 20-Slide Tour</b><span>→</span></a>
      <a href="{{ '/games/dragon-warrior/ai-playthrough/' | relative_url }}"><b>AI Playthrough &mdash; tray icon, dashboard, milestone videos</b><span>→</span></a>
      <a href="https://github.com/nddipiazza/robos/tree/main/games/dragon-warrior" target="_blank" rel="noopener"><b>Source on GitHub</b><span>↗</span></a></div>
    <div><h3>Also</h3>
      <a href="{{ '/games/' | relative_url }}"><b>All RobOS games</b><span>→</span></a>
      <a href="{{ '/games/tabletop-rpg/docs/' | relative_url }}"><b>Tabletop RPG docs</b><span>→</span></a>
      <a href="{{ '/games/crpg/docs/' | relative_url }}"><b>Realm of Heroes CRPG docs</b><span>→</span></a></div>
  </div>
</section>
