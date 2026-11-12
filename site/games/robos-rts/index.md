---
layout: game
game_id: robos-rts
title: "Starfall Command"
permalink: /games/robos-rts/
description: "Play the four-mission Ashfall Signal campaign, fight the AI as one of three factions, and shape Starfall Command through its public Balance Council."
body_class: starfall-game
extra_css: /assets/starfall-command.css
accent: "#b9dc87"
og_image: /assets/games/starfall-command/hold-for-dawn-battle.webp
og_image_alt: "The Meridian Guard defends its Hold for Dawn outpost in Starfall Command"
og_image_width: 1440
og_image_height: 810
schema_type: VideoGame
keywords: "Starfall Command, RobOS RTS, RTS campaign, Frontier Hunters, Balance Council"
---
{% assign council = site.data.starfall_balance %}
{% assign captures = '/assets/games/starfall-command/' %}
<div class="starfall">
  <nav class="starfall-nav" aria-label="Starfall Command">
    <div class="wrap">
      <a class="starfall-nav-name" href="#about">Starfall Command</a>
      <div>
        <a href="#campaign">Campaign</a>
        <a href="#frontier">Skirmish</a>
        <a href="#play-modes">Battle sim &amp; online</a>
        <a href="#balance-council">Balance Council</a>
        <a href="{{ '/games/robos-rts/docs/' | relative_url }}">Game guide</a>
      </div>
    </div>
  </nav>

  <section class="starfall-hero wrap" id="about">
    <div>
      <p class="starfall-label">Open-source real-time strategy</p>
      <h1>Starfall Command</h1>
      <p class="starfall-lead">Escort civilian convoys through Brood territory, play a skirmish against the AI, or bring a friend to an online 1v1.</p>
      <div class="starfall-actions">
        {% include game-download-button.html %}
        <a class="starfall-link" href="#dev-update">Watch the dev update</a>
      </div>
      <p class="starfall-meta">Windows · Linux · macOS. <a class="starfall-link" href="#play">Run from source for the latest campaign and online lobby.</a></p>
    </div>
    <figure class="starfall-capture" id="battle">
      <a href="{{ captures | append: 'hold-for-dawn-battle.webp' | relative_url }}">
        <img src="{{ captures | append: 'hold-for-dawn-battle.webp' | relative_url }}" width="1440" height="810" fetchpriority="high" alt="Field Bunkers and Meridian Guard infantry fire on a Gnarl Brood wave at the Hold for Dawn outpost">
      </a>
      <figcaption>Hold for Dawn &middot; Meridian Guard defends the evacuation outpost</figcaption>
    </figure>
  </section>

  <section class="starfall-section" id="campaign" aria-labelledby="campaign-title">
    <div class="wrap">
      <header class="starfall-section-head">
        <h2 id="campaign-title">Ashfall Signal campaign</h2>
        <p>Four missions take you from a small infantry squad to escorting civilian convoys through Brood territory.</p>
      </header>
      <div class="starfall-grid starfall-campaign-grid">
        <article>
          <a href="{{ captures | append: 'cut-the-signal.webp' | relative_url }}"><img src="{{ captures | append: 'cut-the-signal.webp' | relative_url }}" width="1440" height="810" loading="lazy" alt="Captain Vale’s squad on the road in Vesper Gate"></a>
          <p class="starfall-label">Mission 01</p>
          <h3>Cut the Signal</h3>
          <p>Lead Captain Vale through Vesper Gate, bring survivors into the squad and take down the relay headquarters.</p>
        </article>
        <article id="interface">
          <a href="{{ captures | append: 'white-ridge.webp' | relative_url }}"><img src="{{ captures | append: 'white-ridge.webp' | relative_url }}" width="1440" height="810" loading="lazy" alt="White Ridge staging base with a Muster Hall selected and Riflemen in production"></a>
          <p class="starfall-label">Mission 02</p>
          <h3>The White Ridge Job</h3>
          <p>Set up mining and production, then push through the Directorate’s defenses to seize the artifact.</p>
        </article>
        <article>
          <a href="{{ captures | append: 'hold-for-dawn.webp' | relative_url }}"><img src="{{ captures | append: 'hold-for-dawn.webp' | relative_url }}" width="1440" height="810" loading="lazy" alt="Starting garrison and Field Bunkers at the Hold for Dawn evacuation outpost"></a>
          <p class="starfall-label">Mission 03</p>
          <h3>Hold for Dawn</h3>
          <p>Hold two river crossings for 20 minutes, rescue stranded militia and get the Rampart to the landing pad.</p>
        </article>
        <article>
          <a href="{{ captures | append: 'last-road.webp' | relative_url }}"><img src="{{ captures | append: 'last-road.webp' | relative_url }}" width="1440" height="810" loading="lazy" alt="Bracken settlement with a broad crystal line and separate aether tap"></a>
          <p class="starfall-label">Mission 04</p>
          <h3>The Last Road</h3>
          <p>Build up Bracken, staff the roadside bunkers, and escort 50 colonists to the colony ships.</p>
        </article>
      </div>
      <div class="starfall-actions">
        <a class="starfall-link" href="{{ '/projects/robos-rts/#ashfall-signal-campaign' | relative_url }}">Campaign guide</a>
        <a class="starfall-link" href="{{ '/blog/starfall-command-hold-for-dawn/' | relative_url }}">Watch the full Hold for Dawn run</a>
      </div>
    </div>
  </section>

  <section class="starfall-section" id="frontier" aria-labelledby="skirmish-title">
    <div class="wrap">
      <header class="starfall-section-head">
        <h2 id="skirmish-title">Skirmish against the AI</h2>
        <p>Choose both factions, the map and the AI’s difficulty. Scout its build, hold your expansion and destroy its structures.</p>
      </header>
      <div class="starfall-grid" id="factions">
        <article>
          <a href="{{ captures | append: 'frontier-hunters.webp' | relative_url }}"><img src="{{ captures | append: 'frontier-hunters.webp' | relative_url }}" width="1440" height="810" loading="lazy" alt="Meridian Guard workers gathering crystal on Frontier Hunters with the Colony Hub selected"></a>
          <p class="starfall-label">Meridian Guard</p>
          <h3>Frontier Hunters</h3>
          <p>Infantry, field defenses and siege artillery. The 256×256 map has eight possible starts and wide routes between expansions.</p>
        </article>
        <article>
          <a href="{{ captures | append: 'gnarl-brood.webp' | relative_url }}"><img src="{{ captures | append: 'gnarl-brood.webp' | relative_url }}" width="1440" height="810" loading="lazy" alt="A Gnarl Brood Nest on living ground in the Iron Narrows skirmish"></a>
          <p class="starfall-label">Gnarl Brood</p>
          <h3>Iron Narrows</h3>
          <p>Hatch fast troops and spread living ground. Narrow crossings and destructible barriers reward scouting.</p>
        </article>
        <article>
          <a href="{{ captures | append: 'aurelian-concord.webp' | relative_url }}"><img src="{{ captures | append: 'aurelian-concord.webp' | relative_url }}" width="1440" height="810" loading="lazy" alt="An Aurelian Concord Heartstone and its workers on Glassline Basin"></a>
          <p class="starfall-label">Aurelian Concord</p>
          <h3>Glassline Basin</h3>
          <p>Power your buildings and fight with regenerating shields. Two lanes wrap around a central bluff.</p>
        </article>
      </div>
      <div class="starfall-actions">
        <a class="starfall-link" href="{{ '/projects/robos-rts/#skirmish-maps' | relative_url }}">Compare maps and faction tech</a>
        <a class="starfall-link" href="{{ '/projects/robos-rts/#verified-run-october-23-2026' | relative_url }}">Watch a Frontier Hunters match</a>
      </div>
    </div>
  </section>

  <section class="starfall-section" id="play-modes" aria-labelledby="modes-title">
    <div class="wrap">
      <header class="starfall-section-head"><h2 id="modes-title">Battle simulator &amp; online 1v1</h2></header>
      <div class="starfall-grid starfall-campaign-grid">
        <article>
          <a href="{{ captures | append: 'battle-simulator.webp' | relative_url }}"><img src="{{ captures | append: 'battle-simulator.webp' | relative_url }}" width="980" height="710" loading="lazy" alt="Riflemen spread out to fight Sporebursts in the battle simulator"></a>
          <h3>Try the same fight twice</h3>
          <p>Set up a matchup in the battle simulator, spread out your Riflemen, and see what changes when the Sporebursts hit.</p>
        </article>
        <article>
          <a href="{{ captures | append: 'online-lobby.webp' | relative_url }}"><img src="{{ captures | append: 'online-lobby.webp' | relative_url }}" width="980" height="585" loading="lazy" alt="Online 1v1 lobby with controls to host or join a Frontier Hunters match"></a>
          <h3>Host or join a match</h3>
          <p>Use the online lobby to play Frontier Hunters or spectate an AI matchup. LAN party support and co-op are planned.</p>
          <p><a class="starfall-link" href="{{ '/robos-game-server/' | relative_url }}">Set up the game server</a></p>
        </article>
      </div>
    </div>
  </section>

  <section class="starfall-section starfall-dev" id="dev-update" aria-labelledby="dev-title">
    <div class="wrap starfall-dev-inner">
      <div>
        <h2 id="dev-title">49 seconds of Starfall Command</h2>
        <p>Nicholas DiPiazza walks through the battle sim, campaign mutators, online lobby, and map editor.</p>
        <div class="starfall-actions">
          <a class="btn" href="https://www.youtube.com/shorts/7MgYpn01bng">Watch on YouTube</a>
          <a class="starfall-link" href="{{ '/blog/starfall-command-the-last-road/' | relative_url }}">Read the Mission 4 devlog</a>
        </div>
      </div>
      <a class="starfall-short" href="https://www.youtube.com/shorts/7MgYpn01bng" aria-label="Watch the narrated Starfall Command Short on YouTube">
        <img src="{{ captures | append: 'dev-short.webp' | relative_url }}" width="432" height="768" loading="lazy" alt="Frame from the narrated Starfall Command Short with gameplay and Nicholas DiPiazza">
        <span aria-hidden="true">▶</span>
      </a>
    </div>
  </section>

  <section class="starfall-section starfall-council" id="balance-council" aria-labelledby="balance-title">
    <div class="wrap">
      <header class="starfall-section-head">
        <h2 id="balance-title">Balance Council</h2>
        <p>Got a matchup that feels off? Tell the {{ council.steward.name }} what happened.</p>
      </header>
      <div class="starfall-split">
        <div class="starfall-council-copy" id="built-with-robos">
          <h3>Show us the match</h3>
          <p>Include your game version, map, factions, and what you tried. A clip helps. The council uses the knowledge graph to find the relevant rules and tests, then keeps the discussion and proposed patch in the GitHub issue.</p>
          <p class="starfall-reference">
            {% for reference in council.gameReferences %}<a href="{{ reference.source }}">{{ reference.name }}</a>{% endfor %}
            <a href="https://github.com/nddipiazza/robos/blob/main/site/_data/starfall_balance.json">Council KGraph</a>
          </p>
        </div>
        <form class="starfall-intake" action="{{ council.issueForm }}" method="get">
          <fieldset>
            <legend>File a report</legend>
            {% for report in council.reports %}
            <label class="starfall-choice">
              <input type="radio" name="template" value="{{ report.template }}" required{% if forloop.first %} checked{% endif %}>
              <span><strong>{{ report.name }}</strong><small>{{ report.summary }}</small></span>
            </label>
            {% endfor %}
          </fieldset>
          <button class="btn" type="submit">Continue to GitHub</button>
          <p>GitHub opens the matching issue form. Review and submit it there.</p>
          <a class="starfall-link" href="https://github.com/nddipiazza/robos/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+Starfall">Browse open Starfall reports</a>
        </form>
      </div>
      <aside class="starfall-history" aria-labelledby="sc2-title">
        <h3 id="sc2-title">Why StarCraft II sometimes felt out of touch</h3>
        <div>
          <p>StarCraft II patches could feel disconnected from the matches people were playing. The 5.0.14 test patch proposed removing Battery Overcharge. The Community Balance Council later acknowledged that players were worried about defending early Terran rushes and tested follow-up changes to the Cyclone and Stalker. The first proposal and the problem players raised were visible, but the link between them became clear only in the follow-up. <a href="https://news.blizzard.com/en-us/article/24140120/starcraft-ii-5-0-14-ptr-update">Blizzard’s 5.0.14 PTR update</a></p>
          <p>Patch 5.0.16 also changed the opening economy. Blizzard later said it rolled back most of that balance patch after reviewing feedback, including restoring the 12-worker start. Starfall’s council process puts the original report, its reproduction and the decision in the same public thread. <a href="https://news.blizzard.com/en-gb/article/24309308/starcraft-ii-5-0-17-patch-notes">Blizzard’s 5.0.17 patch notes</a></p>
        </div>
      </aside>
    </div>
  </section>

  <section class="starfall-section" id="bots" aria-labelledby="editor-title">
    <div class="wrap starfall-split starfall-editor">
      <div>
        <h2 id="editor-title">Make a battlefield</h2>
        <p>Paint terrain, place deposits and starting positions, and playtest a map from the editor. Maps use JSON-LD. The game’s local API drives the same commands used by bots and repeatable gameplay tests.</p>
        <div class="starfall-actions">
          <a class="starfall-link" href="{{ '/projects/robos-rts/#map-editor' | relative_url }}">Map editor guide</a>
          <a class="starfall-link" href="{{ '/projects/robos-rts/#scripting-and-bots' | relative_url }}">Bot API</a>
        </div>
      </div>
      <figure class="starfall-capture">
        <a href="{{ captures | append: 'map-editor.webp' | relative_url }}"><img src="{{ captures | append: 'map-editor.webp' | relative_url }}" width="1440" height="810" loading="lazy" alt="The in-game map editor showing Frontier Hunters with terrain, starting positions and resources"></a>
        <figcaption><span>Frontier Hunters</span><span>Map editor</span></figcaption>
      </figure>
    </div>
  </section>

  {% include game-downloads.html %}
  <section class="starfall-section" id="play" aria-labelledby="source-title">
    <div class="wrap starfall-split">
      <div>
        <p class="starfall-label">Source build</p>
        <h2 id="source-title">Run the current game</h2>
        <p>On Windows, open <code>games/robos-rts/project.godot</code> with Godot 4.3 or newer and press <kbd>F5</kbd>. On Linux or macOS, use the launcher. Press <kbd>F1</kbd> during a match for controls.</p>
        <a class="starfall-link" href="{{ '/games/robos-rts/docs/' | relative_url }}">Read the full documentation</a>
        <p class="starfall-meta" id="soundtrack-credit">Soundtrack &middot; <cite>Bloodlines</cite> by <a class="starfall-link" href="https://www.youtube.com/user/Mattowarrior777">Pathless Land</a>, used with permission. Includes “Shadows On The Green” by Tempest Eternal.</p>
      </div>
      <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos/games/robos-rts
./play.sh</code></pre>
    </div>
  </section>
  <section class="starfall-section starfall-dev" id="contribute" aria-labelledby="contribute-title">
    <div class="wrap starfall-section-head">
      <h2 id="contribute-title">Help build Starfall Command</h2>
      <div>
        <p>We’re looking for contributors to write code, make maps and art, or playtest missions and report what breaks.</p>
        <div class="starfall-actions">
          <a class="btn" href="https://discord.gg/6PjxzkHujE">Join the Discord</a>
          <a class="starfall-link" href="https://github.com/nddipiazza/robos/tree/main/games/robos-rts">Browse the source</a>
        </div>
      </div>
    </div>
  </section>
</div>
<script type="application/ld+json">{{ council | jsonify }}</script>
<script src="{{ '/assets/site.js' | relative_url }}" defer></script>
