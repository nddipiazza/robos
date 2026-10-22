---
layout: default
title: RobOS
description: "RobOS is a generative app suite built on a knowledge graph. AI is plugged into every app as an option, so you can customize anything — a playlist for tonight, a Virtual DJ, a whole new app — using the agent you already have."
permalink: /
body_class: landing
extra_css: /assets/landing.css
---
<section class="l-hero">
  <div class="wrap l-hero-grid">
    <div>
      <a class="pill" href="{{ '/blog/#audio-player-virtual-dj' | relative_url }}"><b>New</b> · AI Playlists and a Virtual DJ you can hear →</a>
      <h1>Apps you can <em>ask</em> to be anything.</h1>
      <p class="lead">RobOS is a generative app suite built on a knowledge graph. AI is plugged into every app as an option: leave it off, or describe what you want, like a playlist for tonight or a DJ who introduces each song. When no app fits, describe one, and RobOS builds it from the same graph.</p>
      <div class="cta">
        <a class="btn" data-dl-href data-win="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-win.exe" data-mac="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-mac.dmg" data-linux="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-linux.AppImage" href="{{ '/download/' | relative_url }}"><img class="btn-ic" src="/assets/icons/download.svg" alt="" width="18" height="18"> <span data-dl-label>Download RobOS</span></a>
        <a class="btn btn-ghost" href="#customize">See what you can ask</a>
      </div>
      <p class="sub">Free &amp; open source · macOS, Linux, Windows · <a href="{{ '/download/' | relative_url }}">Other install options</a></p>
    </div>

    <div class="ask" data-tabs>
      <div class="tabs" role="tablist" aria-label="Things to ask RobOS">
        <button type="button" role="tab" id="t-playlist" aria-selected="true" aria-controls="p-playlist">Playlist</button>
        <button type="button" role="tab" id="t-dj" aria-selected="false" aria-controls="p-dj">Virtual DJ</button>
        <button type="button" role="tab" id="t-custom" aria-selected="false" aria-controls="p-custom">Change an app</button>
        <button type="button" role="tab" id="t-new" aria-selected="false" aria-controls="p-new">New app</button>
      </div>

      <div class="panel" role="tabpanel" id="p-playlist" aria-labelledby="t-playlist">
        <div class="ask-app"><span><b>Audio Player</b> · AI Playlists</span><span class="tag live">Ships today</span></div>
        <div class="prompt">late-night jazz and moody electronic for coding<small>Ctrl+↵ submit</small></div>
        <div class="ask-go"><span>✦ Make playlist</span></div>
        <div class="out">
          <p class="out-h">Your agent picks and orders songs from your library</p>
          <ol>
            <li>Blue in Green <span>· Miles Davis</span></li>
            <li>Teardrop <span>· Massive Attack</span></li>
            <li>Naima <span>· John Coltrane</span></li>
            <li>Night Owl <span>· Gerry Mulligan</span></li>
          </ol>
          <p class="meta">Example output. The real list comes from your own library, local or in Google Drive and OneDrive.</p>
        </div>
      </div>

      <div class="panel" role="tabpanel" id="p-dj" aria-labelledby="t-dj" hidden>
        <div class="ask-app"><span><b>Audio Player</b> · Virtual DJ</span><span class="tag live">Ships today</span></div>
        <div class="prompt">Big loud radio host<small>Ctrl+↵ submit</small></div>
        <div class="ask-go"><span>✦ Start DJ</span></div>
        <div class="out">
          <p class="out-h">Written a few songs ahead, spoken between them</p>
          <blockquote>“That was Miles taking his sweet time. Keep that coffee warm, because up next it gets a little darker — here's Massive Attack.”</blockquote>
          <p class="meta">Spoken with RobOS Voice at 150% of the music's volume, on your desk or on a Google Cast speaker. Example line.</p>
        </div>
      </div>

      <div class="panel" role="tabpanel" id="p-custom" aria-labelledby="t-custom" hidden>
        <div class="ask-app"><span><b>Household</b> · customize the app</span><span class="tag">Your idea</span></div>
        <div class="prompt">Add an allowance envelope for each kid that tops up every Friday and shows on the accounts page.<small>Ctrl+↵ submit</small></div>
        <div class="ask-go"><span>✦ Plan the change</span></div>
        <div class="out">
          <p class="out-h">The change lands in the app's knowledge graph first</p>
          <ul class="nodes">
            <li><b>+</b> Envelope</li><li><b>+</b> TopUpSchedule</li><li><b>~</b> AccountsPage</li><li><b>+</b> test: Friday top-up</li>
          </ul>
          <p class="meta">An agent builds it on a branch, runs the app headlessly and hands back a narrated walkthrough. You keep it or throw it away.</p>
        </div>
      </div>

      <div class="panel" role="tabpanel" id="p-new" aria-labelledby="t-new" hidden>
        <div class="ask-app"><span><b>App Wizard</b> · build from context</span><span class="tag">Your idea</span></div>
        <div class="prompt">A tracker for our community garden: plots, who waters what this week, and a harvest log.<small>Ctrl+↵ submit</small></div>
        <div class="ask-go"><span>✦ Model the app</span></div>
        <div class="out">
          <p class="out-h">A KGraph comes first: what it is, how it works, how to test it</p>
          <ul class="nodes">
            <li><b>app</b> Garden Club</li><li>Plot</li><li>Member</li><li>WateringShift</li><li>Harvest</li><li><b>screens</b> 4</li><li><b>tests</b> 6</li>
          </ul>
          <p class="meta">Then routed agents write the code and the tests prove it works. Edit the graph later and rebuild.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<div class="logos"><div class="wrap">Bring the agent you already use, or none at all<div><span>Claude Code</span><span>OpenAI Codex</span><span>GitHub Copilot</span><span>Gemini CLI · Antigravity</span><span>Local models via Ollama</span></div></div></div>

<section id="product">
  <div class="wrap">
    <p class="eyebrow">AI in everything, optional everywhere</p>
    <h2 class="h2">Every app has an AI socket. You decide what plugs in.</h2>
    <p class="sec-p">RobOS apps are ordinary, fast desktop apps first. Each one also knows how to hand a request to your AI agent, together with the slice of the knowledge graph that describes it: your library, your menu, your ledger, your game. That is what lets a one-line request change real things.</p>
    <div class="l-grid4">
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/gear.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Optional, never required</h3><p>The apps work without AI. AI features are buttons you choose to press, and the API mode for quick requests is off until you turn it on.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/robot.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Your agent, your account</h3><p>RobOS runs the agent CLI you already signed in to, or a local Ollama model. The same agent picker across apps, and no new subscription.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/dna.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Grounded in your graph</h3><p>The agent gets the part of the KGraph it needs, so it answers about your songs and your data instead of guessing.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/shield.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Guarded by default</h3><p>A prompt security guard checks every request for secrets, personal data and prompt injection before it leaves the app, and logs what it did.</p></div>
    </div>
  </div>
</section>

<section class="alt" id="audio">
  <div class="wrap">
    <p class="eyebrow">Shipping now</p>
    <h2 class="h2">A music player that takes requests</h2>
    <div class="l-show">
      <div>
        <h3>AI Playlists and a Virtual DJ</h3>
        <p>Describe a mood and your agent builds a playlist from a library of up to 100,000 songs. Tick <b>Virtual DJ</b>, describe a host, and the agent writes a short intro for each song a few songs ahead. RobOS Voice speaks it at a volume you can actually hear over the music, on your desk or on a Google Cast speaker in the kitchen.</p>
        <ul class="ticks"><li>Works with local files, Google Drive and OneDrive</li><li>Pick the agent and the voice; hear the DJ before the song ends</li><li>Turn it all off and it is still a fast, VLC-style player</li></ul>
        <p style="margin-top:22px"><a style="color:var(--accent);font-weight:600" href="{{ '/blog/#audio-player-virtual-dj' | relative_url }}">Read how we built it →</a></p>
      </div>
      <div class="l-shots">
        <figure><img src="{{ '/assets/audio-player/virtual-dj-volume.jpg' | relative_url }}" alt="Virtual DJ dialog with the AI agent set to Antigravity, the DJ described as a big loud radio host, a voice, how often the DJ talks and a DJ volume slider at 150% of the music" width="640" height="500" loading="lazy"><figcaption>Describe your DJ. The agent writes, RobOS Voice speaks.</figcaption></figure>
        <figure><img src="{{ '/assets/audio-player/casting-deck.jpg' | relative_url }}" alt="Now Playing deck casting a song to a kitchen speaker, with the progress bar at 0:32 of 3:20" width="780" height="290" loading="lazy"><figcaption>Casting to a speaker, with the speaker keeping time.</figcaption></figure>
      </div>
    </div>
  </div>
</section>

<section id="customize">
  <div class="wrap">
    <p class="eyebrow">Customize anything</p>
    <h2 class="h2">If you can say it, you can ask for it</h2>
    <p class="sec-p">There are two ways to ask. Inside an app, AI features like AI Playlists act on your data right away. For anything bigger, ask for the app itself to change: the request becomes an edit to the app's knowledge graph, an agent builds it, and tests prove it before you keep it.</p>
    <div class="asks">
      <div class="card"><div class="app">Audio Player <span class="tag live">Ships today</span></div><q>Sunday morning, slow and acoustic, mostly songs I haven't played in a while.</q><p>An AI Playlist built from your own library.</p></div>
      <div class="card"><div class="app">Audio Player <span class="tag live">Ships today</span></div><q>A calm late-night host who tells me one fact about each song.</q><p>A Virtual DJ with its own personality, voice and volume.</p></div>
      <div class="card"><div class="app">Point of Sale <span class="tag">Try asking</span></div><q>Suggest a pastry to anyone who orders an oat-milk latte before 10.</q><p>A change to your register, built and tested against your menu.</p></div>
      <div class="card"><div class="app">Household <span class="tag">Try asking</span></div><q>Flag any subscription that went up in price since last year.</q><p>A new check over your reconciled transactions.</p></div>
      <div class="card"><div class="app">Auto Center <span class="tag">Try asking</span></div><q>Explain these trouble codes to the customer in plain English on the estimate.</q><p>A new section on the estimate, written from the scan on the ticket.</p></div>
      <div class="card"><div class="app">Tabletop RPG <span class="tag">Try asking</span></div><q>Write a short side quest for tonight with a talking wolf in it.</q><p>New content for a game whose rules already live in the graph.</p></div>
    </div>
    <p class="l-note"><b>Ships today</b> means the feature is in the app now. <b>Try asking</b> means a request you can give your agent in RobOS to change the app; how well it goes depends on the agent you use, and you review the evidence before you keep anything.</p>
  </div>
</section>

<section class="alt" id="suites">
  <div class="wrap">
    <p class="eyebrow">App suites</p>
    <h2 class="h2">Suites to start from, not stop at</h2>
    <p class="sec-p">Each suite was modeled in the KGraph, built by agents and verified by automated browser or gameplay tests. Use them as they are, or ask for the version that fits you.</p>
    <div class="suite-grid">
      <a class="card suite" href="{{ '/v1/apps/audio-player/' | relative_url }}">
        <div class="suite-shot"><img src="{{ '/assets/audio-player/virtual-dj-volume.jpg' | relative_url }}" alt="RobOS Audio Player Virtual DJ settings, with the AI agent picker and a box to describe your DJ" width="640" height="500" loading="lazy"></div>
        <div class="suite-body"><span class="suite-tag">Music · Home speakers</span><h3>Audio Player &amp; Home Speaker</h3><p>A 100,000-song library, AI Playlists, a Virtual DJ, lyrics and zero-cloud Google Cast streaming to the speakers around your home.</p><span class="go">Read the Audio Player docs →</span></div>
      </a>
      <a class="card suite" href="{{ '/point-of-sale/' | relative_url }}">
        <div class="suite-shot"><img src="{{ '/assets/point-of-sale/coffee-register-latte.jpg' | relative_url }}" alt="RobOS Point of Sale register with a customized latte order" width="1280" height="800" loading="lazy"></div>
        <div class="suite-body"><span class="suite-tag">Retail · Cafés · Bars</span><h3>Point of Sale</h3><p>A touchscreen register with self-checkout, barcode and camera scanning, prep queues, open tabs and cash drawer reports. No subscription, data stays local.</p><span class="go">Tour Point of Sale →</span></div>
      </a>
      <a class="card suite" href="{{ '/auto-center/' | relative_url }}">
        <div class="suite-shot"><img src="{{ '/assets/auto-center/shots/04-checkout--issue-the-invoice-from-the-approved-estimate-7.jpg' | relative_url }}" alt="RobOS Auto checkout screen issuing an invoice from an approved estimate" width="1000" height="625" loading="lazy"></div>
        <div class="suite-body"><span class="suite-tag">Repair shops · Vehicle owners</span><h3>Auto Center</h3><p>Front desk intake, the mechanic bench with Bluetooth OBD-II, estimates and checkout, plus owner vehicle care, invoice scans and recall remedies.</p><span class="go">Read the Auto Center guide →</span></div>
      </a>
      <a class="card suite" href="{{ '/family-finances/' | relative_url }}">
        <div class="suite-shot"><img src="{{ '/assets/family-finances/02-accounts.png' | relative_url }}" alt="RobOS Household accounts view with six reconciled accounts" width="1440" height="1185" loading="lazy"></div>
        <div class="suite-body"><span class="suite-tag">Families · Personal finance</span><h3>Household</h3><p>Statement imports and reconciliation, everyday spending categories, W-2 and 1099 field review, and a local federal tax estimate, all on your own machine.</p><span class="go">Walk through a family's year →</span></div>
      </a>
      <a class="card suite" href="{{ '/games/' | relative_url }}">
        <div class="suite-shot"><img src="{{ '/assets/games/tabletop-still-intro.jpg' | relative_url }}" alt="The Chronicler narrating the opening scene of the RobOS Tabletop RPG" width="1280" height="720" loading="lazy"></div>
        <div class="suite-body"><span class="suite-tag">cRPG · Tabletop · RTS</span><h3>Games</h3><p>Realm of Heroes, a HeroQuest-inspired Tabletop RPG and the Starfall Command RTS. Designed from a knowledge graph, written by agents and tested by playing them on camera.</p><span class="go">Choose a game →</span></div>
      </a>
      <a class="card suite" href="#build">
        <div class="suite-shot suite-idea" aria-hidden="true"><div class="prompt">A tracker for our community garden…</div><ul class="nodes"><li><b>app</b> Garden Club</li><li>Plot</li><li>Member</li><li>WateringShift</li><li>Harvest</li><li><b>tests</b> 6</li></ul></div>
        <div class="suite-body"><span class="suite-tag">Your idea</span><h3>The one you describe</h3><p>Model a new app in the KGraph, from a sentence or by importing what you already have, and let agents build it the same way these suites were built.</p><span class="go">See how apps get built →</span></div>
      </a>
    </div>
    <p class="suite-more"><a href="{{ '/apps/' | relative_url }}">Browse every app in the directory →</a></p>
  </div>
</section>

<section id="build">
  <div class="wrap">
    <p class="eyebrow">Build apps from context</p>
    <h2 class="h2">Describe it once. The graph does the remembering.</h2>
    <p class="sec-p">Behind every RobOS app is a KGraph: a standard description of what exists, how it behaves and how to verify it. That is context engineering made durable. With the context written down, building and rebuilding is cheap work that routed, lower-cost models can carry, and every change comes back with proof.</p>
    <ol class="l-steps">
      <li><b>Describe</b><span>A sentence, a sketch, or an import of the repos, APIs, databases and docs you already have.</span></li>
      <li><b>Model</b><span>RobOS turns it into KGraph nodes: entities, screens, rules and the tests that define "working".</span></li>
      <li><b>Build</b><span>Agents get only the slice they need and write the code on a branch.</span></li>
      <li><b>Prove</b><span>The real app runs headlessly; you get a narrated walkthrough and test evidence to review.</span></li>
    </ol>

    <div class="player" id="hero-player" data-slides="{{ site.data.hero.slides | size }}">
      <div class="player-frame">
        <div class="player-bar">
          <i></i><i></i><i></i><span>One change, from idea to merged PR, in the real RobOS apps</span>
          <button type="button" class="watch" id="hero-watch" aria-pressed="false">▶ Watch the full recording</button>
        </div>
        <div class="stage" id="hero-stage" tabindex="0" role="group" aria-roledescription="slideshow" aria-label="Walkthrough slides. Click or press space to pause or resume, arrow keys to step.">
          {%- for s in site.data.hero.slides %}
          <img class="slide{% if forloop.first %} is-active{% endif %}" src="{{ '/assets/hero/slides/' | append: s.file | relative_url }}" data-step="{{ s.step }}" data-dwell="{{ s.dwell }}" alt="{{ s.alt | escape }}" width="1280" height="720" loading="lazy">
          {%- endfor %}
          <video id="hero-video" class="player-video" hidden controls muted loop playsinline preload="none" poster="{{ '/assets/hero/poster.jpg' | relative_url }}" aria-label="Recording of RobOS taking one task from creation, through implementation, review and CI, to a merged pull request">
            <source src="{{ '/assets/hero/hero.webm' | relative_url }}" type="video/webm">
            <source src="{{ '/assets/hero/hero.mp4' | relative_url }}" type="video/mp4">
          </video>
          <div class="stage-state" aria-hidden="true">Paused</div>
          <div class="stage-progress" aria-hidden="true"><i></i></div>
        </div>
        <div class="player-controls" id="hero-controls" role="group" aria-label="Slideshow controls">
          <button type="button" class="ctl ctl-play" id="hero-play" aria-pressed="false" aria-label="Pause slideshow" title="Pause (space)">
            <svg class="ic-pause" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z"/></svg>
            <svg class="ic-play" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M4 2l10 6-10 6z"/></svg>
            <span class="ctl-label">Pause</span>
          </button>
          <button type="button" class="ctl" id="hero-prev" aria-label="Previous slide" title="Previous (left arrow)">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M10 3L5 8l5 5"/></svg>
          </button>
          <button type="button" class="ctl" id="hero-next" aria-label="Next slide" title="Next (right arrow)">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 3l5 5-5 5"/></svg>
          </button>
          <span class="count" id="hero-count" aria-live="off">1 / {{ site.data.hero.slides | size }}</span>
          <label class="ctl-speed" for="hero-speed">Time per slide
            <select id="hero-speed">
              <option value="1">Normal</option>
              <option value="1.5" selected>Longer</option>
              <option value="2">Much longer</option>
              <option value="3">Longest</option>
            </select>
          </label>
        </div>
      </div>
      <ol class="steps" aria-label="Steps">
        {%- for c in site.data.hero.chapters %}
        <li><button type="button" data-step="{{ c.step }}" data-start="{{ c.start }}"><b>{{ forloop.index }}</b><span>{{ c.title }}</span></button></li>
        {%- endfor %}
      </ol>
      <p class="player-note">Recorded from the real apps. GitHub, the coding agent and CI results are scripted stand-ins; the repository, tests, diff and evidence are real.</p>
    </div>
  </div>
</section>

<section class="alt" id="platform">
  <div class="wrap">
    <p class="eyebrow">Under the hood</p>
    <h2 class="h2">One knowledge graph behind every app</h2>
    <p class="sec-p">The same platform that builds the suites is in your hands: the graph, the importers, the agent runner and the review tools. Developers still get the full lifecycle, from planning to merge, with semantic diffs and IDE review.</p>
    <div class="grid3">
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/dna.svg" alt="" width="48" height="48" loading="lazy"></div><h3>One standard KGraph format</h3><p>A single schema for every app, service, contract, schema, runbook and test. Whatever it is, it has a node and a known shape.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/import.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Import anything</h3><p>A KGraph parser and import skills pull in repos, APIs, databases, docs and tickets and turn them into linked entries.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/viewer.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Viewer, editor, e-learning</h3><p>Every node gets a viewer, a form editor, generated documentation and e-learning, all customizable to your domain.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/film.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Proof, not promises</h3><p>Agents run the real app headlessly and hand back a narrated walkthrough and test evidence, so you review what happened rather than guess.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/check.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Review you can understand</h3><p>The graph knows what a change should touch, so review starts from intent: semantic diffs, inline comments, and IntelliJ or VS Code when you want them.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/shield.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Safe by construction</h3><p>Disposable sandboxes, the prompt security guard and a full audit log keep agents inside the lines.</p></div>
    </div>
    <ul class="integ">
      <li><img src="https://cdn.simpleicons.org/github" alt="" loading="lazy" onerror="this.remove()">GitHub</li>
      <li><img src="https://cdn.simpleicons.org/gitlab" alt="" loading="lazy" onerror="this.remove()">GitLab</li>
      <li><img src="https://cdn.simpleicons.org/googledrive" alt="" loading="lazy" onerror="this.remove()">Google Drive</li>
      <li><img src="https://cdn.simpleicons.org/googlehome" alt="" loading="lazy" onerror="this.remove()">Google Cast</li>
      <li><img src="https://cdn.simpleicons.org/ollama" alt="" loading="lazy" onerror="this.remove()">Ollama</li>
      <li><img src="https://cdn.simpleicons.org/postgresql" alt="" loading="lazy" onerror="this.remove()">PostgreSQL</li>
      <li><img src="https://cdn.simpleicons.org/mongodb" alt="" loading="lazy" onerror="this.remove()">MongoDB</li>
      <li><img src="https://cdn.simpleicons.org/elasticsearch" alt="" loading="lazy" onerror="this.remove()">Elasticsearch</li>
      <li><img src="https://cdn.simpleicons.org/apachetika" alt="" loading="lazy" onerror="this.remove()">Apache Tika</li>
      <li><img src="https://cdn.simpleicons.org/docker" alt="" loading="lazy" onerror="this.remove()">Docker</li>
      <li><img src="https://cdn.simpleicons.org/jira" alt="" loading="lazy" onerror="this.remove()">Jira</li>
      <li class="more">and many more</li>
    </ul>
  </div>
</section>

<section id="make-money">
  <div class="wrap">
    <p class="eyebrow">Make money with RobOS</p>
    <h2 class="h2">Start a small software business on top of it</h2>
    <p class="sec-p">RobOS is free and open source, which makes it a ready-made foundation for a services company. Use the existing apps as your starting inventory, customize them for each customer, and earn from the gap between what customers pay for old software and what it now costs you to replace it.</p>
    <div class="grid3">
      <div class="card"><div class="ic"><img class="ic-img" src="{{ '/assets/icons/building.svg' | relative_url }}" alt="" width="48" height="48" loading="lazy"></div><h3>1. Set up an LLC</h3><p>Form a small company that owns the customer relationships, the contracts and your extensions. RobOS stays open source, and your business is the work you do on top of it.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="{{ '/assets/icons/tools.svg' | relative_url }}" alt="" width="48" height="48" loading="lazy"></div><h3>2. Take, extend or build apps</h3><p>Start from an existing RobOS app, ask for the changes a customer needs, or build a new one from a KGraph. Routed, cheaper models do the bulk of the work, so your margin stays healthy.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="{{ '/assets/icons/route.svg' | relative_url }}" alt="" width="48" height="48" loading="lazy"></div><h3>3. Migrate customers over</h3><p>Import the systems customers run today into the graph, so moving them onto the RobOS-based version is documented and testable.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="{{ '/assets/icons/money.svg' | relative_url }}" alt="" width="48" height="48" loading="lazy"></div><h3>4. Sell support contracts</h3><p>Recurring support covers each customer's tickets, and the KGraph keeps every fix quick to find and verify.</p></div>
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <p class="eyebrow">Start here</p>
    <h2 class="h2">Pick your path</h2>
    <div class="grid3">
      <a class="card" href="{{ '/v1/use-robos.html' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/desktop.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Use the apps</h3><p>Install RobOS, tour the suites, and turn on AI wherever you want it.</p><span class="go">Start using →</span></a>
      <a class="card" href="{{ '/v1/build-on-robos.html' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/wizard.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Build your own</h3><p>Model an app in the KGraph, generate it, and write skills agents can run.</p><span class="go">Start building →</span></a>
      <a class="card" href="{{ '/v1/robos-for-teams.html' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/building.svg" alt="" width="48" height="48" loading="lazy"></div><h3>RobOS for Teams</h3><p>Govern coding agents and roll RobOS out across your org.</p><span class="go">See why →</span></a>
    </div>
  </div>
</section>

<section class="final">
  <div class="wrap">
    <h2 class="h2">Describe it once. Ask it for anything.</h2>
    <div class="cta" style="margin-top:30px"><a class="btn btn-accent" href="{{ '/download/' | relative_url }}"><img class="btn-ic" src="/assets/icons/download.svg" alt="" width="18" height="18"> Download RobOS</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos" target="_blank" rel="noopener"><img class="btn-ic" src="/assets/icons/star.svg" alt="" width="18" height="18"> Star on GitHub</a></div>
  </div>
</section>
