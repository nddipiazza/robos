let catalogue = [];
let pluginConfig = { builtZip: null, installStatus: {} };

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  document.getElementById('ide-grid').innerHTML = '<div class="loading">Detecting tools…</div>';
  [catalogue, pluginConfig] = await Promise.all([
    window.idm.getIdeCatalogue(),
    window.idm.getRobosPluginConfig(),
  ]);
  renderPluginBanner();
  render();
}

// ── Plugin Banner ─────────────────────────────────────────────────────────────
function renderPluginBanner() {
  const sub = document.getElementById('plugin-banner-sub');
  if (pluginConfig.builtZip) {
    const match = pluginConfig.builtZip.match(/robos-(\d+\.\d+\.\d+)\.zip$/);
    const version = match ? `v${match[1]}` : '';
    sub.innerHTML = `RobOS Plugin ${escHtml(version)}`;
  } else {
    sub.innerHTML = `<span class="plugin-status-warn">⚠ Plugin package not found</span>`;
  }
}

// ── Render IDE grid ───────────────────────────────────────────────────────────
function render() {
  const groups = {};
  for (const ide of catalogue) {
    if (!groups[ide.category]) groups[ide.category] = [];
    groups[ide.category].push(ide);
  }

  const categoryOrder = ['AI Editors', 'Code Editors', 'JetBrains IDEs', 'Tools', 'CLI Tools', 'Cloud & Infrastructure'];
  const html = categoryOrder
    .filter(cat => groups[cat])
    .map(cat => `
      <div class="category-section">
        <div class="category-title">${escHtml(cat)}</div>
        <div class="ide-cards">
          ${groups[cat].map(ideCard).join('')}
        </div>
      </div>
    `).join('');

  document.getElementById('ide-grid').innerHTML = html;
}

function ideCard(ide) {
  const installed = ide.installed;
  const isJB = ide.isJetBrains;
  const pluginInstalled = isJB && pluginConfig.installStatus[ide.id];

  let pluginSection = '';
  if (isJB) {
    if (!installed) {
      pluginSection = `<div class="plugin-row plugin-na">🔌 RobOS Plugin: install ${escHtml(ide.name)} first</div>`;
    } else if (pluginInstalled) {
      pluginSection = `<div class="plugin-row plugin-installed">🔌 RobOS Plugin: <span class="plugin-ok">✓ Installed</span></div>`;
    } else {
      pluginSection = `<div class="plugin-row">🔌 RobOS Plugin: <span class="plugin-missing">not installed</span>
        <button class="ic-btn plugin-install" onclick="installPlugin('${ide.id}', '${escHtml(ide.name)}')">⬇ Install Plugin</button>
      </div>`;
    }
  }

  return `
    <div class="ide-card${installed ? ' installed' : ''}" id="card-${ide.id}">
      <div class="ic-header">
        <span class="ic-icon">${escHtml(ide.icon)}</span>
        <div class="ic-names">
          <div class="ic-name">${escHtml(ide.name)}</div>
          <div class="ic-vendor">${escHtml(ide.vendor)}</div>
          ${ide.version ? `<div class="ic-version">${escHtml(ide.version)}</div>` : ''}
        </div>
      </div>
      <div class="ic-desc">${escHtml(ide.description)}</div>
      ${ide.path ? `<div class="ic-path">📍 ${escHtml(ide.path)}</div>` : ''}
      ${pluginSection}
      ${ide.runningCount > 0 ? `<div class="ic-running">● ${ide.runningCount} running process${ide.runningCount > 1 ? 'es' : ''}</div>` : ''}
      <div class="ic-actions">
        ${installed
          ? `<button class="ic-btn launch" onclick="launchIDE('${ide.id}')">🚀 Launch</button>
             ${ide.runningCount > 0 ? `<button class="ic-btn kill" onclick="killIDE('${ide.id}', '${escHtml(ide.name)}')">⛔ Kill All</button>` : ''}
             <button class="ic-btn uninstall" onclick="uninstallIDE('${ide.id}', '${escHtml(ide.name)}')">🗑 Uninstall</button>`
          : `<button class="ic-btn install" onclick="installIDE('${ide.id}', '${escHtml(ide.name)}')">⬇ Install</button>`
        }
        <button class="ic-btn website" onclick="openSite('${escHtml(ide.installUrl)}')" title="Open website">🌐</button>
      </div>
    </div>
  `;
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function launchIDE(ideId) {
  const r = await window.idm.launchIde({ ideId });
  if (!r.ok) alert('Failed to launch: ' + (r.error || ''));
}

async function installIDE(ideId, name) {
  const r = await window.idm.installIde({ ideId });
  if (!r.ok) {
    showModal(`Install ${name}`, `<p style="color:#f85149">Error: ${escHtml(r.error || 'Unknown error')}</p>`);
    return;
  }
  showModal(`Installing ${name}`, `
    <p>A terminal window should have opened to run the installation.</p>
    <p style="margin-top:8px;color:#e3b341">⚠ This may require your sudo password.</p>
    <p style="margin-top:8px">If no terminal appeared, <a href="#" onclick="window.idm.launchInstallScript('${escHtml(ideId)}');return false;" style="color:#58a6ff">click here to Launch Installer</a>.</p>
    <p style="margin-top:8px">After installation completes, <a href="#" onclick="closeModalAndRefresh();return false;" style="color:#58a6ff">click here to Refresh</a> to detect the new IDE.</p>
  `);
}

async function uninstallIDE(ideId, name) {
  showModal(`Uninstall ${name}`, `
    <p>A terminal window will open to uninstall <strong>${escHtml(name)}</strong>.</p>
    <p style="margin-top:8px;color:#e3b341">⚠ This will remove the IDE, its desktop shortcut, and taskbar entry.</p>
    <p style="margin-top:8px"><a href="#" onclick="proceedUninstall('${escHtml(ideId)}','${escHtml(name)}');return false;" style="color:#f85149">⚠ Yes, uninstall</a>
    &nbsp;&nbsp;<a href="#" onclick="document.getElementById('install-modal').classList.add('hidden');return false;" style="color:#58a6ff">Cancel</a></p>
  `);
}

async function proceedUninstall(ideId, name) {
  document.getElementById('install-modal').classList.add('hidden');
  const r = await window.idm.uninstallIde({ ideId });
  if (!r.ok) {
    showModal('Uninstall Error', `<p style="color:#f85149">${escHtml(r.error || 'Unknown error')}</p>`);
  } else {
    showModal(`Uninstalling ${name}`, `
      <p>A terminal window is running the uninstall script.</p>
      <p style="margin-top:8px"><a href="#" onclick="closeModalAndRefresh();return false;" style="color:#58a6ff">Click here to Refresh</a> after it completes.</p>
    `);
  }
}


async function killIDE(ideId, name) {
  const r = await window.idm.killIde({ ideId });
  if (!r.ok) {
    showModal('Kill Error', `<p style="color:#f85149">${escHtml(r.error || 'Unknown error')}</p>`);
  } else if (r.killed === 0) {
    showModal(name, `<p>No running processes found for ${escHtml(name)}.</p>`);
  } else {
    showModal(name, `<p>Sent SIGTERM to <strong>${r.killed}</strong> process${r.killed > 1 ? 'es' : ''}.</p>
      <p style="margin-top:8px;color:#8b949e">Processes should stop shortly.</p>`);
    // Refresh after a short delay to update running count
    setTimeout(load, 2000);
  }
}

async function installPlugin(ideId, name) {
  const r = await window.idm.installRobosPlugin({ ideId });
  if (!r.ok) {
    showModal('Plugin Install Error', `<p style="color:#f85149">${escHtml(r.error || 'Unknown error')}</p>`);
  } else {
    showModal(`Installing RobOS Plugin → ${name}`, `
      <p>A terminal window will install the plugin ZIP into ${name}.</p>
      <p style="margin-top:8px;color:#3fb950">After installation, <strong>restart ${name}</strong> to activate the plugin.</p>
      <p style="margin-top:8px"><a href="#" onclick="closeModalAndRefresh();return false;" style="color:#58a6ff">Click here to Refresh</a> to update the install status.</p>
    `);
  }
}

function openSite(url) {
  window.idm.openUrl({ url });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function showModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('install-modal').classList.remove('hidden');
}

document.getElementById('modal-close').addEventListener('click', () => {
  closeModalAndRefresh();
});

function closeModalAndRefresh() {
  document.getElementById('install-modal').classList.add('hidden');
  load();
}

document.getElementById('btn-refresh').addEventListener('click', load);

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
load();


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'ide-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
