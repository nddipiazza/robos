'use strict';

// ── DOM References ────────────────────────────────────────────────────────────
const toastStackPreview     = document.getElementById('toast-stack-preview');
const activeToastCount       = document.getElementById('active-toast-count');
const dndToggle              = document.getElementById('dnd-toggle');
const logStream              = document.getElementById('log-stream');
const queueStatus            = document.getElementById('queue-status');
const mockupToastZone        = document.getElementById('mockup-toast-zone');
const labelStatusGnome       = document.getElementById('label-status-gnome');

let cachedPrefs = {};

// ── Logging & Telemetry ───────────────────────────────────────────────────────

function appendLog(tag, msg, extraClass = '') {
  const line = document.createElement('div');
  line.className = 'log-line';
  const now = new Date().toISOString().split('T')[1].slice(0, -1);
  line.innerHTML = `
    <span class="time">[${now}]</span>
    <span class="tag ${extraClass}">[${tag}]</span>
    <span>${msg}</span>
  `;
  if (logStream) {
    logStream.insertBefore(line, logStream.firstChild);
    while (logStream.children.length > 250) {
      logStream.removeChild(logStream.lastChild);
    }
  }
}

// ── Tab Switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.console-tab').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    document.querySelectorAll('.console-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    tabBtn.classList.add('active');
    const targetPane = document.getElementById(tabBtn.dataset.tab);
    if (targetPane) targetPane.classList.add('active');
  });
});

// ── Screen Mockup Position Preview ────────────────────────────────────────────

function updateScreenMockup(pos) {
  if (!mockupToastZone) return;
  mockupToastZone.style.top = '';
  mockupToastZone.style.bottom = '';
  mockupToastZone.style.left = '';
  mockupToastZone.style.right = '';
  mockupToastZone.style.transform = '';

  switch (pos) {
    case 'top-left':
      mockupToastZone.style.top = '22px';
      mockupToastZone.style.left = '8px';
      break;
    case 'top-center':
      mockupToastZone.style.top = '22px';
      mockupToastZone.style.left = '50%';
      mockupToastZone.style.transform = 'translateX(-50%)';
      break;
    case 'bottom-right':
      mockupToastZone.style.bottom = '8px';
      mockupToastZone.style.right = '8px';
      break;
    case 'bottom-left':
      mockupToastZone.style.bottom = '8px';
      mockupToastZone.style.left = '8px';
      break;
    case 'top-right':
    default:
      mockupToastZone.style.top = '22px';
      mockupToastZone.style.right = '8px';
      break;
  }
  mockupToastZone.textContent = pos.replace('-', ' ').toUpperCase();
}

// ── Preferences Synchronization ───────────────────────────────────────────────

async function loadPrefsToUI() {
  try {
    const prefs = await window.toast.getPrefs();
    cachedPrefs = prefs;

    // Delivery
    const deliverySel = document.getElementById('pref-delivery-mode');
    if (deliverySel) deliverySel.value = prefs.deliveryMode || 'dual';
    const gnomeTgl = document.getElementById('pref-gnome-toggle');
    if (gnomeTgl) gnomeTgl.checked = prefs.enableGnomeNotifications !== false;
    const toastTgl = document.getElementById('pref-toasts-toggle');
    if (toastTgl) toastTgl.checked = prefs.enableRobosToasts !== false;

    // DND & Quiet
    if (dndToggle) dndToggle.checked = !!prefs.dnd;
    const qTgl = document.getElementById('pref-quiet-toggle');
    if (qTgl) qTgl.checked = !!prefs.quietHours?.enabled;
    const qStart = document.getElementById('pref-quiet-start');
    if (qStart && prefs.quietHours?.start) qStart.value = prefs.quietHours.start;
    const qEnd = document.getElementById('pref-quiet-end');
    if (qEnd && prefs.quietHours?.end) qEnd.value = prefs.quietHours.end;

    // Anti-Spam
    const asMaster = document.getElementById('pref-antispam-master');
    if (asMaster) asMaster.checked = prefs.antiSpam?.enabled !== false;
    const asCool = document.getElementById('pref-antispam-cooldown-range');
    if (asCool) {
      asCool.value = prefs.antiSpam?.cooldownSeconds ?? 30;
      document.getElementById('antispam-cooldown-label').textContent = `${asCool.value}s`;
    }
    const asBurst = document.getElementById('pref-antispam-burst-range');
    if (asBurst) {
      asBurst.value = prefs.antiSpam?.maxBurst ?? 4;
      document.getElementById('antispam-burst-label').textContent = `${asBurst.value} toasts`;
    }
    const asDedup = document.getElementById('pref-antispam-dedup');
    if (asDedup) asDedup.checked = prefs.antiSpam?.dedupExactContent !== false;
    const asBypass = document.getElementById('pref-antispam-bypass');
    if (asBypass) asBypass.checked = prefs.antiSpam?.bypassForSecurityAndCritical !== false;

    // Fading
    const fadeMaster = document.getElementById('pref-fading-master');
    if (fadeMaster) fadeMaster.checked = prefs.fading?.enabled !== false;
    const fadeDur = document.getElementById('pref-fade-duration');
    if (fadeDur) {
      fadeDur.value = prefs.fading?.fadeDurationMs ?? 350;
      document.getElementById('fade-duration-label').textContent = `${fadeDur.value}ms`;
    }
    const fadeHover = document.getElementById('pref-fading-hover');
    if (fadeHover) fadeHover.checked = prefs.fading?.pauseOnHover !== false;
    const fadePbar = document.getElementById('pref-fading-pbar');
    if (fadePbar) fadePbar.checked = prefs.fading?.showProgressBar !== false;
    const durInfo = document.getElementById('pref-dur-info');
    if (durInfo) {
      durInfo.value = Math.round((prefs.fading?.tierDurations?.info ?? 5000) / 1000);
      document.getElementById('dur-info-label').textContent = `${durInfo.value}s`;
    }
    const durWarn = document.getElementById('pref-dur-warning');
    if (durWarn) {
      durWarn.value = Math.round((prefs.fading?.tierDurations?.warning ?? 12000) / 1000);
      document.getElementById('dur-warning-label').textContent = `${durWarn.value}s`;
    }
    const durCrit = document.getElementById('pref-dur-crit-autofade');
    if (durCrit) durCrit.checked = !!prefs.fading?.criticalAutoFade;

    // Display & Positioning
    const dispPos = document.getElementById('pref-display-position');
    if (dispPos) {
      dispPos.value = prefs.display?.position || 'top-right';
      updateScreenMockup(dispPos.value);
    }
    const dispMax = document.getElementById('pref-display-max');
    if (dispMax) {
      dispMax.value = prefs.display?.maxVisible ?? 5;
      document.getElementById('display-max-label').textContent = `${dispMax.value} toasts`;
    }
    const dispWidth = document.getElementById('pref-display-width');
    if (dispWidth) {
      dispWidth.value = prefs.display?.width ?? 380;
      document.getElementById('display-width-label').textContent = `${dispWidth.value}px`;
    }
    const sndTgl = document.getElementById('pref-sound-toggle');
    if (sndTgl) sndTgl.checked = prefs.display?.soundEnabled !== false;

    // Header badge
    if (labelStatusGnome) {
      labelStatusGnome.textContent = `GNOME: ${prefs.deliveryMode?.toUpperCase() || 'DUAL'}`;
    }

    renderCategoryMatrix(prefs);
  } catch (err) {
    console.error('Failed to load prefs to UI:', err);
  }
}

function gatherPrefsFromUI() {
  return {
    ...cachedPrefs,
    dnd: document.getElementById('dnd-toggle')?.checked || false,
    deliveryMode: document.getElementById('pref-delivery-mode')?.value || 'dual',
    enableGnomeNotifications: document.getElementById('pref-gnome-toggle')?.checked !== false,
    enableRobosToasts: document.getElementById('pref-toasts-toggle')?.checked !== false,
    quietHours: {
      enabled: document.getElementById('pref-quiet-toggle')?.checked || false,
      start: document.getElementById('pref-quiet-start')?.value || '22:00',
      end: document.getElementById('pref-quiet-end')?.value || '07:00',
    },
    antiSpam: {
      enabled: document.getElementById('pref-antispam-master')?.checked !== false,
      cooldownSeconds: parseInt(document.getElementById('pref-antispam-cooldown-range')?.value || '30', 10),
      maxBurst: parseInt(document.getElementById('pref-antispam-burst-range')?.value || '4', 10),
      burstWindowSeconds: 10,
      dedupExactContent: document.getElementById('pref-antispam-dedup')?.checked !== false,
      bypassForSecurityAndCritical: document.getElementById('pref-antispam-bypass')?.checked !== false,
    },
    fading: {
      enabled: document.getElementById('pref-fading-master')?.checked !== false,
      fadeDurationMs: parseInt(document.getElementById('pref-fade-duration')?.value || '350', 10),
      pauseOnHover: document.getElementById('pref-fading-hover')?.checked !== false,
      showProgressBar: document.getElementById('pref-fading-pbar')?.checked !== false,
      tierDurations: {
        critical: document.getElementById('pref-dur-crit-autofade')?.checked ? 30000 : 0,
        warning: parseInt(document.getElementById('pref-dur-warning')?.value || '12', 10) * 1000,
        info: parseInt(document.getElementById('pref-dur-info')?.value || '5', 10) * 1000,
        security: 0,
      },
      criticalAutoFade: document.getElementById('pref-dur-crit-autofade')?.checked || false,
    },
    display: {
      position: document.getElementById('pref-display-position')?.value || 'top-right',
      maxVisible: parseInt(document.getElementById('pref-display-max')?.value || '5', 10),
      width: parseInt(document.getElementById('pref-display-width')?.value || '380', 10),
      margin: 20,
      gap: 10,
      soundEnabled: document.getElementById('pref-sound-toggle')?.checked !== false,
      soundVolume: 80,
    },
  };
}

async function saveCurrentPrefs() {
  const newPrefs = gatherPrefsFromUI();
  await window.toast.setPrefs(newPrefs);
  cachedPrefs = newPrefs;
  appendLog('PREFS SAVED', 'Notification preferences saved and broadcast to all subsystems.');
  await loadPrefsToUI();
}

// ── Slider Labels & Real-Time Sync ────────────────────────────────────────────

function bindSlider(sliderId, labelId, suffix = '') {
  const el = document.getElementById(sliderId);
  const lbl = document.getElementById(labelId);
  if (el && lbl) {
    el.addEventListener('input', () => {
      lbl.textContent = `${el.value}${suffix}`;
    });
    el.addEventListener('change', () => {
      saveCurrentPrefs();
    });
  }
}

bindSlider('pref-antispam-cooldown-range', 'antispam-cooldown-label', 's');
bindSlider('pref-antispam-burst-range', 'antispam-burst-label', ' toasts');
bindSlider('pref-fade-duration', 'fade-duration-label', 'ms');
bindSlider('pref-dur-info', 'dur-info-label', 's');
bindSlider('pref-dur-warning', 'dur-warning-label', 's');
bindSlider('pref-display-max', 'display-max-label', ' toasts');
bindSlider('pref-display-width', 'display-width-label', 'px');

document.getElementById('pref-display-position')?.addEventListener('change', (e) => {
  updateScreenMockup(e.target.value);
  saveCurrentPrefs();
});

document.querySelectorAll('#tab-delivery input, #tab-delivery select, #tab-antispam input, #tab-fading input, #tab-display input').forEach(input => {
  if (input.type === 'checkbox') {
    input.addEventListener('change', () => saveCurrentPrefs());
  }
});

document.getElementById('btn-save-all-prefs')?.addEventListener('click', () => saveCurrentPrefs());
document.getElementById('btn-reset-prefs')?.addEventListener('click', async () => {
  await window.toast.resetPrefs();
  appendLog('RESET DEFAULTS', 'Preferences reverted to factory standards.');
  await loadPrefsToUI();
});

// ── Category Overrides Matrix ─────────────────────────────────────────────────

const CATEGORY_LIST = [
  { id: 'pr_review', name: 'PR Review Traffic', icon: '🔍' },
  { id: 'ci_cd',     name: 'CI/CD Pipelines',   icon: '⚙️' },
  { id: 'task',      name: 'Assigned Tasks',    icon: '📋' },
  { id: 'agent',     name: 'Autonomous Agents', icon: '🤖' },
  { id: 'security',  name: 'Security & Auth',   icon: '🛡️' },
  { id: 'system',    name: 'Core System Alerts',icon: '🔔' },
];

function renderCategoryMatrix(prefs) {
  const tbody = document.getElementById('category-matrix-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  CATEGORY_LIST.forEach(cat => {
    const override = prefs.categoryOverrides?.[cat.id] || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${cat.icon} ${cat.name}</strong></td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" data-cat="${cat.id}" class="cat-enabled-tgl" ${override.enabled !== false ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <select class="form-select cat-mode-sel" data-cat="${cat.id}" style="font-size:11px; padding:3px 6px;">
          <option value="inherit" ${!override.deliveryMode ? 'selected' : ''}>Inherit Global (${prefs.deliveryMode || 'dual'})</option>
          <option value="dual" ${override.deliveryMode === 'dual' ? 'selected' : ''}>Smart Dual</option>
          <option value="toast_only" ${override.deliveryMode === 'toast_only' ? 'selected' : ''}>Toasts Only</option>
          <option value="native_only" ${override.deliveryMode === 'native_only' ? 'selected' : ''}>GNOME Native Only</option>
        </select>
      </td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" data-cat="${cat.id}" class="cat-sound-tgl" ${override.sound !== false ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.cat-enabled-tgl, .cat-sound-tgl, .cat-mode-sel').forEach(el => {
    el.addEventListener('change', () => {
      const catId = el.dataset.cat;
      if (!cachedPrefs.categoryOverrides) cachedPrefs.categoryOverrides = {};
      if (!cachedPrefs.categoryOverrides[catId]) cachedPrefs.categoryOverrides[catId] = {};

      const row = el.closest('tr');
      cachedPrefs.categoryOverrides[catId].enabled = row.querySelector('.cat-enabled-tgl').checked;
      cachedPrefs.categoryOverrides[catId].sound = row.querySelector('.cat-sound-tgl').checked;
      const mode = row.querySelector('.cat-mode-sel').value;
      if (mode === 'inherit') delete cachedPrefs.categoryOverrides[catId].deliveryMode;
      else cachedPrefs.categoryOverrides[catId].deliveryMode = mode;

      window.toast.setPrefs(cachedPrefs);
      appendLog('CATEGORY OVERRIDE', `Updated configuration for category ${catId}.`);
    });
  });
}

// ── Active Stack Refresh & Telemetry ──────────────────────────────────────────

async function refreshState() {
  try {
    const active = await window.toast.getActiveToasts();
    const queued = await window.toast.getQueuedToasts();
    const prefs = await window.toast.getPrefs();

    if (activeToastCount) activeToastCount.textContent = active.length;
    if (dndToggle) dndToggle.checked = !!prefs.dnd;
    if (queueStatus) {
      queueStatus.textContent = `Queue: ${queued.length} items ${prefs.dnd ? '(DND Active)' : ''}`;
    }

    if (toastStackPreview) {
      toastStackPreview.innerHTML = '';
      if (active.length === 0) {
        toastStackPreview.innerHTML = `
          <div style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px;">
            No active overlay toasts. Trigger an SDLC notification to preview.
          </div>
        `;
      } else {
        active.forEach(t => {
          const el = document.createElement('div');
          el.className = `preview-toast tier-${t.tier}`;
          el.id = `preview-toast-${t.id}`;
          el.innerHTML = `
            <div style="font-size:18px;">${t.tier === 'critical' ? '❌' : (t.tier === 'warning' ? '⚠️' : (t.tier === 'security' ? '🛡️' : '🔔'))}</div>
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
      }
    }
  } catch (err) {
    console.error('Failed to refresh toast state:', err);
  }
}

// ── Interactive Presets & Auth Simulator ──────────────────────────────────────

document.getElementById('btn-trigger-ci-info')?.addEventListener('click', async () => {
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

document.getElementById('btn-trigger-pr-warning')?.addEventListener('click', async () => {
  appendLog('EMIT WARNING', 'Emitted pr_review_requested notification (amber border, 12s timer).');
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

document.getElementById('btn-trigger-ci-crit')?.addEventListener('click', async () => {
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

document.getElementById('btn-trigger-task-info')?.addEventListener('click', async () => {
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

// Interactive Multi-Option Security Auth Prompt Handler
async function triggerSecurityAuthPrompt() {
  appendLog('SECURITY PROMPT', 'Dispatched multi-option Security Authorization prompt.', 'action');
  await window.toast.emitToast({
    id: `security-auth-${Date.now()}`,
    category: 'security',
    tier: 'security',
    title: 'GPG Key Access Request: Claude Code',
    body: 'Agent requests temporary authorization to read credential "acme-corp/api-token".',
    actions: [
      { label: 'Approve (1 hr)', variant: 'security', action: 'approve' },
      { label: 'Deny', variant: 'danger', action: 'deny' },
      { label: 'Inspect Token', variant: 'secondary', action: 'inspect' },
    ],
    sticky: true,
  });
  await refreshState();
}

document.getElementById('btn-trigger-security-auth')?.addEventListener('click', triggerSecurityAuthPrompt);
document.getElementById('btn-simulate-security-auth')?.addEventListener('click', triggerSecurityAuthPrompt);

// Custom Composer
document.getElementById('btn-dispatch-custom')?.addEventListener('click', async () => {
  const title = document.getElementById('custom-title')?.value || 'Custom Notification';
  const body = document.getElementById('custom-body')?.value || '';
  const category = document.getElementById('custom-category')?.value || 'system';
  const tier = document.getElementById('custom-tier')?.value || 'info';

  appendLog('CUSTOM TOAST', `Dispatched [${category}/${tier}] "${title}".`);
  await window.toast.emitToast({
    id: `custom-${Date.now()}`,
    title,
    body,
    category,
    tier,
    actions: [
      { label: 'View Details', variant: 'primary', action: 'view' },
      { label: 'Dismiss', variant: 'secondary', action: 'dismiss' },
    ],
  });
  await refreshState();
});

// Dismiss All
document.getElementById('btn-dismiss-all')?.addEventListener('click', async () => {
  appendLog('DISMISS ALL', 'Dismissed all active overlay toasts.');
  await window.toast.dismissAll();
  await refreshState();
});

// DND Toggle
dndToggle?.addEventListener('change', async (e) => {
  const isDnd = e.target.checked;
  const current = await window.toast.getPrefs();
  await window.toast.setPrefs({ ...current, dnd: isDnd });
  appendLog('DND TOGGLE', isDnd ? 'Enabled Do Not Disturb mode.' : 'Disabled Do Not Disturb mode (flushed queue).');
  await refreshState();
});

// Telemetry stream clear
document.getElementById('btn-clear-telemetry')?.addEventListener('click', async () => {
  if (logStream) logStream.innerHTML = '';
  if (window.toast.clearTelemetry) await window.toast.clearTelemetry();
  appendLog('STREAM CLEARED', 'Telemetry stream audit log cleared.');
});

// Periodic state poll
setInterval(refreshState, 1000);
loadPrefsToUI();
refreshState();
appendLog('CONSOLE READY', 'RobOS Toast Notification Console initialized with dual-delivery and anti-spam controls.');
