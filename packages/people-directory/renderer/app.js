'use strict';

const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);

let allPeople = [];
let filtered  = [];
let activeUid = null;
let editMode  = false;
let myProfileUid = null;

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await reload();

  document.getElementById('search').addEventListener('input', applyFilter);
  document.getElementById('filter-dept').addEventListener('change', applyFilter);
  document.getElementById('btn-add').addEventListener('click', openNew);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-modal').classList.remove('hidden'));
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('import-modal-close').addEventListener('click', () => document.getElementById('import-modal').classList.add('hidden'));
  document.getElementById('settings-modal-close').addEventListener('click', () => document.getElementById('settings-modal').classList.add('hidden'));
  document.getElementById('btn-do-import').addEventListener('click', doImport);
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('cfg-backend').addEventListener('change', e => {
    document.getElementById('ldap-fields').classList.toggle('hidden', e.target.value !== 'ldap');
  });
  initAIPanel();
});

async function reload() {
  [allPeople, myProfileUid] = await Promise.all([
    window.api.listPeople(),
    window.api.getMyProfile(),
  ]);
  allPeople.sort((a,b) => (a.displayName||'').localeCompare(b.displayName||''));
  populateDeptFilter();
  applyFilter();
}

// ── Filter ────────────────────────────────────────────────────────────────────
function populateDeptFilter() {
  const depts = [...new Set(allPeople.map(p => p.department).filter(Boolean))].sort();
  const sel = document.getElementById('filter-dept');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All departments</option>' +
    depts.map(d => `<option value="${esc(d)}"${d===cur?' selected':''}>${esc(d)}</option>`).join('');
}

function applyFilter() {
  const q    = document.getElementById('search').value.toLowerCase();
  const dept = document.getElementById('filter-dept').value;
  filtered = allPeople.filter(p => {
    const matchQ = !q ||
      (p.displayName||'').toLowerCase().includes(q) ||
      (p.email||'').toLowerCase().includes(q) ||
      (p.title||'').toLowerCase().includes(q) ||
      (p.uid||'').toLowerCase().includes(q);
    const matchD = !dept || p.department === dept;
    return matchQ && matchD;
  });
  renderList();
}

// ── List ──────────────────────────────────────────────────────────────────────
function renderList() {
  const ul = document.getElementById('people-list');
  if (!filtered.length) {
    ul.innerHTML = '<li class="no-results">No results</li>';
    return;
  }
  ul.innerHTML = filtered.map(p => `
    <li class="person-item${p.uid===activeUid?' active':''}" data-uid="${esc(p.uid)}">
      <div class="person-avatar">${avatar(p)}</div>
      <div class="person-info">
        <div class="person-name">${esc(p.displayName||p.uid)}${p.uid===myProfileUid?' <span class="me-badge">👤 Me</span>':''}</div>
        <div class="person-sub">${esc(p.title||'')}${p.title&&p.department?' · ':''}${esc(p.department||'')}</div>
      </div>
    </li>`).join('');
  ul.querySelectorAll('.person-item').forEach(li =>
    li.addEventListener('click', () => selectPerson(li.dataset.uid)));
}

function avatar(p) {
  const initials = ((p.firstName||'')[0]||'') + ((p.lastName||'')[0]||'') ||
                   (p.displayName||'?')[0].toUpperCase();
  return `<span class="avatar-initials">${esc(initials.toUpperCase())}</span>`;
}

// ── Profile view ──────────────────────────────────────────────────────────────
function selectPerson(uid) {
  activeUid = uid;
  editMode  = false;
  renderList();
  const p = allPeople.find(x => x.uid === uid);
  if (!p) return;
  showProfile(p);
}

function showProfile(p) {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('edit-panel').classList.add('hidden');
  const el = document.getElementById('profile');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${avatar(p)}</div>
      <div class="profile-header-info">
        <h2>${esc(p.displayName||p.uid)}</h2>
        <div class="profile-title">${esc(p.title||'')}${p.title&&p.department?' · ':''}${esc(p.department||'')}</div>
        ${p.location ? `<div class="profile-loc">📍 ${esc(p.location)}</div>` : ''}
      </div>
      <div class="profile-actions">
        ${p.uid === myProfileUid
          ? '<span class="me-badge-large">👤 This is you</span>'
          : `<button class="btn-secondary" id="btn-set-me">Set as My Profile</button>`}
        <button class="btn-secondary" id="btn-edit">Edit</button>
        <button class="btn-danger" id="btn-delete">Delete</button>
      </div>
    </div>
    <div class="profile-body">
      ${field('Email',  p.email   ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '')}
      ${field('Phone',  p.phone)}
      ${field('Manager', p.manager)}
      ${field('Groups',  (p.groups||[]).join(', '))}
      ${field('Bio',     p.bio)}
      <div class="profile-section-title">Identifiers</div>
      ${field('UID', `<code>${esc(p.uid)}</code>`)}
      ${field('Username', p.username)}
    </div>`;
  document.getElementById('btn-edit').addEventListener('click', () => openEdit(p));
  document.getElementById('btn-delete').addEventListener('click', () => doDelete(p.uid));
  const btnMe = document.getElementById('btn-set-me');
  if (btnMe) btnMe.addEventListener('click', async () => {
    await window.api.setMyProfile(p.uid);
    myProfileUid = p.uid;
    renderList();
    showProfile(p);
  });
}

function field(label, val) {
  if (!val) return '';
  return `<div class="profile-field"><span class="field-label">${esc(label)}</span><span class="field-val">${val}</span></div>`;
}

// ── Edit / New ────────────────────────────────────────────────────────────────
function openNew() {
  activeUid = null;
  editMode  = true;
  renderList();
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('profile').classList.add('hidden');
  openEdit({ uid: uid(), displayName:'', firstName:'', lastName:'', email:'', title:'', department:'', phone:'', location:'', manager:'', username:'', bio:'', groups:[] });
}

function openEdit(p) {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('profile').classList.add('hidden');
  const el = document.getElementById('edit-panel');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="edit-header">
      <h2>${p.displayName ? 'Edit — '+esc(p.displayName) : 'New Person'}</h2>
    </div>
    <div class="edit-body">
      <div class="edit-section">Identity</div>
      ${editRow('UID *',        'f-uid',         p.uid,         'text',  p.displayName ? 'readonly' : '')}
      ${editRow('Display Name','f-displayName',  p.displayName, 'text')}
      ${editRow('First Name',  'f-firstName',    p.firstName,   'text')}
      ${editRow('Last Name',   'f-lastName',     p.lastName,    'text')}
      ${editRow('Username',    'f-username',     p.username,    'text')}
      <div class="edit-section">Contact</div>
      ${editRow('Email',       'f-email',        p.email,       'email')}
      ${editRow('Phone',       'f-phone',        p.phone,       'text')}
      ${editRow('Location',    'f-location',     p.location,    'text')}
      <div class="edit-section">Org</div>
      ${editRow('Title',       'f-title',        p.title,       'text')}
      ${editRow('Department',  'f-department',   p.department,  'text')}
      ${editRow('Manager',     'f-manager',      p.manager,     'text')}
      <div class="edit-section">Profile</div>
      <div class="form-row"><label>Bio</label><textarea id="f-bio" rows="3">${esc(p.bio||'')}</textarea></div>
    </div>
    <div class="edit-footer">
      <button class="btn-primary" id="btn-save-person">Save</button>
      <button class="btn-secondary" id="btn-cancel-edit">Cancel</button>
    </div>`;

  document.getElementById('btn-save-person').addEventListener('click', () => doSave(p));
  document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    if (activeUid) selectPerson(activeUid);
    else { document.getElementById('edit-panel').classList.add('hidden'); document.getElementById('empty-state').classList.remove('hidden'); }
  });
}

function editRow(label, id, val, type, extra='') {
  return `<div class="form-row"><label>${esc(label)}</label><input id="${id}" type="${type}" value="${esc(val||'')}" ${extra}></div>`;
}

async function doSave(orig) {
  const person = {
    ...orig,
    uid:         document.getElementById('f-uid').value.trim(),
    displayName: document.getElementById('f-displayName').value.trim(),
    firstName:   document.getElementById('f-firstName').value.trim(),
    lastName:    document.getElementById('f-lastName').value.trim(),
    username:    document.getElementById('f-username').value.trim(),
    email:       document.getElementById('f-email').value.trim(),
    phone:       document.getElementById('f-phone').value.trim(),
    location:    document.getElementById('f-location').value.trim(),
    title:       document.getElementById('f-title').value.trim(),
    department:  document.getElementById('f-department').value.trim(),
    manager:     document.getElementById('f-manager').value.trim(),
    bio:         document.getElementById('f-bio').value.trim(),
  };
  if (!person.uid) { alert('UID is required'); return; }
  if (!person.displayName) person.displayName = `${person.firstName} ${person.lastName}`.trim() || person.uid;
  await window.api.savePerson(person);
  activeUid = person.uid;
  await reload();
  selectPerson(person.uid);
}

async function doDelete(uid) {
  if (!confirm('Delete this person?')) return;
  await window.api.deletePerson(uid);
  activeUid = null;
  document.getElementById('profile').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
  await reload();
}

// ── Import LDIF ───────────────────────────────────────────────────────────────
async function doImport() {
  const text = document.getElementById('ldif-text').value;
  if (!text.trim()) return;
  const res = await window.api.importLdif(text);
  document.getElementById('import-modal').classList.add('hidden');
  document.getElementById('ldif-text').value = '';
  await reload();
  alert(`Imported ${res.imported} people.`);
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function openSettings() {
  const cfg = await window.api.getConfig();
  document.getElementById('cfg-backend').value = cfg.backend || 'filesystem';
  document.getElementById('cfg-url').value       = cfg.ldap?.url || '';
  document.getElementById('cfg-basedn').value    = cfg.ldap?.baseDn || '';
  document.getElementById('cfg-binddn').value    = cfg.ldap?.bindDn || '';
  document.getElementById('cfg-bindpass').value  = cfg.ldap?.bindPassPath || '';
  document.getElementById('cfg-searchbase').value= cfg.ldap?.searchBase || '';
  document.getElementById('ldap-fields').classList.toggle('hidden', cfg.backend !== 'ldap');
  document.getElementById('settings-modal').classList.remove('hidden');
}

async function saveSettings() {
  const backend = document.getElementById('cfg-backend').value;
  const cfg = { backend };
  if (backend === 'ldap') {
    cfg.ldap = {
      url:          document.getElementById('cfg-url').value.trim(),
      baseDn:       document.getElementById('cfg-basedn').value.trim(),
      bindDn:       document.getElementById('cfg-binddn').value.trim(),
      bindPassPath: document.getElementById('cfg-bindpass').value.trim(),
      searchBase:   document.getElementById('cfg-searchbase').value.trim(),
    };
  }
  await window.api.saveConfig(cfg);
  document.getElementById('settings-modal').classList.add('hidden');
}


// ── AI Add Person panel ───────────────────────────────────────────────────────
function initAIPanel() {
  const toggle   = document.getElementById('ai-panel-toggle');
  const body     = document.getElementById('ai-panel-body');
  const select   = document.getElementById('ai-agent-select');
  const textarea = document.getElementById('ai-prompt');
  const btn      = document.getElementById('ai-generate-btn');
  const status   = document.getElementById('ai-status');

  // Wire @-mention file typeahead for robos-ai-textarea
  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('robos-ai-textarea').then(() => {
      if (textarea && textarea.addEventListener) {
        textarea.addEventListener('robos-path-query', async (e) => {
          try {
            const r = await window.api.searchIndex(e.detail.query);
            if (r && r.ok && textarea._showMentions) textarea._showMentions(r.items);
          } catch (_) {}
        });
      }
    }).catch(() => {});
  }

  function showStatus(msg, type = '') {
    status.textContent = msg;
    status.className = type;
    status.classList.remove('hidden');
    if (type === 'success') setTimeout(() => status.classList.add('hidden'), 4000);
  }

  // Populate agent dropdown
  window.api.listAIProviders().then(({ activeName, providers }) => {
    select.options[0].textContent = `Default (${activeName})`;
    providers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  }).catch((e) => { console.error('[ai-panel] listAIProviders failed:', e?.message || e); });

  toggle.addEventListener('click', () => {
    body.classList.toggle('hidden');
    toggle.textContent = body.classList.contains('hidden') ? '✨ Add with AI' : '✨ Add with AI ▲';
  });

  btn.addEventListener('click', async () => {
    const prompt = textarea.value.trim();
    if (!prompt) { showStatus('Describe the person first.', 'error'); return; }
    btn.disabled = true;
    btn.textContent = '⏳ Generating…';
    showStatus('', '');
    try {
      const providerId = select.value || null;
      const result = await window.api.aiAddPerson(prompt, providerId);
      if (!result.ok) { showStatus(result.error || 'AI generation failed.', 'error'); return; }
      const people = result.people || [result.person];
      await reload();
      // Select the first person added
      activeUid = people[0].uid;
      selectPerson(people[0].uid);
      const names = people.map(p => p.displayName).join(', ');
      showStatus(`✅ Added ${people.length} ${people.length === 1 ? 'person' : 'people'}: ${names}`, 'success');
      textarea.value = '';
    } catch (e) {
      showStatus(e.message || String(e), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate & Add';
    }
  });
}

// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'people-directory');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────

// ── Resizable sidebar splitter ────────────────────────────────────────────────
(function() {
  const handle  = document.getElementById('resize-handle');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;
  let dragging = false, startX = 0, startW = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.min(520, Math.max(180, startW + (e.clientX - startX)));
    sidebar.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();
