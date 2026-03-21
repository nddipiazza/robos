// ── state ──────────────────────────────────────────────────────────────────────
let countdownSec = 60;
let countdownTimer = null;
const main = document.querySelector('main');

// ── check-row helpers ──────────────────────────────────────────────────────────

const CHECK_IDS = { ghAuth: 'row-ghAuth', sshKey: 'row-sshKey', sshConn: 'row-sshConn', gitCfg: 'row-gitCfg' };

function renderChecks({ overallOk, checks }) {
  for (const [key, rowId] of Object.entries(CHECK_IDS)) {
    const c   = checks[key];
    const row = document.getElementById(rowId);
    if (!row) continue;
    const dot    = row.querySelector('.check-dot');
    const detail = row.querySelector('.check-detail');
    const fixBtn = row.querySelector('.btn-fix');
    dot.className = 'check-dot ' + (c.ok ? 'ok' : 'fail');
    detail.textContent = c.detail || '';
    if (fixBtn) fixBtn.style.display = c.ok ? 'none' : 'inline-block';
  }

  const badge = document.getElementById('overall-badge');
  if (overallOk) {
    badge.textContent = '✓ healthy';
    badge.className = 'badge badge-ok';
    document.getElementById('all-good-card').style.display = 'block';
  } else {
    const failCount = Object.values(checks).filter(c => !c.ok).length;
    badge.textContent = `${failCount} issue${failCount > 1 ? 's' : ''}`;
    badge.className = 'badge badge-fail';
    document.getElementById('all-good-card').style.display = 'none';
  }

  // Pre-fill git config panel with current values
  const cfg = checks.gitCfg;
  if (cfg) {
    if (cfg.name)  document.getElementById('cfg-name').value  = cfg.name;
    if (cfg.email) document.getElementById('cfg-email').value = cfg.email;
  }

  resetCountdown();
}

// ── countdown ──────────────────────────────────────────────────────────────────

function resetCountdown() {
  countdownSec = 60;
  clearInterval(countdownTimer);
  const el = document.getElementById('next-check');
  countdownTimer = setInterval(() => {
    countdownSec--;
    el.textContent = `Next check in ${countdownSec}s`;
    if (countdownSec <= 0) { clearInterval(countdownTimer); el.textContent = 'Checking\u2026'; }
  }, 1000);
  el.textContent = `Next check in ${countdownSec}s`;
}

// ── IPC listeners ──────────────────────────────────────────────────────────────

window.git.onCheckResults(renderChecks);

window.git.onLoginOutput(chunk => {
  const out = document.getElementById('gh-output');
  out.textContent += chunk;
  out.scrollTop = out.scrollHeight;
  const otp = chunk.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
  if (otp) {
    document.getElementById('otp-display').textContent = otp[1];
    document.getElementById('otp-block').style.display = 'block';
  }
  const url = chunk.match(/https:\/\/github\.com\/login\/device\S*/);
  if (url) window.git.openUrl(url[0]);
});

window.git.onLoginDone(({ ok }) => {
  document.getElementById('btn-gh-login').disabled = false;
  document.getElementById('btn-gh-login').textContent = '\uD83C\uDF10 Login with Browser';
  document.getElementById('btn-gh-cancel').style.display = 'none';
  if (ok) {
    document.getElementById('gh-login-panel').style.display = 'none';
    document.getElementById('otp-block').style.display = 'none';
    document.getElementById('gh-output').textContent = '';
    // If we came from scope refresh, re-show the add-key panel to retry
    const pubKey = document.getElementById('github-pubkey-display').value.trim();
    if (pubKey) showPanel('add-key-github-panel');
  }
});

// ── fix buttons ────────────────────────────────────────────────────────────────

document.querySelectorAll('.btn-fix').forEach(btn => {
  btn.addEventListener('click', () => {
    const fix = btn.dataset.fix;
    if (fix === 'gh-login') {
      showPanel('gh-login-panel');
    } else if (fix === 'generate-key') {
      showPanel('generate-key-panel');
    } else if (fix === 'add-key-github') {
      showAddKeyPanel();
    } else if (fix === 'git-config') {
      showPanel('git-config-panel');
    }
  });
});

function showPanel(id) {
  const panels = ['gh-login-panel', 'git-config-panel', 'generate-key-panel', 'add-key-github-panel'];
  panels.forEach(p => { const el = document.getElementById(p); if (el) el.style.display = (p === id) ? 'block' : 'none'; });
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

async function showAddKeyPanel() {
  const r = await window.git.getPubkey();
  if (r.error) {
    const status = document.getElementById('add-key-status');
    showStatus(status, 'No SSH key found — generate one first.', 'err');
    showPanel('generate-key-panel');
    return;
  }
  document.getElementById('github-pubkey-display').value = r.pubKey;
  const hostname = r.keyFile.replace('id_', '');
  document.getElementById('github-key-title').value = 'RobOS ' + hostname;
  showPanel('add-key-github-panel');
}

// ── gh login panel ─────────────────────────────────────────────────────────────

document.getElementById('btn-gh-login').addEventListener('click', async () => {
  const btn = document.getElementById('btn-gh-login');
  btn.disabled = true;
  btn.textContent = '\u23F3 Waiting for GitHub\u2026';
  document.getElementById('btn-gh-cancel').style.display = 'inline-block';
  document.getElementById('gh-output').textContent = '';
  document.getElementById('otp-block').style.display = 'none';
  await window.git.startGhLogin();
});

document.getElementById('btn-gh-cancel').addEventListener('click', async () => {
  await window.git.cancelLogin();
  document.getElementById('btn-gh-login').disabled = false;
  document.getElementById('btn-gh-login').textContent = '\uD83C\uDF10 Login with Browser';
  document.getElementById('btn-gh-cancel').style.display = 'none';
  document.getElementById('gh-output').textContent += '\nCancelled.\n';
});

document.getElementById('btn-copy-otp').addEventListener('click', () => {
  const code = document.getElementById('otp-display').textContent.trim();
  if (code) navigator.clipboard.writeText(code);
});

// ── git config panel ───────────────────────────────────────────────────────────

document.getElementById('btn-cfg-save').addEventListener('click', async () => {
  const name  = document.getElementById('cfg-name').value.trim();
  const email = document.getElementById('cfg-email').value.trim();
  const status = document.getElementById('cfg-status');
  if (!name || !email) { showStatus(status, 'Name and email are required.', 'err'); return; }
  const r = await window.git.setGitConfig({ name, email });
  if (r.ok) {
    showStatus(status, '\u2713 git identity saved', 'ok');
    setTimeout(async () => {
      document.getElementById('git-config-panel').style.display = 'none';
      await window.git.forceCheck();
    }, 1200);
  } else {
    showStatus(status, 'Error: ' + r.error, 'err');
  }
});

document.getElementById('btn-cfg-cancel').addEventListener('click', () => {
  document.getElementById('git-config-panel').style.display = 'none';
});

// ── generate key panel ────────────────────────────────────────────────────────

document.getElementById('btn-gen-key').addEventListener('click', async () => {
  const btn = document.getElementById('btn-gen-key');
  const status = document.getElementById('gen-status');
  const keyType    = document.getElementById('key-type').value;
  const comment    = document.getElementById('key-comment').value.trim();
  const passphrase = document.getElementById('key-passphrase').value;
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  showStatus(status, 'Running ssh-keygen…', '');
  const r = await window.git.generateSshKey({ keyType, comment, passphrase });
  btn.disabled = false;
  btn.textContent = '⚡ Generate';
  if (r.error) {
    showStatus(status, 'Error: ' + r.error, 'err');
    return;
  }
  showStatus(status, '✓ Key generated: ' + r.fingerprint, 'ok');
  document.getElementById('gen-pubkey').value = r.pubKey;
  document.getElementById('gen-result').style.display = 'block';
  document.getElementById('btn-add-github-after-gen').dataset.pubPath = r.pubPath;
  const updated = await window.git.forceCheck();
  renderChecks(updated);
});

document.getElementById('btn-gen-cancel').addEventListener('click', () => {
  showPanel('');
  document.getElementById('generate-key-panel').style.display = 'none';
});

document.getElementById('btn-copy-pubkey').addEventListener('click', () => {
  const key = document.getElementById('gen-pubkey').value.trim();
  if (key) navigator.clipboard.writeText(key);
});

document.getElementById('btn-add-github-after-gen').addEventListener('click', async () => {
  const pubKey  = document.getElementById('gen-pubkey').value.trim();
  const pubPath = document.getElementById('btn-add-github-after-gen').dataset.pubPath || '';
  document.getElementById('github-pubkey-display').value = pubKey;
  document.getElementById('github-key-title').value = 'RobOS key';
  showPanel('add-key-github-panel');
});

// ── add key to github panel ───────────────────────────────────────────────────

document.getElementById('btn-upload-key').addEventListener('click', async () => {
  const btn = document.getElementById('btn-upload-key');
  const status = document.getElementById('add-key-status');
  const title   = document.getElementById('github-key-title').value.trim();
  const pubKey  = document.getElementById('github-pubkey-display').value.trim();
  if (!pubKey) { showStatus(status, 'No public key to upload.', 'err'); return; }
  btn.disabled = true;
  btn.textContent = '⏳ Uploading…';
  const r = await window.git.getPubkey();
  const pubPath = r.pubPath || '';
  const result = await window.git.addSshKeyToGithub({ pubPath, title });
  btn.disabled = false;
  btn.textContent = '📤 Upload to GitHub';
  if (result.error) {
    if (result.needsScope) {
      showStatus(status, result.error, 'err');
      document.getElementById('btn-reauth-scope').style.display = 'inline-block';
    } else {
      showStatus(status, 'Error: ' + result.error, 'err');
    }
    return;
  }
  showStatus(status, '✓ Key uploaded to GitHub!', 'ok');
  setTimeout(async () => {
    document.getElementById('add-key-github-panel').style.display = 'none';
    document.getElementById('overall-badge').textContent = 'checking\u2026';
    document.getElementById('overall-badge').className = 'badge badge-checking';
    main.scrollTop = 0;
    const r = await window.git.forceCheck();
    renderChecks(r);
  }, 1200);
});

document.getElementById('btn-add-key-cancel').addEventListener('click', () => {
  document.getElementById('add-key-github-panel').style.display = 'none';
  document.getElementById('btn-reauth-scope').style.display = 'none';
});

document.getElementById('btn-reauth-scope').addEventListener('click', async () => {
  const status = document.getElementById('add-key-status');
  document.getElementById('btn-reauth-scope').style.display = 'none';
  showPanel('gh-login-panel');
  document.getElementById('gh-output').textContent = 'Refreshing gh auth scope...\n';
  await window.git.refreshGhScope();
});

// ── refresh ────────────────────────────────────────────────────────────────────

document.getElementById('btn-refresh').addEventListener('click', async () => {
  document.getElementById('overall-badge').textContent = 'checking\u2026';
  document.getElementById('overall-badge').className = 'badge badge-checking';
  const r = await window.git.forceCheck();
  renderChecks(r);
});

document.getElementById('btn-dismiss').addEventListener('click', () => {
  window.git.hideWindow();
});

// ── utils ──────────────────────────────────────────────────────────────────────

function showStatus(el, msg, cls) {
  el.textContent = msg;
  el.className = 'status-msg show ' + cls;
  setTimeout(() => el.classList.remove('show'), 5000);
}

// ── init ───────────────────────────────────────────────────────────────────────

(async () => {
  const r = await window.git.getResults();
  renderChecks(r);
})();

// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'git-login-manager');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
