#!/usr/bin/env python3
import json
import os

REPORT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(REPORT_DIR, "data.json")
OUTPUT_HTML = os.path.join(REPORT_DIR, "index.html")
SITE_HTML = os.path.abspath(
    os.path.join(REPORT_DIR, "../../../../site/games/tabletop-rpg/proof-of-viability-election-2026.html")
)

with open(DATA_FILE) as f:
    data = json.load(f)

transactions = data["transactions"]
milestones = data["milestones"]


def render_report(asset_prefix: str, use_site_icons: bool) -> str:
    cam_icon = (
        '<img class="ic-img" src="/assets/icons/camera.svg" alt="" width="48" height="48" loading="lazy">'
        if use_site_icons
        else "📸"
    )
    gear_icon = (
        '<img class="ic-img" src="/assets/icons/gear.svg" alt="" width="48" height="48" loading="lazy">'
        if use_site_icons
        else "⚙️"
    )
    scroll_icon = (
        '<img class="ic-img" src="/assets/icons/scroll.svg" alt="" width="48" height="48" loading="lazy">'
        if use_site_icons
        else "📜"
    )
    flask_icon = (
        '<img class="ic-img" src="/assets/icons/flask.svg" alt="" width="48" height="48" loading="lazy">'
        if use_site_icons
        else "🧪"
    )
    sword_icon = (
        '<img class="ic-img" src="/assets/icons/dice.svg" alt="" width="48" height="48" loading="lazy">'
        if use_site_icons
        else "⚔️"
    )
    wizard_icon = (
        '<img class="ic-img" src="/assets/icons/wizard.svg" alt="" width="48" height="48" loading="lazy">'
        if use_site_icons
        else "🪄"
    )
    shield_icon = (
        '<img class="ic-img" src="/assets/icons/shield.svg" alt="" width="48" height="48" loading="lazy">'
        if use_site_icons
        else "🛡️"
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RobOS Tabletop RPG — Election 2026: Battle for the Hill Proof of Viability Report</title>
  <style>
    :root {{
      --bg-dark: #070a10;
      --bg-card: #0d131f;
      --bg-card-hover: #141d2e;
      --border-color: #1f2a3d;
      --accent-cyan: #00bcd4;
      --accent-cyan-glow: rgba(0, 188, 212, 0.25);
      --accent-amber: #ffb74d;
      --accent-green: #00e676;
      --accent-purple: #b388ff;
      --accent-red: #ff5252;
      --text-main: #e2e8f0;
      --text-muted: #94a3b8;
      --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
      --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.6;
      padding-bottom: 80px;
    }}

    header {{
      background: linear-gradient(180deg, #0f172a 0%, var(--bg-dark) 100%);
      border-bottom: 1px solid var(--border-color);
      padding: 40px 24px 30px;
      position: relative;
      overflow: hidden;
    }}

    header::before {{
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #00bcd4, #00e676, #ffb74d, #b388ff);
    }}

    .container {{
      max-width: 1380px;
      margin: 0 auto;
      padding: 0 20px;
    }}

    .header-badge-row {{
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }}

    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-family: var(--font-mono);
    }}

    .badge-success {{
      background: rgba(0, 230, 118, 0.15);
      color: var(--accent-green);
      border: 1px solid rgba(0, 230, 118, 0.4);
    }}

    .badge-cyan {{
      background: rgba(0, 188, 212, 0.15);
      color: var(--accent-cyan);
      border: 1px solid rgba(0, 188, 212, 0.4);
    }}

    .badge-amber {{
      background: rgba(255, 183, 77, 0.15);
      color: var(--accent-amber);
      border: 1px solid rgba(255, 183, 77, 0.4);
    }}

    .badge-purple {{
      background: rgba(179, 136, 255, 0.15);
      color: var(--accent-purple);
      border: 1px solid rgba(179, 136, 255, 0.4);
    }}

    h1 {{
      font-size: 2.2rem;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }}

    .header-subtitle {{
      font-size: 1.05rem;
      color: var(--text-muted);
      max-width: 960px;
      margin-bottom: 24px;
    }}

    /* Metrics Grid */
    .metrics-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-top: 24px;
    }}

    .metric-card {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 16px 20px;
      position: relative;
      transition: transform 0.2s, border-color 0.2s;
    }}

    .metric-card:hover {{
      transform: translateY(-2px);
      border-color: var(--accent-cyan);
    }}

    .metric-label {{
      font-size: 0.75rem;
      font-family: var(--font-mono);
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 6px;
      letter-spacing: 0.05em;
    }}

    .metric-value {{
      font-size: 1.6rem;
      font-weight: 800;
      color: #fff;
      font-family: var(--font-mono);
      display: flex;
      align-items: baseline;
      gap: 6px;
    }}

    .metric-sub {{
      font-size: 0.8rem;
      color: var(--accent-green);
      font-weight: 600;
    }}

    /* Section Styles */
    section {{
      margin-top: 40px;
    }}

    .section-header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 12px;
      margin-bottom: 20px;
    }}

    .section-title {{
      font-size: 1.35rem;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .section-title span.icon {{
      color: var(--accent-cyan);
      display: inline-flex;
      align-items: center;
    }}

    .ic-img {{
      width: 28px;
      height: 28px;
      object-fit: contain;
    }}

    /* Visual Evidence Showcase */
    .viewer-card {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }}

    .viewer-display {{
      position: relative;
      background: #000;
      min-height: 480px;
      display: flex;
      align-items: center;
      justify-content: center;
    }}

    .viewer-display img {{
      width: 100%;
      height: auto;
      max-height: 640px;
      object-fit: contain;
      display: block;
      cursor: zoom-in;
    }}

    .viewer-overlay-top {{
      position: absolute;
      top: 16px;
      left: 16px;
      right: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      pointer-events: none;
    }}

    .viewer-step-badge {{
      background: rgba(13, 19, 31, 0.88);
      border: 1px solid var(--accent-cyan);
      backdrop-filter: blur(8px);
      padding: 6px 14px;
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--accent-cyan);
    }}

    .viewer-details {{
      padding: 24px;
      background: var(--bg-card);
      border-top: 1px solid var(--border-color);
    }}

    .viewer-title {{
      font-size: 1.25rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 6px;
    }}

    .viewer-desc {{
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-bottom: 16px;
    }}

    /* Thumbnail Rail */
    .thumbnail-rail {{
      display: flex;
      gap: 12px;
      overflow-x: auto;
      padding: 16px 20px;
      background: #0a0f1a;
      border-top: 1px solid var(--border-color);
      scrollbar-width: thin;
      scrollbar-color: var(--accent-cyan) #0a0f1a;
    }}

    .thumb-item {{
      flex: 0 0 140px;
      cursor: pointer;
      border-radius: 6px;
      overflow: hidden;
      border: 2px solid transparent;
      transition: all 0.2s;
      background: #000;
      position: relative;
    }}

    .thumb-item img {{
      width: 100%;
      height: 78px;
      object-fit: cover;
      display: block;
    }}

    .thumb-item.active {{
      border-color: var(--accent-cyan);
      box-shadow: 0 0 12px var(--accent-cyan-glow);
    }}

    .thumb-item .thumb-label {{
      font-size: 0.68rem;
      font-family: var(--font-mono);
      padding: 4px 6px;
      background: rgba(13, 19, 31, 0.9);
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}

    /* Carousel Nav Buttons */
    .nav-buttons {{
      display: flex;
      gap: 10px;
    }}

    .btn {{
      background: var(--bg-card-hover);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 8px 16px;
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
      text-decoration: none;
    }}

    .btn:hover {{
      background: var(--accent-cyan);
      color: #000;
      border-color: var(--accent-cyan);
    }}

    .btn-active {{
      background: var(--accent-cyan);
      color: #000;
      border-color: var(--accent-cyan);
    }}

    /* Pillars Grid */
    .pillars-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }}

    .pillar-card {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 24px;
      position: relative;
    }}

    .pillar-icon {{
      font-size: 1.8rem;
      margin-bottom: 12px;
      display: inline-block;
    }}

    .pillar-title {{
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }}

    .pillar-desc {{
      font-size: 0.9rem;
      color: var(--text-muted);
      line-height: 1.5;
    }}

    .pillar-code {{
      margin-top: 12px;
      background: #080c14;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: var(--accent-cyan);
      overflow-x: auto;
    }}

    /* Filter & Table */
    .ledger-controls {{
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
    }}

    .search-input {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: #fff;
      padding: 8px 14px;
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      width: 300px;
    }}

    .search-input:focus {{
      outline: none;
      border-color: var(--accent-cyan);
      box-shadow: 0 0 8px var(--accent-cyan-glow);
    }}

    .filter-pills {{
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }}

    .filter-pill {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 5px 12px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-family: var(--font-mono);
      cursor: pointer;
      transition: all 0.2s;
    }}

    .filter-pill:hover, .filter-pill.active {{
      color: #fff;
      border-color: var(--accent-cyan);
      background: rgba(0, 188, 212, 0.15);
    }}

    .table-container {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      overflow-x: auto;
      max-height: 560px;
      position: relative;
    }}

    table {{
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;
    }}

    thead th {{
      background: #090e18;
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 10;
    }}

    tbody tr {{
      border-bottom: 1px solid #141c2c;
      transition: background 0.15s;
    }}

    tbody tr:hover {{
      background: rgba(0, 188, 212, 0.04);
    }}

    tbody td {{
      padding: 10px 16px;
      vertical-align: middle;
    }}

    .td-id {{
      font-family: var(--font-mono);
      color: var(--text-muted);
      width: 60px;
    }}

    .td-step {{
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      width: 80px;
    }}

    .td-actor {{
      font-weight: 600;
      color: #fff;
      width: 150px;
    }}

    .td-desc {{
      color: var(--text-main);
    }}

    /* Modal Lightbox */
    .lightbox {{
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.92);
      z-index: 9999;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }}

    .lightbox.active {{
      display: flex;
    }}

    .lightbox img {{
      max-width: 95vw;
      max-height: 95vh;
      border-radius: 8px;
      box-shadow: 0 0 40px rgba(0, 188, 212, 0.3);
    }}

    .lightbox-close {{
      position: absolute;
      top: 20px;
      right: 25px;
      color: #fff;
      font-size: 2rem;
      cursor: pointer;
      font-family: var(--font-mono);
    }}
  </style>
</head>
<body>

  <header>
    <div class="container">
      <div class="header-badge-row">
        <span class="badge badge-success">● PROOF OF VIABILITY: VERIFIED</span>
        <span class="badge badge-cyan">RobOS Autonomous SDLC Engine</span>
        <span class="badge badge-amber">Midterms 2026 Campaign</span>
        <span class="badge badge-purple">Cartridge: election-2026-quest-1</span>
      </div>
      <h1>Election 2026: Battle for the Hill — Proof of Viability</h1>
      <p class="header-subtitle">
        Turn-by-turn autonomous verification report proving that the bipartisan party (Barack Obama, Donald Trump, Hillary Clinton, Bernie Sanders) can clear the Capitol catacombs, survive multi-headed Hydra boss ambushes, trigger the Oval Office cutscene, and slay all three two-headed Hydras (Talarixon, Brownsted, and El-Rogers) with 100% survival.
      </p>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Execution Status</div>
          <div class="metric-value" style="color: var(--accent-green);">PASSED <span class="metric-sub">3/3 Hydras</span></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Turns Executed</div>
          <div class="metric-value">266 <span class="metric-sub">Steps</span></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Combat Rounds</div>
          <div class="metric-value">15 <span class="metric-sub">Rounds</span></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Transaction Ledger</div>
          <div class="metric-value">283 <span class="metric-sub">Discrete TX</span></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Party Survival</div>
          <div class="metric-value" style="color: var(--accent-green);">100% <span class="metric-sub">4/4 Alive</span></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Hydras Vanquished</div>
          <div class="metric-value" style="color: var(--accent-purple);">3/3 <span class="metric-sub">TX, OH, MI</span></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Potions Consumed</div>
          <div class="metric-value" style="color: var(--accent-amber);">6 <span class="metric-sub">+21 BP Total</span></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Completion Trigger</div>
          <div class="metric-value" style="color: var(--accent-cyan);">BOSS <span class="metric-sub">All Hydras Slain</span></div>
        </div>
      </div>
    </div>
  </header>

  <main class="container">

    <!-- Section 1: Visual Turn-by-Turn Evidence -->
    <section>
      <div class="section-header">
        <h2 class="section-title"><span class="icon">{cam_icon}</span> Milestone Visual Proof & Playthrough Evidence</h2>
        <div class="nav-buttons">
          <button class="btn" id="prevBtn" onclick="prevSlide()">◀ Prev</button>
          <button class="btn" id="playBtn" onclick="togglePlay()">▶ Auto-Play</button>
          <button class="btn" id="nextBtn" onclick="nextSlide()">Next ▶</button>
        </div>
      </div>

      <div class="viewer-card">
        <div class="viewer-display">
          <img id="mainViewerImg" src="{asset_prefix}/m01_quest_start.jpg" alt="Milestone Visual" onclick="openLightbox()">
          <div class="viewer-overlay-top">
            <div class="viewer-step-badge" id="viewerBadge">Step 001 · Round 1</div>
            <span class="badge badge-cyan" id="viewerTag">START</span>
          </div>
        </div>

        <div class="viewer-details">
          <h3 class="viewer-title" id="viewerTitle">Quest Begins at Capitol West Wing Stairs [0, 13]</h3>
          <p class="viewer-desc" id="viewerDesc">
            The 4 bipartisan heroes (Barack Obama, Donald Trump, Hillary Clinton, Bernie Sanders) assemble at [0, 13] with starting weapons, shields, spells, and Healing Potions.
          </p>
        </div>

        <div class="thumbnail-rail" id="thumbRail">
          <!-- Populated by JS -->
        </div>
      </div>

      <div class="viewer-card" style="margin-top: 24px;">
        <div class="viewer-details" style="border-top: none; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 class="viewer-title" style="margin-bottom: 2px;">🎬 Full 266-Turn Autonomous Playthrough Video (WebM)</h3>
            <p class="viewer-desc" style="margin-bottom: 0;">Complete turn-by-turn timelapse of the Mentor AI clearing the Capitol catacombs and defeating all 3 two-headed Hydras (Talarixon, Brownsted, and El-Rogers).</p>
          </div>
          <a class="btn" href="{asset_prefix}/election-2026-playthrough.webm" download>⬇ Download WebM</a>
        </div>
        <div class="viewer-display" style="min-height: 360px; padding: 0;">
          <video controls preload="metadata" poster="{asset_prefix}/m19_el_rogers_slain_victory.jpg" style="width: 100%; max-height: 640px; display: block; background: #000;">
            <source src="{asset_prefix}/election-2026-playthrough.webm" type="video/webm">
            Your browser does not support HTML5 WebM video.
          </video>
        </div>
      </div>
    </section>

    <!-- Section 2: Key Architectural Innovations -->
    <section>
      <div class="section-header">
        <h2 class="section-title"><span class="icon">{gear_icon}</span> Proof of Viability: Core Architectural Capabilities</h2>
      </div>

      <div class="pillars-grid">
        <div class="pillar-card">
          <div class="pillar-icon">{sword_icon}</div>
          <h3 class="pillar-title">1. Multi-Tile (2-Square) Hydra Boss Targeting</h3>
          <p class="pillar-desc">
            The three bipartisan Capitol Hydras (<code>Talarixon</code>, <code>Brownsted</code>, and <code>El-Rogers</code>) occupy 2×1 tiles with 5 BP and 4–5 Attack/Defend Dice. The Mentor AI computes multi-tile adjacency so Obama, Trump, and Hillary surround and focus-fire each Hydra.
          </p>
          <div class="pillar-code">Talarixon (TX #167) · Brownsted (TX #211) · El-Rogers (TX #282)</div>
        </div>

        <div class="pillar-card">
          <div class="pillar-icon">{wizard_icon}</div>
          <h3 class="pillar-title">2. Rear-Line Arcane Support & Genie Burst</h3>
          <p class="pillar-desc">
            Bernie Sanders (Elemental Wizard, 6 MP) avoids suicidal 1-die melee against 4-die Hydras, holding rear line-of-sight to hurl <code>Ball of Flame</code>, <code>Fire of Wrath</code>, and the 5-dice <code>Genie</code> spell while buffing allies with <code>Courage</code> and <code>Rock Skin</code>.
          </p>
          <div class="pillar-code">TX #32 (Sleep) · TX #96 (Ball of Flame) · TX #118 (Fire of Wrath) · TX #138 (Genie)</div>
        </div>

        <div class="pillar-card">
          <div class="pillar-icon">{flask_icon}</div>
          <h3 class="pillar-title">3. Emergency Potion Triage Under Boss Focus Fire</h3>
          <p class="pillar-desc">
            Facing 4-skull Hydra strikes and Super PAC Demons, the Mentor AI triggers automatic Healing Potion triage whenever any hero drops to <code>BP &lt;= 5</code>, restoring 21 total Body Points across 6 potions with zero casualties.
          </p>
          <div class="pillar-code">TX #107, #112, #175, #205, #263, #277 (+21 BP Restored Across Party)</div>
        </div>

        <div class="pillar-card">
          <div class="pillar-icon">{shield_icon}</div>
          <h3 class="pillar-title">4. Hidden Stairway & Objective-Driven Victory</h3>
          <p class="pillar-desc">
            Unlike standard exit-stair extraction maps, <code>election-2026-quest-1</code> hides the exit stairway and completes immediately via quest trigger when all three Capitol Hydras are vanquished, automatically tested alongside cinematic cutscene triggers.
          </p>
          <div class="pillar-code">STORY_TRIGGER (TX #51) ➔ 3/3 Hydras Slain ➔ QUEST_COMPLETE (TX #283)</div>
        </div>
      </div>
    </section>

    <!-- Section 3: Filterable Transaction Ledger -->
    <section>
      <div class="section-header">
        <h2 class="section-title"><span class="icon">{scroll_icon}</span> Discrete 283-Transaction Immutable Audit Ledger</h2>
        <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--accent-cyan);" id="txCounter">
          Showing 283 / 283 Transactions
        </div>
      </div>

      <div class="ledger-controls">
        <input type="text" id="txSearch" class="search-input" placeholder="Search transactions (e.g. Talarixon, Brownsted, El-Rogers, Potion)..." oninput="filterTransactions()">
        
        <div class="filter-pills">
          <button class="filter-pill active" onclick="setTypeFilter('ALL')">All (283)</button>
          <button class="filter-pill" onclick="setTypeFilter('COMBAT')">Combat (51)</button>
          <button class="filter-pill" onclick="setTypeFilter('SPELL_CAST')">Spells (4)</button>
          <button class="filter-pill" onclick="setTypeFilter('USE_ITEM')">Potions (6)</button>
          <button class="filter-pill" onclick="setTypeFilter('DOOR_OPEN')">Doors (8)</button>
          <button class="filter-pill" onclick="setTypeFilter('MOVE')">Movement (126)</button>
          <button class="filter-pill" onclick="setTypeFilter('MILESTONES')">Key Events</button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th style="width: 70px;">TX #</th>
              <th style="width: 70px;">Step</th>
              <th style="width: 70px;">Round</th>
              <th style="width: 150px;">Actor</th>
              <th style="width: 150px;">Action Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody id="txTableBody">
            <!-- Populated by JS -->
          </tbody>
        </table>
      </div>
    </section>

  </main>

  <!-- Lightbox Modal -->
  <div class="lightbox" id="lightbox" onclick="closeLightbox()">
    <span class="lightbox-close">&times;</span>
    <img id="lightboxImg" src="" alt="Fullscreen Screenshot">
  </div>

  <script>
    const ASSET_PREFIX = {json.dumps(asset_prefix)};
    const milestones = {json.dumps(milestones)};
    const transactions = {json.dumps(transactions)};

    let currentSlide = 0;
    let autoPlayInterval = null;
    let currentTypeFilter = 'ALL';

    function initRail() {{
      const rail = document.getElementById('thumbRail');
      rail.innerHTML = milestones.map((m, idx) => `
        <div class="thumb-item ${{idx === 0 ? 'active' : ''}}" onclick="goToSlide(${{idx}})">
          <img src="${{ASSET_PREFIX}}/${{m.thumb}}" alt="${{m.title}}">
          <div class="thumb-label">Step ${{String(m.step).padStart(3, '0')}} · ${{m.tag}}</div>
        </div>
      `).join('');
    }}

    function updateViewer() {{
      const m = milestones[currentSlide];
      document.getElementById('mainViewerImg').src = ASSET_PREFIX + '/' + m.img;
      document.getElementById('viewerBadge').innerText = `Step ${{String(m.step).padStart(3, '0')}} · Round ${{m.round}}`;
      document.getElementById('viewerTag').innerText = m.tag;
      document.getElementById('viewerTitle').innerText = m.title;
      document.getElementById('viewerDesc').innerText = m.desc;

      const thumbs = document.querySelectorAll('.thumb-item');
      thumbs.forEach((t, i) => {{
        t.classList.toggle('active', i === currentSlide);
      }});
      thumbs[currentSlide]?.scrollIntoView({{ behavior: 'smooth', inline: 'center', block: 'nearest' }});
    }}

    function goToSlide(idx) {{
      currentSlide = (idx + milestones.length) % milestones.length;
      updateViewer();
    }}

    function nextSlide() {{
      goToSlide(currentSlide + 1);
    }}

    function prevSlide() {{
      goToSlide(currentSlide - 1);
    }}

    function togglePlay() {{
      const btn = document.getElementById('playBtn');
      if (autoPlayInterval) {{
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
        btn.innerText = '▶ Auto-Play';
        btn.classList.remove('btn-active');
      }} else {{
        autoPlayInterval = setInterval(nextSlide, 2500);
        btn.innerText = '⏸ Pause';
        btn.classList.add('btn-active');
      }}
    }}

    function openLightbox() {{
      const lb = document.getElementById('lightbox');
      const img = document.getElementById('lightboxImg');
      img.src = ASSET_PREFIX + '/' + milestones[currentSlide].img;
      lb.classList.add('active');
    }}

    function closeLightbox() {{
      document.getElementById('lightbox').classList.remove('active');
    }}

    function getBadgeClass(type) {{
      if (type.includes('ATTACK')) return 'badge-amber';
      if (type === 'USE_ITEM') return 'badge-success';
      if (type === 'SPELL_CAST' || type.includes('SEARCH') || type === 'STORY_TRIGGER') return 'badge-purple';
      if (type === 'DOOR_OPEN') return 'badge-cyan';
      if (type === 'REACH_EXIT' || type === 'QUEST_COMPLETE') return 'badge-success';
      return 'badge-cyan';
    }}

    function renderTable(txList) {{
      const tbody = document.getElementById('txTableBody');
      tbody.innerHTML = txList.map(tx => `
        <tr>
          <td class="td-id">#${{tx.id}}</td>
          <td class="td-step">${{tx.step}}</td>
          <td class="td-id">R${{tx.round}}</td>
          <td class="td-actor">${{tx.actor}}</td>
          <td><span class="badge ${{getBadgeClass(tx.type)}}">${{tx.type}}</span></td>
          <td class="td-desc">${{tx.desc}}</td>
        </tr>
      `).join('');
      document.getElementById('txCounter').innerText = `Showing ${{txList.length}} / ${{transactions.length}} Transactions`;
    }}

    function setTypeFilter(f) {{
      currentTypeFilter = f;
      document.querySelectorAll('.filter-pill').forEach(btn => {{
        const label = btn.innerText.toUpperCase();
        const match =
          (f === 'ALL' && label.startsWith('ALL')) ||
          (f === 'COMBAT' && label.startsWith('COMBAT')) ||
          (f === 'SPELL_CAST' && label.startsWith('SPELLS')) ||
          (f === 'USE_ITEM' && label.startsWith('POTIONS')) ||
          (f === 'DOOR_OPEN' && label.startsWith('DOORS')) ||
          (f === 'MOVE' && label.startsWith('MOVEMENT')) ||
          (f === 'MILESTONES' && label.startsWith('KEY EVENTS'));
        btn.classList.toggle('active', match);
      }});
      filterTransactions();
    }}

    function filterTransactions() {{
      const search = document.getElementById('txSearch').value.toLowerCase();
      const filtered = transactions.filter(tx => {{
        if (currentTypeFilter === 'COMBAT') {{
          if (!tx.type.includes('ATTACK')) return false;
        }} else if (currentTypeFilter === 'SPELL_CAST') {{
          if (tx.type !== 'SPELL_CAST') return false;
        }} else if (currentTypeFilter === 'USE_ITEM') {{
          if (tx.type !== 'USE_ITEM') return false;
        }} else if (currentTypeFilter === 'DOOR_OPEN') {{
          if (tx.type !== 'DOOR_OPEN') return false;
        }} else if (currentTypeFilter === 'MOVE') {{
          if (tx.type !== 'MOVE' && tx.type !== 'ROLL_MOVEMENT') return false;
        }} else if (currentTypeFilter === 'MILESTONES') {{
          const isBossHit = tx.desc.includes('Talarixon') || tx.desc.includes('Brownsted') || tx.desc.includes('El-Rogers');
          if (!['USE_ITEM', 'QUEST_COMPLETE', 'DOOR_OPEN', 'STORY_TRIGGER', 'SPELL_CAST'].includes(tx.type) && !isBossHit) return false;
        }}

        if (search) {{
          const text = (tx.actor + ' ' + tx.type + ' ' + tx.desc + ' ' + tx.id).toLowerCase();
          if (!text.includes(search)) return false;
        }}
        return true;
      }});

      renderTable(filtered);
    }}

    initRail();
    updateViewer();
    renderTable(transactions);

    document.addEventListener('keydown', (e) => {{
      if (e.key === 'ArrowRight') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
      if (e.key === 'Escape') closeLightbox();
    }});
  </script>
</body>
</html>
"""


with open(OUTPUT_HTML, "w") as f:
    f.write(render_report("assets", False))

os.makedirs(os.path.dirname(SITE_HTML), exist_ok=True)
with open(SITE_HTML, "w") as f:
    f.write(render_report("/assets/games/proof-of-viability-election-2026", True))

print(f"Report HTML generated at: {OUTPUT_HTML}")
print(f"Site HTML generated at: {SITE_HTML}")
