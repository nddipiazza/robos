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

function showSetupAlert(res) {
  const box = document.getElementById('setup-alert-box');
  if (!box) return;
  if (!res || !res.blocked) {
    box.classList.add('hidden');
    return;
  }
  document.getElementById('setup-alert-title').textContent = res.setupTitle || 'TV Setup Step Required on Your Remote';
  document.getElementById('setup-alert-msg').textContent = res.setupMessage || '';
  const stepsEl = document.getElementById('setup-alert-steps');
  const steps = res.setupSteps || [];
  stepsEl.innerHTML = steps.map((s) => `<li>${esc(s)}</li>`).join('');
  box.classList.remove('hidden');
}

function renderAll() {
  document.getElementById('portal-url-text').textContent = state.portalUrl;
  document.getElementById('tv-count-badge').textContent = `${state.tvs.length} TV${state.tvs.length === 1 ? '' : 's'}`;
  document.getElementById('webos-timer-badge').textContent = `LG Auto-Renew: ${state.webosSessionRemainingHours}h left`;
  document.getElementById('last-remote-key-badge').textContent = state.lastRemoteKey || 'Remote Ready';

  renderPlatformSelectors();
  renderDevicesList();
  renderRemoteAndTiles();
  renderDashboardCastControls();
  renderAllChecklists();
  renderDevSteps();
  renderGeneratedPackages();
  renderPortalPreview();
}

function renderDashboardCastControls() {
  const dashSel = document.getElementById('select-tv-dashboard');
  const layoutSel = document.getElementById('select-tv-dashboard-layout');
  const statusEl = document.getElementById('tv-dashboard-cast-status');
  const pillEl = document.getElementById('dashboard-cast-pill');
  const urlCodeEl = document.getElementById('dashboard-cast-url-code');
  const embedEl = document.getElementById('tv-embedded-robos-dashboard');

  const dashboards = state.dashboards || [];
  const layouts = state.dashboardLayouts || [];
  const cast = state.activeDashboardCast;
  const activeDashId = cast?.dashboardId || state.activeDashboardResolved?.id || 'daily-engineering-ops';
  const activeLayoutId =
    cast?.layoutId ||
    state.activeDashboardResolved?.layout?.id ||
    state.activeDashboardResolved?.layoutId ||
    'mission-control-3col';

  if (dashSel && dashboards.length) {
    dashSel.innerHTML = dashboards
      .map(
        (d) =>
          `<option value="${esc(d.id)}"${d.id === activeDashId ? ' selected' : ''}>${esc(d.title)}</option>`
      )
      .join('');
  }

  if (layoutSel && layouts.length) {
    layoutSel.innerHTML = layouts
      .map(
        (l) =>
          `<option value="${esc(l.id)}"${l.id === activeLayoutId ? ' selected' : ''}>${esc(l.title)} (${esc(l.badge)})</option>`
      )
      .join('');
  }

  if (urlCodeEl) {
    urlCodeEl.textContent = state.dashboardCastUrl || `${state.portalUrl}/dashboard`;
  }

  if (statusEl) {
    if (cast && cast.active) {
      statusEl.innerHTML = `<span style="color:#6ee7b7;font-weight:650;">● Showing "${esc(cast.title)}"</span> on <strong>${esc(cast.tvName)}</strong> · Layout: <code>${esc(cast.layoutTitle || cast.layoutId)}</code>`;
    } else {
      statusEl.textContent = 'Select a RobOS Dashboard and layout above to display it on your Smart TV.';
    }
  }

  if (pillEl) {
    pillEl.textContent = cast && cast.active ? `Live on ${cast.tvName}` : 'Ready to Cast';
  }

  if (embedEl && state.activeDashboardResolved) {
    embedEl.dashboard = state.activeDashboardResolved;
  }
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
          <button type="button" class="btn btn-sm btn-primary" data-power-on-tv="${esc(tv.id)}" title="Turn TV On">On</button>
          <button type="button" class="btn btn-sm btn-danger" data-power-off-tv="${esc(tv.id)}" title="Turn TV Off">Off</button>
          <button type="button" class="btn btn-sm" data-sideload-tv="${esc(tv.id)}">Sideload App</button>
          <button type="button" class="btn btn-sm btn-danger" data-remove-tv="${esc(tv.id)}" title="Unpair TV">✕</button>
        </div>
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('[data-power-on-tv]').forEach((btn) => {
    btn.onclick = async () => {
      const res = await window.robosTv.sendRemoteKey({ tvId: btn.dataset.powerOnTv, key: 'POWER_ON' });
      state.lastRemoteKey = res.lastRemoteKey;
      renderAll();
      if (res.blocked) {
        showSetupAlert(res);
        showBanner(res.setupTitle || 'TV setup required', true);
      } else {
        showSetupAlert(null);
        showBanner(`Sent POWER_ON to ${res.targetTv}`);
      }
    };
  });

  listEl.querySelectorAll('[data-power-off-tv]').forEach((btn) => {
    btn.onclick = async () => {
      const res = await window.robosTv.sendRemoteKey({ tvId: btn.dataset.powerOffTv, key: 'POWER_OFF' });
      state.lastRemoteKey = res.lastRemoteKey;
      renderAll();
      if (res.blocked) {
        showSetupAlert(res);
        showBanner(res.setupTitle || 'TV setup required', true);
      } else {
        showSetupAlert(null);
        showBanner(`Sent POWER_OFF to ${res.targetTv}`);
      }
    };
  });

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

function renderAllChecklists() {
  const el = document.getElementById('all-platforms-checklists');
  if (!el) return;
  const platforms = state.platforms || [];
  el.innerHTML = platforms
    .map(
      (p) => `
      <div class="item-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="item-title" style="color:#67e8f9;">${esc(p.name)}</div>
          <code style="font-size:11.5px;color:#8b949e;">${esc(p.protocol)}</code>
        </div>
        ${(p.requiredPermissions || [])
          .map(
            (perm) => `
            <div style="background:#111827;border:1px solid #263248;border-radius:6px;padding:10px 12px;">
              <div style="font-weight:650;font-size:13px;color:#f8fafc;">${esc(perm.title)}</div>
              <div style="font-size:11.5px;color:#fca5a5;margin-top:2px;">If disabled: ${esc(perm.blockedSymptom)}</div>
              <ol style="margin:6px 0 0;padding-left:18px;font-size:12.5px;color:#e2e8f0;">
                ${(perm.steps || []).map((st) => `<li>${esc(st)}</li>`).join('')}
              </ol>
            </div>
          `
          )
          .join('')}
      </div>
    `
    )
    .join('');
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
      state.activeTileId = res.activeTileId || state.activeTileId;
      state.lastRemoteKey = res.lastRemoteKey || state.lastRemoteKey;
      renderAll();
      if (res.blocked) {
        showSetupAlert(res);
        showBanner(res.setupTitle || 'TV setup step required', true);
      } else if (res.ok) {
        showSetupAlert(null);
        showBanner(`Sent ${res.key} to ${res.targetTv} (Selected: ${res.activeTile?.title || 'OK'})`);
      }
    };
  });

  const dismissBtn = document.getElementById('btn-dismiss-setup-alert');
  if (dismissBtn) {
    dismissBtn.onclick = () => showSetupAlert(null);
  }

  async function verifyAndRefreshSelectedTv(showSuccessToast = true) {
    const tvId = document.getElementById('select-remote-target')?.value || state.tvs[0]?.id;
    const retryBtn = document.getElementById('btn-retry-setup-alert');
    if (retryBtn) retryBtn.textContent = 'Checking TV…';
    const diag = await window.robosTv.diagnoseReadiness(tvId);
    if (retryBtn) retryBtn.textContent = '↻ Refresh / Try Again';

    const out = document.getElementById('live-readiness-results');
    if (diag && diag.ok && out) {
      out.innerHTML = (diag.checks || [])
        .map(
          (c) => `
          <div class="item-row" style="margin-bottom:6px;border-color:${c.ready ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.6)'};">
            <div>
              <div class="item-title">
                <span class="dot ${c.ready ? 'online' : ''}" style="${c.ready ? '' : 'background:#ef4444;'}"></span>
                <span>${esc(c.title)}</span>
              </div>
              <div class="item-sub">Live TV Reported State: <code>${esc(c.currentValue)}</code></div>
              ${
                !c.ready
                  ? `<ol style="margin:6px 0 0;padding-left:18px;font-size:12px;color:#fecdd3;">${(c.fixSteps || [])
                      .map((s) => `<li>${esc(s)}</li>`)
                      .join('')}</ol>`
                  : ''
              }
            </div>
            <span class="badge ${c.ready ? 'badge-green' : ''}" style="${c.ready ? '' : 'color:#fca5a5;border-color:#ef4444;'}">
              ${c.ready ? 'READY' : 'ACTION NEEDED'}
            </span>
          </div>
        `
        )
        .join('');
    }

    if (diag && diag.ok && !diag.allControlReady) {
      const blockedCheck = (diag.checks || []).find((c) => !c.ready);
      if (blockedCheck) {
        showSetupAlert({
          blocked: true,
          setupTitle: `TV Setup Required on ${diag.tv.name} (${diag.tv.ip}) — ${blockedCheck.title} is Blocked`,
          setupMessage: `Your ${diag.tv.name} returned ${blockedCheck.currentValue} (HTTP ${diag.liveInfo?.httpStatus || 401} Unauthorized). Follow these steps on your physical TV remote, then click "↻ Refresh / Try Again":`,
          setupSteps: blockedCheck.fixSteps || [],
        });
        if (showSuccessToast) {
          showBanner(`Still blocked on ${diag.tv.name}: ${blockedCheck.currentValue}`, true);
        }
      }
      return false;
    }

    showSetupAlert(null);
    if (showSuccessToast && diag?.tv) {
      showBanner(`Connected! ${diag.tv.name} (${diag.tv.ip}) is ready for RobOS remote control (${diag.liveInfo?.powerMode || 'Online'}).`);
    }
    return true;
  }

  const retryAlertBtn = document.getElementById('btn-retry-setup-alert');
  if (retryAlertBtn) {
    retryAlertBtn.onclick = () => verifyAndRefreshSelectedTv(true);
  }

  const refreshStatusBtn = document.getElementById('btn-refresh-tv-status');
  if (refreshStatusBtn) {
    refreshStatusBtn.onclick = () => verifyAndRefreshSelectedTv(true);
  }

  const checkBtn = document.getElementById('btn-run-readiness-check');
  if (checkBtn) {
    checkBtn.onclick = () => verifyAndRefreshSelectedTv(true);
  }

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

  const showDashBtn = document.getElementById('btn-show-dashboard-tv');
  if (showDashBtn) {
    showDashBtn.onclick = async () => {
      const tvId = document.getElementById('select-remote-target')?.value;
      const dashboardId = document.getElementById('select-tv-dashboard')?.value || 'daily-engineering-ops';
      const layoutId = document.getElementById('select-tv-dashboard-layout')?.value;
      const res = await window.robosTv.castDashboard({ tvId, dashboardId, layoutId });
      const fresh = await window.robosTv.getOverview();
      if (fresh && fresh.ok) state = { ...state, ...fresh };
      renderAll();
      if (res && (res.blocked || res.sideloadRequired)) {
        showSetupAlert({ ...res, blocked: true });
        showBanner(res.message || res.setupTitle || 'TV setup required', true);
      } else if (res && res.ok) {
        showSetupAlert(null);
        showBanner(res.message);
      }
    };
  }

  const openDashBtn = document.getElementById('btn-open-dashboard-tv');
  if (openDashBtn) {
    openDashBtn.onclick = async () => {
      const res = await window.robosTv.openDashboardExternal();
      if (res && res.ok) {
        showBanner(`Opened Smart TV Dashboard Wallboard at ${res.dashboardCastUrl}`);
      }
    };
  }

  const stopDashBtn = document.getElementById('btn-stop-dashboard-tv');
  if (stopDashBtn) {
    stopDashBtn.onclick = async () => {
      const tvId = document.getElementById('select-remote-target')?.value;
      const res = await window.robosTv.stopDashboardCast({ tvId });
      const fresh = await window.robosTv.getOverview();
      if (fresh && fresh.ok) state = { ...state, ...fresh };
      renderAll();
      if (res && res.ok) {
        showBanner(res.message);
      }
    };
  }

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
    await verifyAndRefreshSelectedTv(false);
  }
}

init();
