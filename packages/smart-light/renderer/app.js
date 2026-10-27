'use strict';

let currentOverview = null;
let selectedRoomId = 'all';

const QUICK_SWATCHES = ['#00bcd4', '#3b82f6', '#7c3aed', '#ec4899', '#22c55e', '#f97316', '#eab308', '#ef4444'];

function esc(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showBanner(msg) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.remove('hidden');
}

function getFixtureIcon(formFactor) {
  switch (formFactor) {
    case 'strip':
      return '🌈';
    case 'bar':
      return '💈';
    case 'panel':
      return '🔆';
    case 'lamp':
      return '🛋️';
    case 'pendant':
      return '🏮';
    default:
      return '💡';
  }
}

function renderAll(overview) {
  if (!overview) return;
  currentOverview = overview;

  // Header KPIs
  const m = overview.metrics || { activeLights: 0, totalLights: 0, avgBrightness: 0, estimatedWatts: 0 };
  const kpiActive = document.getElementById('kpi-active-lights');
  const kpiBri = document.getElementById('kpi-avg-bri');
  const kpiWatts = document.getElementById('kpi-watts');
  if (kpiActive) kpiActive.textContent = `${m.activeLights} / ${m.totalLights}`;
  if (kpiBri) kpiBri.textContent = `${m.avgBrightness}%`;
  if (kpiWatts) kpiWatts.textContent = `${m.estimatedWatts} W`;

  const pairedBadge = document.getElementById('paired-count-badge');
  if (pairedBadge) pairedBadge.textContent = `${m.totalLights} Lights`;

  const apiPill = document.getElementById('local-api-url');
  if (apiPill && overview.apiUrl) apiPill.textContent = overview.apiUrl;

  renderRoomFilterPills(overview);
  renderSelectOptions(overview);
  renderLightsGrid(overview);
  renderScenesGrid(overview);
  renderCircadianAndSchedules(overview);
  renderIntegrations(overview);
  renderProtocolInspector(overview);
}

function renderRoomFilterPills(overview) {
  const container = document.getElementById('room-filter-pills');
  if (!container) return;
  const rooms = overview.rooms || [];
  const lights = overview.lights || [];
  const pills = [
    {
      id: 'all',
      label: `🏠 All Rooms (${lights.filter((l) => l.on).length}/${lights.length})`,
    },
    ...rooms.map((r) => {
      const rLights = lights.filter((l) => l.roomId === r.id);
      const onCount = rLights.filter((l) => l.on).length;
      return {
        id: r.id,
        label: `${r.icon || '💡'} ${r.name} (${onCount}/${rLights.length})`,
      };
    }),
  ];

  container.innerHTML = pills
    .map(
      (p) =>
        `<button type="button" class="room-pill ${selectedRoomId === p.id ? 'active' : ''}" data-room-filter="${esc(p.id)}">${esc(p.label)}</button>`
    )
    .join('');

  container.querySelectorAll('[data-room-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedRoomId = btn.getAttribute('data-room-filter') || 'all';
      renderRoomFilterPills(currentOverview);
      renderLightsGrid(currentOverview);
    });
  });
}

function renderSelectOptions(overview) {
  const roomSelect = document.getElementById('select-light-room');
  if (roomSelect && roomSelect.options.length === 0) {
    roomSelect.innerHTML = (overview.rooms || [])
      .map((r) => `<option value="${esc(r.id)}">${esc(r.icon)} ${esc(r.name)}</option>`)
      .join('');
  }

  const protoSelect = document.getElementById('select-light-protocol');
  if (protoSelect && protoSelect.options.length === 0) {
    protoSelect.innerHTML = (overview.protocols || [])
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join('');
  }

  const scopeSelect = document.getElementById('select-scene-scope');
  if (scopeSelect && scopeSelect.options.length === 0) {
    scopeSelect.innerHTML = [
      `<option value="all">🏠 Apply to All Rooms</option>`,
      ...(overview.rooms || []).map((r) => `<option value="${esc(r.id)}">${esc(r.icon)} ${esc(r.name)} Only</option>`),
    ].join('');
  }

  const schedSceneSelect = document.getElementById('select-sched-scene');
  if (schedSceneSelect) {
    const prev = schedSceneSelect.value;
    schedSceneSelect.innerHTML = (overview.scenes || [])
      .map((s) => `<option value="${esc(s.id)}">${esc(s.icon)} ${esc(s.name)}</option>`)
      .join('');
    if (prev) schedSceneSelect.value = prev;
  }

  const ciTargetSelect = document.getElementById('select-ci-target-light');
  if (ciTargetSelect) {
    ciTargetSelect.innerHTML = (overview.lights || [])
      .map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${esc(l.ip)})</option>`)
      .join('');
    if (overview.ciSync?.targetLightId) {
      ciTargetSelect.value = overview.ciSync.targetLightId;
    }
  }
}

function renderLightsGrid(overview) {
  const container = document.getElementById('lights-grid');
  if (!container) return;
  const roomMap = new Map((overview.rooms || []).map((r) => [r.id, r]));
  const protoMap = new Map((overview.protocols || []).map((p) => [p.id, p]));
  const effects = overview.effects || [];

  const filtered = (overview.lights || []).filter(
    (l) => selectedRoomId === 'all' || l.roomId === selectedRoomId
  );

  container.innerHTML = filtered
    .map((light) => {
      const room = roomMap.get(light.roomId);
      const proto = protoMap.get(light.protocolId);
      const glowColor = light.on ? light.displayHex || light.colorHex : '#1f2630';
      const orbStyle = light.on
        ? `background:${glowColor};box-shadow:0 0 18px ${glowColor}88;color:#080b10;`
        : `background:#1f2630;color:#8b949e;`;

      const swatchesHtml = QUICK_SWATCHES.map(
        (hex) =>
          `<button type="button" class="color-swatch" style="background:${hex}" data-swatch-light="${esc(light.id)}" data-swatch-hex="${hex}" title="Set color ${hex}"></button>`
      ).join('');

      const effectOptionsHtml = effects
        .map(
          (fx) =>
            `<option value="${esc(fx.id)}" ${light.effect === fx.id ? 'selected' : ''}>${esc(fx.name)}</option>`
        )
        .join('');

      return `
        <div class="light-card ${light.on ? 'is-on' : ''}" data-light-card="${esc(light.id)}">
          <div class="light-top">
            <div class="light-identity">
              <div class="bulb-orb" style="${orbStyle}">${getFixtureIcon(light.formFactor)}</div>
              <div>
                <div class="light-name">${esc(light.name)}</div>
                <div class="light-meta">
                  ${esc(room ? room.name : light.roomId)} · <code>${esc(light.ip)}:${esc(light.port)}</code> · ${esc(proto ? proto.transport : light.protocolId)}
                </div>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <button type="button" class="btn btn-sm ${light.on ? 'btn-primary' : ''}" data-toggle-light="${esc(light.id)}">
                ${light.on ? '⚡ ON' : '⏻ OFF'}
              </button>
              <button type="button" class="btn btn-sm" data-remove-light="${esc(light.id)}" title="Unpair light">✕</button>
            </div>
          </div>

          <div class="light-controls">
            <div class="control-row">
              <span class="control-label">Brightness: <strong>${light.brightness}%</strong></span>
              <input type="range" min="1" max="100" value="${light.brightness}" class="range-input" data-bri-light="${esc(light.id)}" />
            </div>

            <div class="control-row">
              <span class="control-label">Temp: <strong>${light.kelvin}K</strong></span>
              <input type="range" min="2000" max="6500" step="100" value="${light.kelvin}" class="range-input kelvin-range" data-kelvin-light="${esc(light.id)}" />
            </div>

            <div class="control-row">
              <span class="control-label">Color / RGB:</span>
              <div class="swatch-row">
                ${swatchesHtml}
                <input type="color" value="${esc(light.colorHex || '#00bcd4')}" class="color-picker-input" data-color-light="${esc(light.id)}" title="Custom RGB Color" />
              </div>
            </div>

            <div class="control-row">
              <span class="control-label">Effect Mode:</span>
              <select class="select select-sm" style="flex:1;" data-effect-light="${esc(light.id)}">
                ${effectOptionsHtml}
              </select>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  // Wire listeners
  container.querySelectorAll('[data-toggle-light]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-toggle-light');
      const light = (currentOverview.lights || []).find((l) => l.id === id);
      if (!light) return;
      const res = await window.robos.updateLight(id, { on: !light.on });
      if (res?.overview) renderAll(res.overview);
      showBanner(`${light.name} turned ${!light.on ? 'ON' : 'OFF'} (${res?.command?.transport || 'LAN'}).`);
    });
  });

  container.querySelectorAll('[data-remove-light]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-remove-light');
      const res = await window.robos.removeLight(id);
      if (res?.overview) renderAll(res.overview);
      showBanner(`Removed light fixture ${id}.`);
    });
  });

  container.querySelectorAll('[data-bri-light]').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.getAttribute('data-bri-light');
      const val = Number(input.value);
      const res = await window.robos.updateLight(id, { brightness: val, on: true });
      if (res?.overview) renderAll(res.overview);
      showBanner(`Updated brightness to ${val}% on ${res?.light?.name || id}.`);
    });
  });

  container.querySelectorAll('[data-kelvin-light]').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.getAttribute('data-kelvin-light');
      const val = Number(input.value);
      const res = await window.robos.updateLight(id, { kelvin: val, colorMode: 'kelvin', on: true });
      if (res?.overview) renderAll(res.overview);
      showBanner(`Updated color temperature to ${val}K on ${res?.light?.name || id}.`);
    });
  });

  container.querySelectorAll('[data-swatch-light]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-swatch-light');
      const hex = btn.getAttribute('data-swatch-hex');
      const res = await window.robos.updateLight(id, { colorHex: hex, colorMode: 'rgb', on: true });
      if (res?.overview) renderAll(res.overview);
      showBanner(`Applied RGB ${hex} to ${res?.light?.name || id}.`);
    });
  });

  container.querySelectorAll('[data-color-light]').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.getAttribute('data-color-light');
      const hex = input.value;
      const res = await window.robos.updateLight(id, { colorHex: hex, colorMode: 'rgb', on: true });
      if (res?.overview) renderAll(res.overview);
      showBanner(`Applied custom RGB ${hex} to ${res?.light?.name || id}.`);
    });
  });

  container.querySelectorAll('[data-effect-light]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const id = sel.getAttribute('data-effect-light');
      const fx = sel.value;
      const res = await window.robos.updateLight(id, { effect: fx, on: true });
      if (res?.overview) renderAll(res.overview);
      showBanner(`Activated "${fx}" effect on ${res?.light?.name || id}.`);
    });
  });
}

function renderScenesGrid(overview) {
  const container = document.getElementById('scenes-grid');
  if (!container) return;
  const scenes = overview.scenes || [];
  container.innerHTML = scenes
    .map((s) => {
      const isActive = overview.activeSceneId === s.id;
      const p = s.preset || {};
      return `
        <div class="scene-card ${isActive ? 'active' : ''}" data-scene-card="${esc(s.id)}">
          <div>
            <div class="scene-head">
              <span class="scene-title">${esc(s.icon || '✨')} ${esc(s.name)}</span>
              <span class="badge ${isActive ? 'badge-cyan' : ''}">${esc(s.badge || 'Preset')}</span>
            </div>
            <p class="muted-text" style="margin-top:6px;">${esc(s.description)}</p>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="display:flex;gap:4px;align-items:center;">
              <span class="color-swatch" style="background:${esc(p.colorHex || '#00bcd4')};cursor:default;"></span>
              <span class="color-swatch" style="background:${esc(p.stripColorHex || p.colorHex || '#7c3aed')};cursor:default;"></span>
              <span class="light-meta">${p.brightness ?? 80}% · ${p.kelvin ?? 4000}K</span>
            </div>
            <button type="button" class="btn btn-sm ${isActive ? 'btn-primary' : ''}" data-apply-scene="${esc(s.id)}">
              ${isActive ? '✓ Active Scene' : 'Apply Scene'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('[data-apply-scene]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sceneId = btn.getAttribute('data-apply-scene');
      const scope = document.getElementById('select-scene-scope')?.value || 'all';
      const res = await window.robos.applyScene(sceneId, scope);
      if (res?.overview) renderAll(res.overview);
      showBanner(`Applied scene "${res?.scene?.name || sceneId}" across ${scope === 'all' ? 'all rooms' : scope}.`);
    });
  });
}

function renderCircadianAndSchedules(overview) {
  const banner = document.getElementById('circadian-current-banner');
  const c = overview.circadianNow || { phase: 'Solar Noon', kelvin: 5200, brightness: 90, colorHex: '#fff4e0' };
  if (banner) {
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="bulb-orb" style="background:${esc(c.colorHex)};color:#080b10;">☀️</div>
        <div>
          <strong>Current Circadian Phase: ${esc(c.phase)}</strong>
          <div class="light-meta">Recommended Solar Target: <strong>${c.kelvin}K</strong> at <strong>${c.brightness}%</strong> brightness</div>
        </div>
      </div>
      <span class="badge badge-cyan">${c.kelvin}K · ${c.brightness}%</span>
    `;
  }

  const timeline = document.getElementById('circadian-timeline');
  if (timeline) {
    timeline.innerHTML = (overview.circadianCurve || [])
      .map(
        (slot) => `
        <div class="circadian-slot" data-circadian-hour="${slot.hour}" title="Click to apply ${slot.hour}:00 (${slot.kelvin}K)">
          <div class="light-meta">${String(Math.floor(slot.hour)).padStart(2, '0')}:00</div>
          <div class="circadian-dot" style="background:${esc(slot.colorHex)}"></div>
          <div style="font-size:11px;font-weight:700;">${slot.kelvin}K</div>
          <div class="light-meta">${slot.brightness}%</div>
        </div>
      `
      )
      .join('');

    timeline.querySelectorAll('[data-circadian-hour]').forEach((el) => {
      el.addEventListener('click', async () => {
        const h = Number(el.getAttribute('data-circadian-hour'));
        const res = await window.robos.applyCircadianHour(h, null);
        if (res?.overview) renderAll(res.overview);
        showBanner(`Applied ${h}:00 Circadian Daylight (${res?.circadianTarget?.kelvin}K, ${res?.circadianTarget?.brightness}%).`);
      });
    });
  }

  const schedList = document.getElementById('schedules-list');
  if (schedList) {
    const scenesMap = new Map((overview.scenes || []).map((s) => [s.id, s]));
    schedList.innerHTML = (overview.schedules || [])
      .map((s) => {
        const sc = scenesMap.get(s.sceneId);
        return `
          <div class="list-item" data-sched-item="${esc(s.id)}">
            <div>
              <strong>⏰ ${esc(s.time)} — ${esc(s.name)}</strong>
              <div class="light-meta">
                Scene: ${esc(sc ? sc.name : s.sceneId)} · Fade: ${s.fadeMinutes}m · Scope: ${esc(s.roomScope)}
                ${s.lastTriggeredAt ? ` · Last run: ${new Date(s.lastTriggeredAt).toLocaleTimeString()}` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn btn-sm btn-primary" data-run-sched="${esc(s.id)}">▶ Test Now</button>
              <button type="button" class="btn btn-sm" data-del-sched="${esc(s.id)}">✕</button>
            </div>
          </div>
        `;
      })
      .join('');

    schedList.querySelectorAll('[data-run-sched]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-run-sched');
        const res = await window.robos.triggerScheduleNow(id);
        if (res?.overview) renderAll(res.overview);
        showBanner(`Triggered schedule "${res?.schedule?.name || id}" across LAN.`);
      });
    });

    schedList.querySelectorAll('[data-del-sched]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-sched');
        const res = await window.robos.removeSchedule(id);
        if (res?.overview) renderAll(res.overview);
        showBanner(`Deleted schedule ${id}.`);
      });
    });
  }
}

function renderIntegrations(overview) {
  const container = document.getElementById('ci-status-cards');
  if (!container) return;
  const catalog = overview.ciStatusCatalog || {};
  const activeStatus = overview.ciSync?.currentStatus || 'passing';

  container.innerHTML = Object.values(catalog)
    .map((st) => {
      const isAct = st.id === activeStatus;
      return `
        <div class="ci-card ${isAct ? 'active' : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="color-swatch" style="background:${esc(st.colorHex)};cursor:default;"></span>
              <strong>${esc(st.label)}</strong>
            </div>
            ${isAct ? '<span class="badge badge-cyan">Current</span>' : ''}
          </div>
          <p class="muted-text" style="margin:0;">${esc(st.description)}</p>
          <button type="button" class="btn btn-sm ${isAct ? 'btn-primary' : ''}" data-trigger-ci="${esc(st.id)}">
            Trigger ${esc(st.id.toUpperCase())} State
          </button>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('[data-trigger-ci]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const status = btn.getAttribute('data-trigger-ci');
      const targetLightId = document.getElementById('select-ci-target-light')?.value;
      const res = await window.robos.triggerCiStatusLight({ status, targetLightId });
      if (res?.overview) renderAll(res.overview);
      showBanner(`Synced CI Status "${res?.ciStatus?.label}" (${res?.ciStatus?.colorHex}) to fixture.`);
    });
  });
}

function renderProtocolInspector(overview) {
  const logContainer = document.getElementById('protocol-log-list');
  if (logContainer) {
    const logs = overview.protocolLog || [];
    if (logs.length === 0) {
      logContainer.innerHTML = `<div class="list-item"><span class="muted-text">Toggle any light, scene, or CI status to inspect live wire-protocol packets here.</span></div>`;
    } else {
      logContainer.innerHTML = logs
        .slice(0, 12)
        .map(
          (entry) => `
          <div class="list-item" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong>${esc(entry.lightName)} · <code>${esc(entry.transport)}</code> → <code>${esc(entry.target)}</code></strong>
              <span class="badge badge-green">${esc(entry.status)}</span>
            </div>
            <div class="code-block">${esc(entry.cliPreview)}</div>
          </div>
        `
        )
        .join('');
    }
  }

  const guideContainer = document.getElementById('protocols-guide-list');
  if (guideContainer) {
    guideContainer.innerHTML = (overview.protocols || [])
      .map(
        (p) => `
        <div class="list-item" style="flex-direction:column;align-items:stretch;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${esc(p.name)}</strong>
            <span class="badge">${esc(p.transport)}</span>
          </div>
          <div class="light-meta" style="margin-top:2px;">${esc(p.vendor)}</div>
          <ol style="margin:6px 0 0 18px;font-size:12px;color:var(--text-muted);">
            ${(p.setupSteps || []).map((step) => `<li>${esc(step)}</li>`).join('')}
          </ol>
        </div>
      `
      )
      .join('');
  }
}

function bindStaticEvents() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === target));
    });
  });

  // Header actions
  document.getElementById('btn-scan-lan')?.addEventListener('click', async () => {
    showBanner('Scanning LAN for WiZ (:38899), Kasa (:9999), WLED (:80), LIFX (:56700), and Govee (:4001) smart lights…');
    const res = await window.robos.scanLan();
    if (res?.overview) renderAll(res.overview);
    showBanner(`LAN scan complete: ${res?.totalPaired || 0} smart lights ready (${res?.discoveredCount || 0} newly discovered on subnet).`);
  });

  document.getElementById('btn-all-on')?.addEventListener('click', async () => {
    const res = await window.robos.setRoomState(selectedRoomId, { on: true });
    if (res?.overview) renderAll(res.overview);
    showBanner(`Turned ON ${res?.updatedCount || 0} lights (${selectedRoomId === 'all' ? 'All Rooms' : selectedRoomId}).`);
  });

  document.getElementById('btn-all-off')?.addEventListener('click', async () => {
    const res = await window.robos.setRoomState(selectedRoomId, { on: false });
    if (res?.overview) renderAll(res.overview);
    showBanner(`Turned OFF ${res?.updatedCount || 0} lights (${selectedRoomId === 'all' ? 'All Rooms' : selectedRoomId}).`);
  });

  // Room quick toolbar
  document.getElementById('btn-room-warm')?.addEventListener('click', async () => {
    const res = await window.robos.setRoomState(selectedRoomId, { on: true, kelvin: 2700, colorMode: 'kelvin', brightness: 75 });
    if (res?.overview) renderAll(res.overview);
    showBanner('Applied 2700K Warm White to active room selection.');
  });

  document.getElementById('btn-room-daylight')?.addEventListener('click', async () => {
    const res = await window.robos.setRoomState(selectedRoomId, { on: true, kelvin: 5200, colorMode: 'kelvin', brightness: 92 });
    if (res?.overview) renderAll(res.overview);
    showBanner('Applied 5200K Crisp Daylight to active room selection.');
  });

  document.getElementById('btn-room-cyan')?.addEventListener('click', async () => {
    const res = await window.robos.setRoomState(selectedRoomId, { on: true, colorHex: '#00bcd4', colorMode: 'rgb', brightness: 85 });
    if (res?.overview) renderAll(res.overview);
    showBanner('Applied RobOS Electric Cyan (#00bcd4) to active room selection.');
  });

  document.getElementById('btn-room-dim')?.addEventListener('click', async () => {
    const res = await window.robos.setRoomState(selectedRoomId, { on: true, brightness: 25 });
    if (res?.overview) renderAll(res.overview);
    showBanner('Dimmed active room selection to 25%.');
  });

  // Add Light
  document.getElementById('btn-add-light')?.addEventListener('click', async () => {
    const name = document.getElementById('input-light-name')?.value?.trim();
    const roomId = document.getElementById('select-light-room')?.value || 'studio';
    const formFactor = document.getElementById('select-light-form')?.value || 'bulb';
    const protocolId = document.getElementById('select-light-protocol')?.value || 'wiz-udp';
    const ip = document.getElementById('input-light-ip')?.value?.trim() || '192.168.1.92';
    const deviceKey = document.getElementById('input-light-key')?.value?.trim() || '';

    const res = await window.robos.addOrUpdateLight({
      name,
      roomId,
      formFactor,
      protocolId,
      ip,
      deviceKey,
    });
    if (!res?.ok) {
      showBanner(res?.error || 'Could not pair light.');
      return;
    }
    document.getElementById('input-light-name').value = '';
    renderAll(res.overview);
    showBanner(`Paired "${res.light.name}" (${res.light.protocolId} at ${res.light.ip}:${res.light.port}).`);
  });

  // Pair Hue Bridge
  document.getElementById('btn-pair-hue')?.addEventListener('click', async () => {
    const bridgeIp = document.getElementById('input-hue-bridge-ip')?.value?.trim() || '192.168.1.87';
    const res = await window.robos.pairHueBridge({ bridgeIp });
    if (res?.overview) renderAll(res.overview);
    showBanner(`Philips Hue Bridge (${bridgeIp}) paired with local key: ${res?.hueUsername}.`);
  });

  // AI Mood Scene Designer
  document.querySelectorAll('[data-aiprompt]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const textarea = document.getElementById('input-ai-scene-prompt');
      if (textarea) textarea.value = chip.getAttribute('data-aiprompt') || '';
    });
  });

  document.getElementById('btn-design-ai-scene')?.addEventListener('click', async () => {
    const prompt = document.getElementById('input-ai-scene-prompt')?.value?.trim();
    const roomScope = document.getElementById('select-scene-scope')?.value || 'all';
    const res = await window.robos.designSceneWithAi({ prompt, roomScope });
    if (!res?.ok) {
      showBanner(res?.error || 'Enter a mood description first.');
      return;
    }
    renderAll(res.overview);
    showBanner(`Synthesized & applied mood scene "${res.scene.name}" (${res.scene.preset.stripColorHex} / ${res.scene.preset.kelvin}K).`);
  });

  // Save Custom Scene
  document.getElementById('btn-save-custom-scene')?.addEventListener('click', async () => {
    const name = document.getElementById('input-custom-scene-name')?.value?.trim();
    const roomScope = document.getElementById('select-scene-scope')?.value || 'all';
    const res = await window.robos.saveCustomScene({ name, roomScope });
    if (!res?.ok) {
      showBanner(res?.error || 'Enter a scene name first.');
      return;
    }
    document.getElementById('input-custom-scene-name').value = '';
    renderAll(res.overview);
    showBanner(`Saved custom lighting scene "${res.scene.name}".`);
  });

  // Circadian Controls
  document.getElementById('btn-apply-circadian-now')?.addEventListener('click', async () => {
    const res = await window.robos.applyCircadianHour(null, true);
    if (res?.overview) renderAll(res.overview);
    showBanner(`Synced active lights to solar phase "${res?.circadianTarget?.phase}" (${res?.circadianTarget?.kelvin}K).`);
  });

  const hourSlider = document.getElementById('slider-circadian-hour');
  const hourLabel = document.getElementById('label-circadian-hour');
  hourSlider?.addEventListener('input', () => {
    const val = Number(hourSlider.value);
    const hh = String(Math.floor(val)).padStart(2, '0');
    const mm = val % 1 >= 0.5 ? '30' : '00';
    if (hourLabel) hourLabel.textContent = `${hh}:${mm}`;
  });

  document.getElementById('btn-preview-circadian-hour')?.addEventListener('click', async () => {
    const val = Number(hourSlider?.value ?? 12);
    const res = await window.robos.applyCircadianHour(val, null);
    if (res?.overview) renderAll(res.overview);
    showBanner(`Applied ${val}:00 solar curve (${res?.circadianTarget?.kelvin}K, ${res?.circadianTarget?.brightness}%).`);
  });

  // Add Schedule
  document.getElementById('btn-add-schedule')?.addEventListener('click', async () => {
    const name = document.getElementById('input-sched-name')?.value?.trim();
    const time = document.getElementById('input-sched-time')?.value || '08:00';
    const sceneId = document.getElementById('select-sched-scene')?.value || 'scene-deep-focus';
    const res = await window.robos.addOrUpdateSchedule({ name, time, sceneId });
    if (!res?.ok) {
      showBanner(res?.error || 'Schedule name is required.');
      return;
    }
    document.getElementById('input-sched-name').value = '';
    renderAll(res.overview);
    showBanner(`Added automation schedule "${res.schedule.name}" at ${res.schedule.time}.`);
  });

  // Cross-app bridges
  document.getElementById('btn-trigger-tv-bias')?.addEventListener('click', async () => {
    const res = await window.robos.applyScene('scene-movie-theater', 'living-room');
    if (res?.overview) renderAll(res.overview);
    showBanner('Activated Cinema TV Bias Mode in Living Room.');
  });

  document.querySelectorAll('[data-launch-app]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const appId = btn.getAttribute('data-launch-app');
      const res = await window.robos.launchApp(appId);
      showBanner(res?.ok ? `Launched ${appId}…` : `Could not launch ${appId}: ${res?.error}`);
    });
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  bindStaticEvents();
  const overview = await window.robos.getOverview();
  renderAll(overview);
});
