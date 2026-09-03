'use strict';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let _config = [];

function renderChips(config) {
  const container = document.getElementById('toggle-chips');
  if (!container) return;
  container.innerHTML = config.map(w =>
    `<div class="chip ${w.enabled ? 'active' : ''}" id="chip-${w.id}" data-id="${w.id}">${w.enabled ? '✓ ' : ''}${esc(w.label)}</div>`
  ).join('');

  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const id = chip.dataset.id;
      const item = _config.find(x => x.id === id);
      if (item) {
        item.enabled = !item.enabled;
        await window.widgets.saveWidgetConfig(_config);
        renderChips(_config);
        applyVisibility(_config);
      }
    });
  });
}

function applyVisibility(config) {
  config.forEach(w => {
    const el = document.getElementById('widget-' + w.id);
    if (el) {
      if (w.enabled) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });
}

function renderData(data) {
  if (data.widgets) {
    _config = data.widgets;
    renderChips(_config);
    applyVisibility(_config);
  }

  // 1. Active Task
  const taskEl = document.getElementById('active-task-content');
  if (data.activeTask) {
    taskEl.innerHTML = `
      <div class="task-title">${esc(data.activeTask)}</div>
      <div style="font-size:11px; color:var(--text-muted);">Workspace: branch synchronized & dev servers ready</div>
    `;
  } else {
    taskEl.innerHTML = `<div style="color:var(--text-muted);">No active task assigned. Pick up a ticket from Issue Manager.</div>`;
  }

  // 2. System Stats
  const statsEl = document.getElementById('system-stats-content');
  if (data.systemStats) {
    const s = data.systemStats;
    statsEl.innerHTML = `
      <div class="stat-row"><span class="stat-label">RAM Usage</span><span class="stat-value">${s.memUsed} / ${s.memTotal} GB (${s.memPct}%)</span></div>
      <div class="stat-row"><span class="stat-label">Disk Storage</span><span class="stat-value">${esc(s.diskUsage)} used</span></div>
      <div class="stat-row"><span class="stat-label">CPU Cores</span><span class="stat-value">${s.cpuCount} cores (${s.loadAvg.join(', ')})</span></div>
      <div class="stat-row"><span class="stat-label">Uptime</span><span class="stat-value">${s.uptime} hours</span></div>
    `;
  }

  // 3. AI Agent & Quota
  const aiEl = document.getElementById('ai-agent-content');
  if (data.aiAgent) {
    const ai = data.aiAgent;
    aiEl.innerHTML = `
      <div class="stat-row"><span class="stat-label">Provider</span><span class="stat-value">${esc(ai.provider)}</span></div>
      <div class="stat-row"><span class="stat-label">Active Sessions</span><span class="stat-value">${ai.activeSessions} sessions</span></div>
      <div class="stat-row"><span class="stat-label">Monthly Quota</span><span class="stat-value">${ai.quotaUsedPct}% utilized</span></div>
      <div class="stat-row"><span class="stat-label">Agent State</span><span class="stat-value" style="color:var(--success); font-weight:600;">● ${esc(ai.status)}</span></div>
    `;
  }

  // 4. Work Journal
  const journalEl = document.getElementById('journal-content');
  const branchEl = document.getElementById('journal-branch');
  if (data.journalSummary) {
    const j = data.journalSummary;
    if (branchEl) branchEl.textContent = j.branch || 'main';
    journalEl.innerHTML = `
      <div class="stat-row"><span class="stat-label">Daily Entries</span><span class="stat-value">${j.entries} recorded</span></div>
      <div class="journal-entry">${esc(j.lastEntry || 'No recent activity')}</div>
    `;
  }

  // 5. Security & Pass
  const secEl = document.getElementById('security-content');
  if (data.security) {
    const sec = data.security;
    secEl.innerHTML = `
      <div class="stat-row"><span class="stat-label">GPG Key</span><span class="stat-value">${esc(sec.keyId)}</span></div>
      <div class="stat-row"><span class="stat-label">Pass Store</span><span class="stat-value" style="color:var(--success);">● ${esc(sec.status)}</span></div>
      <div class="stat-row"><span class="stat-label">Keyring</span><span class="stat-value">Unlocked</span></div>
    `;
  }
}

window.toggleWidget = async function(id) {
  const item = _config.find(x => x.id === id);
  if (item) {
    item.enabled = !item.enabled;
    await window.widgets.saveWidgetConfig(_config);
    renderChips(_config);
    applyVisibility(_config);
  }
};

window.refreshData = async function() {
  const data = await window.widgets.getWidgetData();
  renderData(data);
  return data;
};

document.getElementById('btn-refresh-data').addEventListener('click', window.refreshData);

window.widgets.onData(renderData);
window.refreshData();
