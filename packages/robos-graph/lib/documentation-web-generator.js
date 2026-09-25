'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Generate a standalone, interactive, GitHub Pages-friendly website for RobOS
 * System Documentation exported from the Knowledge Graph.
 *
 * @param {import('./graph-store').SDLCKnowledgeGraphStore} store
 * @param {Object} options
 * @returns {Object} { ok: boolean, filePath: string, permalink: string, entriesCount: number }
 */
function generateDocumentationWebsite(store, options = {}) {
  const permalink = options.permalink || '/system-documentation/';
  const defaultOutputPath = path.join(process.cwd(), 'docs', 'system-documentation', 'index.html');
  const outputPath = options.outputFilePath || defaultOutputPath;

  // Retrieve documentable and documented entries
  const documentableEntries = typeof store.getDocumentableNodes === 'function'
    ? store.getDocumentableNodes()
    : [];

  const docNodes = typeof store.getDocumentationNodes === 'function'
    ? store.getDocumentationNodes()
    : [];

  // Build documented item list with loaded markdown content
  const documentedItems = [];

  for (const entry of documentableEntries) {
    if (!entry.isDocumented && !entry.docPath) continue;

    let markdown = '';
    const candPaths = [
      entry.docPath,
      path.join('docs', 'architecture', `${entry.id.replace(/.*:/, '')}.md`),
      path.join('docs', 'applications', `${entry.id.replace(/.*:/, '')}.md`),
    ].filter(Boolean);

    for (const cp of candPaths) {
      const absPath = path.isAbsolute(cp) ? cp : path.join(process.cwd(), cp);
      if (fs.existsSync(absPath)) {
        try {
          markdown = fs.readFileSync(absPath, 'utf8');
          break;
        } catch {}
      }
    }

    if (!markdown) {
      markdown = `# ${entry.title}\n\n${entry.description || 'System documentation for ' + entry.title}\n\n- **Target Entity**: \`${entry.id}\`\n- **Technology**: \`${entry.technology}\`\n- **Owner**: \`${entry.ownerTeam}\`\n`;
    }

    // Strip Jekyll front matter for client display
    let cleanedMd = markdown;
    if (cleanedMd.startsWith('---')) {
      const parts = cleanedMd.split('---');
      if (parts.length >= 3) {
        cleanedMd = parts.slice(2).join('---').trim();
      }
    }

    documentedItems.push({
      id: entry.id,
      slug: entry.id.replace(/.*:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title: entry.title,
      description: entry.description,
      type: entry.type,
      category: entry.category,
      repository: entry.repository,
      technology: entry.technology,
      ownerTeam: entry.ownerTeam,
      docPath: entry.docPath || `docs/architecture/${entry.id.replace(/.*:/, '')}.md`,
      markdown: cleanedMd,
    });
  }

  // Also include any standalone robos:Documentation nodes not linked in documentableEntries
  for (const doc of docNodes) {
    const target = doc['robos:targetEntity'] || doc['robos:targetNode'];
    if (documentedItems.some(i => i.id === target || i.id === doc['@id'])) continue;

    let markdown = '';
    const dp = doc['robos:docPath'];
    if (dp) {
      const abs = path.isAbsolute(dp) ? dp : path.join(process.cwd(), dp);
      if (fs.existsSync(abs)) {
        try { markdown = fs.readFileSync(abs, 'utf8'); } catch {}
      }
    }
    if (!markdown) {
      markdown = `# ${doc['dcterms:title'] || 'Documentation'}\n\n${doc['dcterms:description'] || ''}`;
    }
    let cleanedMd = markdown;
    if (cleanedMd.startsWith('---')) {
      const parts = cleanedMd.split('---');
      if (parts.length >= 3) cleanedMd = parts.slice(2).join('---').trim();
    }

    documentedItems.push({
      id: doc['@id'],
      slug: (doc['@id'] || 'doc').replace(/.*:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title: doc['dcterms:title'] || 'Documentation',
      description: doc['dcterms:description'] || '',
      type: 'Documentation',
      category: doc['robos:category'] || 'Platforms',
      repository: 'local',
      technology: 'Knowledge Graph',
      ownerTeam: 'platform-team',
      docPath: dp || 'docs/architecture/general.md',
      markdown: cleanedMd,
    });
  }

  // Also include any cataloged entries from .robos/documentation.yaml
  const yamlPath = path.join(process.cwd(), '.robos', 'documentation.yaml');
  if (fs.existsSync(yamlPath)) {
    try {
      const lines = fs.readFileSync(yamlPath, 'utf8').split('\n');
      let currentEntry = null;
      for (const line of lines) {
        const idMatch = line.match(/^\s*-\s+id:\s*"?([^"\n]+)"?/);
        if (idMatch) {
          if (currentEntry && currentEntry.id) {
            addCatalogEntry(currentEntry);
          }
          currentEntry = { id: idMatch[1].trim() };
        } else if (currentEntry) {
          const titleMatch = line.match(/^\s*title:\s*"?([^"\n]+)"?/);
          const targetMatch = line.match(/^\s*targetEntity:\s*"?([^"\n]+)"?/);
          const docPathMatch = line.match(/^\s*docPath:\s*"?([^"\n]+)"?/);
          const catMatch = line.match(/^\s*category:\s*"?([^"\n]+)"?/);
          if (titleMatch) currentEntry.title = titleMatch[1].trim();
          if (targetMatch) currentEntry.targetEntity = targetMatch[1].trim();
          if (docPathMatch) currentEntry.docPath = docPathMatch[1].trim();
          if (catMatch) currentEntry.category = catMatch[1].trim();
        }
      }
      if (currentEntry && currentEntry.id) {
        addCatalogEntry(currentEntry);
      }
    } catch {}
  }

  function addCatalogEntry(entry) {
    const target = entry.targetEntity || entry.id;
    if (documentedItems.some(i => i.id === target || i.id === entry.id || i.slug === entry.id)) return;

    let markdown = '';
    const dp = entry.docPath || `docs/architecture/${entry.id}.md`;
    const abs = path.isAbsolute(dp) ? dp : path.join(process.cwd(), dp);
    if (fs.existsSync(abs)) {
      try { markdown = fs.readFileSync(abs, 'utf8'); } catch {}
    }
    if (!markdown) {
      markdown = `# ${entry.title || entry.id}\n\nSystem documentation for ${entry.title || entry.id}.`;
    }
    let cleanedMd = markdown;
    if (cleanedMd.startsWith('---')) {
      const parts = cleanedMd.split('---');
      if (parts.length >= 3) cleanedMd = parts.slice(2).join('---').trim();
    }

    documentedItems.push({
      id: target,
      slug: entry.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title: entry.title || entry.id,
      description: `Living architecture documentation for ${entry.title || entry.id}.`,
      type: entry.category === 'Services' ? 'Microservice' : (entry.category === 'Applications' ? 'DesktopApp' : 'Architecture'),
      category: entry.category || 'Platforms',
      repository: 'local',
      technology: 'RobOS Platform',
      ownerTeam: 'Platform',
      docPath: dp,
      markdown: cleanedMd,
    });
  }

  // Fallback if no entries yet documented
  if (documentedItems.length === 0) {
    documentedItems.push({
      id: 'urn:robos:service:forms-api',
      slug: 'forms-api',
      title: 'Forms API Service',
      description: 'Microservice handling customer intake forms, schema validation, and event streaming.',
      type: 'Microservice',
      category: 'Services',
      repository: 'github.com/robos-inc/forms-api',
      technology: 'TypeScript / Node.js',
      ownerTeam: 'Core Platform',
      docPath: 'docs/architecture/forms-api.md',
      markdown: '# Forms API Service — System Documentation\n\nMission-critical forms processing microservice in the RobOS platform.',
    });
  }

  const htmlContent = buildStandaloneDocsHtml({
    items: documentedItems,
    permalink,
    title: options.title || 'RobOS Living System Documentation & Architecture Hub',
  });

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, htmlContent, 'utf8');
  } catch (err) {
    return { ok: false, error: `Failed writing export file: ${err.message}` };
  }

  return {
    ok: true,
    filePath: outputPath,
    permalink,
    entriesCount: documentedItems.length,
    items: documentedItems.map(i => ({ id: i.id, title: i.title, category: i.category })),
  };
}

/**
 * Builds the complete standalone, GitHub Pages-friendly HTML page.
 */
function buildStandaloneDocsHtml({ items, permalink, title }) {
  const serializedItems = JSON.stringify(items).replace(/</g, '\\u003c');

  return `---
layout: null
title: ${title}
permalink: ${permalink}
parent: System Architecture
grand_parent: RobOS Platform
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — RobOS</title>
  <meta name="description" content="Official living system documentation and architectural specifications exported from the RobOS Dual-State Knowledge Graph.">
  <link rel="icon" type="image/svg+xml" href="https://rowbose.com/assets/images/icons/robos-elearning.svg">
  <!-- Mermaid for client-side diagrams -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    :root {
      --bg-base: #0a0e17;
      --bg-panel: #111726;
      --bg-card: #162035;
      --bg-hover: #1d2a45;
      --border-color: #243352;
      --border-accent: #00bcd4;
      --text-main: #f0f6fc;
      --text-muted: #8b949e;
      --accent-cyan: #00bcd4;
      --accent-blue: #38bdf8;
      --accent-green: #22c55e;
      --accent-amber: #f59e0b;
      --accent-purple: #a855f7;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }
    a { color: var(--accent-cyan); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Skip link */
    .skip-link {
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--accent-cyan);
      color: #000;
      padding: 8px 16px;
      font-weight: 700;
      z-index: 100;
      transition: top 0.2s;
    }
    .skip-link:focus { top: 0; }

    /* App Header */
    .docs-header {
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border-color);
      padding: 0.75rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(8px);
    }
    .brand-area {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand-icon {
      font-size: 1.5rem;
      line-height: 1;
    }
    .brand-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
    }
    .brand-sub {
      font-size: 0.72rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .header-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(0, 188, 212, 0.12);
      color: var(--accent-cyan);
      border: 1px solid rgba(0, 188, 212, 0.3);
    }
    .badge-green {
      background: rgba(34, 197, 94, 0.12);
      color: var(--accent-green);
      border-color: rgba(34, 197, 94, 0.3);
    }

    /* Layout Body */
    .docs-layout {
      display: grid;
      grid-template-columns: 340px 1fr;
      flex: 1;
      height: calc(100vh - 61px);
      overflow: hidden;
    }

    /* Sidebar */
    .docs-sidebar {
      background: var(--bg-panel);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .sidebar-search-box {
      padding: 0.85rem;
      border-bottom: 1px solid var(--border-color);
    }
    .search-input {
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      color: var(--text-main);
      font-size: 0.85rem;
      outline: none;
      transition: border-color 0.15s;
    }
    .search-input:focus {
      border-color: var(--accent-cyan);
    }
    .category-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding: 0.65rem 0.85rem;
      border-bottom: 1px solid var(--border-color);
      background: rgba(10, 14, 23, 0.5);
    }
    .cat-pill {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.72rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .cat-pill:hover, .cat-pill.active {
      background: var(--accent-cyan);
      color: #000;
      border-color: var(--accent-cyan);
      font-weight: 600;
    }
    .entry-list {
      list-style: none;
      overflow-y: auto;
      flex: 1;
      padding: 0.5rem;
    }
    .entry-item {
      padding: 0.65rem 0.8rem;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 0.35rem;
      border: 1px solid transparent;
      transition: all 0.15s;
    }
    .entry-item:hover {
      background: var(--bg-hover);
      border-color: var(--border-color);
    }
    .entry-item.active {
      background: var(--bg-card);
      border-color: var(--accent-cyan);
    }
    .entry-item-title {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 0.2rem;
    }
    .entry-item-meta {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.72rem;
      color: var(--text-muted);
    }

    /* Content Area */
    .docs-content {
      background: var(--bg-base);
      overflow-y: auto;
      padding: 2rem 3rem;
      height: 100%;
    }
    .entity-header {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      position: relative;
    }
    .entity-title {
      font-size: 1.75rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
      letter-spacing: -0.02em;
    }
    .entity-desc {
      color: var(--text-muted);
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 1rem;
    }
    .entity-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-color);
      font-size: 0.8rem;
    }
    .meta-item strong {
      color: var(--text-muted);
      display: block;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.15rem;
    }
    .meta-item code {
      font-family: var(--font-mono);
      background: var(--bg-base);
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      border: 1px solid var(--border-color);
      font-size: 0.75rem;
    }

    /* Rendered Markdown Typography */
    .markdown-body {
      color: #c9d1d9;
      line-height: 1.7;
      font-size: 0.95rem;
    }
    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
      color: var(--text-main);
      margin-top: 1.75rem;
      margin-bottom: 0.75rem;
      font-weight: 700;
      letter-spacing: -0.015em;
    }
    .markdown-body h1 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }
    .markdown-body h2 { font-size: 1.25rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.4rem; }
    .markdown-body h3 { font-size: 1.1rem; }
    .markdown-body p { margin-bottom: 1rem; }
    .markdown-body ul, .markdown-body ol { margin-bottom: 1rem; padding-left: 1.5rem; }
    .markdown-body li { margin-bottom: 0.35rem; }
    .markdown-body blockquote {
      border-left: 3px solid var(--accent-cyan);
      padding: 0.5rem 1rem;
      margin: 1rem 0;
      background: rgba(0, 188, 212, 0.05);
      border-radius: 0 4px 4px 0;
      color: #e6edf3;
    }
    .markdown-body pre {
      background: #0d1117;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      margin-bottom: 1.25rem;
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }
    .markdown-body code {
      font-family: var(--font-mono);
      font-size: 0.85em;
      background: rgba(110, 118, 129, 0.2);
      padding: 0.15em 0.35em;
      border-radius: 4px;
    }
    .markdown-body pre code {
      background: transparent;
      padding: 0;
    }
    .mermaid-box {
      background: #0d1117;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.25rem;
      margin: 1.25rem 0;
      text-align: center;
      overflow-x: auto;
    }

    @media (max-width: 860px) {
      .docs-layout { grid-template-columns: 1fr; height: auto; }
      .docs-sidebar { height: 350px; }
      .docs-content { padding: 1.25rem; }
    }
  </style>
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <div id="a11y-announcer" class="sr-only" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(1px,1px,1px,1px);"></div>

  <header class="docs-header" role="banner">
    <div class="brand-area">
      <span class="brand-icon">📚</span>
      <div>
        <h1 class="brand-title">RobOS System Documentation</h1>
        <div class="brand-sub">Dual-State Knowledge Graph Artifacts</div>
      </div>
    </div>
    <div class="header-controls">
      <span class="badge badge-green" id="header-count-badge">Loaded</span>
      <span class="badge">SHACL Verified</span>
      <a href="https://rowbose.com/" class="badge" style="text-decoration:none;">rowbose.com &rarr;</a>
    </div>
  </header>

  <div class="docs-layout">
    <aside class="docs-sidebar" aria-label="Documentation Index">
      <div class="sidebar-search-box">
        <input type="text" id="doc-search" class="search-input" placeholder="Filter architecture docs…" aria-label="Search documented entities">
      </div>
      <div class="category-pills" id="category-pills">
        <button class="cat-pill active" data-category="ALL">All</button>
        <button class="cat-pill" data-category="Services">Services</button>
        <button class="cat-pill" data-category="Applications">Apps</button>
        <button class="cat-pill" data-category="Databases & Streams">Data</button>
        <button class="cat-pill" data-category="DevOps">DevOps</button>
        <button class="cat-pill" data-category="Platforms">Platforms</button>
      </div>
      <ul class="entry-list" id="entry-list" role="tablist"></ul>
    </aside>

    <main class="docs-content" id="main-content" role="main">
      <div id="content-container">
        <!-- Rendered dynamically -->
      </div>
    </main>
  </div>

  <script>
    const DOC_ITEMS = ${serializedItems};
    let activeIndex = 0;
    let activeCategory = 'ALL';
    let searchQuery = '';

    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    }

    function renderList() {
      const listEl = document.getElementById('entry-list');
      const filtered = DOC_ITEMS.filter((item, idx) => {
        item._origIdx = idx;
        const matchesCat = activeCategory === 'ALL' || item.category === activeCategory;
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery = !q ||
          item.title.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.technology && item.technology.toLowerCase().includes(q));
        return matchesCat && matchesQuery;
      });

      listEl.innerHTML = '';
      if (filtered.length === 0) {
        listEl.innerHTML = '<li style="padding:1rem;color:var(--text-muted);font-size:0.85rem;">No matching documentation entries found.</li>';
        return;
      }

      filtered.forEach(item => {
        const li = document.createElement('li');
        li.className = 'entry-item ' + (item._origIdx === activeIndex ? 'active' : '');
        li.setAttribute('role', 'tab');
        li.setAttribute('aria-selected', item._origIdx === activeIndex ? 'true' : 'false');
        li.onclick = () => selectItem(item._origIdx);

        li.innerHTML = \`
          <div class="entry-item-title">\${escapeHtml(item.title)}</div>
          <div class="entry-item-meta">
            <span class="badge">\${escapeHtml(item.type)}</span>
            <span>\${escapeHtml(item.technology || 'Polyglot')}</span>
          </div>
        \`;
        listEl.appendChild(li);
      });

      document.getElementById('header-count-badge').textContent = DOC_ITEMS.length + ' Documented';
    }

    function selectItem(idx) {
      activeIndex = idx;
      renderList();
      renderContent();
    }

    function renderContent() {
      const container = document.getElementById('content-container');
      const item = DOC_ITEMS[activeIndex];
      if (!item) {
        container.innerHTML = '<div style="padding:2rem;color:var(--text-muted);">Select an entry from the index.</div>';
        return;
      }

      const parsedHtml = parseMarkdown(item.markdown || '');

      container.innerHTML = \`
        <div class="entity-header">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
            <span class="badge">\${escapeHtml(item.category)}</span>
            <span class="badge badge-green">\${escapeHtml(item.type)}</span>
          </div>
          <h2 class="entity-title">\${escapeHtml(item.title)}</h2>
          <p class="entity-desc">\${escapeHtml(item.description || '')}</p>
          <div class="entity-meta-grid">
            <div class="meta-item">
              <strong>KGraph Target Entity</strong>
              <code>\${escapeHtml(item.id)}</code>
            </div>
            <div class="meta-item">
              <strong>Owner Team</strong>
              <code>\${escapeHtml(item.ownerTeam || 'Platform')}</code>
            </div>
            <div class="meta-item">
              <strong>Repository</strong>
              <code>\${escapeHtml(item.repository || 'local')}</code>
            </div>
            <div class="meta-item">
              <strong>Artifact File</strong>
              <code>\${escapeHtml(item.docPath || 'docs/...')}</code>
            </div>
          </div>
        </div>

        <article class="markdown-body">
          \${parsedHtml}
        </article>
      \`;

      // Trigger Mermaid rendering on diagrams
      if (window.mermaid) {
        mermaid.run({ querySelector: '.mermaid' }).catch(() => {});
      }

      // Live screen reader announcement
      const announcer = document.getElementById('a11y-announcer');
      if (announcer) announcer.textContent = 'Loaded documentation for ' + item.title;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /**
     * Client-side Markdown-to-HTML parser with Mermaid block isolation.
     */
    function parseMarkdown(md) {
      if (!md) return '';
      let raw = md;

      // Extract and convert mermaid blocks
      raw = raw.replace(/\`\`\`mermaid\\s*([\\s\\S]*?)\`\`\`/g, function(_, code) {
        return '<div class="mermaid-box"><pre class="mermaid">' + escapeHtml(code.trim()) + '</pre></div>';
      });

      // Code blocks
      raw = raw.replace(/\`\`\`(\\w+)?\\s*([\\s\\S]*?)\`\`\`/g, function(_, lang, code) {
        return '<pre><code>' + escapeHtml(code.trim()) + '</code></pre>';
      });

      // Headers
      raw = raw.replace(/^### (.*$)/gim, '<h3>$1</h3>');
      raw = raw.replace(/^## (.*$)/gim, '<h2>$1</h2>');
      raw = raw.replace(/^# (.*$)/gim, '<h1>$1</h1>');

      // Blockquotes
      raw = raw.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

      // Bold & Italic
      raw = raw.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
      raw = raw.replace(/\\*(.*?)\\*/g, '<em>$1</em>');

      // Inline code
      raw = raw.replace(/\`([^\\\`]+)\`/g, '<code>$1</code>');

      // Unordered lists
      raw = raw.replace(/^\\s*-\\s+(.*$)/gim, '<li>$1</li>');

      // Paragraphs
      const lines = raw.split('\\n');
      let out = '';
      let inList = false;

      for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('<li>')) {
          if (!inList) { out += '<ul>'; inList = true; }
          out += trimmed;
        } else {
          if (inList) { out += '</ul>'; inList = false; }
          if (trimmed.length > 0 && !trimmed.startsWith('<h') && !trimmed.startsWith('<pre') && !trimmed.startsWith('<div') && !trimmed.startsWith('<blockquote') && !trimmed.startsWith('---')) {
            out += '<p>' + trimmed + '</p>';
          } else if (trimmed === '---') {
            out += '<hr style="border:0;border-top:1px solid var(--border-color);margin:1.5rem 0;">';
          } else {
            out += line + '\\n';
          }
        }
      }
      if (inList) out += '</ul>';

      return out;
    }

    // Category button handling
    document.querySelectorAll('.cat-pill').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.category;
        renderList();
      };
    });

    // Search input handling
    document.getElementById('doc-search').oninput = (e) => {
      searchQuery = e.target.value;
      renderList();
    };

    // Initialize
    renderList();
    renderContent();
  </script>
</body>
</html>
`;
}

module.exports = {
  generateDocumentationWebsite,
  buildStandaloneDocsHtml,
};
