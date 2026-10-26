/**
 * RobOS Embeddable Dashboard & Widget Component Library (`robos-ui/robos-dashboard.js`)
 *
 * Provides:
 *  - `<robos-dashboard>` — Embeds any KGraph-modeled graphical dashboard (with any layout of cards
 *    from the canonical layout catalog) inside any RobOS desktop app or 10-foot Smart TV portal.
 *  - `<robos-dashboard-widget>` —Universal RobOS widget container that mounts any RobOS component.
 *  - First-class RobOS widget custom elements:
 *      - `<robos-widget-git-commits>` — 10 latest commit messages in a nice, small, readable text list
 *      - `<robos-widget-calendar-today>` — Calendar events for the day
 *      - `<robos-widget-agent-sessions>` — Running RobOS agent sessions with their status lines tailed
 *      - `<robos-widget-smart-tv>` — Paired Smart TVs & 10-Foot Portal cast status
 *      - `<robos-widget-smart-lights>` — Smart Light rooms & scenes
 *      - `<robos-widget-kgraph>` — Knowledge Graph & SHACL validation status
 *      - `<robos-widget-sprint-radar>` — Dev Central Sprint & PR radar
 *      - `<robos-widget-custom>` — Mounts any `<robos-...>` custom component (`<robos-ai-textarea>`,
 *        `<robos-voice-button>`, `<robos-agent-job-status>`, etc.)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.RobOSDashboard = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function (global) {
  'use strict';

  const LAYOUT_GRID_TEMPLATES = {
    'mission-control-3col': 'repeat(3, minmax(0, 1fr))',
    'hero-top-split': 'repeat(2, minmax(0, 1fr))',
    'sidebar-focus': '1fr 2fr',
    'quad-grid-2x2': 'repeat(2, minmax(0, 1fr))',
    'tv-wallboard-10ft': '1.1fr 0.95fr 1.25fr',
    'single-focus': '1fr',
  };

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const DASHBOARD_STYLES = `
robos-dashboard, robos-dashboard-widget,
robos-widget-git-commits, robos-widget-calendar-today, robos-widget-agent-sessions,
robos-widget-smart-tv, robos-widget-smart-lights, robos-widget-kgraph,
robos-widget-sprint-radar, robos-widget-custom {
  display: block;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.robos-embed-dashboard {
  width: 100%;
  color: #f0f6fc;
}
.robos-embed-grid {
  display: grid;
  gap: 14px;
  align-items: stretch;
}
.robos-embed-card {
  background: #161b22;
  border: 1px solid #263248;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  transition: border-color 0.15s ease;
}
.robos-embed-card:hover {
  border-color: rgba(0, 188, 212, 0.45);
}
.robos-embed-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #21262d;
}
.robos-embed-card-title {
  font-size: 13px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #00bcd4;
  display: flex;
  align-items: center;
  gap: 6px;
}
.robos-embed-card-tag {
  font-size: 10.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #8b949e;
  background: #0d1117;
  border: 1px solid #30363d;
  padding: 2px 6px;
  border-radius: 5px;
}
.robos-embed-card-remove {
  background: transparent;
  border: 1px solid #30363d;
  color: #f87171;
  border-radius: 5px;
  padding: 1px 6px;
  font-size: 11px;
  cursor: pointer;
}
.robos-embed-card-remove:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
}
.robos-w-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: #8b949e;
  margin-bottom: 6px;
}
.robos-w-pill {
  background: rgba(0, 188, 212, 0.12);
  color: #67e8f9;
  border: 1px solid rgba(0, 188, 212, 0.3);
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
}
/* 10 latest commit messages in nice small readable text list format */
.robos-commits-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.robos-commit-item {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: baseline;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.35;
  padding: 4px 7px;
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 6px;
}
.robos-commit-sha {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  color: #67e8f9;
  background: rgba(0, 188, 212, 0.1);
  padding: 1px 4px;
  border-radius: 4px;
}
.robos-commit-type {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.15);
  color: #cbd5e1;
}
.robos-commit-type.feat { background: rgba(16, 185, 129, 0.18); color: #6ee7b7; }
.robos-commit-type.fix { background: rgba(245, 158, 11, 0.2); color: #fcd34d; }
.robos-commit-type.docs { background: rgba(59, 130, 246, 0.2); color: #93c5fd; }
.robos-commit-subject {
  color: #e6edf3;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.robos-commit-time {
  font-size: 10px;
  color: #8b949e;
  white-space: nowrap;
}
/* Calendar events for the day */
.robos-cal-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.robos-cal-row {
  display: flex;
  gap: 9px;
  padding: 7px 9px;
  background: #0d1117;
  border: 1px solid #21262d;
  border-left: 3px solid #00bcd4;
  border-radius: 7px;
}
.robos-cal-row.now {
  border-left-color: #10b981;
  background: rgba(16, 185, 129, 0.08);
}
.robos-cal-row.completed {
  opacity: 0.7;
  border-left-color: #64748b;
}
.robos-cal-time {
  min-width: 44px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  color: #67e8f9;
}
.robos-cal-end {
  font-size: 9.5px;
  color: #8b949e;
  font-weight: 400;
}
.robos-cal-info {
  flex: 1;
  min-width: 0;
}
.robos-cal-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.robos-cal-title {
  font-size: 12px;
  font-weight: 650;
  color: #f0f6fc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.robos-cal-sub {
  font-size: 10.5px;
  color: #8b949e;
  margin-top: 2px;
}
.robos-cal-badge {
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 188, 212, 0.14);
  color: #67e8f9;
}
.robos-cal-badge.now {
  background: rgba(16, 185, 129, 0.22);
  color: #6ee7b7;
}
/* Running agent sessions & status lines tailed */
.robos-agents-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.robos-agent-card {
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 7px;
  padding: 8px 10px;
}
.robos-agent-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.robos-agent-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
  margin-right: 5px;
}
.robos-agent-name {
  font-size: 12px;
  font-weight: 650;
  color: #f0f6fc;
}
.robos-agent-prov {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(168, 85, 247, 0.18);
  color: #d8b4fe;
  font-weight: 600;
}
.robos-agent-cwd {
  font-size: 10px;
  color: #8b949e;
  margin: 2px 0 5px;
}
.robos-agent-tail {
  margin: 0;
  background: #06090f;
  border: 1px solid #1e293b;
  border-radius: 5px;
  padding: 6px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  line-height: 1.38;
  color: #a7f3d0;
  white-space: pre-wrap;
  overflow-x: auto;
}
`;

  function ensureStylesInjected() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('robos-dashboard-component-styles')) return;
    const style = document.createElement('style');
    style.id = 'robos-dashboard-component-styles';
    style.textContent = DASHBOARD_STYLES;
    document.head.appendChild(style);
  }

  function renderWidgetInnerHtml(card = {}) {
    const widgetType = card.widgetType || card.type || 'robos-component';
    const data = card.liveData || card.data || {};

    if (widgetType === 'git-commits') {
      const commits = Array.isArray(data.commits) ? data.commits : [];
      return `
        <div class="robos-w-meta">
          <span>Repo: <code>${esc(data.repoName || 'robos')}</code></span>
          <span class="robos-w-pill">⎇ ${esc(data.branch || 'main')} · ${commits.length} commits</span>
        </div>
        <ol class="robos-commits-list">
          ${commits
            .map(
              (c) => `
            <li class="robos-commit-item" data-commit-sha="${esc(c.shortSha)}">
              <code class="robos-commit-sha">${esc(c.shortSha)}</code>
              <span class="robos-commit-type ${esc(c.commitType || 'commit')}">${esc(c.commitType || 'git')}</span>
              <span class="robos-commit-subject" title="${esc(c.subject)}">${esc(c.subject)}</span>
              <span class="robos-commit-time">${esc(c.author)} · ${esc(c.relativeTime)}</span>
            </li>
          `
            )
            .join('')}
        </ol>
      `;
    }

    if (widgetType === 'calendar-today') {
      const events = Array.isArray(data.events) ? data.events : [];
      const calendars = Array.isArray(data.calendars) ? data.calendars : [];
      const calPillsHtml =
        calendars.length > 0
          ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
              ${calendars
                .map(
                  (c) =>
                    `<span class="robos-w-pill" style="border:1px solid ${esc(c.color || '#00bcd4')};color:${esc(c.color || '#67e8f9')};">● ${esc(c.email)}</span>`
                )
                .join('')}
            </div>`
          : '';
      return `
        <div class="robos-w-meta">
          <span>📅 ${esc(data.dateLabel || 'Today')}</span>
          <span class="robos-w-pill">${esc(calendars.length > 1 ? `${calendars.length} Calendars Synced` : data.syncedAccountEmail || 'CalDAV Synced')}</span>
        </div>
        ${calPillsHtml}
        <div class="robos-cal-list">
          ${events
            .map(
              (ev) => `
            <div class="robos-cal-row ${esc(ev.status || 'upcoming')}" data-event-id="${esc(ev.id)}" style="border-left-color:${esc(ev.color || '#00bcd4')};">
              <div class="robos-cal-time">
                <div>${esc(ev.time)}</div>
                <div class="robos-cal-end">${esc(ev.endTime || '')}</div>
              </div>
              <div class="robos-cal-info">
                <div class="robos-cal-top">
                  <span class="robos-cal-title">${esc(ev.title)}</span>
                  <span class="robos-cal-badge ${esc(ev.status || 'upcoming')}">${esc((ev.status || 'upcoming').toUpperCase())}</span>
                </div>
                <div class="robos-cal-sub"><strong style="color:${esc(ev.color || '#67e8f9')};">${esc(ev.accountEmail || ev.calendar || 'Calendar')}</strong> · ${esc(ev.location || 'Workspace')}</div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    if (widgetType === 'agent-sessions') {
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      return `
        <div class="robos-w-meta">
          <span>🟢 ${esc(data.runningCount ?? sessions.length)} Running Agent Sessions</span>
          <span class="robos-w-pill">Status Lines Tailed (${esc(data.tailLines || 5)})</span>
        </div>
        <div class="robos-agents-list">
          ${sessions
            .map(
              (s) => `
            <div class="robos-agent-card" data-session-id="${esc(s.id)}">
              <div class="robos-agent-top">
                <div>
                  <span class="robos-agent-dot"></span>
                  <span class="robos-agent-name">${esc(s.name)}</span>
                </div>
                <span class="robos-agent-prov">${esc(s.providerLabel || s.provider)}</span>
              </div>
              <div class="robos-agent-cwd">cwd: <code>${esc(s.cwd || '/home/ndipiazza/source/robos')}</code>${s.taskRef ? ` · <span>${esc(s.taskRef)}</span>` : ''}</div>
              <pre class="robos-agent-tail">${(s.statusLines || []).map((l) => esc(l)).join('\n')}</pre>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    if (widgetType === 'smart-tv') {
      const tvs = Array.isArray(data.tvs) ? data.tvs : [];
      return `
        <div class="robos-w-meta">
          <span>📺 Paired LAN Smart TVs: ${tvs.length}</span>
          <span class="robos-w-pill">10-Foot Portal :${esc(data.portalPort || 19210)}</span>
        </div>
        <div class="robos-cal-list">
          ${tvs
            .map(
              (tv) => `
            <div class="robos-cal-row">
              <div class="robos-cal-info">
                <div class="robos-cal-top">
                  <span class="robos-cal-title">${esc(tv.name)}</span>
                  <span class="robos-cal-badge now">${esc(tv.ip)}</span>
                </div>
                <div class="robos-cal-sub">${esc(tv.platformName || tv.platformId)}</div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    if (widgetType === 'smart-lights') {
      return `
        <div class="robos-w-meta">
          <span>💡 ${esc(data.onlineCount ?? 4)}/${esc(data.bulbsCount ?? 6)} Smart Lights Active</span>
          <span class="robos-w-pill">${esc(data.activeScene || 'Circadian Daylight')}</span>
        </div>
        <div class="robos-cal-list">
          ${(data.bulbs || [])
            .map(
              (b) => `
            <div class="robos-cal-row">
              <div class="robos-cal-info">
                <div class="robos-cal-top">
                  <span class="robos-cal-title">${esc(b.name)}</span>
                  <span class="robos-cal-badge">${esc(b.brightness || 80)}% · ${esc(b.kelvin || 4000)}K</span>
                </div>
                <div class="robos-cal-sub">${esc(b.room || 'Studio')} · ${esc(b.protocol || 'LAN')}</div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    if (widgetType === 'kgraph-summary') {
      return `
        <div class="robos-w-meta">
          <span>🕸️ ${esc(data.packagesCount || 18)} Modular KGraph Packages</span>
          <span class="robos-w-pill">✔ SHACL 100% Valid (${esc(data.totalNodes || 650)} nodes)</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${(data.packages || [])
            .map((p) => `<span class="robos-w-pill">${esc(p.id)}: ${esc(p.nodesCount)} nodes</span>`)
            .join('')}
        </div>
      `;
    }

    if (widgetType === 'sprint-radar') {
      return `
        <div class="robos-w-meta">
          <span>🚀 ${esc(data.sprintName || 'Sprint 42')}</span>
          <span class="robos-w-pill">CI Health: ${esc(data.ciHealth || '100%')}</span>
        </div>
        <div class="robos-cal-list">
          ${(data.items || [])
            .map(
              (it) => `
            <div class="robos-cal-row">
              <div class="robos-cal-info">
                <div class="robos-cal-top">
                  <span class="robos-cal-title">${esc(it.code)} · ${esc(it.title)}</span>
                  <span class="robos-cal-badge">${esc(it.status)}</span>
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    const customTag = data.customElementTag || card.config?.customElementTag || 'robos-ai-textarea';
    const placeholder = data.placeholder || card.config?.placeholder || 'Ask RobOS AI or trigger a workflow…';
    return `
      <div class="robos-w-meta">
        <span>🧩 Embedded RobOS Component</span>
        <span class="robos-w-pill">&lt;${esc(customTag)}&gt;</span>
      </div>
      <div class="robos-custom-mount" data-mount-tag="${esc(customTag)}" data-placeholder="${esc(placeholder)}">
        <${esc(customTag)} placeholder="${esc(placeholder)}"></${esc(customTag)}>
      </div>
    `;
  }

  function renderDashboardHtml(dashboard = {}, options = {}) {
    const dash = dashboard.dashboard || dashboard;
    const layoutId = options.layoutId || dash.layoutId || dash.layout?.id || 'mission-control-3col';
    const gridTemplate =
      dash.layout?.gridTemplate ||
      LAYOUT_GRID_TEMPLATES[layoutId] ||
      LAYOUT_GRID_TEMPLATES['mission-control-3col'];
    const cards = Array.isArray(dash.cards) ? dash.cards : [];
    const editable = Boolean(options.editable);

    return `
      <div class="robos-embed-dashboard" data-dashboard-id="${esc(dash.id || 'daily-engineering-ops')}" data-layout-id="${esc(layoutId)}">
        <div class="robos-embed-grid" style="grid-template-columns: ${esc(gridTemplate)};">
          ${cards
            .map(
              (card) => `
            <section class="robos-embed-card"
                     data-card-id="${esc(card.id)}"
                     data-widget-type="${esc(card.widgetType)}"
                     style="grid-column: span ${Number(card.colSpan || 1)}; grid-row: span ${Number(card.rowSpan || 1)};">
              <div class="robos-embed-card-head">
                <div class="robos-embed-card-title">
                  <span>${esc(card.widgetMeta?.icon || '❖')}</span>
                  <span>${esc(card.title)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <code class="robos-embed-card-tag">&lt;${esc(card.componentTag || 'robos-dashboard-widget')}&gt;</code>
                  ${
                    editable
                      ? `<button type="button" class="robos-embed-card-remove" data-remove-card="${esc(card.id)}" title="Remove widget card">✕</button>`
                      : ''
                  }
                </div>
              </div>
              <div class="robos-embed-card-body">
                ${renderWidgetInnerHtml(card)}
              </div>
            </section>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  // Register Custom Elements when running in a browser / Electron renderer
  if (typeof global.HTMLElement !== 'undefined' && typeof global.customElements !== 'undefined') {
    class RobOSDashboardWidgetElement extends global.HTMLElement {
      static get observedAttributes() {
        return ['widget-type', 'title'];
      }
      connectedCallback() {
        ensureStylesInjected();
        this.render();
      }
      attributeChangedCallback() {
        if (this.isConnected) this.render();
      }
      set cardData(val) {
        this._cardData = val;
        this.render();
      }
      get cardData() {
        return this._cardData;
      }
      render() {
        const card = this._cardData || {
          id: this.getAttribute('card-id') || 'widget-card',
          title: this.getAttribute('title') || 'RobOS Widget',
          widgetType: this.getAttribute('widget-type') || 'git-commits',
          componentTag: this.tagName.toLowerCase(),
          liveData: this._liveData || {},
        };
        this.innerHTML = renderWidgetInnerHtml(card);
      }
    }

    if (!global.customElements.get('robos-dashboard-widget')) {
      global.customElements.define('robos-dashboard-widget', RobOSDashboardWidgetElement);
    }

    const WIDGET_TAGS = [
      ['robos-widget-git-commits', 'git-commits'],
      ['robos-widget-calendar-today', 'calendar-today'],
      ['robos-widget-agent-sessions', 'agent-sessions'],
      ['robos-widget-smart-tv', 'smart-tv'],
      ['robos-widget-smart-lights', 'smart-lights'],
      ['robos-widget-kgraph', 'kgraph-summary'],
      ['robos-widget-sprint-radar', 'sprint-radar'],
      ['robos-widget-custom', 'robos-component'],
    ];

    for (const [tagName, defaultType] of WIDGET_TAGS) {
      if (!global.customElements.get(tagName)) {
        global.customElements.define(
          tagName,
          class extends RobOSDashboardWidgetElement {
            connectedCallback() {
              if (!this.getAttribute('widget-type')) {
                this.setAttribute('widget-type', defaultType);
              }
              super.connectedCallback();
            }
          }
        );
      }
    }

    class RobOSDashboardElement extends global.HTMLElement {
      static get observedAttributes() {
        return ['dashboard-id', 'layout', 'editable'];
      }
      connectedCallback() {
        ensureStylesInjected();
        this.render();
      }
      attributeChangedCallback() {
        if (this.isConnected) this.render();
      }
      set dashboard(val) {
        this._dashboard = val;
        this.render();
      }
      get dashboard() {
        return this._dashboard;
      }
      render() {
        ensureStylesInjected();
        if (!this._dashboard) return;
        const editable = this.getAttribute('editable') === 'true';
        const layoutOverride = this.getAttribute('layout');
        this.innerHTML = renderDashboardHtml(this._dashboard, {
          editable,
          layoutId: layoutOverride || undefined,
        });

        this.querySelectorAll('[data-remove-card]').forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            this.dispatchEvent(
              new global.CustomEvent('robos-card-remove', {
                bubbles: true,
                detail: { cardId: btn.dataset.removeCard },
              })
            );
          };
        });
      }
    }

    if (!global.customElements.get('robos-dashboard')) {
      global.customElements.define('robos-dashboard', RobOSDashboardElement);
    }
  }

  return {
    LAYOUT_GRID_TEMPLATES,
    renderWidgetInnerHtml,
    renderDashboardHtml,
    ensureStylesInjected,
  };
});
