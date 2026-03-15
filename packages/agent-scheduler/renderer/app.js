'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let schedules = [];
let currentId = null;  // selected schedule id (null = new)
let systemJobs = [];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  populateDomSelect();
  [schedules, systemJobs] = await Promise.all([
    window.robosScheduler.getSchedules(),
    window.robosScheduler.getSystemJobs(),
  ]);
  renderSystemJobs();
  renderList();
  initResizer();
}

function initResizer() {
  const resizer = document.getElementById('panel-resizer');
  const panel   = document.querySelector('.schedule-list-panel');
  if (!resizer || !panel) return;
  let startX, startW;
  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (e) => {
      const w = Math.max(240, Math.min(520, startW + e.clientX - startX));
      panel.style.width = w + 'px';
    };
    const onUp = () => {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function populateDomSelect() {
  const sel = document.getElementById('f-dom');
  for (let i = 1; i <= 31; i++) {
    const o = document.createElement('option');
    o.value = i; o.textContent = i;
    sel.appendChild(o);
  }
}

// ── System Jobs list ──────────────────────────────────────────────────────────
function renderSystemJobs() {
  const container = document.getElementById('system-job-list');
  if (!container) return;
  container.innerHTML = '';
  systemJobs.forEach(j => {
    const item = document.createElement('div');
    item.className = 'sj-item';
    const lastRun = j.lastRun ? `Last run: ${new Date(j.lastRun).toLocaleString()}` : 'Never run';
    item.innerHTML = `
      <div class="sj-left">
        <div class="sj-info">
          <div class="sj-name">${j.icon || '⚙'} ${esc(j.name)}</div>
          <div class="sj-meta">${lastRun}</div>
        </div>
        <button class="sj-toggle ${j.enabled ? 'on' : 'off'}" data-id="${j.id}" title="${j.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}">${j.enabled ? 'ON' : 'OFF'}</button>
      </div>
      <div class="sj-right">
        <span class="sj-time-label">Run at:</span>
        <input type="time" class="sj-time" value="${j.time}" data-id="${j.id}" title="Daily run time"/>
        <button class="sj-run-btn" data-id="${j.id}" title="Run now">▶</button>
      </div>`;
    container.appendChild(item);
  });

  // Wire time changes
  container.querySelectorAll('.sj-time').forEach(input => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id;
      await window.robosScheduler.saveSystemJobSettings(id, { time: input.value });
      const j = systemJobs.find(j => j.id === id);
      if (j) j.time = input.value;
    });
  });

  // Wire run-now
  container.querySelectorAll('.sj-run-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      btn.textContent = '…';
      btn.disabled = true;
      const result = await window.robosScheduler.runSystemJob(id);
      btn.textContent = '▶';
      btn.disabled = false;
      if (result && result.error) {
        alert('System job failed: ' + result.error);
      } else {
        // Refresh to show lastRun
        systemJobs = await window.robosScheduler.getSystemJobs();
        renderSystemJobs();
      }
    });
  });

  // Wire toggle
  container.querySelectorAll('.sj-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const j = systemJobs.find(j => j.id === id);
      if (!j) return;
      j.enabled = !j.enabled;
      await window.robosScheduler.saveSystemJobSettings(id, { enabled: j.enabled });
      renderSystemJobs();
    });
  });
}

// ── Schedule list ─────────────────────────────────────────────────────────────
function renderList() {
  const container = document.getElementById('schedule-list');
  document.getElementById('schedule-count').textContent = schedules.length;
  if (!schedules.length) {
    container.innerHTML = '<div class="list-empty">No schedules yet.<br/>Click <strong>＋ New Schedule</strong> to begin.</div>';
    return;
  }
  container.innerHTML = '';
  schedules.forEach(s => {
    const item = document.createElement('div');
    item.className = 'sched-item' + (s.id === currentId ? ' selected' : '');
    item.dataset.id = s.id;
    const recLabel = recurrenceLabel(s.recurrence);
    item.innerHTML = `
      <span class="sched-dot ${s.enabled ? 'enabled' : ''}"></span>
      <div class="sched-info">
        <div class="sched-name">${esc(s.name || 'Untitled')}</div>
        <div class="sched-meta ${s.commandType === 'copilot' ? 'copilot' : ''}">${esc(recLabel)} · ${s.commandType === 'copilot' ? '✦ AI' : '⌨ Shell'}</div>
      </div>
      <button class="sched-toggle ${s.enabled ? 'on' : ''}" data-id="${s.id}">${s.enabled ? 'ON' : 'OFF'}</button>`;
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('sched-toggle')) selectSchedule(s.id);
    });
    item.querySelector('.sched-toggle').addEventListener('click', async (e) => {
      e.stopPropagation();
      const enabled = await window.robosScheduler.toggleSchedule(s.id);
      s.enabled = enabled;
      renderList();
    });
    container.appendChild(item);
  });
}

function recurrenceLabel(r) {
  if (!r) return 'No recurrence';
  const t = r.time || '09:00';
  switch (r.type) {
    case 'hourly':  return `Every hour at :${String(r.minuteOffset || 0).padStart(2,'0')}`;
    case 'daily':   return `Daily at ${t}`;
    case 'weekly': {
      const names = ['Su','Mo','Tu','We','Th','Fr','Sa'];
      const days = (r.days || [1]).map(d => names[d]).join(', ');
      return `Weekly ${days} at ${t}`;
    }
    case 'monthly': return `Monthly on day ${r.dayOfMonth || 1} at ${t}`;
    case 'once':    return `Once on ${r.date || '?'} at ${t}`;
    case 'cron':    return `Cron: ${r.cronExpr || '?'}`;
    default:        return r.type;
  }
}

// ── Select / load schedule into form ─────────────────────────────────────────
async function selectSchedule(id) {
  currentId = id;
  const s = schedules.find(s => s.id === id);
  if (!s) return;
  renderList();
  showForm(s);
  // Load run log
  const log = await window.robosScheduler.getRunLog(id);
  document.getElementById('run-log').textContent = log || 'No runs yet.';
  document.getElementById('last-run-info').textContent = s.lastRun
    ? `Last run: ${new Date(s.lastRun).toLocaleString()}`
    : 'Never run';
}

function showForm(s) {
  document.getElementById('editor-empty').classList.add('hidden');
  document.getElementById('editor-form').classList.remove('hidden');

  document.getElementById('f-name').value    = s.name    || '';
  document.getElementById('f-command').value = s.command || '';

  // Command type
  const ct = s.commandType || 'shell';
  document.querySelector(`input[name="cmdType"][value="${ct}"]`).checked = true;
  updateCmdHints(ct);

  // Notification checkboxes
  document.getElementById('f-notify-run').checked  = s.notifyOnRun  !== false;
  document.getElementById('f-notify-done').checked = s.notifyOnDone !== false;

  // Recurrence
  const r = s.recurrence || { type: 'daily', time: '09:00' };
  setRecurrenceType(r.type || 'daily');
  document.getElementById('f-time').value = r.time || '09:00';

  // Weekly days
  document.querySelectorAll('.day-cb input').forEach(cb => {
    cb.checked = (r.days || [1,2,3,4,5]).includes(parseInt(cb.value));
  });

  // Monthly day-of-month
  document.getElementById('f-dom').value = r.dayOfMonth || 1;

  // Once date
  document.getElementById('f-date').value = r.date || '';

  // Hourly minute
  document.getElementById('f-minute').value = r.minuteOffset != null ? r.minuteOffset : 0;

  // Cron
  document.getElementById('f-cron').value = r.cronExpr || '';

  updateCronPreview();
}

function startNew() {
  currentId = null;
  renderList();
  showForm({ name: '', command: '', commandType: 'shell', enabled: true,
    recurrence: { type: 'daily', time: '09:00' } });
  document.getElementById('f-name').focus();
}

// ── Recurrence type switching ─────────────────────────────────────────────────
function setRecurrenceType(type) {
  document.querySelectorAll('.rec-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  const isManual = type === 'manual';
  document.getElementById('rec-time-row').classList.toggle('hidden',   isManual || type === 'hourly' || type === 'cron');
  document.getElementById('rec-days-row').classList.toggle('hidden',   type !== 'weekly');
  document.getElementById('rec-dom-row').classList.toggle('hidden',    type !== 'monthly');
  document.getElementById('rec-date-row').classList.toggle('hidden',   type !== 'once');
  document.getElementById('rec-minute-row').classList.toggle('hidden', type !== 'hourly');
  document.getElementById('rec-cron-row').classList.toggle('hidden',   type !== 'cron');
  document.getElementById('cron-preview').classList.toggle('hidden',   isManual);
  document.getElementById('manual-note').classList.toggle('hidden',    !isManual);
}

function currentRecurrenceType() {
  return document.querySelector('.rec-tab.active')?.dataset.type || 'daily';
}

function getRecurrenceFromForm() {
  const type = currentRecurrenceType();
  const r = { type, time: document.getElementById('f-time').value || '09:00' };
  if (type === 'weekly') {
    r.days = Array.from(document.querySelectorAll('.day-cb input:checked')).map(cb => parseInt(cb.value));
    if (!r.days.length) r.days = [1];
  }
  if (type === 'monthly') r.dayOfMonth = parseInt(document.getElementById('f-dom').value) || 1;
  if (type === 'once')    r.date = document.getElementById('f-date').value;
  if (type === 'hourly')  r.minuteOffset = parseInt(document.getElementById('f-minute').value) || 0;
  if (type === 'cron')    r.cronExpr = document.getElementById('f-cron').value;
  return r;
}

async function updateCronPreview() {
  const s = buildScheduleFromForm();
  const expr = await window.robosScheduler.humanizeCron(s);
  const label = recurrenceLabel(s.recurrence);
  document.getElementById('cron-preview').textContent = `${label}  →  cron: ${expr}`;
}

function updateCmdHints(type) {
  document.getElementById('cmd-hint-copilot').classList.toggle('hidden', type !== 'copilot');
  document.getElementById('cmd-hint-shell').classList.toggle('hidden',   type !== 'shell');
  const ta = document.getElementById('f-command');
  if (type === 'copilot') {
    ta.placeholder = 'Describe what you want the AI to do…\ne.g. Review my open PRs and write a summary to the Work Journal\ne.g. Check for stale issues and notify me';
  } else {
    ta.placeholder = 'Enter a shell command…\ne.g. robos-journal-append --section "Daily PRs" "$(gh search prs --author @me --state open --json number,title --limit 5)"\ne.g. robos-notify "Standup" "Time for daily standup!"';
  }
}

// ── Build schedule object from form ──────────────────────────────────────────
function buildScheduleFromForm() {
  return {
    id:           currentId || undefined,
    name:         document.getElementById('f-name').value.trim() || 'Untitled',
    commandType:  document.querySelector('input[name="cmdType"]:checked')?.value || 'shell',
    command:      document.getElementById('f-command').value.trim(),
    enabled:      currentId ? (schedules.find(s => s.id === currentId)?.enabled ?? true) : true,
    notifyOnRun:  document.getElementById('f-notify-run').checked,
    notifyOnDone: document.getElementById('f-notify-done').checked,
    recurrence:   getRecurrenceFromForm(),
  };
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  try {
    const s = buildScheduleFromForm();
    if (!s.command) return;
    const saved = await window.robosScheduler.saveSchedule(s);
    if (!saved) return;
    currentId = saved.id;
    schedules = await window.robosScheduler.getSchedules();
    renderList();
    showForm(saved);
  } catch (err) {
    console.error('save error:', err && err.message ? err.message : String(err));
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function del() {
  if (!currentId) return;
  if (!confirm(`Delete "${schedules.find(s=>s.id===currentId)?.name}"?`)) return;
  await window.robosScheduler.deleteSchedule(currentId);
  currentId = null;
  schedules = await window.robosScheduler.getSchedules();
  renderList();
  document.getElementById('editor-empty').classList.remove('hidden');
  document.getElementById('editor-form').classList.add('hidden');
}

// ── Run Now ───────────────────────────────────────────────────────────────────
async function runNow() {
  // Auto-save if unsaved so there's a valid ID to run
  if (!currentId) {
    const name = document.getElementById('f-name').value.trim();
    const cmd  = document.getElementById('f-command').value.trim();
    if (!cmd) { alert('Enter a command before running.'); return; }
    await save();
    if (!currentId) { alert('Could not save schedule. Please try saving manually first.'); return; }
  }
  const btn = document.getElementById('btn-run-now');
  btn.disabled = true; btn.textContent = '▶ Running…';
  const result = await window.robosScheduler.runNow(currentId);
  btn.disabled = false; btn.textContent = '▶ Run Now';
  if (result.error) { alert('Error: ' + result.error); return; }
  setTimeout(async () => {
    const log = await window.robosScheduler.getRunLog(currentId);
    document.getElementById('run-log').textContent = log || 'No output yet.';
  }, 2000);
}

// ── AI Create ─────────────────────────────────────────────────────────────────
function openAiModal() {
  document.getElementById('ai-modal').classList.remove('hidden');
  document.getElementById('ai-prompt-input').focus();
  document.getElementById('ai-status').textContent = '';
  document.getElementById('ai-status').classList.add('hidden');
}

function closeAiModal() {
  document.getElementById('ai-modal').classList.add('hidden');
}

async function submitAiCreate() {
  const request = document.getElementById('ai-prompt-input').value.trim();
  if (!request) return;
  const statusEl = document.getElementById('ai-status');
  const submitBtn = document.getElementById('ai-modal-submit');
  statusEl.textContent = '✦ Thinking…';
  statusEl.className = 'ai-status';
  statusEl.classList.remove('hidden');
  submitBtn.disabled = true;

  const result = await window.robosScheduler.aiCreateSchedule(request);
  submitBtn.disabled = false;

  if (result.success && result.schedule) {
    closeAiModal();
    // Merge into form
    currentId = null;
    const s = result.schedule;
    s.enabled = true;
    if (!s.recurrence) s.recurrence = { type: 'daily', time: '09:00' };
    renderList();
    showForm(s);
    document.getElementById('f-name').focus();
  } else {
    statusEl.className = 'ai-status error';
    statusEl.textContent = 'Could not parse response. Try rephrasing or fill the form manually.';
    statusEl.classList.remove('hidden');
  }
}

// ── Wire up events ────────────────────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', startNew);
document.getElementById('btn-ai-create').addEventListener('click', openAiModal);
document.getElementById('btn-save').addEventListener('click', save);
document.getElementById('btn-delete').addEventListener('click', del);
document.getElementById('btn-run-now').addEventListener('click', runNow);
document.getElementById('btn-refresh-log').addEventListener('click', async () => {
  if (!currentId) return;
  const log = await window.robosScheduler.getRunLog(currentId);
  document.getElementById('run-log').textContent = log || 'No runs yet.';
});

// Recurrence tab clicks
document.querySelectorAll('.rec-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    setRecurrenceType(btn.dataset.type);
    updateCronPreview();
  });
});

// Live cron preview on time/days changes
['f-time','f-dom','f-date','f-minute','f-cron'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', updateCronPreview);
});
document.querySelectorAll('.day-cb input').forEach(cb => {
  cb.addEventListener('change', updateCronPreview);
});

// Command type radio
document.querySelectorAll('input[name="cmdType"]').forEach(r => {
  r.addEventListener('change', () => updateCmdHints(r.value));
});

// AI modal
document.getElementById('ai-modal-close').addEventListener('click', closeAiModal);
document.getElementById('ai-modal-cancel').addEventListener('click', closeAiModal);
document.getElementById('ai-modal-submit').addEventListener('click', submitAiCreate);
document.getElementById('ai-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAiModal();
});
document.getElementById('ai-prompt-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitAiCreate();
});

// Example buttons
document.querySelectorAll('.ai-example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('ai-prompt-input').value = btn.textContent;
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'agent-scheduler');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
