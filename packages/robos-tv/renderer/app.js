'use strict';

let state = {
  hostIp: '192.168.1.100',
  portalPort: 19210,
  portalUrl: 'http://192.168.1.100:19210',
  activeTileId: 'portal-home',
  webosSessionRemainingHours: 998,
  lastRemoteKey: null,
  platforms: [],
  tiles: [],
  tvs: [],
  generatedPackages: [],
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showBanner(msg, isError = false) {
  const el = document.getElementById('status-banner');
  el.textContent = msg;
  el.className = 'banner' + (isError ? ' error' : '');
  clearTimeout(window._bannerTimer);
  window._bannerTimer = setTimeout(() => el.classList.add('hidden'), 6000);
}

function renderAll() {
  document.getElementById('portal-url-text').textContent = state.portalUrl;
  document.getElementById('tv-count-badge').textContent = `${state.tvs.length} TV${state.tvs.length === 1 ? '' : 's'}`;
  document.getElementById('webos-timer-badge').textContent = `LG Auto-Renew: ${state.webosSessionRemainingHours}h left`;
  document.getElementById('last-remote-key-badge').textContent = state.lastRemoteKey || 'Remote Ready';

  renderPlatformSelectors();
  renderDevicesList();
  renderRemoteAndTiles();
  renderDevSteps();
  renderGeneratedPackages();
  renderPortalPreview();
}

function renderPlatformSelectors() {
  const addSel = document.getElementById('select-tv-platform');
  const buildSel = document.getElementById('select-builder-platform');
  const platforms = state.platforms || [];

  if (addSel && addSel.options.length !== platforms.length) {
    addSel.innerHTML = platforms
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join('');
  }
  if (buildSel && buildSel.options.length !== platforms.length) {
    buildSel.innerHTML = platforms
      .map((p) => `<option value="${esc(p.id)}"${p.id === 'lg-webos' ? ' selected' : ''}>${esc(p.name)} — ${esc(p.packageFormat)}</option>`)
      .join('');
    buildSel.onchange = () => renderDevSteps();
  }
}

function renderDevicesList() {
  const listEl = document.getElementById('tv-devices-list');
  const remoteSel = document.getElementById('select-remote-target');
  const tvs = state.tvs || [];

  const curTarget = remoteSel.value;
  remoteSel.innerHTML = tvs
    .map((t) => `<option value="${esc(t.id)}"${t.id === curTarget ? ' selected' : ''}>${esc(t.name)} (${esc(t.ip)})</option>`)
    .join('');

  if (!tvs.length) {
    listEl.innerHTML = `<div class="item-row"><div class="item-sub">No Smart TVs paired yet. Add your TV IP below.</div></div>`;
    return;
  }

  listEl.innerHTML = tvs
    .map(
      (tv) => `
      <div class="item-row" data-tv-id="${esc(tv.id)}">
        <div>
          <div class="item-title">
            <span class="dot ${tv.online !== false ? 'online' : ''}"></span>
            <span>${esc(tv.name)}</span>
            <code style="font-size:11.5px;color:#94a3b8;">${esc(tv.ip)}</code>
          </div>
          <div class="item-sub">${esc(tv.model)} · ${esc(tv.platformName)}</div>
          <div class="item-meta">Developer Mode: ${tv.devModeEnabled ? 'Enabled' : 'Off'} · ${esc(tv.sideloadStatus)}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn btn-sm" data-sideload-tv="${esc(tv.id)}">Sideload App</button>
          <button type="button" class="btn btn-sm btn-danger" data-remove-tv="${esc(tv.id)}" title="Unpair TV">✕</button>
        </div>
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('[data-sideload-tv]').forEach((btn) => {
    btn.onclick = async () => {
      const tv = tvs.find((t) => t.id === btn.dataset.sideloadTv);
      if (!tv) return;
      const res = await window.robosTv.buildPackage({
        tvId: tv.id,
        platformId: tv.platformId,
        tvIp: tv.ip,
      });
      if (res.ok) {
        state.tvs = res.tvs;
        state.generatedPackages = res.generatedPackages;
        renderAll();
        showBanner(`Built & staged ${tv.platformName} sideload bundle for ${tv.name} (${tv.ip}) → ${res.targetDir}`);
      }
    };
  });

  listEl.querySelectorAll('[data-remove-tv]').forEach((btn) => {
    btn.onclick = async () => {
      const res = await window.robosTv.removeTv(btn.dataset.removeTv);
      if (res.ok) {
        state.tvs = res.tvs;
        renderAll();
      }
    };
  });
}

function renderRemoteAndTiles() {
  const tiles = state.tiles || [];
  const active = tiles.find((t) => t.id === state.activeTileId) || tiles[0];
  const summaryEl = document.getElementById('active-tile-summary');
  if (active && summaryEl) {
    summaryEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${esc(active.title)}</strong>
        <span class="badge">${esc(active.badge)}</span>
      </div>
      <div class="item-sub" style="margin-top:4px;">${esc(active.description)}</div>
    `;
  }

  const gridEl = document.getElementById('quick-tiles-list');
  if (!gridEl) return;
  gridEl.innerHTML = tiles
    .map(
      (t) => `
      <button type="button" class="quick-tile-btn ${t.id === state.activeTileId ? 'active' : ''}" data-launch-tile="${esc(t.id)}">
        <div style="font-weight:650;font-size:12.5px;">${esc(t.title)}</div>
        <div style="font-size:11px;color:#8b949e;">${esc(t.category)} · ${esc(t.badge)}</div>
      </button>
    `
    )
    .join('');

  gridEl.querySelectorAll('[data-launch-tile]').forEach((btn) => {
    btn.onclick = async () => {
      const tvId = document.getElementById('select-remote-target').value;
      const res = await window.robosTv.launchTile({
        tileId: btn.dataset.launchTile,
        tvId,
      });
      if (res.ok) {
        state.activeTileId = res.tile.id;
        state.lastRemoteKey = `LAUNCH ${res.tile.title}`;
        renderAll();
        showBanner(res.message);
      }
    };
  });
}

function renderDevSteps() {
  const buildSel = document.getElementById('select-builder-platform');
  const box = document.getElementById('platform-dev-steps');
  if (!buildSel || !box) return;
  const p = (state.platforms || []).find((x) => x.id === buildSel.value) || state.platforms?.[0];
  if (!p) return;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <strong style="color:#67e8f9;">${esc(p.name)} Developer Mode Setup</strong>
      <code style="font-size:11.5px;color:#8b949e;">${esc(p.protocol)}</code>
    </div>
    <ol>
      ${(p.devModeSteps || []).map((step) => `<li>${esc(step)}</li>`).join('')}
    </ol>
  `;
}

function renderGeneratedPackages() {
  const el = document.getElementById('generated-packages-list');
  const pkgs = state.generatedPackages || [];
  if (!pkgs.length) {
    el.innerHTML = `
      <div class="item-row">
        <div>
          <div class="item-title">Ready to Generate Sideload Bundle</div>
          <div class="item-sub">Select your TV OS (LG webOS, Samsung Tizen, Google TV/ADB, or Roku) and click "Generate TV Sideload Package".</div>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = pkgs
    .map(
      (pkg) => `
      <div class="item-row" style="flex-direction:column;align-items:stretch;" data-pkg-platform="${esc(pkg.platformId)}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="item-title">${esc(pkg.platformId.toUpperCase())} Sideload Package → ${esc(pkg.tvIp)}</div>
          <span class="badge badge-green">${esc(pkg.filesCreated.length)} files written</span>
        </div>
        <div class="item-sub">${esc(pkg.summary)}</div>
        <div class="code-block">${esc(pkg.installCommand)}</div>
      </div>
    `
    )
    .join('');
}

function renderPortalPreview() {
  const el = document.getElementById('portal-preview-cards');
  if (!el) return;
  const tiles = state.tiles || [];
  el.innerHTML = tiles
    .map(
      (t) => `
      <div class="portal-card ${t.id === state.activeTileId ? 'focused' : ''}" data-preview-tile="${esc(t.id)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="sub-label" style="margin:0;color:#00bcd4;">${esc(t.category)}</span>
          <span class="badge">${esc(t.badge)}</span>
        </div>
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${esc(t.title)}</div>
        <div style="font-size:12px;color:#8b949e;">${esc(t.description)}</div>
      </div>
    `
    )
    .join('');

  el.querySelectorAll('[data-preview-tile]').forEach((card) => {
    card.onclick = async () => {
      const res = await window.robosTv.launchTile({ tileId: card.dataset.previewTile });
      if (res.ok) {
        state.activeTileId = res.tile.id;
        renderAll();
      }
    };
  });
}

async function init() {
  // Wire up tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(btn.dataset.tab);
      if (pane) pane.classList.add('active');
    };
  });

  // Wire up D-Pad buttons
  document.querySelectorAll('[data-rkey]').forEach((btn) => {
    btn.onclick = async () => {
      const tvId = document.getElementById('select-remote-target').value;
      const res = await window.robosTv.sendRemoteKey({
        tvId,
        key: btn.dataset.rkey,
      });
      if (res.ok) {
        state.activeTileId = res.activeTileId;
        state.lastRemoteKey = res.lastRemoteKey;
        renderAll();
        showBanner(`Sent ${res.key} to ${res.targetTv} (Selected: ${res.activeTile.title})`);
      }
    };
  });

  document.getElementById('btn-scan-tvs').onclick = async () => {
    const res = await window.robosTv.scanLan();
    if (res.ok) {
      state.tvs = res.tvs;
      renderAll();
      showBanner(`Scanned LAN subnet — ${state.tvs.length} Smart TVs online and reachable.`);
    }
  };

  document.getElementById('btn-open-portal').onclick = async () => {
    const res = await window.robosTv.openPortalExternal();
    if (res.ok) {
      showBanner(`Opened 10-Foot Smart TV Portal at ${res.portalUrl}`);
    }
  };

  document.getElementById('btn-add-tv').onclick = async () => {
    const name = document.getElementById('input-tv-name').value.trim();
    const ip = document.getElementById('input-tv-ip').value.trim();
    const platformId = document.getElementById('select-tv-platform').value;
    if (!ip) {
      showBanner('Please enter your Smart TV LAN IP address (e.g. 192.168.1.85).', true);
      return;
    }
    const res = await window.robosTv.addOrUpdateTv({ name, ip, platformId });
    if (!res.ok) {
      showBanner(res.error || 'Failed to pair TV', true);
      return;
    }
    state.tvs = res.tvs;
    document.getElementById('input-tv-name').value = '';
    document.getElementById('input-tv-ip').value = '';
    renderAll();
    showBanner(`Paired "${res.tv.name}" (${res.tv.ip}) via ${res.tv.platformName}.`);
  };

  document.getElementById('btn-build-package').onclick = async () => {
    const platformId = document.getElementById('select-builder-platform').value;
    const tvIp = document.getElementById('input-builder-tv-ip').value.trim() || '192.168.1.64';
    const webosPassphrase = document.getElementById('input-builder-passphrase').value.trim();
    const res = await window.robosTv.buildPackage({
      platformId,
      tvIp,
      webosPassphrase,
    });
    if (!res.ok) {
      showBanner(res.error || 'Failed to generate TV sideload bundle', true);
      return;
    }
    state.tvs = res.tvs;
    state.generatedPackages = res.generatedPackages;
    renderAll();
    showBanner(res.summary);
  };

  document.getElementById('btn-renew-webos').onclick = async () => {
    const res = await window.robosTv.renewWebos();
    if (res.ok) {
      state.webosSessionRemainingHours = res.remainingHours;
      state.tvs = res.tvs;
      renderAll();
      showBanner(`Extended LG webOS Developer Mode session to ${res.remainingHours} hours (ares-extend-dev).`);
    }
  };

  const initial = await window.robosTv.getOverview();
  if (initial && initial.ok) {
    state = { ...state, ...initial };
    renderAll();
  }
}

init();
