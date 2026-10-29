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
  await Promise.all([loadConfigSync(), loadCloudAccounts(), loadGithubAccounts(), loadOvpnAccounts(), loadAiApiStatus()]);
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
  </section>`;
}

function renderCloudAccountsSection(state) {
  const listWrap = document.getElementById('cloud-accounts-list-wrap');
  if (!listWrap) return;
  const accounts = state.accounts || [];
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
            </div>
          </div>
          <div style="display:flex;gap:6px;flex:none;">
            ${acc.provider === 'google' ? `<button type="button" class="btn" data-cloud-tb="${esc(acc.id)}">Sync to Thunderbird</button>` : ''}
            <button type="button" class="btn" data-cloud-verify="${esc(acc.id)}">Verify</button>
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

  const signInBtn = document.getElementById('btn-cloud-google-signin');
  if (signInBtn) {
    signInBtn.onclick = async () => {
      statusEl.textContent = 'Opening Google OAuth 2.0 sign-in in your browser…';
      const res = await window.api.startGoogleOAuth({});
      if (res.ok) {
        renderCloudAccountsSection(res);
        statusEl.textContent = `✓ Signed in as ${res.email}.`;
      } else {
        statusEl.textContent = `Sign-in error: ${res.error}`;
      }
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
