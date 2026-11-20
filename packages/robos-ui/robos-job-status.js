/**
 * RobOS UI — Reusable Background Job Spinner & Status Popover (<robos-job-status>)
 *
 * A zero-dependency Web Component + Headless Job Manager (`RobosJobManager` / `window.RobosJobs`)
 * for RobOS Electron and web applications. Designed to sit cleanly inside a skinny bottom status
 * toolbar (24px+) with an animated vector spinner when jobs are running, opening a floating
 * non-clipped Job Status & History popover upon click.
 *
 * Usage:
 *   <script src="../../robos-ui/robos-job-status.js"></script>
 *   <robos-job-status id="app-jobs" idle-label="JOBS"></robos-job-status>
 *
 *   // Ergonomic async wrapper:
 *   await window.RobosJobs.run({
 *     title: 'Save to Kdenlive Project',
 *     category: 'KDENLIVE',
 *     detail: 'Rendering 48 kHz stereo mixdown...',
 *     progress: 15,
 *   }, async (job) => {
 *     job.update({ progress: 65, detail: 'Aligning video tracks & writing .kdenlive XML...' });
 *     const res = await doExport();
 *     job.complete({ detail: 'Synced session.kdenlive', outputPath: res.kdenlivePath, actionLabel: 'Reveal' });
 *     return res;
 *   });
 *
 * Events dispatched on <robos-job-status>:
 *   - 'robos-job-change' : { job, jobs, runningCount }
 *   - 'robos-job-action' : { job, outputPath, action }
 */

(function (global) {
  'use strict';

  const JOB_STYLES = `
robos-job-status {
  display: inline-flex;
  align-items: stretch;
  vertical-align: middle;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  user-select: none;
}

.rjs-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  min-height: 20px;
  padding: 0 9px;
  background: transparent;
  color: #cbd5e1;
  border: none;
  border-radius: 3px;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.2px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms ease, color 120ms ease;
}

.rjs-pill-btn:hover {
  background: rgba(56, 189, 248, 0.12);
  color: #f8fafc;
}

.rjs-pill-btn.is-running {
  background: rgba(0, 212, 255, 0.13);
  color: #67e8f9;
}

.rjs-pill-btn.has-error:not(.is-running) {
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}

.rjs-pill-btn.is-open {
  background: rgba(168, 85, 247, 0.2);
  color: #f3e8ff;
}

.rjs-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.rjs-spin-svg {
  animation: rjs-spin 0.78s linear infinite;
}

@keyframes rjs-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.rjs-pill-label {
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rjs-pill-meta {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 3px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.26);
  color: #94a3b8;
  line-height: 15px;
}

.rjs-pill-btn.is-running .rjs-pill-meta {
  border-color: rgba(0, 212, 255, 0.45);
  color: #a5f3fc;
}

/* Floating Fixed Popover (never clipped by footer overflow:hidden) */
.rjs-popover {
  position: fixed;
  z-index: 99999;
  width: 396px;
  max-width: calc(100vw - 16px);
  max-height: min(440px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #151c28 0%, #0d121b 100%);
  color: #e2e8f0;
  border: 1px solid #2e3d54;
  border-radius: 8px;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.72), 0 0 0 1px rgba(0, 212, 255, 0.08);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}

.rjs-popover.hidden {
  display: none !important;
}

.rjs-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  background: #101620;
  border-bottom: 1px solid #253246;
}

.rjs-pop-title-grp {
  display: flex;
  align-items: center;
  gap: 7px;
}

.rjs-pop-title {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.7px;
  color: #f1f5f9;
}

.rjs-pop-summary {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(56, 189, 248, 0.14);
  border: 1px solid rgba(56, 189, 248, 0.34);
  color: #7dd3fc;
}

.rjs-pop-actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.rjs-mini-btn {
  height: 22px;
  padding: 0 7px;
  border-radius: 4px;
  border: 1px solid #2e3c52;
  background: #1a2332;
  color: #cbd5e1;
  font-size: 10px;
  font-weight: 650;
  cursor: pointer;
}

.rjs-mini-btn:hover {
  border-color: #4b6182;
  color: #ffffff;
}

.rjs-pop-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.rjs-empty {
  padding: 22px 14px;
  text-align: center;
  color: #64748b;
  font-size: 11.5px;
}

.rjs-card {
  border: 1px solid #243043;
  border-radius: 6px;
  background: rgba(11, 16, 24, 0.88);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.rjs-card.running {
  border-color: rgba(0, 212, 255, 0.48);
  background: linear-gradient(180deg, rgba(14, 30, 46, 0.88) 0%, rgba(10, 16, 26, 0.94) 100%);
}

.rjs-card.completed {
  border-color: rgba(34, 197, 94, 0.32);
}

.rjs-card.failed {
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(38, 12, 18, 0.45);
}

.rjs-card-top {
  display: flex;
  align-items: center;
  gap: 7px;
}

.rjs-card-title {
  font-size: 11.5px;
  font-weight: 700;
  color: #f1f5f9;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rjs-cat-badge {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(168, 85, 247, 0.16);
  border: 1px solid rgba(168, 85, 247, 0.4);
  color: #e9d5ff;
  flex-shrink: 0;
}

.rjs-card-dur {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: #94a3b8;
  flex-shrink: 0;
}

.rjs-bar-track {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: #1b2433;
  overflow: hidden;
  position: relative;
}

.rjs-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #00d4ff 0%, #a855f7 100%);
  transition: width 160ms ease;
}

.rjs-card.completed .rjs-bar-fill {
  background: #22c55e;
}

.rjs-card.failed .rjs-bar-fill {
  background: #ef4444;
}

.rjs-bar-fill.indeterminate {
  width: 42% !important;
  animation: rjs-indet 1.15s ease-in-out infinite alternate;
}

@keyframes rjs-indet {
  from { transform: translateX(-15%); }
  to { transform: translateX(155%); }
}

.rjs-card-detail {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.35;
  word-break: break-word;
}

.rjs-card.failed .rjs-card-detail {
  color: #fca5a5;
}

.rjs-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 1px;
}

.rjs-out-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: #67e8f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.rjs-steps-details {
  margin-top: 2px;
}

.rjs-steps-details summary {
  font-size: 10px;
  color: #64748b;
  cursor: pointer;
}

.rjs-steps-list {
  margin: 4px 0 0;
  padding-left: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  color: #94a3b8;
  max-height: 84px;
  overflow-y: auto;
}
`;

  const ICONS = {
    spinner: '<svg class="rjs-spin-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2.6" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10"/><circle cx="12" cy="12" r="10" stroke="rgba(0,212,255,0.2)" stroke-width="2.2"/></svg>',
    idle: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    completed: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    failed: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    canceled: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="8" y1="16" x2="16" y2="8"/></svg>',
  };

  function escHtml(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatElapsedMs(ms) {
    const safe = Math.max(0, Number(ms) || 0);
    if (safe < 60000) return `${(safe / 1000).toFixed(1)}s`;
    const mins = Math.floor(safe / 60000);
    const secs = ((safe % 60000) / 1000).toFixed(0).padStart(2, '0');
    return `${mins}m ${secs}s`;
  }

  function baseNameOf(p) {
    const s = String(p || '');
    if (!s) return '';
    const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    return idx >= 0 ? s.slice(idx + 1) : s;
  }

  function injectJobStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.getElementById('robos-job-status-styles')) return;
    const style = document.createElement('style');
    style.id = 'robos-job-status-styles';
    style.textContent = JOB_STYLES;
    document.head.appendChild(style);
  }

  // ── Headless Reusable RobosJobManager (usable in Browser, Electron, & Node Tests) ──

  class RobosJobManager {
    constructor({ maxHistory = 30 } = {}) {
      this.maxHistory = Math.max(5, Number(maxHistory) || 30);
      this._jobs = [];
      this._seq = 1;
      this._listeners = new Set();
    }

    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    _emit(changedJob = null) {
      const snap = this.getSnapshot();
      for (const fn of this._listeners) {
        try { fn({ job: changedJob, ...snap }); } catch {}
      }
    }

    getJobs() {
      return this._jobs.map(j => ({ ...j, steps: [...j.steps] }));
    }

    getRunningJobs() {
      return this._jobs.filter(j => j.status === 'running').map(j => ({ ...j, steps: [...j.steps] }));
    }

    getSnapshot() {
      const jobs = this.getJobs();
      const running = jobs.filter(j => j.status === 'running');
      const failedCount = jobs.filter(j => j.status === 'failed').length;
      return {
        jobs,
        runningJobs: running,
        runningCount: running.length,
        totalCount: jobs.length,
        failedCount,
      };
    }

    startJob(spec = {}) {
      const now = Date.now();
      const id = spec.id || `rjob-${now.toString(36)}-${this._seq++}`;
      const progress = (spec.progress !== undefined && spec.progress !== null && Number.isFinite(Number(spec.progress)))
        ? Math.max(0, Math.min(100, Number(spec.progress)))
        : null;
      const detail = String(spec.detail || 'Starting...').trim();

      const job = {
        id,
        title: String(spec.title || 'Background Job').trim(),
        category: String(spec.category || 'JOB').trim().toUpperCase(),
        status: 'running', // 'running' | 'completed' | 'failed' | 'canceled'
        detail,
        progress,
        startedAt: now,
        endedAt: null,
        durationMs: 0,
        outputPath: spec.outputPath ? String(spec.outputPath) : '',
        actionLabel: spec.actionLabel ? String(spec.actionLabel) : '',
        onAction: typeof spec.onAction === 'function' ? spec.onAction : null,
        metadata: spec.metadata && typeof spec.metadata === 'object' ? { ...spec.metadata } : {},
        steps: detail ? [{ timeMs: 0, detail, progress }] : [],
      };

      this._jobs.unshift(job);
      this._pruneHistory();
      this._emit(job);

      return this._createHandle(job.id);
    }

    _findJob(id) {
      return this._jobs.find(j => j.id === id) || null;
    }

    _pruneHistory() {
      if (this._jobs.length <= this.maxHistory) return;
      const running = this._jobs.filter(j => j.status === 'running');
      const finished = this._jobs.filter(j => j.status !== 'running');
      const keepFinished = finished.slice(0, Math.max(1, this.maxHistory - running.length));
      const allowed = new Set([...running, ...keepFinished].map(j => j.id));
      this._jobs = this._jobs.filter(j => allowed.has(j.id));
    }

    updateJob(id, patch = {}) {
      const job = this._findJob(id);
      if (!job) return null;

      if (patch.title !== undefined) job.title = String(patch.title);
      if (patch.category !== undefined) job.category = String(patch.category).toUpperCase();
      if (patch.outputPath !== undefined) job.outputPath = String(patch.outputPath || '');
      if (patch.actionLabel !== undefined) job.actionLabel = String(patch.actionLabel || '');
      if (typeof patch.onAction === 'function') job.onAction = patch.onAction;
      if (patch.metadata && typeof patch.metadata === 'object') {
        job.metadata = { ...job.metadata, ...patch.metadata };
      }

      if (patch.progress !== undefined) {
        job.progress = (patch.progress === null || !Number.isFinite(Number(patch.progress)))
          ? null
          : Math.max(0, Math.min(100, Number(patch.progress)));
      }

      if (patch.detail !== undefined) {
        const nextDetail = String(patch.detail || '').trim();
        if (nextDetail && nextDetail !== job.detail) {
          job.detail = nextDetail;
          if (patch.appendStep !== false) {
            job.steps.push({
              timeMs: Math.max(0, Date.now() - job.startedAt),
              detail: nextDetail,
              progress: job.progress,
            });
            if (job.steps.length > 25) job.steps.shift();
          }
        }
      }

      this._emit(job);
      return { ...job };
    }

    completeJob(id, patch = {}) {
      const job = this._findJob(id);
      if (!job) return null;
      const now = Date.now();
      if (patch && typeof patch === 'object') {
        this.updateJob(id, { ...patch, progress: 100 });
      }
      job.status = 'completed';
      job.progress = 100;
      job.endedAt = now;
      job.durationMs = Math.max(1, now - job.startedAt);
      if (!job.detail || job.detail === 'Starting...') {
        job.detail = 'Completed';
      }
      this._emit(job);
      return { ...job };
    }

    failJob(id, errOrPatch = {}) {
      const job = this._findJob(id);
      if (!job) return null;
      const now = Date.now();
      const patch = typeof errOrPatch === 'string'
        ? { detail: errOrPatch }
        : (errOrPatch instanceof Error ? { detail: errOrPatch.message } : (errOrPatch || {}));
      this.updateJob(id, patch);
      job.status = 'failed';
      job.endedAt = now;
      job.durationMs = Math.max(1, now - job.startedAt);
      this._emit(job);
      return { ...job };
    }

    cancelJob(id, detail = 'Canceled') {
      const job = this._findJob(id);
      if (!job) return null;
      const now = Date.now();
      this.updateJob(id, { detail });
      job.status = 'canceled';
      job.endedAt = now;
      job.durationMs = Math.max(1, now - job.startedAt);
      this._emit(job);
      return { ...job };
    }

    clearFinished() {
      this._jobs = this._jobs.filter(j => j.status === 'running');
      this._emit(null);
    }

    _createHandle(id) {
      return {
        id,
        update: (patch) => this.updateJob(id, patch),
        step: (detail, progress) => this.updateJob(id, { detail, ...(progress !== undefined ? { progress } : {}) }),
        complete: (patch) => this.completeJob(id, patch),
        fail: (errOrPatch) => this.failJob(id, errOrPatch),
        cancel: (detail) => this.cancelJob(id, detail),
        getSnapshot: () => {
          const j = this._findJob(id);
          return j ? { ...j, steps: [...j.steps] } : null;
        },
      };
    }

    async run(spec, asyncFn) {
      const handle = this.startJob(spec);
      try {
        const result = await asyncFn(handle);
        const cur = this._findJob(handle.id);
        if (cur && cur.status === 'running') {
          if (result && typeof result === 'object' && result.canceled) {
            handle.cancel(result.detail || 'Canceled');
          } else if (result && typeof result === 'object' && result.ok === false) {
            handle.fail(result.error || result.detail || 'Job failed');
          } else {
            const outPath = (result && typeof result === 'object')
              ? (result.filePath || result.kdenlivePath || result.outputPath || result.karFile || '')
              : '';
            handle.complete({
              ...(outPath ? { outputPath: outPath, actionLabel: spec.actionLabel || 'Reveal' } : {}),
            });
          }
        }
        return result;
      } catch (err) {
        const cur = this._findJob(handle.id);
        if (cur && cur.status === 'running') {
          handle.fail(err?.message || String(err));
        }
        throw err;
      }
    }
  }

  // Shared default manager instance so window.RobosJobs works out of the box across an entire app
  const defaultManager = new RobosJobManager();

  const BaseElement = (typeof HTMLElement !== 'undefined') ? HTMLElement : class {};

  class RobosJobStatus extends BaseElement {
    static get observedAttributes() {
      return ['idle-label', 'max-history'];
    }

    constructor() {
      super();
      this._manager = defaultManager;
      this._isOpen = false;
      this._tickTimer = null;
      this._unsub = null;
      this._popoverEl = null;
      this._pillBtn = null;
      this._boundDocClick = (ev) => this._handleDocumentClick(ev);
      this._boundKeyDown = (ev) => {
        if (ev.key === 'Escape' && this._isOpen) {
          this.closePopover();
        }
      };
    }

    get manager() {
      return this._manager;
    }

    set manager(mgr) {
      if (mgr instanceof RobosJobManager && mgr !== this._manager) {
        if (this._unsub) this._unsub();
        this._manager = mgr;
        this._unsub = this._manager.subscribe((payload) => this._onManagerUpdate(payload));
        this._renderAll();
      }
    }

    connectedCallback() {
      injectJobStyles();
      if (this.hasAttribute('max-history')) {
        this._manager.maxHistory = Math.max(5, Number(this.getAttribute('max-history')) || 30);
      }

      if (!this._pillBtn) {
        this.innerHTML = `
          <button type="button" class="rjs-pill-btn" aria-haspopup="dialog" aria-expanded="false" title="Click to view running &amp; recent background jobs">
            <span class="rjs-ico">${ICONS.idle}</span>
            <span class="rjs-pill-label">${escHtml(this.getAttribute('idle-label') || 'JOBS')}</span>
            <span class="rjs-pill-meta">0</span>
          </button>
        `;
        this._pillBtn = this.querySelector('.rjs-pill-btn');
        this._pillBtn?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.togglePopover();
        });
      }

      this._ensurePopoverMounted();
      this._unsub = this._manager.subscribe((payload) => this._onManagerUpdate(payload));
      if (typeof document !== 'undefined') {
        document.addEventListener('click', this._boundDocClick);
        document.addEventListener('keydown', this._boundKeyDown);
      }
      this._renderAll();
    }

    disconnectedCallback() {
      if (this._unsub) {
        this._unsub();
        this._unsub = null;
      }
      this._stopElapsedTicker();
      if (typeof document !== 'undefined') {
        document.removeEventListener('click', this._boundDocClick);
        document.removeEventListener('keydown', this._boundKeyDown);
      }
      if (this._popoverEl && this._popoverEl.parentNode) {
        this._popoverEl.parentNode.removeChild(this._popoverEl);
        this._popoverEl = null;
      }
    }

    attributeChangedCallback() {
      if (this._pillBtn) this._renderPill();
    }

    // Convenience methods directly on the <robos-job-status> element
    startJob(spec) { return this._manager.startJob(spec); }
    updateJob(id, patch) { return this._manager.updateJob(id, patch); }
    completeJob(id, patch) { return this._manager.completeJob(id, patch); }
    failJob(id, err) { return this._manager.failJob(id, err); }
    cancelJob(id, detail) { return this._manager.cancelJob(id, detail); }
    runJob(spec, fn) { return this._manager.run(spec, fn); }
    clearFinished() { return this._manager.clearFinished(); }
    getSnapshot() { return this._manager.getSnapshot(); }

    togglePopover() {
      if (this._isOpen) this.closePopover();
      else this.openPopover();
    }

    openPopover() {
      this._ensurePopoverMounted();
      this._isOpen = true;
      this._pillBtn?.classList.add('is-open');
      this._pillBtn?.setAttribute('aria-expanded', 'true');
      if (this._popoverEl) {
        this._popoverEl.classList.remove('hidden');
        this._renderPopoverList();
        this._positionPopover();
      }
    }

    closePopover() {
      this._isOpen = false;
      this._pillBtn?.classList.remove('is-open');
      this._pillBtn?.setAttribute('aria-expanded', 'false');
      this._popoverEl?.classList.add('hidden');
    }

    _handleDocumentClick(ev) {
      if (!this._isOpen) return;
      if (this.contains?.(ev.target)) return;
      if (this._popoverEl && this._popoverEl.contains?.(ev.target)) return;
      this.closePopover();
    }

    _ensurePopoverMounted() {
      if (this._popoverEl || typeof document === 'undefined' || !document.body) return;
      const pop = document.createElement('div');
      pop.className = 'rjs-popover hidden';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Background Jobs Status');
      pop.innerHTML = `
        <div class="rjs-pop-head">
          <div class="rjs-pop-title-grp">
            <span class="rjs-pop-title">JOBS &amp; EXPORTS</span>
            <span class="rjs-pop-summary">0 ACTIVE</span>
          </div>
          <div class="rjs-pop-actions">
            <button type="button" class="rjs-mini-btn" data-rjs-act="clear">Clear Done</button>
            <button type="button" class="rjs-mini-btn" data-rjs-act="close" aria-label="Close Jobs Panel">&times;</button>
          </div>
        </div>
        <div class="rjs-pop-list"></div>
      `;
      pop.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const actBtn = ev.target.closest?.('[data-rjs-act]');
        if (!actBtn) return;
        const act = actBtn.getAttribute('data-rjs-act');
        if (act === 'close') {
          this.closePopover();
        } else if (act === 'clear') {
          this._manager.clearFinished();
        } else if (act === 'job-action') {
          const jobId = actBtn.getAttribute('data-job-id');
          const rawJob = this._manager._findJob(jobId);
          if (!rawJob) return;
          if (typeof rawJob.onAction === 'function') {
            rawJob.onAction(rawJob);
          }
          if (typeof CustomEvent !== 'undefined') {
            this.dispatchEvent(new CustomEvent('robos-job-action', {
              bubbles: true,
              detail: { job: { ...rawJob }, outputPath: rawJob.outputPath, action: 'reveal' },
            }));
          }
        }
      });
      document.body.appendChild(pop);
      this._popoverEl = pop;
    }

    _positionPopover() {
      if (!this._popoverEl || !this._pillBtn || typeof window === 'undefined') return;
      const rect = this._pillBtn.getBoundingClientRect();
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 720;
      const popW = Math.min(396, vw - 16);

      let left = Math.round(rect.right - popW);
      if (left < 8) left = Math.max(8, Math.round(rect.left));
      if (left + popW > vw - 8) left = Math.max(8, vw - popW - 8);

      const bottomOffset = Math.max(8, Math.round(vh - rect.top + 6));
      this._popoverEl.style.left = `${left}px`;
      this._popoverEl.style.bottom = `${bottomOffset}px`;
      this._popoverEl.style.top = 'auto';
    }

    _onManagerUpdate(payload) {
      const snap = this._manager.getSnapshot();
      if (snap.runningCount > 0) this._startElapsedTicker();
      else this._stopElapsedTicker();

      this._renderAll();
      if (typeof CustomEvent !== 'undefined') {
        this.dispatchEvent(new CustomEvent('robos-job-change', {
          bubbles: true,
          detail: payload,
        }));
      }
    }

    _startElapsedTicker() {
      if (this._tickTimer) return;
      this._tickTimer = setInterval(() => {
        if (this._manager.getRunningJobs().length === 0) {
          this._stopElapsedTicker();
          return;
        }
        this._renderPill();
        if (this._isOpen) this._renderPopoverList();
      }, 250);
    }

    _stopElapsedTicker() {
      if (this._tickTimer) {
        clearInterval(this._tickTimer);
        this._tickTimer = null;
      }
    }

    _renderAll() {
      this._renderPill();
      if (this._isOpen) {
        this._renderPopoverList();
        this._positionPopover();
      }
    }

    _renderPill() {
      if (!this._pillBtn) return;
      const snap = this._manager.getSnapshot();
      const icoEl = this._pillBtn.querySelector('.rjs-ico');
      const lblEl = this._pillBtn.querySelector('.rjs-pill-label');
      const metaEl = this._pillBtn.querySelector('.rjs-pill-meta');
      const idleLabel = this.getAttribute('idle-label') || 'JOBS';

      this._pillBtn.classList.toggle('is-running', snap.runningCount > 0);
      const latest = snap.jobs[0] || null;
      this._pillBtn.classList.toggle('has-error', snap.runningCount === 0 && latest?.status === 'failed');

      if (snap.runningCount > 0) {
        const primary = snap.runningJobs[0];
        if (icoEl) icoEl.innerHTML = ICONS.spinner;
        if (lblEl) {
          lblEl.textContent = snap.runningCount > 1
            ? `${snap.runningCount} Jobs · ${primary.title}`
            : primary.title;
        }
        if (metaEl) {
          metaEl.textContent = primary.progress !== null
            ? `${Math.round(primary.progress)}%`
            : formatElapsedMs(Date.now() - primary.startedAt);
        }
        return;
      }

      if (latest) {
        if (icoEl) {
          icoEl.innerHTML = latest.status === 'failed'
            ? ICONS.failed
            : (latest.status === 'canceled' ? ICONS.canceled : ICONS.completed);
        }
        if (lblEl) lblEl.textContent = idleLabel;
        if (metaEl) metaEl.textContent = String(snap.totalCount);
        return;
      }

      if (icoEl) icoEl.innerHTML = ICONS.idle;
      if (lblEl) lblEl.textContent = idleLabel;
      if (metaEl) metaEl.textContent = '0';
    }

    _renderPopoverList() {
      if (!this._popoverEl) return;
      const snap = this._manager.getSnapshot();
      const sumEl = this._popoverEl.querySelector('.rjs-pop-summary');
      const listEl = this._popoverEl.querySelector('.rjs-pop-list');
      if (sumEl) {
        sumEl.textContent = snap.runningCount > 0
          ? `${snap.runningCount} RUNNING · ${snap.totalCount - snap.runningCount} DONE`
          : `${snap.totalCount} FINISHED`;
      }
      if (!listEl) return;

      if (snap.jobs.length === 0) {
        listEl.innerHTML = '<div class="rjs-empty">No background export or processing jobs in this session yet.</div>';
        return;
      }

      // Sort running jobs first, then newest first
      const ordered = [
        ...snap.jobs.filter(j => j.status === 'running'),
        ...snap.jobs.filter(j => j.status !== 'running'),
      ];

      const now = Date.now();
      listEl.innerHTML = ordered.map((j) => {
        const ico = j.status === 'running'
          ? ICONS.spinner
          : (j.status === 'failed' ? ICONS.failed : (j.status === 'canceled' ? ICONS.canceled : ICONS.completed));
        const durText = j.status === 'running'
          ? formatElapsedMs(now - j.startedAt)
          : formatElapsedMs(j.durationMs || (j.endedAt ? j.endedAt - j.startedAt : 0));
        const isIndet = j.status === 'running' && (j.progress === null || j.progress === undefined);
        const pct = j.progress !== null && j.progress !== undefined ? Math.round(j.progress) : (j.status === 'completed' ? 100 : 0);

        const outBase = baseNameOf(j.outputPath);
        const footHtml = (outBase || j.actionLabel || j.onAction)
          ? `<div class="rjs-card-foot">
              <span class="rjs-out-path" title="${escHtml(j.outputPath)}">${escHtml(outBase)}</span>
              ${(j.outputPath || j.actionLabel || j.onAction)
                ? `<button type="button" class="rjs-mini-btn" data-rjs-act="job-action" data-job-id="${escHtml(j.id)}">${escHtml(j.actionLabel || 'Reveal')}</button>`
                : ''}
            </div>`
          : '';

        const stepsHtml = (Array.isArray(j.steps) && j.steps.length > 1)
          ? `<details class="rjs-steps-details">
              <summary>${j.steps.length} status steps</summary>
              <ul class="rjs-steps-list">
                ${j.steps.map(s => `<li>[${formatElapsedMs(s.timeMs)}] ${escHtml(s.detail)}</li>`).join('')}
              </ul>
            </details>`
          : '';

        return `
          <div class="rjs-card ${escHtml(j.status)}" data-job-card="${escHtml(j.id)}">
            <div class="rjs-card-top">
              <span class="rjs-ico">${ico}</span>
              <span class="rjs-card-title" title="${escHtml(j.title)}">${escHtml(j.title)}</span>
              <span class="rjs-cat-badge">${escHtml(j.category)}</span>
              <span class="rjs-card-dur">${escHtml(durText)}</span>
            </div>
            <div class="rjs-bar-track">
              <div class="rjs-bar-fill${isIndet ? ' indeterminate' : ''}" style="width:${pct}%"></div>
            </div>
            <div class="rjs-card-detail">${escHtml(j.detail || '')}</div>
            ${footHtml}
            ${stepsHtml}
          </div>
        `;
      }).join('');
    }
  }

  if (typeof customElements !== 'undefined' && !customElements.get('robos-job-status')) {
    customElements.define('robos-job-status', RobosJobStatus);
  }

  const RobosJobsFacade = {
    manager: defaultManager,
    start: (spec) => defaultManager.startJob(spec),
    update: (id, patch) => defaultManager.updateJob(id, patch),
    complete: (id, patch) => defaultManager.completeJob(id, patch),
    fail: (id, err) => defaultManager.failJob(id, err),
    cancel: (id, detail) => defaultManager.cancelJob(id, detail),
    run: (spec, fn) => defaultManager.run(spec, fn),
    clearFinished: () => defaultManager.clearFinished(),
    getSnapshot: () => defaultManager.getSnapshot(),
    subscribe: (fn) => defaultManager.subscribe(fn),
  };

  global.RobosJobManager = RobosJobManager;
  global.RobosJobStatus = RobosJobStatus;
  global.RobosJobs = RobosJobsFacade;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      RobosJobManager,
      RobosJobStatus,
      RobosJobs: RobosJobsFacade,
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
