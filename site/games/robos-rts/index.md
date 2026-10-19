---
layout: game
title: "Starfall Command (RobOS RTS)"
permalink: /games/robos-rts/
description: "Starfall Command: a three-faction real-time strategy game built by AI agents in RobOS. Angled 3D camera, a deterministic 64 Hz simulation, a full RTS interface and an HTTP bot API. Godot 4."
bg_video: /assets/games/rts-bg.mp4
bg_poster: /assets/games/rts-bg-poster.jpg
accent: "#58b4ff"
---
<section class="g-hero wrap">
  <p class="kicker">RobOS RTS</p>
  <h1 class="g-title">Starfall Command</h1>
  <p class="lead">Mine crystal, raise a base and break the canyon. Three asymmetric factions, one ramp, and a simulation so deterministic that the same match plays out identically for a person, a script or a test.</p>
  <div class="cta"><a class="btn" href="#play">Play it</a><a class="btn btn-ghost" href="#factions">Meet the factions</a><a class="btn btn-ghost" href="{{ '/games/robos-rts/docs/' | relative_url }}">Read the docs</a></div>
  <span class="scroll">Scroll ↓</span>
</section>

<section class="g-sec" id="about">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">The game</p>
      <h2 class="h2">A real RTS, built from first principles</h2>
      <p class="sec-p">Starfall Canyon is a plateau and a low plain joined by a single ramp. The Meridian Guard hold the high ground; the Gnarl Brood and the Aurelian Concord fight over the valley below. Gather crystal and aether, build, queue units and hold the choke, or break it.</p>
      <div class="grid3">
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/mountain.svg" alt="" width="48" height="48" loading="lazy"></div><h3>High ground &amp; a single ramp</h3><p>Plateaus, wedge ramps and cliff walls ground units cannot cross. A Provision Silo can retract into the floor to open a gate, or extend to close it.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/balance.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Three asymmetric factions</h3><p>Infantry and artillery, a fast swarm, and shielded warriors that phase through combat. Different economies of attention, not reskins.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/target.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Micro that matters</h3><p>Every weapon has a wind-up and a recovery. Move during the recovery and you cancel it, which makes stutter-step kiting real.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/compass.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Pathfinding that behaves</h3><p>Funnel-smoothed A*, crowd steering and push priority: idle units yield to marching ones and return to their posts.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/clock.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Fixed 64 Hz simulation</h3><p>The sim runs on its own clock, separate from rendering and seeded. Same inputs, same match, every time.</p></div>
        <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/robot.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Built for bots</h3><p>An HTTP/JSON observe-act-step API drives the same game the tests and your own agents play.</p></div>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="interface">
  <div class="wrap">
    <p class="eyebrow">The interface</p>
    <h2 class="h2">Built like an RTS, not a dashboard</h2>
    <p class="sec-p" style="max-width:70ch">Every element is something you would use in a match, and every number is live sim state. Health bars show only on what is selected, hurt or under construction.</p>
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
    <p class="eyebrow">Three factions</p>
    <h2 class="h2">Pick a side</h2>
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
            <li><b>Provision Silos</b> double as a gate you can open and close.</li>
          </ul>
          <p class="muted">Pioneer · Rifleman · Breacher · Howitzer<br>Colony Hub · Provision Silo · Aether Tap · Muster Hall · Workshop</p>
        </div>
        <div class="fimg"><figure><img loading="lazy" src="{{ '/assets/games/rts/15-roster-meridian-guard.jpg' | relative_url }}" alt="Meridian Guard units"><figcaption>The Meridian Guard roster.</figcaption></figure></div>
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
          <p>A monster swarm. Fast, cheap bodies that overwhelm in numbers and one nest that spawns all of them.</p>
          <ul class="ticks">
            <li><b>Skitterlings</b> are the fastest units in the game and fall to splash.</li>
            <li><b>Bile Crawlers</b> spit acid with real range and bonus damage to structures.</li>
            <li><b>Blight Hurlers</b> lob corrosive splash over the front line.</li>
          </ul>
          <p class="muted">Forager · Skitterling · Bile Crawler · Blight Hurler<br>Brood Nest</p>
        </div>
        <div class="fimg"><figure><img loading="lazy" src="{{ '/assets/games/rts/16-roster-gnarl-brood.jpg' | relative_url }}" alt="Gnarl Brood units"><figcaption>The Gnarl Brood roster.</figcaption></figure></div>
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
          <p>Shielded warriors. Every unit and structure has an Aegis Shield that absorbs damage first and regenerates out of combat.</p>
          <ul class="ticks">
            <li><b>Phase Step</b> teleports a Skirmisher up to 18 range when its shield breaks.</li>
            <li><b>Sunblade Rush</b> closes the gap in a burst.</li>
            <li><b>Spire Walkers</b> walk straight over cliff walls.</li>
          </ul>
          <p class="muted">Mote · Sunblade · Skirmisher · Spire Walker<br>Heartstone · Resonator · Waystone</p>
        </div>
        <div class="fimg"><figure><img loading="lazy" src="{{ '/assets/games/rts/17-roster-aurelian-concord.jpg' | relative_url }}" alt="Aurelian Concord units"><figcaption>The Aurelian Concord roster.</figcaption></figure></div>
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
    <p class="eyebrow">In the field</p>
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
      <p class="sec-p" style="margin-top:22px">Six end-to-end scenarios guard the engine: crowd steering through a gate, kiting, Howitzer splash, Phase Step and cliff walking, the economy, and a three-AI battle that guards against a pathfinding stall. They run headless in a few seconds.</p>
    </div>
  </div>
</section>

<section class="g-sec" id="play">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Play</p>
      <h2 class="h2">Run it from source</h2>
      <p class="sec-p">You need <a style="text-decoration:underline" href="https://godotengine.org/download" target="_blank" rel="noopener">Godot 4.3</a> and Git. Press <b>F1</b> in the game for the controls.</p>
      <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos/games/robos-rts
GODOT_BIN=/path/to/godot4 ./play.sh</code></pre>
      <div class="cta" style="justify-content:flex-start;margin-top:18px"><a class="btn" href="{{ '/v1/projects/robos-rts/' | relative_url }}">Full guide &amp; controls</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/robos-rts" target="_blank" rel="noopener">Source on GitHub</a></div>
    </div>
  </div>
</section>
<script src="{{ '/assets/site.js' | relative_url }}" defer></script>
