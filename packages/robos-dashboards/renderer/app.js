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

  const ss = state.slideshow || dash.slideshow || { enabled: false, intervalSeconds: 15, dashboardIds: [] };
  const toggleBtn = document.getElementById('btn-toggle-slideshow');
  if (toggleBtn) {
    toggleBtn.textContent = ss.enabled
      ? `🎞️ Slideshow: ON (${ss.slideNumber || 1}/${ss.totalSlides || 3})`
      : '🎞️ Slideshow: OFF';
    toggleBtn.className = ss.enabled ? 'btn btn-sm btn-primary' : 'btn btn-sm';
  }
  const secInput = document.getElementById('input-slideshow-seconds');
  if (secInput && document.activeElement !== secInput) {
    secInput.value = String(ss.intervalSeconds || 15);
  }
  const builderSecInput = document.getElementById('input-builder-slideshow-sec');
  if (builderSecInput && document.activeElement !== builderSecInput) {
    builderSecInput.value = String(ss.intervalSeconds || 15);
  }
  const ssPill = document.getElementById('slideshow-status-pill');
  if (ssPill) {
    if (ss.enabled) {
      ssPill.style.display = 'inline-block';
      ssPill.textContent = `🎞️ Slide ${ss.slideNumber}/${ss.totalSlides} (${ss.intervalSeconds}s) · Next in ${ss.secondsRemainingInSlide}s → ${ss.nextDashboardTitle}`;
    } else {
      ssPill.style.display = 'none';
    }
  }

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

  renderSlideshowChecklist(ss);
  renderLayoutsCatalog(activeLayoutId);
  renderWidgetCatalog();
  await renderEmbedAndKGraph(dash);
  renderTvCastTab();
}

function renderSlideshowChecklist(ss = {}) {
  const listEl = document.getElementById('slideshow-dashboards-checklist');
  if (!listEl) return;
  const selectedIds = new Set(Array.isArray(ss.dashboardIds) ? ss.dashboardIds : []);
  listEl.innerHTML = (state.allDashboards || [])
    .map(
      (d, idx) => `
      <label class="item-row" style="cursor:pointer;">
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" class="js-slideshow-dash-cb" value="${esc(d.id)}" ${selectedIds.size === 0 || selectedIds.has(d.id) ? 'checked' : ''} />
          <div>
            <div style="font-weight:700;font-size:12.5px;">Slide ${idx + 1}: ${esc(d.title)}</div>
            <div style="font-size:11px;color:#8b949e;">Layout: ${esc(d.layout?.title || d.layoutId)} · ${(d.cards || []).length} cards</div>
          </div>
        </div>
        <span class="badge">${esc(d.id)}</span>
      </label>
    `
    )
    .join('');
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

  // Slideshow toolbar controls
  const toggleSlideshowBtn = document.getElementById('btn-toggle-slideshow');
  if (toggleSlideshowBtn && window.robosDashboards.configureSlideshow) {
    toggleSlideshowBtn.onclick = async () => {
      const curEnabled = Boolean(state.slideshow?.enabled);
      const sec = Math.max(3, Math.min(3600, Number(document.getElementById('input-slideshow-seconds')?.value) || 15));
      const res = await window.robosDashboards.configureSlideshow({
        enabled: !curEnabled,
        intervalSeconds: sec,
      });
      if (res && res.ok) {
        state = { ...state, ...res };
        await renderAll();
        showBanner(
          res.slideshow?.enabled
            ? `Started Multi-Dashboard Slideshow (cycling ${res.slideshow.totalSlides} dashboards every ${res.slideshow.intervalSeconds}s).`
            : 'Paused Multi-Dashboard Slideshow.'
        );
      }
    };
  }

  const secInputEl = document.getElementById('input-slideshow-seconds');
  if (secInputEl && window.robosDashboards.configureSlideshow) {
    secInputEl.onchange = async () => {
      const sec = Math.max(3, Math.min(3600, Number(secInputEl.value) || 15));
      const res = await window.robosDashboards.configureSlideshow({
        intervalSeconds: sec,
      });
      if (res && res.ok) {
        state = { ...state, ...res };
        await renderAll();
        showBanner(`Updated slideshow cycle interval to ${sec} seconds.`);
      }
    };
  }

  const prevSlideBtn = document.getElementById('btn-slide-prev');
  if (prevSlideBtn && window.robosDashboards.stepSlideshow) {
    prevSlideBtn.onclick = async () => {
      const res = await window.robosDashboards.stepSlideshow({ direction: -1 });
      if (res && res.ok) {
        state = { ...state, ...res };
        await renderAll();
        showBanner(`Switched to Slide ${res.slideshow?.slideNumber}/${res.slideshow?.totalSlides}: "${res.dashboard?.title}".`);
      }
    };
  }

  const nextSlideBtn = document.getElementById('btn-slide-next');
  if (nextSlideBtn && window.robosDashboards.stepSlideshow) {
    nextSlideBtn.onclick = async () => {
      const res = await window.robosDashboards.stepSlideshow({ direction: 1 });
      if (res && res.ok) {
        state = { ...state, ...res };
        await renderAll();
        showBanner(`Switched to Slide ${res.slideshow?.slideNumber}/${res.slideshow?.totalSlides}: "${res.dashboard?.title}".`);
      }
    };
  }

  const saveStartSsBtn = document.getElementById('btn-save-start-slideshow');
  if (saveStartSsBtn && window.robosDashboards.configureSlideshow) {
    saveStartSsBtn.onclick = async () => {
      const checkedIds = Array.from(document.querySelectorAll('.js-slideshow-dash-cb:checked')).map((el) => el.value);
      const sec = Math.max(3, Math.min(3600, Number(document.getElementById('input-builder-slideshow-sec')?.value) || 15));
      const res = await window.robosDashboards.configureSlideshow({
        enabled: true,
        intervalSeconds: sec,
        dashboardIds: checkedIds.length > 0 ? checkedIds : undefined,
      });
      if (res && res.ok) {
        state = { ...state, ...res };
        await renderAll();
        showBanner(`Started Multi-Dashboard Slideshow (${res.slideshow?.totalSlides} dashboards, cycling every ${sec}s).`);
      }
    };
  }

  const stopSsBtn = document.getElementById('btn-stop-slideshow');
  if (stopSsBtn && window.robosDashboards.configureSlideshow) {
    stopSsBtn.onclick = async () => {
      const res = await window.robosDashboards.configureSlideshow({ enabled: false });
      if (res && res.ok) {
        state = { ...state, ...res };
        await renderAll();
        showBanner('Stopped Multi-Dashboard Slideshow.');
      }
    };
  }

  const initial = await window.robosDashboards.getOverview();
  if (initial && initial.ok) {
    state = { ...state, ...initial };
    await renderAll();
  }

  // Live dynamic polling for slideshow transitions, in-progress agent sessions, music, and countdown (every 1s)
  setInterval(async () => {
    try {
      const prevDashId = state.dashboard?.id;
      const queryDashId = state.slideshow?.enabled ? undefined : prevDashId;
      const fresh = await window.robosDashboards.getOverview(queryDashId);
      if (!fresh || !fresh.ok || !fresh.dashboard) return;
      state.slideshow = fresh.slideshow;
      if (fresh.dashboard.id !== prevDashId) {
        state = { ...state, ...fresh };
        await renderAll();
        return;
      }
      state.dashboard = fresh.dashboard;
      const ss = fresh.slideshow;
      const ssPill = document.getElementById('slideshow-status-pill');
      if (ssPill) {
        if (ss && ss.enabled) {
          ssPill.style.display = 'inline-block';
          ssPill.textContent = `🎞️ Slide ${ss.slideNumber}/${ss.totalSlides} (${ss.intervalSeconds}s) · Next in ${ss.secondsRemainingInSlide}s → ${ss.nextDashboardTitle}`;
        } else {
          ssPill.style.display = 'none';
        }
      }
      const cards = Array.isArray(fresh.dashboard.cards) ? fresh.dashboard.cards : [];
      for (const liveType of ['agent-sessions', 'music-now-playing']) {
        const liveCard = cards.find((c) => c.widgetType === liveType);
        if (liveCard && window.RobOSDashboardUI) {
          const bodyEl = document.querySelector(`section[data-widget-type="${liveType}"] .robos-embed-card-body`);
          if (bodyEl) {
            bodyEl.innerHTML = window.RobOSDashboardUI.renderWidgetInnerHtml(liveCard);
          }
        }
      }
    } catch {}
  }, 1000);
}

init();
