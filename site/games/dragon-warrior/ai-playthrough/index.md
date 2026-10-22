---
layout: game
title: "Dragon Warrior · AI Playthrough"
permalink: /games/dragon-warrior/ai-playthrough/
description: "The robos-jrpg engine plays the whole of Dragon Warrior, from King Lorik's throne room to the Dragonlord, using only real inputs: a 70-entry milestone registry, a route-planning survival brain, per-milestone videos and checkpoints, deadlock watchdogs, and a GNOME tray icon + live dashboard."
bg_poster: /assets/games/dragon-warrior/playthrough/m38-level-10-desert.png
accent: "#00bcd4"
---
<style>
  .pt-grid{grid-template-columns:repeat(4,1fr)}
  .pt-grid img{aspect-ratio:16/15;object-fit:contain;background:#000}
  .pt-grid.two{grid-template-columns:repeat(2,1fr)}
  .pt-grid.two img{aspect-ratio:auto}
  .pt-step{display:grid;grid-template-columns:1.1fr 1fr;gap:26px;align-items:start;margin-top:30px}
  .pt-step figure{margin:0;border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden;background:#000}
  .pt-step img{display:block;width:100%}
  .pt-step figcaption{padding:10px 14px;font-size:.84rem;color:#b9b3a4}
  .pt-fig{margin:26px 0 0;border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden;background:#000}
  .pt-fig img{width:100%;display:block}
  .pt-fig figcaption{padding:10px 14px;font-size:.84rem;color:#b9b3a4}
  .mermaid{background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:18px;margin-top:26px;overflow-x:auto}
  .pt-h3{font-size:1.35rem;margin-top:40px;color:#fff}
  @media(max-width:900px){.pt-grid,.pt-grid.two{grid-template-columns:1fr 1fr}.pt-step{grid-template-columns:1fr}}
</style>

<section class="g-hero wrap" style="min-height:70vh">
  <p class="kicker">Dragon Warrior · Autonomous Agent Governance</p>
  <h1 class="g-title" style="font-size:clamp(2.2rem,6vw,4.6rem)">AI Playthrough</h1>
  <p class="lead">The robos-jrpg engine plays the <em>whole</em> game &mdash; King Lorik's throne room to the Dragonlord &mdash; with nothing a human player does not have: real controller inputs and what is on the screen. Every milestone becomes a video, a save checkpoint and a screenshot, and a GNOME tray icon lets you follow a two-hour run without watching it.</p>
  <div class="cta">
    <a class="btn" href="#how">How it works</a>
    <a class="btn btn-ghost" href="#dashboard">Tray &amp; dashboard</a>
    <a class="btn btn-ghost" href="#gallery">Screenshot gallery</a>
    <a class="btn btn-ghost" href="{{ '/games/dragon-warrior/' | relative_url }}">Back to the game</a>
  </div>
</section>

<section class="g-sec" id="why">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Why</p>
      <h2 class="h2">Reachable is not the same as beatable</h2>
      <p class="sec-p">The <a href="{{ '/games/dragon-warrior/proof-of-viability.html' | relative_url }}">BFS proof of viability</a> walks every connected <code>(map, col, row)</code> state and proves every chest, stair, door and the Dragonlord's altar can be <em>reached</em>. It says nothing about whether a hero with the gold, levels, spells and herbs the game actually hands out can <em>get there alive</em>, afford the Broad Sword, survive Charlock's basement, or beat the Dragonlord's second form. Those are economy, combat-formula and inventory questions, and the only honest way to answer them is to play the game.</p>
      <p class="sec-p">So the game plays itself. <code>PlayGameBrain.gd</code> is a "play the game" mode of the in-engine <code>AIEngine.gd</code>: it presses <code>move_up/down/left/right</code>, <code>ui_accept</code> and <code>cmd_menu</code>, and reads state through the same HTTP IPC web service the E2E tests use (<code>GameControlServer.gd</code>, <code>GET /api/v1/state</code>). No teleports, no stat edits, no peeking at hidden RNG. If it cannot finish, the game has a bug.</p>
      <div class="facts">
        <div><b>70</b><span>Milestones in the registry (every chest, purchase, quest item, level gate, boss)</span></div>
        <div><b>~2 h</b><span>Wall-clock for a full run at time-scale 8</span></div>
        <div><b>~800</b><span>Random battles per run</span></div>
        <div><b>L21&ndash;22</b><span>Hero level when the Dragonlord falls, with 0&ndash;1 deaths</span></div>
      </div>
      <div class="shots pt-grid" style="margin-top:28px">
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m01-throne-room-king-lorik.png' | relative_url }}" alt="Throne room: the AI opens the first chest and finds 120 gold"><figcaption>#1 &mdash; King Lorik's throne room. The run starts where a new game starts.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m15-level-3-red-slime.png' | relative_url }}" alt="A Red Slime draws near: the first level gate"><figcaption>#15 &mdash; the first level gate (level 3) is grinding Red Slimes outside Tantegel.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m44-swamp-cave-gwaelin.png' | relative_url }}" alt="Swamp Cave: Princess Gwaelin's cell"><figcaption>#44 &mdash; Princess Gwaelin rescued in the Swamp Cave at level 10.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m49-level-15-metal-scorpion.png' | relative_url }}" alt="Metal Scorpion battle while grinding for level 15"><figcaption>#49 &mdash; level 15 (REPEL) before the Staff of Rain, from an earlier run.</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="how">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Architecture</p>
      <h2 class="h2">Driver, IPC web service, brain, dashboard</h2>
      <p class="sec-p">Four pieces, three of which only talk HTTP and JSON. The Python driver is "the user": it boots Godot on an Xvfb display, enables the mode with one IPC command and from then on only observes. The brain lives inside the engine and is the only thing that presses buttons. The dashboard reads a <code>live.json</code> the driver rewrites once a second and asks the game for a screenshot every 1.5&nbsp;s.</p>
      <pre class="mermaid">
flowchart LR
  subgraph Driver["tests/e2e/play_full_game.py (Python)"]
    D1[boot Godot on Xvfb]
    D2[start_play_game]
    D3[poll /api/v1/state + get_milestones]
    D4[assert invariants<br>stall-timeout watchdog]
    D5[ffmpeg per-milestone video<br>export_save_state checkpoint<br>screenshot]
    D6[live.json every 1 s<br>playthrough.json]
  end
  subgraph Godot["Godot 4 · games/dragon-warrior"]
    W["GameControlServer.gd<br>GET /api/v1/state<br>POST /api/v1/command"]
    B["PlayGameBrain.gd<br>(AIEngine play-the-game mode)"]
    R["RoutePlanner.gd"]
    M["data/v1/milestones.json<br>70 ordered objectives"]
    G["Game scenes · CombatEngine · PlayerState"]
    B -->|real inputs| G
    G -->|state| B
    B --> R
    M --> B
    W <--> B
    W <--> G
  end
  subgraph Dash["tools/playthrough-dashboard (Electron)"]
    T["GNOME tray icon<br>progress ring + menu"]
    V["Dashboard window<br>live state · screenshots · milestone cards"]
  end
  D2 -->|POST command| W
  D3 -->|HTTP| W
  D6 -->|reports/playthrough/live.json| V
  D5 -->|videos/NN-id.mp4<br>checkpoints/NN-id.json| V
  V -->|capture_screenshot / stop_play_game| W
  V --> T
      </pre>
      <div class="grid3" style="margin-top:28px">
        <div class="card"><h3>Milestone registry</h3><p><code>tools/gen_milestones.py</code> derives <code>data/v1/milestones.json</code> from the chest, shop, quest and level-curve registries: every weapon, armor and shield purchase, every chest, each quest item, level gates before dangerous zones, the Dragonlord and the ending. Each entry says where to stand, which command to use, the <code>min_level</code> and gold needed, and a <code>done_when</code> predicate the brain checks against game state.</p></div>
        <div class="card"><h3>The brain</h3><p><code>PlayGameBrain.gd</code> always seeks the next unfinished milestone. <code>RoutePlanner.gd</code> plans the multi-map route (stairs, doors, bridges, the Rainbow Bridge) over the real walkability grids; the brain walks it one tile at a time with the same stride inputs the demo AI uses.</p></div>
        <div class="card"><h3>Survival policy</h3><p>Kill-before-die battle maths from <code>combat_formulas.json</code>; zone-aware heal thresholds (survive two worst-case hits from the local encounter pool); tiered HEAL / herb / HEALMORE; inn trips only when out of heal MP and herbs; herb restock from every item shop; MP conservation inside Charlock and HEALMORE-only healing against the Dragonlord. NES pack rules hold: eight tool slots, six per stack, no dropping.</p></div>
        <div class="card"><h3>Deadlock watchdog (brain)</h3><p>A wall-clock progress watchdog fires after 90&nbsp;s with no change in milestone, battles, level, gold, map, tile, herbs or HP. It drops the current objective and plan, blacklists an unreachable supply shop, and after three stalls on one milestone skips it if optional or fails the run.</p></div>
        <div class="card"><h3>Deadlock watchdog (driver)</h3><p><code>--stall-timeout</code> (default 600&nbsp;s) ends a run whose done-count, battles, level, gold and EXP stop changing with status <code>stalled</code>, a <code>screenshots/stall.png</code> and the tail of the brain's event log, so a hung run never burns the night.</p></div>
        <div class="card"><h3>Invariants</h3><p>The driver asserts things a real player could never do: the hero is never standing on water or mountains, HP is never negative, and no input loop repeats forever. Violations are recorded in <code>playthrough.json</code> and shown in the dashboard.</p></div>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="driver">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">The driver</p>
      <h2 class="h2">One video and one checkpoint per milestone</h2>
      <p class="sec-p">A single two-hour recording is nearly useless for review. In <code>--stepped</code> mode the driver cuts the ffmpeg capture at every milestone boundary into <code>reports/playthrough/videos/NN-&lt;id&gt;.mp4</code>, asks the game to <code>export_save_state</code> into <code>checkpoints/NN-&lt;id&gt;.json</code> and takes <code>screenshots/NN-&lt;id&gt;.png</code>. Trivial milestones (a chest two tiles away) are one-second clips; level gates and expensive purchases are the five-minute grinds. Because every milestone has a checkpoint, <code>--only N</code> loads <code>checkpoints/(N-1)-*.json</code> with <code>load_save_state</code> and replays just that milestone, so a fix can be re-verified in seconds instead of two hours.</p>
      <figure class="pt-fig">
        <img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/filmstrip-milestone-videos.jpg' | relative_url }}" alt="Filmstrip: one frame from each of the milestone videos recorded so far">
        <figcaption>One frame from each per-milestone video of a live run. The duration in the corner shows how uneven milestones are: chests take a second, "Buy Half Plate" took 342&nbsp;s of grinding Scorpions and Druins.</figcaption>
      </figure>
      <pre class="code" style="margin-top:26px"><button data-copy>Copy</button><code>cd games/dragon-warrior

python3 tests/e2e/play_full_game.py                       # whole game, headless, ~2 h at the default time scale
python3 tests/e2e/play_full_game.py --until 18            # stop after milestone 18 (Copper Sword)
DW_HEADED=1 python3 tests/e2e/play_full_game.py           # watch it on the desktop
python3 tests/e2e/play_full_game.py --record              # + playthrough.mp4 and a 12x time-lapse
python3 tests/e2e/play_full_game.py --stepped             # one video + checkpoint + screenshot per milestone
python3 tests/e2e/play_full_game.py --stepped --only 42   # replay milestone 42 from checkpoints/41-*.json
python3 tests/e2e/play_full_game.py --stepped --from 42   # resume from checkpoint 41 to the ending
python3 tests/e2e/play_full_game.py --stall-timeout 300   # driver-side deadlock detector (default 600 s)
python3 tests/e2e/play_full_game.py --dashboard off       # stepped/recorded runs start the tray + dashboard by default

# Regenerate the milestone registry after changing shops, chests or quests
python3 tools/gen_milestones.py</code></pre>
      <table class="t" style="margin-top:26px">
        <tr><th>Artifact</th><th>Path under <code>tests/e2e/reports/playthrough/</code></th><th>Written</th></tr>
        <tr><td>Run report</td><td><code>playthrough.json</code></td><td>Status, battles, deaths, elapsed, violations, per-milestone timings; at the end of the run</td></tr>
        <tr><td>Live feed</td><td><code>live.json</code></td><td>Once a second: status, done count, stats, battle, objective, recent AI inputs, event log, milestone list</td></tr>
        <tr><td>Milestone video</td><td><code>videos/NN-&lt;id&gt;.mp4</code></td><td>At each milestone boundary in <code>--stepped</code> mode (<code>_current.mp4</code> while recording)</td></tr>
        <tr><td>Checkpoint</td><td><code>checkpoints/NN-&lt;id&gt;.json</code></td><td>Full save state via <code>export_save_state</code>: level, HP/MP, gold, equipment, items, opened chests, unlocked doors, quest flags, map and tile</td></tr>
        <tr><td>Screenshot</td><td><code>screenshots/NN-&lt;id&gt;.png</code>, <code>stall.png</code>, <code>final.png</code></td><td>At each milestone, on a stall, and when the run ends</td></tr>
      </table>
      <div class="shots pt-grid" style="margin-top:28px">
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-brecconary-shop-window.jpg' | relative_url }}" alt="Brecconary weapon shop window: What dost thou want? Bamboo Pole 10G"><figcaption>Frame from <code>11-buy-bamboo_pole</code>: the brain navigates a real shop menu.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-drakee-battle.png' | relative_url }}" alt="Drakee battle command menu"><figcaption>Frame from <code>18-buy-copper_sword</code> (204&nbsp;s): grinding Drakees for 180 gold.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-battle-victory-text.jpg' | relative_url }}" alt="Thou hast done well! Erdrick earns 3 XP and 4 GP"><figcaption>Frame from <code>23-buy-chain_mail</code>: the reward text the brain waits through with <code>ui_accept</code>.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-hurt-spell-skeleton.png' | relative_url }}" alt="Erdrick casts HURT on a Skeleton"><figcaption>Frame from <code>38-level-10</code> (309&nbsp;s): HURT on a Skeleton while grinding in the desert.</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="dashboard">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Following a run</p>
      <h2 class="h2">The tray icon and the live dashboard</h2>
      <p class="sec-p">A two-hour autonomous run has a visibility problem: you want to know <em>at a glance</em> whether it is still alive, how far along it is, and what it is doing, without a terminal scrolling JSON. <code>tools/playthrough-dashboard</code> is a small Electron app that stepped and recorded runs start automatically (<code>--dashboard on|off|auto</code>). It stays open after the run; quit it from the tray menu.</p>

      <div class="pt-step">
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/tray-menu.png' | relative_url }}" alt="GNOME top bar with the Dragon Warrior tray icon and its context menu"><figcaption>The tray icon's progress ring and context menu, rendered from a live <code>live.json</code> exactly as the dashboard draws them.</figcaption></figure>
        <div>
          <h3 style="color:#fff;margin:0 0 8px">Tray icon</h3>
          <p class="sec-p" style="margin-top:0">A 32-px progress ring drawn on a canvas and pushed to the tray whenever status or done-count changes: cyan while running, green when done, grey while waiting, red on a crash or stall. Its context menu, rebuilt every 3&nbsp;s, shows:</p>
          <ul class="ticks">
            <li>One summary line: status · done/total milestones · level · HP · gold · battles · deaths</li>
            <li>The current milestone (<code>▶ #47 Buy Magic Armor at Rimuldar</code>) and the brain's current objective ("grind for level 12 before &hellip;")</li>
            <li><strong>Show dashboard</strong>, <strong>Open latest milestone video</strong>, <strong>Open videos folder</strong>, <strong>Open reports folder</strong></li>
            <li><strong>Stop run</strong> (sends <code>stop_play_game</code> over IPC; enabled only while the driver is alive) and <strong>Quit dashboard</strong></li>
          </ul>
          <p class="sec-p">Click the icon to toggle the window; the tooltip carries the same summary line.</p>
        </div>
      </div>

      <h3 class="pt-h3">Live view</h3>
      <figure class="pt-fig" style="margin-top:14px">
        <img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/dashboard-live.png' | relative_url }}" alt="Dashboard live view: progress bar, stat chips, live screenshot of a Scorpion battle, battle panel, equipment and pack, AI inputs, brain event log, milestone list">
        <figcaption>The live view 43 minutes into a run: 45 / 70 milestones, level 11, 861 battles, 0 deaths, mid-fight with a Scorpion while grinding for Magic Armor.</figcaption>
      </figure>
      <div class="grid3" style="margin-top:22px">
        <div class="card"><h3>Header</h3><p>Status pill (<code>RUNNING</code>, <code>DONE</code>, <code>STALLED</code>, <code>CRASHED</code>), elapsed time and time scale, a progress bar over the 70 milestones, and stat chips: level, HP, MP, gold, EXP, ATK/DEF, battles, deaths, scene and tile. The "Now:" line names the current milestone and the brain's sub-objective.</p></div>
        <div class="card"><h3>Live game</h3><p>A screenshot refreshed every 1.5&nbsp;s through <code>capture_screenshot</code> (it writes <code>live.png</code> in the reports folder), with the scene and map key beside the heading.</p></div>
        <div class="card"><h3>Battle</h3><p>Current monster and its HP, monster ATK/DEF, hero HP/MP and whether STOPSPELL landed, straight from <code>/api/v1/state</code>'s battle block.</p></div>
        <div class="card"><h3>Equipment &amp; pack</h3><p>Weapon, armor, shield and the full pack with stacks collapsed (<code>Herb ×5</code>), so you can see the NES eight-slot rule and herb restocks working.</p></div>
        <div class="card"><h3>AI inputs</h3><p>The last ~20 inputs the brain pressed, including stride targets (<code>move_up(stride:9-&gt;100,16)</code>) and the current stride target tile.</p></div>
        <div class="card"><h3>Brain event log</h3><p>The brain's own event log (<code>L11 cast: hurt vs scorpion (hp 44/59 mp 12)</code>, field heals, inn trips, watchdog stalls, skipped milestones) plus any invariant violations the driver recorded.</p></div>
      </div>

      <h3 class="pt-h3">Milestone cards</h3>
      <p class="sec-p">The left column lists all 70 milestones with their type and whether a checkpoint exists; "follow run" keeps the current one in view. Every finished milestone is a clickable card that plays its video, shows the save checkpoint taken right after it (location, level, EXP, gold, HP/MP, ATK/DEF, equipment) and the milestone screenshot. <strong>Reveal video</strong> opens the file in the file manager; <strong>Replay command</strong> copies the exact <code>play_full_game.py --stepped --only N</code> command line.</p>
      <div class="shots pt-grid two" style="margin-top:22px">
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/dashboard-milestone-1.png' | relative_url }}" alt="Milestone card #1 Hear King Lorik's quest with its 2-second video and the checkpoint: ThroneRoom (5,5), level 1, 120 gold"><figcaption>#1 Hear King Lorik's quest &mdash; a two-second clip and the first checkpoint: ThroneRoom (5,5), level 1, 120 gold.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/dashboard-milestone-15.png' | relative_url }}" alt="Milestone card #15 Reach level 3 with video and checkpoint: WorldMap (46,33), level 3, 196 gold, club"><figcaption>#15 Reach level 3 (HEAL) &mdash; 80&nbsp;s of Red Slimes; checkpoint at WorldMap (46,33), level 3, club equipped.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/dashboard-milestone-38.png' | relative_url }}" alt="Milestone card #38 Reach level 10 with a Scorpion battle frame and checkpoint: WorldMap (116,32), level 10, 1310 gold, hand axe"><figcaption>#38 Reach level 10 (STOPSPELL) &mdash; 309&nbsp;s grinding in the desert; checkpoint at level 10 with 1310 gold.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/dashboard-milestone-44.png' | relative_url }}" alt="Milestone card #44 Rescue Princess Gwaelin with a Poltergeist battle frame and checkpoint: SwampCave (5,15), level 10, 2156 gold"><figcaption>#44 Rescue Princess Gwaelin &mdash; the Swamp Cave run; checkpoint at SwampCave (5,15) with 2156 gold.</figcaption></figure>
      </div>
      <figure class="pt-fig" style="margin-top:14px">
        <img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/dashboard-milestone-46.png' | relative_url }}" alt="Milestone card #46 Buy Broad Sword at Rimuldar: video of the shop dialog and the checkpoint showing broad_sword equipped and gold down to 1045">
        <figcaption>#46 Buy Broad Sword at Rimuldar (1500G) &mdash; the card's video shows the shop dialog; the checkpoint confirms <code>broad_sword</code> equipped and gold down from 2387 to 1045.</figcaption>
      </figure>
      <pre class="code" style="margin-top:26px"><button data-copy>Copy</button><code># Run the dashboard on its own against any reports folder / game port
cd games/dragon-warrior/tools/playthrough-dashboard && npm install
npx electron --no-sandbox . --reports ../../tests/e2e/reports/playthrough --port 19260

# Debug aids for headless agents
npx electron --no-sandbox . --snapshot out.png               # write a PNG of the window after 5 s
npx electron --no-sandbox . --select 44 --snapshot out.png   # open milestone 44's card first</code></pre>
    </div>
  </div>
</section>

<section class="g-sec" id="bugs">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">What it found</p>
      <h2 class="h2">Every bug the brain hit was a game bug</h2>
      <p class="sec-p">The rule in <code>games/dragon-warrior/AGENTS.md</code> is "fix the game, not the brain", and it held. Teaching the AI to finish the game surfaced defects that neither the BFS audit nor the chained Cucumber checkpoints could see, because they only show up when a hero with the real economy and real stats tries to progress:</p>
      <ul class="ticks">
        <li><strong>Charlock 1F exit gate unwalkable</strong> &mdash; reachable on the BFS grid, but the AI could never leave the castle after Erdrick's Sword.</li>
        <li><strong>Kol NPC blocking the item-shop doorway</strong> &mdash; a wandering villager parked in a one-tile door and deadlocked the herb restock; the watchdog caught it, the fix capped shop retries and moved the NPC.</li>
        <li><strong>Consumables not stacking</strong> &mdash; herbs filled all eight tool slots, so chests with quest items were skipped under the NES "no dropping" rule.</li>
        <li><strong>Missing level-up curves</strong> and <strong>incorrect flee factors and spell resistances</strong> &mdash; the hero either could not reach a level gate or kept losing to monsters that should have run.</li>
        <li><strong>Boss fights not syncing the pack</strong>, <strong>duplicate chests</strong>, <strong>a Cantlin item shop with no stock</strong>, and <strong>Wings doing nothing on the overworld</strong> (the brain uses them to fly home from Charlock when its MP commit bar is short).</li>
        <li><strong>Magic Armor tie rule</strong> &mdash; Magic Armor and Erdrick's Armor compared equal, so the brain kept re-buying; fixed in the equipment comparison, together with a death-adaptive grind policy (each death outside grinding raises the current milestone's required level by one).</li>
      </ul>
      <div class="shots pt-grid" style="margin-top:28px">
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m41-mountain-cave-items-pack.png' | relative_url }}" alt="The ITEMS window in the Mountain Cave showing herbs, quest items and equipment"><figcaption>#41 &mdash; the pack mid-Mountain Cave: quest items, five herbs and equipment under the eight-slot rule.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m33-kol-chest.png' | relative_url }}" alt="Kol village chest with the TAKE command menu"><figcaption>#33 &mdash; Kol, where an NPC in the item-shop door once deadlocked the run.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m19-erdricks-cave-b2-tablet.png' | relative_url }}" alt="Erdrick's Cave B2 in darkness with the torch radius"><figcaption>#19 &mdash; Erdrick's Tablet in the dark of Erdrick's Cave B2.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m52-cantlin-chest.png' | relative_url }}" alt="Cantlin fortress town chest"><figcaption>#52 &mdash; Cantlin, whose item shop had no stock until the brain tried to restock there (earlier run).</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="gallery">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Gallery</p>
      <h2 class="h2">Milestone screenshots from a live run</h2>
      <p class="sec-p">Each image is the <code>screenshots/NN-&lt;id&gt;.png</code> the driver takes the moment a milestone's <code>done_when</code> predicate turns true. Click any image to enlarge. The late-game shots (Gwaelin's return onwards) are from an earlier run; the current run was between Rimuldar and Cantlin when this page was written.</p>
      <div class="shots pt-grid" style="margin-top:28px">
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m02-throne-room-magic-key.png' | relative_url }}" alt="Thou dost find Magic Key"><figcaption>#2 Magic Key from the throne room chest.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m05-throne-room-door.png' | relative_url }}" alt="Tantegel 1F after opening the throne room door"><figcaption>#5 Throne room door opened; down to Tantegel 1F.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m07-tantegel-1f-chest-take-menu.png' | relative_url }}" alt="Command menu with TAKE highlighted at a Tantegel 1F chest"><figcaption>#7 TAKE at a Tantegel 1F chest via <code>cmd_menu</code>.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m10-tantegel-basement-stones-of-sunlight.png' | relative_url }}" alt="Tantegel basement, Stones of Sunlight chest"><figcaption>#10 Stones of Sunlight in the Tantegel basement.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m11-brecconary-bamboo-pole.png' | relative_url }}" alt="Bamboo Pole is now equipped, Brecconary"><figcaption>#11 Bamboo Pole equipped in Brecconary (optional milestone).</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m12-brecconary-buy-club.png' | relative_url }}" alt="Then I will buy thy Bamboo Pole for 5 gold"><figcaption>#12 Buying the Club &mdash; the shopkeeper buys back the pole.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m18-brecconary-copper-sword.png' | relative_url }}" alt="Copper Sword is now equipped"><figcaption>#18 Copper Sword (180G) after a 204-second grind.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m20-garinham-chest-take.png' | relative_url }}" alt="Garinham chest with TAKE highlighted"><figcaption>#20 First chest in Garinham.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m23-garinham-chain-mail.png' | relative_url }}" alt="Garinham after buying Chain Mail"><figcaption>#23 Chain Mail bought at Garinham.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m24-level-7-overworld.png' | relative_url }}" alt="Alefgard overworld at level 7"><figcaption>#24 Level 7 reached on the overworld near Garinham.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m26-garins-grave-b1-chests.png' | relative_url }}" alt="Garin's Grave B1 chests in torch light"><figcaption>#26 Garin's Grave B1 chests in torch light.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m29-garins-grave-b3-wolflord.png' | relative_url }}" alt="Wolflord battle with SPELL selected in Garin's Grave B3"><figcaption>#29 A Wolflord in Garin's Grave B3; the brain picks SPELL.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m32-garinham-half-plate.png' | relative_url }}" alt="Half Plate is now equipped"><figcaption>#32 Half Plate (1000G) &mdash; the longest grind so far at 342&nbsp;s.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m36-kol-fairy-flute.png' | relative_url }}" alt="Kol village, searching for the Fairy Flute"><figcaption>#36 Fairy Flute found by SEARCH in Kol.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m38-level-10-desert.png' | relative_url }}" alt="Desert overworld at level 10"><figcaption>#38 Level 10 in the desert east of Kol.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m39-mountain-cave-b1.png' | relative_url }}" alt="Mountain Cave B1 chest"><figcaption>#39 Mountain Cave B1.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m45-rimuldar-wings-chest.png' | relative_url }}" alt="Rimuldar town chest with Wings"><figcaption>#45 Wings from the Rimuldar chest &mdash; the brain's way home from Charlock.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m46-rimuldar-broad-sword.png' | relative_url }}" alt="Then I will buy thy Hand Axe for 280 gold, Rimuldar"><figcaption>#46 Broad Sword (1500G) at Rimuldar; the Hand Axe is sold back.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m47-return-gwaelin-king-lorik.png' | relative_url }}" alt="King Lorik: Thou hast rescued my daughter Gwaelin"><figcaption>#48 Gwaelin returned to King Lorik (earlier run).</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m50-northern-cave-staff-of-rain.png' | relative_url }}" alt="Northern shrine, Staff of Rain"><figcaption>#50 Staff of Rain in the northern shrine (earlier run).</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m51-erdricks-token-swamp.png' | relative_url }}" alt="Overworld swamp where Erdrick's Token is dug up"><figcaption>#51 Erdrick's Token dug up in the swamp (earlier run).</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m54-cantlin-chest-3.png' | relative_url }}" alt="Cantlin third chest"><figcaption>#54 Cantlin's third chest (earlier run).</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/replay-m12-brecconary-shop-window.png' | relative_url }}" alt="Brecconary shop window with 136 gold during a replay of milestone 12"><figcaption><code>--only 12</code> replay: the shop window at the moment the checkpoint loads.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-erdricks-cave-torch-radius.png' | relative_url }}" alt="Erdrick's Cave with a one-tile torch radius"><figcaption>Video frame: Erdrick's Cave with the torch radius.</figcaption></figure>
      </div>
      <h3 class="pt-h3">Battles, from the videos</h3>
      <div class="shots pt-grid" style="margin-top:14px">
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-magidrakee-battle.png' | relative_url }}" alt="Magidrakee battle"><figcaption>Magidrakee, Garin's Grave B3.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-magician-draws-near.png' | relative_url }}" alt="A Magician draws near"><figcaption>A Magician draws near &mdash; STOPSPELL territory.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-scorpion-spell-menu.png' | relative_url }}" alt="Scorpion battle with SPELL selected"><figcaption>Scorpion; HURT is cheaper than two sword rounds.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-skeleton-takes-damage.png' | relative_url }}" alt="The Skeleton takes 16 damage"><figcaption>Skeleton in the Mountain Cave takes 16 damage.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-druin-battle.png' | relative_url }}" alt="Druin battle"><figcaption>Druin, Mountain Cave B2.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-poltergeist-battle.jpg' | relative_url }}" alt="The Poltergeist takes 15 damage"><figcaption>Poltergeist on the way to Gwaelin.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-overworld-coast.jpg' | relative_url }}" alt="Overworld coastline"><figcaption>Overworld coast while grinding to level 7.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-overworld-desert-grind.jpg' | relative_url }}" alt="Desert overworld"><figcaption>Desert grind for level 10.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-tantegel-courtyard.png' | relative_url }}" alt="Tantegel Castle 1F courtyard"><figcaption>Back through Tantegel 1F before the Swamp Cave.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-swamp-cave-gwaelin-cell.png' | relative_url }}" alt="Swamp Cave: Gwaelin's cell"><figcaption>Gwaelin's cell at the end of the Swamp Cave.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/v-rimuldar-town.jpg' | relative_url }}" alt="Rimuldar town from above"><figcaption>Rimuldar, home of the Broad Sword and Magic Armor.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/dragon-warrior/playthrough/m15-level-3-red-slime.png' | relative_url }}" alt="Red Slime"><figcaption>Where it all begins: a Red Slime.</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="results">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Results</p>
      <h2 class="h2">What a passing run looks like</h2>
      <p class="sec-p">With the game data fixed, the brain clears all 70 milestones and beats the Dragonlord at level 21&ndash;22 in one or two Charlock expeditions, with at most a single death on the way; a full run takes about two hours at time-scale 8 and roughly 800 random battles. The run that produced the screenshots on this page had 0 deaths after 45 milestones and 861 battles. The <code>playthrough.json</code> report, the per-milestone videos and checkpoints are the proof of work; the dashboard is how you read it.</p>
      <div class="cta" style="justify-content:flex-start;margin-top:22px">
        <a class="btn" href="{{ '/v1/projects/dragon-warrior/' | relative_url }}">Engine &amp; Architecture Guide</a>
        <a class="btn btn-ghost" href="{{ '/games/dragon-warrior/proof-of-viability.html' | relative_url }}">BFS Proof of Viability</a>
        <a class="btn btn-ghost" href="{{ '/blog/' | relative_url }}#ai-playthrough-dragon-warrior">Read the blog post</a>
        <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/dragon-warrior" target="_blank" rel="noopener">Source on GitHub</a>
      </div>
    </div>
  </div>
</section>

<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'dark', securityLevel: 'loose' });
</script>
