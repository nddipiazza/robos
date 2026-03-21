'use strict';

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderData(data) {
  // Active task
  const taskEl = document.getElementById('active-task-content');
  if (data.activeTask) {
    taskEl.innerHTML = '<div class="task-id">' + esc(data.activeTask) + '</div>';
  } else {
    taskEl.textContent = 'No active task';
  }

  // System stats
  const statsEl = document.getElementById('system-stats-content');
  if (data.systemStats) {
    const s = data.systemStats;
    statsEl.innerHTML =
      '<div class="stat-row"><span class="stat-label">Memory</span><span class="stat-value">' + s.memUsed + '/' + s.memTotal + ' GB (' + s.memPct + '%)</span></div>' +
      '<div class="stat-row"><span class="stat-label">Disk</span><span class="stat-value">' + esc(s.diskUsage) + ' used</span></div>' +
      '<div class="stat-row"><span class="stat-label">Load</span><span class="stat-value">' + s.loadAvg.join(', ') + '</span></div>' +
      '<div class="stat-row"><span class="stat-label">Uptime</span><span class="stat-value">' + s.uptime + 'h</span></div>';
  }

  // Journal
  const journalEl = document.getElementById('journal-content');
  if (data.journalSummary && data.journalSummary.entries > 0) {
    journalEl.innerHTML =
      '<div class="stat-row"><span class="stat-label">Entries</span><span class="stat-value">' + data.journalSummary.entries + '</span></div>' +
      (data.journalSummary.lastEntry ? '<div class="journal-last">' + esc(data.journalSummary.lastEntry) + '</div>' : '');
  } else {
    journalEl.textContent = 'No entries today';
  }
}

// Listen for push updates
window.widgets.onData(renderData);

// Initial load
window.widgets.getWidgetData().then(renderData);
