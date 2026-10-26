'use strict';

let state = {
  activeDashboardId: 'daily-engineering-ops',
  dashboard: null,
  allDashboards: [],
  layouts: [],
  widgetCatalog: [],
  tvs: [],
  portalUrl: 'http://192.168.1.100:19210',
  dashboardCastUrl: 'http://192.168.1.100:19210/dashboard',
  activeDashboardCast: null,
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
  if (!el) return;
  el.textContent = msg;
  el.className = 'banner' + (isError ? ' error' : '');
  clearTimeout(window._dashBannerTimer);
  window._dashBannerTimer = setTimeout(() => el.classList.add('hidden'), 6000);
}

async function renderAll() {
  const dash = state.dashboard;
  if (!dash) return;

  // Header selectors
  const dashSel = document.getElementById('select-active-dashboard');
  if (dashSel) {
    dashSel.innerHTML = (state.allDashboards || [])
      .map(
        (d) =>
          `<option value="${esc(d.id)}"${d.id === dash.id ? ' selected' : ''}>${esc(d.title)}</option>`
      )
      .join('');
  }

  const layoutSel = document.getElementById('select-active-layout');
  const newDashLayoutSel = document.getElementById('select-new-dash-layout');
  const activeLayoutId = dash.layout?.id || dash.layoutId || 'mission-control-3col';

  if (layoutSel) {
    layoutSel.innerHTML = (state.layouts || [])
      .map(
        (l) =>
          `<option value="${esc(l.id)}"${l.id === activeLayoutId ? ' selected' : ''}>${esc(l.title)} (${esc(l.badge)})</option>`
      )
      .join('');
  }

  if (newDashLayoutSel && !newDashLayoutSel.options.length) {
    newDashLayoutSel.innerHTML = (state.layouts || [])
      .map((l) => `<option value="${esc(l.id)}">${esc(l.title)} — ${esc(l.badge)}</option>`)
      .join('');
  }

  const tvSel = document.getElementById('select-target-tv');
  if (tvSel) {
    const curTv = tvSel.value || state.activeDashboardCast?.tvId || state.tvs[0]?.id;
    tvSel.innerHTML = (state.tvs || [])
      .map(
        (tv) =>
          `<option value="${esc(tv.id)}"${tv.id === curTv ? ' selected' : ''}>${esc(tv.name)} (${esc(tv.ip)})</option>`
      )
      .join('');
  }

  // Canvas meta bar
  document.getElementById('active-dashboard-heading').textContent = dash.title;
  document.getElementById('active-layout-badge').textContent =
    dash.layout?.title || activeLayoutId;
  document.getElementById('active-kgraph-badge').textContent =
    dash.kgraphId || `urn:robos:dashboard:${dash.id}`;

  const castInd = document.getElementById('tv-cast-live-indicator');
  if (castInd) {
    if (state.activeDashboardCast && state.activeDashboardCast.active) {
      castInd.textContent = `● Showing on ${state.activeDashboardCast.tvName} (${state.dashboardCastUrl})`;
    } else {
      castInd.textContent = `Ready for Smart TV Cast (${state.dashboardCastUrl})`;
    }
  }

  // Render the embedded <robos-dashboard> web component
  const mainDashEl = document.getElementById('main-robos-dashboard');
  if (mainDashEl) {
    mainDashEl.dashboard = dash;
  }

  renderLayoutsCatalog(activeLayoutId);
  renderWidgetCatalog();
  await renderEmbedAndKGraph(dash);
  renderTvCastTab();
}

function renderLayoutsCatalog(activeLayoutId) {
  const grid = document.getElementById('layouts-catalog-grid');
  if (!grid) return;
  grid.innerHTML = (state.layouts || [])
    .map(
      (l) => `
      <button type="button" class="layout-option-card ${l.id === activeLayoutId ? 'active' : ''}" data-pick-layout="${esc(l.id)}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#f0f6fc;font-size:13px;">${esc(l.title)}</strong>
          <span class="badge">${esc(l.badge)}</span>
        </div>
        <div style="font-size:11.5px;color:#8b949e;margin-top:4px;">${esc(l.description)}</div>
        <code style="display:block;margin-top:5px;font-size:10.5px;color:#67e8f9;">${esc(l.kgraphId)}</code>
      </button>
    `
    )
    .join('');

  grid.querySelectorAll('[data-pick-layout]').forEach((btn) => {
    btn.onclick = async () => {
      const res = await window.robosDashboards.setLayout({
        dashboardId: state.dashboard.id,
        layoutId: btn.dataset.pickLayout,
      });
      if (res && res.ok) {
        state = { ...state, ...res };
        await renderAll();
        showBanner(`Switched dashboard layout to "${res.dashboard.layout.title}".`);
      }
    };
  });
}

function renderWidgetCatalog() {
  const wSel = document.getElementById('select-widget-type');
  const titleInput = document.getElementById('input-widget-title');
  const tagInput = document.getElementById('input-custom-tag');
  const catalog = state.widgetCatalog || [];

  if (wSel && !wSel.options.length && catalog.length) {
    wSel.innerHTML = catalog
      .map((w) => `<option value="${esc(w.type)}">${esc(w.icon)} ${esc(w.title)} (&lt;${esc(w.componentTag)}&gt;)</option>`)
      .join('');
    const syncDefaults = () => {
      const w = catalog.find((x) => x.type === wSel.value) || catalog[0];
      if (w) {
        titleInput.value = w.title;
        tagInput.value = w.componentTag;
      }
    };
    wSel.onchange = syncDefaults;
    syncDefaults();
  }

  const listEl = document.getElementById('widget-catalog-list');
  if (!listEl) return;
  listEl.innerHTML = catalog
    .map(
      (w) => `
      <div class="item-row">
        <div>
          <div style="font-weight:700;font-size:12.5px;">${esc(w.icon)} ${esc(w.title)} <code style="font-size:11px;color:#67e8f9;">&lt;${esc(w.componentTag)}&gt;</code></div>
          <div style="font-size:11.5px;color:#8b949e;margin-top:2px;">${esc(w.description)}</div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" data-quick-add-widget="${esc(w.type)}">+ Add</button>
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('[data-quick-add-widget]').forEach((btn) => {
    btn.onclick = async () => {
      const w = catalog.find((x) => x.type === btn.dataset.quickAddWidget);
      if (!w) return;
      const res = await window.robosDashboards.addCard({
        dashboardId: state.dashboard.id,
        title: w.title,
        widgetType: w.type,
        componentTag: w.componentTag,
      });
      if (res && res.ok) {
        state = { ...state, ...res };
        await renderAll();
        showBanner(`Added "${w.title}" (<${w.componentTag}>) card to "${state.dashboard.title}".`);
      }
    };
  });
}

async function renderEmbedAndKGraph(dash) {
  const embedPre = document.getElementById('embed-code-snippet');
  if (embedPre) {
    embedPre.textContent = `<!-- 1. Include the RobOS Dashboard Web Component Library -->
<script src="/usr/local/share/robos/robos-ui/robos-dashboard.js"></script>

<!-- 2. Embed the entire KGraph Dashboard anywhere in your RobOS app -->
<robos-dashboard
  dashboard-id="${dash.id}"
  layout="${dash.layout?.id || dash.layoutId || 'mission-control-3col'}">
</robos-dashboard>

<!-- 3. Or embed any individual RobOS Dashboard Widget component -->
<robos-widget-git-commits limit="10"></robos-widget-git-commits>
<robos-widget-calendar-today scope="today"></robos-widget-calendar-today>
<robos-widget-agent-sessions tail-lines="5"></robos-widget-agent-sessions>`;
  }

  const kgPre = document.getElementById('kgraph-jsonld-preview');
  if (kgPre && window.robosDashboards.getKGraphNodes) {
    const kg = await window.robosDashboards.getKGraphNodes(dash.id);
    if (kg && kg.ok) {
      kgPre.textContent = JSON.stringify(
        {
          '@context': 'https://robos.dev/ns/sdlc#',
          dashboard: kg.dashboardNode,
          layoutRef: kg.layoutNodeId,
          cards: kg.cardNodes,
        },
        null,
        2
      );
    }
  }
}

function renderTvCastTab() {
  const grid = document.getElementById('tv-devices-cast-grid');
  if (!grid) return;
  const tvs = state.tvs || [];
  const activeTvId = state.activeDashboardCast?.tvId;

  grid.innerHTML = tvs
    .map(
      (tv) => `
      <div class="layout-option-card ${tv.id === activeTvId && state.activeDashboardCast?.active ? 'active' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:13.5px;color:#f0f6fc;">📺 ${esc(tv.name)}</strong>
          <code style="font-size:11.5px;color:#67e8f9;">${esc(tv.ip)}</code>
        </div>
        <div style="font-size:12px;color:#8b949e;margin:4px 0 10px;">${esc(tv.platformName || tv.platformId)}</div>
        <button type="button" class="btn btn-sm btn-primary" data-cast-to-tv-id="${esc(tv.id)}">
          Show "${esc(state.dashboard?.title || 'Dashboard')}" on ${esc(tv.name)}
        </button>
      </div>
    `
    )
    .join('');

  grid.querySelectorAll('[data-cast-to-tv-id]').forEach((btn) => {
    btn.onclick = () => castActiveDashboardToTv(btn.dataset.castToTvId);
  });
}

async function castActiveDashboardToTv(tvIdOverride) {
  const tvId = tvIdOverride || document.getElementById('select-target-tv')?.value;
  const dashboardId = state.dashboard?.id || 'daily-engineering-ops';
  const layoutId = state.dashboard?.layout?.id || state.dashboard?.layoutId;
  const res = await window.robosDashboards.castToSmartTv({
    tvId,
    dashboardId,
    layoutId,
  });
  const fresh = await window.robosDashboards.getOverview(dashboardId);
  if (fresh && fresh.ok) {
    state = { ...state, ...fresh };
  }
  await renderAll();
  if (res && (res.blocked || res.sideloadRequired)) {
    showBanner(res.message || res.setupTitle || 'Roku Developer Mode required to sideload channel', true);
  } else if (res && res.ok) {
    showBanner(res.message);
  } else {
    showBanner(res?.message || res?.error || 'Cast initiated on Smart TV portal', Boolean(res?.error));
  }
}

async function init() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(btn.dataset.tab);
      if (pane) pane.classList.add('active');
    };
  });

  // Switch active dashboard
  document.getElementById('select-active-dashboard').onchange = async (e) => {
    const res = await window.robosDashboards.setActiveDashboard(e.target.value);
    if (res && res.ok) {
      state = { ...state, ...res };
      await renderAll();
      showBanner(`Loaded dashboard "${state.dashboard.title}"`);
    }
  };

  // Switch active layout
  document.getElementById('select-active-layout').onchange = async (e) => {
    const res = await window.robosDashboards.setLayout({
      dashboardId: state.dashboard.id,
      layoutId: e.target.value,
    });
    if (res && res.ok) {
      state = { ...state, ...res };
      await renderAll();
      showBanner(`Updated layout to "${state.dashboard.layout.title}"`);
    }
  };

  // Remove card event from <robos-dashboard>
  document.getElementById('main-robos-dashboard').addEventListener('robos-card-remove', async (e) => {
    const cardId = e.detail?.cardId;
    if (!cardId) return;
    const res = await window.robosDashboards.removeCard({
      dashboardId: state.dashboard.id,
      cardId,
    });
    if (res && res.ok) {
      state = { ...state, ...res };
      await renderAll();
      showBanner('Removed widget card from dashboard.');
    }
  });

  // Refresh button
  document.getElementById('btn-refresh-dashboard').onclick = async () => {
    const res = await window.robosDashboards.getOverview(state.dashboard?.id);
    if (res && res.ok) {
      state = { ...state, ...res };
      await renderAll();
      showBanner('Refreshed live Git commits, daily calendar events, and tailed agent sessions.');
    }
  };

  // Cast to Smart TV buttons
  document.getElementById('btn-cast-tv').onclick = () => castActiveDashboardToTv();
  document.getElementById('btn-cast-tv-tab').onclick = () => castActiveDashboardToTv();

  document.getElementById('btn-open-tv-wallboard').onclick = async () => {
    const res = await window.robosDashboards.openTvWallboardExternal();
    if (res && res.ok) {
      showBanner(`Opened Smart TV Dashboard Wallboard at ${res.url}`);
    }
  };

  document.getElementById('btn-launch-smart-tv-app').onclick = async () => {
    const res = await window.robosDashboards.launchSmartTvApp();
    if (res && res.ok) {
      showBanner('Launched RobOS Smart TV Studio');
    }
  };

  document.getElementById('btn-stop-tv-cast').onclick = async () => {
    const tvId = document.getElementById('select-target-tv')?.value;
    const res = await window.robosDashboards.stopSmartTvCast({ tvId });
    const fresh = await window.robosDashboards.getOverview(state.dashboard?.id);
    if (fresh && fresh.ok) state = { ...state, ...fresh };
    await renderAll();
    if (res && res.ok) showBanner(res.message);
  };

  // Add Calendar Event
  document.getElementById('btn-add-cal-event').onclick = async () => {
    const time = document.getElementById('input-cal-time').value.trim() || '15:30';
    const title = document.getElementById('input-cal-title').value.trim();
    const location = document.getElementById('input-cal-location').value.trim() || 'RobOS Meet';
    if (!title) {
      showBanner('Enter a calendar event title first.', true);
      return;
    }
    const res = await window.robosDashboards.addCalendarEvent({ time, title, location });
    if (res && res.ok) {
      state = { ...state, ...res };
      document.getElementById('input-cal-title').value = '';
      await renderAll();
      showBanner(`Added "${title}" (${time}) to today's calendar events.`);
    }
  };

  // Append Agent Status Line
  document.getElementById('btn-tail-agent-line').onclick = async () => {
    const line = document.getElementById('input-agent-line').value.trim();
    if (!line) {
      showBanner('Enter a status line to append to the running agent tail.', true);
      return;
    }
    const res = await window.robosDashboards.appendAgentStatusLine({ line });
    if (res && res.ok) {
      state = { ...state, ...res };
      document.getElementById('input-agent-line').value = '';
      await renderAll();
      showBanner('Appended live status line to running RobOS agent session tail.');
    }
  };

  // Create new Dashboard
  document.getElementById('btn-create-dashboard').onclick = async () => {
    const title = document.getElementById('input-new-dash-title').value.trim();
    const description = document.getElementById('input-new-dash-desc').value.trim();
    const layoutId = document.getElementById('select-new-dash-layout').value;
    if (!title) {
      showBanner('Please enter a title for the new dashboard.', true);
      return;
    }
    const res = await window.robosDashboards.createDashboard({ title, description, layoutId });
    if (res && res.ok) {
      state = { ...state, ...res };
      document.getElementById('input-new-dash-title').value = '';
      document.getElementById('input-new-dash-desc').value = '';
      await renderAll();
      showBanner(`Created new dashboard "${state.dashboard.title}" (${state.dashboard.layout.title}).`);
    }
  };

  // Delete Dashboard
  document.getElementById('btn-delete-dashboard').onclick = async () => {
    const res = await window.robosDashboards.deleteDashboard(state.dashboard?.id);
    if (!res.ok) {
      showBanner(res.error || 'Cannot delete dashboard', true);
      return;
    }
    state = { ...state, ...res };
    await renderAll();
    showBanner('Deleted dashboard.');
  };

  // Add Widget Card
  document.getElementById('btn-add-widget-card').onclick = async () => {
    const widgetType = document.getElementById('select-widget-type').value;
    const title = document.getElementById('input-widget-title').value.trim();
    const componentTag = document.getElementById('input-custom-tag').value.trim();
    const res = await window.robosDashboards.addCard({
      dashboardId: state.dashboard.id,
      title,
      widgetType,
      componentTag,
      config: { customElementTag: componentTag },
    });
    if (res && res.ok) {
      state = { ...state, ...res };
      await renderAll();
      showBanner(`Added widget card "${title}" (<${componentTag}>).`);
    }
  };

  const initial = await window.robosDashboards.getOverview();
  if (initial && initial.ok) {
    state = { ...state, ...initial };
    await renderAll();
  }

  // Live dynamic polling for in-progress agent sessions, music, and countdown (every 2s)
  setInterval(async () => {
    try {
      const fresh = await window.robosDashboards.getOverview(state.dashboard?.id);
      if (!fresh || !fresh.ok || !fresh.dashboard) return;
      state.dashboard = fresh.dashboard;
      const cards = Array.isArray(fresh.dashboard.cards) ? fresh.dashboard.cards : [];
      const agentCard = cards.find((c) => c.widgetType === 'agent-sessions');
      if (agentCard && window.RobOSDashboardUI) {
        const bodyEl = document.querySelector('section[data-widget-type="agent-sessions"] .robos-embed-card-body');
        if (bodyEl) {
          bodyEl.innerHTML = window.RobOSDashboardUI.renderWidgetInnerHtml(agentCard);
        }
      }
    } catch {}
  }, 2000);
}

init();
