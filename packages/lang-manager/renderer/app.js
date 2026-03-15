'use strict';
let catalogue = [];
let selectedId = null;
let activeTab = 'versions';
let filterCategory = null;

async function init() {
  catalogue = await window.lm.getCatalogue();
  renderCategoryFilters();
  renderSidebar();
}

function renderCategoryFilters() {
  const categories = [...new Set(catalogue.map(l => l.category))];
  const bar = document.getElementById('category-filters');
  bar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'cat-btn' + (filterCategory === null ? ' active' : '');
  allBtn.textContent = 'All';
  allBtn.onclick = () => { filterCategory = null; renderCategoryFilters(); renderSidebar(); };
  bar.appendChild(allBtn);

  for (const cat of categories) {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (filterCategory === cat ? ' active' : '');
    btn.textContent = cat;
    btn.onclick = () => { filterCategory = cat; renderCategoryFilters(); renderSidebar(); };
    bar.appendChild(btn);
  }
}

function renderSidebar() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const list = document.getElementById('lang-list');
  const loading = document.getElementById('sidebar-loading');
  loading.style.display = 'none';
  list.innerHTML = '';

  const filtered = catalogue.filter(l => {
    if (filterCategory && l.category !== filterCategory) return false;
    if (search && !l.name.toLowerCase().includes(search) && !l.category.toLowerCase().includes(search)) return false;
    return true;
  });

  const byCategory = {};
  for (const l of filtered) {
    if (!byCategory[l.category]) byCategory[l.category] = [];
    byCategory[l.category].push(l);
  }

  for (const [cat, langs] of Object.entries(byCategory)) {
    const catDiv = document.createElement('div');
    catDiv.className = 'sidebar-category';
    catDiv.textContent = cat;
    list.appendChild(catDiv);

    for (const lang of langs) {
      const item = document.createElement('div');
      item.className = 'lang-item' + (selectedId === lang.id ? ' active' : '');
      item.dataset.id = lang.id;
      item.innerHTML = `
        <div class="lang-item-icon">${lang.icon}</div>
        <div class="lang-item-info">
          <div class="lang-item-name">${lang.name}</div>
          <div class="lang-item-vm">${lang.versionManager}</div>
          ${lang.buildTools.length ? `<div class="lang-item-badges">${lang.buildTools.slice(0,3).map(bt => `<span class="lang-badge">${bt}</span>`).join('')}${lang.buildTools.length > 3 ? `<span class="lang-badge">+${lang.buildTools.length-3}</span>` : ''}</div>` : ''}
        </div>`;
      item.onclick = () => selectLang(lang.id);
      list.appendChild(item);
    }
  }
}

document.getElementById('search-input').addEventListener('input', renderSidebar);

async function selectLang(id) {
  selectedId = id;
  activeTab = 'versions';
  renderSidebar();

  const lang = catalogue.find(l => l.id === id);
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = renderDetailHeader(lang) + renderDetailTabs() + `<div id="tab-content"><div class="sidebar-empty"><span class="spinner"></span> Detecting versions…</div></div>`;

  bindTabs();
  await loadTab('versions');
}

function renderDetailHeader(lang) {
  return `
  <div class="detail-header">
    <div class="detail-lang-icon">${lang.icon}</div>
    <div class="detail-lang-info">
      <div class="detail-lang-name">${lang.name}</div>
      <div class="detail-lang-desc">${lang.description}</div>
      <div class="detail-lang-vm">📦 Version manager: ${lang.versionManager}</div>
    </div>
    <div class="detail-header-actions">
      <button class="btn btn-sm" onclick="window.lm.openUrl('${lang.website}')">🌐 Website</button>
    </div>
  </div>`;
}

function renderDetailTabs() {
  const tabs = ['versions', 'buildtools', 'environment'];
  const labels = { versions: '📌 Versions', buildtools: '🔨 Build Tools', environment: '🌍 Environment' };
  return `<div class="detail-tabs">${tabs.map(t =>
    `<div class="detail-tab${activeTab === t ? ' active' : ''}" data-tab="${t}">${labels[t]}</div>`
  ).join('')}</div>`;
}

function bindTabs() {
  document.querySelectorAll('.detail-tab').forEach(t => {
    t.addEventListener('click', async () => {
      activeTab = t.dataset.tab;
      document.querySelectorAll('.detail-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('tab-content').innerHTML = `<div class="sidebar-empty"><span class="spinner"></span> Loading…</div>`;
      await loadTab(activeTab);
    });
  });
}

async function loadTab(tab) {
  const lang = catalogue.find(l => l.id === selectedId);
  const tc = document.getElementById('tab-content');
  if (!tc) return;

  if (tab === 'versions') {
    const { versions, vmInstalled } = await window.lm.detectVersions(selectedId);
    tc.innerHTML = renderVersionsTab(lang, versions, vmInstalled);
    bindVersionsTab(lang, versions, vmInstalled);

  } else if (tab === 'buildtools') {
    const tools = await window.lm.detectBuildTools(selectedId);
    tc.innerHTML = renderBuildToolsTab(lang, tools);
    bindBuildToolsTab(tools);

  } else if (tab === 'environment') {
    const env = await window.lm.getEnvInfo(selectedId);
    tc.innerHTML = renderEnvTab(lang, env);
  }
}

// ── Versions Tab ─────────────────────────────────────────────────────────────
function renderVersionsTab(lang, versions, vmInstalled) {
  const vmSection = `
  <div class="version-manager-bar">
    <div class="vm-status-icon">${vmInstalled ? '✅' : '⚠️'}</div>
    <div class="vm-info">
      <div class="vm-name">${lang.versionManager}</div>
      <div class="vm-subtitle">${vmInstalled ? 'Version manager is installed' : 'Version manager not detected — install it to manage multiple versions'}</div>
    </div>
    ${!vmInstalled ? `<button class="btn btn-primary btn-sm" id="btn-install-vm">Install ${lang.versionManager}</button>` : ''}
  </div>`;

  const installBar = `
  <div class="install-new-bar">
    <label>Install version:</label>
    <input type="text" id="install-version-input" placeholder="e.g. 21.0.3-tem  or  lts/*  or  latest" />
    <button class="btn btn-primary btn-sm" id="btn-install-new">⬇ Install</button>
  </div>`;

  let versionsHtml = '';
  if (versions.length === 0) {
    versionsHtml = `
    <div class="versions-empty">
      <div>No installed versions detected</div>
      <div class="hint">Use the install bar above to add a version</div>
    </div>`;
  } else {
    versionsHtml = `<div class="versions-list">` +
      versions.map(v => `
      <div class="version-card ${v.active ? 'active-version' : ''}">
        <div class="version-name">${v.version}</div>
        ${v.active ? '<div class="version-badge">● ACTIVE</div>' : ''}
        <div class="version-actions">
          ${!v.active ? `<button class="btn btn-success btn-sm" data-action="set-default" data-ver="${v.version}">Set Default</button>` : ''}
          <button class="btn btn-danger btn-sm" data-action="remove" data-ver="${v.version}">🗑 Remove</button>
        </div>
      </div>`).join('') +
      '</div>';
  }

  return vmSection + installBar + versionsHtml;
}

function bindVersionsTab(lang, versions, vmInstalled) {
  const vmBtn = document.getElementById('btn-install-vm');
  if (vmBtn) {
    vmBtn.onclick = () => {
      window.lm.openTerminal(`#!/usr/bin/env bash\n${lang.versionManagerInstallScript || '# No install script available'}`);
    };
  }

  const installBtn = document.getElementById('btn-install-new');
  if (installBtn) {
    installBtn.onclick = async () => {
      const ver = document.getElementById('install-version-input').value.trim();
      await window.lm.installVersion({ id: selectedId, version: ver });
    };
  }

  document.querySelectorAll('[data-action="set-default"]').forEach(btn => {
    btn.onclick = () => window.lm.setDefaultVersion({ id: selectedId, version: btn.dataset.ver });
  });
  document.querySelectorAll('[data-action="remove"]').forEach(btn => {
    btn.onclick = () => {
      if (confirm(`Remove ${lang.name} ${btn.dataset.ver}?`))
        window.lm.removeVersion({ id: selectedId, version: btn.dataset.ver });
    };
  });
}

// ── Build Tools Tab ───────────────────────────────────────────────────────────
function renderBuildToolsTab(lang, tools) {
  if (!tools.length) {
    return `<div class="versions-empty">No build tools configured for ${lang.name}.<br><span style="font-size:11px;color:var(--text2)">Build system is built into the language toolchain.</span></div>`;
  }
  return `<div class="build-tools-grid">` +
    tools.map(bt => `
    <div class="build-tool-card">
      <div class="bt-icon">${bt.icon || '🔨'}</div>
      <div class="bt-info">
        <div class="bt-name">${bt.name}</div>
        ${bt.installed && bt.version ? `<div class="bt-version">✓ v${bt.version}</div>` : bt.installed ? `<div class="bt-version">✓ Installed</div>` : `<div class="bt-not-installed">⚠ Not installed</div>`}
        ${bt.configFile ? `<div class="bt-config">Config: ${bt.configFile}</div>` : ''}
      </div>
      <div class="bt-actions">
        ${bt.website ? `<button class="btn btn-sm" data-website="${bt.website}">🌐</button>` : ''}
        ${!bt.installed ? `<button class="btn btn-primary btn-sm" data-install-tool="${bt.id}">⬇ Install</button>` : ''}
      </div>
    </div>`).join('') +
    '</div>';
}

function bindBuildToolsTab(tools) {
  document.querySelectorAll('[data-website]').forEach(btn => {
    btn.onclick = () => window.lm.openUrl(btn.dataset.website);
  });
  document.querySelectorAll('[data-install-tool]').forEach(btn => {
    btn.onclick = () => window.lm.installBuildTool({ toolId: btn.dataset.installTool });
  });
}

// ── Environment Tab ───────────────────────────────────────────────────────────
function renderEnvTab(lang, env) {
  const langKeywords = {
    java: ['JAVA', 'JDK', 'JVM', 'SDKMAN'],
    nodejs: ['NODE', 'NVM', 'NPM'],
    python: ['PYTHON', 'PYENV', 'PIP', 'CONDA'],
    ruby: ['RUBY', 'RBENV', 'GEM', 'BUNDLE'],
    go: ['GO'],
    rust: ['RUST', 'CARGO'],
    dotnet: ['DOTNET', 'NUGET'],
    php: ['PHP', 'COMPOSER'],
    kotlin: ['KOTLIN', 'SDKMAN'],
    scala: ['SCALA', 'SDKMAN', 'SBT'],
    elixir: ['ELIXIR', 'ASDF'],
    swift: ['SWIFT'],
  }[lang.id] || [];

  const vars = env.envVars || {};
  const pathEntries = env.pathEntries || [];

  let html = '<div class="env-section"><div class="env-section-title">Environment Variables</div>';
  if (Object.keys(vars).length === 0) {
    html += `<div style="color:var(--text2);font-size:12px;padding:8px 0;">No relevant environment variables detected.</div>`;
  } else {
    for (const [k, v] of Object.entries(vars)) {
      html += `<div class="env-var-row"><div class="env-var-key">${k}</div><div class="env-var-val" title="${v}">${v}</div></div>`;
    }
  }
  html += '</div>';

  html += '<div class="env-section"><div class="env-section-title">PATH entries (relevant highlighted)</div>';
  const relevantPaths = pathEntries.filter(p => langKeywords.some(kw => p.toUpperCase().includes(kw)));
  const otherPaths = pathEntries.filter(p => !langKeywords.some(kw => p.toUpperCase().includes(kw)));
  for (const p of [...relevantPaths, ...otherPaths]) {
    const isRelevant = langKeywords.some(kw => p.toUpperCase().includes(kw));
    html += `<div class="path-entry${isRelevant ? ' relevant' : ''}">${isRelevant ? '★' : '·'} ${p}</div>`;
  }
  html += '</div>';

  return html;
}

init();


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'lang-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
