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
robos-widget-sprint-radar, robos-widget-voice-dictation, robos-widget-game-theater, robos-widget-custom {
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
/* 10-Foot Living-Room Smart TV Typography Scale for Game Theater Spectator */
.tv-10ft, .robos-dashboard-grid {
  --gt-meta-size: 20px;
  --gt-pill-size: 19px;
  --gt-round-size: 21px;
  --gt-timer-size: 40px;
  --gt-bar-h: 12px;
  --gt-prompt-size: 44px;
  --gt-prompt-long-size: 36px;
  --gt-opt-size: 32px;
  --gt-opt-badge: 48px;
  --gt-opt-badge-font: 26px;
  --gt-opt-pad: 18px 22px;
  --gt-opt-gap: 16px;
  --gt-stage-pad: 20px 26px;
  --gt-lb-rank-size: 22px;
  --gt-lb-name-size: 25px;
  --gt-lb-score-size: 30px;
  --gt-lb-badge-size: 17px;
  --gt-lb-sub-size: 15px;
  --gt-lb-pad: 12px 16px;
  --gt-lobby-size: 19px;
  --gt-phrase-size: 44px;
  --gt-gallows-w: 190px;
  --gt-gallows-h: 216px;
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
    const body = renderLiveWidgetInnerHtml(card);
    if (!(card.liveData || card.data)?.sample) return body;
    return `<div class="robos-sample-note" style="font-size:11px;font-weight:700;color:#fbbf24;margin-bottom:6px;">Sample data, not live.</div>${body}`;
  }

  function renderLiveWidgetInnerHtml(card = {}) {
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
            .join('') || '<li class="robos-commit-item"><span class="robos-commit-subject">No git history here.</span></li>'}
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
          <span class="robos-w-pill">${esc(calendars.length > 1 ? `${calendars.length} Calendars Synced` : data.syncedAccountEmail || 'No calendar connected')}</span>
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
            .join('') || '<div class="robos-cal-sub">No calendar events today.</div>'}
        </div>
      `;
    }

    if (widgetType === 'agent-sessions') {
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      if (sessions.length === 0) {
        return `<div class="robos-agents-list" data-live-agents-root="true"></div>`;
      }
      return `
        <div class="robos-w-meta">
          <span>🟢 <strong class="js-live-agents-count">${esc(sessions.length)}</strong> In-Progress Session${sessions.length === 1 ? '' : 's'} Running Now</span>
          <span class="robos-w-pill">⚡ Live Dynamic Stream</span>
        </div>
        <div class="robos-agents-list" data-live-agents-root="true">
          ${sessions
            .map(
              (s) => `
            <div class="robos-agent-card" data-session-id="${esc(s.id)}">
              <div class="robos-agent-top">
                <div>
                  <span class="robos-agent-dot"></span>
                  <span class="robos-agent-name">${esc(s.name)}</span>
                </div>
                <span class="robos-w-pill js-agent-elapsed" data-started-epoch="${esc(s.startedEpochSec || '')}" style="font-family:ui-monospace,monospace;">⏱ ${esc(s.elapsedFormatted || '00:05')}</span>
              </div>
              <div class="robos-agent-cwd">cwd: <code>${esc(s.cwd || 'not reported')}</code>${s.activity ? ` · <span style="color:#67e8f9;">${esc(s.activity)}</span>` : ''}</div>
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
            .join('') || '<div class="robos-cal-sub">No TVs paired yet. Pair one in RobOS Smart TV.</div>'}
        </div>
      `;
    }

    if (widgetType === 'smart-lights') {
      return `
        <div class="robos-w-meta">
          <span>💡 ${esc(data.onlineCount ?? 0)}/${esc(data.bulbsCount ?? 0)} Smart Lights Active</span>
          <span class="robos-w-pill">${esc(data.activeScene || 'No scene')}</span>
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
          <span>🚀 ${esc(data.sprintName || 'Sprint')}</span>
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

    if (widgetType === 'live-clock') {
      return `
        <div class="robos-w-meta">
          <span>🕒 Live JS Canvas Chronometer</span>
          <span class="robos-w-pill">⚡ 60FPS / 1Hz Canvas Engine</span>
        </div>
        <div style="display:flex;align-items:center;gap:14px;padding:4px 2px;">
          <canvas class="robos-live-clock-canvas" width="116" height="116" style="width:116px;height:116px;flex-shrink:0;"></canvas>
          <div style="flex:1;min-width:0;">
            <div class="js-live-digital-time" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:800;color:#67e8f9;letter-spacing:0.03em;">${esc(data.time24 || '15:25:00')}</div>
            <div class="js-live-date-label" style="font-size:12px;font-weight:700;color:#f0f6fc;margin-top:2px;">${esc(data.dateLabel || 'Mon, Oct 26, 2026')}</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">
              <span class="robos-w-pill js-live-utc-time" style="border-color:rgba(16,185,129,0.4);color:#6ee7b7;background:rgba(16,185,129,0.12);">${esc(data.utcTime || '20:25:00 UTC')}</span>
              <span class="robos-w-pill">${esc(data.timezone || 'America/Chicago')}</span>
            </div>
            <canvas class="robos-sec-bar-canvas" width="240" height="12" style="width:100%;height:12px;margin-top:6px;border-radius:4px;"></canvas>
          </div>
        </div>
      `;
    }

    if (widgetType === 'github-repo') {
      const cfg = card.config || {};
      const mode = cfg.mode || 'default';
      const rel = data.latestRelease || {};
      const ci = data.mainCi || {};
      const pop = data.popularity || {};
      const wfs = Array.isArray(ci.workflows) ? ci.workflows : [];
      const commits = Array.isArray(data.commits) ? data.commits.slice(0, 6) : [];
      const isRelRunning = Boolean(rel.isRunningNow);
      const showMainCi = cfg.showMainCi !== false;

      if (mode === 'ci-only') {
        return `
          <div class="robos-w-meta">
            <span>⚙️ <code>${esc(data.repo || 'nddipiazza/robos')}</code> · ⎇ ${esc(data.branch || 'main')}</span>
            <span class="robos-w-pill" style="background:rgba(0,188,212,0.16);color:#67e8f9;border-color:rgba(0,188,212,0.4);">
              ${esc(ci.summaryText || '3 Passing · 1 Failing')}
            </span>
          </div>
          <div style="background:#0d1117;border:1px solid #21262d;border-left:3px solid #00bcd4;border-radius:7px;padding:8px 10px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:11.5px;font-weight:700;color:#67e8f9;">⚙️ CI STATUS IN MAIN (${esc(ci.summaryText || '3 Passing · 1 Failing')})</span>
              <span style="font-size:10px;color:#8b949e;">${ci.isRunningNow ? '⚡ Running Now' : 'Completed'}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              ${wfs
                .map((w) => {
                  const isOk = w.conclusion === 'success';
                  const isRun = w.status === 'in_progress' || w.status === 'queued';
                  const badgeColor = isRun ? '#fcd34d' : isOk ? '#6ee7b7' : '#fca5a5';
                  const badgeBg = isRun
                    ? 'rgba(245,158,11,0.18)'
                    : isOk
                    ? 'rgba(16,185,129,0.14)'
                    : 'rgba(239,68,68,0.16)';
                  const icon = isRun ? '⚡' : isOk ? '✔' : '✖';
                  return `<div style="display:flex;align-items:center;justify-content:space-between;background:#161b22;border:1px solid #21262d;border-radius:5px;padding:5px 8px;font-size:11px;">
                    <span style="color:#e6edf3;font-weight:600;">${esc(w.name || w.shortName)} <code style="color:#67e8f9;">#${esc(w.runNumber)}</code></span>
                    <span style="color:${badgeColor};background:${badgeBg};padding:1px 6px;border-radius:3px;font-weight:700;font-size:10px;">${icon} ${esc(String(isRun ? w.status : w.conclusion || 'ok').toUpperCase())}</span>
                  </div>`;
                })
                .join('')}
            </div>
          </div>
          <div style="background:#0d1117;border:1px solid #21262d;border-left:3px solid ${isRelRunning ? '#f59e0b' : '#10b981'};border-radius:7px;padding:8px 10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
              <strong style="font-size:12px;color:#f0f6fc;">🏷️ Latest Release: ${esc(rel.name || rel.tag || 'RobOS v0.0.8')} (#${esc(rel.releaseRunNumber || 11)})</strong>
              <span class="robos-cal-badge" style="${isRelRunning ? 'background:rgba(245,158,11,0.24);color:#fcd34d;' : 'background:rgba(16,185,129,0.2);color:#6ee7b7;'}">
                ${isRelRunning ? '⚡ RUNNING NOW' : '● IDLE'}
              </span>
            </div>
            <div style="font-size:10.5px;color:#8b949e;margin-top:3px;">
              ${esc(rel.statusLabel || 'IDLE · Last Release #11: SUCCESS ✔')} · Win EXE Release #${esc(rel.windowsReleaseRunNumber || 5)}: ${esc(String(rel.windowsReleaseConclusion || 'SUCCESS').toUpperCase())}
            </div>
          </div>
        `;
      }

      if (mode === 'stars-forks') {
        const stargazers = Array.isArray(pop.stargazers) ? pop.stargazers : [];
        return `
          <div class="robos-w-meta">
            <span>⭐ <code>${esc(data.repo || 'nddipiazza/robos')}</code> Community</span>
            <span class="robos-w-pill" style="background:rgba(245,158,11,0.18);color:#fcd34d;border-color:#f59e0b;">
              ★ ${esc(pop.stars ?? 7)} Stars · 🍴 ${esc(pop.forks ?? 1)} Fork
            </span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:6px;">
            <div style="background:#0d1117;border:1px solid #21262d;border-top:3px solid #f59e0b;border-radius:7px;padding:8px;text-align:center;">
              <div style="font-size:22px;font-weight:900;color:#fcd34d;">⭐ ${esc(pop.stars ?? 7)}</div>
              <div style="font-size:10px;color:#8b949e;font-weight:700;margin-top:2px;">STARS</div>
            </div>
            <div style="background:#0d1117;border:1px solid #21262d;border-top:3px solid #00bcd4;border-radius:7px;padding:8px;text-align:center;">
              <div style="font-size:22px;font-weight:900;color:#67e8f9;">🍴 ${esc(pop.forks ?? 1)}</div>
              <div style="font-size:10px;color:#8b949e;font-weight:700;margin-top:2px;">FORKS</div>
            </div>
            <div style="background:#0d1117;border:1px solid #21262d;border-top:3px solid #10b981;border-radius:7px;padding:8px;text-align:center;">
              <div style="font-size:22px;font-weight:900;color:#6ee7b7;">👁 ${esc(pop.watchers ?? 7)}</div>
              <div style="font-size:10px;color:#8b949e;font-weight:700;margin-top:2px;">WATCHERS</div>
            </div>
          </div>
          <div style="background:#0d1117;border:1px solid #21262d;border-radius:7px;padding:8px 10px;">
            <div style="font-size:10.5px;font-weight:700;color:#fcd34d;margin-bottom:5px;">🌟 RECENT GITHUB STARGAZERS:</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${stargazers
                .slice(0, 7)
                .map(
                  (s, idx) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;background:#161b22;border:1px solid #21262d;border-radius:5px;padding:3px 7px;font-size:11px;">
                    <span style="color:#f0f6fc;font-weight:600;">${idx + 1}. @${esc(s.login)}</span>
                    <span style="color:#6ee7b7;font-family:ui-monospace,monospace;font-size:10px;">★ ${esc(s.starredAt)}</span>
                  </div>`
                )
                .join('')}
            </div>
          </div>
        `;
      }

      if (mode === 'popularity-traffic') {
        const clones = pop.clones14d || { count: 2637, uniques: 612, peakDay: { label: 'Oct 23', count: 328 } };
        const views = pop.views14d || { count: 17, uniques: 8 };
        const dl = pop.downloads || { totalDownloads: 91, topAssets: [] };
        const refs = Array.isArray(pop.topReferrers) ? pop.topReferrers : [];
        return `
          <div class="robos-w-meta">
            <span>🚀 <strong>App Popularity &amp; Traffic</strong> (14d)</span>
            <span class="robos-w-pill" style="background:rgba(16,185,129,0.18);color:#6ee7b7;border-color:#10b981;">
              📦 ${esc(dl.totalDownloads ?? 91)} Downloads
            </span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:6px;">
            <div style="background:#0d1117;border:1px solid #21262d;border-left:3px solid #10b981;border-radius:7px;padding:7px 9px;">
              <div style="font-size:18px;font-weight:900;color:#6ee7b7;">${esc(clones.count ?? 2637)} <span style="font-size:11px;color:#8b949e;font-weight:600;">Clones</span></div>
              <div style="font-size:10px;color:#67e8f9;margin-top:2px;">👤 <strong>${esc(clones.uniques ?? 612)}</strong> Uniques · Peak ${esc(clones.peakDay?.count ?? 328)}/d</div>
            </div>
            <div style="background:#0d1117;border:1px solid #21262d;border-left:3px solid #a855f7;border-radius:7px;padding:7px 9px;">
              <div style="font-size:18px;font-weight:900;color:#d8b4fe;">${esc(dl.totalDownloads ?? 91)} <span style="font-size:11px;color:#8b949e;font-weight:600;">Installer DLs</span></div>
              <div style="font-size:10px;color:#cbd5e1;margin-top:2px;">👀 ${esc(views.count ?? 17)} Views (${esc(views.uniques ?? 8)} Uniques)</div>
            </div>
          </div>
          <div style="background:#0d1117;border:1px solid #21262d;border-radius:7px;padding:7px 9px;margin-bottom:5px;">
            <div style="font-size:10.5px;font-weight:700;color:#67e8f9;margin-bottom:4px;">📦 TOP RELEASE INSTALLER DOWNLOADS:</div>
            <div style="display:flex;flex-direction:column;gap:3px;">
              ${(dl.topAssets || [])
                .slice(0, 4)
                .map(
                  (a) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;background:#161b22;border-radius:4px;padding:3px 6px;font-size:10.5px;">
                    <span style="color:#e6edf3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.name)} <code style="color:#8b949e;">(${esc(a.tag)})</code></span>
                    <strong style="color:#6ee7b7;">${esc(a.count)} DLs</strong>
                  </div>`
                )
                .join('')}
            </div>
          </div>
          <div style="background:#0d1117;border:1px solid #21262d;border-radius:7px;padding:7px 9px;">
            <div style="font-size:10.5px;font-weight:700;color:#fcd34d;margin-bottom:3px;">🌐 TOP DISCOVERY REFERRERS:</div>
            <div style="font-size:10.5px;color:#cbd5e1;">
              ${refs.map((r) => `<strong style="color:#67e8f9;">${esc(r.referrer)}</strong> (${esc(r.count)} / ${esc(r.uniques)}u)`).join(' · ')}
            </div>
          </div>
        `;
      }

      return `
        <div class="robos-w-meta">
          <span>🐙 <code>${esc(data.repo || 'nddipiazza/robos')}</code> · ⎇ ${esc(data.branch || 'main')}</span>
          <span class="robos-w-pill" style="${isRelRunning ? 'background:rgba(245,158,11,0.22);color:#fcd34d;border-color:#f59e0b;' : 'background:rgba(16,185,129,0.16);color:#6ee7b7;border-color:rgba(16,185,129,0.4);'}">
            🏷️ ${esc(rel.tag || 'v0.0.8')} · Release #${esc(rel.releaseRunNumber || 11)}
          </span>
        </div>
        <div style="background:#0d1117;border:1px solid #21262d;border-left:3px solid ${isRelRunning ? '#f59e0b' : '#10b981'};border-radius:7px;padding:7px 9px;margin-bottom:6px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <strong style="font-size:12px;color:#f0f6fc;">🏷️ Latest Release: ${esc(rel.name || rel.tag || 'RobOS v0.0.8')} (#${esc(rel.releaseRunNumber || 11)})</strong>
            <span class="robos-cal-badge" style="${isRelRunning ? 'background:rgba(245,158,11,0.24);color:#fcd34d;' : 'background:rgba(16,185,129,0.2);color:#6ee7b7;'}">
              ${isRelRunning ? '⚡ RUNNING NOW' : '● IDLE (NOT RUNNING NOW)'}
            </span>
          </div>
          <div style="font-size:10.5px;color:#8b949e;margin-top:2px;">
            ${esc(rel.statusLabel || 'IDLE · Last Release #11: SUCCESS ✔')} · Win EXE Release #${esc(rel.windowsReleaseRunNumber || 5)}: ${esc(String(rel.windowsReleaseConclusion || 'SUCCESS').toUpperCase())}
          </div>
        </div>
        <div style="background:#0d1117;border:1px solid #21262d;border-radius:7px;padding:7px 9px;margin-bottom:6px;">
          ${
            showMainCi
              ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                  <span style="font-size:11px;font-weight:700;color:#67e8f9;">⚙️ CI STATUS IN MAIN (${esc(ci.summaryText || '3 Passing · 1 Failing')})</span>
                  <span style="font-size:10px;color:#8b949e;">${ci.isRunningNow ? '⚡ Running Now' : 'Completed'}</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin-bottom:7px;">
                  ${wfs
                    .slice(0, 4)
                    .map((w) => {
                      const isOk = w.conclusion === 'success';
                      const isRun = w.status === 'in_progress' || w.status === 'queued';
                      const badgeColor = isRun ? '#fcd34d' : isOk ? '#6ee7b7' : '#fca5a5';
                      const badgeBg = isRun
                        ? 'rgba(245,158,11,0.18)'
                        : isOk
                        ? 'rgba(16,185,129,0.14)'
                        : 'rgba(239,68,68,0.16)';
                      const icon = isRun ? '⚡' : isOk ? '✔' : '✖';
                      return `<div style="display:flex;align-items:center;justify-content:space-between;background:#161b22;border:1px solid #21262d;border-radius:5px;padding:3px 6px;font-size:10.5px;">
                        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#e6edf3;">${esc(w.shortName || w.name)} #${esc(w.runNumber)}</span>
                        <span style="color:${badgeColor};background:${badgeBg};padding:1px 4px;border-radius:3px;font-weight:700;font-size:9.5px;">${icon} ${esc(String(isRun ? w.status : w.conclusion || 'ok').toUpperCase())}</span>
                      </div>`;
                    })
                    .join('')}
                </div>`
              : ''
          }
          ${(() => {
            const c30 = data.commits30d || { total: 653, avgPerDay: 21.8, peakDay: { label: 'Oct 2', count: 95 }, todayCount: 25, byType: { feat: 336, fix: 166, docs: 64 }, dailySeries: [] };
            const countsCsv = (c30.dailySeries || []).map((d) => d.count).join(',');
            const bt = c30.byType || {};
            return `
              <div>
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:10.5px;margin-bottom:4px;">
                  <strong style="color:#6ee7b7;">📈 30-DAY ROBOS COMMITS: ${esc(c30.total)}</strong>
                  <span style="color:#8b949e;">Avg ${esc(c30.avgPerDay)}/d · Peak ${esc(c30.peakDay?.count || 95)} (${esc(c30.peakDay?.label || 'Oct 2')}) · Today ${esc(c30.todayCount)}</span>
                </div>
                <canvas class="robos-gh-activity-canvas" width="440" height="58" data-series="${esc(countsCsv)}" style="width:100%;height:58px;border-radius:5px;"></canvas>
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:9.5px;color:#8b949e;margin-top:3px;">
                  <span>Sep 27</span>
                  <span>feat: <strong style="color:#6ee7b7;">${esc(bt.feat || 336)}</strong> · fix: <strong style="color:#67e8f9;">${esc(bt.fix || 166)}</strong> · docs: <strong style="color:#d8b4fe;">${esc(bt.docs || 64)}</strong></span>
                  <span style="color:#fcd34d;font-weight:700;">Today (Oct 26)</span>
                </div>
              </div>
            `;
          })()}
        </div>
        <div style="font-size:10.5px;font-weight:700;color:#8b949e;margin-bottom:3px;">LATEST ROBOS COMMITS (${esc(data.branch || 'main')}):</div>
        <ol class="robos-commits-list">
          ${commits
            .map(
              (c) => `
            <li class="robos-commit-item" data-commit-sha="${esc(c.shortSha)}">
              <code class="robos-commit-sha">${esc(c.shortSha)}</code>
              <span class="robos-commit-type ${esc(c.commitType || 'commit')}">${esc(c.commitType || 'git')}</span>
              <span class="robos-commit-subject" title="${esc(c.subject)}">${esc(c.subject)}</span>
              <span class="robos-commit-time">${esc(c.relativeTime)}</span>
            </li>
          `
            )
            .join('')}
        </ol>
      `;
    }

    if (widgetType === 'music-now-playing') {
      const isPlaying = Boolean(data.isPlaying === true);
      const upNext = Array.isArray(data.upNext) ? data.upNext : [];
      const pct = isPlaying
        ? Math.max(2, Math.min(100, Number(data.progressPct) || 1))
        : Math.max(0, Math.min(100, Number(data.progressPct) || 0));
      return `
        <div class="robos-w-meta">
          <span>🎵 <strong>RobOS Audio Player</strong> · ${esc(data.output || 'Desktop (Local Audio)')}</span>
          <span class="robos-w-pill" style="${isPlaying ? 'background:rgba(16,185,129,0.2);color:#6ee7b7;border-color:rgba(16,185,129,0.5);' : 'background:rgba(148,163,184,0.16);color:#94a3b8;border-color:rgba(148,163,184,0.3);'}">
            ${isPlaying ? '▶ PLAYING NOW' : '⏹ NOT PLAYING — IDLE'}
          </span>
        </div>
        <div style="background:#0d1117;border:1px solid #21262d;border-left:3px solid ${isPlaying ? '#a855f7' : '#475569'};border-radius:8px;padding:9px 10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="min-width:0;flex:1;">
              <div style="font-size:13.5px;font-weight:800;color:${isPlaying ? '#f0f6fc' : '#8b949e'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${isPlaying ? `🎵 ${esc(data.title || 'Unknown track')}` : '🔇 No Audio Currently Playing'}</div>
              <div style="font-size:11.5px;color:${isPlaying ? '#d8b4fe' : '#6e7681'};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${isPlaying ? esc(data.artistAlbum || '') : (data.id ? `Last queued: ${esc(data.title || 'None')} (${esc(data.artist || 'RobOS Audio Player')})` : esc(data.artistAlbum || ''))}</div>
              <div style="font-size:10px;color:#8b949e;margin-top:2px;">${esc([data.source, data.codec].filter(Boolean).join(' · '))}</div>
            </div>
            <div style="text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;flex-shrink:0;">
              <div style="font-size:12.5px;font-weight:800;color:${isPlaying ? '#67e8f9' : '#6e7681'};">${esc(isPlaying ? (data.elapsed || '0:00') : '0:00')} <span style="color:#6e7681;font-weight:500;">/ ${esc(data.duration || '0:00')}</span></div>
              <div style="font-size:9.5px;color:${isPlaying ? '#6ee7b7' : '#6e7681'};margin-top:2px;">${isPlaying ? `${pct}% elapsed` : 'Stopped'}</div>
            </div>
          </div>
          <div style="height:5px;background:#070b14;border-radius:999px;overflow:hidden;margin-top:7px;">
            <div style="height:100%;width:${isPlaying ? pct : 0}%;background:linear-gradient(90deg,#a855f7,#00bcd4,#10b981);"></div>
          </div>
          <canvas class="robos-music-eq-canvas" width="440" height="32" data-playing="${isPlaying ? '1' : '0'}" style="width:100%;height:32px;margin-top:6px;border-radius:4px;"></canvas>
          ${
            upNext.length > 0
              ? `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #21262d;font-size:10.5px;color:#8b949e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  <strong style="color:#c9d1d9;">Up Next:</strong> ${upNext.map((u) => `${esc(u.title)} (${esc(u.artist)})`).join(' · ')}
                </div>`
              : ''
          }
        </div>
      `;
    }

    if (widgetType === 'next-meeting-countdown') {
      const nm = data.nextMeeting || {};
      const fm = data.followingMeeting || null;
      const targetSec = Number(data.targetEpochSec) || 0;
      const pct = targetSec ? Math.max(8, Math.min(100, Number(data.urgencyPct) || 8)) : 0;
      return `
        <div class="robos-w-meta">
          <span>⏳ <strong>Countdown Until Next Meeting</strong></span>
          <span class="robos-w-pill" style="background:rgba(16,185,129,0.16);color:#6ee7b7;border-color:rgba(16,185,129,0.45);">
            📅 ${esc(nm.accountEmail || nm.calendar || 'No calendar connected')}
          </span>
        </div>
        <div style="background:#0d1117;border:1px solid #21262d;border-left:3px solid #10b981;border-radius:8px;padding:9px 10px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <canvas class="robos-meeting-countdown-canvas" width="88" height="88" data-target-epoch="${esc(targetSec)}" style="width:88px;height:88px;flex-shrink:0;"></canvas>
            <div style="flex:1;min-width:0;">
              <div class="js-next-meeting-countdown" data-target-epoch="${esc(targetSec)}" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:800;color:#6ee7b7;letter-spacing:0.03em;">
                ${esc(data.countdownLabel || 'No upcoming meetings')}
              </div>
              <div style="font-size:12.5px;font-weight:800;color:#f0f6fc;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${esc(nm.time || '--:--')} · ${esc(nm.title || 'No upcoming meetings')}
              </div>
              <div style="font-size:10.5px;color:#8b949e;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                📍 ${esc(nm.location || 'Google Calendar')}
              </div>
              <div style="height:5px;background:#070b14;border-radius:999px;overflow:hidden;margin-top:6px;">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#10b981,#00bcd4,#f59e0b);"></div>
              </div>
            </div>
          </div>
          ${
            fm
              ? `<div style="margin-top:6px;padding-top:5px;border-top:1px solid #21262d;font-size:10.5px;color:#8b949e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  <strong style="color:#c9d1d9;">Following:</strong> ${esc(fm.time || '')} — ${esc(fm.title || '')} (${esc(fm.accountEmail || '')})
                </div>`
              : ''
          }
        </div>
      `;
    }

    if (widgetType === 'voice-dictation') {
      const isRec = Boolean(data.active || data.interimBubble);
      const interim = data.interimBubble || null;
      const bubbles = Array.isArray(data.bubbles) ? data.bubbles : [];
      const renderSkillBadges = (b) => {
        if (b.isAmbient) {
          return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">
            <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#6ee7b7;">🍃 Ambient audio: ${esc(b.ambientReason || 'Background sound')}</span>
          </div>`;
        }
        const skills = Array.isArray(b.likelySkills) ? b.likelySkills.slice(0, 2) : [];
        const cmd = b.commandCard || null;
        if (!skills.length && !cmd) return '';
        return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">
          ${
            cmd
              ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.45);color:#6ee7b7;">⚡ ${esc(cmd.typeLabel || 'Cmd')}: ${esc(cmd.title)} (${esc(cmd.statusLabel || '✓ Done')})</span>`
              : ''
          }
          ${skills
            .map(
              (sk) =>
                `<span style="display:inline-flex;align-items:center;gap:4px;font-size:9.5px;padding:1px 6px;border-radius:4px;background:rgba(0,188,212,0.12);border:1px solid rgba(0,188,212,0.3);color:#67e8f9;">⚡ <strong>${esc(sk.category || 'Skill')}</strong> · ${esc(sk.title || sk.name)}${sk.confidence ? ` (${Math.round(sk.confidence * 100)}%)` : ''}</span>`
            )
            .join('')}
        </div>`;
      };

      return `
        <div class="robos-w-meta" data-live-voice-meta="true">
          <span>🎙️ <strong>RobOS Voice Dictation</strong> · <code>${esc(data.pushToTalkKey || 'Super+V')}</code></span>
          <span class="robos-w-pill" style="${isRec ? 'background:rgba(239,68,68,0.2);color:#fca5a5;border-color:rgba(239,68,68,0.5);' : 'background:rgba(0,188,212,0.14);color:#67e8f9;border-color:rgba(0,188,212,0.35);'}">
            ${isRec ? '● LISTENING LIVE' : `● STANDBY (${bubbles.length} Bubbles)`}
          </span>
        </div>
        <div class="robos-voice-bubbles-list" data-live-voice-root="true" style="display:flex;flex-direction:column;gap:6px;">
          ${
            interim
              ? `<div class="robos-voice-bubble interim" data-bubble-id="${esc(interim.id)}" style="background:rgba(0,188,212,0.08);border:1px dashed rgba(0,188,212,0.55);border-left:3px solid #00bcd4;border-radius:8px;padding:7px 9px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#67e8f9;margin-bottom:3px;">
                    <span style="font-family:ui-monospace,monospace;">${esc(interim.time || 'Live')}</span>
                    <span style="display:inline-flex;align-items:center;gap:4px;font-weight:700;color:#fca5a5;"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block;"></span>Listening…</span>
                  </div>
                  <div class="robos-voice-bubble-text" style="font-size:12px;font-weight:600;color:#f0f6fc;line-height:1.35;">“${esc(interim.text || interim.msg)}”</div>
                  ${renderSkillBadges(interim)}
                </div>`
              : ''
          }
          ${
            bubbles.length > 0
              ? bubbles
                  .slice()
                  .reverse()
                  .map(
                    (b) => `
                  <div class="robos-voice-bubble" data-bubble-id="${esc(b.id)}" style="background:#0d1117;border:1px solid #21262d;border-left:3px solid ${b.commandCard ? '#10b981' : '#a855f7'};border-radius:8px;padding:7px 9px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#8b949e;margin-bottom:2px;">
                      <span style="font-family:ui-monospace,monospace;color:#d8b4fe;font-weight:700;">🗣️ ${esc(b.time)}</span>
                      <span style="font-size:9.5px;color:#6e7681;">RobOS Voice HUD</span>
                    </div>
                    <div class="robos-voice-bubble-text" style="font-size:11.5px;font-weight:600;color:#f0f6fc;line-height:1.35;">“${esc(b.text || b.msg)}”</div>
                    ${renderSkillBadges(b)}
                  </div>`
                  )
                  .join('')
              : !interim
              ? `<div style="background:#0d1117;border:1px solid #21262d;border-radius:7px;padding:9px;font-size:11px;color:#8b949e;text-align:center;">No voice dictation bubbles yet. Press <code>Super+V</code> or say <strong>"Hello RobOS"</strong> to dictate.</div>`
              : ''
          }
        </div>
      `;
    }

    if (widgetType === 'game-theater') {
      const cfg = card.config || {};
      const mode = cfg.mode || 'stage';
      const activeGame = data.activeGame || null;
      const matchStatus = data.matchStatus || 'idle';
      const isPlaying = matchStatus === 'playing' && Boolean(activeGame);
      const seats = Array.isArray(data.seats) ? data.seats : [];
      const onlinePlayers = Array.isArray(data.onlinePlayers) ? data.onlinePlayers : [];
      const view = data.spectatorView && typeof data.spectatorView === 'object' ? data.spectatorView : null;
      const chatLog = Array.isArray(data.chatLog) ? data.chatLog : [];
      const agentStatus = data.agentStatus && typeof data.agentStatus === 'object' ? data.agentStatus : {};
      const isRoundReveal = Boolean(
        view &&
          (view.phase === 'reveal' ||
            view.phase === 'gameover' ||
            view.phase === 'round_over' ||
            (Number.isInteger(view.correctIndex) && view.correctIndex >= 0))
      );

      if (mode === 'leaderboard') {
        let rows = [];
        if (view && Array.isArray(view.leaderboard) && view.leaderboard.length > 0) {
          rows = view.leaderboard.map((r) => {
            const hasAns = Boolean(r.hasAnswered || r.answered);
            const deltaPts = Number(r.roundDelta || 0);
            const earned = Boolean(r.gotPoint || deltaPts > 0);
            return {
              uid: r.uid,
              name: r.name || r.shortName || r.uid,
              color: r.color || '#00bcd4',
              avatar: r.avatar || '🎮',
              score: Number(r.score ?? r.points ?? 0),
              streak: Number(r.streak || 0),
              correctCount: r.correctCount,
              rankTitle: r.rankTitle || '',
              badgeText: earned
                ? deltaPts > 1
                  ? `+${deltaPts} PTS ✔`
                  : '+1 PT ✔'
                : isRoundReveal && hasAns
                  ? '✖ Missed'
                  : hasAns
                    ? '✔ Locked In'
                    : isPlaying
                      ? '⏳ Thinking…'
                      : 'Seated',
              badgeColor: earned ? '#6ee7b7' : isRoundReveal && hasAns ? '#fca5a5' : hasAns ? '#67e8f9' : '#cbd5e1',
            };
          });
        } else {
          const scoreMap = (view && view.scores && typeof view.scores === 'object') ? view.scores : {};
          const sourcePlayers =
            (view && Array.isArray(view.players) && view.players.length > 0) ? view.players : seats;
          rows = sourcePlayers
            .map((p) => {
              const uid = p.uid || p.id || p.name;
              const isChooser = view && view.chooserUid && view.chooserUid === uid;
              const isGuesser = view && view.guesserUid && view.guesserUid === uid;
              return {
                uid,
                name: p.shortName || p.name || uid,
                color: p.color || '#00bcd4',
                avatar: p.avatar || '🎮',
                score: Number(scoreMap[uid] ?? p.score ?? 0),
                streak: Number(p.streak || 0),
                rankTitle: '',
                badgeText: isChooser
                  ? '📝 Chooser'
                  : isGuesser
                    ? '🎯 Guesser'
                    : isPlaying
                      ? 'In Match'
                      : 'Seated',
                badgeColor: isChooser ? '#d8b4fe' : isGuesser ? '#6ee7b7' : '#67e8f9',
              };
            })
            .sort((a, b) => b.score - a.score);
        }

        const maxSeats = activeGame?.maxPlayers || Math.max(2, seats.length);
        return `
          <div class="robos-w-meta" style="font-size:var(--gt-meta-size,15px);margin-bottom:10px;">
            <span>🏆 <strong style="color:#f8fafc;">${esc(activeGame ? activeGame.title : 'Game Theater')} Standings</strong></span>
            <span class="robos-w-pill" style="background:rgba(16,185,129,0.18);color:#6ee7b7;border-color:rgba(16,185,129,0.45);font-size:var(--gt-pill-size,13px);padding:3px 12px;">
              Seats: ${seats.length}/${esc(maxSeats)}
            </span>
          </div>
          ${
            rows.length > 0
              ? `<div style="display:flex;flex-direction:column;gap:9px;">
                  ${rows
                    .slice(0, 6)
                    .map(
                      (r, idx) => `
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#0d1117;border:1px solid #263248;border-left:5px solid ${esc(r.color || '#00bcd4')};border-radius:10px;padding:var(--gt-lb-pad,10px 14px);">
                        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                          <span style="font-family:ui-monospace,monospace;font-size:var(--gt-lb-rank-size,16px);font-weight:900;color:${idx === 0 ? '#fcd34d' : '#94a3b8'};min-width:32px;">#${idx + 1}</span>
                          <span style="font-size:var(--gt-lb-name-size,18px);">${esc(r.avatar || '🎮')}</span>
                          <div style="min-width:0;">
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                              <strong style="font-size:var(--gt-lb-name-size,18px);color:#ffffff;">${esc(r.name)}</strong>
                              ${
                                r.streak > 1
                                  ? `<span style="font-size:var(--gt-lb-sub-size,13px);font-weight:800;padding:2px 8px;border-radius:999px;background:rgba(245,158,11,0.22);color:#fcd34d;">🔥 ${r.streak}x</span>`
                                  : ''
                              }
                            </div>
                            ${
                              r.rankTitle
                                ? `<div style="font-size:var(--gt-lb-sub-size,12.5px);color:#d8b4fe;font-weight:650;margin-top:2px;">${esc(r.rankTitle)}</div>`
                                : ''
                            }
                          </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                          <span style="font-size:var(--gt-lb-badge-size,13.5px);font-weight:800;padding:4px 10px;border-radius:7px;background:rgba(255,255,255,0.07);color:${esc(r.badgeColor)};border:1px solid rgba(255,255,255,0.14);">${esc(r.badgeText)}</span>
                          <span style="font-family:ui-monospace,monospace;font-size:var(--gt-lb-score-size,22px);font-weight:900;color:#67e8f9;min-width:86px;text-align:right;">${esc(r.score)} pts</span>
                        </div>
                      </div>`
                    )
                    .join('')}
                </div>`
              : `<div style="background:#0d1117;border:1px dashed #30363d;border-radius:10px;padding:20px;text-align:center;color:#94a3b8;font-size:var(--gt-lobby-size,15px);">
                  No players seated yet — open your personal <strong style="color:#f8fafc;">RobOS Game Theater Google Doc</strong> and click Launch!
                </div>`
          }
        `;
      }

      if (mode === 'lobby') {
        const recentChat = chatLog.slice(-3).reverse();
        const agentBusy = Boolean(agentStatus.busy);
        return `
          <div class="robos-w-meta" style="font-size:var(--gt-meta-size,15px);margin-bottom:10px;">
            <span>🟢 <strong style="color:#f8fafc;">${onlinePlayers.length}</strong> Player${onlinePlayers.length === 1 ? '' : 's'} Connected</span>
            <span class="robos-w-pill" style="font-size:var(--gt-pill-size,13px);padding:3px 12px;${agentBusy ? 'background:rgba(168,85,247,0.22);color:#e9d5ff;border-color:#a855f7;' : ''}">
              ${agentBusy ? '🤖 Agent Building Live' : `📚 ${esc(data.gamesCount ?? (activeGame ? 1 : 0))} Games Ready`}
            </span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
            ${
              onlinePlayers.length > 0
                ? onlinePlayers
                    .map(
                      (p) =>
                        `<span style="display:inline-flex;align-items:center;gap:7px;background:#0d1117;border:1px solid #30363d;border-radius:999px;padding:5px 14px;font-size:var(--gt-lobby-size,14.5px);color:#f8fafc;">
                          <span style="width:9px;height:9px;border-radius:50%;background:#10b981;display:inline-block;"></span>
                          ${esc(p.avatar || '🎮')} <strong>${esc(p.shortName || p.name)}</strong>
                        </span>`
                    )
                    .join('')
                : `<span style="font-size:var(--gt-lobby-size,14.5px);color:#94a3b8;">Lobby open — waiting for Godot 4 HTTPS Web Clients to connect.</span>`
            }
          </div>
          <div style="background:#0d1117;border:1px solid ${agentBusy ? '#7c3aed' : '#263248'};border-left:4px solid ${agentBusy ? '#a855f7' : '#00bcd4'};border-radius:10px;padding:10px 14px;margin-bottom:10px;">
            <div style="font-size:var(--gt-lb-sub-size,12.5px);font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:${agentBusy ? '#d8b4fe' : '#67e8f9'};">
              🤖 Dynamic RobOS Agent Game Studio
            </div>
            <div style="font-size:var(--gt-lobby-size,14.5px);color:#f0f6fc;margin-top:4px;line-height:1.3;">
              ${
                agentBusy
                  ? esc(`${agentStatus.requestedBy || 'Player'}: ${agentStatus.step || 'Generating server.js + Godot 4 client.gd…'}`)
                  : agentStatus.step
                    ? esc(agentStatus.step)
                    : 'Any player can generate a new game or evolve rules live from the lobby.'
              }
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${
              recentChat.length > 0
                ? recentChat
                    .map(
                      (m) => `
                      <div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:7px 11px;font-size:var(--gt-lobby-size,14.5px);display:flex;gap:8px;align-items:baseline;">
                        <strong style="color:#67e8f9;flex-shrink:0;">${esc(m.avatar || '💬')} ${esc(m.name)}:</strong>
                        <span style="color:#f0f6fc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.text)}</span>
                      </div>`
                    )
                    .join('')
                : `<div style="font-size:var(--gt-lobby-size,14px);color:#94a3b8;">💬 Live lobby chat messages appear here during play.</div>`
            }
          </div>
        `;
      }

      // Default mode === 'stage' (Hero 10-foot Spectator Stage, secret-safe!)
      const headerRightPill = isPlaying
        ? `<span class="robos-w-pill" style="background:rgba(16,185,129,0.22);color:#6ee7b7;border-color:rgba(16,185,129,0.55);font-size:var(--gt-pill-size,13.5px);padding:4px 14px;font-weight:800;">● LIVE MATCH · ${seats.length}/${esc(activeGame.maxPlayers)} SEATED</span>`
        : `<span class="robos-w-pill" style="background:rgba(245,158,11,0.18);color:#fcd34d;border-color:rgba(245,158,11,0.5);font-size:var(--gt-pill-size,13.5px);padding:4px 14px;font-weight:800;">● STAGE STANDBY${activeGame ? ` · ${seats.length}/${esc(activeGame.maxPlayers)} SEATED` : ''}</span>`;

      // 1. Universal Timed / Multiple-Choice Trivia Stage (supports `options`, `choices`, or `answers`; `secondsLeft` or `remainingMs`)
      const optionsList =
        view && Array.isArray(view.options) && view.options.length > 0
          ? view.options
          : view && Array.isArray(view.choices) && view.choices.length > 0
            ? view.choices
            : view && Array.isArray(view.answers) && view.answers.length > 0
              ? view.answers
              : null;

      if (isPlaying && view && optionsList) {
        const isGameover = view.phase === 'gameover';
        const isReveal = isRoundReveal;
        const secsLeft =
          view.secondsLeft !== undefined
            ? Math.max(0, Math.ceil(Number(view.secondsLeft)))
            : view.remainingMs !== undefined
              ? Math.max(0, Math.ceil(Number(view.remainingMs) / 1000))
              : 0;
        const totalSecs = Math.max(
          1,
          view.totalSeconds !== undefined
            ? Number(view.totalSeconds)
            : view.totalPhaseMs !== undefined
              ? Math.max(1, Math.ceil(Number(view.totalPhaseMs) / 1000))
              : isReveal
                ? 5
                : 20
        );
        const pct = Math.max(4, Math.min(100, Math.round((secsLeft / totalSecs) * 100)));
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const promptText = String(view.subject || view.prompt || view.question || view.text || activeGame.title);
        const isLongPrompt = promptText.length > 115;
        const totalRoundsSuffix = view.totalRounds
          ? ` OF ${esc(view.totalRounds)}`
          : view.totalBankSize
            ? ` · ${esc(view.totalBankSize)}-Q BANK`
            : '';
        const timerLabel = isGameover
          ? secsLeft > 0
            ? `🏆 FINAL STANDINGS · NEXT IN ${secsLeft}s`
            : '🏆 MATCH COMPLETE'
          : isReveal
            ? secsLeft > 0
              ? `🎉 ANSWER REVEAL · ${secsLeft}s`
              : '🎉 ANSWER REVEAL'
            : `⏱ ${secsLeft}s`;

        return `
          <div class="robos-w-meta" style="font-size:var(--gt-meta-size,15px);margin-bottom:10px;">
            <span>🎭 <strong style="color:#ffffff;">${esc(activeGame.title)}</strong> <code style="color:#67e8f9;">v${esc(activeGame.version || 1)}</code>${view.category ? ` · <span style="color:#e9d5ff;font-weight:800;">📂 ${esc(view.category)}</span>` : ''}</span>
            ${headerRightPill}
          </div>
          <div style="background:#0a0f1a;border:2px solid #263248;border-radius:16px;padding:var(--gt-stage-pad,16px 20px);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span style="background:rgba(0,188,212,0.2);color:#67e8f9;border:1.5px solid rgba(0,188,212,0.5);border-radius:8px;padding:5px 14px;font-size:var(--gt-round-size,14.5px);font-weight:900;letter-spacing:0.03em;">
                  ROUND #${esc(view.roundNumber || view.round || 1)}${totalRoundsSuffix}
                </span>
                <span style="font-size:var(--gt-meta-size,14.5px);color:#cbd5e1;font-weight:700;">
                  🔒 Locked In: <strong style="color:#ffffff;">${esc(view.answeredCount ?? 0)}/${esc(view.playerCount ?? seats.length)}</strong>
                </span>
              </div>
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--gt-timer-size,24px);font-weight:900;color:${isGameover ? '#fcd34d' : isReveal ? '#6ee7b7' : secsLeft <= 5 ? '#fca5a5' : '#fcd34d'};">
                ${esc(timerLabel)}
              </div>
            </div>
            <div style="height:var(--gt-bar-h,8px);background:#050811;border-radius:999px;overflow:hidden;margin-bottom:18px;">
              <div style="height:100%;width:${pct}%;background:${isGameover ? '#f59e0b' : isReveal ? '#10b981' : secsLeft <= 5 ? '#ef4444' : 'linear-gradient(90deg,#00bcd4,#a855f7)'};"></div>
            </div>
            <div style="font-size:${isLongPrompt ? 'var(--gt-prompt-long-size,23px)' : 'var(--gt-prompt-size,27px)'};font-weight:850;color:#ffffff;line-height:1.22;margin-bottom:20px;letter-spacing:-0.015em;white-space:normal;word-break:break-word;">
              ${esc(promptText)}
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--gt-opt-gap,12px);">
              ${optionsList
                .map((opt, idx) => {
                  const isCorrect = isReveal && Number(view.correctIndex) === idx;
                  const borderCol = isCorrect ? '#10b981' : isReveal ? '#1e293b' : '#3b4c6b';
                  const bgCol = isCorrect ? 'rgba(16,185,129,0.22)' : '#141d2e';
                  const badgeBg = isCorrect ? '#10b981' : 'rgba(0,188,212,0.24)';
                  const badgeFg = isCorrect ? '#022c22' : '#67e8f9';
                  return `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;background:${bgCol};border:3px solid ${borderCol};border-radius:14px;padding:var(--gt-opt-pad,13px 16px);opacity:${isReveal && !isCorrect ? '0.58' : '1'};">
                      <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;">
                        <span style="width:var(--gt-opt-badge,34px);height:var(--gt-opt-badge,34px);border-radius:10px;background:${badgeBg};color:${badgeFg};font-weight:900;font-size:var(--gt-opt-badge-font,17px);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
                          ${esc(letters[idx] || idx + 1)}
                        </span>
                        <span style="font-size:var(--gt-opt-size,20px);font-weight:800;color:#ffffff;line-height:1.2;white-space:normal;word-break:break-word;">
                          ${esc(opt)}
                        </span>
                      </div>
                      ${isCorrect ? `<span style="font-size:var(--gt-round-size,14px);font-weight:900;color:#6ee7b7;flex-shrink:0;">✔ CORRECT</span>` : ''}
                    </div>`;
                })
                .join('')}
            </div>
            ${
              isReveal && view.lastWinnerSummary
                ? `<div style="margin-top:14px;padding:10px 16px;border-radius:10px;background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.4);color:#6ee7b7;font-size:var(--gt-meta-size,15px);font-weight:800;">
                    🏆 ${esc(view.lastWinnerSummary)}
                  </div>`
                : ''
            }
          </div>
        `;
      }

      // 2. Word / Hangman Stage (gallows + masked phrase tiles, secret phrase hidden until round_over!)
      if (isPlaying && view && (typeof view.maskedPhrase === 'string' || typeof view.wrongCount === 'number')) {
        const wrong = Math.max(0, Number(view.wrongCount || 0));
        const maxWrong = Math.max(1, Number(view.maxWrong || 6));
        const guessed = Array.isArray(view.guessedLetters) ? view.guessedLetters : [];
        const wrongSet = new Set(Array.isArray(view.wrongLetters) ? view.wrongLetters : []);
        const displayPhrase =
          view.phase === 'choosing'
            ? 'CHOOSING SECRET PHRASE…'
            : String(view.maskedPhrase || '_ _ _ _ _');

        const gallowsSvg = `
          <svg viewBox="0 0 140 160" style="width:var(--gt-gallows-w,144px);height:var(--gt-gallows-h,164px);flex-shrink:0;background:#141d2e;border:2px solid #30363d;border-radius:12px;padding:8px;">
            <line x1="18" y1="146" x2="122" y2="146" stroke="#94a3b8" stroke-width="4.5" stroke-linecap="round"/>
            <line x1="40" y1="146" x2="40" y2="18" stroke="#94a3b8" stroke-width="4.5" stroke-linecap="round"/>
            <line x1="40" y1="18" x2="92" y2="18" stroke="#94a3b8" stroke-width="4.5" stroke-linecap="round"/>
            <line x1="92" y1="18" x2="92" y2="36" stroke="#00bcd4" stroke-width="3.5" stroke-linecap="round"/>
            ${wrong >= 1 ? `<circle cx="92" cy="50" r="13" fill="none" stroke="#ffffff" stroke-width="4"/>` : ''}
            ${wrong >= 2 ? `<line x1="92" y1="63" x2="92" y2="102" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>` : ''}
            ${wrong >= 3 ? `<line x1="92" y1="74" x2="72" y2="92" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>` : ''}
            ${wrong >= 4 ? `<line x1="92" y1="74" x2="112" y2="92" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>` : ''}
            ${wrong >= 5 ? `<line x1="92" y1="102" x2="75" y2="128" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>` : ''}
            ${wrong >= 6 ? `<line x1="92" y1="102" x2="109" y2="128" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>` : ''}
          </svg>`;

        return `
          <div class="robos-w-meta" style="font-size:var(--gt-meta-size,15px);margin-bottom:10px;">
            <span>🎭 <strong style="color:#ffffff;">${esc(activeGame.title)}</strong> · Round #${esc(view.round || 1)}</span>
            ${headerRightPill}
          </div>
          <div style="display:flex;align-items:center;gap:22px;background:#0a0f1a;border:2px solid #263248;border-radius:16px;padding:var(--gt-stage-pad,16px 20px);">
            ${gallowsSvg}
            <div style="flex:1;min-width:0;">
              <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;font-size:var(--gt-meta-size,14.5px);">
                <span style="background:rgba(168,85,247,0.2);color:#e9d5ff;border:1px solid rgba(168,85,247,0.45);padding:4px 12px;border-radius:8px;font-weight:800;">📝 Chooser: ${esc(view.chooserName || 'Player 1')}</span>
                <span style="background:rgba(0,188,212,0.18);color:#67e8f9;border:1px solid rgba(0,188,212,0.45);padding:4px 12px;border-radius:8px;font-weight:800;">🎯 Guesser: ${esc(view.guesserName || 'Player 2')}</span>
                <span style="background:rgba(239,68,68,0.18);color:#fca5a5;border:1px solid rgba(239,68,68,0.45);padding:4px 12px;border-radius:8px;font-weight:800;">✖ Wrong: ${wrong}/${maxWrong}</span>
              </div>
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--gt-phrase-size,28px);font-weight:900;letter-spacing:0.12em;color:${view.phase === 'choosing' ? '#fcd34d' : '#ffffff'};background:#141d2e;border:2px solid #30363d;border-radius:12px;padding:16px 20px;margin-bottom:14px;word-break:break-word;">
                ${esc(displayPhrase)}
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center;">
                <span style="font-size:var(--gt-lobby-size,14px);color:#94a3b8;margin-right:4px;font-weight:700;">Guessed:</span>
                ${
                  guessed.length > 0
                    ? guessed
                        .map((ch) => {
                          const bad = wrongSet.has(ch);
                          return `<span style="font-family:ui-monospace,monospace;font-size:var(--gt-lobby-size,15px);font-weight:900;padding:3px 10px;border-radius:7px;background:${bad ? 'rgba(239,68,68,0.22)' : 'rgba(16,185,129,0.24)'};color:${bad ? '#fca5a5' : '#6ee7b7'};">${esc(ch)}</span>`;
                        })
                        .join('')
                    : `<span style="font-size:var(--gt-lobby-size,14px);color:#94a3b8;">None yet</span>`
                }
              </div>
              ${
                view.statusMessage
                  ? `<div style="font-size:var(--gt-meta-size,15px);color:#67e8f9;margin-top:10px;font-weight:750;">${esc(view.statusMessage)}</div>`
                  : ''
              }
            </div>
          </div>
        `;
      }

      // 3. Generic Dynamic AI Game Stage (for any custom game generated by RobOS Agent!)
      if (isPlaying && view && Object.keys(view).length > 0) {
        const headline =
          view.statusMessage ||
          view.message ||
          view.prompt ||
          view.headline ||
          `Live Phase: ${view.phase || 'In Progress'}`;
        const scalarPairs = Object.entries(view)
          .filter(
            ([k, v]) =>
              !['statusMessage', 'message', 'prompt', 'headline', 'leaderboard', 'scores', 'players'].includes(k) &&
              (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
          )
          .slice(0, 6);

        return `
          <div class="robos-w-meta" style="font-size:var(--gt-meta-size,15px);margin-bottom:10px;">
            <span>🎭 <strong style="color:#ffffff;">${esc(activeGame.title)}</strong> <code style="color:#67e8f9;">v${esc(activeGame.version || 1)}</code></span>
            ${headerRightPill}
          </div>
          <div style="background:#0a0f1a;border:2px solid #263248;border-radius:16px;padding:var(--gt-stage-pad,16px 20px);">
            <div style="font-size:var(--gt-prompt-long-size,24px);font-weight:850;color:#ffffff;line-height:1.25;margin-bottom:16px;">${esc(headline)}</div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
              ${scalarPairs
                .map(
                  ([k, v]) => `
                  <div style="background:#141d2e;border:1.5px solid #30363d;border-radius:10px;padding:12px 14px;">
                    <div style="font-size:var(--gt-lb-sub-size,12px);text-transform:uppercase;color:#94a3b8;font-weight:800;letter-spacing:0.04em;">${esc(k)}</div>
                    <div style="font-size:var(--gt-lb-score-size,20px);font-weight:900;color:#67e8f9;margin-top:4px;">${esc(String(v))}</div>
                  </div>`
                )
                .join('')}
            </div>
          </div>
        `;
      }

      // 4. Standby / Waiting for Players Stage
      return `
        <div class="robos-w-meta" style="font-size:var(--gt-meta-size,15px);margin-bottom:10px;">
          <span>🎭 <strong style="color:#ffffff;">${esc(activeGame ? activeGame.title : 'RobOS AI Multiplayer Game Theater')}</strong></span>
          ${headerRightPill}
        </div>
        <div style="background:#0a0f1a;border:2px solid #263248;border-left:5px solid #00bcd4;border-radius:16px;padding:var(--gt-stage-pad,18px 22px);">
          <div style="font-size:var(--gt-prompt-long-size,24px);font-weight:850;color:#ffffff;margin-bottom:10px;">
            ${activeGame ? `🎮 Ready on Stage: ${esc(activeGame.title)}` : '✨ Stage Ready — Generate Any Multiplayer Game Live'}
          </div>
          <div style="font-size:var(--gt-meta-size,15px);color:#cbd5e1;line-height:1.4;margin-bottom:16px;">
            ${esc(
              activeGame?.description ||
                'Open your personal RobOS Game Theater Google Doc and click Launch to enter the Godot 4 HTTPS Web Client lobby.'
            )}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
            ${
              activeGame
                ? `<span style="background:rgba(0,188,212,0.18);color:#67e8f9;border:1.5px solid rgba(0,188,212,0.45);padding:6px 14px;border-radius:999px;font-size:var(--gt-lobby-size,14.5px);font-weight:800;">
                    Players Required: ${esc(activeGame.minPlayers)}–${esc(activeGame.maxPlayers)} (Seated: ${seats.length})
                  </span>`
                : ''
            }
            ${seats
              .map(
                (s) =>
                  `<span style="background:#141d2e;border:1.5px solid #30363d;padding:6px 14px;border-radius:999px;font-size:var(--gt-lobby-size,14.5px);color:#ffffff;">
                    ${esc(s.avatar || '🎮')} <strong>${esc(s.shortName || s.name)}</strong> (Seated)
                  </span>`
              )
              .join('')}
          </div>
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

    const renderOneCard = (card) => `
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
    `;

    let gridInnerHtml = '';
    if (cards.length > 3 && (layoutId === 'mission-control-3col' || layoutId === 'tv-wallboard-10ft')) {
      const cols = [[], [], []];
      for (const card of cards) {
        if (card.slotId === 'col-1' || card.slotId === 'tv-left' || card.widgetType === 'github-repo' || card.widgetType === 'git-commits') {
          cols[0].push(card);
        } else if (card.slotId === 'col-2' || card.slotId === 'tv-center' || card.widgetType === 'calendar-today' || card.widgetType === 'music-now-playing') {
          cols[1].push(card);
        } else {
          cols[2].push(card);
        }
      }
      gridInnerHtml = cols
        .map(
          (colCards) =>
            `<div class="robos-embed-col" style="display:flex;flex-direction:column;gap:14px;min-width:0;">${colCards
              .map(renderOneCard)
              .join('')}</div>`
        )
        .join('');
    } else {
      gridInnerHtml = cards.map(renderOneCard).join('');
    }

    return `
      <div class="robos-embed-dashboard" data-dashboard-id="${esc(dash.id || 'daily-engineering-ops')}" data-layout-id="${esc(layoutId)}">
        <div class="robos-embed-grid" style="grid-template-columns: ${esc(gridTemplate)};">
          ${gridInnerHtml}
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
      ['robos-widget-live-clock', 'live-clock'],
      ['robos-widget-github-repo', 'github-repo'],
      ['robos-widget-music-player', 'music-now-playing'],
      ['robos-widget-next-meeting', 'next-meeting-countdown'],
      ['robos-widget-voice-dictation', 'voice-dictation'],
      ['robos-widget-game-theater', 'game-theater'],
      ['robos-widget-smart-tv', 'smart-tv'],
      ['robos-widget-smart-lights', 'smart-lights'],
      ['robos-widget-kgraph', 'kgraph-summary'],
      ['robos-widget-sprint-radar', 'sprint-radar'],
      ['robos-widget-custom', 'robos-component'],
    ];

    function drawLiveDashboardCanvases() {
      if (typeof document === 'undefined') return;
      const now = new Date();
      const t24 = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const utc = now.toISOString().slice(11, 19) + ' UTC';
      const dLabel = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      document.querySelectorAll('.js-live-digital-time').forEach((el) => {
        el.textContent = t24;
      });
      document.querySelectorAll('.js-live-utc-time').forEach((el) => {
        el.textContent = utc;
      });
      document.querySelectorAll('.js-live-date-label').forEach((el) => {
        el.textContent = dLabel;
      });

      const ms = now.getMilliseconds();
      const sec = now.getSeconds() + ms / 1000;
      const min = now.getMinutes() + sec / 60;
      const hr = (now.getHours() % 12) + min / 60;

      document.querySelectorAll('.robos-live-clock-canvas').forEach((canvas) => {
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(cx, cy) - 6;
        ctx.clearRect(0, 0, w, h);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#070b14';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 188, 212, 0.45)';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, r - 2, -Math.PI / 2, -Math.PI / 2 + (sec / 60) * Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#10b981';
        ctx.stroke();

        for (let i = 0; i < 60; i++) {
          const ang = (i * Math.PI) / 30;
          const isHour = i % 5 === 0;
          const rIn = r - (isHour ? 10 : 5);
          const rOut = r - 3;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * rIn, cy + Math.sin(ang) * rIn);
          ctx.lineTo(cx + Math.cos(ang) * rOut, cy + Math.sin(ang) * rOut);
          ctx.lineWidth = isHour ? 2 : 1;
          ctx.strokeStyle = isHour ? '#67e8f9' : 'rgba(148, 163, 184, 0.35)';
          ctx.stroke();
        }

        const hrAng = (hr * Math.PI) / 6 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(hrAng) * (r * 0.5), cy + Math.sin(hrAng) * (r * 0.5));
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#f8fafc';
        ctx.stroke();

        const minAng = (min * Math.PI) / 30 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(minAng) * (r * 0.72), cy + Math.sin(minAng) * (r * 0.72));
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#67e8f9';
        ctx.stroke();

        const secAng = (sec * Math.PI) / 30 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(secAng) * 8, cy - Math.sin(secAng) * 8);
        ctx.lineTo(cx + Math.cos(secAng) * (r * 0.82), cy + Math.sin(secAng) * (r * 0.82));
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#10b981';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#00bcd4';
        ctx.fill();
      });

      document.querySelectorAll('.robos-sec-bar-canvas').forEach((canvas) => {
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#090e1a';
        ctx.fillRect(0, 0, w, h);
        const pct = sec / 60;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, '#00bcd4');
        grad.addColorStop(1, '#10b981');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, Math.max(4, w * pct), h);
      });

      document.querySelectorAll('.robos-gh-activity-canvas').forEach((canvas) => {
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#070b14';
        ctx.fillRect(0, 0, w, h);
        const rawCsv = canvas.getAttribute('data-series') || '';
        const parsed = rawCsv ? rawCsv.split(',').map((n) => Number(n) || 0) : [];
        const bars =
          parsed.length >= 10
            ? parsed
            : [0, 15, 14, 22, 38, 95, 29, 2, 8, 1, 14, 0, 1, 17, 2, 32, 39, 20, 20, 19, 36, 17, 31, 21, 36, 48, 29, 16, 7, 25];
        const maxVal = Math.max(40, ...bars);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
        ctx.lineWidth = 1;
        [0.25, 0.5, 0.75].forEach((p) => {
          ctx.beginPath();
          ctx.moveTo(6, h * p);
          ctx.lineTo(w - 6, h * p);
          ctx.stroke();
        });
        const bw = (w - 16) / bars.length;
        for (let i = 0; i < bars.length; i++) {
          const val = bars[i];
          const ratio = val / maxVal;
          const pulse = i === bars.length - 1 ? Math.sin(Date.now() / 300) * 1.5 : 0;
          const bh = Math.min(h - 5, Math.max(3, Math.round(ratio * (h - 9) + pulse)));
          if (i === bars.length - 1) ctx.fillStyle = '#f59e0b';
          else if (val >= 35) ctx.fillStyle = '#10b981';
          else if (val >= 15) ctx.fillStyle = '#00bcd4';
          else ctx.fillStyle = '#a855f7';
          ctx.fillRect(8 + i * bw, h - bh - 2, Math.max(3, bw - 3), bh);
        }
        ctx.beginPath();
        for (let i = 0; i < bars.length; i++) {
          let sum = 0;
          let cnt = 0;
          for (let j = Math.max(0, i - 6); j <= i; j++) {
            sum += bars[j];
            cnt++;
          }
          const ma = sum / Math.max(1, cnt);
          const x = 8 + i * bw + (bw - 3) / 2;
          const y = h - 3 - (ma / maxVal) * (h - 10);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      });

      document.querySelectorAll('.robos-music-eq-canvas').forEach((canvas) => {
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#070b14';
        ctx.fillRect(0, 0, w, h);
        const isPlaying = canvas.getAttribute('data-playing') === '1';
        const count = 24;
        const bw = (w - 16) / count;
        if (!isPlaying) {
          for (let i = 0; i < count; i++) {
            ctx.fillStyle = '#334155';
            ctx.fillRect(8 + i * bw, h - 5, Math.max(4, bw - 4), 3);
          }
          return;
        }
        const t = Date.now() / 180;
        for (let i = 0; i < count; i++) {
          const wave = Math.abs(Math.sin(t + i * 0.45) * Math.cos(t * 0.7 - i * 0.25));
          const bh = Math.max(4, Math.min(h - 4, Math.round(5 + wave * (h - 8))));
          ctx.fillStyle = i % 3 === 0 ? '#a855f7' : i % 2 === 0 ? '#00bcd4' : '#10b981';
          ctx.fillRect(8 + i * bw, h - bh - 2, Math.max(4, bw - 4), bh);
        }
      });

      const nowEpoch = Math.floor(Date.now() / 1000);
      const pad2 = (n) => String(n).padStart(2, '0');
      document.querySelectorAll('.js-next-meeting-countdown').forEach((el) => {
        const target = Number(el.getAttribute('data-target-epoch')) || 0;
        if (!target) return;
        const rem = Math.max(0, target - nowEpoch);
        const d = Math.floor(rem / 86400);
        const h = Math.floor((rem % 86400) / 3600);
        const m = Math.floor((rem % 3600) / 60);
        const s = rem % 60;
        el.textContent =
          'T - ' + (d > 0 ? d + 'd ' : '') + pad2(h) + ':' + pad2(m) + ':' + pad2(s);
      });

      document.querySelectorAll('.robos-meeting-countdown-canvas').forEach((canvas) => {
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return;
        const target = Number(canvas.getAttribute('data-target-epoch')) || 0;
        if (!target) return;
        const rem = Math.max(0, target - nowEpoch);
        const ratio = 1 - Math.min(3600, rem) / 3600;
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(cx, cy) - 6;
        ctx.clearRect(0, 0, w, h);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#070b14';
        ctx.fill();
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.max(0.08, ratio) * Math.PI * 2);
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = rem < 900 ? '#f59e0b' : '#10b981';
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.ceil(rem / 60) + 'm', cx, cy - 4);
        ctx.fillStyle = '#67e8f9';
        ctx.font = '9px sans-serif';
        ctx.fillText('UNTIL', cx, cy + 10);
      });

      document.querySelectorAll('.js-agent-elapsed').forEach((el) => {
        const started = Number(el.getAttribute('data-started-epoch')) || 0;
        if (!started) return;
        const elSec = Math.max(1, nowEpoch - started);
        const eh = Math.floor(elSec / 3600);
        const em = Math.floor((elSec % 3600) / 60);
        const es = elSec % 60;
        el.textContent = '⏱ ' + (eh > 0 ? pad2(eh) + ':' : '') + pad2(em) + ':' + pad2(es);
      });
    }

    if (!global.__robosDashboardCanvasTimer) {
      global.__robosDashboardCanvasTimer = setInterval(drawLiveDashboardCanvases, 250);
    }

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
        setTimeout(drawLiveDashboardCanvases, 15);
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
