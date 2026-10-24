---
layout: game
title: "Quest: Warrior Dragon · AI Playthrough"
permalink: /games/quest-warrior-dragon/ai-playthrough/
description: "The robos-jrpg engine plays the whole of Quest: Warrior Dragon, from King Lorik's throne room to the Dragonlord, using only real inputs: a 70-entry milestone registry, a route-planning survival brain, per-milestone videos and checkpoints, deadlock watchdogs, and a GNOME tray icon + live dashboard."
bg_poster: /assets/games/quest-warrior-dragon/playthrough/m38-level-10-desert.png
accent: "#00bcd4"
og_image_alt: "Quest: Warrior Dragon autonomous AI playthrough from King Lorik's throne room to the Dragonlord"
og_type: article
schema_type: TechArticle
keywords: "Quest Warrior Dragon AI playthrough, autonomous RPG playthrough, 74 milestone playthrough, Dragonlord boss fight, robos-jrpg survival brain"
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
  <p class="kicker">Quest: Warrior Dragon · Autonomous Agent Governance</p>
  <h1 class="g-title" style="font-size:clamp(2.2rem,6vw,4.6rem)">AI Playthrough</h1>
  <p class="lead">The robos-jrpg engine plays the <em>whole</em> game &mdash; King Lorik's throne room to the Dragonlord &mdash; with nothing a human player does not have: real controller inputs and what is on the screen. Every milestone becomes a video, a save checkpoint and a screenshot, and a GNOME tray icon lets you follow a two-hour run without watching it.</p>
  <div class="cta">
    <a class="btn" href="#how">How it works</a>
    <a class="btn btn-ghost" href="#dashboard">Tray &amp; dashboard</a>
    <a class="btn btn-ghost" href="#gallery">Screenshot gallery</a>
    <a class="btn btn-ghost" href="{{ '/games/quest-warrior-dragon/' | relative_url }}">Back to the game</a>
  </div>
</section>

<section class="g-sec" id="why">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Why</p>
      <h2 class="h2">Reachable is not the same as beatable</h2>
      <p class="sec-p">The <a href="{{ '/games/quest-warrior-dragon/proof-of-viability.html' | relative_url }}">BFS proof of viability</a> walks every connected <code>(map, col, row)</code> state and proves every chest, stair, door and the Dragonlord's altar can be <em>reached</em>. It says nothing about whether a hero with the gold, levels, spells and herbs the game actually hands out can <em>get there alive</em>, afford the Broad Sword, survive Charlock's basement, or beat the Dragonlord's second form. Those are economy, combat-formula and inventory questions, and the only honest way to answer them is to play the game.</p>
      <p class="sec-p">So the game plays itself. <code>PlayGameBrain.gd</code> is a "play the game" mode of the in-engine <code>AIEngine.gd</code>: it presses <code>move_up/down/left/right</code>, <code>ui_accept</code> and <code>cmd_menu</code>, and reads state through the same HTTP IPC web service the E2E tests use (<code>GameControlServer.gd</code>, <code>GET /api/v1/state</code>). No teleports, no stat edits, no peeking at hidden RNG. If it cannot finish, the game has a bug.</p>
      <div class="facts">
        <div><b>70</b><span>Milestones in the registry (every chest, purchase, quest item, level gate, boss)</span></div>
        <div><b>~2 h</b><span>Wall-clock for a full run at time-scale 8</span></div>
        <div><b>~800</b><span>Random battles per run</span></div>
        <div><b>L21&ndash;22</b><span>Hero level when the Dragonlord falls, with 0&ndash;1 deaths</span></div>
      </div>
      <div class="shots pt-grid" style="margin-top:28px">
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m01-throne-room-king-lorik.png' | relative_url }}" alt="Throne room: King Lorik tells how the Dragonlord stole the Ball of Light"><figcaption>#1 &mdash; King Lorik's throne room. The run starts where a new game starts.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m15-level-3-red-slime.png' | relative_url }}" alt="A Red Slime battle on the way to level 3"><figcaption>#10 &mdash; the first level gate (level 3): 24 battles outside Tantegel.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m44-swamp-cave-gwaelin.png' | relative_url }}" alt="Swamp Cave: Princess Gwaelin asks to be taken back to her father"><figcaption>#41 &mdash; Princess Gwaelin rescued in the Swamp Cave at level 11.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m49-level-15-metal-scorpion.png' | relative_url }}" alt="Metal Scorpion battle while grinding for level 15"><figcaption>#51 &mdash; level 15 (REPEL): a 19-minute grind before the Staff of Rain.</figcaption></figure>
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
  subgraph Godot["Godot 4 · games/quest-warrior-dragon"]
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
  subgraph Dash["RobOS Game Playthrough app (packages/game-playthrough)"]
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
        <img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/filmstrip-milestone-videos.jpg' | relative_url }}" alt="Filmstrip: one frame from each of the 74 milestone videos of the winning run, with each clip's length">
        <figcaption>One frame from each of the 74 milestone videos of the winning run, with its length. Milestones are uneven: most chests take a second or two, while #54, digging up Erdrick's Token, took 22&nbsp;minutes because the brain had to reach level 17 first.</figcaption>
      </figure>
      <pre class="code" style="margin-top:26px"><button data-copy>Copy</button><code>cd games/quest-warrior-dragon

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
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-brecconary-shop-window.jpg' | relative_url }}" alt="Brecconary weapon shop window: What dost thou want? Bamboo Pole 10G"><figcaption>Frame from <code>13-buy-copper_sword</code>: the brain navigates a real shop menu.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-drakee-battle.png' | relative_url }}" alt="Drakee battle: ERDRICK attacks Drakee"><figcaption>Frame from <code>15-chest-garinham-1f-garc1</code> (17&nbsp;min): grinding Drakees before Garinham's first chest.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-battle-victory-text.jpg' | relative_url }}" alt="Thou hast done well! ERDRICK earns 1 XP and 1 GP"><figcaption>Frame from <code>10-level-3</code>: the reward text the brain waits through with <code>ui_accept</code>.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-hurt-spell-skeleton.png' | relative_url }}" alt="Battle spell list with HURT selected against a Druin"><figcaption>Frame from <code>42-return-gwaelin</code>: HURT picked from the battle spell list against a Druin.</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="dashboard">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Following a run</p>
      <h2 class="h2">The tray icon and the live dashboard</h2>
      <p class="sec-p">A two-hour autonomous run has a visibility problem: you want to know <em>at a glance</em> whether it is still alive, how far along it is, and what it is doing, without a terminal scrolling JSON. The RobOS <a href="{{ '/apps/game-playthrough/' | relative_url }}">Game Playthrough</a> app (<code>packages/game-playthrough</code>) is a small Electron app that stepped and recorded runs start automatically (<code>--dashboard on|off|auto</code>). It stays open after the run; quit it from the tray menu.</p>

      <div class="pt-step">
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/tray-menu.png' | relative_url }}" alt="GNOME top bar with the Game Playthrough tray icon and its context menu after the winning run"><figcaption>The tray icon's progress ring and context menu, rendered from the winning run's <code>live.json</code> with the menu the app builds.</figcaption></figure>
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
        <img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-live.png' | relative_url }}" alt="Game Playthrough live view after the winning run: 74 / 74 milestones and the closing credits">
        <figcaption>The live view at the end of the winning run: 74 / 74 milestones in 2:33:59, 2,621 battles, 6 deaths, and the closing credits on screen.</figcaption>
      </figure>
      <div class="grid3" style="margin-top:22px">
        <div class="card"><h3>Header</h3><p>Status pill (<code>RUNNING</code>, <code>DONE</code>, <code>STALLED</code>, <code>CRASHED</code>), elapsed time and time scale, a progress bar over the 74 milestones, and stat chips: level, HP, MP, gold, EXP, ATK/DEF, battles, deaths, scene and tile. The "Now:" line names the current milestone and the brain's sub-objective.</p></div>
        <div class="card"><h3>Live game</h3><p>A screenshot refreshed every 1.5&nbsp;s through <code>capture_screenshot</code> (it writes <code>live.png</code> in the reports folder), with the scene and map key beside the heading.</p></div>
        <div class="card"><h3>Battle</h3><p>Current monster and its HP, monster ATK/DEF, hero HP/MP and whether STOPSPELL landed, straight from <code>/api/v1/state</code>'s battle block.</p></div>
        <div class="card"><h3>Equipment &amp; pack</h3><p>Weapon, armor, shield and the full pack with stacks collapsed (<code>Herb ×5</code>), so you can see the NES eight-slot rule and herb restocks working.</p></div>
        <div class="card"><h3>AI inputs</h3><p>The last ~20 inputs the brain pressed, including stride targets (<code>move_up(stride:9-&gt;100,16)</code>) and the current stride target tile.</p></div>
        <div class="card"><h3>Brain event log</h3><p>The brain's own event log (<code>L11 cast: hurt vs scorpion (hp 44/59 mp 12)</code>, field heals, inn trips, watchdog stalls, skipped milestones) plus any invariant violations the driver recorded.</p></div>
      </div>

      <h3 class="pt-h3">Milestone cards</h3>
      <p class="sec-p">The left column lists all 70 milestones with their type and whether a checkpoint exists; "follow run" keeps the current one in view. Every finished milestone is a clickable card that plays its video, shows the save checkpoint taken right after it (location, level, EXP, gold, HP/MP, ATK/DEF, equipment) and the milestone screenshot. <strong>Reveal video</strong> opens the file in the file manager; <strong>Replay command</strong> copies the exact <code>play_full_game.py --stepped --only N</code> command line.</p>
      <div class="shots pt-grid two" style="margin-top:22px">
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-1.png' | relative_url }}" alt="Milestone card #1 Hear King Lorik's quest with its video and the checkpoint: ThroneRoom, level 1"><figcaption>#1 Hear King Lorik's quest &mdash; a four-second clip and the first checkpoint, level 1.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-15.png' | relative_url }}" alt="Milestone card #15 Grind + Open chest garc1 in Garinham with its video and checkpoint: level 8, 586 gold"><figcaption>#15 Grind + Open chest garc1 in Garinham &mdash; 17&nbsp;minutes of grinding to level 7 and gold for keys; checkpoint at level 8 with 586 gold.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-31.png' | relative_url }}" alt="Milestone card #31 Grind + Reach level 10 with its video and checkpoint: WorldMap (6,60), level 10, 617 gold"><figcaption>#31 Grind + Reach level 10 (STOPSPELL) &mdash; 143&nbsp;s on the overworld; checkpoint at WorldMap (6,60), level 10, 617 gold.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-41.png' | relative_url }}" alt="Milestone card #41 Rescue Princess Gwaelin with a Wolf battle frame and checkpoint: SwampCave (3,22), level 11"><figcaption>#41 Rescue Princess Gwaelin &mdash; the Swamp Cave clip; checkpoint at SwampCave (3,22), level 11.</figcaption></figure>
      </div>
      <figure class="pt-fig" style="margin-top:14px">
        <img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/dashboard-milestone-39.png' | relative_url }}" alt="Milestone card #39 Grind + Buy Broad Sword at Rimuldar with its video and checkpoint: broad_sword, 746 gold">
        <figcaption>#39 Grind + Buy Broad Sword at Rimuldar (1500G) &mdash; 494&nbsp;s of grinding for the gold; the checkpoint confirms <code>broad_sword</code> equipped with 746 gold left.</figcaption>
      </figure>
      <pre class="code" style="margin-top:26px"><button data-copy>Copy</button><code># Run the dashboard on its own against any reports folder / game port
cd packages/game-playthrough && npm install
npx electron --no-sandbox . --reports ../../games/quest-warrior-dragon/tests/e2e/reports/playthrough --port 19260

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
      <p class="sec-p">The rule in <code>games/quest-warrior-dragon/AGENTS.md</code> is "fix the game, not the brain", and it held. Teaching the AI to finish the game surfaced defects that neither the BFS audit nor the chained Cucumber checkpoints could see, because they only show up when a hero with the real economy and real stats tries to progress:</p>
      <ul class="ticks">
        <li><strong>Charlock 1F exit gate unwalkable</strong> &mdash; reachable on the BFS grid, but the AI could never leave the castle after Erdrick's Sword.</li>
        <li><strong>Kol NPC blocking the item-shop doorway</strong> &mdash; a wandering villager parked in a one-tile door and deadlocked the herb restock; the watchdog caught it, the fix capped shop retries and moved the NPC.</li>
        <li><strong>Consumables not stacking</strong> &mdash; herbs filled all eight tool slots, so chests with quest items were skipped under the NES "no dropping" rule.</li>
        <li><strong>Missing level-up curves</strong> and <strong>incorrect flee factors and spell resistances</strong> &mdash; the hero either could not reach a level gate or kept losing to monsters that should have run.</li>
        <li><strong>Boss fights not syncing the pack</strong>, <strong>duplicate chests</strong>, <strong>a Cantlin item shop with no stock</strong>, and <strong>Wings doing nothing on the overworld</strong> (the brain uses them to fly home from Charlock when its MP commit bar is short).</li>
        <li><strong>Magic Armor tie rule</strong> &mdash; Magic Armor and Erdrick's Armor compared equal, so the brain kept re-buying; fixed in the equipment comparison, together with a death-adaptive grind policy (each death outside grinding raises the current milestone's required level by one).</li>
      </ul>
      <div class="shots pt-grid" style="margin-top:28px">
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m41-mountain-cave-items-pack.png' | relative_url }}" alt="The ITEMS window in Erdrick's Cave: Torch x2, Leather Armor, Small Shield, Copper Sword"><figcaption>#14 &mdash; the ITEMS window in Erdrick's Cave: one row per kind, Torch &times;2.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m33-kol-chest.png' | relative_url }}" alt="Kol village with the command menu open at a chest"><figcaption>#26 &mdash; Kol, where an NPC in the item-shop door once deadlocked the run.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m19-erdricks-cave-b2-tablet.png' | relative_url }}" alt="Erdrick's Cave B2 in darkness with a one-tile torch radius"><figcaption>#14 &mdash; Erdrick's Cave B2 in the dark, lit by a torch.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m52-cantlin-chest.png' | relative_url }}" alt="Cantlin, the walled town, at its first chest"><figcaption>#56 &mdash; Cantlin, behind the wall the Golem guards.</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="gallery">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Gallery</p>
      <h2 class="h2">Milestone screenshots from a live run</h2>
      <p class="sec-p">Each image is the <code>screenshots/NN-&lt;id&gt;.png</code> the driver takes the moment a milestone's <code>done_when</code> predicate turns true. Click any image to enlarge. Every image on this page comes from one uninterrupted run that cleared all 74 milestones, and the milestone numbers in the captions are that run's.</p>
      <div class="shots pt-grid" style="margin-top:28px">
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m02-throne-room-magic-key.png' | relative_url }}" alt="Thou dost find Magic Key!"><figcaption>#4 Magic Key from the throne room chest.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m05-throne-room-door.png' | relative_url }}" alt="Throne room with the gate open"><figcaption>#5 Throne room gate opened.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m07-tantegel-1f-chest-take-menu.png' | relative_url }}" alt="Tantegel 1F: Thou dost find 46 Gold Pieces!"><figcaption>#43 A gold chest in Tantegel 1F.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m10-tantegel-basement-stones-of-sunlight.png' | relative_url }}" alt="Tantegel basement, Stones of Sunlight chest"><figcaption>#47 Stones of Sunlight in the Tantegel basement.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m11-brecconary-bamboo-pole.png' | relative_url }}" alt="Bamboo Pole is now equipped, Brecconary"><figcaption>#6 Bamboo Pole equipped in Brecconary (optional milestone).</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m12-brecconary-buy-club.png' | relative_url }}" alt="Then I will buy thy Bamboo Pole for 5 gold"><figcaption>#7 Buying the Club &mdash; the shopkeeper buys back the pole.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m18-brecconary-copper-sword.png' | relative_url }}" alt="Thou hast purchased the Copper Sword!"><figcaption>#13 Copper Sword (180G) after a 155-second grind.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m20-garinham-chest-take.png' | relative_url }}" alt="Garinham with the command menu open at the first chest"><figcaption>#15 First chest in Garinham.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m23-garinham-chain-mail.png' | relative_url }}" alt="Chain Mail is now equipped, Garinham"><figcaption>#18 Chain Mail bought at Garinham.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m24-level-7-overworld.png' | relative_url }}" alt="Alefgard overworld with the command menu open"><figcaption>#18 On the overworld near Garinham, level 8.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m26-garins-grave-b1-chests.png' | relative_url }}" alt="Garin's Grave B1 in torch light"><figcaption>#23 Garin's Grave B1 in torch light.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m29-garins-grave-b3-wolflord.png' | relative_url }}" alt="Wolflord battle with the FIGHT / SPELL menu"><figcaption>#39 A Wolflord while grinding for the Broad Sword.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m32-garinham-half-plate.png' | relative_url }}" alt="Half Plate is now equipped"><figcaption>#25 Half Plate (1000G) after a 346&nbsp;s grind.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m36-kol-fairy-flute.png' | relative_url }}" alt="Kol: Thou hast found the Fairy Flute!"><figcaption>#29 Fairy Flute found by SEARCH in Kol.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m38-level-10-desert.png' | relative_url }}" alt="Desert overworld while grinding for level 15"><figcaption>#51 The desert while grinding for level 15.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m39-mountain-cave-b1.png' | relative_url }}" alt="Mountain Cave B1"><figcaption>#32 Mountain Cave B1.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m45-rimuldar-wings-chest.png' | relative_url }}" alt="Rimuldar: Thou dost find the Wings!"><figcaption>#38 Wings from the Rimuldar chest &mdash; the brain's way home from Charlock.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m46-rimuldar-broad-sword.png' | relative_url }}" alt="Broad Sword is now equipped, Rimuldar"><figcaption>#39 Broad Sword (1500G) at Rimuldar.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m47-return-gwaelin-king-lorik.png' | relative_url }}" alt="King Lorik: Thou hast rescued my daughter Gwaelin! I am forever grateful."><figcaption>#42 Gwaelin returned to King Lorik.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m50-northern-cave-staff-of-rain.png' | relative_url }}" alt="Northern shrine, the Staff of Rain chest"><figcaption>#53 Staff of Rain in the northern shrine.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m51-erdricks-token-swamp.png' | relative_url }}" alt="Thou hast found Erdrick's Token! in the swamp"><figcaption>#54 Erdrick's Token dug up in the swamp.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m54-cantlin-chest-3.png' | relative_url }}" alt="Cantlin after its third chest"><figcaption>#58 Cantlin after its third chest.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/replay-m12-brecconary-shop-window.png' | relative_url }}" alt="Brecconary shop window with 112 gold"><figcaption>The Brecconary shop window as the AI buys its first weapon.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-erdricks-cave-torch-radius.png' | relative_url }}" alt="Erdrick's Cave with a one-tile torch radius"><figcaption>Video frame: Erdrick's Cave with the torch radius.</figcaption></figure>
      </div>
      <h3 class="pt-h3">Battles, from the videos</h3>
      <div class="shots pt-grid" style="margin-top:14px">
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-magidrakee-battle.png' | relative_url }}" alt="Magidrakee battle with SPELL selected"><figcaption>Magidrakee while grinding for the Hand Axe.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-magician-draws-near.png' | relative_url }}" alt="Magician battle, command menu"><figcaption>A Magician &mdash; STOPSPELL territory.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-scorpion-spell-menu.png' | relative_url }}" alt="Scorpion battle with SPELL selected"><figcaption>Scorpion; HURT is cheaper than two sword rounds.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-skeleton-takes-damage.png' | relative_url }}" alt="The Skeleton takes 14 damage"><figcaption>A Skeleton takes 14 damage on the way to level 10.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-druin-battle.png' | relative_url }}" alt="The Druin takes 22 damage"><figcaption>A Druin takes 22 damage.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-poltergeist-battle.jpg' | relative_url }}" alt="Poltergeist battle with SPELL selected"><figcaption>Poltergeist in the Mountain Cave.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-overworld-coast.jpg' | relative_url }}" alt="Overworld coast and forest"><figcaption>Overworld coast while grinding to level 10.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-overworld-desert-grind.jpg' | relative_url }}" alt="Desert overworld"><figcaption>The desert near Cantlin.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-tantegel-courtyard.png' | relative_url }}" alt="Tantegel Castle 1F courtyard"><figcaption>Tantegel 1F, collecting the castle's gold chests.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-swamp-cave-gwaelin-cell.png' | relative_url }}" alt="Swamp Cave: Gwaelin's cell"><figcaption>Gwaelin's cell at the end of the Swamp Cave.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/v-rimuldar-town.jpg' | relative_url }}" alt="Rimuldar town from above"><figcaption>Rimuldar, home of the Broad Sword and Magic Armor.</figcaption></figure>
        <figure><img loading="lazy" src="{{ '/assets/games/quest-warrior-dragon/playthrough/m15-level-3-red-slime.png' | relative_url }}" alt="A Red Slime battle on the way to level 3"><figcaption>#10 &mdash; the first level gate (level 3): 24 battles outside Tantegel.</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section class="g-sec" id="results">
  <div class="wrap">
    <div class="panel-g">
      <p class="eyebrow">Results</p>
      <h2 class="h2">What a passing run looks like</h2>
      <p class="sec-p">With the game data fixed, the brain clears all 74 milestones and beats the Dragonlord at level 21 in a single Charlock expedition. The run that produced every image on this page took 2&nbsp;h&nbsp;34&nbsp;min at time-scale 8, with 2,621 battles and 6 deaths, and you can <a href="https://www.youtube.com/watch?v=o6RHKMKD2AU">watch all of it on YouTube</a>. The <code>playthrough.json</code> report, the per-milestone videos and checkpoints are the proof of work; the dashboard is how you read it.</p>
      <div class="cta" style="justify-content:flex-start;margin-top:22px">
        <a class="btn" href="{{ '/v1/projects/quest-warrior-dragon/' | relative_url }}">Engine &amp; Architecture Guide</a>
        <a class="btn btn-ghost" href="{{ '/games/quest-warrior-dragon/proof-of-viability.html' | relative_url }}">BFS Proof of Viability</a>
        <a class="btn btn-ghost" href="{{ '/blog/' | relative_url }}#ai-playthrough-quest-warrior-dragon">Read the blog post</a>
        <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/games/quest-warrior-dragon" target="_blank" rel="noopener">Source on GitHub</a>
      </div>
    </div>
  </div>
</section>

<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'dark', securityLevel: 'loose' });
</script>
