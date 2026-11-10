---
layout: game
game_id: robos-rts
title: "Starfall Command (RobOS RTS)"
permalink: /games/robos-rts/
description: "Starfall Command is a three-faction RTS with a three-mission campaign, 1 vs. AI skirmishes and a Godot 4 map editor."
bg_video: /assets/games/rts-bg.mp4
bg_poster: /assets/games/rts-bg-poster.jpg
accent: "#58b4ff"
og_image_alt: "Starfall Command (RobOS RTS) — Real-time strategy on a 256x256 battlefield in Godot 4"
schema_type: VideoGame
keywords: "Starfall Command, RobOS RTS, Godot 4 real-time strategy game, Frontier Hunters map, RTS map editor, AI skirmish"
---
<section class="g-hero wrap">
  <p class="kicker">RobOS RTS</p>
  <h1 class="g-title">Starfall Command</h1>
  <p class="lead">Lead the Meridian Guard through the Ashfall Signal campaign. Play one versus AI as any of three factions, practice in scenarios, or create a battlefield in the map editor.</p>
  <div class="cta">{% include game-download-button.html %}<a class="btn btn-ghost" href="#download">All platforms</a><a class="btn btn-ghost" href="#frontier">Watch the live match</a><a class="btn btn-ghost" href="{{ '/games/robos-rts/docs/' | relative_url }}">Read the docs</a></div>
  <span class="scroll">Scroll ↓</span>
</section>
{% include game-downloads.html %}
{% include game-kgraph.html %}

<section class="g-sec" id="about">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">The game</p>
      <h2 class="h2">Gather, build, scout and win</h2>
      <p class="sec-p">Each commander starts with a faction base, twelve workers and the same resources. Win by destroying every opposing structure, including unfinished expansions, or by your opponent's surrender.</p>
      <figure style="margin:24px 0"><img loading="lazy" src="{{ '/assets/blog/starfall-command-100-point-roadmap/title-screen.webp' | relative_url }}" alt="Starfall Command title screen with the Skirmish, Scenarios and Map Editor buttons" width="1600" height="900" style="width:100%;height:auto;border-radius:12px"><figcaption>Choose a mode from the title screen. The Skirmish setup previews and filters the map pool.</figcaption></figure>
      <div class="grid3">
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/mountain.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Three skirmish maps</h3><p>Frontier Hunters has eight candidate starts and unlimited deposits by default. Iron Narrows and Glassline Basin offer finite-resource duels, watch stations and destructible route blockers.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/balance.svg" alt="" width="48" height="48" loading="lazy"></div><h3>One player versus AI</h3><p>Choose each side’s faction independently. The AI scouts, defends, reroutes and buys counters with the same starting resources and prices you use.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/target.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Micro that matters</h3><p>Every weapon has a wind-up and a recovery. Move during the recovery and you cancel it, which makes stutter-step kiting real.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/compass.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Pathfinding that behaves</h3><p>Funnel-smoothed A*, crowd steering and push priority: idle units yield to marching ones and return to their posts.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/clock.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Live, accelerated play</h3><p>Fixed 64 Hz ticks with 1×, 2×, 4× and 8× playback. Fast-forward adapts to available CPU time so input and drawing keep moving.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/robot.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Author it, then play it</h3><p>Paint and fill terrain, place starts and resources, validate, undo, save and reload. F5 playtests the map; F10 returns to the editor.</p></div>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="campaign">
  <div class="wrap">
    <p class="eyebrow">Ashfall Signal</p>
    <h2 class="h2">Three campaign missions</h2>
    <p class="sec-p">Lead Captain Vale’s squad through Vesper Gate, build a force to seize the White Ridge artifact, then hold two bridges until a rescue transport arrives. Hold for Dawn runs on a 20-minute evacuation clock with three optional militia rescues.</p>
    <a class="btn btn-ghost" href="{{ '/projects/robos-rts/#ashfall-signal-campaign' | relative_url }}">Campaign guide →</a>
    <a class="btn btn-ghost" href="{{ '/blog/starfall-command-hold-for-dawn/' | relative_url }}">Watch the playthrough →</a>
  </div>
</section>

<section class="g-sec" id="frontier">
  <div class="wrap">
    <p class="eyebrow">Frontier Hunters</p>
    <h2 class="h2">From the first workers to the last enemy structure</h2>
    <p class="sec-p">This complete live test plays a Rush build against Hard Siege AI. The map is saved and reloaded through the editor first, then the player controller pays for construction and training while the opponent runs independently. Victory comes from the engine's structure-elimination rule.</p>
    <figure style="margin:24px 0">
      <video controls playsinline preload="metadata" poster="{{ '/assets/games/rts/frontier-hunters-live.jpg' | relative_url }}" style="width:100%;height:auto;border-radius:12px" width="1920" height="1080">
        <source src="{{ '/assets/games/rts/frontier-hunters-live.mp4' | relative_url }}" type="video/mp4">
        <track kind="captions" src="{{ '/assets/games/rts/frontier-hunters-live.vtt' | relative_url }}" srclang="en" label="English walkthrough" default>
      </video>
      <figcaption>October 23 recording, seed 29. The match used zero manual simulation steps and achieved 2.58× playback while recording at 1080p and 10 FPS.</figcaption>
    </figure>
    <div class="shots">
      <figure><img loading="lazy" src="{{ '/assets/games/rts/frontier-hunters-map.png' | relative_url }}" alt="Frontier Hunters: the full 256×256 map with eight starts and interior expansions"><figcaption>The full battlefield and its crossing routes.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/frontier-map-editor.png' | relative_url }}" alt="The Frontier Hunters document open in the Godot map editor"><figcaption>Terrain, starts and resources in the reusable map editor.</figcaption></figure>
    </div>
    <p class="sec-p">The editor preserves campaign and multiplayer metadata when you save a map. The skirmish mode plays one commander against one AI.</p>
    <a class="btn btn-ghost" href="{{ '/projects/robos-rts/#map-editor' | relative_url }}">Map editor tools &amp; controls →</a>
  </div>
</section>

<section class="g-sec" id="interface">
  <div class="wrap">
    <p class="eyebrow">The interface</p>
    <h2 class="h2">Built like an RTS, not a dashboard</h2>
    <p class="sec-p" style="max-width:70ch">Resources, production, selection and commands read live simulation state. Health bars show on selected, hurt or under-construction units. The interface examples below use the older canyon showcase.</p>
    <div class="annot">
      <img loading="lazy" src="{{ '/assets/games/rts/07-production-queue.jpg' | relative_url }}" alt="The Starfall Command interface with a Muster Hall selected and four units queued">
      <span class="pin" style="left:90%;top:11%">1</span>
      <span class="pin" style="left:7.5%;top:88%">2</span>
      <span class="pin" style="left:23%;top:84%">3</span>
      <span class="pin" style="left:56%;top:79%">4</span>
      <span class="pin" style="left:89%;top:90%">5</span>
    </div>
    <ol class="legend">
      <li><b>Resources</b><span>Crystal, aether and supply for the faction you are viewing. Supply turns red when you are capped.</span></li>
      <li><b>Minimap</b><span>Terrain, resources, structures and the camera outline. Click to jump, right click to give orders, red rings when you are hit.</span></li>
      <li><b>Selection</b><span>A portrait rendered from the unit's own 3D model, health and shield, damage and DPS, range, armor and speed.</span></li>
      <li><b>Production</b><span>A five-slot queue with progress. Queue units with the hotkeys or the card.</span></li>
      <li><b>Command card</b><span>Hotkeys in the corner. Hover for cost, stats and the reason a button is unavailable.</span></li>
    </ol>
    <div class="shots">
      <figure><img loading="lazy" src="{{ '/assets/games/rts/08-command-card-tooltip.jpg' | relative_url }}" alt="Tooltip for Train Breacher"><figcaption>Tooltips show cost, build time and stats.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/06-squad-selection.jpg' | relative_url }}" alt="Eight units selected"><figcaption>Box-select a mixed squad; Tab cycles the active type.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/09-build-placement.jpg' | relative_url }}" alt="Build placement ghost"><figcaption>Placement footprints turn green or red; invalid spots explain why.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/14-supply-blocked.jpg' | relative_url }}" alt="Supply blocked message"><figcaption>Capped on supply? The game says so, and the counter goes red.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/12-control-groups-idle-workers.jpg' | relative_url }}" alt="Control groups and idle workers"><figcaption>Control groups and the idle worker button.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/13-controls-overlay.jpg' | relative_url }}" alt="Controls overlay"><figcaption>F1 opens the controls overlay.</figcaption></figure>
    </div>
  </div>
</section>

<section class="g-sec" id="factions">
  <div class="wrap">
    <p class="eyebrow">Playable skirmish factions</p>
    <h2 class="h2">Infantry, swarms and shielded warriors</h2>
    <p class="sec-p">Choose either side’s faction in the lobby. Click <b>TECH</b> in a match to see prerequisites, research and production options.</p>
    <div class="tabs" role="tablist" aria-label="Factions">
      <button role="tab" class="on" data-tab="mg" style="--fc:#4f8cf0">Meridian Guard</button>
      <button role="tab" data-tab="gb" style="--fc:#e0453a">Gnarl Brood</button>
      <button role="tab" data-tab="ac" style="--fc:#f0c43c">Aurelian Concord</button>
    </div>

    <div class="tabpanel on" id="tab-mg">
      <div class="faction">
        <div class="ftext">
          <h3>Meridian Guard</h3>
          <p>Human colonists on the high ground. Cheap infantry, armored line troops and long-range artillery that rewards patience.</p>
          <ul class="ticks">
            <li><b>Surge Injector</b> trades 10 health for 11 seconds of faster movement and fire.</li>
            <li><b>Emplace</b> a Howitzer to reach range 31 with splash damage, at the cost of moving.</li>
            <li><b>Muster Hall modules</b> open a second infantry production line or unlock Efficient Surge research.</li>
            <li><b>Airframe Hangars</b> train Kestrels with air and ground modes and Ramparts that carry up to six troops.</li>
          </ul>
          <p class="muted"><a href="{{ '/projects/robos-rts/#meridian-guard' | relative_url }}">Meridian Guard tech and units →</a></p>
        </div>
        <div class="fimg"><figure><img loading="lazy" src="{{ '/assets/blog/starfall-command-100-point-roadmap/rampart-transport.webp' | relative_url }}" alt="Selected Rampart Transport carrying two Riflemen beside the Airframe Hangar"><figcaption>A Rampart boards two Riflemen before crossing the wall.</figcaption></figure></div>
      </div>
      <div class="shots">
        <figure><img loading="lazy" src="{{ '/assets/games/rts/18-structures-meridian-guard.jpg' | relative_url }}" alt="Meridian structures"><figcaption>Colony Hub, Muster Hall, Workshop.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/rts/19-structures-silo-and-aether-tap.jpg' | relative_url }}" alt="Silos and aether tap"><figcaption>Silo extended, retracted, and an Aether Tap.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/rts/02-gathering-crystal.jpg' | relative_url }}" alt="Gathering crystal"><figcaption>Pioneers mining beside the Colony Hub.</figcaption></figure>
      </div>
    </div>

    <div class="tabpanel" id="tab-gb">
      <div class="faction">
        <div class="ftext">
          <h3>Gnarl Brood</h3>
          <p>The Brood uses living ground for speed, Nest slots for simultaneous hatching and tunnels to move troops between fronts.</p>
          <ul class="ticks">
            <li><b>Brood Keepers</b> spend energy to add Nest slots after a delay.</li>
            <li><b>Skitterlings</b> can burrow, and Bile Crawlers can evolve into armored Carapace Bulwarks.</li>
            <li><b>Drift Sacs</b> supply and scout while Needlewings harass ground units.</li>
          </ul>
          <p class="muted"><a href="{{ '/projects/robos-rts/#gnarl-brood' | relative_url }}">Gnarl Brood tech and units →</a></p>
        </div>
        <div class="fimg"><figure><img loading="lazy" src="{{ '/assets/blog/starfall-command-100-point-roadmap/brood-growth-node.webp' | relative_url }}" alt="Purple living ground spreading around a Brood Nest and Growth Node"><figcaption>A Growth Node extends living ground beyond the Nest.</figcaption></figure></div>
      </div>
      <div class="shots">
        <figure><img loading="lazy" src="{{ '/assets/games/rts/20-brood-base.jpg' | relative_url }}" alt="Brood base"><figcaption>The Brood Nest and its crystal line.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/rts/26-kiting-approach.jpg' | relative_url }}" alt="Skitterling pack approaching"><figcaption>Riflemen hold range against a Skitterling pack.</figcaption></figure>
      </div>
    </div>

    <div class="tabpanel" id="tab-ac">
      <div class="faction">
        <div class="ftext">
          <h3>Aurelian Concord</h3>
          <p>Concord uses regenerating shields, powered Waystones and timed support abilities.</p>
          <ul class="ticks">
            <li><b>Lumen Carriers</b> anchor to supply a temporary power field.</li>
            <li><b>Aegis Wardens</b> block ground paths and warn before Lattice Burst hits units on either side.</li>
            <li><b>Crownspires</b> threaten Massive targets, while the Heartstone can recall a force through a timed marker.</li>
          </ul>
          <p class="muted"><a href="{{ '/projects/robos-rts/#aurelian-concord' | relative_url }}">Aurelian Concord tech and units →</a></p>
        </div>
        <div class="fimg"><figure><img loading="lazy" src="{{ '/assets/blog/starfall-command-100-point-roadmap/concord-power.webp' | relative_url }}" alt="Concord power fields overlapping and labeling Waystone dependencies"><figcaption>Amber marks the Waystone that depends on the selected power source.</figcaption></figure></div>
      </div>
      <div class="shots">
        <figure><img loading="lazy" src="{{ '/assets/games/rts/21-concord-base.jpg' | relative_url }}" alt="Concord base"><figcaption>The Heartstone, Resonator and Waystone.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/rts/19b-structures-brood-and-concord.jpg' | relative_url }}" alt="Brood and Concord structures"><figcaption>Structures side by side.</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="battle">
  <div class="wrap">
    <p class="eyebrow">Canyon mechanics showcase</p>
    <h2 class="h2">Hold the choke</h2>
    <div class="shots">
      <figure><img loading="lazy" src="{{ '/assets/games/rts/33-three-way-battle.jpg' | relative_url }}" alt="Three-way battle"><figcaption>A three-way battle with all three built-in AIs running.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/04-ramp-descent.jpg' | relative_url }}" alt="Squad on the ramp"><figcaption>A squad descends the ramp.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/23-howitzer-line-emplaced.jpg' | relative_url }}" alt="Emplaced Howitzers"><figcaption>Emplaced Howitzers cover the choke.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/24-howitzer-splash-volley.jpg' | relative_url }}" alt="Howitzer volley"><figcaption>A splash shell leaves the line.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/25-howitzer-aftermath.jpg' | relative_url }}" alt="Aftermath"><figcaption>Scorch marks where the wave broke.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/26-kiting-approach.jpg' | relative_url }}" alt="Kiting approach"><figcaption>Riflemen hold range against a Skitterling pack.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/27-kiting-volley.jpg' | relative_url }}" alt="Kiting volley"><figcaption>Stutter-step kiting: fire, then step back.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/28-concord-advance.jpg' | relative_url }}" alt="Concord advance"><figcaption>The Concord advance on a Brood pack.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/29-phase-step-burst.jpg' | relative_url }}" alt="Phase Step"><figcaption>Skirmisher mid Phase Step.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/30-spire-walker-cliff-walk.jpg' | relative_url }}" alt="Cliff walk"><figcaption>A Spire Walker firing across the cliff wall it has just crossed.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/32-silo-gate-retracted.jpg' | relative_url }}" alt="Retracted silo gate"><figcaption>A retracted Silo lets a Howitzer drive through.</figcaption></figure>
      <figure><img loading="lazy" src="{{ '/assets/games/rts/31-silo-gate-extended.jpg' | relative_url }}" alt="Extended silo gate"><figcaption>Extended, the same silo blocks the gap.</figcaption></figure>
    </div>
  </div>
</section>

<section class="g-sec" id="bots">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Drive it with code</p>
      <h2 class="h2">The same game for people, scripts and agents</h2>
      <p class="sec-p">The game serves an HTTP/JSON API. The Cucumber tests, the screenshot pipeline behind this page and your own bots all use it. Every picture on this page is a frame the game rendered while a script played it.</p>
      <pre class="code"><button data-copy>Copy</button><code>from robos_rts_bot_sdk import RTSClient

c = RTSClient("127.0.0.1", 18095)
c.load_scenario_slug("stutter-step-micro")
c.step(120)                                  # advance 120 ticks
riflemen = [u["tag"] for u in c.get_observation()["units"]
            if u["unit_type"] == "rifleman"]
c.command("attack_move", tags=riflemen, x=70.0, y=40.0)
c.key("T")                                   # real hotkey: Surge Injector
c.screenshot("/tmp/frame.png")</code></pre>
      <div class="pills"><span>/observation</span><span>/action</span><span>/step</span><span>/pause</span><span>/scenario</span><span>/directive</span><span>/input</span><span>/ui</span><span>/camera</span><span>/screenshot</span></div>
      <p class="sec-p" style="margin-top:22px">The live suite authors and reloads maps, then plays paid Rush, Siege and Economy builds against different AI difficulties through to victory. Only the live frame clock advances time; the live client rejects manual stepping. Backend fixtures separately check economy, combat, navigation and editor behavior.</p>
      <pre class="code"><button data-copy>Copy</button><code># From games/robos-rts, with GODOT_BIN configured
python run_cucumber_tests.py --backend
python run_cucumber_tests.py --realtime-headless --speed=8
python run_cucumber_tests.py --realtime --speed=8 --record</code></pre>
      <p class="sec-p">The completed roadmap build passed 102 rendered scenarios, 33 backend scenarios and ten focused Godot suites. All four paid Frontier Hunters build orders reached structure elimination. <a href="{{ '/blog/starfall-command-100-point-roadmap/' | relative_url }}">Read the engineering post →</a></p>
    </div>
  </div>
</section>

<section class="g-sec" id="play">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Play</p>
      <h2 class="h2">Run it from source</h2>
      <p class="sec-p">Use <a style="text-decoration:underline" href="https://godotengine.org/download" target="_blank" rel="noopener">Godot 4.3 or newer</a> and Git. On Windows, open <code>games/robos-rts/project.godot</code> and press <b>F5</b>. On Linux or macOS, run the launcher below. The title screen opens skirmish setup, scenarios and the editor. Press <b>F1</b> for battlefield controls.</p>
      <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos/games/robos-rts
GODOT_BIN=/path/to/godot4 ./play.sh</code></pre>
      <div class="cta" style="justify-content:flex-start;margin-top:18px"><a class="btn" href="{{ '/projects/robos-rts/' | relative_url }}">Full guide &amp; controls</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/robos-rts" target="_blank" rel="noopener">Source on GitHub</a></div>
    </div>
  </div>
</section>
<script src="{{ '/assets/site.js' | relative_url }}" defer></script>
