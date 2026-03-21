'use strict';

let allIssues = [];
let currentView = 'kanban';
let boardConfig = null;
let sortCol = 'updated';
let sortAsc = false;

const kanbanView  = document.getElementById('kanban-view');
const listView    = document.getElementById('list-view');
const emptyState  = document.getElementById('empty-state');
const errorBar    = document.getElementById('error-bar');
const serverBadge = document.getElementById('server-name');

// ── View toggle ──────────────────────────────────────────────────────────────

document.getElementById('btn-kanban').addEventListener('click', () => switchView('kanban'));
document.getElementById('btn-list').addEventListener('click', () => switchView('list'));
document.getElementById('btn-refresh').addEventListener('click', loadIssues);
document.getElementById('filter-state').addEventListener('change', loadIssues);
document.getElementById('filter-assignee').addEventListener('change', renderCurrent);
document.getElementById('filter-search').addEventListener('input', renderCurrent);

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(view === 'kanban' ? 'btn-kanban' : 'btn-list').classList.add('active');
  kanbanView.classList.toggle('hidden', view !== 'kanban');
  listView.classList.toggle('hidden', view !== 'list');
  renderCurrent();
}

// ── Keyboard navigation ──────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === '1') switchView('kanban');
  if (e.key === '2') switchView('list');
  if (e.key === 'r' && !e.ctrlKey && document.activeElement.tagName !== 'INPUT') loadIssues();
});

// ── Load ──────────────────────────────────────────────────────────────────────

async function init() {
  boardConfig = await window.api.getBoardConfig();
  if (!boardConfig.ok) {
    showError(boardConfig.error || 'No task server configured. Open Task Servers to set one up.');
    return;
  }
  serverBadge.textContent = boardConfig.server.name || boardConfig.server.type;
  await loadIssues();
}

async function loadIssues() {
  hideError();
  const state = document.getElementById('filter-state').value;
  const result = await window.api.fetchIssues({ filter: { state } });

  if (!result.ok) {
    showError(result.error);
    allIssues = [];
    renderCurrent();
    return;
  }

  allIssues = result.issues;
  populateAssigneeFilter();
  renderCurrent();
}

function getFilteredIssues() {
  let issues = allIssues;
  const assignee = document.getElementById('filter-assignee').value;
  const search = document.getElementById('filter-search').value.trim().toLowerCase();

  if (assignee) issues = issues.filter(i => i.assignee === assignee);
  if (search) issues = issues.filter(i =>
    i.summary.toLowerCase().includes(search) ||
    i.key.toLowerCase().includes(search) ||
    (i.labels || []).some(l => l.toLowerCase().includes(search))
  );
  return issues;
}

function populateAssigneeFilter() {
  const sel = document.getElementById('filter-assignee');
  const current = sel.value;
  const assignees = [...new Set(allIssues.map(i => i.assignee).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All assignees</option>' +
    assignees.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  sel.value = current;
}

function renderCurrent() {
  const issues = getFilteredIssues();
  if (issues.length === 0 && allIssues.length === 0) {
    emptyState.classList.remove('hidden');
    kanbanView.classList.add('hidden');
    listView.classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  if (currentView === 'kanban') renderKanban(issues);
  else renderList(issues);
}

// ── Kanban ────────────────────────────────────────────────────────────────────

function getKanbanColumns(issues) {
  // Group by status, preserve order from workflow if available
  const groups = new Map();
  for (const issue of issues) {
    const status = issue.status || 'unknown';
    if (!groups.has(status)) groups.set(status, []);
    groups.get(status).push(issue);
  }
  return groups;
}

function renderKanban(issues) {
  const container = document.getElementById('kanban-columns');
  container.innerHTML = '';

  const columns = getKanbanColumns(issues);

  if (columns.size === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  for (const [status, cards] of columns) {
    const col = document.createElement('div');
    col.className = 'kanban-col';

    const header = document.createElement('div');
    header.className = 'kanban-col-header';
    header.innerHTML = `<span>${esc(status)}</span><span class="kanban-col-count">${cards.length}</span>`;
    col.appendChild(header);

    const body = document.createElement('div');
    body.className = 'kanban-col-body';

    for (const issue of cards) {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.addEventListener('click', () => {
        if (issue.url) window.api.openUrl(issue.url);
      });

      let labelsHtml = '';
      const displayLabels = (issue.labels || []).filter(l => !l.startsWith('state:')).slice(0, 3);
      if (displayLabels.length) {
        labelsHtml = `<div class="kanban-card-labels">${displayLabels.map(l => `<span class="label-tag">${esc(l)}</span>`).join('')}</div>`;
      }

      card.innerHTML = `
        <div class="kanban-card-title">${esc(issue.summary)}</div>
        <div class="kanban-card-meta">
          <span class="kanban-card-key">${esc(issue.key)}</span>
          ${issue.assignee ? `<span class="kanban-card-assignee">👤 ${esc(issue.assignee)}</span>` : ''}
          <span>${timeAgo(issue.updated)}</span>
        </div>
        ${labelsHtml}
      `;
      body.appendChild(card);
    }

    col.appendChild(body);
    container.appendChild(col);
  }
}

// ── List view ─────────────────────────────────────────────────────────────────

function renderList(issues) {
  const sorted = [...issues].sort((a, b) => {
    let va = a[sortCol] || '', vb = b[sortCol] || '';
    if (sortCol === 'updated' || sortCol === 'created') {
      va = new Date(va || 0).getTime();
      vb = new Date(vb || 0).getTime();
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('issue-tbody');
  tbody.innerHTML = sorted.map(issue => {
    const statusClass = issue.status === 'closed' ? 'status-closed' :
      (['open', 'backlog', 'triage'].includes(issue.status) ? 'status-open' : 'status-progress');
    const issueType = detectType(issue.labels || []);
    return `<tr data-url="${esc(issue.url || '')}">
      <td class="col-key" style="color:var(--blue);cursor:pointer">${esc(issue.key)}</td>
      <td class="col-summary">${esc(issue.summary)}</td>
      <td class="col-status"><span class="status-badge ${statusClass}">${esc(issue.status)}</span></td>
      <td class="col-assignee">${issue.assignee ? esc(issue.assignee) : '<span style="color:var(--muted)">—</span>'}</td>
      <td class="col-type">${esc(issueType)}</td>
      <td class="col-updated" style="color:var(--muted)">${timeAgo(issue.updated)}</td>
    </tr>`;
  }).join('');

  // Click row to open
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const url = tr.dataset.url;
      if (url) window.api.openUrl(url);
    });
    tr.style.cursor = 'pointer';
  });
}

// Column sorting
document.querySelectorAll('#issue-table th').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.className.replace('col-', '');
    const colMap = { key: 'key', summary: 'summary', status: 'status', assignee: 'assignee', type: 'issueType', updated: 'updated' };
    const mapped = colMap[col];
    if (!mapped) return;
    if (sortCol === mapped) sortAsc = !sortAsc;
    else { sortCol = mapped; sortAsc = true; }
    renderCurrent();
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function detectType(labels) {
  if (labels.some(l => l === 'bug')) return 'Bug';
  if (labels.some(l => l.includes('feature'))) return 'Feature';
  if (labels.some(l => l === 'chore' || l === 'task')) return 'Task';
  return 'Issue';
}

function showError(msg) {
  errorBar.textContent = msg;
  errorBar.classList.remove('hidden');
}

function hideError() {
  errorBar.classList.add('hidden');
}

// ── Init ──────────────────────────────────────────────────────────────────────

init();
