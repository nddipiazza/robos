'use strict';

const toastStackPreview = document.getElementById('toast-stack-preview');
const activeToastCount   = document.getElementById('active-toast-count');
const dndToggle          = document.getElementById('dnd-toggle');
const logStream          = document.getElementById('log-stream');
const queueStatus        = document.getElementById('queue-status');

function appendLog(tag, msg) {
  const line = document.createElement('div');
  line.className = 'log-line';
  const now = new Date().toISOString().split('T')[1].slice(0, -1);
  line.innerHTML = `
    <span class="time">[${now}]</span>
    <span class="tag">[${tag}]</span>
    <span>${msg}</span>
  `;
  logStream.insertBefore(line, logStream.firstChild);
}

async function refreshState() {
  try {
    const active = await window.toast.getActiveToasts();
    const queued = await window.toast.getQueuedToasts();
    const prefs = await window.toast.getPrefs();

    activeToastCount.textContent = active.length;
    dndToggle.checked = !!prefs.dnd;
    queueStatus.textContent = `Queue: ${queued.length} items ${prefs.dnd ? '(DND Active)' : ''}`;

    toastStackPreview.innerHTML = '';
    if (active.length === 0) {
      toastStackPreview.innerHTML = `
        <div style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px;">
          No active overlay toasts. Trigger an SDLC notification on the left.
        </div>
      `;
      return;
    }

    active.forEach(t => {
      const el = document.createElement('div');
      el.className = `preview-toast tier-${t.tier}`;
      el.id = `preview-toast-${t.id}`;
      el.innerHTML = `
        <div style="font-size:18px;">${t.tier === 'critical' ? '❌' : (t.tier === 'warning' ? '⚠️' : '🔔')}</div>
        <div style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:12px; color:var(--text-main);">${t.title}</strong>
            <span class="tier-badge ${t.tier}">${t.tier}</span>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Category: ${t.category}</div>
        </div>
      `;
      toastStackPreview.appendChild(el);
    });
  } catch (err) {
    console.error('Failed to refresh toast state:', err);
  }
}

// ── Preset Button Handlers ───────────────────────────────────────────────────
document.getElementById('btn-trigger-ci-info').addEventListener('click', async () => {
  appendLog('EMIT INFO', 'Emitted ci_completed notification (cyan border, 5s timer).');
  await window.toast.emitToast({
    id: 'demo-ci-info',
    category: 'ci_cd',
    tier: 'info',
    title: 'CI Build Completed',
    body: 'All 42 tests passed on branch feat/knowledge-graph',
  });
  await refreshState();
});

document.getElementById('btn-trigger-pr-warning').addEventListener('click', async () => {
  appendLog('EMIT WARNING', 'Emitted pr_review_requested notification (amber border, 15s timer).');
  await window.toast.emitToast({
    id: 'demo-pr-warning',
    category: 'pr_review',
    tier: 'warning',
    title: 'PR Review Requested',
    body: 'Jane requested your architecture review on PR #142',
    action: { type: 'open-app', app: 'git-projects', label: 'View Pull Request' },
  });
  await refreshState();
});

document.getElementById('btn-trigger-ci-crit').addEventListener('click', async () => {
  appendLog('EMIT CRITICAL', 'Emitted critical blocker alert (red border, persistent stay).');
  await window.toast.emitToast({
    id: 'demo-ci-crit',
    category: 'system',
    tier: 'critical',
    title: 'Production Build Failure',
    body: 'Pipeline stopped: schema validation error in entity model',
    action: { type: 'open-app', app: 'git-projects', label: 'Inspect Logs' },
  });
  await refreshState();
});

document.getElementById('btn-trigger-task-info').addEventListener('click', async () => {
  appendLog('EMIT TASK', 'Emitted task_started notification (cyan border).');
  await window.toast.emitToast({
    id: 'demo-task-info',
    category: 'task',
    tier: 'info',
    title: 'Task Assigned: TASK-408',
    body: 'Assigned to implement Toast Daemon notification stack',
  });
  await refreshState();
});

document.getElementById('btn-dismiss-all').addEventListener('click', async () => {
  appendLog('DISMISS ALL', 'Dismissed all active overlay toasts.');
  await window.toast.dismissAll();
  await refreshState();
});

dndToggle.addEventListener('change', async (e) => {
  const isDnd = e.target.checked;
  const current = await window.toast.getPrefs();
  await window.toast.setPrefs({ ...current, dnd: isDnd });
  appendLog('DND TOGGLE', isDnd ? 'Enabled Do Not Disturb mode.' : 'Disabled Do Not Disturb mode (flushed queue).');
  await refreshState();
});

// Periodic state poll
setInterval(refreshState, 1000);
refreshState();
