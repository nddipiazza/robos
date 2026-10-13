---
layout: default
title: RobOS
permalink: /
extra_css: /assets/home.css
body_class: home
---
{%- assign real_apps = site.apps | where_exp: "a", "a.category != 'games'" -%}
<section class="h-hero">
  <div class="wrap h-hero-grid">
    <div class="h-hero-copy">
      <h1>Trust every line your <em>agents</em> write</h1>
      <p class="h-lead">RobOS is a platform for working with coding agents. It combines a desktop suite of developer apps, a knowledge graph of your system, and a recorded run of every agent change, so the person approving a change sees the diff, captured evidence and a walkthrough, not a bare diff.</p>
      <div class="h-cta">
        <a class="h-btn h-btn-primary" data-dl-href data-win="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-win.exe" data-mac="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-mac.dmg" data-linux="https://github.com/nddipiazza/robos/releases/download/v0.0.7/RobOS-Installer-v0.0.7-linux.AppImage" href="{{ '/download/' | relative_url }}"><span data-dl-label>Download RobOS</span></a>
        <a class="h-btn" href="{{ '/docs/' | relative_url }}">Read the docs</a>
        <a class="h-text-link" href="https://github.com/nddipiazza/robos" target="_blank" rel="noopener">Source on GitHub</a>
      </div>
      <p class="h-small"><a href="{{ '/download/' | relative_url }}">Other install options</a>: from source, a GNOME launcher, the appliance on a USB drive, or a QEMU image.</p>
    </div>
    <dl class="h-facts" aria-label="Facts about RobOS">
      <div><dt>Release</dt><dd><a href="https://github.com/nddipiazza/robos/releases/tag/v0.0.7" target="_blank" rel="noopener">v0.0.7</a></dd></div>
      <div><dt>License</dt><dd><a href="https://github.com/nddipiazza/robos/blob/main/LICENSE" target="_blank" rel="noopener">Apache License 2.0</a></dd></div>
      <div><dt>Platforms</dt><dd>macOS, Linux, Windows</dd></div>
      <div><dt>Desktop apps</dt><dd><a href="{{ '/apps/' | relative_url }}">{{ real_apps.size }}</a> in {{ site.data.app_categories.size }} categories</dd></div>
      <div><dt>Built with</dt><dd>Electron and plain JavaScript</dd></div>
      <div><dt>Agents run</dt><dd>Claude Code, Codex, GitHub Copilot CLI</dd></div>
    </dl>
  </div>
</section>

<section class="h-stage h-deep">
  <div class="wrap">
    <div class="player" id="hero-player" data-slides="{{ site.data.hero.slides | size }}">
      <div class="player-frame">
        <div class="player-bar">
          <span>Recording: one task from ticket to merged pull request</span>
          <button type="button" class="watch" id="hero-watch" aria-pressed="false">Watch the full recording</button>
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
      <p class="player-note">Recorded from the real apps against a demo repository (Pawfinder). GitHub, the coding agent and CI results are scripted stand-ins; the repository, tests, diff and evidence are real.</p>
    </div>
  </div>
</section>

<section class="h-sec" id="product">
  <div class="wrap">
    <div class="h-head">
      <p class="h-label">What it does</p>
      <h2>Review agent work with the evidence in front of you</h2>
      <p class="h-sub">Agents do the background work: branching, editing, running tests. RobOS puts the diff, the captured evidence and a walkthrough in front of the person approving the change.</p>
    </div>
    <ul class="h-rows">
      <li>
        <h3>Recorded proof of work</h3>
        <p>A demo script drives a RobOS app step by step while <code>ffmpeg</code> records the window as a 1080p WebM, with captions taken from the script. It runs headless in a Docker container.</p>
        <code class="h-src">packages/robos-test</code>
      </li>
      <li>
        <h3>Knowledge graph</h3>
        <p>Services, contracts, schemas and ownership are described as JSON-LD packages under <code>.robos/</code>, using OSLC, C4, Pact and schema.org vocabularies, and checked against SHACL shapes.</p>
        <code class="h-src">.robos/knowledge-graph.jsonld</code>
      </li>
      <li>
        <h3>Blast radius</h3>
        <p>From any node, list what depends on it. The CLI can also diff two graph documents and report the services and contracts affected. Branch diffs use in-memory sample branches today, not your Git branches.</p>
        <code class="h-src">packages/robos-graph</code>
      </li>
      <li>
        <h3>Agent profiles</h3>
        <p><code>robos-run-as</code> runs a command with <code>HOME</code> pointing at a private folder, a 2 GB <code>tmpfs</code> when the daemon runs as root. It keeps stray files out of your home folder. It is not a security boundary; use the Docker container for stronger isolation.</p>
        <code class="h-src">packages/robos-profiled</code>
      </li>
      <li>
        <h3>Prompt security guard</h3>
        <p>Prompts are scanned for secrets, personal data and injection phrases before they reach an agent. Modes: redact (the default), block, warn, audit-only, off. The audit log records finding types and counts, not the secret.</p>
        <code class="h-src">packages/robos-lib/prompt-security.js</code>
      </li>
      <li>
        <h3>One interface, several agent CLIs</h3>
        <p>One session API runs prompts through Claude Code, Codex or the GitHub Copilot CLI. Other harnesses are listed, but the embedded router does not run them yet.</p>
        <code class="h-src">packages/robos-agent-client</code>
      </li>
    </ul>
  </div>
</section>

<section class="h-sec h-tint" id="how">
  <div class="wrap">
    <div class="h-head">
      <p class="h-label">The idea</p>
      <h2>Edit the description. Generate the real thing.</h2>
      <p class="h-sub">RobOS keeps a plain-text description of your project in files in your repo: what exists and how it fits together. We call it the knowledge graph. Change the description, and code writes the real files from it.</p>
    </div>
    <div class="h-flow">
      <article class="h-cell">
        <h3><span class="h-n">1</span>Describe it</h3>
        <p class="h-says">Write down what exists, as data. This is one monster from a game: its name, hit points, armor and speed. It lives in a file in your repo.</p>
        <figure class="h-code">
          <figcaption><b>You edit this</b><span>.robos/kgraphs/crpg/package.jsonld, trimmed</span></figcaption>
<pre><code>{
  <i class="k">"@id"</i>: <i class="s">"urn:robos:crpg:monster:corrupted-hound"</i>,
  <i class="k">"dcterms:title"</i>: <i class="s">"Corrupted Shadow Hound"</i>,
  <i class="k">"robos:challengeRating"</i>: <i class="s">"1/4"</i>,
  <i class="k">"robos:hitPoints"</i>: 11,
  <i class="k">"robos:armorClass"</i>: 12,
  <i class="k">"robos:speed"</i>: 40
}</code></pre>
        </figure>
      </article>
      <article class="h-cell">
        <h3><span class="h-n">2</span>Run one command</h3>
        <p class="h-says">A builder reads every description in the graph (106 of them for this game) and checks them first. If something is broken, it stops. If not, it writes the files.</p>
        <figure class="h-code">
          <figcaption><b>You run this</b><span>real output, reformatted for reading</span></figcaption>
<pre><code><i class="k">$</i> node packages/crpg-builder/bin/crpg-builder.js generate

Processed 106 Knowledge Graph entities.
Generated JSON data store under:    data/v1/
Generated JSON Schemas under:       schemas/v1/
Generated typed GDScript models:    src/generated/v1/
Generated Godot 4 isometric scenes: scenes/</code></pre>
        </figure>
      </article>
      <article class="h-cell h-cell-wide">
        <h3><span class="h-n">3</span>Get the real files</h3>
        <p class="h-says">Here is the same monster, written out two ways: as game data, and as code the game uses to read that data. Change a number in step 1, run the command again, and these files change to match.</p>
        <div class="h-pair">
          <figure class="h-code">
            <figcaption><b>Written for you: the data</b><span>games/crpg-realm/data/v1/monsters.json, trimmed</span></figcaption>
<pre><code>{
  <i class="k">"id"</i>: <i class="s">"corrupted-hound"</i>,
  <i class="k">"title"</i>: <i class="s">"Corrupted Shadow Hound"</i>,
  <i class="k">"challengeRating"</i>: <i class="s">"1/4"</i>,
  <i class="k">"armorClass"</i>: 12,
  <i class="k">"hitPoints"</i>: 11,
  <i class="k">"speed"</i>: 40,
  ...
}</code></pre>
          </figure>
          <figure class="h-code">
            <figcaption><b>Written for you: the code</b><span>games/crpg-realm/src/generated/v1/MonsterData.gd, trimmed</span></figcaption>
<pre><code><i class="k">class_name</i> MonsterData
<i class="k">extends</i> RefCounted

<i class="k">var</i> title: String = ""
<i class="k">var</i> armor_class: int = 10
<i class="k">var</i> hit_points: int = 10
<i class="k">var</i> speed: int = 30
...</code></pre>
          </figure>
        </div>
      </article>
    </div>
    <p class="h-honest"><b>What this is, and is not.</b> This is one working example of the idea. The Schemas pages in these docs are generated from the graph's rules the same way, and so are course and documentation websites. It does not yet turn any description into any kind of app: the App Wizard works the other way round, writing an app's files and then recording the app in the graph. And in this game some data was edited by hand after it was first generated, so running the builder over the game today would overwrite those edits.</p>
    <p class="h-more"><a href="{{ '/v1/knowledge-graph.html' | relative_url }}">How the knowledge graph works</a></p>
  </div>
</section>

<section class="h-sec" id="review">
  <div class="wrap">
    <div class="h-head">
      <p class="h-label">Review</p>
      <h2>Read the diff, check the evidence, then approve</h2>
      <p class="h-sub">Code Review Theater is where the owner of a change reviews it: the diff, captured evidence and a walkthrough. From a review you can open files in VS Code or IntelliJ IDEA.</p>
    </div>
    <div class="h-shots">
      <figure>
        <img src="{{ '/assets/shots/review-changes.jpg' | relative_url }}" width="1280" height="520" alt="Code Review Theater showing a unified diff of src/pets.js with a file tree on the left" loading="lazy">
        <figcaption><b>Changes</b> The full diff of the pushed branch, file by file, with a Viewed checkbox on each.</figcaption>
      </figure>
      <figure>
        <img src="{{ '/assets/shots/review-evidence.jpg' | relative_url }}" width="1280" height="520" alt="Evidence tab showing the same API call run on main and on the branch, side by side" loading="lazy">
        <figcaption><b>Evidence</b> The same call run on <code>main</code> and on the branch, captured when the agent ran it.</figcaption>
      </figure>
      <figure>
        <img src="{{ '/assets/shots/review-walkthrough.jpg' | relative_url }}" width="1280" height="520" alt="Walkthrough tab with the changed Pawfinder app open beside the agent's running log" loading="lazy">
        <figcaption><b>Walkthrough</b> An agent opens the running app and demonstrates each checkpoint while you stay in control.</figcaption>
      </figure>
    </div>
    <p class="h-more"><a href="{{ '/v1/pr-review-theater.html' | relative_url }}">How PR Review Theater works</a></p>
  </div>
</section>

<section class="h-sec h-sand" id="apps">
  <div class="wrap">
    <div class="h-head">
      <p class="h-label">Desktop suite</p>
      <h2>{{ real_apps.size }} apps that share one knowledge graph</h2>
      <p class="h-sub">The full list, by category. Each app is its own Electron window; install one or the whole shell.</p>
    </div>
    <div class="h-index">
      {%- for cat in site.data.app_categories -%}
      {%- assign cat_apps = site.apps | where: "category", cat.id | sort: "title" -%}
      {%- if cat_apps.size > 0 %}
      <div class="h-index-row">
        <h3>{{ cat.name }} <span>{{ cat_apps.size }}</span></h3>
        <p>{% for app in cat_apps %}<a href="{{ '/v1/apps/' | append: app.slug | append: '/' | relative_url }}">{{ app.title }}</a>{% unless forloop.last %}, {% endunless %}{% endfor %}</p>
      </div>
      {%- endif -%}
      {%- endfor %}
    </div>
    <p class="h-more"><a href="{{ '/apps/' | relative_url }}">Browse the app directory with descriptions</a></p>
  </div>
</section>

<section class="h-sec">
  <div class="wrap">
    <div class="h-head">
      <p class="h-label">Start here</p>
      <h2>Pick the path that matches your job</h2>
    </div>
    <div class="h-paths">
      <a href="{{ '/v1/use-robos.html' | relative_url }}">
        <h3>Use RobOS</h3>
        <p class="h-who">Developers and anyone running agents</p>
        <p>Install it, tour the app suite, and see what a day with RobOS looks like.</p>
      </a>
      <a href="{{ '/v1/build-on-robos.html' | relative_url }}">
        <h3>Build on RobOS</h3>
        <p class="h-who">App and knowledge graph developers</p>
        <p>Model your system, generate and import apps, and write skills that agents can run.</p>
      </a>
      <a href="{{ '/v1/robos-for-teams.html' | relative_url }}">
        <h3>RobOS for Teams</h3>
        <p class="h-who">Tech leads and evaluators</p>
        <p>Govern coding agents, review AI pull requests you can understand, and roll it out across an org.</p>
      </a>
    </div>
  </div>
</section>

<section class="h-sec h-deep h-install">
  <div class="wrap h-install-grid">
    <div>
      <p class="h-label">Install</p>
      <h2>Run an app from source</h2>
      <p class="h-sub">The macOS, Linux and Windows downloads install the RobOS appliance on a USB drive. To run the apps on the machine you have now, run them from source. You need Node.js 20+, Git and a desktop session.</p>
      <div class="h-cta">
        <a class="h-btn h-btn-primary" href="{{ '/download/' | relative_url }}">All install options</a>
        <a class="h-text-link" href="{{ '/v1/getting-started.html' | relative_url }}">Get started guide</a>
      </div>
    </div>
    <figure class="h-code h-code-flat">
      <figcaption><b>From source</b><span>pr-review is one app; run the script with no argument to list them</span></figcaption>
<pre><code>git clone https://github.com/nddipiazza/robos.git
cd robos
scripts/dev-launch.sh pr-review</code></pre>
    </figure>
  </div>
</section>

<section class="h-sec h-license" id="license">
  <div class="wrap h-license-grid">
    <div>
      <p class="h-label">License</p>
      <h2>Apache License 2.0</h2>
    </div>
    <div class="h-license-text">
      <p>RobOS is free and open source. You can use it, modify it and ship it commercially. There is no SaaS subscription and no proprietary cloud dependency. The license also includes an express patent grant from every contributor.</p>
      <p class="h-more"><a href="https://github.com/nddipiazza/robos/blob/main/LICENSE" target="_blank" rel="noopener">Read the full license</a></p>
    </div>
  </div>
</section>
