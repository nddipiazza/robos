'use strict';

const queryInput = document.getElementById('query-input');
const btnRun     = document.getElementById('btn-run');
const btnSave    = document.getElementById('btn-save');
const btnClear   = document.getElementById('btn-clear');
const btnHistory = document.getElementById('btn-history');
const btnBack    = document.getElementById('btn-back');
const reportSection  = document.getElementById('report-section');
const reportContent  = document.getElementById('report-content');
const historySection = document.getElementById('history-section');
const historyList    = document.getElementById('history-list');
const loadingEl      = document.getElementById('loading');
const querySection   = document.getElementById('query-section');

let currentReport = '';
let currentQuery  = '';

// ── Example queries ──────────────────────────────────────────────────────────
document.querySelectorAll('.example').forEach(el => {
  el.addEventListener('click', () => {
    queryInput.value = el.dataset.q;
    queryInput.focus();
  });
});

// ── Generate report ──────────────────────────────────────────────────────────
btnRun.addEventListener('click', runQuery);
queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runQuery();
});

async function runQuery() {
  const query = queryInput.value.trim();
  if (!query) return;

  currentQuery = query;
  currentReport = '';
  reportContent.textContent = '';
  reportSection.classList.remove('hidden');
  historySection.classList.add('hidden');
  loadingEl.classList.remove('hidden');
  btnRun.disabled = true;

  // Set up streaming
  const unsub = window.robos.onStream((chunk) => {
    currentReport += chunk;
    reportContent.textContent = currentReport;
    reportContent.scrollTop = reportContent.scrollHeight;
  });

  try {
    const result = await window.robos.runQuery({ query });
    if (!result.ok && !currentReport) {
      reportContent.textContent = 'Error: ' + (result.error || 'Failed to generate report');
    } else if (result.ok && !currentReport) {
      currentReport = result.data;
      reportContent.textContent = currentReport;
    }
  } catch (e) {
    if (!currentReport) {
      reportContent.textContent = 'Error: ' + e.message;
    }
  }

  unsub();
  loadingEl.classList.add('hidden');
  btnRun.disabled = false;
}

// ── Save report ──────────────────────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
  if (!currentReport) return;
  const name = currentQuery.substring(0, 60);
  const result = await window.robos.saveReport({ name, content: currentReport, query: currentQuery });
  if (result.ok) {
    btnSave.textContent = 'Saved!';
    setTimeout(() => { btnSave.textContent = 'Save Report'; }, 2000);
  }
});

// ── Clear report ─────────────────────────────────────────────────────────────
btnClear.addEventListener('click', () => {
  reportSection.classList.add('hidden');
  currentReport = '';
  currentQuery = '';
  reportContent.textContent = '';
  queryInput.value = '';
});

// ── History ──────────────────────────────────────────────────────────────────
btnHistory.addEventListener('click', async () => {
  querySection.classList.add('hidden');
  reportSection.classList.add('hidden');
  historySection.classList.remove('hidden');

  const result = await window.robos.listReports();
  const reports = result.ok ? result.data : [];

  if (!reports.length) {
    historyList.innerHTML = '<div style="color:var(--text-dim);padding:20px;text-align:center;">No saved reports</div>';
    return;
  }

  historyList.innerHTML = reports.map((r, i) => `
    <div class="history-item" data-idx="${i}">
      <div class="history-name">${r.name || 'Untitled'}</div>
      <div class="history-query">${r.query || ''}</div>
      <div class="history-date">${r.savedAt ? new Date(r.savedAt).toLocaleString() : ''}</div>
    </div>
  `).join('');

  historyList.querySelectorAll('.history-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const r = reports[i];
      currentQuery = r.query || '';
      currentReport = r.content || '';
      queryInput.value = currentQuery;
      reportContent.textContent = currentReport;
      querySection.classList.remove('hidden');
      reportSection.classList.remove('hidden');
      historySection.classList.add('hidden');
    });
  });
});

btnBack.addEventListener('click', () => {
  querySection.classList.remove('hidden');
  historySection.classList.add('hidden');
});

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const settings = await window.robos.readSettings();
  const ts = (settings.task_servers || [])[0];
  const badge = document.getElementById('server-badge');
  if (ts) {
    badge.textContent = ts.name || ts.type || 'GitHub';
  } else {
    badge.textContent = 'No task server';
  }
}

init();
