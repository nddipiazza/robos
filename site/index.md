---
layout: default
title: RobOS
permalink: /
---
<section class="hero" style="padding-bottom:0">
  <div class="wrap">
    <a class="pill" href="{{ '/download/' | relative_url }}"><b>New</b> · RobOS v0.0.7 is out — download the installer →</a>
    <h1>Trust every line your <em>agents</em> write</h1>
    <p class="lead">RobOS is the AI-first SDLC platform: a desktop suite of developer apps, a knowledge graph of your whole system, and video proof-of-work for every agent change.</p>
    <div class="cta">
      <a class="btn" data-dl-href data-win="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-win.exe" data-mac="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-mac.dmg" data-linux="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-linux.AppImage" href="{{ '/download/' | relative_url }}">⬇ <span data-dl-label>Download RobOS</span></a>
      <a class="btn btn-ghost" href="{{ '/docs/' | relative_url }}">Read the docs</a>
    </div>
    <p class="sub">Free &amp; open source · macOS, Linux, Windows · <a href="{{ '/download/' | relative_url }}">Other install options</a></p>

    <div class="player" id="hero-player" data-slides="{{ site.data.hero.slides | size }}">
      <div class="player-frame">
        <div class="player-bar">
          <i></i><i></i><i></i><span>One task, from idea to merged PR, in the real RobOS apps</span>
          <button type="button" class="watch" id="hero-watch" aria-pressed="false">▶ Watch the full recording</button>
        </div>
        <div class="stage" id="hero-stage" tabindex="0" role="group" aria-roledescription="slideshow" aria-label="Walkthrough slides. Click or press space to pause or resume, arrow keys to step.">
          {%- for s in site.data.hero.slides %}
          <img class="slide{% if forloop.first %} is-active{% endif %}" src="{{ '/assets/hero/slides/' | append: s.file | relative_url }}" data-step="{{ s.step }}" data-dwell="{{ s.dwell }}" alt="{{ s.alt | escape }}" width="1280" height="720"{% unless forloop.first %} loading="lazy"{% endunless %}>
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
          <button type="button" class="ctl" id="hero-prev" aria-label="Previous slide" title="Previous (←)">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M10 3L5 8l5 5"/></svg>
          </button>
          <button type="button" class="ctl" id="hero-next" aria-label="Next slide" title="Next (→)">
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

<div class="logos"><div class="wrap">Works with the agents you already use<div><span>Claude Code</span><span>Google Antigravity</span><span>OpenAI Codex</span><span>GitHub Copilot</span><span>Gemini CLI</span></div></div></div>

<section id="product">
  <div class="wrap">
    <p class="eyebrow">The platform</p>
    <h2 class="h2">Everything between “ticket” and “shipped”</h2>
    <p class="sec-p">Agents do the grueling background labor. You stay the lead architect, with the evidence in front of you.</p>
    <div class="grid3">
      <div class="card"><div class="ic">🎬</div><h3>Video proof-of-work</h3><p>Agents run your app headlessly and hand back a narrated 1080p walkthrough, so you watch it work instead of reading the diff blind.</p></div>
      <div class="card"><div class="ic">🧬</div><h3>Knowledge graph first</h3><p>Model your architecture once. Every agent reads the same source of truth for services, contracts and schemas.</p></div>
      <div class="card"><div class="ic">💥</div><h3>Semantic blast radius</h3><p>See what a change will touch between <code>main</code> and a feature branch, before the code is even written.</p></div>
      <div class="card"><div class="ic">🧪</div><h3>Disposable sandboxes</h3><p>In-memory accounts and virtual displays keep your machine clean and your credentials out of agent reach.</p></div>
      <div class="card"><div class="ic">🛡️</div><h3>Prompt security guard</h3><p>Secrets, PII and prompt injection are caught before a prompt leaves your machine. Five policy modes, full audit log.</p></div>
      <div class="card"><div class="ic">🔀</div><h3>One router, any agent</h3><p>Route tasks across Claude Code, Codex, Gemini and Copilot through a single open harness protocol.</p></div>
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <div class="split">
      <div class="split-t">
        <p class="eyebrow">Review</p>
        <h3>Review AI pull requests you can actually understand</h3>
        <p>Open the Agent Code Review app, or jump straight into IntelliJ or VS Code with full symbol navigation and local tests.</p>
        <ul class="ticks"><li>Semantic diffs, not just line diffs</li><li>Inline comments and approvals</li><li>Breakpoint debugging of agent runs</li></ul>
        <p><a class="go" style="color:var(--accent);font-weight:600" href="{{ '/v1/pr-review-theater.html' | relative_url }}">Explore PR Review Theater →</a></p>
      </div>
      <div class="art"><img src="{{ '/v1/assets/images/dual-state-blast-radius.jpg' | relative_url }}" alt="Dual-state blast radius diagram" loading="lazy"></div>
    </div>
    <div class="split rev">
      <div class="split-t">
        <p class="eyebrow">Desktop suite</p>
        <h3>85 apps, one knowledge graph</h3>
        <p>Dev Central, Issue Manager, Git Projects, database and API clients, topology studio and more. All native, all sharing context.</p>
        <ul class="ticks"><li>Electron + plain JavaScript</li><li>Searchable app launcher</li><li>Install one app or the whole shell</li></ul>
        <p><a style="color:var(--accent);font-weight:600" href="{{ '/apps/' | relative_url }}">Browse the app directory →</a></p>
      </div>
      <div class="art"><img src="{{ '/v1/assets/images/kgraph-living-architecture.jpg' | relative_url }}" alt="Living knowledge graph architecture" loading="lazy"></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="stats"><div><b>85</b><span>desktop apps</span></div><div><b>5+</b><span>agent runtimes routed</span></div><div><b>3</b><span>operating systems</span></div><div><b>0</b><span>SaaS subscriptions</span></div></div>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <p class="eyebrow">Start here</p>
    <h2 class="h2">Pick your path</h2>
    <div class="grid3">
      <a class="card" href="{{ '/v1/use-robos.html' | relative_url }}"><div class="ic">🖥️</div><h3>Use RobOS</h3><p>Install it, tour the suite, and see a day with RobOS.</p><span class="go">Start using →</span></a>
      <a class="card" href="{{ '/v1/build-on-robos.html' | relative_url }}"><div class="ic">🧬</div><h3>Build on RobOS</h3><p>Model your system, generate apps, and write skills agents can run.</p><span class="go">Start building →</span></a>
      <a class="card" href="{{ '/v1/robos-for-teams.html' | relative_url }}"><div class="ic">🏢</div><h3>RobOS for Teams</h3><p>Govern coding agents and roll RobOS out across your org.</p><span class="go">See why →</span></a>
    </div>
  </div>
</section>

<section class="final">
  <div class="wrap">
    <h2 class="h2">Ship with agents. Keep the receipts.</h2>
    <div class="cta" style="margin-top:30px"><a class="btn btn-accent" href="{{ '/download/' | relative_url }}">⬇ Download RobOS</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos" target="_blank" rel="noopener">★ Star on GitHub</a></div>
  </div>
</section>
