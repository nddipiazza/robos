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

<section id="product">
  <div class="wrap">
    <p class="eyebrow">The idea</p>
    <h2 class="h2">Capture how everything works. Once.</h2>
    <p class="sec-p">The apps we build are not the point. We have used RobOS to build dozens of them, from real web apps to games. What matters is the KGraph behind each one: a durable description of what exists, how it behaves and how to verify it. With that in hand, implementation is cheap, slow-burn work that does not need an expensive frontier model.</p>
    <div class="grid3">
      <div class="card"><div class="ic">🧬</div><h3>One standard KGraph format</h3><p>A single schema for every system, service, contract, schema, runbook and test. Whatever it is, it has a node and a known shape.</p></div>
      <div class="card"><div class="ic">📥</div><h3>Import anything</h3><p>A KGraph parser and import skills pull in any resource (repos, APIs, databases, docs, tickets) and turn it into useful, linked entries.</p></div>
      <div class="card"><div class="ic">🔀</div><h3>Context-efficient routing</h3><p>Agents get only the graph slice they need, routed to the best-value LLM provider. Cheap and open-source models carry the routine work.</p></div>
      <div class="card"><div class="ic">🖼️</div><h3>Viewer, editor, e-learning</h3><p>Every node gets a viewer, a form editor, generated documentation and e-learning. All of it can be customized to your domain.</p></div>
      <div class="card"><div class="ic">🎬</div><h3>Proof, not promises</h3><p>Agents run the real app headlessly and hand back a narrated walkthrough and test evidence, so you review what happened rather than guess.</p></div>
      <div class="card"><div class="ic">🛡️</div><h3>Safe by construction</h3><p>Disposable sandboxes, a prompt security guard for secrets, PII and injection, and a full audit log keep agents inside the lines.</p></div>
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
        <h3>85 apps, one knowledge graph</h3>
        <p>Dev Central, Issue Manager, Git Projects, database and API clients, topology studio and more. Every app reads and writes the same graph, so context never gets lost between tools. Built with RobOS itself, and open source as a starting point for yours.</p>
        <ul class="ticks"><li>Electron + plain JavaScript</li><li>Searchable app launcher</li><li>Install one app or the whole shell</li></ul>
        <p><a style="color:var(--accent);font-weight:600" href="{{ '/apps/' | relative_url }}">Browse the app directory →</a></p>
      </div>
      <div class="art"><img src="{{ '/v1/assets/images/kgraph-living-architecture.jpg' | relative_url }}" alt="Living knowledge graph architecture" loading="lazy"></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="stats"><div><b>85</b><span>desktop apps</span></div><div><b>5+</b><span>LLM runtimes routed</span></div><div><b>3</b><span>operating systems</span></div><div><b>0</b><span>SaaS subscriptions</span></div></div>
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
    <h2 class="h2">Describe it once. Build it cheaply, again and again.</h2>
    <div class="cta" style="margin-top:30px"><a class="btn btn-accent" href="{{ '/download/' | relative_url }}">⬇ Download RobOS</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos" target="_blank" rel="noopener">★ Star on GitHub</a></div>
  </div>
</section>
