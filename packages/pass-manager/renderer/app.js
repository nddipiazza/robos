'use strict';

let allEntries = [];   // flat list of {type, name, path}
let selectedPath = null;
let isEditing = false;
let lockPollInterval = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btn-refresh').addEventListener('click', loadEntries);
  document.getElementById('btn-add').addEventListener('click', openAddForm);
  document.getElementById('search').addEventListener('input', onSearch);
  document.getElementById('btn-lock').addEventListener('click', doLock);
  document.getElementById('lock-badge').addEventListener('click', async () => {
    const { locked } = await window.api.getLockStatus();
    if (locked) window.api.openUnlockDialog();
  });
  document.getElementById('btn-copy-pw').addEventListener('click', copyPassword);
  document.getElementById('btn-toggle-pw').addEventListener('click', togglePasswordVisibility);
  document.getElementById('btn-edit').addEventListener('click', openEditForm);
  document.getElementById('btn-delete').addEventListener('click', deleteEntry);
  document.getElementById('btn-form-save').addEventListener('click', saveForm);
  document.getElementById('btn-form-cancel').addEventListener('click', cancelForm);
  document.getElementById('btn-setup-init').addEventListener('click', doInitStore);

  document.querySelectorAll('input[name="form-type"]').forEach(r =>
    r.addEventListener('change', onFormTypeChange));

  initResizer();
  await loadEntries();
  startLockPoll();
});

// ── Resizable sidebar ────────────────────────────────────────────────────────
function initResizer() {
  const resizer = document.getElementById('panel-resizer');
  const panel   = document.querySelector('#sidebar');
  if (!resizer || !panel) return;
  let startX, startW;
  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      const w = Math.max(160, Math.min(420, startW + ev.clientX - startX));
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

// ── Lock status ───────────────────────────────────────────────────────────────
function startLockPoll() {
  updateLockBadge();
  lockPollInterval = setInterval(updateLockBadge, 10000);
}

function stopLockPoll() {
  if (lockPollInterval) { clearInterval(lockPollInterval); lockPollInterval = null; }
}

async function updateLockBadge() {
  const { locked } = await window.api.getLockStatus();
  const badge = document.getElementById('lock-badge');
  const lockBtn = document.getElementById('btn-lock');
  if (locked) {
    badge.className = 'lock-badge locked clickable';
    badge.textContent = '🔒 Locked — click to unlock';
    lockBtn.classList.add('hidden');
  } else {
    badge.className = 'lock-badge unlocked';
    badge.textContent = '🔓 Unlocked';
    lockBtn.classList.remove('hidden');
  }
}

async function doLock() {
  const btn = document.getElementById('btn-lock');
  btn.textContent = 'Locking…'; btn.disabled = true;
  const res = await window.api.lockStore();
  btn.disabled = false; btn.textContent = '🔒 Lock';
  if (res.ok) {
    await updateLockBadge();
  } else {
    alert('Lock failed: ' + res.error);
  }
}

// ── Load & render tree ────────────────────────────────────────────────────────
async function loadEntries() {
  const res = await window.api.listEntries();
  if (res.notInitialized) {
    document.getElementById('lock-badge').classList.add('hidden');
    document.getElementById('btn-lock').classList.add('hidden');
    stopLockPoll();
    showPanel('setup');
    return;
  }
  if (!res.ok) {
    document.getElementById('tree-container').innerHTML =
      `<div style="padding:12px;color:#f85149;font-size:12px">${res.error}</div>`;
    return;
  }
  allEntries = flattenTree(res.tree);
  renderTree(res.tree);
  showPanel(allEntries.length > 0 ? 'entry' : 'empty');
  document.getElementById('lock-badge').classList.remove('hidden');
  document.getElementById('btn-lock').classList.remove('hidden');
  updateLockBadge();
}

function flattenTree(nodes, result = []) {
  for (const n of nodes) {
    if (n.type === 'entry') result.push(n);
    if (n.children) flattenTree(n.children, result);
  }
  return result;
}

function renderTree(nodes, container = null) {
  const root = container || document.getElementById('tree-container');
  root.innerHTML = '';
  for (const node of nodes) {
    if (node.type === 'dir') {
      const div = document.createElement('div');
      div.className = 'tree-dir';
      const label = document.createElement('div');
      label.className = 'tree-dir-label open';
      label.innerHTML = `<span class="dir-arrow">▶</span><span>📁 ${esc(node.name)}</span>`;
      label.addEventListener('click', () => {
        label.classList.toggle('open');
        childWrap.classList.toggle('hidden');
      });
      const childWrap = document.createElement('div');
      childWrap.className = 'tree-dir-children';
      renderTree(node.children, childWrap);
      div.appendChild(label);
      div.appendChild(childWrap);
      root.appendChild(div);
    } else {
      const item = document.createElement('div');
      item.className = 'tree-entry' + (node.path === selectedPath ? ' active' : '');
      item.dataset.path = node.path;
      item.innerHTML = `🔑 ${esc(node.name)}`;
      item.addEventListener('click', () => selectEntry(node.path));
      root.appendChild(item);
    }
  }
}

function onSearch(e) {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { loadEntries(); return; }
  const filtered = allEntries.filter(en => en.path.toLowerCase().includes(q));
  const root = document.getElementById('tree-container');
  root.innerHTML = '';
  for (const en of filtered) {
    const item = document.createElement('div');
    item.className = 'tree-entry' + (en.path === selectedPath ? ' active' : '');
    item.dataset.path = en.path;
    item.innerHTML = `🔑 ${esc(en.path)}`;
    item.addEventListener('click', () => selectEntry(en.path));
    root.appendChild(item);
  }
}

// ── Select / view entry ───────────────────────────────────────────────────────
async function selectEntry(entryPath) {
  selectedPath = entryPath;
  // Update active highlight
  document.querySelectorAll('.tree-entry').forEach(el =>
    el.classList.toggle('active', el.dataset.path === entryPath));

  showPanel('entry');
  document.getElementById('entry-path').textContent = entryPath;
  document.getElementById('pw-display').value = '';
  document.getElementById('pw-display').type = 'password';
  document.getElementById('meta-display').textContent = '';

  const res = await window.api.getEntry(entryPath);
  if (res.ok) {
    document.getElementById('pw-display').value = res.password;
    document.getElementById('meta-display').textContent = res.meta;
  } else {
    document.getElementById('meta-display').textContent = 'Error: ' + res.error;
  }
  // After successful decryption, refresh lock badge (cache is now active)
  setTimeout(updateLockBadge, 500);
}

async function copyPassword() {
  if (!selectedPath) return;
  const res = await window.api.copyEntry(selectedPath);
  const btn = document.getElementById('btn-copy-pw');
  if (res.ok) {
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy Password'; }, 2000);
  } else {
    btn.textContent = 'Error';
    setTimeout(() => { btn.textContent = '📋 Copy Password'; }, 2000);
  }
}

function togglePasswordVisibility() {
  const input = document.getElementById('pw-display');
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function deleteEntry() {
  if (!selectedPath) return;
  if (!confirm(`Delete "${selectedPath}"?\nThis cannot be undone.`)) return;
  const res = await window.api.deleteEntry(selectedPath);
  if (res.ok) {
    selectedPath = null;
    showPanel('empty');
    await loadEntries();
  } else {
    alert('Error: ' + res.error);
  }
}

// ── Add / Edit form ───────────────────────────────────────────────────────────
function openAddForm() {
  isEditing = false;
  document.getElementById('form-title').textContent = 'New Entry';
  document.getElementById('form-path').value = '';
  document.getElementById('form-path').readOnly = false;
  document.getElementById('form-pw').value = '';
  document.getElementById('form-pw2').value = '';
  document.getElementById('form-multi').value = '';
  document.getElementById('form-gen-len').value = '32';
  document.querySelector('input[name="form-type"][value="simple"]').checked = true;
  onFormTypeChange();
  document.getElementById('form-error').classList.add('hidden');
  showPanel('form');
}

function openEditForm() {
  if (!selectedPath) return;
  isEditing = true;
  document.getElementById('form-title').textContent = 'Edit Entry';
  document.getElementById('form-path').value = selectedPath;
  document.getElementById('form-path').readOnly = true;
  const pw = document.getElementById('pw-display').value;
  const meta = document.getElementById('meta-display').textContent;
  if (meta.trim()) {
    document.querySelector('input[name="form-type"][value="multiline"]').checked = true;
    document.getElementById('form-multi').value = pw + (meta ? '\n' + meta : '');
  } else {
    document.querySelector('input[name="form-type"][value="simple"]').checked = true;
    document.getElementById('form-pw').value = pw;
    document.getElementById('form-pw2').value = pw;
  }
  onFormTypeChange();
  document.getElementById('form-error').classList.add('hidden');
  showPanel('form');
}

function onFormTypeChange() {
  const val = document.querySelector('input[name="form-type"]:checked')?.value;
  document.getElementById('form-simple-wrap').classList.toggle('hidden', val !== 'simple');
  document.getElementById('form-multi-wrap').classList.toggle('hidden', val !== 'multiline');
  document.getElementById('form-gen-wrap').classList.toggle('hidden', val !== 'generate');
}

async function saveForm() {
  const entryPath = document.getElementById('form-path').value.trim();
  const type = document.querySelector('input[name="form-type"]:checked')?.value;
  const errEl = document.getElementById('form-error');

  if (!entryPath) { showFormErr(errEl, 'Entry path is required.'); return; }

  const btn = document.getElementById('btn-form-save');
  btn.disabled = true; btn.textContent = 'Saving…';

  let res;
  if (type === 'simple') {
    const pw = document.getElementById('form-pw').value;
    const pw2 = document.getElementById('form-pw2').value;
    if (!pw) { showFormErr(errEl, 'Password is required.'); btn.disabled = false; btn.textContent = 'Save'; return; }
    if (pw !== pw2) { showFormErr(errEl, 'Passwords do not match.'); btn.disabled = false; btn.textContent = 'Save'; return; }
    res = await window.api.addEntry({ entryPath, value: pw });
  } else if (type === 'multiline') {
    const val = document.getElementById('form-multi').value;
    if (!val.trim()) { showFormErr(errEl, 'Content is required.'); btn.disabled = false; btn.textContent = 'Save'; return; }
    res = await window.api.addMultiline({ entryPath, value: val });
  } else {
    const len = parseInt(document.getElementById('form-gen-len').value) || 32;
    res = await window.api.generateEntry({ entryPath, length: len });
  }

  btn.disabled = false; btn.textContent = 'Save';

  if (res.ok) {
    await loadEntries();
    await selectEntry(entryPath);
    showPanel('entry');
  } else {
    showFormErr(errEl, res.error || 'Save failed.');
  }
}

function cancelForm() {
  if (selectedPath) showPanel('entry');
  else showPanel('empty');
}

function showFormErr(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Panel switching ───────────────────────────────────────────────────────────
function showPanel(name) {
  document.getElementById('panel-empty').classList.toggle('hidden', name !== 'empty');
  document.getElementById('panel-entry').classList.toggle('hidden', name !== 'entry');
  document.getElementById('panel-form').classList.toggle('hidden', name !== 'form');
  document.getElementById('panel-setup').classList.toggle('hidden', name !== 'setup');
}

// ── Setup / init store ────────────────────────────────────────────────────────
async function doInitStore() {
  const name = document.getElementById('setup-name').value.trim();
  const email = document.getElementById('setup-email').value.trim();
  const pw = document.getElementById('setup-pw').value;
  const pw2 = document.getElementById('setup-pw2').value;
  const errEl = document.getElementById('setup-error');
  const progress = document.getElementById('setup-progress');

  errEl.classList.add('hidden');
  if (!name) { showSetupErr(errEl, 'Name is required.'); return; }
  if (!email) { showSetupErr(errEl, 'Email is required.'); return; }
  if (pw !== pw2) { showSetupErr(errEl, 'Passphrases do not match.'); return; }

  const btn = document.getElementById('btn-setup-init');
  btn.disabled = true; btn.textContent = '⏳ Working…';
  progress.classList.remove('hidden');

  const res = await window.api.initStore({ name, email, passphrase: pw });

  btn.disabled = false; btn.textContent = '🔑 Initialize Password Store';
  progress.classList.add('hidden');

  if (res.ok) {
    document.getElementById('lock-badge').classList.remove('hidden');
    await loadEntries();
    startLockPoll();
  } else {
    showSetupErr(errEl, res.error || 'Initialization failed.');
  }
}

function showSetupErr(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'pass-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
