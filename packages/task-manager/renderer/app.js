'use strict';
/* global taskMgr */

// ── App badge colour palette (deterministic from app name) ───────────────────
const PALETTE = [
  '#1f6feb','#238636','#9e6a03','#8957e5','#cf222e',
  '#0969da','#1a7f37','#953800','#6e40c9','#b91c1c',
  '#0d9488','#d97706','#7c3aed','#059669','#dc2626',
];
function badgeColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ── State ─────────────────────────────────────────────────────────────────────
let allProcs   = [];
let filtered   = [];
let selected   = new Set();   // PIDs
let sortCol    = 'appName';
let sortDir    = 'asc';
let autoTimer  = null;
const AUTO_REFRESH_MS = 3000;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const search          = document.getElementById('search');
const autoRefreshCb   = document.getElementById('auto-refresh');
const btnRefresh      = document.getElementById('btn-refresh');
const checkAll        = document.getElementById('check-all');
const procBody        = document.getElementById('proc-body');
const countLabel      = document.getElementById('count-label');
const selectLabel     = document.getElementById('select-label');
const btnKillSel      = document.getElementById('btn-kill-sel');
const btnForceKillSel = document.getElementById('btn-force-kill-sel');
const btnKillAll      = document.getElementById('btn-kill-all');
const btnMinimize     = document.getElementById('btn-minimize');
const btnClose        = document.getElementById('btn-close');
const confirmOverlay  = document.getElementById('confirm-overlay');
const confirmMsg      = document.getElementById('confirm-msg');
const confirmOk       = document.getElementById('confirm-ok');
const confirmCancel   = document.getElementById('confirm-cancel');

// ── Sorting ───────────────────────────────────────────────────────────────────
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = col; sortDir = col === 'appName' ? 'asc' : 'desc'; }
    document.querySelectorAll('th.sortable').forEach(h => h.classList.remove('sort-asc','sort-desc'));
    th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    renderTable();
  });
});
// Set initial sort indicator
document.querySelector(`th[data-col="${sortCol}"]`)?.classList.add('sort-asc');

// ── Load & refresh ────────────────────────────────────────────────────────────
async function loadProcesses() {
  btnRefresh.classList.add('spinning');
  try {
    allProcs = await taskMgr.listProcesses();
    // Remove stale selections (killed procs)
    const livePids = new Set(allProcs.map(p => p.pid));
    for (const pid of selected) if (!livePids.has(pid)) selected.delete(pid);
    applyFilter();
  } finally {
    btnRefresh.classList.remove('spinning');
  }
}

function applyFilter() {
  const q = search.value.trim().toLowerCase();
  filtered = q
    ? allProcs.filter(p =>
        p.appName.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        p.appId.toLowerCase().includes(q))
    : allProcs.slice();
  renderTable();
}

function sortProcs(procs) {
  return procs.slice().sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return a.pid - b.pid;
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTable() {
  const sorted = sortProcs(filtered);

  if (!sorted.length) {
    procBody.innerHTML = '<tr class="empty-row"><td colspan="7">No RobOS processes found</td></tr>';
    updateFooter();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const p of sorted) {
    const tr = document.createElement('tr');
    const isSel = selected.has(p.pid);
    if (isSel)       tr.classList.add('selected');
    if (p.isSystem)  tr.classList.add('is-system');
    if (p.isSelf)    tr.classList.add('is-self');

    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" ${isSel ? 'checked' : ''} data-pid="${p.pid}"></td>
      <td class="col-app">${renderAppName(p)}</td>
      <td class="col-pid">${p.pid}</td>
      <td class="col-cpu ${cpuClass(p.cpu)}">${p.cpu.toFixed(1)}</td>
      <td class="col-mem ${memClass(p.memMb)}">${formatMem(p.memMb)}</td>
      <td class="col-stat">${renderStat(p.stat)}</td>
      <td class="col-cmd" title="${escHtml(p.cmd)}">${escHtml(p.cmd)}</td>
    `;

    // Row click toggles selection (except clicking the checkbox itself)
    tr.addEventListener('click', e => {
      if (e.target.type === 'checkbox') return;
      toggleSelect(p.pid);
    });

    // Checkbox click
    tr.querySelector('input[type="checkbox"]').addEventListener('change', e => {
      e.stopPropagation();
      if (e.target.checked) selected.add(p.pid);
      else selected.delete(p.pid);
      tr.classList.toggle('selected', e.target.checked);
      updateFooter();
    });

    fragment.appendChild(tr);
  }

  procBody.innerHTML = '';
  procBody.appendChild(fragment);
  updateFooter();
}

function renderAppName(p) {
  const color = badgeColor(p.appName);
  const init  = initials(p.appName);
  const sysTag  = p.isSystem ? '<span class="system-tag">SYSTEM</span>' : '';
  const selfTag = p.isSelf   ? '<span class="self-tag">self</span>'    : '';
  return `<div class="app-name-cell">
    <span class="app-badge" style="background:${color}">${init}</span>
    <span>${escHtml(p.appName)}${sysTag}${selfTag}</span>
  </div>`;
}

function renderStat(stat) {
  const s = (stat || '?')[0].toUpperCase();
  let cls = 'stat-other', label = stat;
  if (s === 'S' || s === 'I') { cls = 'stat-sleeping'; label = 'sleeping'; }
  else if (s === 'R')         { cls = 'stat-running';  label = 'running';  }
  else if (s === 'Z')         { cls = 'stat-zombie';   label = 'zombie';   }
  return `<span class="stat-badge ${cls}"><span class="stat-dot"></span>${label}</span>`;
}

function cpuClass(v) { return v >= 50 ? 'cpu-high' : v >= 10 ? 'cpu-med' : ''; }
function memClass(v) { return v >= 500 ? 'mem-high' : ''; }
function formatMem(mb) { return mb >= 1024 ? `${(mb/1024).toFixed(1)} GB` : `${mb} MB`; }
function escHtml(s)  { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Selection ─────────────────────────────────────────────────────────────────
function toggleSelect(pid) {
  if (selected.has(pid)) selected.delete(pid);
  else selected.add(pid);
  // Re-render just the affected row without full table rebuild
  const cb = procBody.querySelector(`input[data-pid="${pid}"]`);
  if (cb) {
    cb.checked = selected.has(pid);
    cb.closest('tr').classList.toggle('selected', selected.has(pid));
  }
  updateFooter();
}

checkAll.addEventListener('change', () => {
  if (checkAll.checked) filtered.forEach(p => selected.add(p.pid));
  else filtered.forEach(p => selected.delete(p.pid));
  renderTable();
});

function updateFooter() {
  const n   = filtered.length;
  const sel = [...selected].filter(pid => filtered.some(p => p.pid === pid)).length;
  countLabel.textContent  = `${n} process${n !== 1 ? 'es' : ''}`;
  selectLabel.textContent = sel > 0 ? `${sel} selected` : '';
  btnKillSel.disabled      = sel === 0;
  btnForceKillSel.disabled = sel === 0;
  checkAll.checked         = n > 0 && sel === n;
  checkAll.indeterminate   = sel > 0 && sel < n;
}

// ── Kill actions ──────────────────────────────────────────────────────────────
function getSelectedProcs() {
  return filtered.filter(p => selected.has(p.pid));
}

function hasSystemProc(procs) {
  return procs.some(p => p.isSystem);
}

function confirmThen(msg, iconHtml, okLabel, fn) {
  confirmMsg.innerHTML = msg;
  confirmOk.textContent = okLabel;
  confirmOverlay.hidden = false;
  const cleanup = () => { confirmOverlay.hidden = true; confirmOk.onclick = null; confirmCancel.onclick = null; };
  confirmOk.onclick     = () => { cleanup(); fn(); };
  confirmCancel.onclick = () => cleanup();
}

async function doKill(pids, signal) {
  const results = await taskMgr.killProcesses({ pids, signal });
  const failed  = results.filter(r => !r.ok);
  if (failed.length) console.warn('Kill failed:', failed);
  setTimeout(loadProcesses, 400);
}

btnKillSel.addEventListener('click', () => {
  const procs = getSelectedProcs();
  if (!procs.length) return;
  const names = procs.map(p => `<strong>${escHtml(p.appName)}</strong> (${p.pid})`).join(', ');
  const warn  = hasSystemProc(procs)
    ? '<br><br><span style="color:var(--warn)">⚠ This includes a system process — RobOS may become unstable.</span>'
    : '';
  confirmThen(
    `Send SIGTERM to ${procs.length} process${procs.length !== 1 ? 'es' : ''}?<br>${names}${warn}`,
    '⚠', 'Kill',
    () => doKill(procs.map(p => p.pid), 'SIGTERM'),
  );
});

btnForceKillSel.addEventListener('click', () => {
  const procs = getSelectedProcs();
  if (!procs.length) return;
  const names = procs.map(p => `<strong>${escHtml(p.appName)}</strong> (${p.pid})`).join(', ');
  const warn  = hasSystemProc(procs)
    ? '<br><br><span style="color:var(--warn)">⚠ This includes a system process — RobOS may become unstable.</span>'
    : '';
  confirmThen(
    `Force-kill (SIGKILL) ${procs.length} process${procs.length !== 1 ? 'es' : ''}?<br>${names}${warn}`,
    '💀', 'Force Kill',
    () => doKill(procs.map(p => p.pid), 'SIGKILL'),
  );
});

btnKillAll.addEventListener('click', () => {
  const procs = allProcs.filter(p => !p.isSelf);
  if (!procs.length) return;
  confirmThen(
    `Kill <strong>all ${procs.length} RobOS processes</strong>? This will close every running RobOS app including the Desktop Manager.`,
    '☠', 'Kill All',
    () => doKill(procs.map(p => p.pid), 'SIGTERM'),
  );
});

// ── Controls ──────────────────────────────────────────────────────────────────
btnRefresh.addEventListener('click', loadProcesses);

search.addEventListener('input', applyFilter);
search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; applyFilter(); } });

autoRefreshCb.addEventListener('change', () => {
  if (autoRefreshCb.checked) startAutoRefresh();
  else stopAutoRefresh();
});

function startAutoRefresh() {
  stopAutoRefresh();
  autoTimer = setInterval(loadProcesses, AUTO_REFRESH_MS);
}
function stopAutoRefresh() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}

// Keyboard shortcut: F5 = refresh, Esc = deselect all
document.addEventListener('keydown', e => {
  if (e.key === 'F5') { e.preventDefault(); loadProcesses(); }
  if (e.key === 'Escape' && !confirmOverlay.hidden) { confirmOverlay.hidden = true; }
  if (e.key === 'Escape' && selected.size) { selected.clear(); renderTable(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size && !confirmOverlay.hidden === false) {
    btnKillSel.click();
  }
});

// Window controls
btnMinimize.addEventListener('click', () => taskMgr.minimize());
btnClose.addEventListener('click',    () => taskMgr.close());

// ── Init ──────────────────────────────────────────────────────────────────────
loadProcesses();
startAutoRefresh();


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'task-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
