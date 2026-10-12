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

    <div class="win" aria-label="Illustration of the RobOS pull request review app">
      <div class="win-bar"><i></i><i></i><i></i><span>Agent Code Review · fix/checkout-timeout</span></div>
      <div class="win-body">
        <div class="win-side"><b>Review</b><div class="on">Changed files (4)</div><div>Blast radius</div><div>Proof of work</div><b>Agents</b><div>claude-code</div><div>gemini-cli</div></div>
        <div class="win-main">
          <span class="ctx">  async function charge(order) {</span>
          <span class="del">-   return gateway.charge(order, { timeout: 0 });</span>
          <span class="add">+   return gateway.charge(order, { timeout: 8000, retries: 2 });</span>
          <span class="ctx">  }</span>
          <span class="ctx">&nbsp;</span>
          <span class="add">+ it('retries on gateway timeout', async () =&gt; { … });</span>
        </div>
        <div class="win-chat">
          <div class="bubble"><span class="tag">Blast radius</span><br>2 services, 1 contract affected</div>
          <div class="bubble ok"><span class="tag">Proof of work</span><br>▶ 1080p walkthrough · 14/14 tests pass</div>
          <div class="bubble">Ready to approve?</div>
        </div>
      </div>
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
