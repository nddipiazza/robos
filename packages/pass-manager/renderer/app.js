'use strict';

let allEntries = [];
let selectedPath = null;
let currentEntry = null;
let vaultStatus = null;

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

window.addEventListener('DOMContentLoaded', async () => {
  $('btn-refresh').addEventListener('click', loadEntries);
  $('btn-add').addEventListener('click', openAddForm);
  $('btn-db-info').addEventListener('click', openDbInfoPanel);
  $('search').addEventListener('input', onSearch);
  $('btn-lock').addEventListener('click', doLock);

  // Open / Create .kdbx archive buttons
  $('btn-open-kdbx').addEventListener('click', async () => {
    const res = await window.api.chooseKdbxFile({ mode: 'open' });
    if (res && res.ok) {
      selectedPath = null;
      await loadEntries();
    }
  });

  $('btn-new-kdbx').addEventListener('click', async () => {
    const res = await window.api.chooseKdbxFile({ mode: 'create' });
    if (res && res.ok) {
      $('setup-dbpath').value = res.dbPath;
      showPanel('setup');
    } else {
      showPanel('setup');
    }
  });

  // Entry actions
  $('btn-copy-user').addEventListener('click', copyUsername);
  $('btn-copy-pw').addEventListener('click', copyPassword);
  $('btn-toggle-pw').addEventListener('click', () => {
    const input = $('pw-display');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  $('btn-edit').addEventListener('click', openEditForm);
  $('btn-delete').addEventListener('click', deleteEntry);

  // Add/Edit form actions
  $('btn-gen-inline').addEventListener('click', generateInlinePassword);
  $('btn-toggle-form-pw').addEventListener('click', () => {
    const inp = $('form-pw');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  $('btn-form-save').addEventListener('click', saveForm);
  $('btn-form-cancel').addEventListener('click', cancelForm);

  // Setup .kdbx form
  $('setup-enroll-hw').addEventListener('change', updateSetupHwFields);
  document.querySelectorAll('input[name="setup-hw-mode"]').forEach((r) => {
    r.addEventListener('change', updateSetupHwFields);
  });
  $('btn-setup-init').addEventListener('click', doInitStore);

  // Unlock .kdbx actions (Physical Key & Password)
  $('btn-unlock-hw').addEventListener('click', doUnlockHardwareKey);
  $('unlock-touch-disc').addEventListener('click', doUnlockHardwareKey);
  $('btn-unlock-pw').addEventListener('click', doUnlockPassword);
  $('unlock-pw').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doUnlockPassword();
  });

  // Bind Physical Key to existing .kdbx
  $('btn-bind-hw-now').addEventListener('click', doBindHardwareKeyNow);

  window.api.onTouchStatus((st) => {
    const banner = $('touch-banner');
    const txt = $('touch-banner-text');
    const disc = $('unlock-touch-disc');
    if (st.state === 'waiting-touch') {
      banner.classList.remove('hidden');
      txt.textContent = st.message || 'Touch the flashing gold contact on your YubiKey now...';
      if (disc) disc.classList.add('waiting');
    } else {
      if (disc) disc.classList.remove('waiting');
      setTimeout(() => banner.classList.add('hidden'), 1000);
    }
  });

  initResizer();
  await loadEntries();
});

function updateSetupHwFields() {
  const enroll = $('setup-enroll-hw').checked;
  $('setup-hw-modes').classList.toggle('hidden', !enroll);
  const mode = document.querySelector('input[name="setup-hw-mode"]:checked')?.value || 'either';
  const pwWrap = $('setup-pw-fields');
  pwWrap.classList.toggle('hidden', enroll && mode === 'hw-only');
}

function initResizer() {
  const resizer = $('panel-resizer');
  const panel = $('sidebar');
  if (!resizer || !panel) return;
  let startX, startW;
  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    const onMove = (ev) => {
      const w = Math.max(170, Math.min(420, startW + ev.clientX - startX));
      panel.style.width = w + 'px';
    };
    const onUp = () => {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function updateHeaderStatus(st) {
  if (!st) return;
  vaultStatus = st;
  $('active-kdbx-pill').textContent = st.dbFileName || 'robos-passwords.kdbx';
  $('active-kdbx-pill').title = st.dbPath || '';
  $('setup-dbpath').value = st.dbPath || '';
  $('unlock-db-path').textContent = st.dbPath || '';

  const lockBtn = $('btn-lock');
  if (!st.initialized || st.locked) {
    lockBtn.classList.add('hidden');
  } else {
    lockBtn.classList.remove('hidden');
  }
}

async function loadEntries() {
  const st = await window.api.getVaultStatus();
  updateHeaderStatus(st);

  if (!st.initialized) {
    $('tree-container').innerHTML = '<div style="padding:10px;color:#8b949e;font-size:12px;">Create or open a .kdbx archive to begin.</div>';
    showPanel('setup');
    return;
  }

  if (st.locked) {
    $('tree-container').innerHTML = '<div style="padding:10px;color:#8b949e;font-size:12px;">🔒 Keystore locked. Touch your YubiKey or enter Master Password to unlock.</div>';
    renderUnlockPanel(st);
    showPanel('unlock');
    return;
  }

  const res = await window.api.listEntries();
  if (!res.ok) {
    $('tree-container').innerHTML = `<div style="padding:12px;color:#f85149;font-size:12px">${esc(res.error)}</div>`;
    return;
  }

  allEntries = flattenTree(res.tree);
  renderTree(res.tree);
  if (selectedPath) {
    await selectEntry(selectedPath);
  } else {
    showPanel('empty');
  }
}

function renderUnlockPanel(st) {
  $('unlock-error').classList.add('hidden');
  const hwTitle = $('unlock-hw-title');
  const hwDesc = $('unlock-hw-desc');
  const hwBtn = $('btn-unlock-hw');

  if (st.fido2Enrolled) {
    const b = st.fido2Binding || {};
    hwTitle.innerHTML = `Physical Key Bound: <strong>${esc(b.deviceName || 'YubiKey FIDO2')}</strong>`;
    hwDesc.textContent = b.requireBoth2FA
      ? '2FA Mode: Enter your Master Password below, then click to touch your YubiKey.'
      : '1-Touch Unlock: Click the button below and touch the flashing gold disc on your YubiKey.';
    hwBtn.disabled = false;
  } else {
    hwTitle.textContent = st.hardwareKeyConnected
      ? `${st.hardwareKeyName} Connected (Not Yet Bound to This .kdbx)`
      : 'No Physical Security Key Bound Yet';
    hwDesc.textContent = 'Unlock with your Master Password below, then click the ⚙ icon to bind your YubiKey for 1-touch unlock.';
    hwBtn.disabled = false;
  }
}

async function doUnlockHardwareKey() {
  const errEl = $('unlock-error');
  errEl.classList.add('hidden');
  const masterPassword = $('unlock-pw').value;
  const pin = $('unlock-pin').value;

  const btn = $('btn-unlock-hw');
  btn.disabled = true;
  btn.textContent = '👆 Touch Your YubiKey Now…';

  const res = await window.api.unlockWithHardwareKey({ masterPassword, pin });
  $('touch-banner').classList.add('hidden');
  btn.disabled = false;
  btn.textContent = '👆 Touch YubiKey to Unlock Keystore';

  if (res.ok) {
    $('unlock-pw').value = '';
    await loadEntries();
  } else {
    errEl.textContent = res.error || 'Hardware key unlock failed.';
    errEl.classList.remove('hidden');
  }
}

async function doUnlockPassword() {
  const errEl = $('unlock-error');
  errEl.classList.add('hidden');
  const masterPassword = $('unlock-pw').value;
  if (!masterPassword) {
    errEl.textContent = 'Enter your Master Password, or click "Touch YubiKey to Unlock Keystore".';
    errEl.classList.remove('hidden');
    return;
  }
  const btn = $('btn-unlock-pw');
  btn.disabled = true;
  btn.textContent = 'Unlocking…';
  const res = await window.api.unlockWithPassword({ masterPassword });
  btn.disabled = false;
  btn.textContent = '🔓 Unlock with Password';

  if (res.ok) {
    $('unlock-pw').value = '';
    await loadEntries();
  } else {
    errEl.textContent = res.error || 'Failed to unlock keystore.';
    errEl.classList.remove('hidden');
  }
}

async function doLock() {
  await window.api.lockStore();
  selectedPath = null;
  currentEntry = null;
  $('pw-display').value = '';
  $('pw-display').type = 'password';
  $('meta-display').textContent = '';
  await loadEntries();
}

function flattenTree(nodes, result = []) {
  for (const n of nodes) {
    if (n.type === 'entry') result.push(n);
    if (n.children) flattenTree(n.children, result);
  }
  return result;
}

function renderTree(nodes, container = null) {
  const root = container || $('tree-container');
  root.innerHTML = '';
  if (!container && (!nodes || nodes.length === 0)) {
    root.innerHTML = '<div style="padding:10px;color:#8b949e;font-size:12px;">No entries yet. Click + to add one.</div>';
    return;
  }
  for (const node of nodes) {
    if (node.type === 'dir') {
      const div = document.createElement('div');
      div.className = 'tree-dir';
      const label = document.createElement('div');
      label.className = 'tree-dir-label open';
      label.innerHTML = `<span class="dir-arrow">▶</span><span>📁 ${esc(node.name)}</span>`;
      const childWrap = document.createElement('div');
      childWrap.className = 'tree-dir-children';
      label.addEventListener('click', () => {
        label.classList.toggle('open');
        childWrap.classList.toggle('hidden');
      });
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
  if (!q) {
    loadEntries();
    return;
  }
  const filtered = allEntries.filter(en => en.path.toLowerCase().includes(q));
  const root = $('tree-container');
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

async function selectEntry(entryPath) {
  selectedPath = entryPath;
  document.querySelectorAll('.tree-entry').forEach(el =>
    el.classList.toggle('active', el.dataset.path === entryPath)
  );

  showPanel('entry');
  $('entry-path').textContent = entryPath;
  $('entry-uuid').textContent = '';
  $('user-display').value = '';
  $('url-display').value = '';
  $('pw-display').value = '';
  $('pw-display').type = 'password';
  $('meta-display').textContent = '';

  const res = await window.api.getEntry(entryPath);
  if (res.ok) {
    currentEntry = res;
    $('entry-uuid').textContent = res.uuid ? `UUID: ${res.uuid}` : '';
    $('user-display').value = res.username || '';
    $('url-display').value = res.url || '';
    $('pw-display').value = res.password || '';
    $('meta-display').textContent = res.notes || '';
  } else {
    $('meta-display').textContent = 'Error: ' + res.error;
  }
}

async function copyUsername() {
  if (!currentEntry || !currentEntry.username) return;
  await window.api.copyText(currentEntry.username);
  const btn = $('btn-copy-user');
  btn.textContent = '✓ Copied!';
  setTimeout(() => { btn.textContent = '👤 Copy User'; }, 1600);
}

async function copyPassword() {
  if (!selectedPath) return;
  const res = await window.api.copyEntry(selectedPath);
  const btn = $('btn-copy-pw');
  if (res.ok) {
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy Password'; }, 1600);
  }
}

async function deleteEntry() {
  if (!selectedPath) return;
  if (!confirm(`Delete "${selectedPath}" from the .kdbx archive?`)) return;
  const res = await window.api.deleteEntry(selectedPath);
  if (res.ok) {
    selectedPath = null;
    currentEntry = null;
    await loadEntries();
  }
}

function openAddForm() {
  $('form-title').textContent = 'New KeePassXC Entry';
  $('form-path').value = '';
  $('form-path').readOnly = false;
  $('form-username').value = '';
  $('form-url').value = '';
  $('form-pw').value = '';
  $('form-pw2').value = '';
  $('form-notes').value = '';
  $('form-entropy').textContent = '';
  $('form-error').classList.add('hidden');
  showPanel('form');
}

function openEditForm() {
  if (!selectedPath || !currentEntry) return;
  $('form-title').textContent = `Edit Entry: ${selectedPath}`;
  $('form-path').value = selectedPath;
  $('form-path').readOnly = true;
  $('form-username').value = currentEntry.username || '';
  $('form-url').value = currentEntry.url || '';
  $('form-pw').value = currentEntry.password || '';
  $('form-pw2').value = currentEntry.password || '';
  $('form-notes').value = currentEntry.notes || '';
  $('form-entropy').textContent = '';
  $('form-error').classList.add('hidden');
  showPanel('form');
}

async function generateInlinePassword() {
  const len = parseInt($('form-gen-len').value, 10) || 32;
  const res = await window.api.generatePassword({ length: len });
  if (res.ok) {
    $('form-pw').value = res.password;
    $('form-pw2').value = res.password;
    $('form-entropy').textContent = res.estimate || `Generated ${len}-character high-entropy secret`;
  }
}

async function saveForm() {
  const entryPath = $('form-path').value.trim();
  const username = $('form-username').value.trim();
  const url = $('form-url').value.trim();
  const password = $('form-pw').value;
  const password2 = $('form-pw2').value;
  const notes = $('form-notes').value;
  const errEl = $('form-error');

  errEl.classList.add('hidden');
  if (!entryPath) {
    errEl.textContent = 'Group/Entry path is required (e.g. work/github).';
    errEl.classList.remove('hidden');
    return;
  }
  if (!password) {
    errEl.textContent = 'Password is required (click "Generate Password" to create one).';
    errEl.classList.remove('hidden');
    return;
  }
  if (password !== password2) {
    errEl.textContent = 'Passwords do not match.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = $('btn-form-save');
  btn.disabled = true;
  btn.textContent = 'Saving to .kdbx…';

  const res = await window.api.saveEntry({
    entryPath,
    username,
    password,
    url,
    notes,
  });

  btn.disabled = false;
  btn.textContent = '💾 Save to .kdbx';

  if (res.ok) {
    selectedPath = res.entryPath;
    await loadEntries();
  } else {
    errEl.textContent = res.error || 'Failed to save entry.';
    errEl.classList.remove('hidden');
  }
}

function cancelForm() {
  if (selectedPath) showPanel('entry');
  else showPanel('empty');
}

async function doInitStore() {
  const dbPath = $('setup-dbpath').value.trim();
  const enrollHw = $('setup-enroll-hw').checked;
  const hwMode = document.querySelector('input[name="setup-hw-mode"]:checked')?.value || 'either';
  const hardwareOnly = enrollHw && hwMode === 'hw-only';
  const requireBoth2FA = enrollHw && hwMode === '2fa';
  const pw = $('setup-pw').value;
  const pw2 = $('setup-pw2').value;
  const errEl = $('setup-error');
  const progress = $('setup-progress');

  errEl.classList.add('hidden');
  if (!hardwareOnly) {
    if (!pw) {
      errEl.textContent = 'Master Password is required (or select "Physical YubiKey Touch ONLY").';
      errEl.classList.remove('hidden');
      return;
    }
    if (pw !== pw2) {
      errEl.textContent = 'Master Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }
  }

  const btn = $('btn-setup-init');
  btn.disabled = true;
  progress.classList.remove('hidden');
  progress.textContent = enrollHw
    ? '👆 Touch your flashing YubiKey (2 touches) to enroll FIDO2 hmac-secret and create the .kdbx archive…'
    : '⏳ Creating KeePassXC .kdbx archive…';

  const res = await window.api.initStore({
    dbPath,
    masterPassword: pw,
    enrollHardwareKey: enrollHw,
    hardwareOnly,
    requireBoth2FA,
  });

  btn.disabled = false;
  progress.classList.add('hidden');
  $('touch-banner').classList.add('hidden');

  if (res.ok) {
    await loadEntries();
  } else {
    errEl.textContent = res.error || 'Failed to initialize .kdbx keystore.';
    errEl.classList.remove('hidden');
  }
}

async function openDbInfoPanel() {
  const st = await window.api.getVaultStatus();
  updateHeaderStatus(st);
  if (!st.initialized) {
    showPanel('setup');
    return;
  }
  if (st.locked) {
    showPanel('unlock');
    return;
  }
  showPanel('dbinfo');
  const pre = $('dbinfo-pre');
  pre.textContent = 'Loading keepassxc-cli db-info…';
  const infoRes = await window.api.getDbInfo();
  const fidoDesc = st.fido2Enrolled
    ? `\nPhysical Key Binding: ENROLLED (${st.fido2Binding.deviceName}, RP=${st.fido2Binding.rpId}, 2FA=${st.fido2Binding.requireBoth2FA})`
    : '\nPhysical Key Binding: Not yet bound to a YubiKey';
  pre.textContent = (infoRes.ok ? infoRes.raw : infoRes.error) + fidoDesc;
}

async function doBindHardwareKeyNow() {
  const statusEl = $('bind-status');
  statusEl.classList.remove('hidden');
  statusEl.textContent = '👆 Touch your flashing YubiKey (Step 1/2, then Step 2/2) to bind this .kdbx keystore…';
  const requireBoth2FA = $('bind-2fa').checked;
  const res = await window.api.enrollHardwareKey({ requireBoth2FA });
  $('touch-banner').classList.add('hidden');
  if (res.ok) {
    statusEl.textContent = '✓ Physical YubiKey bound! You can now unlock this .kdbx archive with a single touch.';
    await openDbInfoPanel();
  } else {
    statusEl.textContent = '✗ ' + (res.error || 'Binding failed');
  }
}

function showPanel(name) {
  ['empty', 'unlock', 'setup', 'entry', 'form', 'dbinfo'].forEach((p) => {
    const el = $(`panel-${p}`);
    if (el) el.classList.toggle('hidden', p !== name);
  });
}

(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'pass-manager');
  if (_entry) {
    const _el = $('app-logo-icon');
    if (_el) {
      _el.innerHTML = _entry.iconSvg
        .replace(/width="48"/, 'width="26"')
        .replace(/height="48"/, 'height="26"');
    }
  }
})();
