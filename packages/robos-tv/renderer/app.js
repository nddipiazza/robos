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
  tabloIp: '192.168.1.55',
  tabloPort: 8887,
  tabloStatus: null,
  tabloRecordings: [],
  tabloChannels: [],
  tabloFilter: 'all',
  tabloCurrentItem: null,
  tabloBaseSeekSec: 0,
};

function formatHms(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

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

  renderTabloSection();
  renderPlatformSelectors();
  renderDevicesList();
  renderRemoteAndTiles();
  renderDashboardCastControls();
  renderAllChecklists();
  renderDevSteps();
  renderGeneratedPackages();
  renderPortalPreview();
}

function renderTabloSection() {
  const ipInput = document.getElementById('input-tablo-ip');
  if (ipInput && document.activeElement !== ipInput && state.tabloIp) {
    ipInput.value = state.tabloIp;
  }

  const st = state.tabloStatus;
  const dot = document.getElementById('tablo-status-dot');
  const titleEl = document.getElementById('tablo-device-title');
  const sidEl = document.getElementById('tablo-sid-badge');
  const driveEl = document.getElementById('tablo-drive-badge');
  const tunersEl = document.getElementById('tablo-tuners-badge');
  const metaEl = document.getElementById('tablo-device-meta');

  if (st && st.online) {
    if (dot) dot.className = 'dot online';
    const modelName = st.model?.name || 'Tablo 4th Gen DVR';
    if (titleEl) titleEl.textContent = `${modelName} (${st.ip}:${st.port})`;
    if (sidEl) sidEl.textContent = st.serverId || 'Connected';
    const hd = Array.isArray(st.harddrives) && st.harddrives[0];
    if (driveEl) {
      if (hd) {
        const usedGb = Math.round((hd.usage || 0) / (1024 * 1024 * 1024));
        const freeGb = Math.round((hd.free || 0) / (1024 * 1024 * 1024));
        driveEl.textContent = `${hd.name || 'External Drive'} · ${usedGb} GB used / ${freeGb} GB free`;
      } else {
        driveEl.textContent = 'Internal Storage Ready';
      }
    }
    const tuners = Array.isArray(st.tuners) ? st.tuners : [];
    const busyCount = tuners.filter((t) => t && t.in_use).length;
    if (tunersEl) {
      tunersEl.textContent = `${tuners.length || st.model?.tuners || 2} OTA Tuners (${busyCount} in use)`;
    }
    if (metaEl) {
      metaEl.innerHTML = `Firmware <code>v${esc(st.version)}</code> (build ${esc(st.buildNumber)}) · Status: <strong style="color:#86efac;">${esc(st.availability)}</strong> · ${state.tabloRecordings.length} Recordings Ready to Play`;
    }
  } else if (st && !st.online) {
    if (dot) dot.className = 'dot warning';
    if (metaEl) metaEl.textContent = `Could not reach Tablo at ${state.tabloIp}:${state.tabloPort} — ${st.error || 'Offline'}`;
  }

  // Update filter buttons
  const filterBar = document.getElementById('tablo-filter-bar');
  if (filterBar) {
    const allCount = state.tabloRecordings.length;
    const sportsCount = state.tabloRecordings.filter((r) => r.kind === 'sports').length;
    const seriesCount = state.tabloRecordings.filter((r) => r.kind !== 'sports').length;
    const chCount = state.tabloChannels.length;

    filterBar.querySelectorAll('[data-tablo-filter]').forEach((btn) => {
      const f = btn.dataset.tabloFilter;
      btn.className = 'btn btn-sm' + (f === state.tabloFilter ? ' btn-primary' : '');
      if (f === 'all') btn.textContent = `All Recordings (${allCount})`;
      else if (f === 'sports') btn.textContent = `🏈 Sports (${sportsCount})`;
      else if (f === 'series') btn.textContent = `📺 Shows & News (${seriesCount})`;
      else if (f === 'channels') btn.textContent = `📡 Live OTA (${chCount || 55})`;
    });
  }

  renderTabloList();
}

function renderTabloList() {
  const listEl = document.getElementById('tablo-recordings-list');
  if (!listEl) return;

  if (state.tabloFilter === 'channels') {
    const chs = state.tabloChannels || [];
    if (!chs.length) {
      listEl.innerHTML = `<div class="item-row"><div class="item-sub">Loading live OTA channels from Tablo (${esc(state.tabloIp)})…</div></div>`;
      return;
    }
    listEl.innerHTML = chs
      .map(
        (ch, idx) => `
        <div class="tablo-rec-row ${state.tabloCurrentItem && state.tabloCurrentItem.path === ch.path ? 'active' : ''}" data-tablo-ch-idx="${idx}">
          ${
            ch.logoUrl
              ? `<img class="tablo-rec-thumb" style="object-fit:contain;padding:6px;" src="${esc(ch.logoUrl)}" alt="" onerror="this.style.display='none'" />`
              : ''
          }
          <div class="tablo-rec-body">
            <div class="item-title">
              <span class="badge">${esc(ch.number)}</span>
              <span>${esc(ch.callSign)}</span>
              ${ch.network ? `<span style="color:#67e8f9;font-size:12px;">(${esc(ch.network)})</span>` : ''}
            </div>
            <div class="item-sub">${esc(ch.resolution)} · Live Over-The-Air Antenna Stream</div>
          </div>
          <button type="button" class="btn btn-sm btn-primary">▶ Watch Live</button>
        </div>
      `
      )
      .join('');

    listEl.querySelectorAll('[data-tablo-ch-idx]').forEach((row) => {
      row.onclick = () => {
        const ch = chs[Number(row.dataset.tabloChIdx)];
        if (ch) playTabloItem({ ...ch, isChannel: true, fullTitle: `Live OTA ${ch.number} ${ch.callSign} (${ch.network || 'Antenna'})`, durationSec: 0 }, 0);
      };
    });
    return;
  }

  let recs = state.tabloRecordings || [];
  if (state.tabloFilter === 'sports') recs = recs.filter((r) => r.kind === 'sports');
  else if (state.tabloFilter === 'series') recs = recs.filter((r) => r.kind !== 'sports');

  if (!recs.length) {
    listEl.innerHTML = `<div class="item-row"><div class="item-sub">No recordings found in this category. Click "↻ Refresh Recordings".</div></div>`;
    return;
  }

  listEl.innerHTML = recs
    .map((r, idx) => {
      const airDateStr = r.airDate ? new Date(r.airDate).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      const isSelected = state.tabloCurrentItem && state.tabloCurrentItem.path === r.path;
      return `
        <div class="tablo-rec-row ${isSelected ? 'active' : ''}" data-tablo-rec-idx="${idx}">
          ${
            r.imageUrl
              ? `<img class="tablo-rec-thumb" src="${esc(r.imageUrl)}" alt="" onerror="this.style.display='none'" />`
              : `<div class="tablo-rec-thumb" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:#67e8f9;">DVR</div>`
          }
          <div class="tablo-rec-body">
            <div class="item-title" style="flex-wrap:wrap;gap:6px;">
              <span>${esc(r.fullTitle)}</span>
              ${r.watched ? `<span class="badge badge-green" style="font-size:10.5px;padding:1px 6px;">Watched</span>` : ''}
            </div>
            <div class="item-meta">
              ${esc(r.channel?.label || '')} · ${esc(r.durationFormatted)} · ${esc(r.sizeFormatted)} · ${esc(r.resolution)}
            </div>
            <div class="item-sub">${esc(airDateStr)}</div>
            ${r.description ? `<div class="tablo-rec-desc">${esc(r.description)}</div>` : ''}
          </div>
          <button type="button" class="btn btn-sm btn-primary" style="flex-shrink:0;">▶ Play</button>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('[data-tablo-rec-idx]').forEach((row) => {
    row.onclick = () => {
      const rec = recs[Number(row.dataset.tabloRecIdx)];
      if (rec) playTabloItem(rec, 0);
    };
  });
}

function playTabloItem(item, seekSec = 0) {
  if (!item) return;
  const dur = Number(item.durationSec || 0);
  const clampedSeek = dur > 0 ? Math.max(0, Math.min(dur - 5, Math.floor(seekSec || 0))) : Math.max(0, Math.floor(seekSec || 0));
  state.tabloCurrentItem = item;
  state.tabloBaseSeekSec = clampedSeek;

  const titleEl = document.getElementById('tablo-now-playing-title');
  const metaEl = document.getElementById('tablo-now-playing-meta');
  const descEl = document.getElementById('tablo-now-playing-desc');
  const badgeEl = document.getElementById('tablo-now-playing-badge');
  const slider = document.getElementById('tablo-seek-slider');
  const totalTimeEl = document.getElementById('tablo-time-total');
  const curTimeEl = document.getElementById('tablo-time-current');
  const videoEl = document.getElementById('tablo-video-player');

  if (titleEl) titleEl.textContent = item.fullTitle || item.title;
  if (metaEl) {
    const airDateStr = item.airDate ? new Date(item.airDate).toLocaleString() : '';
    metaEl.textContent = [item.channel?.label, item.durationFormatted, item.sizeFormatted, item.resolution, airDateStr].filter(Boolean).join(' · ');
  }
  if (descEl) descEl.textContent = item.description || '';
  if (badgeEl) badgeEl.textContent = item.isChannel ? 'LIVE OTA STREAM' : `${item.resolution || 'HD'} DVR`;

  if (slider) {
    slider.max = String(Math.max(100, dur || 3600));
    slider.value = String(clampedSeek);
    slider.disabled = Boolean(item.isChannel);
  }
  if (totalTimeEl) totalTimeEl.textContent = dur > 0 ? formatHms(dur) : 'LIVE';
  if (curTimeEl) curTimeEl.textContent = formatHms(clampedSeek);

  if (videoEl && item.streamUrl) {
    const sep = item.streamUrl.includes('?') ? '&' : '?';
    videoEl.src = `${item.streamUrl}${sep}seek=${clampedSeek}&_t=${Date.now()}`;
    videoEl.play().catch(() => {});
  }

  renderTabloList();
}

async function loadTabloData(autoSelectFirst = false) {
  if (typeof window.robosTv?.getTabloOverview !== 'function') return;
  const ipInput = document.getElementById('input-tablo-ip');
  const ip = (ipInput && ipInput.value.trim()) || state.tabloIp || '192.168.1.55';
  const res = await window.robosTv.getTabloOverview({ ip });
  if (res) {
    state.tabloIp = res.ip || ip;
    state.tabloPort = res.port || 8887;
    state.tabloStatus = res.status || { online: false, error: res.error };
    state.tabloRecordings = res.recordings || [];
    renderTabloSection();
    if (autoSelectFirst && state.tabloRecordings.length > 0 && !state.tabloCurrentItem) {
      // Populate player metadata with the latest recording without auto-blasting audio until clicked, or select it
      const first = state.tabloRecordings[0];
      state.tabloCurrentItem = first;
      document.getElementById('tablo-now-playing-title').textContent = first.fullTitle;
      document.getElementById('tablo-now-playing-meta').textContent = [first.channel?.label, first.durationFormatted, first.sizeFormatted, first.resolution].filter(Boolean).join(' · ');
      document.getElementById('tablo-now-playing-desc').textContent = first.description || '';
      document.getElementById('tablo-time-total').textContent = formatHms(first.durationSec || 0);
      const slider = document.getElementById('tablo-seek-slider');
      if (slider) slider.max = String(Math.max(100, first.durationSec || 3600));
      renderTabloList();
    }
  }
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

function describePortalOwner(o) {
  if (o.legacy) return 'an older RobOS build that does not report its owner';
  if (o.foreign) return 'a process that is not a RobOS TV portal';
  if (!o.owner) return 'another process';
  const kind = o.robosApp ? o.owner.appName : `${o.owner.appName} (not a RobOS app)`;
  return `${kind}, pid ${o.owner.pid}`;
}

function renderPortalOwnership(o) {
  const box = document.getElementById('portal-owner-alert');
  const dot = document.getElementById('portal-owner-dot');
  const blocked = Boolean(o && o.ok && !o.serving && o.reachable);
  if (dot) dot.className = 'dot ' + (blocked ? 'warning' : 'online');
  if (!box) return;
  if (!blocked) {
    box.classList.add('hidden');
    return;
  }
  const versionNote = o.owner
    ? o.sameVersion
      ? 'It runs the same portal code as this app.'
      : `It runs portal code ${o.owner.codeVersion}; this app has ${o.self.codeVersion}.`
    : 'Its portal code version is unknown, so new portal features may be missing.';
  document.getElementById('portal-owner-title').textContent = o.stale
    ? 'Smart TV Studio is not serving the TV portal (stale server)'
    : 'Smart TV Studio is not serving the TV portal';
  document.getElementById('portal-owner-msg').textContent =
    `Port ${o.port} is held by ${describePortalOwner(o)}. ${versionNote} ` +
    (o.canRestart
      ? 'Restart the portal to serve it from Smart TV Studio.'
      : 'That process cannot be asked to hand the port over; quit it, then restart the portal.');
  document.getElementById('portal-owner-detail').textContent = o.listener
    ? `Listening: pid ${o.listener.pid} ${o.listener.command || ''}`
    : '';
  box.classList.remove('hidden');
}

async function refreshPortalOwnership() {
  try {
    const o = await window.robosTv.getPortalOwnership();
    state.portalOwnership = o;
    renderPortalOwnership(o);
    return o;
  } catch {
    return null;
  }
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

  const restartPortalBtn = document.getElementById('btn-restart-portal');
  restartPortalBtn.onclick = async () => {
    restartPortalBtn.disabled = true;
    restartPortalBtn.textContent = 'Restarting...';
    try {
      const res = await window.robosTv.restartPortal();
      if (res && res.ok) {
        const prev = res.previousOwner ? ` (took over from ${res.previousOwner.appName}, pid ${res.previousOwner.pid})` : '';
        showBanner(`Smart TV Studio now serves the TV portal on :${res.port}${prev}.`);
      } else {
        showBanner((res && res.error) || 'Could not restart the TV portal', true);
      }
    } finally {
      restartPortalBtn.disabled = false;
      restartPortalBtn.textContent = 'Restart TV portal';
      await refreshPortalOwnership();
    }
  };
  window.robosTv.onPortalChanged?.(() => refreshPortalOwnership());
  setInterval(refreshPortalOwnership, 5000);
  refreshPortalOwnership();

  const initial = await window.robosTv.getOverview();
  if (initial && initial.ok) {
    state = { ...state, ...initial };
    renderAll();
    await verifyAndRefreshSelectedTv(false);
  }

  // Wire up Tablo DVR & Live OTA TV controls
  const tabloRefreshBtn = document.getElementById('btn-tablo-refresh');
  if (tabloRefreshBtn) {
    tabloRefreshBtn.onclick = async () => {
      tabloRefreshBtn.textContent = 'Refreshing…';
      await loadTabloData(false);
      tabloRefreshBtn.textContent = '↻ Refresh Recordings';
      showBanner(`Loaded ${state.tabloRecordings.length} recordings from Tablo (${state.tabloIp})`);
    };
  }

  const tabloChannelsBtn = document.getElementById('btn-tablo-load-channels');
  if (tabloChannelsBtn) {
    tabloChannelsBtn.onclick = async () => {
      state.tabloFilter = 'channels';
      renderTabloSection();
      if (!state.tabloChannels.length && typeof window.robosTv?.getTabloChannels === 'function') {
        const chRes = await window.robosTv.getTabloChannels({ ip: state.tabloIp });
        if (chRes && chRes.ok) {
          state.tabloChannels = chRes.channels || [];
        }
      }
      renderTabloSection();
      showBanner(`Loaded ${state.tabloChannels.length} live OTA antenna channels from Tablo`);
    };
  }

  const filterBar = document.getElementById('tablo-filter-bar');
  if (filterBar) {
    filterBar.querySelectorAll('[data-tablo-filter]').forEach((btn) => {
      btn.onclick = async () => {
        const f = btn.dataset.tabloFilter;
        state.tabloFilter = f;
        renderTabloSection();
        if (f === 'channels' && !state.tabloChannels.length && typeof window.robosTv?.getTabloChannels === 'function') {
          const chRes = await window.robosTv.getTabloChannels({ ip: state.tabloIp });
          if (chRes && chRes.ok) {
            state.tabloChannels = chRes.channels || [];
            renderTabloSection();
          }
        }
      };
    });
  }

  const videoEl = document.getElementById('tablo-video-player');
  const seekSlider = document.getElementById('tablo-seek-slider');
  const curTimeEl = document.getElementById('tablo-time-current');

  if (videoEl) {
    videoEl.addEventListener('timeupdate', () => {
      if (!state.tabloCurrentItem) return;
      const actualSec = state.tabloBaseSeekSec + Math.floor(videoEl.currentTime || 0);
      if (curTimeEl) curTimeEl.textContent = formatHms(actualSec);
      if (seekSlider && document.activeElement !== seekSlider) {
        seekSlider.value = String(actualSec);
      }
    });
  }

  if (seekSlider) {
    seekSlider.addEventListener('input', () => {
      if (curTimeEl) curTimeEl.textContent = formatHms(Number(seekSlider.value || 0));
    });
    seekSlider.addEventListener('change', () => {
      if (!state.tabloCurrentItem) return;
      playTabloItem(state.tabloCurrentItem, Number(seekSlider.value || 0));
    });
  }

  const jumpSeek = (deltaSec) => {
    if (!state.tabloCurrentItem) {
      if (state.tabloRecordings[0]) playTabloItem(state.tabloRecordings[0], 0);
      return;
    }
    const cur = state.tabloBaseSeekSec + Math.floor(videoEl?.currentTime || 0);
    playTabloItem(state.tabloCurrentItem, Math.max(0, cur + deltaSec));
  };

  const restartBtn = document.getElementById('btn-tablo-Restart');
  if (restartBtn) restartBtn.onclick = () => state.tabloCurrentItem && playTabloItem(state.tabloCurrentItem, 0);
  const back30Btn = document.getElementById('btn-tablo-back-30');
  if (back30Btn) back30Btn.onclick = () => jumpSeek(-30);
  const back15Btn = document.getElementById('btn-tablo-back-15');
  if (back15Btn) back15Btn.onclick = () => jumpSeek(-15);
  const fwd30Btn = document.getElementById('btn-tablo-fwd-30');
  if (fwd30Btn) fwd30Btn.onclick = () => jumpSeek(30);
  const fwd120Btn = document.getElementById('btn-tablo-fwd-120');
  if (fwd120Btn) fwd120Btn.onclick = () => jumpSeek(120);
  const fwd300Btn = document.getElementById('btn-tablo-fwd-300');
  if (fwd300Btn) fwd300Btn.onclick = () => jumpSeek(300);

  const extBtn = document.getElementById('btn-tablo-external');
  if (extBtn) {
    extBtn.onclick = async () => {
      const target = state.tabloCurrentItem || state.tabloRecordings[0];
      if (!target) return;
      const res = await window.robosTv.openTabloExternal({
        ip: state.tabloIp,
        itemPath: target.path,
        title: target.fullTitle || target.title,
      });
      if (res && res.ok) {
        showBanner(res.message);
      } else {
        showBanner((res && res.error) || 'Could not open external player', true);
      }
    };
  }

  await loadTabloData(true);
}

init();
