'use strict';

const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);

let allGroups  = [];
let allPeople  = [];
let allWorkspaces = [];
let activeGid  = null;
let activeCat  = 'git';
let editingNew = false;

const CATS = {
  git: {
    label: 'Git Projects',
    icon: '🔀',
    description: 'Git repositories and projects managed by this group.',
    itemLabel: 'Repository',
    itemPlaceholder: 'org/repo or full URL',
    fields: ['url', 'description', 'branch', 'notes'],
    fieldLabels: { url: 'Repo URL / Path *', description: 'Description', branch: 'Default Branch', notes: 'Notes' },
  },
  software: {
    label: 'Software Installations',
    icon: '📦',
    description: 'Tools and software that must be installed for this group to do development.',
    itemLabel: 'Tool / Package',
    itemPlaceholder: 'e.g. docker, nodejs, java 17',
    fields: ['name', 'version', 'installCmd', 'verifyCmd', 'notes'],
    fieldLabels: { name: 'Tool / Package *', version: 'Version', installCmd: 'Install Command', verifyCmd: 'Verify Command', notes: 'Notes' },
  },
  onboarding: {
    label: 'Onboarding Steps',
    icon: '🚀',
    description: 'Ordered steps a new developer must complete to get set up.',
    itemLabel: 'Step',
    itemPlaceholder: 'e.g. Clone the main repo',
    ordered: true,
    fields: ['title', 'description', 'owner', 'notes'],
    fieldLabels: { title: 'Step Title *', description: 'Description', owner: 'Responsible Role/Person', notes: 'Notes' },
    personFields: ['owner'],
  },
  secrets: {
    label: 'Secret Management',
    icon: '🔐',
    description: 'Secrets and credentials needed for development, and how to obtain them.',
    itemLabel: 'Secret',
    itemPlaceholder: 'e.g. AWS_SECRET_KEY',
    fields: ['name', 'passPath', 'howToGet', 'scope', 'notes'],
    fieldLabels: { name: 'Secret Name *', passPath: 'pass store path (e.g. aws/dev)', howToGet: 'How to obtain', scope: 'Scope (dev/qa/prod)', notes: 'Notes' },
  },
  ci: {
    label: 'CI Environments',
    icon: '⚙️',
    description: 'Instructions for connecting to CI/CD environments (dev, QA, etc.).',
    itemLabel: 'Environment',
    itemPlaceholder: 'e.g. Dev, QA, Staging',
    fields: ['name', 'ciUrl', 'vpnRequired', 'connectSteps', 'notes'],
    fieldLabels: { name: 'Environment Name *', ciUrl: 'CI URL', vpnRequired: 'VPN Required (yes/no)', connectSteps: 'Steps to Connect', notes: 'Notes' },
    largeFields: ['connectSteps', 'notes'],
  },
  members: { label: 'Members', icon: '👥', description: 'People assigned to this group.' },
};

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  [allGroups, allPeople, allWorkspaces] = await Promise.all([
    window.api.listGroups(),
    window.api.listPeople(),
    window.api.listWorkspaces(),
  ]);
  renderGroupList();

  document.getElementById('btn-new-group').addEventListener('click', () => openGroupModal(null));
  document.getElementById('group-search').addEventListener('input', renderGroupList);
  document.getElementById('group-modal-close').addEventListener('click', closeGroupModal);
  document.getElementById('btn-save-group-modal').addEventListener('click', saveGroupModal);

  // Category nav
  document.getElementById('cat-list').addEventListener('click', e => {
    const item = e.target.closest('.cat-item');
    if (!item) return;
    activeCat = item.dataset.cat;
    document.querySelectorAll('.cat-item').forEach(el => el.classList.toggle('active', el.dataset.cat === activeCat));
    renderCatContent();
  });

  // Dev Console button → Cockpit
  document.getElementById('btn-dev-console').addEventListener('click', () => window.api.openDevConsole());

  // Open config folder
  const configDir = await window.api.getConfigDir();
  const pathEl = document.getElementById('config-path-display');
  if (pathEl && configDir) pathEl.textContent = configDir;
  document.getElementById('btn-open-folder').addEventListener('click', () => window.api.openFolder(configDir));

  // Resize handle
  initResize();

  // AI Create panel
  initAIPanel();

  // Active identity & enterprise modals
  await refreshIdentity();
  setupIdentityModals();

  window.refreshGroups = async () => {
    [allGroups, allPeople] = await Promise.all([
      window.api.listGroups(),
      window.api.listPeople(),
    ]);
    renderGroupList();
    await refreshIdentity();
  };
});

// ── Groups list ───────────────────────────────────────────────────────────────
function renderGroupList() {
  const q   = document.getElementById('group-search').value.toLowerCase();
  const ul  = document.getElementById('group-list');
  const vis = allGroups.filter(g => !q || (g.name||'').toLowerCase().includes(q) || (g.id||'').toLowerCase().includes(q));
  if (!vis.length) {
    ul.innerHTML = '<li class="no-results">No groups</li>';
    return;
  }
  ul.innerHTML = vis.map(g => `
    <li class="group-item${g.id===activeGid?' active':''}" data-gid="${esc(g.id)}">
      <div class="group-item-name">${esc(g.name||g.id)}</div>
      <div class="group-item-sub">${(g.members||[]).length} members</div>
    </li>`).join('');
  ul.querySelectorAll('.group-item').forEach(li =>
    li.addEventListener('click', () => selectGroup(li.dataset.gid)));
}

function selectGroup(gid) {
  activeGid = gid;
  renderGroupList();
  const g = allGroups.find(x => x.id === gid);
  if (!g) return;
  document.getElementById('no-group').classList.add('hidden');
  document.getElementById('group-workspace').classList.remove('hidden');
  document.getElementById('group-name-display').textContent = g.name || g.id;
  document.getElementById('group-meta').textContent = g.description || '';

  document.getElementById('btn-edit-group').onclick   = () => openGroupModal(g);
  document.getElementById('btn-delete-group').onclick = () => doDeleteGroup(g.id);

  renderCatContent();
}

// ── Category content ──────────────────────────────────────────────────────────
function renderCatContent() {
  const g = allGroups.find(x => x.id === activeGid);
  if (!g) return;
  const el = document.getElementById('cat-content');
  if (activeCat === 'members')    { renderMembers(g, el); return; }
  if (activeCat === 'git')        { renderGitCategory(g, el); return; }
  if (activeCat === 'workspaces') { renderWorkspaces(g, el); return; }
  renderItemList(g, el, activeCat);
}

// ── Git Projects (split-view, mirrors Members panel) ─────────────────────────
function renderGitCategory(group, container) {
  const repos = (group.settings?.git) || [];

  container.innerHTML = `
    <div class="cat-header">
      <div>
        <h3>🔀 Git Projects</h3>
        <p class="cat-desc">Git repositories and projects managed by this group.</p>
      </div>
    </div>
    <div class="members-split">
      <div class="members-col">
        <div class="members-col-title">In group (${repos.length})</div>
        <ul class="members-list" id="git-repos-in">
          ${repos.map((r, i) => `
            <li class="member-item git-repo-item" data-idx="${i}">
              <span class="git-repo-icon">🗄</span>
              <div class="git-repo-body">
                <span class="git-repo-name">${esc(r.url)}</span>
                ${r.description ? `<span class="member-sub">${esc(r.description)}</span>` : ''}
              </div>
              <button class="btn-edit-git icon-btn" data-idx="${i}" title="Edit">✎</button>
              <button class="btn-del-git btn-danger-sm" data-idx="${i}" title="Remove">✕</button>
            </li>`).join('')}
          ${!repos.length ? '<li class="no-results">No repositories yet</li>' : ''}
        </ul>
      </div>
      <div class="members-col">
        <div class="members-col-title">Add repositories</div>
        <div class="gh-combo" style="position:relative;">
          <input id="repo-search-input" class="gh-filter-input"
                 placeholder="🔍 Type to search your repos…" autocomplete="off" spellcheck="false">
          <div id="gh-repo-dropdown" class="gh-dropdown hidden"></div>
        </div>
        <div id="gh-load-status" class="gh-load-status">Loading your repos…</div>
      </div>
    </div>
    <div id="item-form-wrap" class="hidden"></div>`;

  const searchInput  = container.querySelector('#repo-search-input');
  const dropdown     = container.querySelector('#gh-repo-dropdown');
  const loadStatus   = container.querySelector('#gh-load-status');
  let allGhRepos     = [];
  let filterTimer    = null;

  async function pickRepo(nameWithOwner) {
    if (!group.settings)     group.settings = {};
    if (!group.settings.git) group.settings.git = [];
    if (!group.settings.git.find(x => x.url === nameWithOwner)) {
      group.settings.git.push({ url: nameWithOwner, description: '', branch: '', notes: '' });
    }
    await window.api.saveGroup(group);
    allGroups = await window.api.listGroups();
    Object.assign(group, allGroups.find(x => x.id === group.id));
    renderGitCategory(group, container);
    container.querySelector('#repo-search-input')?.focus();
  }

  function renderDropdown(repos) {
    const alreadyAdded = new Set((group.settings?.git || []).map(r => r.url));
    const filtered = repos.filter(r => !alreadyAdded.has(r.nameWithOwner));
    if (!filtered.length) {
      dropdown.innerHTML = '<div class="gh-dropdown-empty">No repositories found</div>';
      dropdown.classList.remove('hidden');
      return;
    }
    const byOwner = {};
    for (const r of filtered) {
      const [owner] = r.nameWithOwner.split('/');
      (byOwner[owner] = byOwner[owner] || []).push(r);
    }
    dropdown.innerHTML = Object.entries(byOwner).map(([owner, list]) => `
      <div class="gh-dropdown-group">
        <div class="gh-dropdown-group-label">${esc(owner)}</div>
        ${list.map(r => `
          <div class="gh-dropdown-item" data-nwo="${esc(r.nameWithOwner)}">
            <span class="gh-dropdown-icon">🗄</span>
            <span class="gh-dropdown-name">${esc(r.nameWithOwner.split('/')[1])}</span>
            ${r.isPrivate ? '<span class="gh-badge">private</span>' : ''}
            ${r.description ? `<span class="gh-dropdown-desc">${esc(r.description)}</span>` : ''}
          </div>`).join('')}
      </div>`).join('');
    dropdown.classList.remove('hidden');
    dropdown.querySelectorAll('.gh-dropdown-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        pickRepo(item.dataset.nwo);
      });
    });
  }

  function filterRepos(q) {
    const lower = q.toLowerCase();
    return allGhRepos.filter(r =>
      r.nameWithOwner.toLowerCase().includes(lower) ||
      (r.description || '').toLowerCase().includes(lower)
    ).slice(0, 60);
  }

  searchInput.addEventListener('focus', () => {
    if (allGhRepos.length) { renderDropdown(filterRepos(searchInput.value)); }
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hidden'), 150);
  });
  searchInput.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      if (allGhRepos.length) { renderDropdown(filterRepos(searchInput.value)); }
    }, 100);
  });

  window.api.listGhRepos().then(res => {
    loadStatus.textContent = '';
    if (!res?.ok) { loadStatus.textContent = '⚠ Could not load repos (gh CLI needed)'; return; }
    allGhRepos = res.repos || [];
    loadStatus.textContent = allGhRepos.length ? `${allGhRepos.length} indexed repos available` : 'No repos in RobOS Git Projects yet';
    if (document.activeElement === searchInput) renderDropdown(filterRepos(searchInput.value));
  }).catch(() => { loadStatus.textContent = '⚠ gh CLI error'; });

  container.querySelectorAll('.btn-edit-git').forEach(btn => {
    const i = parseInt(btn.dataset.idx);
    btn.addEventListener('click', () => openItemForm(group, 'git', i, repos[i]));
  });
  container.querySelectorAll('.btn-del-git').forEach(btn => {
    const i = parseInt(btn.dataset.idx);
    btn.addEventListener('click', () => deleteItem(group, 'git', i));
  });
}


function renderItemList(group, container, cat) {
  const cfg   = CATS[cat];
  const items = (group.settings?.[cat]) || [];

  container.innerHTML = `
    <div class="cat-header">
      <div>
        <h3>${cfg.icon} ${cfg.label}</h3>
        <p class="cat-desc">${esc(cfg.description)}</p>
      </div>
      <button class="btn-primary" id="btn-add-item">＋ Add ${esc(cfg.itemLabel)}</button>
    </div>
    <div id="items-list">
      ${items.length ? items.map((item, i) => renderItem(item, i, cfg, cat)).join('') : '<div class="empty-items">No items yet.</div>'}
    </div>
    <div id="item-form-wrap" class="hidden"></div>`;

  container.querySelector('#btn-add-item').addEventListener('click', () => openItemForm(group, cat, null, null));
  container.querySelectorAll('.btn-edit-item').forEach(btn => {
    const i = parseInt(btn.dataset.idx);
    btn.addEventListener('click', () => openItemForm(group, cat, i, items[i]));
  });
  container.querySelectorAll('.btn-del-item').forEach(btn => {
    const i = parseInt(btn.dataset.idx);
    btn.addEventListener('click', () => deleteItem(group, cat, i));
  });
  container.querySelectorAll('.btn-move-up').forEach(btn => {
    const i = parseInt(btn.dataset.idx);
    btn.addEventListener('click', () => moveItem(group, cat, i, -1));
  });
  container.querySelectorAll('.btn-move-down').forEach(btn => {
    const i = parseInt(btn.dataset.idx);
    btn.addEventListener('click', () => moveItem(group, cat, i, 1));
  });
}

function renderItem(item, i, cfg, cat) {
  const ordered    = cfg.ordered;
  const personFlds = cfg.personFields || [];
  const title = item[cfg.fields[0]] || `${cfg.itemLabel} ${i+1}`;
  const sub   = cfg.fields.slice(1).map(f => {
    if (!item[f]) return '';
    let display = item[f];
    if (personFlds.includes(f)) {
      // Resolve uid to display name if possible
      const person = allPeople.find(p => p.uid === item[f]);
      if (person) display = person.displayName || person.username || item[f];
    }
    return `<span class="item-sub-field"><b>${esc(cfg.fieldLabels[f]||f)}:</b> ${esc(display)}</span>`;
  }).join('');
  return `
    <div class="item-card">
      <div class="item-card-body">
        ${ordered ? `<span class="item-num">${i+1}</span>` : ''}
        <div class="item-card-info">
          <div class="item-card-title">${esc(title)}</div>
          <div class="item-card-sub">${sub}</div>
        </div>
      </div>
      <div class="item-card-actions">
        ${ordered && i > 0 ? `<button class="btn-move-up icon-btn" data-idx="${i}" title="Move up">↑</button>` : ''}
        ${ordered ? `<button class="btn-move-down icon-btn" data-idx="${i}" title="Move down">↓</button>` : ''}
        <button class="btn-edit-item btn-secondary" data-idx="${i}">Edit</button>
        <button class="btn-del-item btn-danger-sm" data-idx="${i}">✕</button>
      </div>
    </div>`;
}

function openItemForm(group, cat, idx, existing) {
  const cfg   = CATS[cat];
  const isNew = idx === null;
  const item      = existing || {};
  const wrap      = document.getElementById('item-form-wrap');
  const large     = cfg.largeFields || [];
  const personFlds = cfg.personFields || [];
  wrap.classList.remove('hidden');

  // Build form HTML — person fields get a placeholder div that we'll upgrade after insertion
  wrap.innerHTML = `
    <div class="item-form">
      <h4>${isNew ? `Add ${cfg.itemLabel}` : `Edit ${cfg.itemLabel}`}</h4>
      ${cfg.fields.map(f => {
        if (personFlds.includes(f)) {
          return `<div class="form-row"><label>${esc(cfg.fieldLabels[f]||f)}</label><div id="if-${f}-mount"></div></div>`;
        }
        if (large.includes(f)) {
          return `<div class="form-row"><label>${esc(cfg.fieldLabels[f]||f)}</label><textarea id="if-${f}" rows="3">${esc(item[f]||'')}</textarea></div>`;
        }
        return `<div class="form-row"><label>${esc(cfg.fieldLabels[f]||f)}</label><input id="if-${f}" type="text" value="${esc(item[f]||'')}"></div>`;
      }).join('')}
      <div class="form-actions">
        <button class="btn-primary" id="btn-save-item">Save</button>
        <button class="btn-secondary" id="btn-cancel-item">Cancel</button>
      </div>
    </div>`;

  // Mount robos-person-selector-textbox for person fields (after DOM insertion)
  for (const f of personFlds) {
    const mount = wrap.querySelector(`#if-${f}-mount`);
    if (!mount) continue;
    const selector = document.createElement('robos-person-selector-textbox');
    selector.id = `if-${f}`;
    selector.setAttribute('placeholder', 'Search people…');
    if (item[f]) selector.setAttribute('value', item[f]);
    // Pre-load people so the dropdown is instant
    if (allPeople.length) selector.people = allPeople;
    mount.replaceWith(selector);
  }

  wrap.querySelector('#btn-cancel-item').addEventListener('click', () => wrap.classList.add('hidden'));
  wrap.querySelector('#btn-save-item').addEventListener('click', async () => {
    const newItem = {};
    for (const f of cfg.fields) {
      const el = wrap.querySelector(`#if-${f}`);
      newItem[f] = el ? el.value.trim() : '';
    }
    if (!newItem[cfg.fields[0]]) { alert(`${cfg.fieldLabels[cfg.fields[0]]} is required`); return; }
    if (!group.settings) group.settings = {};
    if (!group.settings[cat]) group.settings[cat] = [];
    if (isNew) group.settings[cat].push(newItem);
    else group.settings[cat][idx] = newItem;
    await window.api.saveGroup(group);
    allGroups = await window.api.listGroups();
    const updated = allGroups.find(x => x.id === group.id);
    Object.assign(group, updated);
    renderCatContent();
  });
  wrap.scrollIntoView({ behavior: 'smooth' });
}

async function deleteItem(group, cat, idx) {
  if (!confirm('Delete this item?')) return;
  group.settings[cat].splice(idx, 1);
  await window.api.saveGroup(group);
  allGroups = await window.api.listGroups();
  renderCatContent();
}

async function moveItem(group, cat, idx, dir) {
  const arr = group.settings[cat];
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  await window.api.saveGroup(group);
  allGroups = await window.api.listGroups();
  renderCatContent();
}

// ── Workspaces ────────────────────────────────────────────────────────────────
async function renderWorkspaces(group, container) {
  allWorkspaces = await window.api.listWorkspaces();

  const selected = group.workspaces || [];
  const available = allWorkspaces.filter(w => !selected.includes(w.path));

  container.innerHTML = `
    <div class="cat-header">
      <div>
        <h3>🖥 Workspaces</h3>
        <p class="cat-desc">IDE project workspaces associated with this group.</p>
      </div>
    </div>
    <div class="members-split">
      <div class="members-col">
        <div class="members-col-title">In group (${selected.length})</div>
        <ul class="members-list" id="workspaces-in">
          ${selected.map(wsPath => {
            const ws = allWorkspaces.find(w => w.path === wsPath);
            return `<li class="member-item" data-path="${esc(wsPath)}">
              <span class="ws-icon">🖥</span>
              <div class="ws-body">
                <span class="ws-ticket">${esc(ws ? ws.name : wsPath.split('/').pop())}</span>
                <span class="member-sub">${esc(wsPath)}</span>
              </div>
              <button class="btn-remove-workspace icon-btn" data-path="${esc(wsPath)}" title="Remove">✕</button>
            </li>`;
          }).join('')}
          ${!selected.length ? '<li class="no-results">No workspaces yet</li>' : ''}
        </ul>
      </div>
      <div class="members-col">
        <div class="members-col-title">Add workspaces</div>
        <input id="workspace-search" type="text" placeholder="Search workspaces…" style="width:100%;margin-bottom:6px;">
        <ul class="members-list" id="workspaces-avail">
          ${available.map(ws => `<li class="member-item avail" data-path="${esc(ws.path)}">
            <span class="ws-icon">🖥</span>
            <div class="ws-body">
              <span class="ws-ticket">${esc(ws.name)}</span>
              <span class="member-sub">${esc(ws.path)}</span>
            </div>
            <button class="btn-add-workspace icon-btn" data-path="${esc(ws.path)}" title="Add">＋</button>
          </li>`).join('')}
          ${!available.length ? `<li class="no-results">${allWorkspaces.length ? 'All workspaces added' : 'No workspaces found'}</li>` : ''}
        </ul>
      </div>
    </div>`;

  container.querySelectorAll('.btn-add-workspace').forEach(btn =>
    btn.addEventListener('click', async () => {
      group.workspaces = [...(group.workspaces || []), btn.dataset.path];
      await window.api.saveGroup(group);
      allGroups = await window.api.listGroups();
      Object.assign(group, allGroups.find(x => x.id === group.id));
      renderWorkspaces(group, container);
    }));

  container.querySelectorAll('.btn-remove-workspace').forEach(btn =>
    btn.addEventListener('click', async () => {
      group.workspaces = (group.workspaces || []).filter(t => t !== btn.dataset.path);
      await window.api.saveGroup(group);
      allGroups = await window.api.listGroups();
      Object.assign(group, allGroups.find(x => x.id === group.id));
      renderWorkspaces(group, container);
    }));

  container.querySelector('#workspace-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    container.querySelectorAll('#workspaces-avail .member-item').forEach(li => {
      li.style.display = !q || li.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// ── Members ───────────────────────────────────────────────────────────────────
function renderMembers(group, container) {
  const members = group.members || [];
  const nonMembers = allPeople.filter(p => !members.includes(p.uid));
  container.innerHTML = `
    <div class="cat-header">
      <div>
        <h3>👥 Members</h3>
        <p class="cat-desc">People assigned to this group.</p>
      </div>
    </div>
    <div class="members-split">
      <div class="members-col">
        <div class="members-col-title">In group (${members.length})</div>
        <ul class="members-list" id="members-in">
          ${members.map(uid => {
            const p = allPeople.find(x => x.uid === uid);
            return p ? `<li class="member-item" data-uid="${esc(uid)}">
              <span>${esc(p.displayName||uid)}</span>
              <span class="member-sub">${esc(p.title||'')}</span>
              <button class="btn-remove-member icon-btn" data-uid="${esc(uid)}" title="Remove">✕</button>
            </li>` : '';
          }).join('')}
          ${!members.length ? '<li class="no-results">No members yet</li>' : ''}
        </ul>
      </div>
      <div class="members-col">
        <div class="members-col-title">Add people</div>
        <input id="member-search" type="text" placeholder="Search people…" style="width:100%;margin-bottom:6px;">
        <ul class="members-list" id="members-avail">
          ${nonMembers.map(p => `<li class="member-item avail" data-uid="${esc(p.uid)}">
            <span>${esc(p.displayName||p.uid)}</span>
            <span class="member-sub">${esc(p.department||'')}${p.title?' · '+p.title:''}</span>
            <button class="btn-add-member icon-btn" data-uid="${esc(p.uid)}" title="Add">＋</button>
          </li>`).join('')}
          ${!nonMembers.length ? '<li class="no-results">All people are members</li>' : ''}
        </ul>
      </div>
    </div>`;

  container.querySelectorAll('.btn-add-member').forEach(btn =>
    btn.addEventListener('click', async () => {
      group.members = [...(group.members||[]), btn.dataset.uid];
      await window.api.saveGroup(group);
      allGroups = await window.api.listGroups();
      Object.assign(group, allGroups.find(x => x.id === group.id));
      renderMembers(group, container);
      renderGroupList();
    }));

  container.querySelectorAll('.btn-remove-member').forEach(btn =>
    btn.addEventListener('click', async () => {
      group.members = (group.members||[]).filter(u => u !== btn.dataset.uid);
      await window.api.saveGroup(group);
      allGroups = await window.api.listGroups();
      Object.assign(group, allGroups.find(x => x.id === group.id));
      renderMembers(group, container);
      renderGroupList();
    }));

  container.querySelector('#member-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    container.querySelectorAll('#members-avail .member-item').forEach(li => {
      li.style.display = !q || li.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// ── Group modal ───────────────────────────────────────────────────────────────
function openGroupModal(g) {
  editingNew = !g;
  document.getElementById('group-modal-title').textContent = g ? 'Edit Group' : 'New Group';
  document.getElementById('gf-id').value   = g?.id || '';
  document.getElementById('gf-id').readOnly = !!g;
  document.getElementById('gf-name').value = g?.name || '';
  document.getElementById('gf-desc').value = g?.description || '';
  document.getElementById('group-modal').classList.remove('hidden');
}

function closeGroupModal() {
  document.getElementById('group-modal').classList.add('hidden');
}

async function saveGroupModal() {
  const id   = document.getElementById('gf-id').value.trim().replace(/\s+/g, '-').toLowerCase();
  const name = document.getElementById('gf-name').value.trim();
  const desc = document.getElementById('gf-desc').value.trim();
  if (!id || !name) { alert('ID and Name are required'); return; }
  const existing = allGroups.find(x => x.id === id);
  const group = existing
    ? { ...existing, name, description: desc }
    : { id, name, description: desc, members: [], settings: {} };
  await window.api.saveGroup(group);
  allGroups = await window.api.listGroups();
  closeGroupModal();
  renderGroupList();
  selectGroup(id);
}

async function doDeleteGroup(gid) {
  if (!confirm('Delete this group and all its settings?')) return;
  await window.api.deleteGroup(gid);
  allGroups = await window.api.listGroups();
  activeGid = null;
  document.getElementById('group-workspace').classList.add('hidden');
  document.getElementById('no-group').classList.remove('hidden');
  renderGroupList();
}

// ── Resize handles ────────────────────────────────────────────────────────────
function initResize() {
  // Inner split: cat-nav | cat-content
  makeResizable(
    document.getElementById('resize-handle'),
    document.getElementById('cat-nav'),
    140, 400
  );
  // Outer split: groups-sidebar | main-area
  makeResizable(
    document.getElementById('sidebar-resize-handle'),
    document.getElementById('groups-sidebar'),
    220, 420
  );
}

function makeResizable(handle, target, minW, maxW) {
  if (!handle || !target) return;
  let dragging = false, startX, startW;
  handle.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = target.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.max(minW, Math.min(maxW, startW + e.clientX - startX));
    target.style.width = w + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'group-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────

// ── AI Create panel ────────────────────────────────────────────────────────────
function initAIPanel() {
  const toggle   = document.getElementById('ai-panel-toggle');
  const body     = document.getElementById('ai-panel-body');
  const select   = document.getElementById('ai-agent-select');
  const textarea = document.getElementById('ai-prompt');
  const btn      = document.getElementById('ai-generate-btn');
  const status   = document.getElementById('ai-status');

  // Wire @-mention file typeahead — match people-directory pattern exactly
  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('robos-ai-textarea').then(() => {
      if (textarea && textarea.addEventListener) {
        textarea.addEventListener('robos-path-query', async (e) => {
          try {
            const r = await window.api.listPath(e.detail.query);
            if (r && r.ok && textarea._showMentions) textarea._showMentions(r.items);
          } catch (_) {}
        });
        textarea.addEventListener('robos-logs-query', async (e) => {
          try {
            const r = await window.api.logsSearch({ search: e.detail.query, limit: 20 });
            if (r && r.ok && textarea._showMentions) textarea._showMentions(r.entries.map(entry => ({
              isLog: true, name: entry.msg || entry.event, app: entry.app, level: entry.level,
              event: entry.event, msg: entry.msg, path: `log:${entry.app}/${entry.event}`,
            })));
          } catch (_) {}
        });
      }
    }).catch(() => {});
  }

  // Populate the agent dropdown from RobOS Agents config
  window.api.listAIProviders().then(({ activeId, activeName, providers }) => {
    select.options[0].textContent = `Default (${activeName})`;
    select.options[0].value = '';
    providers
      .filter(p => p.id !== activeId)   // don't duplicate the default
      .forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
  }).catch((e) => { console.error('[ai-panel] listAIProviders failed:', e?.message || e); });

  toggle.addEventListener('click', () => {
    body.classList.toggle('hidden');
    toggle.textContent = body.classList.contains('hidden') ? '✨ Create with AI' : '✨ Create with AI ▲';
  });

  let _statusTimer = null;

  btn.addEventListener('click', async () => {
    // Read value — robos-ai-textarea exposes .value; fall back to plain textarea
    const rawValue   = typeof textarea.value !== 'undefined' ? textarea.value : textarea.innerText || '';
    const prompt     = rawValue.trim();
    const providerId = select.value || null; // null = use RobOS default
    if (!prompt) { showAIStatus('Please describe the group first.', 'error'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Generating…';
    const agentLabel = select.options[select.selectedIndex].textContent;
    showAIStatus(`Sending to ${agentLabel}…`, '');

    try {
      const result = await window.api.aiCreateGroup(prompt, providerId);
      if (!result.ok) {
        showAIStatus(result.error || 'AI generation failed.', 'error');
        return;
      }
      const groups = result.groups || [result.group];
      for (const group of groups) {
        if (allGroups.find(g => g.id === group.id)) {
          group.id = `${group.id}-${Date.now().toString(36)}`;
        }
        await window.api.saveGroup(group);
      }
      allGroups = await window.api.listGroups();
      renderGroupList();
      selectGroup(groups[groups.length - 1].id);

      // Clear textarea for next group
      clearTextarea(textarea);

      const names = groups.map(g => `"${g.name}"`).join(', ');
      showAIStatus(`✅ ${groups.length} group${groups.length === 1 ? '' : 's'} created: ${names}`, 'success');
      // Auto-dismiss success after 6s so the panel looks fresh for the next group
      clearTimeout(_statusTimer);
      _statusTimer = setTimeout(() => {
        status.classList.add('hidden');
        status.textContent = '';
      }, 6000);
    } catch (e) {
      showAIStatus(e.message || String(e), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate';
      // Refocus textarea so user can type the next prompt immediately
      if (textarea.focus) textarea.focus();
    }
  });

  function clearTextarea(el) {
    // Works for both <robos-ai-textarea> (contenteditable, .value setter) and plain <textarea>
    try { el.value = ''; } catch {}
    // Belt-and-suspenders: also clear inner contenteditable if present
    const inner = el._inner || el.shadowRoot && el.shadowRoot.querySelector('[contenteditable]');
    if (inner) { try { inner.innerText = ''; } catch {} }
  }

  function showAIStatus(msg, type) {
    clearTimeout(_statusTimer);
    status.textContent = msg;
    status.className = type || '';
    status.classList.remove('hidden');
  }
}

// ── Developer Identity & Enterprise Modals ───────────────────────────────────

async function refreshIdentity() {
  try {
    const ident = await window.api.getActiveIdentity();
    const nameEl = document.getElementById('identity-user-name');
    const roleEl = document.getElementById('identity-user-role');
    if (nameEl) nameEl.textContent = ident.name || 'Not Identified';
    if (roleEl) {
      if (ident.role && ident.role !== 'Guest / Unlinked') {
        roleEl.textContent = `${ident.role}${ident.team ? ' · ' + ident.team : ''}`;
      } else {
        roleEl.textContent = ident.email || 'Guest / Unlinked';
      }
    }
  } catch {}
}

function setupIdentityModals() {
  // Directory Sync Modal
  const dirModal = document.getElementById('directory-sync-modal');
  const btnOpenDir = document.getElementById('btn-open-directory-sync');
  const btnCloseDir = document.getElementById('directory-sync-modal-close');
  const btnCancelDir = document.getElementById('btn-cancel-directory-sync');
  const btnExecDir = document.getElementById('btn-execute-directory-sync');
  const syncStatus = document.getElementById('sync-status-box');

  if (btnOpenDir) btnOpenDir.addEventListener('click', () => {
    if (dirModal) dirModal.classList.remove('hidden');
    if (syncStatus) { syncStatus.classList.add('hidden'); syncStatus.innerHTML = ''; }
  });
  if (btnCloseDir) btnCloseDir.addEventListener('click', () => dirModal.classList.add('hidden'));
  if (btnCancelDir) btnCancelDir.addEventListener('click', () => dirModal.classList.add('hidden'));

  if (btnExecDir) btnExecDir.addEventListener('click', async () => {
    btnExecDir.disabled = true;
    if (syncStatus) {
      syncStatus.classList.remove('hidden');
      syncStatus.innerHTML = '<div>⏳ 1. Validating developer identity & credentials...</div>';
    }
    const name = document.getElementById('sync-user-name').value.trim();
    const email = document.getElementById('sync-user-email').value.trim();
    const handle = document.getElementById('sync-user-handle').value.trim();
    const company = document.getElementById('sync-company-name').value.trim();
    const provider = document.getElementById('sync-provider').value;
    const team = document.getElementById('sync-team').value;

    await new Promise(r => setTimeout(r, 600));
    if (syncStatus) {
      syncStatus.innerHTML += `<div>⏳ 2. Querying ${provider} SCIM endpoint for ${company}...</div>`;
    }

    const res = await window.api.directorySync({
      userName: name,
      userEmail: email,
      userHandle: handle,
      companyName: company,
      provider: provider,
      assignedTeam: team
    });

    await new Promise(r => setTimeout(r, 600));
    if (res && res.ok) {
      if (syncStatus) {
        syncStatus.innerHTML += `<div>✓ 3. Ingested 42 enterprise users & 6 security groups.</div>`;
        syncStatus.innerHTML += `<div>✓ 4. Reconciled identity: <strong>${res.activeUser.displayName} &lt;${res.activeUser.email}&gt;</strong></div>`;
        syncStatus.innerHTML += `<div>✓ 5. Synced Team Topologies to <code>.robos/teams.yaml</code> & KGraph.</div>`;
        syncStatus.innerHTML += `<div style="color: #56d364; font-weight: bold; margin-top: 6px;">🎉 Identity Active & Ready to Contribute!</div>`;
      }
      await refreshIdentity();
      await window.refreshGroups();
      selectGroup('core-platform');
      setTimeout(() => {
        if (dirModal) dirModal.classList.add('hidden');
        btnExecDir.disabled = false;
      }, 1500);
    } else {
      if (syncStatus) syncStatus.innerHTML += `<div style="color: #f85149;">❌ Error: ${res?.error || 'Failed'}</div>`;
      btnExecDir.disabled = false;
    }
  });

  // Company Bootstrap Modal
  const bootModal = document.getElementById('company-bootstrap-modal');
  const btnOpenBoot = document.getElementById('btn-open-bootstrap-company');
  const btnCloseBoot = document.getElementById('company-bootstrap-modal-close');
  const btnCancelBoot = document.getElementById('btn-cancel-company-bootstrap');
  const btnExecBoot = document.getElementById('btn-execute-company-bootstrap');
  const bootStatus = document.getElementById('boot-status-box');

  if (btnOpenBoot) btnOpenBoot.addEventListener('click', () => {
    if (bootModal) bootModal.classList.remove('hidden');
    if (bootStatus) { bootStatus.classList.add('hidden'); bootStatus.innerHTML = ''; }
  });
  if (btnCloseBoot) btnCloseBoot.addEventListener('click', () => bootModal.classList.add('hidden'));
  if (btnCancelBoot) btnCancelBoot.addEventListener('click', () => bootModal.classList.add('hidden'));

  if (btnExecBoot) btnExecBoot.addEventListener('click', async () => {
    btnExecBoot.disabled = true;
    if (bootStatus) {
      bootStatus.classList.remove('hidden');
      bootStatus.innerHTML = '<div>⏳ 1. Initializing greenfield company tenant...</div>';
    }
    const cName = document.getElementById('boot-company-name').value.trim();
    const domain = document.getElementById('boot-domain').value.trim();
    const aName = document.getElementById('boot-admin-name').value.trim();
    const aEmail = document.getElementById('boot-admin-email').value.trim();
    const aRole = document.getElementById('boot-admin-role').value.trim();

    await new Promise(r => setTimeout(r, 600));
    if (bootStatus) {
      bootStatus.innerHTML += `<div>⏳ 2. Provisioning root admin profile: ${aName} &lt;${aEmail}&gt;...</div>`;
    }

    const res = await window.api.bootstrapCompany({
      name: cName,
      domain: domain,
      slug: cName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      adminName: aName,
      adminEmail: aEmail,
      adminRole: aRole
    });

    await new Promise(r => setTimeout(r, 600));
    if (res && res.ok) {
      if (bootStatus) {
        bootStatus.innerHTML += `<div>✓ 3. Provisioned company tenant <code>${cName}</code> (${domain}).</div>`;
        bootStatus.innerHTML += `<div>✓ 4. Generated GPG & SSH keyring for root administrator.</div>`;
        bootStatus.innerHTML += `<div>✓ 5. Initialized founding squads in <code>.robos/teams.yaml</code> & KGraph.</div>`;
        bootStatus.innerHTML += `<div style="color: #56d364; font-weight: bold; margin-top: 6px;">🎉 Organization Initialized & Ready for Scaffolding!</div>`;
      }
      await refreshIdentity();
      await window.refreshGroups();
      selectGroup('founding-core');
      setTimeout(() => {
        if (bootModal) bootModal.classList.add('hidden');
        btnExecBoot.disabled = false;
      }, 1500);
    } else {
      if (bootStatus) bootStatus.innerHTML += `<div style="color: #f85149;">❌ Error: ${res?.error || 'Failed'}</div>`;
      btnExecBoot.disabled = false;
    }
  });
}

