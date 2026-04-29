'use strict';

let currentStep = 1;
let selectedGpgId = null;

function showErr(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function setStatus(id, cls, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'status-block ' + cls;
  el.textContent = msg;
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  if (!window.api) {
    document.body.innerHTML = '<div style="padding:40px;color:#f44336;font-family:monospace">ERROR: window.api not available — preload failed</div>';
    return;
  }

  document.getElementById('btn-reset').addEventListener('click', confirmReset);
  document.getElementById('btn-configure-pinentry').addEventListener('click', doPinentry);
  document.getElementById('btn-create-key').addEventListener('click', doCreateKey);
  document.getElementById('btn-use-existing-key').addEventListener('click', doUseExistingKey);
  document.getElementById('btn-init-pass').addEventListener('click', doInitPass);
  document.getElementById('btn-generate-ssh').addEventListener('click', doGenerateSsh);
  document.getElementById('btn-skip-ssh').addEventListener('click', () => goStep(5));
  document.getElementById('btn-done').addEventListener('click', () => window.close());

  // Smart startup: jump to the right step
  try {
    const status = await window.api.getSecurityStatus();
    if (status.passReady && status.sshKeyFound) {
      goStep(5);
      await showDoneSummary(status);
    } else if (status.passReady) {
      goStep(4);
      await refreshSshStep();
    } else if (status.gpgKeys.length > 0 && status.pinentryConfigured) {
      await refreshStep1();
      await refreshStep2();
      goStep(3);
      const keys = await window.api.listGpgKeys();
      selectedGpgId = keys[0]?.id || '';
      document.getElementById('pass-key-info').textContent = selectedGpgId;
    } else if (status.pinentryConfigured) {
      await refreshStep1();
      goStep(2);
      await refreshStep2();
    } else {
      await refreshStep1();
    }
  } catch(e) {
    setStatus('pinentry-status','warn','Load error: '+e.message);
  }
});

// ── Navigation ──────────────────────────────────────────────────────────────────
function goStep(n) {
  currentStep = n;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.step-panel[data-step="${n}"]`).classList.add('active');
  document.querySelectorAll('.step-dot').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'done');
    if (s < n) dot.classList.add('done');
    else if (s === n) dot.classList.add('active');
  });
}

// ── Step 1: Pinentry ────────────────────────────────────────────────────────────
async function refreshStep1() {
  const status = await window.api.getSecurityStatus();
  const el = document.getElementById('pinentry-status');
  if (status.pinentryConfigured) {
    el.className = 'status-block ok';
    el.textContent = '✓ Secure passphrase dialog is configured.';
    document.getElementById('btn-configure-pinentry').textContent = 'Re-configure';
  } else {
    el.className = 'status-block warn';
    el.textContent = 'Not yet configured — GPG passphrase prompts may appear in the terminal instead of a dialog.';
  }
}

async function doPinentry() {
  const btn = document.getElementById('btn-configure-pinentry');
  btn.disabled = true; btn.textContent = 'Configuring…';
  const res = await window.api.configurePinentry();
  btn.disabled = false;
  if (res.ok) { await refreshStep1(); goStep(2); await refreshStep2(); }
  else { btn.textContent = 'Configure Secure Dialog'; setStatus('pinentry-status', 'warn', 'Error: ' + (res.error || 'unknown')); }
}

// ── Step 2: GPG Key ─────────────────────────────────────────────────────────────
async function refreshStep2() {
  const status = await window.api.getSecurityStatus();
  const statusEl = document.getElementById('gpg-key-status');
  if (status.gpgKeys.length) {
    statusEl.className = 'status-block ok';
    statusEl.textContent = `✓ ${status.gpgKeys.length} GPG key(s) found.`;
    const keys = await window.api.listGpgKeys();
    const sel = document.getElementById('select-existing-key');
    sel.innerHTML = keys.map(k => `<option value="${k.id}">${k.label} (…${k.id.slice(-8)})</option>`).join('');
    document.getElementById('existing-keys-wrap').classList.remove('hidden');
  } else {
    statusEl.className = 'status-block warn';
    statusEl.textContent = 'No GPG keys found — create one below.';
    document.getElementById('existing-keys-wrap').classList.add('hidden');
  }
}

function doUseExistingKey() {
  selectedGpgId = document.getElementById('select-existing-key').value;
  goStep(3);
  document.getElementById('pass-key-info').textContent = selectedGpgId;
}

async function doCreateKey() {
  const name  = document.getElementById('gpg-name').value.trim();
  const email = document.getElementById('gpg-email').value.trim();
  const pass  = document.getElementById('gpg-pass').value;
  const pass2 = document.getElementById('gpg-pass2').value;
  const errEl = document.getElementById('key-error');

  if (!name || !email || !pass) { showErr(errEl, 'All fields are required.'); return; }
  if (pass !== pass2) { showErr(errEl, 'Passphrases do not match.'); return; }
  if (pass.length < 8) { showErr(errEl, 'Passphrase must be at least 8 characters.'); return; }
  errEl.classList.add('hidden');

  document.getElementById('create-key-form').classList.add('hidden');
  document.getElementById('key-creating').classList.remove('hidden');

  const res = await window.api.createGpgKey({ name, email, passphrase: pass });

  document.getElementById('key-creating').classList.add('hidden');
  document.getElementById('create-key-form').classList.remove('hidden');

  if (res.ok) {
    const keys = await window.api.listGpgKeys();
    const newKey = keys.find(k => k.label.includes(email)) || keys[keys.length - 1];
    selectedGpgId = newKey?.id || email;
    goStep(3);
    document.getElementById('pass-key-info').textContent = `${newKey?.label || email} (…${selectedGpgId.slice(-16)})`;
  } else {
    showErr(errEl, res.error || 'Key generation failed.');
  }
}

// ── Step 3: Pass init ────────────────────────────────────────────────────────────
async function doInitPass() {
  const btn = document.getElementById('btn-init-pass');
  btn.disabled = true; btn.textContent = 'Initializing…';
  const status = document.getElementById('pass-status');

  const res = await window.api.initPass({ gpgId: selectedGpgId });
  btn.disabled = false; btn.textContent = 'Initialize Pass Store';

  if (res.ok) {
    status.className = 'status-block ok';
    status.textContent = '✓ Pass store initialized successfully.';
    goStep(4);
    await refreshSshStep();
  } else {
    status.className = 'status-block warn';
    status.textContent = 'Error: ' + (res.error || 'Failed to initialize pass store.');
  }
}

// ── Step 4: SSH Key ──────────────────────────────────────────────────────────────
async function refreshSshStep() {
  const status = await window.api.getSecurityStatus();
  const el = document.getElementById('ssh-status');
  if (status.sshKeyFound) {
    el.className = 'status-block ok';
    el.textContent = `✓ SSH key found: ~/.ssh/${status.sshKeyFound}`;
    document.getElementById('ssh-existing').classList.remove('hidden');
    document.getElementById('ssh-generate-form').classList.add('hidden');
    if (status.sshPubKey) {
      document.getElementById('ssh-pubkey-display').textContent = status.sshPubKey;
    }
  } else {
    el.className = 'status-block warn';
    el.textContent = 'No SSH key found — generate one below.';
    document.getElementById('ssh-existing').classList.add('hidden');
    document.getElementById('ssh-generate-form').classList.remove('hidden');
  }
}

async function doGenerateSsh() {
  const comment    = document.getElementById('ssh-comment').value.trim();
  const passphrase = document.getElementById('ssh-passphrase').value;
  const errEl      = document.getElementById('ssh-error');
  errEl.classList.add('hidden');

  document.getElementById('ssh-generate-form').classList.add('hidden');
  document.getElementById('ssh-generating').classList.remove('hidden');

  const res = await window.api.generateSshKey({ comment, passphrase });

  document.getElementById('ssh-generating').classList.add('hidden');

  if (res.ok) {
    await refreshSshStep();
  } else {
    document.getElementById('ssh-generate-form').classList.remove('hidden');
    showErr(errEl, res.error || 'SSH key generation failed.');
  }
}

// ── Step 5: Done ────────────────────────────────────────────────────────────────
async function showDoneSummary(status) {
  const keys = await window.api.listGpgKeys();
  const gpgId = keys[0]?.id || '';
  document.getElementById('done-details').innerHTML =
    `<b>GPG Key:</b> ${keys[0]?.label || ''} (…${gpgId.slice(-16)})<br>` +
    `<b>Pass Store:</b> ~/.password-store<br>` +
    `<b>SSH Key:</b> ~/.ssh/${status.sshKeyFound || 'none'}<br>` +
    `<b>Pinentry:</b> ${status.pinentryConfigured ? 'GUI dialog configured' : 'using default'}<br><br>` +
    `Use <b>Reset</b> (top-right) to start over with fresh keys.`;
}

// ── Reset ────────────────────────────────────────────────────────────────────────
async function confirmReset() {
  const confirmed = confirm(
    'This will permanently delete your GPG key and entire pass store.\n\n' +
    'All stored passwords will be lost.\n\nAre you sure you want to start over?'
  );
  if (!confirmed) return;

  const btn = document.getElementById('btn-reset');
  btn.textContent = '…'; btn.disabled = true;
  const res = await window.api.resetAll();
  btn.textContent = '↺ Reset'; btn.disabled = false;
  selectedGpgId = null;

  if (res.ok) {
    goStep(1);
    await refreshStep1();
    ['gpg-name','gpg-email','gpg-pass','gpg-pass2'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('key-error').classList.add('hidden');
    document.getElementById('existing-keys-wrap').classList.add('hidden');
  } else {
    alert('Reset failed: ' + res.error);
  }
}

// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'security-setup');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
