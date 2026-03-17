'use strict';

let catalogue = [];
let pluginConfig = { builtZip: null, installStatus: {} };

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  document.getElementById('tool-grid').innerHTML = '<div class="loading">Detecting tools...</div>';
  [catalogue, pluginConfig] = await Promise.all([
    window.robos.getToolCatalogue(),
    window.robos.getRobosPluginConfig(),
  ]);
  renderPluginBanner();
  render();
}

// ── Plugin Banner ─────────────────────────────────────────────────────────────
function renderPluginBanner() {
  const sub = document.getElementById('plugin-banner-sub');
  if (pluginConfig.builtZip) {
    const match = pluginConfig.builtZip.match(/robos-(\d+\.\d+\.\d+)\.zip$/);
    const version = match ? `v${match[1]}` : 'available';
    sub.innerHTML = `<span class="plugin-status-ok">${esc(version)}</span>`;
  } else {
    sub.innerHTML = `<span class="plugin-status-warn">Plugin package not found</span>`;
  }
}

// ── Render tool grid ──────────────────────────────────────────────────────────
function render() {
  const groups = {};
  for (const tool of catalogue) {
    if (!groups[tool.category]) groups[tool.category] = [];
    groups[tool.category].push(tool);
  }

  const categoryOrder = ['AI Editors', 'Code Editors', 'JetBrains IDEs', 'Tools', 'CLI Tools', 'Cloud & Infrastructure'];
  const html = categoryOrder
    .filter(cat => groups[cat])
    .map(cat => `
      <div class="category-section">
        <div class="category-title">${esc(cat)}</div>
        <div class="tool-cards">
          ${groups[cat].map(toolCard).join('')}
        </div>
      </div>
    `).join('');

  document.getElementById('tool-grid').innerHTML = html;
}

function toolCard(tool) {
  const installed = tool.installed;
  const isJB = tool.isJetBrains;
  const pluginInstalled = isJB && pluginConfig.installStatus[tool.id];

  let pluginSection = '';
  if (isJB && tool.id !== 'toolbox') {
    if (!installed) {
      pluginSection = `<div class="plugin-row plugin-na">RobOS Plugin: install ${esc(tool.name)} first</div>`;
    } else if (pluginInstalled) {
      pluginSection = `<div class="plugin-row plugin-installed">RobOS Plugin: <span class="plugin-ok">Installed</span></div>`;
    } else {
      pluginSection = `<div class="plugin-row">RobOS Plugin: <span class="plugin-missing">not installed</span>
        <button class="ic-btn plugin-install" onclick="installPlugin('${tool.id}', '${esc(tool.name)}')">Install Plugin</button>
      </div>`;
    }
  }

  return `
    <div class="tool-card${installed ? ' installed' : ''}" id="card-${tool.id}">
      <div class="tc-header">
        <div class="tc-names">
          <div class="tc-name">${esc(tool.name)}</div>
          <div class="tc-vendor">${esc(tool.vendor)}</div>
          ${tool.version ? `<div class="tc-version">${esc(tool.version)}</div>` : ''}
        </div>
      </div>
      <div class="tc-desc">${esc(tool.description)}</div>
      ${tool.path ? `<div class="tc-path">${esc(tool.path)}</div>` : ''}
      ${pluginSection}
      ${tool.runningCount > 0 ? `<div class="tc-running">${tool.runningCount} running process${tool.runningCount > 1 ? 'es' : ''}</div>` : ''}
      <div class="tc-actions">
        ${installed
          ? `<button class="ic-btn launch" onclick="launchTool('${tool.id}')">Launch</button>
             ${tool.runningCount > 0 ? `<button class="ic-btn kill" onclick="killTool('${tool.id}', '${esc(tool.name)}')">Kill All</button>` : ''}
             <button class="ic-btn uninstall" onclick="uninstallTool('${tool.id}', '${esc(tool.name)}')">Uninstall</button>`
          : `<button class="ic-btn install" onclick="installTool('${tool.id}', '${esc(tool.name)}')">Install</button>`
        }
        <button class="ic-btn website" onclick="openSite('${esc(tool.installUrl)}')" title="Open website">Web</button>
      </div>
    </div>
  `;
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function launchTool(id) {
  const r = await window.robos.launchTool({ ideId: id });
  if (!r.ok) alert('Failed to launch: ' + (r.error || ''));
}

async function installTool(id, name) {
  const r = await window.robos.installTool({ ideId: id });
  if (!r.ok) {
    showModal(`Install ${name}`, `<p style="color:#f85149">Error: ${esc(r.error || 'Unknown error')}</p>`);
    return;
  }
  showModal(`Installing ${name}`, `
    <p>A terminal window should have opened to run the installation.</p>
    <p style="margin-top:8px;color:#e3b341">This may require your sudo password.</p>
    <p style="margin-top:8px">After installation completes, <a href="#" onclick="closeModalAndRefresh();return false;" style="color:#58a6ff">click here to Refresh</a>.</p>
  `);
}

async function uninstallTool(id, name) {
  showModal(`Uninstall ${name}`, `
    <p>A terminal window will open to uninstall <strong>${esc(name)}</strong>.</p>
    <p style="margin-top:8px;color:#e3b341">This will remove the tool and its desktop shortcut.</p>
    <p style="margin-top:8px"><a href="#" onclick="proceedUninstall('${esc(id)}','${esc(name)}');return false;" style="color:#f85149">Yes, uninstall</a>
    &nbsp;&nbsp;<a href="#" onclick="document.getElementById('install-modal').classList.add('hidden');return false;" style="color:#58a6ff">Cancel</a></p>
  `);
}

async function proceedUninstall(id, name) {
  document.getElementById('install-modal').classList.add('hidden');
  const r = await window.robos.uninstallTool({ ideId: id });
  if (!r.ok) {
    showModal('Uninstall Error', `<p style="color:#f85149">${esc(r.error || 'Unknown error')}</p>`);
  } else {
    showModal(`Uninstalling ${name}`, `
      <p>A terminal window is running the uninstall script.</p>
      <p style="margin-top:8px"><a href="#" onclick="closeModalAndRefresh();return false;" style="color:#58a6ff">Click here to Refresh</a> after it completes.</p>
    `);
  }
}

async function killTool(id, name) {
  const r = await window.robos.killTool({ ideId: id });
  if (!r.ok) {
    showModal('Kill Error', `<p style="color:#f85149">${esc(r.error || 'Unknown error')}</p>`);
  } else if (r.killed === 0) {
    showModal(name, `<p>No running processes found for ${esc(name)}.</p>`);
  } else {
    showModal(name, `<p>Sent SIGTERM to <strong>${r.killed}</strong> process${r.killed > 1 ? 'es' : ''}.</p>`);
    setTimeout(load, 2000);
  }
}

async function installPlugin(id, name) {
  const r = await window.robos.installRobosPlugin({ ideId: id });
  if (!r.ok) {
    showModal('Plugin Install Error', `<p style="color:#f85149">${esc(r.error || 'Unknown error')}</p>`);
  } else {
    showModal(`Installing RobOS Plugin`, `
      <p>A terminal window will install the plugin into ${esc(name)}.</p>
      <p style="margin-top:8px"><a href="#" onclick="closeModalAndRefresh();return false;" style="color:#58a6ff">Click here to Refresh</a> after it completes.</p>
    `);
  }
}

function openSite(url) { window.robos.openUrl({ url }); }

// ── Modal ─────────────────────────────────────────────────────────────────────
function showModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('install-modal').classList.remove('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModalAndRefresh);

function closeModalAndRefresh() {
  document.getElementById('install-modal').classList.add('hidden');
  load();
}

document.getElementById('btn-refresh').addEventListener('click', load);

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

load();
