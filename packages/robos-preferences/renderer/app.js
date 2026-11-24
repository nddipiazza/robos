'use strict';

let _schema = null;
let _settings = {};
let _githubAccountsSelection = null;

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function init() {
  _schema = await window.api.getSchema();
  _settings = await window.api.loadSettings();
  renderSidebar();
  renderSections();
  await Promise.all([loadAudioDevices(), loadMediaServices(), loadConfigSync(), loadCloudAccounts(), loadGithubAccounts(), loadOvpnAccounts(), loadAiApiStatus()]);
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  el.innerHTML = _schema.sections.map((s, idx) =>
    `<button type="button" class="sidebar-item ${idx === 0 ? 'active' : ''}" id="sidebar-item-${s.id}" data-section="${s.id}" aria-controls="section-${s.id}" ${idx === 0 ? 'aria-current="true"' : ''}>${esc(s.label)}</button>`
  ).join('');
  el.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      el.querySelectorAll('.sidebar-item').forEach(i => { i.classList.remove('active'); i.removeAttribute('aria-current'); });
      item.classList.add('active');
      item.setAttribute('aria-current', 'true');
      const target = document.getElementById('section-' + item.dataset.section);
      if (target) target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  });
  // Keep the selected navigation item accurate while scrolling or resizing.
  const content = document.getElementById('content');
  let pending = false;
  const updateCurrentSection = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const top = content.getBoundingClientRect().top + 36;
      const sections = [...document.querySelectorAll('#sections > .section')];
      const atBottom = content.scrollTop > 0 && content.scrollHeight - content.clientHeight - content.scrollTop < 2;
      const current = atBottom ? sections.at(-1) : sections.filter(section => section.getBoundingClientRect().top <= top).at(-1) || sections[0];
      if (!current) return;
      el.querySelectorAll('.sidebar-item').forEach(item => {
        const active = 'section-' + item.dataset.section === current.id;
        item.classList.toggle('active', active);
        if (active) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
    });
  };
  content.addEventListener('scroll', updateCurrentSection, { passive: true });
  window.addEventListener('resize', updateCurrentSection);
}

function renderSections() {
  const el = document.getElementById('sections');
  el.innerHTML = _schema.sections.map(section => {
    if (section.id === 'audio_devices') return audioDevicesSection();
    if (section.id === 'media_services') return mediaServicesSection();
    if (section.id === 'config_sync') return configSyncSection();
    if (section.id === 'cloud_accounts') return cloudAccountSection();
    if (section.id === 'github_accounts') return githubAccountSection();
    if (section.id === 'ovpn_accounts') return ovpnAccountSection();
    const fields = section.fields.map(f => {
      const val = _settings[f.key] !== undefined ? _settings[f.key] : f.default;
      let input = '';
      if (f.type === 'text' || f.type === 'password') {
        input = `<input type="${f.type}" id="field-${f.key}" class="text-input" data-key="${f.key}" value="${esc(val)}" />`;
      } else if (f.type === 'secret') {
        // Saved straight to pass; never part of settings.json.
        input = `<div class="secret-input"><input type="password" id="field-${f.key}" class="text-input" data-secret="${esc(f.provider)}" autocomplete="off" placeholder="Not set" />` +
          `<button type="button" class="btn" data-save-secret="${esc(f.provider)}">Save</button></div>`;
      } else if (f.type === 'checkbox') {
        input = `<input type="checkbox" id="field-${f.key}" data-key="${f.key}" ${val ? 'checked' : ''} />`;
      } else if (f.type === 'select') {
        input = `<select id="field-${f.key}" class="select-input" data-key="${f.key}">` +
          f.options.map(o => {const value=typeof o==='object'?o.value:o,label=typeof o==='object'?o.label:o;return `<option value="${esc(value)}"${value === val ? ' selected' : ''}>${esc(label)}</option>`;}).join('') +
          `</select>`;
      }
      return `<div class="field-row">` +
        `<label class="field-label" for="field-${f.key}">${esc(f.label)}</label>` +
        `<div class="field-input">${input}</div>` +
      `</div>`;
    }).join('');

    return `<div class="section" id="section-${section.id}">` +
      `<h2 class="section-title">${esc(section.label)}</h2>` +
      (section.description ? `<p class="section-description">${esc(section.description)}</p>` : '') +
      fields +
      (section.id === 'ai' ? aiApiPanel() : '') +
    `</div>`;
  }).join('');
}

function collectSettings() {
  const data = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    if (el.type === 'checkbox') {
      data[el.dataset.key] = el.checked;
    } else {
      data[el.dataset.key] = el.value;
    }
  });
  return data;
}

window.setFieldValue = function(key, value) {
  const el = document.getElementById('field-' + key);
  if (!el) return false;
  if (el.type === 'checkbox') {
    el.checked = !!value;
  } else {
    el.value = value;
  }
  _settings[key] = value;
  return true;
};

window.saveAll = async function() {
  if (_githubAccountsSelection) {
    const selected = { git: document.getElementById('github-git-account').value, copilot: document.getElementById('github-copilot-account').value };
    if (selected.git !== _githubAccountsSelection.git || selected.copilot !== _githubAccountsSelection.copilot) {
      try { showGithubAccounts(await window.api.saveGithubAccounts(selected)); }
      catch (error) { document.getElementById('github-accounts-status').textContent = error.message; return { ok: false, error: error.message }; }
    }
  }
  const data = collectSettings();
  const result = await window.api.saveSettings(data);
  const msg = document.getElementById('status-msg');
  if (result.ok) {
    msg.textContent = '✓ Settings saved successfully.';
    msg.className = 'status-msg success';
  } else {
    msg.textContent = 'Error saving settings.';
    msg.className = 'status-msg error';
  }
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 3000);
  return result;
};

document.getElementById('btn-save').addEventListener('click', window.saveAll);

init();

function githubAccountSection() {
  return `<section class="section" id="section-github_accounts">
    <h2 class="section-title">GitHub accounts</h2>
    <p class="section-description">Choose a saved GitHub account for each connection. Credentials stay in the existing GitHub credential store.</p>
    <div class="field-row"><div class="field-copy"><label class="field-label" for="github-git-account">Git client</label>
    <p class="field-description" id="git-account-description">Shared by Git Projects, GitHub task servers using Git client authentication, and PR Reviewer. This sets the active GitHub CLI account. Existing SSH keys and repository-specific credential helpers are managed separately.</p></div><div class="field-input"><select class="select-input" id="github-git-account" aria-describedby="git-account-description"></select></div></div>
    <div class="field-row"><div class="field-copy"><label class="field-label" for="github-copilot-account">Copilot AI agent</label>
    <p class="field-description" id="copilot-account-description">Used for new Copilot sessions and model access. Changing it does not switch the Git client account.</p></div><div class="field-input"><select class="select-input" id="github-copilot-account" aria-describedby="copilot-account-description"></select></div></div>
    <div class="section-actions"><button class="btn btn-primary" id="save-github-accounts" disabled>Save accounts</button><button class="btn" id="refresh-github-accounts">Refresh accounts</button><button class="btn" id="add-github-account">Add GitHub account</button></div>
    <p class="section-status" id="github-accounts-status" role="status" aria-live="polite">Loading saved accounts…</p>
  </section>`;
}
function showGithubAccounts(result) {
  if (!result.ok) throw Error(result.error);
  _githubAccountsSelection = { ...result.selected };
  for (const [kind, id] of [['git', 'github-git-account'], ['copilot', 'github-copilot-account']]) {
    const select = document.getElementById(id);
    select.replaceChildren(new Option('Choose an account…', ''));
    for (const account of result.accounts) {
      const option = new Option(account.login + (account.valid ? '' : ' — sign in again'), account.login);
      option.disabled = !account.valid; select.append(option);
    }
    if (result.selected[kind] && !result.accounts.some(a => a.login === result.selected[kind])) {
      const option = new Option(result.selected[kind] + ' — no longer signed in', result.selected[kind]); option.disabled = true; select.append(option);
    }
    select.value = result.selected[kind];
  }
  document.getElementById('save-github-accounts').disabled = !result.accounts.some(a => a.valid);
}
async function loadGithubAccounts() {
  const status = document.getElementById('github-accounts-status');
  try { showGithubAccounts(await window.api.githubAccounts()); status.textContent = 'Choose the account for each connection, then save.'; }
  catch (error) { status.textContent = error.message; }
  document.getElementById('refresh-github-accounts').onclick = loadGithubAccounts;
  document.getElementById('add-github-account').onclick = async () => {
    try { const result = await window.api.addGithubAccount(); if (!result.ok) throw Error(result.error); status.textContent = 'Complete sign-in in the terminal, then refresh accounts. Your saved Git client selection will be restored after sign-in.'; }
    catch (error) { status.textContent = error.message; }
  };
  document.getElementById('save-github-accounts').onclick = async () => {
    const buttons = [...document.querySelectorAll('#section-github_accounts button')]; buttons.forEach(b => { b.disabled = true; });
    status.textContent = 'Checking Copilot access and saving accounts…';
    try {
      const result = await window.api.saveGithubAccounts({ git: document.getElementById('github-git-account').value, copilot: document.getElementById('github-copilot-account').value });
      showGithubAccounts(result); status.textContent = `Saved. Git client: ${result.selected.git}. Copilot: ${result.selected.copilot}.`;
    } catch (error) { status.textContent = error.message; }
    finally { buttons.forEach(b => { b.disabled = false; }); }
  };
}
window.api.onShowGithubAccounts(() => document.getElementById('section-github_accounts')?.scrollIntoView());

// ── OpenVPN Providers & Accounts (IPVanish + Custom OVPN) ────────────────────
let _ovpnState = { providers: [], accounts: [], defaultAccountId: null };

function ovpnAccountSection() {
  return `<section class="section" id="section-ovpn_accounts">
    <h2 class="section-title">OpenVPN &amp; VPN Accounts</h2>
    <p class="section-description">Manage tracked OpenVPN providers (IPVanish built-in) and credentials for the RobOS VPN App Sandbox. Passwords are stored encrypted in <code>pass</code> (never in plaintext settings).</p>
    <div id="ovpn-accounts-list-wrap" style="margin-top:12px;"></div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ovpn-provider">OpenVPN Provider</label>
        <p class="field-description" id="ovpn-provider-help">IPVanish is pre-configured with 14+ regional gateways and official CA certificates.</p>
      </div>
      <div class="field-input"><select class="select-input" id="ovpn-provider"></select></div>
    </div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ovpn-account-label">Account Label</label>
        <p class="field-description">Friendly name shown in RobOS VPN Sandbox (e.g. "My IPVanish").</p>
      </div>
      <div class="field-input"><input type="text" class="text-input" id="ovpn-account-label" placeholder="My IPVanish Account" /></div>
    </div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ovpn-username">OpenVPN Username</label>
        <p class="field-description">Your IPVanish or OpenVPN service username.</p>
      </div>
      <div class="field-input"><input type="text" class="text-input" id="ovpn-username" autocomplete="off" placeholder="username@example.com" /></div>
    </div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ovpn-password">OpenVPN Password</label>
        <p class="field-description">Stored encrypted in <code>robos/ovpn/&lt;provider&gt;/&lt;account&gt;</code>.</p>
      </div>
      <div class="field-input" style="display:flex;gap:6px;align-items:center;">
        <input type="password" class="text-input" id="ovpn-password" autocomplete="off" placeholder="Enter OpenVPN service password" style="flex:1;" />
        <button type="button" class="btn" id="btn-toggle-ovpn-password">Show</button>
      </div>
    </div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ovpn-default-profile">Default Server Profile (.ovpn)</label>
        <p class="field-description">Default VPN gateway used when sandboxing applications.</p>
      </div>
      <div class="field-input"><select class="select-input" id="ovpn-default-profile"></select></div>
    </div>
    <div class="section-actions">
      <button type="button" class="btn btn-primary" id="btn-save-ovpn-account">Add / Save VPN Account</button>
      <button type="button" class="btn" id="btn-test-ovpn-account">Test Connection</button>
      <button type="button" class="btn" id="btn-sync-ovpn-profiles">Sync IPVanish Server Profiles</button>
    </div>
    <p class="section-status" id="ovpn-accounts-status" role="status" aria-live="polite">Loading OpenVPN providers and accounts…</p>
  </section>`;
}

function renderOvpnSection(state) {
  _ovpnState = state;
  const providerSelect = document.getElementById('ovpn-provider');
  const profileSelect = document.getElementById('ovpn-default-profile');
  const helpEl = document.getElementById('ovpn-provider-help');
  const listWrap = document.getElementById('ovpn-accounts-list-wrap');
  if (!providerSelect || !profileSelect || !listWrap) return;

  const currentProviderId = providerSelect.value || 'ipvanish';
  providerSelect.innerHTML = (state.providers || []).map(p =>
    `<option value="${esc(p.id)}"${p.id === currentProviderId ? ' selected' : ''}>${esc(p.name)}${p.builtin ? ' (Built-in)' : ''}</option>`
  ).join('');

  const updateProfilesForProvider = (pid) => {
    const prov = (state.providers || []).find(p => p.id === pid) || state.providers?.[0];
    if (helpEl && prov) helpEl.textContent = prov.credentialHelp || prov.description || '';
    const profiles = prov?.profiles || [];
    profileSelect.innerHTML = profiles.length
      ? profiles.map(pr => `<option value="${esc(pr.id)}">${esc(pr.label)}</option>`).join('')
      : `<option value="">Default profile</option>`;
  };

  updateProfilesForProvider(providerSelect.value || 'ipvanish');
  providerSelect.onchange = () => updateProfilesForProvider(providerSelect.value);

  const accounts = state.accounts || [];
  if (!accounts.length) {
    listWrap.innerHTML = `<div style="padding:10px 12px;border:1px solid #29323e;border-radius:6px;color:var(--muted);font-size:13px;margin-bottom:8px;">No OpenVPN accounts saved yet. Add your <strong>IPVanish</strong> account below to use it in the RobOS VPN App Sandbox.</div>`;
  } else {
    listWrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">` +
      accounts.map(acc => `
        <div class="ovpn-account-row" data-account-id="${esc(acc.id)}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border:1px solid ${acc.isDefault ? '#2e5964' : '#29323e'};background:${acc.isDefault ? '#112229' : '#0d1117'};border-radius:6px;">
          <div>
            <div style="font-weight:600;font-size:13.5px;">
              ${esc(acc.label)}
              <span style="font-size:11px;padding:2px 7px;border-radius:10px;background:#1f2937;color:#55d6e5;margin-left:6px;">${esc(acc.providerName)}</span>
              ${acc.isDefault ? `<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:#153626;color:#94e6b5;margin-left:4px;">Default</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">
              User: <code>${esc(acc.username)}</code> · Server: <code>${esc(acc.defaultProfile || 'default')}</code> · Secret: <code>${esc(acc.passPath)}</code> (${acc.secretConfigured ? '✓ encrypted' : 'missing'})
            </div>
          </div>
          <div style="display:flex;gap:6px;flex:none;">
            ${!acc.isDefault ? `<button type="button" class="btn" data-ovpn-default="${esc(acc.id)}">Set Default</button>` : ''}
            <button type="button" class="btn" data-ovpn-test="${esc(acc.id)}">Test</button>
            <button type="button" class="btn" data-ovpn-delete="${esc(acc.id)}">Remove</button>
          </div>
        </div>
      `).join('') +
      `</div>`;

    listWrap.querySelectorAll('[data-ovpn-default]').forEach(btn => {
      btn.onclick = async () => {
        const res = await window.api.setDefaultOvpnAccount(btn.dataset.ovpnDefault);
        if (res.ok) renderOvpnSection(res);
      };
    });
    listWrap.querySelectorAll('[data-ovpn-test]').forEach(btn => {
      btn.onclick = async () => {
        const statusEl = document.getElementById('ovpn-accounts-status');
        btn.disabled = true;
        btn.textContent = 'Testing…';
        if (statusEl) statusEl.textContent = 'Testing OpenVPN handshake & authentication…';
        const res = await window.api.testOvpnAccount({ accountId: btn.dataset.ovpnTest });
        btn.disabled = false;
        btn.textContent = 'Test';
        if (statusEl) statusEl.textContent = res.ok ? res.message : `Error: ${res.error}`;
      };
    });
    listWrap.querySelectorAll('[data-ovpn-delete]').forEach(btn => {
      btn.onclick = async () => {
        const res = await window.api.deleteOvpnAccount(btn.dataset.ovpnDelete);
        if (res.ok) renderOvpnSection(res);
      };
    });
  }
}

async function loadOvpnAccounts() {
  const statusEl = document.getElementById('ovpn-accounts-status');
  if (!statusEl || !window.api.ovpnAccounts) return;
  try {
    const res = await window.api.ovpnAccounts();
    if (!res.ok) throw new Error(res.error || 'Could not load OpenVPN accounts');
    renderOvpnSection(res);
    statusEl.textContent = `${res.providers?.length || 0} OpenVPN providers registered (IPVanish built-in). ${res.accounts?.length || 0} account(s) tracked.`;
  } catch (err) {
    statusEl.textContent = err.message;
  }

  const pwInput = document.getElementById('ovpn-password');
  const pwToggle = document.getElementById('btn-toggle-ovpn-password');
  if (pwInput && pwToggle) {
    pwToggle.onclick = () => {
      const showing = pwInput.type === 'text';
      pwInput.type = showing ? 'password' : 'text';
      pwToggle.textContent = showing ? 'Show' : 'Hide';
    };
  }

  const saveBtn = document.getElementById('btn-save-ovpn-account');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const providerId = document.getElementById('ovpn-provider').value || 'ipvanish';
      const label = document.getElementById('ovpn-account-label').value.trim();
      const username = document.getElementById('ovpn-username').value.trim();
      const password = document.getElementById('ovpn-password').value;
      const defaultProfile = document.getElementById('ovpn-default-profile').value;
      statusEl.textContent = 'Saving OpenVPN account and encrypting credentials…';
      const res = await window.api.saveOvpnAccount({
        providerId,
        label,
        username,
        password,
        defaultProfile,
        setDefault: true,
      });
      if (!res.ok) {
        statusEl.textContent = `Error: ${res.error}`;
        return;
      }
      document.getElementById('ovpn-password').value = '';
      renderOvpnSection(res);
      statusEl.textContent = `✓ Saved ${res.account?.label || username} (${providerId}) and stored password securely.`;
    };
  }

  const testBtn = document.getElementById('btn-test-ovpn-account');
  if (testBtn) {
    testBtn.onclick = async () => {
      const providerId = document.getElementById('ovpn-provider').value || 'ipvanish';
      const username = document.getElementById('ovpn-username').value.trim();
      const password = document.getElementById('ovpn-password').value;
      const profileId = document.getElementById('ovpn-default-profile').value;
      testBtn.disabled = true;
      testBtn.textContent = 'Testing…';
      statusEl.textContent = 'Testing OpenVPN handshake & authentication…';
      const res = await window.api.testOvpnAccount({ providerId, username, password, profileId });
      testBtn.disabled = false;
      testBtn.textContent = 'Test Connection';
      statusEl.textContent = res.ok ? res.message : `Error: ${res.error}`;
    };
  }

  const syncBtn = document.getElementById('btn-sync-ovpn-profiles');
  if (syncBtn) {
    syncBtn.onclick = async () => {
      syncBtn.disabled = true;
      statusEl.textContent = 'Syncing IPVanish .ovpn profiles…';
      const res = await window.api.syncOvpnProfiles('ipvanish');
      syncBtn.disabled = false;
      const fresh = await window.api.ovpnAccounts();
      if (fresh.ok) renderOvpnSection(fresh);
      statusEl.textContent = res.message || 'Synced IPVanish profiles.';
    };
  }
}

// ── Optional API mode ────────────────────────────────────────────────────────

function aiApiPanel() {
  return `<div class="section-actions"><button type="button" class="btn" id="ai-api-install">Install API packages</button></div>
    <p class="section-status" id="ai-api-status" role="status" aria-live="polite">Checking API mode…</p>`;
}

function selectedApiProviders() {
  const api = document.getElementById('field-ai_api_provider')?.value;
  const emb = document.getElementById('field-ai_embeddings_provider')?.value;
  return [...new Set([api, emb].filter(Boolean))];
}

function describeAiApi(status) {
  if (!status.ok) return status.error;
  const chosen = selectedApiProviders();
  const missing = chosen.filter(p => !status.providers[p]?.installed).map(p => status.providers[p].label);
  const noKey = chosen.filter(p => status.providers[p]?.needsKey && !status.providers[p].keyConfigured).map(p => status.providers[p].label);
  const on = document.getElementById('field-ai_api_enabled')?.checked;
  if (!on) return 'API mode is off. RobOS uses your agent CLIs.' + (missing.length ? '' : ' API packages are installed.');
  const parts = [status.enabled ? 'API mode is on.' : 'API mode turns on when you save.'];
  parts.push(missing.length ? `Packages not installed for ${missing.join(', ')}: click Install API packages.` : 'Packages installed for the selected providers.');
  if (noKey.length) parts.push(`No API key saved for ${noKey.join(', ')}.`);
  if (!status.passReady) parts.push('The password store is not set up, so keys cannot be saved. Run Security Setup first.');
  return parts.join(' ');
}

async function loadAiApiStatus() {
  const statusEl = document.getElementById('ai-api-status');
  if (!statusEl) return;
  let status;
  try { status = await window.api.aiApiStatus(); } catch (error) { status = { ok: false, error: error.message }; }
  statusEl.textContent = describeAiApi(status);
  const installBtn = document.getElementById('ai-api-install');
  installBtn.disabled = !status.ok;
  if (status.ok) {
    for (const input of document.querySelectorAll('[data-secret]')) {
      input.placeholder = status.providers[input.dataset.secret]?.keyConfigured ? 'Saved in pass' : 'Not set';
    }
  }
  for (const id of ['field-ai_api_enabled', 'field-ai_api_provider', 'field-ai_embeddings_provider']) {
    const el = document.getElementById(id);
    if (el) el.onchange = () => { statusEl.textContent = describeAiApi(status); };
  }
  installBtn.onclick = async () => {
    installBtn.disabled = true;
    statusEl.textContent = 'Installing API packages with npm. This can take a minute…';
    const result = await window.api.aiApiInstall(selectedApiProviders());
    if (!result.ok) { statusEl.textContent = `Install failed: ${result.error}`; installBtn.disabled = false; return; }
    await loadAiApiStatus();
  };
  for (const btn of document.querySelectorAll('[data-save-secret]')) {
    btn.onclick = async () => {
      const input = document.querySelector(`[data-secret="${btn.dataset.saveSecret}"]`);
      const result = await window.api.aiApiSaveKey(btn.dataset.saveSecret, input.value);
      if (!result.ok) { statusEl.textContent = result.error; return; }
      input.value = '';
      await loadAiApiStatus();
      statusEl.textContent = `Key saved in pass at ${result.passPath}. ` + statusEl.textContent;
    };
  }
}

// ── Unified Cloud Suite Accounts (Google, Microsoft, Nextcloud, Dropbox, S3) ─

function cloudAccountSection() {
  return `<section class="section" id="section-cloud_accounts">
    <h2 class="section-title">Cloud Suite Accounts</h2>
    <p class="section-description">Unified cloud accounts (Google Workspace, Microsoft 365 / OneDrive, Nextcloud, Dropbox, S3) shared across Data Sources, Audio Player, File Explorer, and Thunderbird Calendar/Contacts/Mail. Any Google Drive or OneDrive login is automatically imported here.</p>
    <div id="cloud-accounts-list-wrap" style="margin-top:12px;"></div>
    <div class="section-actions">
      <button type="button" class="btn btn-primary" id="btn-cloud-google-signin">Sign in / Refresh Google Account</button>
      <button type="button" class="btn" id="btn-open-cloud-accounts-app">Open RobOS Cloud Accounts App</button>
      <button type="button" class="btn" id="btn-open-google-calendar-app">Open Google Calendar &amp; Thunderbird Setup</button>
    </div>
    <p class="section-status" id="cloud-accounts-status" role="status" aria-live="polite">Loading unified cloud accounts…</p>
    ${googleClientNotice()}
  </section>`;
}

/**
 * Google's sign-in page names the OAuth client's app, and RobOS's built-in client is
 * rclone's public one, so Google says "rclone". This explains that and lets the user sign
 * in with their own Google OAuth client instead (which shows their own app name).
 */
function googleClientNotice() {
  return `<div id="cloud-google-client" style="margin-top:12px;padding:10px 14px;border:1px solid #29323e;border-radius:6px;font-size:12.5px;line-height:1.5;">
      <p style="margin:0;"><strong>Why Google's sign-in page says “rclone”:</strong> RobOS signs in to Google through
        <a href="https://rclone.org/" target="_blank" rel="noopener">rclone</a>'s public, open-source Google client, so Google shows that app's name.
        The sign-in goes straight from Google to RobOS on this computer: rclone's developers don't get your password, tokens or files.
        To see your own app name there (for example “RobOS”), and to get your own Google Drive quota, sign in with your own Google client below.</p>
      <details id="cloud-google-own-client" style="margin-top:8px;">
        <summary style="cursor:pointer;">Use my own Google OAuth client</summary>
        <ol style="margin:8px 0;padding-left:20px;color:var(--muted);">
          <li>In <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>, create a project and enable the Google Drive API (and the Calendar and People APIs if you use them).</li>
          <li>Under Google Auth Platform → Branding, set the app name to “RobOS”. Under Audience, choose External and add your Google account as a test user.</li>
          <li>Under Clients, create an OAuth client of type <strong>Desktop app</strong>. Copy its client ID and secret here.</li>
        </ol>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          <input id="cloud-google-client-id" class="text-input" placeholder="Client ID (…apps.googleusercontent.com)" autocomplete="off" spellcheck="false" style="flex:2 1 260px;">
          <input id="cloud-google-client-secret" class="text-input" type="password" placeholder="Client secret" autocomplete="off" spellcheck="false" style="flex:1 1 160px;">
          <button type="button" class="btn" id="btn-cloud-google-own-client">Sign in with my client</button>
          <button type="button" class="btn" id="btn-cloud-google-builtin-client" style="display:none;">Go back to the built-in client</button>
        </div>
        <p style="margin:8px 0 0;color:var(--muted);">Google shows “Google hasn't verified this app” for a client in Testing mode: choose Continue. In Testing mode Google signs you out after 7 days; publish the app in the console to stop that.
          If Config Sync uses this account, sign in with the same client on each computer.</p>
      </details>
    </div>`;
}

/** The Google account the sign-in buttons act on: the default one, else the first. */
function defaultGoogleAccount(state) {
  const google = (state?.accounts || []).filter(a => a.provider === 'google');
  return google.find(a => a.isDefault) || google[0] || null;
}

function renderCloudAccountsSection(state) {
  const listWrap = document.getElementById('cloud-accounts-list-wrap');
  if (!listWrap) return;
  const accounts = state.accounts || [];
  const builtinClientBtn = document.getElementById('btn-cloud-google-builtin-client');
  if (builtinClientBtn) builtinClientBtn.style.display = defaultGoogleAccount(state)?.oauthClient?.custom ? '' : 'none';
  if (!accounts.length) {
    listWrap.innerHTML = `<div style="padding:10px 12px;border:1px solid #29323e;border-radius:6px;color:var(--muted);font-size:13px;margin-bottom:8px;">No cloud accounts connected yet. Sign in with Google or open RobOS Cloud Accounts.</div>`;
    return;
  }

  listWrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">` +
    accounts.map(acc => {
      const suiteBadges = [];
      if (acc.suites?.drive?.enabled) suiteBadges.push('Drive');
      if (acc.suites?.calendar?.enabled) suiteBadges.push('Calendar (CalDAV)');
      if (acc.suites?.contacts?.enabled) suiteBadges.push('Contacts (CardDAV)');
      if (acc.suites?.mail?.enabled) suiteBadges.push('Gmail (IMAP/SMTP)');
      return `
        <div class="cloud-account-row" data-cloud-id="${esc(acc.id)}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border:1px solid ${acc.isDefault ? '#2e5964' : '#29323e'};background:${acc.isDefault ? '#112229' : '#0d1117'};border-radius:6px;">
          <div>
            <div style="font-weight:600;font-size:13.5px;">
              ${esc(acc.label)}
              <span style="font-size:11px;padding:2px 7px;border-radius:10px;background:#1f2937;color:#55d6e5;margin-left:6px;">${esc(acc.shortProviderName || acc.provider)}</span>
              ${acc.loggedIn ? `<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:#153626;color:#94e6b5;margin-left:4px;">Connected</span>` : `<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:#3b1d1d;color:#f87171;margin-left:4px;">Login Required</span>`}
              ${acc.thunderbirdConfigured ? `<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:#1e293b;color:#38bdf8;margin-left:4px;">Thunderbird Synced</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px;">
              Account: <code>${esc(acc.email || acc.user)}</code> · Active Suites: <strong>${esc(suiteBadges.join(', ') || 'Drive')}</strong>
              ${acc.oauthClient ? ` · Google client: <span data-cloud-client="${esc(acc.id)}">${acc.oauthClient.custom ? 'your own' : `built-in (Google shows it as “${esc(acc.oauthClient.appName)}”)`}</span>` : ''}
            </div>
          </div>
          <div class="cloud-account-actions" style="display:flex;gap:6px;flex:none;">
            ${acc.provider === 'google' ? `<button type="button" class="btn" data-cloud-tb="${esc(acc.id)}">Sync to Thunderbird</button>` : ''}
            <button type="button" class="btn" data-cloud-verify="${esc(acc.id)}">Verify</button>
            ${acc.loggedIn ? `<button type="button" class="btn" data-cloud-signout="${esc(acc.id)}">Sign out</button>` : ''}
            <button type="button" class="btn" data-cloud-remove="${esc(acc.id)}">Remove</button>
          </div>
          <div class="cloud-account-confirm" data-cloud-confirm="${esc(acc.id)}" style="display:none;align-items:center;gap:6px;flex:none;">
            <span style="font-size:12px;color:#f87171;">Remove ${esc(acc.email || acc.label)}${acc.linkedDataSourceIds?.length ? ' and its Data Sources connection' : ''}?</span>
            <button type="button" class="btn" data-cloud-remove-confirm="${esc(acc.id)}" style="border-color:#7f1d1d;color:#fca5a5;">Remove</button>
            <button type="button" class="btn" data-cloud-remove-cancel="${esc(acc.id)}">Cancel</button>
          </div>
        </div>
      `;
    }).join('') +
    `</div>`;

  listWrap.querySelectorAll('[data-cloud-verify]').forEach(btn => {
    btn.onclick = async () => {
      const statusEl = document.getElementById('cloud-accounts-status');
      btn.disabled = true;
      btn.textContent = 'Verifying…';
      if (statusEl) statusEl.textContent = 'Verifying cloud account token & endpoints…';
      const res = await window.api.verifyCloudAccount(btn.dataset.cloudVerify);
      btn.disabled = false;
      btn.textContent = 'Verify';
      if (statusEl) {
        statusEl.textContent = res.ok
          ? `✓ Verified ${res.email || 'account'}: ${res.checks?.drive?.detail || 'Connected'}`
          : `Verification failed: ${res.error || 'Not authenticated'}`;
      }
      const fresh = await window.api.cloudAccounts();
      if (fresh.ok) renderCloudAccountsSection(fresh);
    };
  });

  listWrap.querySelectorAll('[data-cloud-tb]').forEach(btn => {
    btn.onclick = async () => {
      const statusEl = document.getElementById('cloud-accounts-status');
      btn.disabled = true;
      btn.textContent = 'Configuring…';
      const res = await window.api.configureThunderbird({
        accountId: btn.dataset.cloudTb,
        enableCalendar: true,
        enableContacts: true,
      });
      btn.disabled = false;
      btn.textContent = 'Sync to Thunderbird';
      if (statusEl) {
        statusEl.textContent = res.ok
          ? `✓ Configured Thunderbird Calendar (CalDAV) & Contacts (CardDAV) for ${res.email} (${res.primaryProfilePath}).`
          : `Error: ${res.error}`;
      }
      const fresh = await window.api.cloudAccounts();
      if (fresh.ok) renderCloudAccountsSection(fresh);
    };
  });
  // Signing out keeps the account; signing in again with Google reconnects it.
  listWrap.querySelectorAll('[data-cloud-signout]').forEach(btn => {
    btn.onclick = async () => {
      const statusEl = document.getElementById('cloud-accounts-status');
      const id = btn.dataset.cloudSignout;
      const acc = accounts.find(a => a.id === id);
      btn.disabled = true;
      btn.textContent = 'Signing out…';
      const res = await window.api.signOutCloudAccount(id);
      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = 'Sign out';
        if (statusEl) statusEl.textContent = `Could not sign out: ${res.error}`;
        return;
      }
      renderCloudAccountsSection(res);
      if (statusEl) statusEl.textContent = `✓ Signed out ${acc?.email || acc?.label || id}. Sign in again to reconnect it.`;
    };
  });
  // Removing asks first: the row's actions swap for an inline "Remove …? Remove / Cancel".
  const showRemoveConfirm = (id, show) => {
    const row = [...listWrap.querySelectorAll('.cloud-account-row')].find(r => r.dataset.cloudId === id);
    if (!row) return;
    row.querySelector('[data-cloud-confirm]').style.display = show ? 'flex' : 'none';
    row.querySelector('.cloud-account-actions').style.display = show ? 'none' : 'flex';
  };
  listWrap.querySelectorAll('[data-cloud-remove]').forEach(btn => {
    btn.onclick = () => showRemoveConfirm(btn.dataset.cloudRemove, true);
  });
  listWrap.querySelectorAll('[data-cloud-remove-cancel]').forEach(btn => {
    btn.onclick = () => showRemoveConfirm(btn.dataset.cloudRemoveCancel, false);
  });
  listWrap.querySelectorAll('[data-cloud-remove-confirm]').forEach(btn => {
    btn.onclick = async () => {
      const statusEl = document.getElementById('cloud-accounts-status');
      const id = btn.dataset.cloudRemoveConfirm;
      const acc = accounts.find(a => a.id === id);
      btn.disabled = true;
      btn.textContent = 'Removing…';
      const res = await window.api.deleteCloudAccount(id);
      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = 'Remove';
        if (statusEl) statusEl.textContent = `Could not remove account: ${res.error}`;
        return;
      }
      renderCloudAccountsSection(res);
      if (statusEl) statusEl.textContent = `✓ Removed ${acc?.email || acc?.label || id}.`;
    };
  });
}

async function loadCloudAccounts() {
  const statusEl = document.getElementById('cloud-accounts-status');
  if (!statusEl || !window.api.cloudAccounts) return;
  try {
    const res = await window.api.cloudAccounts();
    if (!res.ok) throw new Error(res.error || 'Could not load cloud accounts');
    renderCloudAccountsSection(res);
    statusEl.textContent = `${res.accounts?.length || 0} cloud account(s) tracked and synced with Data Sources & Thunderbird.`;
  } catch (err) {
    statusEl.textContent = err.message;
  }

  const googleSignIn = async (params, button) => {
    if (button) button.disabled = true;
    statusEl.textContent = 'Opening Google OAuth 2.0 sign-in in your browser…';
    try {
      const res = await window.api.startGoogleOAuth(params);
      if (res.ok) {
        renderCloudAccountsSection(res);
        statusEl.textContent = `✓ Signed in as ${res.email}.`;
      } else {
        statusEl.textContent = `Sign-in error: ${res.error}`;
      }
      return res;
    } finally {
      if (button) button.disabled = false;
    }
  };

  const signInBtn = document.getElementById('btn-cloud-google-signin');
  if (signInBtn) signInBtn.onclick = () => googleSignIn({}, signInBtn);

  const ownClientBtn = document.getElementById('btn-cloud-google-own-client');
  if (ownClientBtn) {
    ownClientBtn.onclick = async () => {
      const idEl = document.getElementById('cloud-google-client-id');
      const secretEl = document.getElementById('cloud-google-client-secret');
      const clientId = idEl.value.trim();
      const clientSecret = secretEl.value.trim();
      if (!/\.apps\.googleusercontent\.com$/.test(clientId)) {
        statusEl.textContent = 'Paste the client ID of a Desktop app OAuth client: it ends in .apps.googleusercontent.com.';
        return idEl.focus();
      }
      if (!clientSecret) {
        statusEl.textContent = 'Paste the client secret that goes with this client ID.';
        return secretEl.focus();
      }
      const res = await googleSignIn({ clientId, clientSecret }, ownClientBtn);
      if (res?.ok) secretEl.value = '';
    };
  }

  const builtinClientBtn = document.getElementById('btn-cloud-google-builtin-client');
  if (builtinClientBtn) {
    builtinClientBtn.onclick = async () => {
      const current = await window.api.cloudAccounts();
      const acc = defaultGoogleAccount(current);
      googleSignIn({ accountId: acc?.id, useBuiltInClient: true }, builtinClientBtn);
    };
  }

  const openCaBtn = document.getElementById('btn-open-cloud-accounts-app');
  if (openCaBtn) {
    openCaBtn.onclick = () => window.api.launchRobosApp('cloud-accounts');
  }

  const openCalBtn = document.getElementById('btn-open-google-calendar-app');
  if (openCalBtn) {
    openCalBtn.onclick = () => window.api.launchRobosApp('google-calendar');
  }
}

/* ── Audio Devices (PipeWire + ALSA + Focusrite Pro-Audio) ────────────── */
function audioDevicesSection() {
  return `<section class="section" id="section-audio_devices">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
      <h2 class="section-title" style="margin-bottom:0;">Audio Devices</h2>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn" id="btn-audio-rescan">Rescan USB &amp; Audio</button>
        <button type="button" class="btn btn-primary" id="btn-open-daw-studio">Open RobOS DAW Studio</button>
      </div>
    </div>
    <p class="section-description">Connect USB pro-audio interfaces (Focusrite Scarlett / Clarett+, USB Audio Class 2.0) and configure system-wide PipeWire low-latency routing on Linux — no Windows ASIO driver needed.</p>
    <div id="audio-devices-body" style="margin-top:14px;">
      <p class="section-status">Scanning PipeWire &amp; ALSA audio interfaces…</p>
    </div>
    <p class="section-status" id="audio-devices-status" role="status" aria-live="polite"></p>
  </section>`;
}

function renderAudioDevicesBody(snap) {
  const body = document.getElementById('audio-devices-body');
  if (!body) return;
  if (!snap || !snap.ok) {
    body.innerHTML = `<p class="section-status">${esc(snap?.error || 'Audio device inspection unavailable.')}</p>`;
    return;
  }

  const fr = snap.focusrite || { connected: false };
  const clk = snap.clock || { effectiveRate: 48000, effectiveQuantum: 1024, latencyMs: 21.33, forceQuantum: 0 };
  const inputs = snap.inputs || [];
  const outputs = snap.outputs || [];
  const selectedInputName = snap.activeInput?.name || '';
  const selectedOutputName = snap.activeOutput?.name || '';

  const interfaceBanner = fr.connected ? `
    <div class="ad-card ad-card-connected" id="focusrite-interface-card">
      <div class="ad-card-head">
        <div>
          <span class="ad-badge ad-badge-ok">● CONNECTED</span>
          <strong class="ad-title">${esc(fr.model)}</strong>
        </div>
        <span class="ad-mono">USB ${esc(fr.usbId || '')} · ALSA ${esc(fr.alsaDevice || 'USB')}</span>
      </div>
      <div class="ad-meta-grid">
        <div><span class="ad-k">Driver</span><span class="ad-v">Linux snd_usb_audio + PipeWire</span></div>
        <div><span class="ad-k">Channels</span><span class="ad-v">${fr.maxCaptureChannels} In / ${fr.maxPlaybackChannels} Out (${fr.bits}-bit ${esc(fr.format || 'S32_LE')})</span></div>
        <div><span class="ad-k">Transport</span><span class="ad-v">${esc(fr.usbSpeed || 'USB High-Speed')} · ${esc(fr.syncMode || 'Async')}</span></div>
        <div><span class="ad-k">Clock / FW</span><span class="ad-v">${esc(fr.mixer?.clockSource?.value || 'Internal')} Lock · FW ${esc(fr.mixer?.firmwareVersion || 'OK')}${fr.serial ? ' · SN ' + esc(fr.serial) : ''}</span></div>
      </div>
    </div>
  ` : `
    <div class="ad-card" id="focusrite-interface-card">
      <div class="ad-card-head">
        <div><span class="ad-badge">USB PRO-AUDIO</span> <strong class="ad-title">No Focusrite USB Interface Detected</strong></div>
      </div>
      <p class="field-description">${esc(fr.hint || 'Plug in a Focusrite or USB Audio Class 2.0 interface and click Rescan.')}</p>
    </div>
  `;

  const inputOpts = inputs.map(n =>
    `<option value="${esc(n.name)}" data-node-id="${n.id}"${n.name === selectedInputName ? ' selected' : ''}>${n.isDefault ? '★ ' : ''}${esc(n.description)}</option>`
  ).join('');
  const outputOpts = outputs.map(n =>
    `<option value="${esc(n.name)}" data-node-id="${n.id}"${n.name === selectedOutputName ? ' selected' : ''}>${n.isDefault ? '★ ' : ''}${esc(n.description)}</option>`
  ).join('');

  const rates = [44100, 48000, 88200, 96000, 176400, 192000];
  const rateOpts = rates.map(r =>
    `<option value="${r}"${clk.effectiveRate === r ? ' selected' : ''}>${(r / 1000).toFixed(r % 1000 ? 1 : 0)} kHz</option>`
  ).join('');

  const quantums = [
    { v: 0, label: `Auto (${clk.quantum} smp)` },
    { v: 64, label: `64 samples (${((64 / clk.effectiveRate) * 1000).toFixed(2)} ms — Ultra Low)` },
    { v: 128, label: `128 samples (${((128 / clk.effectiveRate) * 1000).toFixed(2)} ms — Studio Recording)` },
    { v: 256, label: `256 samples (${((256 / clk.effectiveRate) * 1000).toFixed(2)} ms — Balanced)` },
    { v: 512, label: `512 samples (${((512 / clk.effectiveRate) * 1000).toFixed(2)} ms — Mixing)` },
    { v: 1024, label: `1024 samples (${((1024 / clk.effectiveRate) * 1000).toFixed(2)} ms — Relaxed)` },
  ];
  const quantumOpts = quantums.map(q =>
    `<option value="${q.v}"${clk.forceQuantum === q.v ? ' selected' : ''}>${esc(q.label)}</option>`
  ).join('');

  let preampHtml = '';
  if (fr.connected && fr.mixer && (fr.mixer.phantomBanks?.length || fr.mixer.preamps?.length)) {
    const banks = (fr.mixer.phantomBanks || []).map(b =>
      `<button type="button" class="btn ad-hw-btn ${b.enabled ? 'ad-hw-48v-on' : ''}" data-hw-card="${fr.alsaCardIndex}" data-hw-control="${esc(b.control)}" data-hw-val="${!b.enabled}">${esc(b.label)}: ${b.enabled ? 'ON' : 'OFF'}</button>`
    ).join('');
    const strips = (fr.mixer.preamps || []).map(p => `
      <div class="ad-preamp">
        <div class="ad-preamp-ch">${esc(p.label)}</div>
        ${p.level !== null ? `<button type="button" class="btn ad-mini-btn ${p.level === 'Inst' ? 'ad-hw-active' : ''}" data-hw-card="${fr.alsaCardIndex}" data-hw-control="Line In ${p.channel} Level" data-hw-enum="${p.level === 'Inst' ? 'Line' : 'Inst'}">${esc(p.level)}</button>` : ''}
        ${p.air !== null ? `<button type="button" class="btn ad-mini-btn ${p.air ? 'ad-hw-air' : ''}" data-hw-card="${fr.alsaCardIndex}" data-hw-control="Line In ${p.channel} Air" data-hw-val="${!p.air}">Air</button>` : ''}
        ${p.pad !== null ? `<button type="button" class="btn ad-mini-btn ${p.pad ? 'ad-hw-active' : ''}" data-hw-card="${fr.alsaCardIndex}" data-hw-control="Line In ${p.channel} Pad" data-hw-val="${!p.pad}">Pad</button>` : ''}
      </div>
    `).join('');
    preampHtml = `
      <div class="ad-subpanel">
        <div class="ad-subhead">
          <strong>Focusrite Hardware Preamp Controls (ALSA snd_usb_audio)</strong>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${banks}</div>
        </div>
        <div class="ad-preamp-grid">${strips}</div>
      </div>
    `;
  }

  body.innerHTML = `
    ${interfaceBanner}
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ad-input-select">Input Device (Capture)</label>
        <p class="field-description">Select microphone, instrument (Hi-Z), line, S/PDIF, or ADAT input channel.</p>
      </div>
      <div class="field-input" style="gap:8px;">
        <select class="select-input" id="ad-input-select">${inputOpts}</select>
        <button type="button" class="btn" id="btn-ad-test-input" title="Capture 1.5s sample and measure dBFS">Test In</button>
      </div>
    </div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ad-output-select">Output Device (Playback / Monitor)</label>
        <p class="field-description">Route studio monitor outs or front-panel headphones.</p>
      </div>
      <div class="field-input" style="gap:8px;">
        <select class="select-input" id="ad-output-select">${outputOpts}</select>
        <button type="button" class="btn" id="btn-ad-play-tone" title="Play studio A-major chime">Test Out</button>
      </div>
    </div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ad-rate-select">Sample Rate</label>
        <p class="field-description">Active PipeWire graph clock: ${clk.effectiveRate} Hz (${clk.latencyMs} ms block latency).</p>
      </div>
      <div class="field-input"><select class="select-input" id="ad-rate-select">${rateOpts}</select></div>
    </div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ad-quantum-select">Buffer Size (PipeWire Quantum)</label>
        <p class="field-description">Replaces Windows ASIO buffer size. Use 64–128 samples for live guitar/vocal monitoring.</p>
      </div>
      <div class="field-input"><select class="select-input" id="ad-quantum-select">${quantumOpts}</select></div>
    </div>
    <div class="section-actions">
      <button type="button" class="btn btn-primary" id="btn-ad-apply">Apply Audio Device Settings</button>
    </div>
    ${preampHtml}
  `;

  const statusEl = document.getElementById('audio-devices-status');
  document.getElementById('btn-ad-apply')?.addEventListener('click', async () => {
    const inSel = document.getElementById('ad-input-select');
    const outSel = document.getElementById('ad-output-select');
    const inOpt = inSel?.selectedOptions?.[0];
    const outOpt = outSel?.selectedOptions?.[0];
    statusEl.textContent = 'Applying PipeWire & device routing…';
    const res = await window.api.saveAudioEngine({
      sampleRate: Number(document.getElementById('ad-rate-select').value),
      quantum: Number(document.getElementById('ad-quantum-select').value),
      defaultInputId: inOpt ? Number(inOpt.dataset.nodeId) : undefined,
      defaultOutputId: outOpt ? Number(outOpt.dataset.nodeId) : undefined,
      preferredInputNodeName: inSel?.value || '',
      preferredOutputNodeName: outSel?.value || '',
    });
    if (res?.ok) {
      renderAudioDevicesBody(res.snapshot);
      statusEl.textContent = `✓ Active: ${res.snapshot.clock.effectiveRate} Hz · ${res.snapshot.clock.effectiveQuantum} samples (${res.snapshot.clock.latencyMs} ms latency).`;
    } else {
      statusEl.textContent = `Error: ${res?.error || 'Could not apply audio settings'}`;
    }
  });

  document.getElementById('btn-ad-test-input')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById('ad-input-select')?.value || '';
    btn.disabled = true;
    statusEl.textContent = 'Listening on selected input for 1.5s…';
    const res = await window.api.testAudioInput({ targetNodeName: target, durationMs: 1500 });
    btn.disabled = false;
    if (res?.ok) {
      statusEl.textContent = `✓ Input signal captured (${res.samples} frames @ 48kHz) — Peak: ${res.peakDb} dBFS · RMS: ${res.rmsDb} dBFS`;
    } else {
      statusEl.textContent = `Input check failed: ${res?.error || 'Unknown error'}`;
    }
  });

  document.getElementById('btn-ad-play-tone')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById('ad-output-select')?.value || '';
    btn.disabled = true;
    statusEl.textContent = 'Playing studio chime on selected output…';
    const res = await window.api.playAudioTestTone({ targetNodeName: target });
    btn.disabled = false;
    statusEl.textContent = res?.ok ? '✓ Studio test chime played.' : `Playback error: ${res?.error || 'Failed'}`;
  });

  body.querySelectorAll('[data-hw-control]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cardIndex = Number(btn.dataset.hwCard);
      const control = btn.dataset.hwControl;
      const value = btn.dataset.hwEnum !== undefined ? btn.dataset.hwEnum : (btn.dataset.hwVal === 'true');
      btn.disabled = true;
      const res = await window.api.setFocusriteControl({ cardIndex, control, value });
      if (res?.ok) {
        renderAudioDevicesBody(res.snapshot);
        statusEl.textContent = `✓ Updated hardware control "${control}" → ${value}`;
      } else {
        btn.disabled = false;
        statusEl.textContent = `Hardware control error: ${res?.error || 'Failed'}`;
      }
    });
  });
}

async function loadAudioDevices() {
  if (!window.api?.audioDevicesSnapshot) return;
  const refresh = async () => {
    const snap = await window.api.audioDevicesSnapshot();
    renderAudioDevicesBody(snap);
  };
  document.getElementById('btn-audio-rescan')?.addEventListener('click', refresh);
  document.getElementById('btn-open-daw-studio')?.addEventListener('click', () => window.api.launchRobosApp('daw-studio'));
  await refresh();
}

/* ── RobOS Media Services (Movies, TV Shows, Music, Books & MCP) ──────── */
function mediaServicesSection() {
  return `<section class="section" id="section-media_services">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
      <h2 class="section-title" style="margin-bottom:0;">RobOS Media Services</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn" id="btn-ms-discover">Discover on LAN</button>
        <button type="button" class="btn" id="btn-ms-sync-now">Sync Players &amp; MCP Now</button>
        <button type="button" class="btn btn-primary" id="btn-open-media-server-app">Open Media Server Console</button>
      </div>
    </div>
    <p class="section-description">Connect to a <strong>RobOS Media Server</strong> (<code>:19234</code>) serving Movies, TV Shows, Music, Books, Courses, and MCP. RobOS Preferences backs up this connection in Config Sync and automatically keeps <strong>RobOS Movie Player</strong>, <strong>RobOS Audio Player</strong>, and <strong>MCP Manager</strong> populated on every RobOS machine — no local library creation required.</p>
    <div style="margin:10px 0 14px;">
      <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
        <input type="checkbox" id="ms-auto-sync-players" checked />
        <span><strong>Automatically keep Movie Player, Audio Player, Books &amp; MCP updated</strong> when new media is added on the server</span>
      </label>
    </div>
    <div id="ms-servers-list-wrap"></div>
    <div id="ms-discovered-wrap" style="margin-bottom:10px;"></div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ms-url-input">Media Server URL or IP</label>
        <p class="field-description">Example: <code>http://192.168.1.25:19234</code> (MCP is auto-registered at <code>/mcp</code>).</p>
      </div>
      <div class="field-input"><input type="text" class="text-input" id="ms-url-input" placeholder="http://192.168.1.25:19234" /></div>
    </div>
    <div class="field-row">
      <div class="field-copy">
        <label class="field-label" for="ms-name-input">Friendly Label (optional)</label>
        <p class="field-description">Shown as the “RobOS Media Service” source in Movie Player and Audio Player.</p>
      </div>
      <div class="field-input"><input type="text" class="text-input" id="ms-name-input" placeholder="RobOS Home Media Server" /></div>
    </div>
    <div class="section-actions">
      <button type="button" class="btn btn-primary" id="btn-ms-save">Connect &amp; Sync Media Service</button>
      <button type="button" class="btn" id="btn-ms-test">Test Server &amp; MCP</button>
    </div>
    <p class="section-status" id="ms-status" role="status" aria-live="polite">Loading RobOS Media Services…</p>
  </section>`;
}

function renderMediaServicesList(state) {
  const wrap = document.getElementById('ms-servers-list-wrap');
  const autoBox = document.getElementById('ms-auto-sync-players');
  if (!wrap) return;
  if (autoBox && state && state.autoSyncPlayers !== undefined) {
    autoBox.checked = Boolean(state.autoSyncPlayers);
  }
  const servers = state?.servers || [];
  if (!servers.length) {
    wrap.innerHTML = `<div style="padding:10px 12px;border:1px solid #29323e;border-radius:6px;color:var(--muted);font-size:13px;margin-bottom:12px;">No RobOS Media Service connected yet. Click <strong>Discover on LAN</strong> or enter your RobOS Server address (e.g. <code>http://192.168.1.25:19234</code>) below.</div>`;
    return;
  }
  wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">` +
    servers.map(s => {
      const c = s.cachedCounts || {};
      const countsSummary = s.online
        ? `${(c.movies || 0).toLocaleString()} Movies · ${(c.shows || 0).toLocaleString()} Shows (${(c.episodes || 0).toLocaleString()} Eps) · ${(c.musicTracks || 0).toLocaleString()} Songs · ${(c.books || 0).toLocaleString()} Books`
        : (s.lastStatus || 'Offline or unreachable');
      return `
        <div class="ms-server-row" data-ms-id="${esc(s.id)}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid ${s.online ? '#2e5964' : '#29323e'};background:${s.online ? '#112229' : '#0d1117'};border-radius:6px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;font-size:13.5px;">
              ${esc(s.name || s.url)}
              ${s.online
                ? `<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:#153626;color:#94e6b5;margin-left:6px;">● Online</span>`
                : `<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:#3b1d1d;color:#f87171;margin-left:6px;">Offline</span>`}
              <span style="font-size:11px;padding:2px 7px;border-radius:10px;background:#1f2937;color:#55d6e5;margin-left:4px;">MCP Active</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px;">
              Endpoint: <code>${esc(s.url)}</code> · MCP: <code>${esc(s.mcpUrl || (s.url + '/mcp'))}</code>
            </div>
            <div style="font-size:12px;color:#cbd5e1;margin-top:3px;">${esc(countsSummary)}</div>
          </div>
          <div style="display:flex;gap:6px;flex:none;">
            <button type="button" class="btn" data-ms-open-web="${esc(s.url)}">Open Web UI</button>
            <button type="button" class="btn" data-ms-delete="${esc(s.id)}">Disconnect</button>
          </div>
        </div>
      `;
    }).join('') +
    `</div>`;

  wrap.querySelectorAll('[data-ms-open-web]').forEach(btn => {
    btn.onclick = () => window.api.openExternalUrl(btn.dataset.msOpenWeb);
  });
  wrap.querySelectorAll('[data-ms-delete]').forEach(btn => {
    btn.onclick = async () => {
      const statusEl = document.getElementById('ms-status');
      btn.disabled = true;
      const res = await window.api.deleteMediaService(btn.dataset.msDelete);
      if (res?.ok) {
        renderMediaServicesList(res);
        if (statusEl) statusEl.textContent = 'Disconnected RobOS Media Service and removed its streamed catalog.';
      } else {
        btn.disabled = false;
        if (statusEl) statusEl.textContent = `Error: ${res?.error || 'Failed'}`;
      }
    };
  });
}

async function loadMediaServices() {
  const statusEl = document.getElementById('ms-status');
  if (!statusEl || !window.api?.mediaServices) return;

  try {
    const state = await window.api.mediaServices();
    renderMediaServicesList(state);
    statusEl.textContent = state.servers?.length
      ? `${state.servers.length} RobOS Media Service(s) configured and synced with Movie Player, Audio Player & MCP.`
      : 'Connect a RobOS Media Server to automatically populate Movie Player, Audio Player, and MCP across your machines.';
  } catch (err) {
    statusEl.textContent = err.message;
  }

  document.getElementById('ms-auto-sync-players')?.addEventListener('change', async (e) => {
    const res = await window.api.setMediaServicesAutoSync(e.target.checked);
    if (res?.ok) {
      statusEl.textContent = e.target.checked
        ? '✓ Auto-sync enabled: Movie Player, Audio Player, Books & MCP stay updated automatically.'
        : 'Auto-sync paused.';
    }
  });

  document.getElementById('btn-ms-save')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const url = document.getElementById('ms-url-input').value.trim();
    const name = document.getElementById('ms-name-input').value.trim();
    if (!url) { statusEl.textContent = 'Enter a RobOS Media Server URL or IP address first.'; return; }
    btn.disabled = true;
    statusEl.textContent = 'Connecting to RobOS Media Server and syncing Movie Player, Audio Player & MCP…';
    const res = await window.api.saveMediaService({ url, name: name || undefined });
    btn.disabled = false;
    if (!res?.ok) {
      statusEl.textContent = `Connection error: ${res?.error || 'Failed'}`;
      return;
    }
    document.getElementById('ms-url-input').value = '';
    document.getElementById('ms-name-input').value = '';
    renderMediaServicesList(res);
    statusEl.textContent = `✓ Connected ${res.server?.name || url}! Movie Player, Audio Player, Books, and MCP are now synced.`;
  });

  document.getElementById('btn-ms-test')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const url = document.getElementById('ms-url-input').value.trim();
    if (!url) { statusEl.textContent = 'Enter a URL or IP to test.'; return; }
    btn.disabled = true;
    statusEl.textContent = 'Probing RobOS Media Server & MCP endpoint…';
    const res = await window.api.probeMediaService(url);
    btn.disabled = false;
    if (res?.ok) {
      const c = res.counts || {};
      statusEl.textContent = `✓ Reachable: ${res.serverName} (${c.movies || 0} movies, ${c.shows || 0} shows, ${c.musicTracks || 0} songs, ${c.books || 0} books · MCP active at ${res.mcpUrl}).`;
    } else {
      statusEl.textContent = `Could not reach Media Server: ${res?.error || 'Unreachable'}`;
    }
  });

  document.getElementById('btn-ms-discover')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const discWrap = document.getElementById('ms-discovered-wrap');
    btn.disabled = true;
    statusEl.textContent = 'Scanning local network for RobOS Media Servers (:19234)…';
    const res = await window.api.discoverMediaServices();
    btn.disabled = false;
    const found = res?.servers || [];
    if (!found.length) {
      discWrap.innerHTML = '';
      statusEl.textContent = 'No RobOS Media Servers discovered automatically on LAN. Enter an IP/URL below.';
      return;
    }
    statusEl.textContent = `Discovered ${found.length} RobOS Media Server(s) on LAN! Click Connect to add.`;
    discWrap.innerHTML = found.map(f => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px dashed #00bcd4;border-radius:6px;margin-bottom:6px;background:rgba(0,188,212,0.06);">
        <div style="font-size:12.5px;">
          <strong>${esc(f.serverName)}</strong> — <code>${esc(f.url)}</code>
          <span style="color:var(--muted);margin-left:6px;">(${f.counts?.movies || 0} movies · ${f.counts?.shows || 0} shows · ${f.counts?.musicTracks || 0} songs · ${f.counts?.books || 0} books)</span>
        </div>
        <button type="button" class="btn btn-primary" data-ms-connect-url="${esc(f.url)}" data-ms-connect-name="${esc(f.serverName)}">Connect</button>
      </div>
    `).join('');
    discWrap.querySelectorAll('[data-ms-connect-url]').forEach(b => {
      b.onclick = async () => {
        b.disabled = true;
        statusEl.textContent = `Connecting ${b.dataset.msConnectName}…`;
        const saved = await window.api.saveMediaService({ url: b.dataset.msConnectUrl, name: b.dataset.msConnectName });
        discWrap.innerHTML = '';
        if (saved?.ok) {
          renderMediaServicesList(saved);
          statusEl.textContent = `✓ Connected ${b.dataset.msConnectName} and populated Movie Player, Audio Player & MCP!`;
        }
      };
    });
  });

  document.getElementById('btn-ms-sync-now')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    statusEl.textContent = 'Refreshing catalogs from RobOS Media Server(s)…';
    const res = await window.api.syncMediaServicesNow();
    btn.disabled = false;
    if (res?.ok) {
      renderMediaServicesList(res);
      statusEl.textContent = '✓ Synced Movie Player, Audio Player, Books & MCP catalogs.';
    } else {
      statusEl.textContent = `Sync error: ${res?.error || 'Failed'}`;
    }
  });

  document.getElementById('btn-open-media-server-app')?.addEventListener('click', () => {
    window.api.launchRobosApp('media-server');
  });
}
