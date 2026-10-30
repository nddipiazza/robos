'use strict';

let currentState = null;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });
}

function renderInspector(state) {
  const { detection, config } = state;
  const keys = (detection && detection.keys) || [];

  const pill = $('connection-pill');
  const label = $('connection-label');
  if (keys.length > 0) {
    const k0 = keys[0];
    pill.className = 'conn-pill conn-connected';
    label.textContent = `${k0.name} (${k0.firmwareVersion}) [${k0.usbId}]`;
    $('yk-graphic-model').textContent = k0.name.toUpperCase();
    $('hidraw-status').textContent = `${k0.hidraw} (${k0.writable ? 'udev ACL OK' : 'read-only'})`;
  } else {
    pill.className = 'conn-pill conn-disconnected';
    label.textContent = 'No Hardware Key Connected';
    $('hidraw-status').textContent = 'No /dev/hidraw key active';
  }

  const regDevices = (config && config.registeredDevices) || [];
  $('registered-count').textContent = `${regDevices.length} Key${regDevices.length === 1 ? '' : 's'}`;
  $('known-devices-badge').textContent = `${regDevices.length} registered`;

  const container = $('devices-container');
  if (keys.length === 0) {
    container.innerHTML = `
      <div class="card">
        <h3>No Physical Security Key Detected</h3>
        <p class="card-desc mt-8">
          Insert your YubiKey, Security Key C NFC, SoloKey, or Nitrokey into a USB port and click <strong>Rescan USB</strong>.
        </p>
      </div>
    `;
  } else {
    container.innerHTML = keys.map((k) => {
      const appRows = Object.entries(k.applications || {}).map(([appName, tr]) => `
        <tr>
          <td><strong>${escapeHtml(appName)}</strong></td>
          <td><span class="badge ${tr.usb === 'Enabled' ? 'badge-green' : 'badge-muted'}">${escapeHtml(tr.usb)}</span></td>
          <td><span class="badge ${tr.nfc === 'Enabled' ? 'badge-cyan' : 'badge-muted'}">${escapeHtml(tr.nfc)}</span></td>
        </tr>
      `).join('');

      const algs = (k.fido.algorithms || []).map(a => `<span class="pill pill-gold">${escapeHtml(a)}</span>`).join('');
      const exts = (k.fido.extensions || []).map(x => `<span class="pill">${escapeHtml(x)}</span>`).join('');
      const vers = (k.fido.versions || []).map(v => `<span class="pill">${escapeHtml(v)}</span>`).join('');

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <h3>${escapeHtml(k.name)}</h3>
              <div class="card-desc">${escapeHtml(k.fido.aaguidModel || k.vendor)} • ${escapeHtml(k.formFactor)}</div>
            </div>
            <span class="badge badge-green">Active on ${escapeHtml(k.hidraw)}</span>
          </div>

          <div class="key-spec-grid">
            <div class="spec-box">
              <div class="spec-label">Firmware &amp; USB ID</div>
              <div class="spec-value">v${escapeHtml(k.firmwareVersion)} • ${escapeHtml(k.usbId)}</div>
            </div>
            <div class="spec-box">
              <div class="spec-label">Transports</div>
              <div class="spec-value">USB (${escapeHtml(k.enabledUsbInterfaces.join(', '))})${k.nfcEnabled ? ' + NFC' : ''}</div>
            </div>
            <div class="spec-box">
              <div class="spec-label">FIDO2 AAGUID</div>
              <div class="spec-value"><code>${escapeHtml(k.fido.aaguid || 'N/A')}</code></div>
            </div>
            <div class="spec-box">
              <div class="spec-label">Passkey Storage &amp; PIN</div>
              <div class="spec-value">${k.fido.remainingCredentials != null ? `${k.fido.remainingCredentials} slots free` : 'Standard'} • PIN: ${k.fido.pinSet ? 'Set' : 'Not set'}</div>
            </div>
          </div>

          <div class="mt-12">
            <div class="spec-label">Cryptographic Algorithms (COSE)</div>
            <div class="pill-list">${algs}</div>
          </div>

          <div class="mt-12">
            <div class="spec-label">Protocols &amp; CTAP2 Extensions</div>
            <div class="pill-list">${vers}${exts}</div>
          </div>

          <div class="mt-12">
            <table class="data-table">
              <thead>
                <tr><th>Applet / Interface</th><th>USB</th><th>NFC</th></tr>
              </thead>
              <tbody>${appRows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
  }

  const regList = $('registered-devices-list');
  if (regDevices.length === 0) {
    regList.innerHTML = `<div class="empty-hint">No hardware keys registered yet.</div>`;
  } else {
    regList.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Device Model</th>
            <th>USB ID</th>
            <th>Firmware</th>
            <th>AAGUID</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          ${regDevices.map(d => `
            <tr>
              <td><strong>${escapeHtml(d.name)}</strong></td>
              <td><code>${escapeHtml(d.usbId)}</code></td>
              <td>${escapeHtml(d.firmwareVersion)}</td>
              <td><code>${escapeHtml(d.aaguid || '—')}</code></td>
              <td>${escapeHtml(new Date(d.lastSeenAt).toLocaleString())}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

function renderTouchHistory(config) {
  const history = (config && config.touchHistory) || [];
  const el = $('touch-history-list');
  if (history.length === 0) {
    el.innerHTML = `<div class="empty-hint">No touch verifications recorded yet.</div>`;
    return;
  }
  el.innerHTML = history.map((h) => `
    <div class="history-item">
      <div class="ssh-item-top">
        <strong>${escapeHtml(h.protocol)} (${escapeHtml(h.algorithm)})</strong>
        <span class="badge ${h.simulated ? 'badge-cyan' : 'badge-green'}">${h.latencyMs} ms ${h.simulated ? '(Sim)' : '✓ Physical Touch'}</span>
      </div>
      <div class="card-desc mt-8">
        RP: <code>${escapeHtml(h.rpId)}</code> • UP: ${h.userPresent ? '1' : '0'} • Sig: <code>${escapeHtml(h.signaturePreview)}</code> • ${escapeHtml(new Date(h.verifiedAt).toLocaleTimeString())}
      </div>
    </div>
  `).join('');
}

function renderSshKeys(sshKeys = []) {
  $('ssh-count-badge').textContent = `${sshKeys.length} key${sshKeys.length === 1 ? '' : 's'}`;
  const listEl = $('ssh-keys-list');
  if (sshKeys.length === 0) {
    listEl.innerHTML = `<div class="empty-hint">No SSH keys found in <code>~/.ssh</code>. Generate an <code>ed25519-sk</code> key on the left!</div>`;
    return;
  }
  listEl.innerHTML = sshKeys.map((k) => `
    <div class="ssh-item">
      <div class="ssh-item-top">
        <div>
          <strong>${escapeHtml(k.name)}</strong>
          <span class="badge ${k.isHardwareSk ? 'badge-gold' : 'badge-muted'}">
            ${k.isHardwareSk ? '🔒 HARDWARE FIDO2 (-sk)' : 'Software Key'}
          </span>
        </div>
        <div class="btn-row">
          ${k.hasPrivateKey ? `<button class="btn btn-sm btn-gold btn-test-sign" data-path="${escapeHtml(k.privPath)}">👆 Sign Test</button>` : ''}
          <button class="btn btn-sm btn-secondary btn-copy-pub" data-pub="${escapeHtml(k.publicKey)}">Copy .pub</button>
          <button class="btn btn-sm btn-secondary btn-gh-upload" data-pubpath="${escapeHtml(k.pubPath)}">GitHub Upload</button>
        </div>
      </div>
      <div class="card-desc mt-8">
        <code>${escapeHtml(k.keyType)}</code> • ${escapeHtml(k.comment)}<br/>
        <span style="font-size:11px;">${escapeHtml(k.fingerprint)}</span>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.btn-copy-pub').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.robos.copyText(btn.dataset.pub);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy .pub'; }, 1500);
    });
  });

  listEl.querySelectorAll('.btn-test-sign').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const outBox = $('ssh-sign-output');
      outBox.classList.remove('hidden');
      outBox.textContent = 'Touch your YubiKey to sign verification payload with ' + btn.dataset.path + '...';
      const res = await window.robos.testSshSign({ keyPath: btn.dataset.path });
      if (res.ok) {
        outBox.innerHTML = `
          <div class="status-ok">✓ Hardware SSH Signature Verified (${res.latencyMs} ms)</div>
          <div class="mt-8">Key: <code>${escapeHtml(res.keyPath)}</code></div>
          <pre class="mt-8" style="white-space:pre-wrap;">${escapeHtml(res.signature)}</pre>
        `;
      } else {
        outBox.innerHTML = `<div class="status-err">✗ ${escapeHtml(res.error)}</div>`;
      }
    });
  });

  listEl.querySelectorAll('.btn-gh-upload').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      const res = await window.robos.uploadGithubSsh({ pubPath: btn.dataset.pubpath });
      btn.disabled = false;
      btn.textContent = res.ok ? (res.alreadyAdded ? 'Already on GitHub' : 'Uploaded ✓') : 'Upload Failed';
      if (!res.ok) {
        $('ssh-gen-status').className = 'status-msg status-err mt-8';
        $('ssh-gen-status').textContent = res.error;
      }
    });
  });
}

function renderFidoTab(state) {
  const keys = (state.detection && state.detection.keys) || [];
  const k0 = keys[0];
  const pinBadge = $('fido-pin-badge');
  const rkBadge = $('rk-remaining-badge');
  if (!k0) {
    pinBadge.className = 'badge badge-muted';
    pinBadge.textContent = 'No Key Connected';
    rkBadge.textContent = '—';
    return;
  }
  if (k0.fido.pinSet) {
    pinBadge.className = 'badge badge-green';
    pinBadge.textContent = `PIN Set (min ${k0.fido.minPinLength})`;
  } else {
    pinBadge.className = 'badge badge-gold';
    pinBadge.textContent = `PIN Not Set (min ${k0.fido.minPinLength})`;
  }
  rkBadge.textContent = k0.fido.remainingCredentials != null
    ? `${k0.fido.remainingCredentials} slots free`
    : 'Supported';
}

function renderGuardTab(state) {
  const { systemStatus, config } = state;
  const pamBadge = $('pam-status-badge');
  const pamBox = $('pam-keys-box');

  if (systemStatus && systemStatus.pamEnrolled) {
    pamBadge.className = 'badge badge-green';
    pamBadge.textContent = 'Enrolled in u2f_keys';
    pamBox.innerHTML = systemStatus.pamKeys.map(p => `
      <div>User: <strong>${escapeHtml(p.user)}</strong> (${p.handleCount} key handle)</div>
      <div class="mt-8"><code>${escapeHtml(p.preview)}</code></div>
    `).join('');
  } else {
    pamBadge.className = 'badge badge-muted';
    pamBadge.textContent = 'Not Enrolled';
    pamBox.innerHTML = `<div class="empty-hint">No <code>~/.config/Yubico/u2f_keys</code> file configured yet. Click <strong>Enroll YubiKey with pamu2fcfg</strong> below and touch your YubiKey.</div>`;
  }

  const pol = (config && config.policies) || {};
  $('pol-pass-unlock').checked = Boolean(pol.requireTouchForPassUnlock);
  $('pol-agent-guard').checked = Boolean(pol.requireTouchForHighRiskAgent);
  $('pol-unplug-lock').checked = Boolean(pol.lockSessionOnUnplug);
  $('pol-git-sign').checked = Boolean(pol.requireTouchForGitSign || (systemStatus && systemStatus.gitSigning && systemStatus.gitSigning.enabled));
}

function renderAll(state) {
  currentState = state;
  renderInspector(state);
  renderTouchHistory(state.config);
  renderSshKeys(state.sshKeys);
  renderFidoTab(state);
  renderGuardTab(state);
}

async function triggerTouchChallenge(simulate = false) {
  switchTab('touch');
  const disc = $('touch-disc');
  const stateLabel = $('touch-state-text');
  const badge = $('proof-status-badge');
  const proofBox = $('touch-proof-box');

  disc.classList.remove('verified');
  disc.classList.add('waiting');
  badge.className = 'badge badge-gold';
  badge.textContent = simulate ? 'Simulating...' : 'Touch Key Now...';
  stateLabel.textContent = simulate
    ? 'Generating simulated FIDO2 touch assertion...'
    : 'Touch the flashing gold circle on your physical YubiKey now...';

  const rpId = ($('touch-rpid').value || 'robos.local').trim();
  const pin = $('touch-pin').value || '';

  const res = await window.robos.runTouchChallenge({ rpId, pin, simulate, timeoutSec: 20 });
  disc.classList.remove('waiting');

  if (res.ok) {
    disc.classList.add('verified');
    badge.className = 'badge badge-green';
    badge.textContent = `Verified (${res.latencyMs} ms)`;
    stateLabel.textContent = `✓ Physical presence confirmed in ${res.latencyMs} ms!`;
    proofBox.innerHTML = `
      <div><strong>Protocol:</strong> ${escapeHtml(res.protocol)}</div>
      <div><strong>Algorithm:</strong> ${escapeHtml(res.algorithm)}</div>
      <div><strong>RP ID:</strong> <code>${escapeHtml(res.rpId)}</code></div>
      <div><strong>Touch Latency:</strong> <span class="status-ok">${res.latencyMs} ms</span></div>
      <div><strong>Flags:</strong> User Present (UP=${res.userPresent ? 1 : 0}), User Verified (UV=${res.userVerified ? 1 : 0}), Counter=${res.signCount}</div>
      <div class="mt-8"><strong>Challenge (SHA-256):</strong><br/><code>${escapeHtml(res.challengeHex)}</code></div>
      <div class="mt-8"><strong>Credential Handle:</strong><br/><code>${escapeHtml(res.credentialIdHex)}</code></div>
      <div class="mt-8"><strong>Hardware Signature:</strong><br/><code>${escapeHtml(res.signatureHex)}</code></div>
    `;
    if (res.config) renderTouchHistory(res.config);
  } else {
    badge.className = 'badge badge-muted';
    badge.textContent = 'Challenge Failed';
    stateLabel.textContent = res.error || 'Touch challenge timed out or failed';
    proofBox.innerHTML = `<div class="status-err">✗ ${escapeHtml(res.error)}</div>`;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // Tab navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Topbar actions
  $('btn-rescan').addEventListener('click', async () => {
    const st = await window.robos.scanKeys();
    renderAll(st);
  });

  $('btn-quick-touch').addEventListener('click', () => triggerTouchChallenge(false));
  $('touch-disc').addEventListener('click', () => triggerTouchChallenge(false));
  $('btn-touch-real').addEventListener('click', () => triggerTouchChallenge(false));
  $('btn-touch-sim').addEventListener('click', () => triggerTouchChallenge(true));

  // SSH Key type change updates default filename
  $('ssh-key-type').addEventListener('change', (e) => {
    const val = e.target.value;
    $('ssh-filename').value = val === 'ecdsa-sk' ? 'id_ecdsa_sk' : 'id_ed25519_sk';
  });

  // Generate Hardware SSH Key
  $('btn-generate-ssh').addEventListener('click', async () => {
    const statusEl = $('ssh-gen-status');
    statusEl.className = 'status-msg';
    statusEl.textContent = 'Touch your flashing YubiKey to generate hardware-backed SSH key...';
    const res = await window.robos.generateSshKey({
      keyType: $('ssh-key-type').value,
      fileName: $('ssh-filename').value.trim(),
      application: $('ssh-app').value.trim(),
      comment: $('ssh-comment').value.trim(),
      requireTouch: $('ssh-require-touch').checked,
      verifyRequired: $('ssh-verify-required').checked,
      resident: $('ssh-resident').checked,
      overwrite: $('ssh-overwrite').checked,
    });
    if (res.ok) {
      statusEl.className = 'status-msg status-ok mt-8';
      statusEl.textContent = `✓ Created hardware SSH key at ${res.pubPath}`;
      renderSshKeys(res.sshKeys || []);
    } else {
      statusEl.className = 'status-msg status-err mt-8';
      statusEl.textContent = `✗ ${res.error}`;
    }
  });

  // FIDO2 PIN
  $('btn-save-pin').addEventListener('click', async () => {
    const currentPin = $('fido-current-pin').value;
    const newPin = $('fido-new-pin').value;
    const confirmPin = $('fido-confirm-pin').value;
    const stEl = $('fido-pin-status');
    if (newPin !== confirmPin) {
      stEl.className = 'status-msg status-err mt-8';
      stEl.textContent = 'New PIN and confirmation do not match.';
      return;
    }
    const res = await window.robos.setFidoPin({ currentPin, newPin });
    if (res.ok) {
      stEl.className = 'status-msg status-ok mt-8';
      stEl.textContent = '✓ FIDO2 PIN updated on YubiKey!';
      $('fido-current-pin').value = '';
      $('fido-new-pin').value = '';
      $('fido-confirm-pin').value = '';
      if (res.detection) {
        currentState.detection = res.detection;
        renderInspector(currentState);
        renderFidoTab(currentState);
      }
    } else {
      stEl.className = 'status-msg status-err mt-8';
      stEl.textContent = `✗ ${res.error}`;
    }
  });

  // Load Resident Passkeys
  $('btn-load-passkeys').addEventListener('click', async () => {
    const pin = $('rk-query-pin').value;
    const box = $('passkeys-list');
    const res = await window.robos.listResidentCreds({ pin });
    if (!res.ok) {
      box.innerHTML = `<div class="status-err">${escapeHtml(res.error)}</div>`;
      return;
    }
    if (!res.credentials || res.credentials.length === 0) {
      box.innerHTML = `<div class="empty-hint">No resident credentials (passkeys) stored on this YubiKey yet.</div>`;
      return;
    }
    box.innerHTML = res.credentials.map(c => `
      <div class="ssh-item">
        <div class="ssh-item-top">
          <strong>${escapeHtml(c.rpId)}</strong>
          <button class="btn btn-sm btn-secondary btn-del-rk" data-id="${escapeHtml(c.credentialId)}">Delete</button>
        </div>
        <div class="card-desc mt-8">User: ${escapeHtml(c.userName || c.displayName || '—')} • ID: <code>${escapeHtml(c.credentialId)}</code></div>
      </div>
    `).join('');

    box.querySelectorAll('.btn-del-rk').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const delRes = await window.robos.deleteResidentCred({ credentialId: btn.dataset.id, pin });
        if (delRes.ok) $('btn-load-passkeys').click();
      });
    });
  });

  // Enroll PAM U2F
  $('btn-enroll-pam').addEventListener('click', async () => {
    const msgEl = $('guard-status-msg');
    msgEl.className = 'status-msg';
    msgEl.textContent = 'Touch your flashing YubiKey to enroll PAM U2F...';
    const res = await window.robos.enrollPamU2f();
    if (res.ok) {
      msgEl.className = 'status-msg status-ok mt-8';
      msgEl.textContent = `✓ Enrolled YubiKey into ${res.u2fFile}`;
      currentState.systemStatus = res.systemStatus;
      renderGuardTab(currentState);
    } else {
      msgEl.className = 'status-msg status-err mt-8';
      msgEl.textContent = `✗ ${res.error}`;
    }
  });

  $('btn-copy-pam').addEventListener('click', async () => {
    await window.robos.copyText($('pam-snippet-code').textContent);
    $('btn-copy-pam').textContent = 'Copied!';
    setTimeout(() => { $('btn-copy-pam').textContent = 'Copy'; }, 1500);
  });

  // Save RobOS Security Policies
  $('btn-save-policies').addEventListener('click', async () => {
    const res = await window.robos.savePolicies({
      requireTouchForPassUnlock: $('pol-pass-unlock').checked,
      requireTouchForHighRiskAgent: $('pol-agent-guard').checked,
      lockSessionOnUnplug: $('pol-unplug-lock').checked,
      requireTouchForGitSign: $('pol-git-sign').checked,
    });
    const msgEl = $('guard-status-msg');
    if (res.ok) {
      msgEl.className = 'status-msg status-ok mt-8';
      msgEl.textContent = '✓ Saved RobOS Hardware Key security policies.';
    }
  });

  // Configure Git Hardware Signing
  $('btn-enable-git-sign').addEventListener('click', async () => {
    const skKey = (currentState.sshKeys || []).find(k => k.isHardwareSk) || (currentState.sshKeys || [])[0];
    const msgEl = $('guard-status-msg');
    if (!skKey) {
      msgEl.className = 'status-msg status-err mt-8';
      msgEl.textContent = 'Generate a hardware SSH key in the FIDO2 SSH Keys tab first.';
      return;
    }
    const res = await window.robos.configureGitSigning({ pubKeyPath: skKey.pubPath });
    if (res.ok) {
      msgEl.className = 'status-msg status-ok mt-8';
      msgEl.textContent = `✓ Configured Git global SSH commit signing with ${res.pubKeyPath}`;
    } else {
      msgEl.className = 'status-msg status-err mt-8';
      msgEl.textContent = `✗ ${res.error}`;
    }
  });

  // Live IPC status events
  window.robos.onTouchStatus((st) => {
    const banner = $('touch-banner');
    const bannerMsg = $('touch-banner-message');
    if (st.state === 'waiting-touch') {
      banner.classList.remove('hidden');
      bannerMsg.textContent = st.message || 'Touch your YubiKey gold contact now...';
    } else {
      setTimeout(() => banner.classList.add('hidden'), 1200);
    }
  });

  window.robos.onHotplugChanged((newState) => {
    renderAll(newState);
  });

  // Initial load
  const initialState = await window.robos.getState();
  renderAll(initialState);
});
