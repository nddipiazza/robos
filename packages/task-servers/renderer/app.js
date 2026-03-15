'use strict';

let servers = [];
let activeId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const TYPE_META = {
  jira:   { badge: 'Jira',  cls: 'jira',   label: 'Jira / Atlassian'  },
  github: { badge: 'GH',    cls: 'github',  label: 'GitHub Issues'     },
  gitlab: { badge: 'GL',    cls: 'gitlab',  label: 'GitLab Issues'     },
  linear: { badge: 'LN',    cls: 'linear',  label: 'Linear'            },
  azure:  { badge: 'ADO',   cls: 'azure',   label: 'Azure DevOps'      },
};

function typeLabel(type) {
  const m = TYPE_META[type] || { badge: type?.toUpperCase() || '?', cls: 'github' };
  return `<span class="type-badge ${m.cls}">${m.badge}</span>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  servers = await window.api.loadTaskServers();
  renderList();

  // Add button / dropdown
  document.getElementById('btn-add').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('add-menu').classList.toggle('hidden');
  });
  document.addEventListener('click', () => document.getElementById('add-menu').classList.add('hidden'));

  document.querySelectorAll('.add-item').forEach(el => {
    el.addEventListener('click', () => addServer(el.dataset.type));
  });
});

// ── List ──────────────────────────────────────────────────────────────────────
function renderList() {
  const ul = document.getElementById('server-list');
  if (!servers.length) {
    ul.innerHTML = '<li style="padding:12px;color:#484f58;font-size:12px;text-align:center;">No servers configured</li>';
    return;
  }
  ul.innerHTML = servers.map(s => `
    <li class="server-item${s.id === activeId ? ' active' : ''}" data-id="${esc(s.id)}">
      ${typeLabel(s.type)}
      <span class="server-item-name">${esc(s.name || 'Unnamed')}</span>
      <button class="server-item-del" data-id="${esc(s.id)}" title="Delete">✕</button>
    </li>
  `).join('');

  ul.querySelectorAll('.server-item').forEach(el => {
    el.addEventListener('click', () => selectServer(el.dataset.id));
  });
  ul.querySelectorAll('.server-item-del').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); deleteServer(btn.dataset.id); });
  });
}

// ── Add / Delete ──────────────────────────────────────────────────────────────
function addServer(type) {
  const meta = TYPE_META[type] || { label: type };
  const defaults = type === 'jira' ? {
    url: '', username: '', projects: [], workflow_states: [], issue_types: []
  } : type === 'github' ? {
    gh_api_url: '', use_gh_cli: true, repos: [], gh_labels: [], workflow_states: [], issue_types: []
  } : {
    api_url: '', username: '', projects: [], notes: `${meta.label} task server — configure API URL and credentials.`
  };
  const s = { id: uid(), name: `New ${meta.label}`, type, ...defaults };
  servers.push(s);
  renderList();
  selectServer(s.id);
}

function deleteServer(id) {
  servers = servers.filter(s => s.id !== id);
  if (activeId === id) { activeId = null; showEmpty(); }
  renderList();
  save();
}

// ── Select / Editor ───────────────────────────────────────────────────────────
function selectServer(id) {
  activeId = id;
  renderList();
  const s = servers.find(x => x.id === id);
  if (!s) return showEmpty();
  document.getElementById('empty-state').classList.add('hidden');
  const editor = document.getElementById('editor');
  editor.classList.remove('hidden');
  if (s.type === 'jira')        editor.innerHTML = jiraForm(s);
  else if (s.type === 'github') editor.innerHTML = githubForm(s);
  else                          editor.innerHTML = genericForm(s);
  wireForm(s);
}

function showEmpty() {
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('editor').classList.add('hidden');
}

// ── Jira form ─────────────────────────────────────────────────────────────────
function jiraForm(s) {
  return `
  <div class="editor-header">
    <span class="editor-type-badge">${typeLabel('jira')}</span>
    <input class="editor-title" id="f-name" type="text" value="${esc(s.name)}" placeholder="Server name">
  </div>

  <div class="form-section">
    <div class="form-section-title">Connection</div>
    <div class="form-row">
      <label>Jira Base URL</label>
      <input id="f-url" type="url" value="${esc(s.url||'')}" placeholder="https://yourcompany.atlassian.net">
    </div>
    <div class="form-row">
      <label>Username / Email</label>
      <input id="f-username" type="text" value="${esc(s.username||'')}" placeholder="user@example.com">
    </div>
    <div class="form-row">
      <label>API Token <span style="color:#484f58">(from pass store)</span></label>
      <div class="token-row">
        <input id="f-token-path" type="text" readonly value="${esc(s.token_pass_path||'')}" placeholder="Select a pass entry…" style="cursor:pointer;">
        <button class="btn-pass" id="btn-load-pass">Select…</button>
      </div>
    </div>
  </div>

  <div class="form-section">
    <div class="form-section-title">Projects</div>
    <div class="form-row">
      <label>Project Keys (e.g. PROJ, APP)</label>
      <div class="tag-list" id="projects-tags">
        ${(s.projects||[]).map(p => tagHtml(p)).join('')}
      </div>
      <div class="tag-input-wrap">
        <input id="project-input" type="text" placeholder="Add project key…" style="font-size:13px;">
        <button class="btn-tag-add" id="btn-add-project">Add</button>
      </div>
    </div>
  </div>

  <div class="action-bar">
    <button class="btn-secondary" id="btn-test">Test Connection</button>
    <button class="btn-primary"   id="btn-save">Save</button>
    <span id="status-msg" class="status-msg hidden"></span>
    <button class="btn-danger" id="btn-delete">Delete Server</button>
  </div>`;
}

// ── GitHub form ───────────────────────────────────────────────────────────────
function githubForm(s) {
  const repos   = s.repos || [];
  const useGhCli = s.use_gh_cli !== false; // default true
  return `
  <div class="editor-header">
    <span class="editor-type-badge">${typeLabel('github')}</span>
    <input class="editor-title" id="f-name" type="text" value="${esc(s.name)}" placeholder="Server name">
  </div>

  <div class="form-section">
    <div class="form-section-title">Connection</div>
    <div class="form-row">
      <label>GitHub API URL <span style="color:#484f58">(leave blank for github.com)</span></label>
      <input id="f-gh-api-url" type="url" value="${esc(s.gh_api_url||'')}" placeholder="https://api.github.com">
    </div>
    <div class="form-row" style="flex-direction:row;align-items:center;gap:8px;padding:4px 0">
      <input type="checkbox" id="f-use-gh-cli" style="width:auto;margin:0;accent-color:#58a6ff"${useGhCli ? ' checked' : ''}>
      <label for="f-use-gh-cli" style="margin:0;font-size:13px;cursor:pointer">Use gh CLI <span style="color:#484f58;font-size:11px">(recommended — uses your existing <code>gh auth login</code> session)</span></label>
    </div>
    <div id="token-section"${useGhCli ? ' style="display:none"' : ''}>
      <div class="form-row">
        <label>Personal Access Token <span style="color:#484f58">(from pass store)</span></label>
        <div class="token-row">
          <input id="f-gh-token-path" type="text" readonly value="${esc(s.gh_token_pass_path||'')}" placeholder="Select a pass entry…" style="cursor:pointer;">
          <button class="btn-pass" id="btn-load-gh-pass">Select…</button>
        </div>
      </div>
    </div>
  </div>

  <div class="form-section">
    <div class="form-section-title">Repositories</div>
    <table class="repos-table">
      <thead><tr><th>Org / Owner</th><th>Repository</th><th></th></tr></thead>
      <tbody id="repos-tbody">
        ${repos.map((r,i) => repoRow(r, i)).join('')}
      </tbody>
    </table>
    <div class="add-repo-row">
      <input id="new-repo-org"  type="text" placeholder="org or owner" style="font-size:13px; max-width:160px;">
      <input id="new-repo-name" type="text" placeholder="repository" style="font-size:13px;">
      <button class="btn-tag-add" id="btn-add-repo">Add</button>
    </div>
  </div>

  <div class="form-section">
    <div class="form-section-title">Filters</div>
    <div class="form-row">
      <label>Labels to include <span style="color:#484f58">(leave empty for all)</span></label>
      <div class="tag-list" id="labels-tags">
        ${(s.gh_labels||[]).map(l => tagHtml(l)).join('')}
      </div>
      <div class="tag-input-wrap">
        <input id="label-input" type="text" placeholder="Add label…" style="font-size:13px;">
        <button class="btn-tag-add" id="btn-add-label">Add</button>
      </div>
    </div>
  </div>

  <div class="action-bar">
    <button class="btn-secondary" id="btn-test">Test Connection</button>
    <button class="btn-primary"   id="btn-save">Save</button>
    <span id="status-msg" class="status-msg hidden"></span>
    <button class="btn-danger" id="btn-delete">Delete Server</button>
  </div>`;
}

function repoRow(r, i) {
  return `<tr data-repo-idx="${i}">
    <td>${esc(r.org||r.owner||'')}</td>
    <td>${esc(r.repo||r.name||'')}</td>
    <td><button title="Remove" data-repo-idx="${i}">✕</button></td>
  </tr>`;
}

function tagHtml(val) {
  return `<span class="tag">${esc(val)}<button class="tag-remove" data-val="${esc(val)}">✕</button></span>`;
}

// ── Generic form (GitLab, Linear, Azure DevOps, etc.) ────────────────────────
function genericForm(s) {
  const meta = TYPE_META[s.type] || { label: s.type, cls: 'github', badge: s.type?.toUpperCase() };
  return `
  <div class="editor-header">
    <span class="editor-type-badge">${typeLabel(s.type)}</span>
    <input class="editor-title" id="f-name" type="text" value="${esc(s.name)}" placeholder="Server name">
  </div>
  <div class="notice-info">
    <strong>${esc(meta.label)} support is planned.</strong>
    Save your connection details below. Issue creation and dashboard integration will be wired in once the API adapter is built.
  </div>
  <div class="form-section">
    <div class="form-section-title">Connection</div>
    <div class="form-row">
      <label>API / Instance URL</label>
      <input id="f-api-url" type="url" value="${esc(s.api_url||s.url||s.gh_api_url||'')}" placeholder="https://your-instance.example.com">
    </div>
    <div class="form-row">
      <label>Username / Email</label>
      <input id="f-username" type="text" value="${esc(s.username||'')}" placeholder="user@example.com">
    </div>
    <div class="form-row">
      <label>API Token <span style="color:#484f58">(from pass store)</span></label>
      <div class="token-row">
        <input id="f-token-path" type="text" readonly value="${esc(s.token_pass_path||'')}" placeholder="Select a pass entry…" style="cursor:pointer;">
        <button class="btn-pass" id="btn-load-pass">Select…</button>
      </div>
    </div>
  </div>
  <div class="form-section">
    <div class="form-section-title">Project Keys / Namespaces</div>
    <div class="form-row">
      <label>Project Keys</label>
      <div class="tag-list" id="projects-tags">
        ${(s.projects||[]).map(p => tagHtml(p)).join('')}
      </div>
      <div class="tag-input-wrap">
        <input id="project-input" type="text" placeholder="Add project key…" style="font-size:13px;">
        <button class="btn-tag-add" id="btn-add-project">Add</button>
      </div>
    </div>
  </div>
  <div class="form-section">
    <div class="form-section-title">Notes</div>
    <div class="form-row">
      <label>Notes</label>
      <textarea id="f-notes" style="background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:6px;font-size:12px;width:100%;height:60px;">${esc(s.notes||'')}</textarea>
    </div>
  </div>
  <div class="action-bar">
    <button class="btn-primary" id="btn-save">Save</button>
    <span id="status-msg" class="status-msg hidden"></span>
    <button class="btn-danger" id="btn-delete">Delete Server</button>
  </div>`;
}


function wireForm(s) {
  // Tag lists
  wireTagList('projects-tags', 'project-input', 'btn-add-project', s, 'projects');
  wireTagList('labels-tags',   'label-input',    'btn-add-label',   s, 'gh_labels');

  // Repos table (github)
  wireRepos(s);

  // Load from pass — opens picker which sets the path field
  const passBtn = document.getElementById('btn-load-pass');
  if (passBtn) {
    document.getElementById('f-token-path').addEventListener('click', () => openPassPicker('f-token-path', true));
    passBtn.addEventListener('click', () => openPassPicker('f-token-path', true));
  }
  const ghPassBtn = document.getElementById('btn-load-gh-pass');
  if (ghPassBtn) {
    document.getElementById('f-gh-token-path').addEventListener('click', () => openPassPicker('f-gh-token-path', true));
    ghPassBtn.addEventListener('click', () => openPassPicker('f-gh-token-path', true));
  }

  // "Use gh CLI" checkbox — show/hide token section
  const useGhCliChk = document.getElementById('f-use-gh-cli');
  const tokenSection = document.getElementById('token-section');
  if (useGhCliChk && tokenSection) {
    useGhCliChk.addEventListener('change', () => {
      tokenSection.style.display = useGhCliChk.checked ? 'none' : '';
    });
  }

  // Test connection
  const btnTest = document.getElementById('btn-test');
  if (btnTest) btnTest.addEventListener('click', async () => {
    collectFormIntoServer(s);
    const btn = document.getElementById('btn-test');
    btn.textContent = 'Testing…'; btn.disabled = true;
    let res;
    if (s.type === 'jira') {
      let token = '';
      if (s.token_pass_path) {
        const pr = await window.api.loadPassSecret(s.token_pass_path);
        if (!pr.ok) { showStatus('err', `pass: ${pr.error}`); btn.textContent = 'Test Connection'; btn.disabled = false; return; }
        token = pr.value;
      }
      res = await window.api.testJiraConnection({ url: s.url, username: s.username, token });
      if (res.ok) showStatus('ok', `Connected as ${res.displayName}`);
      else showStatus('err', res.error);
    } else {
      let token = '';
      if (!s.use_gh_cli && s.gh_token_pass_path) {
        const pr = await window.api.loadPassSecret(s.gh_token_pass_path);
        if (!pr.ok) { showStatus('err', `pass: ${pr.error}`); btn.textContent = 'Test Connection'; btn.disabled = false; return; }
        token = pr.value;
      }
      res = await window.api.testGithubConnection({ apiUrl: s.gh_api_url, token, useGhCli: s.use_gh_cli !== false });
      if (res.ok) showStatus('ok', `Connected as @${res.login}`);
      else showStatus('err', res.error);
    }
    btn.textContent = 'Test Connection'; btn.disabled = false;
  });

  // Save
  document.getElementById('btn-save').addEventListener('click', () => {
    collectFormIntoServer(s);
    save();
    showStatus('ok', 'Saved');
    renderList();
  });

  // Delete
  document.getElementById('btn-delete').addEventListener('click', () => {
    if (confirm(`Delete "${s.name}"?`)) deleteServer(s.id);
  });
}

function wireTagList(listId, inputId, btnId, server, field) {
  const list = document.getElementById(listId);
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!list || !input || !btn) return;

  function addTag() {
    const val = input.value.trim();
    if (!val) return;
    if (!(server[field] || []).includes(val)) {
      server[field] = [...(server[field] || []), val];
      refreshTagList(list, server, field);
    }
    input.value = '';
  }

  btn.addEventListener('click', addTag);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });

  list.addEventListener('click', e => {
    const rm = e.target.closest('.tag-remove');
    if (!rm) return;
    server[field] = (server[field] || []).filter(v => v !== rm.dataset.val);
    refreshTagList(list, server, field);
  });
}

function refreshTagList(listEl, server, field) {
  listEl.innerHTML = (server[field] || []).map(v => tagHtml(v)).join('');
}

function wireRepos(s) {
  const tbody = document.getElementById('repos-tbody');
  const orgIn  = document.getElementById('new-repo-org');
  const nameIn = document.getElementById('new-repo-name');
  const addBtn = document.getElementById('btn-add-repo');
  if (!tbody || !addBtn) return;

  function addRepo() {
    const org  = orgIn.value.trim();
    const name = nameIn.value.trim();
    if (!org || !name) return;
    s.repos = [...(s.repos||[]), { org, repo: name }];
    tbody.innerHTML = s.repos.map((r,i) => repoRow(r,i)).join('');
    orgIn.value = ''; nameIn.value = '';
    wireRepoDeletes(s, tbody);
  }

  addBtn.addEventListener('click', addRepo);
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addRepo(); } });
  wireRepoDeletes(s, tbody);
}

function wireRepoDeletes(s, tbody) {
  tbody.querySelectorAll('button[data-repo-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.repoIdx, 10);
      s.repos.splice(idx, 1);
      tbody.innerHTML = s.repos.map((r,i) => repoRow(r,i)).join('');
      wireRepoDeletes(s, tbody);
    });
  });
}

function collectFormIntoServer(s) {
  const nameEl = document.getElementById('f-name');
  if (nameEl) s.name = nameEl.value.trim() || s.name;

  if (s.type === 'jira') {
    s.url             = (document.getElementById('f-url')?.value||'').trim();
    s.username        = (document.getElementById('f-username')?.value||'').trim();
    s.token_pass_path = (document.getElementById('f-token-path')?.value||'').trim();
    delete s.token;
  } else if (s.type === 'github') {
    s.gh_api_url         = (document.getElementById('f-gh-api-url')?.value||'').trim();
    const ghCliChk       = document.getElementById('f-use-gh-cli');
    s.use_gh_cli         = ghCliChk ? ghCliChk.checked : (s.use_gh_cli !== false);
    s.gh_token_pass_path = (document.getElementById('f-gh-token-path')?.value||'').trim();
    delete s.gh_token;
  } else {
    // Generic: GitLab, Linear, Azure, etc.
    s.api_url         = (document.getElementById('f-api-url')?.value||'').trim();
    s.username        = (document.getElementById('f-username')?.value||'').trim();
    s.token_pass_path = (document.getElementById('f-token-path')?.value||'').trim();
    s.notes           = (document.getElementById('f-notes')?.value||'').trim();
  }
}

function showStatus(type, msg) {
  const el = document.getElementById('status-msg');
  if (!el) return;
  el.className = `status-msg ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── Pass picker ───────────────────────────────────────────────────────────────
let _passEntries = [];
let _passTargetInput = null;
let _passPathOnly = false;

async function openPassPicker(targetInputId, pathOnly = false) {
  _passTargetInput = targetInputId;
  _passPathOnly = pathOnly;
  if (!_passEntries.length) {
    _passEntries = await window.api.loadPassEntries();
  }
  renderPassList(_passEntries);
  document.getElementById('pass-search').value = '';
  document.getElementById('pass-modal').classList.remove('hidden');
  document.getElementById('pass-search').focus();
}

function renderPassList(entries) {
  const ul = document.getElementById('pass-list');
  if (!entries.length) {
    ul.innerHTML = '<li class="no-results">No entries found</li>';
    return;
  }
  ul.innerHTML = entries.map(e => `<li data-entry="${esc(e)}">${esc(e)}</li>`).join('');
  ul.querySelectorAll('li[data-entry]').forEach(li => {
    li.addEventListener('click', () => selectPassEntry(li.dataset.entry));
  });
}

async function selectPassEntry(passPath) {
  document.getElementById('pass-modal').classList.add('hidden');
  if (_passTargetInput) {
    const el = document.getElementById(_passTargetInput);
    if (el) {
      if (_passPathOnly) {
        el.value = passPath;
      } else {
        const res = await window.api.loadPassSecret(passPath);
        if (res.ok) el.value = res.value;
        else showStatus('err', `Could not load: ${passPath}`);
      }
    }
  }
}

document.getElementById('pass-modal-close').addEventListener('click', () => {
  document.getElementById('pass-modal').classList.add('hidden');
});
document.getElementById('pass-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderPassList(q ? _passEntries.filter(x => x.toLowerCase().includes(q)) : _passEntries);
});
document.getElementById('pass-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('pass-modal'))
    document.getElementById('pass-modal').classList.add('hidden');
});


async function save() {
  await window.api.saveTaskServers(servers);
}


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'task-servers');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
