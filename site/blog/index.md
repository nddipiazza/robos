---
layout: default
title: Engineering Blog
description: "Two months of engineering in RobOS: CLI-first AI with an optional API mode, Cloud Storage & Audio Suite, Tabletop RPG & Midterm Elections 2026, RobOS Household & Tax Prep, Point of Sale, Auto Center, Starfall Command RTS, The Skill Commons, PR Review Theater, Realm of Heroes cRPG, RobOS Voice, and the Dual-State Knowledge Graph."
permalink: /blog/
extra_css: /assets/blog.css
og_image: /assets/hero/poster.jpg
---
<section class="blog-hero">
  <div class="wrap">
    <p class="eyebrow">Engineering Log · August – October 2026</p>
    <h1>What we built over the last two months</h1>
    <p class="lead">Every major feature, application, game engine, and architectural milestone shipped in the RobOS repository over the past eight weeks—from the Dual-State Knowledge Graph and local-first PR Review Theater to open-source small-business apps and full Godot 4 games.</p>
  </div>
  <nav class="blog-jump" aria-label="Jump to blog post">
    <a href="#cli-agents-and-api-mode">CLI Agents &amp; API Mode</a>
    <a href="#cloud-storage-and-audio-suite">Cloud Storage &amp; Audio</a>
    <a href="#tabletop-rpg-and-election-2026">Tabletop RPG &amp; Election 2026</a>
    <a href="#robos-household-and-tax-prep">Household &amp; Tax Prep</a>
    <a href="#point-of-sale">Point of Sale</a>
    <a href="#auto-center">Auto Center</a>
    <a href="#starfall-command-rts">Starfall Command RTS</a>
    <a href="#skill-commons-and-site-v2">Skill Commons &amp; Site v2</a>
    <a href="#pr-review-theater-and-dev-central">PR Review Theater</a>
    <a href="#realm-of-heroes-crpg">Realm of Heroes cRPG</a>
    <a href="#robos-voice-and-parse-portal">RobOS Voice &amp; Luxir</a>
    <a href="#dual-state-kgraph-and-sdlc">Dual-State KGraph &amp; v0.0.7</a>
  </nav>
</section>

<div class="blog-feed">

  <article class="blog-entry" id="cli-agents-and-api-mode">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-21">Oct 20 – Oct 21, 2026</time>
      <span class="blog-tag">AI Agents</span>
      <span class="blog-tag">LangChain.js</span>
      <span class="blog-tag">Security</span>
    </div>
    <h2><a href="#cli-agents-and-api-mode">Bring Your Own Agent CLI: An Optional API Mode, and Why We Removed the Harness Router</a></h2>
    <p class="blog-summary">RobOS keeps running the coding-agent CLIs you already use. We added an opt-in API mode through LangChain.js for quick requests, local Ollama models and semantic Knowledge Graph search, and deleted the Unified Harness Protocol router that nothing actually used.</p>
    <div class="blog-body">
      <p>The question was whether RobOS should adopt LangChain. Almost all of its AI work already goes to Claude Code, Codex, Gemini CLI / Antigravity or GitHub Copilot, which bring their own tool loops, models and sign-in. Putting a second agent runtime underneath them would duplicate that. So the rule is: install a CLI, sign in, and RobOS works. Direct model APIs are an option, never a requirement.</p>
      <ul>
        <li><strong>One switch point:</strong> every one-shot AI request in the apps goes through <code>robos-lib/ai-agent</code>, which runs the CLI you set as active in RobOS Agents. Gemini CLI / Antigravity joins Copilot, Claude Code and Codex as a supported provider, and Software Center can now install it.</li>
        <li><strong>Optional API mode (<code>packages/robos-llm</code>):</strong> off by default. Turn it on in RobOS Preferences and quick requests go to Anthropic, OpenAI, Google Gemini or a local Ollama server through LangChain.js, falling back to your CLI if the call fails. The LangChain packages are not shipped with RobOS; Preferences installs them on request into <code>~/.local/share/robos/llm-deps</code>. API keys live only in <code>pass</code>, keys that older versions saved as plain text are moved there, and LangSmith tracing is forced off.</li>
        <li><strong>Stubs that now do real work:</strong> the <strong>?</strong> quick-ask button in the AI text box was not wired into any app; it now answers in AI Prompt Studio, Git Projects and the Knowledge Graph Explorer. The Graph Explorer's AI Co-Pilot used to pick nodes by keyword; it now asks your agent and checks the answer against the SHACL shapes. Import &amp; Refine's <strong>Ask AI agent</strong> works with any signed-in CLI instead of needing a router server.</li>
        <li><strong>Semantic Knowledge Graph search:</strong> with API mode on, <code>kgraph search --engine semantic</code> and the <code>robos_kgraph_semantic_search</code> MCP tool rank nodes by meaning, using embeddings from OpenAI, Gemini or Ollama and a local vector index that only re-embeds changed nodes.</li>
        <li><strong>Removing the harness router:</strong> no app ran real work through <code>robos-agent-client/harness-router.js</code>. Its in-process fallback passed prompts through a shell, so quotes or <code>$(...)</code> in a prompt could run commands, and it reported success for three of its six harnesses without starting anything. We deleted it, the unused session layer and the Agents Manager panel, about 3,600 lines of code and docs. The prompt security scan moved into <code>ai-agent</code>, so every one-shot prompt is checked before it reaches a CLI or an API.</li>
      </ul>
      <p>Still open: answers arrive in one piece rather than streaming, and Task Implementer and Dev Central start their CLIs without the prompt scan.</p>
      <figure class="blog-fig">
        <img src="{{ '/v1/assets/images/screenshots/ai-api-mode-preferences.png' | relative_url }}" alt="RobOS Preferences, AI Agents and API Mode section, with API mode on, Google Gemini selected, a key saved in pass, and Ollama embeddings for semantic search" loading="lazy">
        <figcaption>The new AI Agents &amp; API Mode section in RobOS Preferences. Key fields save straight to <code>pass</code>.</figcaption>
      </figure>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/ai-providers.html' | relative_url }}">AI agents and API mode →</a>
      <a href="{{ '/v1/agent-tiers.html' | relative_url }}">How tasks reach an agent CLI →</a>
      <span class="blog-commits">Commits: ac06cf5 · 232afef</span>
    </div>
  </article>

  <article class="blog-entry" id="cloud-storage-and-audio-suite">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-20">Oct 14 – Oct 20, 2026</time>
      <span class="blog-tag">Data Sources</span>
      <span class="blog-tag">Audio Player</span>
      <span class="blog-tag">Smart Home</span>
    </div>
    <h2><a href="#cloud-storage-and-audio-suite">Cloud Storage &amp; Data Sources Overhaul, RobOS Audio Player, and Home Speaker</a></h2>
    <p class="blog-summary">Unified local, FTP, SFTP, and live Google Drive OAuth 2.0 folder mounting in Data Sources, and built a desktop Audio Player and Home Speaker intercom suite with zero-cloud Google Cast streaming.</p>
    <div class="blog-body">
      <p>Connecting external storage and media libraries across desktop apps required too much manual form entry. We overhauled <strong>Cloud Storage &amp; Data Sources</strong> (<code>packages/data-sources</code>) around a guided 3-step connection wizard with real Google OAuth 2.0 browser sign-in, live Google Drive API folder mounting, top-right authentication status toasts, and native FTP/SFTP storage drivers alongside PostgreSQL schema inspection.</p>
      <ul>
        <li><strong>Managed Library Folders:</strong> <strong>RobOS Audio Player</strong> (<code>packages/audio-player</code>) mounts local directories, FTP servers, and SFTP shares as managed libraries with one-click sync, rename, and removal. Folder scanning runs on a background worker thread so large music libraries never stall the UI.</li>
        <li><strong>Playlists, Synced Lyrics &amp; Amber Library View:</strong> Added a sortable, list-based library view with a warm amber palette, synced lyric display, M3U playlist import/export, and Howler.js + H5AudioPlayer playback.</li>
        <li><strong>Local Cast &amp; Home Speaker Intercom:</strong> Built zero-cloud Google Home / Cast discovery and streaming directly from the Now Playing deck, plus the companion <strong>RobOS Home Speaker</strong> app (<code>packages/home-speaker</code>) for push-to-talk intercom broadcasts, neural TTS announcements, and scheduled chimes.</li>
      </ul>
      <figure class="blog-fig">
        <img src="{{ '/v1/assets/images/audio-player-playlist-architecture.jpg' | relative_url }}" alt="RobOS Audio Player and Home Speaker playlist and Cast streaming architecture" loading="lazy">
        <figcaption>RobOS Audio Player library management, background metadata worker, and local Cast streaming pipeline.</figcaption>
      </figure>
    </div>
    <div class="blog-links">
      <a href="{{ '/apps/' | relative_url }}">Browse Audio &amp; Data Sources apps →</a>
      <span class="blog-commits">Commits: f8bbcede · 073d9bc1 · 87319217 · 426eaad4 · 7af920a2</span>
    </div>
  </article>

  <article class="blog-entry" id="tabletop-rpg-and-election-2026">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-20">Oct 1 – Oct 20, 2026</time>
      <span class="blog-tag">Godot 4</span>
      <span class="blog-tag">Tabletop RPG</span>
      <span class="blog-tag">Game Authoring</span>
    </div>
    <h2><a href="#tabletop-rpg-and-election-2026">Tabletop RPG Engine, Two-Layer Map Studio, and the "Midterm Elections 2026" Campaign</a></h2>
    <p class="blog-summary">Built a HeroQuest-inspired tactical dungeon crawler in Godot 4, a two-layer blockmap and quest authoring suite, autonomous Mentor-vs-Zargon AI playthrough verification, and a voiced satirical Midterm Elections 2026 campaign pack.</p>
    <div class="blog-body">
      <p>To make classic grid-based tabletop dungeon crawlers fast to author and verify, we split level design into two distinct layers and paired them with a deterministic Godot 4 tactical engine (<code>games/tabletop-rpg</code>) and <strong>RobOS Tabletop Studio</strong> (<code>packages/robos-tabletop</code>):</p>
      <ul>
        <li><strong>Layer 1 — Tabletop Blockmap Creator (<code>packages/tabletop-blockmap-creator</code>):</strong> Calibrates tile size and X/Y offsets over any board artwork, supports freeform contiguous room painting and corridor geometry, and saves reusable static blockmaps.</li>
        <li><strong>Layer 2 — Tabletop Quest Map Editor (<code>packages/tabletop-quest-editor</code>):</strong> Places single and 2×1/1×2 double doors, monsters, furniture, traps, secret doors, border stairs, and recursive event/action dialogue triggers. Exports playable <code>.cartridge</code> bundles as well as high-resolution PNG and printable PDF quest sheets.</li>
        <li><strong>Tactical Rules, Raycasted Fog of War &amp; GPU Optimization:</strong> Implemented authentic raycasted line-of-sight room reveals, permanently visible unreachable non-room tiles, A* monster pathfinding, skull-and-shield combat dice trays, Dwarf trap disarming, parchment treasure cards, and KGraph save-state telemetry—while eliminating a 4-second GPU frame readback stall on turn transitions.</li>
        <li><strong>Autonomous Playthroughs &amp; Midterm Elections 2026 Pack:</strong> Built an autonomous Mentor Party vs. Zargon AI harness that plays full quests end-to-end and emits an HTML Proof of Viability ledger. Topped it off with the <em>Midterm Elections 2026</em> campaign featuring a Capitol Oval Office blockmap, 24 satirical enemies and spells, multi-headed Hydra bosses, Oval Office intro and victory movies, custom hero tokens, and 40+ situation-specific voice lines across turn start, movement, attack, reaction, and death triggers.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/games/tabletop-bg-poster.jpg' | relative_url }}" alt="RobOS Tabletop RPG dungeon board with tactical miniatures and HUD" loading="lazy">
          <figcaption>Tactical dungeon crawl in the Godot 4 Tabletop RPG engine with raycasted fog of war.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/proof-of-viability/m06_boss_room_breach.jpg' | relative_url }}" alt="Boss room breach captured during an autonomous Mentor vs Zargon playthrough" loading="lazy">
          <figcaption>Turn-by-turn screenshot evidence from the autonomous Proof of Viability playthrough.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/tabletop-rpg/' | relative_url }}">Explore Tabletop RPG →</a>
      <a href="{{ '/games/tabletop-rpg/proof-of-viability.html' | relative_url }}">View Proof of Viability report →</a>
      <span class="blog-commits">Commits: 77aa08b4 · fc5b3838 · 0f14c618 · fe838029 · 8db1de00</span>
    </div>
  </article>

  <article class="blog-entry" id="robos-household-and-tax-prep">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-19">Oct 19, 2026</time>
      <span class="blog-tag">RobOS Household</span>
      <span class="blog-tag">Personal Finance</span>
      <span class="blog-tag">Tax Engine</span>
    </div>
    <h2><a href="#robos-household-and-tax-prep">RobOS Household: Full-Year Family Accounting and Open-Source Tax Preparation</a></h2>
    <p class="blog-summary">Defined the public Household and Tax KGraph schema package and built RobOS Household to take a family from twelve months of bank and card CSV statements through W-2 PDF verification and local federal tax estimation.</p>
    <div class="blog-body">
      <p>Personal finance and tax preparation software usually locks family records inside proprietary cloud silos. We defined the <code>robos:Household</code> and public tax schema package and built <strong>RobOS Household</strong> (<code>packages/household</code>) around five recurring workspaces: <em>Family</em>, <em>Accounts</em>, <em>Spending</em>, <em>Taxes</em>, and <em>Privacy</em>.</p>
      <ul>
        <li><strong>Reconciled Multi-Account Ledger:</strong> Tested against a full synthetic family financial year across checking, savings, credit card, auto loan, investment, and cash CSV statements (318 transactions), verifying closing balances, idempotent re-imports, category corrections, and split purchases.</li>
        <li><strong>Side-by-Side PDF Field Review:</strong> Uses PDF.js to extract text and page coordinates from W-2 and 1099-INT forms, highlighting source fields side-by-side and blocking tax calculation until ambiguous OCR/text fields are human-reviewed and approved.</li>
        <li><strong>Local TenForty + OpenTaxSolver Calculation:</strong> Computes federal taxable income, standard deductions, and child tax credit supplements locally via TenForty and OpenTaxSolver while enforcing strict privacy and non-filing boundaries.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/family-finances/02-accounts.png' | relative_url }}" alt="Six reconciled family accounts and net worth summary in RobOS Household" loading="lazy">
          <figcaption>Six reconciled accounts and 318 imported transactions in the Household sandbox.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/family-finances/05-field-review.png' | relative_url }}" alt="Side-by-side W-2 PDF inspection and critical field verification" loading="lazy">
          <figcaption>Side-by-side W-2 source field highlighting and human verification before tax calculation.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/family-finances/' | relative_url }}">Read the Family Finances walkthrough →</a>
      <span class="blog-commits">Commits: 336fa2f2 · 6163f44e · 96650d32 · 53b8c941</span>
    </div>
  </article>

  <article class="blog-entry" id="point-of-sale">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-19">Oct 17 – Oct 19, 2026</time>
      <span class="blog-tag">Point of Sale</span>
      <span class="blog-tag">Small Business</span>
      <span class="blog-tag">Barcode &amp; QR Vision</span>
    </div>
    <h2><a href="#point-of-sale">RobOS Point of Sale: Open-Source Register &amp; Self-Checkout for Retail, Cafés, and Bars</a></h2>
    <p class="blog-summary">Shipped a touchscreen cash register, customer self-checkout kiosk, prep queue, cash drawer manager, and hardware scan-gun + webcam barcode/QR scanner with ready-to-run Retail, Coffee Shop, and Bar workflows.</p>
    <div class="blog-body">
      <p>Small retail shops, cafés, and bars often pay steep monthly fees for basic register software. We built <strong>RobOS Point of Sale</strong> (<code>packages/point-of-sale</code>) as a free, open-source register and self-checkout suite with an open checkout-session API and three complete sample businesses:</p>
      <ul>
        <li><strong>Retail Store:</strong> SKU catalog and inventory tracking, promotional discounts, manager PIN overrides, and hardware scan-gun or webcam scanning across UPC-A, EAN-13, EAN-8, QR, DataMatrix, and Aztec codes.</li>
        <li><strong>Coffee Shop:</strong> Touchscreen counter register, customer self-checkout kiosk with drink modifiers, live barista prep queue, ready-board announcements, and opening/closing cash drawer counts.</li>
        <li><strong>Bar:</strong> Open bar tabs, automatic happy-hour pricing rules, multi-guest split payments, tip prompts, and itemized receipts.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/point-of-sale/coffee-register-latte.jpg' | relative_url }}" alt="Coffee shop touchscreen order entry in RobOS Point of Sale" loading="lazy">
          <figcaption>Worker touchscreen register for café orders, modifiers, and cash/card checkout.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/point-of-sale/bar-open-tabs.jpg' | relative_url }}" alt="Bar open tabs and split payment view in RobOS Point of Sale" loading="lazy">
          <figcaption>Bar tab management with happy-hour pricing and split payment support.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/point-of-sale/' | relative_url }}">Explore the Point of Sale guide &amp; business tutorials →</a>
      <span class="blog-commits">Commits: b08629e4 · 922778de · 369c099d · 5f99b7be · 3984bafb</span>
    </div>
  </article>

  <article class="blog-entry" id="auto-center">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-19">Oct 15 – Oct 19, 2026</time>
      <span class="blog-tag">Auto Center</span>
      <span class="blog-tag">Small Business</span>
      <span class="blog-tag">Cucumber E2E</span>
    </div>
    <h2><a href="#auto-center">RobOS Auto Center: Complete Repair Shop Operations and Vehicle Owner Records</a></h2>
    <p class="blog-summary">Built an end-to-end automotive repair shop and vehicle owner suite covering Shop Admin, Front Desk intake, Mechanic Bench timing and parts ordering, Checkout guards, and job profit reporting.</p>
    <div class="blog-body">
      <p>Backed by public vehicle Knowledge Graph schemas, <strong>RobOS Auto Center</strong> (<code>packages/auto-center</code>) serves both individual vehicle owners (repair history backups, invoice OCR, bulk safety recall checks) and independent repair shops across four dedicated workspaces:</p>
      <ul>
        <li><strong>Shop Admin &amp; Catalog Import:</strong> Configure shop details, default hourly labor rates, team roles, supplier parts price lists, and validated bulk customer/vehicle CSV imports.</li>
        <li><strong>Front Desk Intake &amp; Estimates:</strong> Look up returning customers by phone, walk through structured multi-choice service intake questions, type-ahead vehicle makes/models/years/OBD-II trouble codes, and record customer estimate approvals.</li>
        <li><strong>Mechanic Bench &amp; Checkout Guards:</strong> Mechanics claim tickets, time labor with a built-in stopwatch, log diagnostic findings, and order/receive parts (blocking job completion while parts remain on order). Checkout enforces customer re-approval if charges exceed the estimate and prevents releasing keys with an unpaid balance.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/auto-center/shots/02-front-desk-intake--prepare-the-estimate-and-record-approval-from-the-front-desk-5.jpg' | relative_url }}" alt="Front desk estimate preparation and customer approval in RobOS Auto Center" loading="lazy">
          <figcaption>Front Desk intake preparing an itemized repair estimate and recording customer approval.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/auto-center/shots/03-mechanic-bench--time-the-job-with-a-stopwatch-5.jpg' | relative_url }}" alt="Mechanic bench job timing and parts status in RobOS Auto Center" loading="lazy">
          <figcaption>Mechanic Bench tracking labor time, diagnostic notes, and received parts.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/auto-center/' | relative_url }}">Read the 9-part Auto Center shop &amp; owner guide →</a>
      <span class="blog-commits">Commits: 71fd657c · d77642e2 · fbceb6db · d0a6e4d2 · 465a9fd4</span>
    </div>
  </article>

  <article class="blog-entry" id="starfall-command-rts">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-15">Oct 15, 2026</time>
      <span class="blog-tag">Starfall Command</span>
      <span class="blog-tag">RTS Engine</span>
      <span class="blog-tag">Games</span>
    </div>
    <h2><a href="#starfall-command-rts">Starfall Command: Deterministic 2.5D Real-Time Strategy Engine</a></h2>
    <p class="blog-summary">Created a SnowPlay and StarCraft II-inspired deterministic RTS engine featuring three asymmetric factions, a 2.5D angled perspective renderer, and an automated 1080p 4-act battle recorder.</p>
    <div class="blog-body">
      <p>To test how far KGraph-driven game architecture stretches into high-unit-count real-time simulation, we built <strong>Starfall Command</strong> (<code>games/robos-rts</code>), a deterministic real-time strategy game with a custom 2.5D angled 3D perspective renderer:</p>
      <ul>
        <li><strong>Three Asymmetric Factions:</strong> Command the <em>Meridian Guard</em> (human terran-style infantry, siege howitzer splash lines, and retractable silo gates), the <em>Gnarl Brood</em> (swarming bio-monsters), or the <em>Aurelian Concord</em> (high-tech phase-stepping walkers and cliff-striding Spire Walkers).</li>
        <li><strong>Classic RTS Economy &amp; Controls:</strong> Full crystal and aether tap harvesting, build-grid placement validation, production queues, control groups, idle-worker alerts, supply caps, and kiting micro-management.</li>
        <li><strong>Programmatic Capture &amp; 4-Act Demo:</strong> Exposed HTTP/IPC camera, selection, and screenshot control endpoints to drive a deterministic 4-act 1080p battle showcase.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/games/rts/24-howitzer-splash-volley.jpg' | relative_url }}" alt="Meridian Guard howitzer line firing a splash volley in Starfall Command" loading="lazy">
          <figcaption>Emplaced Meridian Guard howitzers firing splash volleys across Starfall Canyon.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/games/rts/33-three-way-battle.jpg' | relative_url }}" alt="Three-way battle between Meridian Guard, Gnarl Brood, and Aurelian Concord" loading="lazy">
          <figcaption>Three-faction clash between the Meridian Guard, Gnarl Brood, and Aurelian Concord.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/robos-rts/' | relative_url }}">Visit the Starfall Command page →</a>
      <a href="{{ '/games/robos-rts/docs/' | relative_url }}">Read the RTS engine docs →</a>
      <span class="blog-commits">Commits: f061446b · ac778e9c · ec1ec177 · 2c5f2eef · be7b70a5</span>
    </div>
  </article>

  <article class="blog-entry" id="skill-commons-and-site-v2">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-16">Oct 12 – Oct 19, 2026</time>
      <span class="blog-tag">Whitepaper</span>
      <span class="blog-tag">The Skill Commons</span>
      <span class="blog-tag">rowbose.com</span>
    </div>
    <h2><a href="#skill-commons-and-site-v2">The Skill Commons Whitepaper, rowbose.com v2, and Context-Engineering Internships</a></h2>
    <p class="blog-summary">Published "The Skill Commons" whitepaper on reducing AI data center strain via reusable WebAssembly base tasks, redesigned rowbose.com around an interactive 31-slide SDLC hero player, and launched the open-source contributor internship track.</p>
    <div class="blog-body">
      <p>We rewrote our long-term architectural thesis into <strong>The Skill Commons</strong> whitepaper and plain-English summary at <a href="{{ '/future/' | relative_url }}">rowbose.com/future</a>: instead of asking frontier data centers to regenerate solved routines from scratch for every app, software tasks are decomposed into content-addressed, verified WebAssembly (WASI 0.2 / WIT) leaf skills and snapped together locally by a small model on your own machine.</p>
      <ul>
        <li><strong>rowbose.com v2 &amp; 31-Slide Live Hero:</strong> Promoted the new flat, light-by-default front site to <code>rowbose.com</code> (archiving classic docs under <code>/v1/</code>), featuring a 31-slide interactive player and full video recording that traces a real task from planning to merged PR.</li>
        <li><strong>Small-Business Playbook &amp; Contributor Internships:</strong> Added the "Make Money with RobOS" small-business section on the homepage, replaced placeholder app letters with native RobOS SVGs across <code>/apps/</code>, and framed open-source contributions at <a href="{{ '/contribute/' | relative_url }}">/contribute/</a> as a public context-engineering internship.</li>
      </ul>
      <figure class="blog-fig">
        <img src="{{ '/assets/future/ai/commons-map.jpg' | relative_url }}" alt="The Skill Commons schematic showing decomposition into reusable base tasks and local assembly" loading="lazy">
        <figcaption>The Skill Commons: decompose jobs into verified base tasks once, and assemble them locally.</figcaption>
      </figure>
    </div>
    <div class="blog-links">
      <a href="{{ '/future/' | relative_url }}">Read The Skill Commons summary →</a>
      <a href="{{ '/future/whitepaper/' | relative_url }}">Read the full whitepaper →</a>
      <a href="{{ '/contribute/' | relative_url }}">Explore the Contribute page →</a>
      <span class="blog-commits">Commits: 749b1053 · b992571d · a338228e · 714f8991 · d59af754</span>
    </div>
  </article>

  <article class="blog-entry" id="pr-review-theater-and-dev-central">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-12">Sep 30 – Oct 12, 2026</time>
      <span class="blog-tag">PR Review Theater</span>
      <span class="blog-tag">Dev Central v2</span>
      <span class="blog-tag">CI &amp; Governance</span>
    </div>
    <h2><a href="#pr-review-theater-and-dev-central">Local-First PR Review Theater, Live Demo Steering, and Autonomous CI Recovery</a></h2>
    <p class="blog-summary">Turned code review into a two-stage local and peer workflow with syntax-aware diffs, steerable agent walkthrough checkpoints, evidence-backed PR descriptions, and live Buildkite/GitHub CI failure recovery.</p>
    <div class="blog-body">
      <p>Agents shouldn't open noisy pull requests before a developer has inspected the work. We restructured the delivery workflow across <strong>Task Implementer</strong>, <strong>Dev Central v2</strong>, and <strong>PR Review Theater</strong> (<code>packages/pr-review</code>) so agents push a feature branch first and hand off to a local review stage:</p>
      <ul>
        <li><strong>Changes, Evidence &amp; Steerable Walkthroughs:</strong> Developers inspect syntax-highlighted diffs, before/after screenshot evidence, and editable multi-checkpoint walkthroughs—and can send live steering messages in the side-pane chat to refine code, evidence, or demo steps in place.</li>
        <li><strong>Factual PR Descriptions &amp; Team Handoff:</strong> When ready, developers create a draft PR with Markdown descriptions grounded in real walkthrough screenshots, monitor live GitHub Actions and Buildkite logs, trigger guided local CI repair on failed checks, and undraft with prefilled reviewers and Slack mentions.</li>
        <li><strong>Desktop Polish:</strong> Shipped the <strong>RobOS GNOME Desktop App Installer</strong> (<code>packages/gnome-desktop-installer</code>) with background worker-thread shortcut repair, plus a built-in skill browser in <code>&lt;robos-ai-textarea&gt;</code>.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/assets/shots/review-evidence.jpg' | relative_url }}" alt="Before and after visual evidence inside PR Review Theater" loading="lazy">
          <figcaption>PR Review Theater comparing before-and-after visual evidence alongside the agent chat pane.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/assets/hero/slides/24-ready-dialog.jpg' | relative_url }}" alt="Promoting a passing draft PR to Ready for Review with team notifications" loading="lazy">
          <figcaption>Promoting a verified draft PR after CI passes, with reviewer selection and team notification.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/pr-review-theater.html' | relative_url }}">Read the PR Review Theater documentation →</a>
      <span class="blog-commits">Commits: 334dce83 · 2132b1b9 · cea112ea · 1e338aca · aedb5135</span>
    </div>
  </article>

  <article class="blog-entry" id="realm-of-heroes-crpg">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-10-02">Sep 22 – Oct 2, 2026</time>
      <span class="blog-tag">Realm of Heroes cRPG</span>
      <span class="blog-tag">Godot 4</span>
      <span class="blog-tag">cRPG Editor</span>
    </div>
    <h2><a href="#realm-of-heroes-crpg">Realm of Heroes cRPG Engine and the Unified RobOS cRPG Editor</a></h2>
    <p class="blog-summary">Built an Infinity Engine-inspired tactical cRPG in Godot 4 with 3D miniature combat, socketed equipment, a 22-spell VFX suite, and a unified Electron authoring studio with topological quest trees.</p>
    <div class="blog-body">
      <p>We built <strong>Realm of Heroes cRPG</strong> (<code>games/crpg-realm</code>) and consolidated all campaign authoring tools into the unified <strong>RobOS cRPG Editor</strong> (<code>packages/crpg-editor</code>):</p>
      <ul>
        <li><strong>Unified cRPG Editor &amp; Topological Quest DAGs:</strong> Features Campaign Studio, a topological Quest Scenario Tree DAG editor with choice-anchored curves and transition triggers, a Story Flow page turner, Spells/Abilities/Item Studios, a first-class Enemies Bestiary, graphical drag-and-drop inventory bags with encumbrance meters, and exported Player Cartridges.</li>
        <li><strong>3D Miniatures, Equipment Sockets &amp; 22-Spell BDD Suite:</strong> Upgraded characters and monsters to 3D models with dynamic weapon, armor, and shield socket attachment and real-time AC recalculation. Added 3D particle VFX and BDD verification for 22 spells including 8d6 Fireball, Magic Missile, Blizzard (with ground ice and prone slipping), Stinking Cloud, and Invisibility.</li>
        <li><strong>Elevation, Pathfinding &amp; Playable Campaigns:</strong> Implemented AStarGrid2D pathfinding with string-pulling funnel smoothing, multi-tier house porch and stairs elevation transitions, Infinity Engine social aggro and trap detection, and playable <em>Dragon Warrior 1</em> and <em>Rescue the Princess</em> campaigns.</li>
      </ul>
      <figure class="blog-fig">
        <img src="{{ '/assets/games/crpg-bg-poster.jpg' | relative_url }}" alt="Realm of Heroes cRPG tactical party combat in Godot 4" loading="lazy">
        <figcaption>Realm of Heroes cRPG in Godot 4 with tactical party formations, 3D miniatures, and spell VFX.</figcaption>
      </figure>
    </div>
    <div class="blog-links">
      <a href="{{ '/games/crpg/' | relative_url }}">Visit the Realm of Heroes cRPG page →</a>
      <a href="{{ '/games/crpg/docs/' | relative_url }}">Read the cRPG Creator Guide →</a>
      <span class="blog-commits">Commits: fe1aeac1 · 9c1f4e3a · 5c683003 · 4c0e52ea · 8d6b7a58</span>
    </div>
  </article>

  <article class="blog-entry" id="robos-voice-and-parse-portal">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-09-30">Sep 22 – Sep 30, 2026</time>
      <span class="blog-tag">RobOS Voice</span>
      <span class="blog-tag">KGraph Parse Portal</span>
      <span class="blog-tag">E-Learning</span>
    </div>
    <h2><a href="#robos-voice-and-parse-portal">RobOS Voice Assistant, KGraph Parse Portal with Luxir Search, and Role-Based Training</a></h2>
    <p class="blog-summary">Delivered a bi-directional neural voice assistant wired to all RobOS skills, a high-throughput KGraph Parse Portal fronting the Luxir C++ search engine and Tika 4.0, and interactive training tracks.</p>
    <div class="blog-body">
      <p>To make the desktop environment and Knowledge Graph accessible by voice and capable of indexing massive enterprise document stores, we shipped three major subsystems in late September:</p>
      <ul>
        <li><strong>RobOS Voice (<code>packages/voice-prompt</code>):</strong> Bi-directional voice assistant combining natural Kokoro-82M / Edge-TTS neural speech with offline Whisper STT, Rhasspy/whisper_streaming adaptive energy VAD, suffix-prefix utterance stitching, PipeWire live waveform preview, and real-time voice execution of RobOS skills.</li>
        <li><strong>KGraph Parse Portal &amp; Luxir C++ Search (<code>packages/kgraph-parse-portal</code>):</strong> Built the ingestion gateway fronting Apache Tika 4.0 gRPC connectors, contextual MIME disambiguation, and the built-in Luxir C++ search index (alongside Solr, Elasticsearch, and OpenSearch schemas).</li>
        <li><strong>The Gig Bandit (<code>getemgigs.com</code>) &amp; E-Learning Tracks:</strong> Shipped the production Next.js live-music discovery app and <code>nextjs-vercel-web</code> App Wizard template, plus interactive <strong>RobOS eLearning</strong> courses and role-based training tracks for Non-Developers, Systems Architects, Agent Harness Engineers, and Senior Reviewers.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/v1/assets/images/kgraph-parse-portal-architecture.jpg' | relative_url }}" alt="KGraph Parse Portal and Luxir search index architecture" loading="lazy">
          <figcaption>KGraph Parse Portal ingestion pipeline with Apache Tika 4.0 and Luxir search indexing.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/v1/assets/images/elearning-creation-ux-architecture.jpg' | relative_url }}" alt="RobOS eLearning curriculum and certificate architecture" loading="lazy">
          <figcaption>Interactive eLearning player, quiz engine, and Knowledge Graph certificate issuance.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/voice-prompt.html' | relative_url }}">RobOS Voice docs →</a>
      <a href="{{ '/v1/kgraph-parse-portal.html' | relative_url }}">KGraph Parse Portal docs →</a>
      <a href="{{ '/v1/training.html' | relative_url }}">Role-Based Training tracks →</a>
      <span class="blog-commits">Commits: a2402d57 · c5848ef8 · 1ab57468 · 42fe48e5 · f4e37446</span>
    </div>
  </article>

  <article class="blog-entry" id="dual-state-kgraph-and-sdlc">
    <div class="blog-meta">
      <time class="blog-date" datetime="2026-09-18">Aug 25 – Sep 18, 2026</time>
      <span class="blog-tag">Knowledge Graph</span>
      <span class="blog-tag">SDLC Platform</span>
      <span class="blog-tag">v0.0.7 Release</span>
    </div>
    <h2><a href="#dual-state-kgraph-and-sdlc">Modular Dual-State Knowledge Graph, 16-Step SDLC Tool Suite, and RobOS v0.0.7</a></h2>
    <p class="blog-summary">Laid the foundation of RobOS: a multi-package JSON-LD Knowledge Graph validated by W3C SHACL shapes, a complete desktop SDLC suite from C4 topology modeling to Kind Kubernetes auto-deploy, and the v0.0.7 release.</p>
    <div class="blog-body">
      <p>The first month of this two-month sprint established the core thesis of RobOS—that the <strong>Knowledge Graph is the product</strong>—and delivered the <strong>v0.0.7</strong> release across the desktop appliance VM and native app suite:</p>
      <ul>
        <li><strong>Modular Dual-State Knowledge Graph (<code>.robos/kgraphs/</code>):</strong> Replaced monolithic config files with namespaced JSON-LD packages validated by W3C SHACL shapes and aligned with Schema.org, backed by <strong>Knowledge Graph Explorer</strong> (with an embedded Swagger-UI OpenAPI console and reviewed workspace imports), <strong>Schema Studio</strong>, and the <code>kgraph-*</code> skills CLI for semantic blast-radius diffing between <code>main</code> and feature branches.</li>
        <li><strong>16-Step Verified SDLC &amp; Cloud-Init Onboarding:</strong> Automated first-boot QEMU/KVM provisioning with <code>robos-splash</code> and unified GitHub onboarding; verified the 16-step Acme Petshop lifecycle across <strong>Task Planner</strong>, <strong>System Topology Studio</strong> (C4 + OpenAPI 3.1 synthesis), <strong>Git Projects</strong>, <strong>Bruno REST API Client</strong>, and <strong>Kube Studio</strong> (with real local Kind Kubernetes clusters and zero-click KGraph auto-deployment).</li>
        <li><strong>IDE Debugging Bridges, UHP Agent Routing &amp; Prompt Security:</strong> Shipped the <strong>IntelliJ IDEA</strong> (port 63343 IPC) and <strong>VS Code</strong> breakpoint reproduction and PR review bridges, <strong>Agents Manager</strong> &amp; <strong>Agent Chat</strong> with UHP <code>HarnessRouter</code>, MCP OAuth, Caveman prompt compression, DSPy optimization, <strong>Remote Execution Studio</strong> (Bazel/Buck2/REAPI), and the zero-dependency <strong>Prompt Security Guard</strong>.</li>
      </ul>
      <div class="blog-fig-grid">
        <figure class="blog-fig">
          <img src="{{ '/v1/assets/images/dual-state-blast-radius.jpg' | relative_url }}" alt="Dual-State Knowledge Graph semantic blast radius diffing" loading="lazy">
          <figcaption>Dual-State Knowledge Graph comparing production main against a feature branch before merge.</figcaption>
        </figure>
        <figure class="blog-fig">
          <img src="{{ '/v1/assets/images/agent-tier-dispatch-algorithm.jpg' | relative_url }}" alt="Context-efficient agent tier routing and UHP harness dispatch" loading="lazy">
          <figcaption>Context-efficient routing across frontier and cheap/local models via the Unified Harness Protocol.</figcaption>
        </figure>
      </div>
    </div>
    <div class="blog-links">
      <a href="{{ '/v1/knowledge-graph.html' | relative_url }}">Knowledge Graph architecture →</a>
      <a href="{{ '/v1/walkthroughs.html' | relative_url }}">16-Step SDLC walkthroughs →</a>
      <a href="{{ '/download/' | relative_url }}">Download RobOS v0.0.7 →</a>
      <span class="blog-commits">Commits: 73cb6441 · 194e2c8a · a90ae3f7 · 6f0e1605 · 1143d01c</span>
    </div>
  </article>

</div>
