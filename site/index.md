---
layout: default
title: RobOS
permalink: /
---
<section class="hero" style="padding-bottom:0">
  <div class="wrap">
    <a class="pill" href="{{ '/download/' | relative_url }}"><b>New</b> · RobOS v0.0.7 is out — download the installer →</a>
    <h1>The <em>knowledge graph</em> is the product. The code is the output.</h1>
    <p class="lead">RobOS is a context-engineering toolset and app suite for AI development. Describe everything once in a standard KGraph: what it is, how it works, how to test it. Then let cheap, routed models do the building while you keep the proof.</p>
    <div class="cta">
      <a class="btn" data-dl-href data-win="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-win.exe" data-mac="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-mac.dmg" data-linux="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-linux.AppImage" href="{{ '/download/' | relative_url }}"><img class="btn-ic" src="/assets/icons/download.svg" alt="" width="18" height="18"> <span data-dl-label>Download RobOS</span></a>
      <a class="btn btn-ghost" href="{{ '/docs/' | relative_url }}">Read the docs</a>
    </div>
    <p class="sub">Free &amp; open source · macOS, Linux, Windows · <a href="{{ '/download/' | relative_url }}">Other install options</a></p>

    <div class="player" id="hero-player" data-slides="{{ site.data.hero.slides | size }}">
      <div class="player-frame">
        <div class="player-bar">
          <i></i><i></i><i></i><span>One task, from idea to merged PR, in the real RobOS apps</span>
          <button type="button" class="watch" id="hero-watch" aria-pressed="false">▶ Watch the full recording</button>
        </div>
        <div class="stage" id="hero-stage">
          {%- for s in site.data.hero.slides %}
          <img class="slide{% if forloop.first %} is-active{% endif %}" src="{{ '/assets/hero/slides/' | append: s.file | relative_url }}" data-step="{{ s.step }}" alt="{{ s.alt | escape }}" width="1280" height="720"{% unless forloop.first %} loading="lazy"{% endunless %}>
          {%- endfor %}
          <video id="hero-video" class="player-video" hidden controls muted loop playsinline preload="none" poster="{{ '/assets/hero/poster.jpg' | relative_url }}" aria-label="Recording of RobOS taking one task from creation, through implementation, review and CI, to a merged pull request">
            <source src="{{ '/assets/hero/hero.webm' | relative_url }}" type="video/webm">
            <source src="{{ '/assets/hero/hero.mp4' | relative_url }}" type="video/mp4">
          </video>
          <div class="stage-progress" aria-hidden="true"><i></i></div>
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

<div class="logos"><div class="wrap">Context-efficient routing to the models you already use<div><span>Claude Code</span><span>Google Antigravity</span><span>OpenAI Codex</span><span>GitHub Copilot</span><span>Gemini CLI</span><span>Open-source models</span></div></div></div>

<section class="alt" id="suites">
  <div class="wrap">
    <p class="eyebrow">App suites</p>
    <h2 class="h2">Real apps for real work, built on RobOS</h2>
    <p class="sec-p">RobOS builds more than developer tools. Each suite below was modeled in the KGraph, built by routed agents, and is verified by automated browser or gameplay tests. Use them as they are, or as a starting point for your own business.</p>
    <div class="suite-grid">
      <a class="card suite" href="{{ '/point-of-sale/' | relative_url }}">
        <div class="suite-shot"><img src="{{ '/assets/point-of-sale/coffee-register-latte.jpg' | relative_url }}" alt="RobOS Point of Sale register with a customized latte order" width="1280" height="800" loading="lazy"></div>
        <div class="suite-body"><span class="suite-tag">Retail · Cafés · Bars</span><h3>Point of Sale</h3><p>A touchscreen register with self-checkout, barcode and camera scanning, prep queues, open tabs and cash drawer reports. No subscription, data stays local.</p><span class="go">Tour Point of Sale →</span></div>
      </a>
      <a class="card suite" href="{{ '/auto-center/' | relative_url }}">
        <div class="suite-shot"><img src="{{ '/assets/auto-center/shots/04-checkout--issue-the-invoice-from-the-approved-estimate-7.jpg' | relative_url }}" alt="RobOS Auto checkout screen issuing an invoice from an approved estimate" width="1000" height="625" loading="lazy"></div>
        <div class="suite-body"><span class="suite-tag">Repair shops · Vehicle owners</span><h3>Auto Center</h3><p>Front desk intake, the mechanic bench, estimates and checkout for a repair shop, plus owner vehicle care, invoice scans and NHTSA recall remedies.</p><span class="go">Read the Auto Center guide →</span></div>
      </a>
      <a class="card suite" href="{{ '/family-finances/' | relative_url }}">
        <div class="suite-shot"><img src="{{ '/assets/family-finances/02-accounts.png' | relative_url }}" alt="RobOS Household accounts view with six reconciled accounts" width="1440" height="1185" loading="lazy"></div>
        <div class="suite-body"><span class="suite-tag">Families · Personal finance</span><h3>Household</h3><p>Statement imports and reconciliation, everyday spending categories, W-2 and 1099 field review, and a local federal tax estimate, all on your own machine.</p><span class="go">Walk through a family's year →</span></div>
      </a>
      <a class="card suite" href="{{ '/games/' | relative_url }}">
        <div class="suite-shot"><img src="{{ '/assets/games/tabletop-still-intro.jpg' | relative_url }}" alt="The Chronicler narrating the opening scene of the RobOS Tabletop RPG" width="1280" height="720" loading="lazy"></div>
        <div class="suite-body"><span class="suite-tag">cRPG · Tabletop · RTS</span><h3>Games</h3><p>Realm of Heroes, a HeroQuest-inspired Tabletop RPG and the Starfall Command RTS. Designed from a knowledge graph, written by agents and tested by playing them on camera.</p><span class="go">Choose a game →</span></div>
      </a>
    </div>
    <p class="suite-more"><a href="{{ '/apps/' | relative_url }}">Browse every app in the directory →</a></p>
  </div>
</section>

<section id="product">
  <div class="wrap">
    <p class="eyebrow">The idea</p>
    <h2 class="h2">Capture how everything works. Once.</h2>
    <p class="sec-p">The apps we build are not the point. We have used RobOS to build dozens of them, from real web apps to games. What matters is the KGraph behind each one: a durable description of what exists, how it behaves and how to verify it. With that in hand, implementation is cheap, slow-burn work that does not need an expensive frontier model.</p>
    <div class="grid3">
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/dna.svg" alt="" width="48" height="48" loading="lazy"></div><h3>One standard KGraph format</h3><p>A single schema for every system, service, contract, schema, runbook and test. Whatever it is, it has a node and a known shape.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/import.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Import anything</h3><p>A KGraph parser and import skills pull in any resource (repos, APIs, databases, docs, tickets) and turn it into useful, linked entries.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/route.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Context-efficient routing</h3><p>Agents get only the graph slice they need, routed to the best-value LLM provider. Cheap and open-source models carry the routine work.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/viewer.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Viewer, editor, e-learning</h3><p>Every node gets a viewer, a form editor, generated documentation and e-learning. All of it can be customized to your domain.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/film.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Proof, not promises</h3><p>Agents run the real app headlessly and hand back a narrated walkthrough and test evidence, so you review what happened rather than guess.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="/assets/icons/shield.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Safe by construction</h3><p>Disposable sandboxes, a prompt security guard for secrets, PII and injection, and a full audit log keep agents inside the lines.</p></div>
    </div>
  </div>
</section>

<section class="alt" id="sdlc">
  <div class="wrap">
    <p class="eyebrow">The SDLC</p>
    <h2 class="h2">The whole lifecycle, in one place</h2>
    <p class="sec-p">Task planning, implementation, local review, peer review and merge are all contained in RobOS and all driven by the KGraph. No stitching together five tools to find out what an agent did.</p>
    <ol class="flow">
      <li><b>Plan</b><span>Tasks derived from the graph</span></li>
      <li><b>Implement</b><span>Routed to the right model</span></li>
      <li><b>Local review</b><span>Semantic diff and tests</span></li>
      <li><b>Peer review</b><span>Humans and agents, with evidence</span></li>
      <li><b>Merge</b><span>Graph updated with the change</span></li>
    </ol>
  </div>
</section>

<section id="integrations">
  <div class="wrap">
    <p class="eyebrow">Integrations</p>
    <h2 class="h2">Plugs into the systems you already run</h2>
    <p class="sec-p">Source control, CI, search, content extraction and every database you use. Each integration is a KGraph import plus skills, so it teaches the agents how that system works.</p>
    <ul class="integ">
      <li><img src="https://cdn.simpleicons.org/github" alt="" loading="lazy" onerror="this.remove()">GitHub</li>
      <li><img src="https://cdn.simpleicons.org/gitea" alt="" loading="lazy" onerror="this.remove()">Gitea</li>
      <li><img src="https://cdn.simpleicons.org/gitlab" alt="" loading="lazy" onerror="this.remove()">GitLab</li>
      <li><img src="https://cdn.simpleicons.org/jenkins" alt="" loading="lazy" onerror="this.remove()">Jenkins</li>
      <li><img src="https://cdn.simpleicons.org/apachetika" alt="" loading="lazy" onerror="this.remove()">Apache Tika</li>
      <li><img src="https://cdn.simpleicons.org/postgresql" alt="" loading="lazy" onerror="this.remove()">PostgreSQL</li>
      <li><img src="https://cdn.simpleicons.org/mysql" alt="" loading="lazy" onerror="this.remove()">MySQL</li>
      <li><img src="https://cdn.simpleicons.org/mongodb" alt="" loading="lazy" onerror="this.remove()">MongoDB</li>
      <li><img src="https://cdn.simpleicons.org/redis" alt="" loading="lazy" onerror="this.remove()">Redis</li>
      <li><img src="https://cdn.simpleicons.org/elasticsearch" alt="" loading="lazy" onerror="this.remove()">Elasticsearch</li>
      <li><img src="https://cdn.simpleicons.org/apachesolr" alt="" loading="lazy" onerror="this.remove()">Apache Solr</li>
      <li><img src="https://cdn.simpleicons.org/apachekafka" alt="" loading="lazy" onerror="this.remove()">Kafka</li>
      <li><img src="https://cdn.simpleicons.org/docker" alt="" loading="lazy" onerror="this.remove()">Docker</li>
      <li><img src="https://cdn.simpleicons.org/kubernetes" alt="" loading="lazy" onerror="this.remove()">Kubernetes</li>
      <li><img src="https://cdn.simpleicons.org/jira" alt="" loading="lazy" onerror="this.remove()">Jira</li>
      <li><img src="https://cdn.simpleicons.org/slack" alt="" loading="lazy" onerror="this.remove()">Slack</li>
      <li class="more">and many more</li>
    </ul>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <div class="split">
      <div class="split-t">
        <p class="eyebrow">Review</p>
        <h3>Review AI pull requests you can actually understand</h3>
        <p>The graph knows what a change should touch, so review starts from intent. Open the Agent Code Review app, or jump into IntelliJ or VS Code with full symbol navigation and local tests.</p>
        <ul class="ticks"><li>Semantic diffs, not just line diffs</li><li>Inline comments and approvals</li><li>Breakpoint debugging of agent runs</li></ul>
        <p><a class="go" style="color:var(--accent);font-weight:600" href="{{ '/v1/pr-review-theater.html' | relative_url }}">Explore PR Review Theater →</a></p>
      </div>
      <div class="art"><img src="{{ '/v1/assets/images/dual-state-blast-radius.jpg' | relative_url }}" alt="Dual-state blast radius diagram" loading="lazy"></div>
    </div>
    <div class="split rev">
      <div class="split-t">
        <p class="eyebrow">Desktop suite</p>
        <h3>One knowledge graph behind every app</h3>
        <p>Dev Central, Issue Manager, Git Projects, database and API clients, topology studio and more. Every app reads and writes the same graph, so context never gets lost between tools. Built with RobOS itself, and open source as a starting point for yours.</p>
        <ul class="ticks"><li>Electron + plain JavaScript</li><li>Searchable app launcher</li><li>Install one app or the whole shell</li></ul>
        <p><a style="color:var(--accent);font-weight:600" href="{{ '/apps/' | relative_url }}">Browse the app directory →</a></p>
      </div>
      <div class="art"><img src="{{ '/v1/assets/images/kgraph-living-architecture.jpg' | relative_url }}" alt="Living knowledge graph architecture" loading="lazy"></div>
    </div>
  </div>
</section>

<section id="make-money">
  <div class="wrap">
    <p class="eyebrow">Make money with RobOS</p>
    <h2 class="h2">Start a small software business on top of it</h2>
    <p class="sec-p">RobOS is free and open source, which makes it a ready-made foundation for a services company. Set up an LLC, use the existing apps as your starting inventory, and earn from the gap between what customers pay for old software and what it now costs you to replace it.</p>
    <div class="grid3">
      <div class="card"><div class="ic"><img class="ic-img" src="{{ '/assets/icons/building.svg' | relative_url }}" alt="" width="48" height="48" loading="lazy"></div><h3>1. Set up an LLC</h3><p>Form a small company that owns the customer relationships, the contracts and your extensions. RobOS stays open source, and your business is the work you do on top of it.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="{{ '/assets/icons/tools.svg' | relative_url }}" alt="" width="48" height="48" loading="lazy"></div><h3>2. Take, extend or build apps</h3><p>Start from an existing RobOS app, extend it to fit a customer's workflow, or build a new one from a KGraph. Routed, cheaper models do the bulk of the work, so your margin stays healthy.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="{{ '/assets/icons/route.svg' | relative_url }}" alt="" width="48" height="48" loading="lazy"></div><h3>3. Migrate customers over</h3><p>Move customers off the aging or expensive software they run today and onto the new RobOS-based version. Import their existing systems into the graph so the migration is documented and testable.</p></div>
      <div class="card"><div class="ic"><img class="ic-img" src="{{ '/assets/icons/money.svg' | relative_url }}" alt="" width="48" height="48" loading="lazy"></div><h3>4. Sell support contracts</h3><p>Put every customer on a support contract that covers their support tickets. Recurring revenue pays for the ongoing work, and the KGraph keeps each fix quick to find and verify.</p></div>
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <p class="eyebrow">Start here</p>
    <h2 class="h2">Pick your path</h2>
    <div class="grid3">
      <a class="card" href="{{ '/v1/use-robos.html' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/desktop.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Use RobOS</h3><p>Install it, tour the suite, and see a day with RobOS.</p><span class="go">Start using →</span></a>
      <a class="card" href="{{ '/v1/build-on-robos.html' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/dna.svg" alt="" width="48" height="48" loading="lazy"></div><h3>Build on RobOS</h3><p>Model your system, generate apps, and write skills agents can run.</p><span class="go">Start building →</span></a>
      <a class="card" href="{{ '/v1/robos-for-teams.html' | relative_url }}"><div class="ic"><img class="ic-img" src="/assets/icons/building.svg" alt="" width="48" height="48" loading="lazy"></div><h3>RobOS for Teams</h3><p>Govern coding agents and roll RobOS out across your org.</p><span class="go">See why →</span></a>
    </div>
  </div>
</section>

<section class="final">
  <div class="wrap">
    <h2 class="h2">Describe it once. Build it cheaply, again and again.</h2>
    <div class="cta" style="margin-top:30px"><a class="btn btn-accent" href="{{ '/download/' | relative_url }}"><img class="btn-ic" src="/assets/icons/download.svg" alt="" width="18" height="18"> Download RobOS</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos" target="_blank" rel="noopener"><img class="btn-ic" src="/assets/icons/star.svg" alt="" width="18" height="18"> Star on GitHub</a></div>
  </div>
</section>
