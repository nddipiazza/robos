'use strict';

let _state = { providers: [], accounts: [], defaultAccountId: null, thunderbird: null };
let _selectedId = null;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showStatus(msg) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.remove('hidden');
}

async function refreshAccounts() {
  const res = await window.robos.listAccounts();
  if (!res.ok) {
    showStatus(`Error loading cloud accounts: ${res.error}`);
    return;
  }
  _state = res;
  if (!_selectedId || !_state.accounts.some(a => a.id === _selectedId)) {
    _selectedId = _state.defaultAccountId || _state.accounts[0]?.id || null;
  }
  renderSidebar();
  renderDetail();
}

function renderSidebar() {
  const el = document.getElementById('accounts-sidebar-list');
  if (!el) return;
  if (!_state.accounts.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:8px 0;">No accounts connected yet.</div>`;
    return;
  }

  el.innerHTML = _state.accounts.map(acc => `
    <div class="account-item ${acc.id === _selectedId ? 'active' : ''}" data-account-select="${esc(acc.id)}" id="account-item-${esc(acc.id)}">
      <div class="account-item-title">
        <span>${esc(acc.label)}</span>
        <span class="badge ${acc.loggedIn ? 'badge-ok' : 'badge-warn'}">${acc.loggedIn ? 'Connected' : 'Login Required'}</span>
      </div>
      <div class="account-item-sub">
        ${esc(acc.email || acc.user || acc.providerName)}
        ${acc.isDefault ? `<span class="badge badge-cyan" style="margin-left:4px;">Default</span>` : ''}
      </div>
    </div>
  `).join('');

  el.querySelectorAll('[data-account-select]').forEach(item => {
    item.onclick = () => {
      _selectedId = item.dataset.accountSelect;
      renderSidebar();
      renderDetail();
    };
  });
}

function renderDetail() {
  const container = document.getElementById('account-detail');
  if (!container) return;

  const acc = _state.accounts.find(a => a.id === _selectedId) || _state.accounts[0];
  if (!acc) {
    container.innerHTML = `<div class="empty-state">No cloud accounts tracked yet. Click <strong>+ Sign in with Google</strong> or add an account on the left.</div>`;
    return;
  }

  const isGoogle = acc.provider === 'google';
  const suites = acc.suites || {};
  const folders = acc.linkedFolders || [];

  const suiteCardsHtml = isGoogle ? `
    <div class="suite-grid">
      <div class="suite-card ${suites.drive?.enabled ? 'enabled' : ''}">
        <div>
          <div class="suite-top">
            <span class="suite-name">📁 Google Drive</span>
            <label style="font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" class="suite-toggle" data-suite="drive" ${suites.drive?.enabled ? 'checked' : ''} /> Enabled
            </label>
          </div>
          <p class="suite-desc" style="margin-top:6px;">OAuth 2.0 REST API v3 cloud storage shared with RobOS Data Sources, Audio Player (100k-song library &amp; Cast streaming), and File Explorer.</p>
          <div class="suite-meta" style="margin-top:8px;">Scope: ${esc(suites.drive?.scope || 'https://www.googleapis.com/auth/drive')}<br/>Folders linked: ${folders.length ? esc(folders.map(f => f.label || f.id).join(', ')) : 'My Drive (root)'}</div>
        </div>
        <div class="consumers-list">
          <span class="consumer-chip">Data Sources</span>
          <span class="consumer-chip">Audio Player</span>
          <span class="consumer-chip">File Explorer</span>
        </div>
      </div>

      <div class="suite-card ${suites.calendar?.enabled ? 'enabled' : ''}">
        <div>
          <div class="suite-top">
            <span class="suite-name">📅 Google Calendar (CalDAV)</span>
            <label style="font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" class="suite-toggle" data-suite="calendar" ${suites.calendar?.enabled ? 'checked' : ''} /> Enabled
            </label>
          </div>
          <p class="suite-desc" style="margin-top:6px;">Bi-directional CalDAV &amp; REST calendar integration for Mozilla Thunderbird and RobOS Google Calendar using your logged-in Google identity.</p>
          <div class="suite-meta" style="margin-top:8px;">CalDAV: ${esc(acc.endpoints?.caldavUrl || '')}</div>
        </div>
        <div class="consumers-list">
          <span class="consumer-chip">Google Calendar App</span>
          <span class="consumer-chip">Mozilla Thunderbird</span>
          <span class="consumer-chip">Dev Central</span>
        </div>
      </div>

      <div class="suite-card ${suites.contacts?.enabled ? 'enabled' : ''}">
        <div>
          <div class="suite-top">
            <span class="suite-name">👥 Google Contacts (CardDAV)</span>
            <label style="font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" class="suite-toggle" data-suite="contacts" ${suites.contacts?.enabled ? 'checked' : ''} /> Enabled
            </label>
          </div>
          <p class="suite-desc" style="margin-top:6px;">CardDAV address book directory (<code>dirType = 102</code>) pre-configured for Thunderbird Contacts &amp; autocomplete.</p>
          <div class="suite-meta" style="margin-top:8px;">CardDAV: ${esc(acc.endpoints?.carddavUrl || '')}</div>
        </div>
        <div class="consumers-list">
          <span class="consumer-chip">Google Calendar App</span>
          <span class="consumer-chip">Mozilla Thunderbird</span>
        </div>
      </div>

      <div class="suite-card ${suites.mail?.enabled ? 'enabled' : ''}">
        <div>
          <div class="suite-top">
            <span class="suite-name">✉️ Gmail (IMAP &amp; SMTP)</span>
            <label style="font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" class="suite-toggle" data-suite="mail" ${suites.mail?.enabled ? 'checked' : ''} /> Optional
            </label>
          </div>
          <p class="suite-desc" style="margin-top:6px;">Optional OAuth2 (<code>authMethod = 10</code>) IMAP &amp; SMTP mail account provisioning inside Mozilla Thunderbird.</p>
          <div class="suite-meta" style="margin-top:8px;">IMAP: imap.gmail.com:993 · SMTP: smtp.gmail.com:465</div>
        </div>
        <div class="consumers-list">
          <span class="consumer-chip">Mozilla Thunderbird</span>
        </div>
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${esc(acc.label)}</div>
          <div class="card-subtitle">${esc(acc.providerName)} · Account ID: <code>${esc(acc.id)}</code></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${!acc.isDefault ? `<button class="btn" id="btn-detail-default">Set as Default</button>` : ''}
          <button class="btn" id="btn-detail-verify">✓ Verify Token &amp; Endpoints</button>
          ${isGoogle ? `<button class="btn btn-primary" id="btn-detail-sync-tb">⚡ Sync to Thunderbird Calendar</button>` : ''}
          <button class="btn btn-danger" id="btn-detail-delete">Remove</button>
        </div>
      </div>

      <table class="kv-table">
        <tr>
          <td>Authenticated User / Email</td>
          <td><code>${esc(acc.email || acc.user || 'Not set')}</code></td>
        </tr>
        <tr>
          <td>Authentication Status</td>
          <td>
            <span class="badge ${acc.loggedIn ? 'badge-ok' : 'badge-warn'}">${esc(acc.status)}</span>
            ${acc.hasRefreshToken ? `<span class="badge badge-cyan" style="margin-left:6px;">OAuth2 Refresh Token Stored</span>` : ''}
            ${acc.hasAccessToken ? `<span class="badge badge-cyan" style="margin-left:6px;">Bearer Token Active</span>` : ''}
          </td>
        </tr>
        <tr>
          <td>Credential Storage</td>
          <td><code>~/.config/robos/cloud-accounts.json</code> &amp; synced with <code>~/.config/robos/data-sources.json</code> (mode <code>0600</code>)</td>
        </tr>
        <tr>
          <td>Linked RobOS Data Sources</td>
          <td>${acc.linkedDataSourceIds?.length ? acc.linkedDataSourceIds.map(id => `<code>${esc(id)}</code>`).join(', ') : 'None linked yet'}</td>
        </tr>
        <tr>
          <td>Thunderbird Integration</td>
          <td>
            ${acc.thunderbirdConfigured
              ? `<span class="badge badge-ok">Configured</span> Profile: <code>${esc(acc.thunderbirdProfilePath || 'default-release')}</code>`
              : `<span class="badge badge-warn">Not synced yet</span> — click <strong>Sync to Thunderbird Calendar</strong> or open <strong>Google Calendar &amp; Thunderbird</strong>`}
          </td>
        </tr>
      </table>
    </div>

    ${isGoogle ? `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Google Suite Services Shared by This Account</div>
            <div class="card-subtitle">Toggle which Google services are active for <strong>${esc(acc.email)}</strong> across RobOS and Thunderbird</div>
          </div>
          <button class="btn" id="btn-reauth-google">Re-authenticate / Upgrade OAuth Scopes</button>
        </div>
        ${suiteCardsHtml}
      </div>
    ` : ''}
  `;

  const verifyBtn = document.getElementById('btn-detail-verify');
  if (verifyBtn) {
    verifyBtn.onclick = async () => {
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying…';
      showStatus(`Verifying ${acc.email || acc.label} against Google APIs…`);
      const res = await window.robos.verifyAccount(acc.id);
      verifyBtn.disabled = false;
      verifyBtn.textContent = '✓ Verify Token & Endpoints';
      if (res.ok) {
        showStatus(`✓ Verified ${res.email || acc.email}: ${res.checks?.drive?.detail || 'Connected'} | ${res.checks?.calendar?.detail || ''}`);
      } else {
        showStatus(`Verification warning: ${res.error || 'Check credentials'}`);
      }
      await refreshAccounts();
    };
  }

  const defaultBtn = document.getElementById('btn-detail-default');
  if (defaultBtn) {
    defaultBtn.onclick = async () => {
      const res = await window.robos.setDefaultAccount(acc.id);
      if (res.ok) {
        showStatus(`✓ Set ${acc.label} as default cloud account.`);
        await refreshAccounts();
      }
    };
  }

  const syncTbBtn = document.getElementById('btn-detail-sync-tb');
  if (syncTbBtn) {
    syncTbBtn.onclick = async () => {
      syncTbBtn.disabled = true;
      syncTbBtn.textContent = 'Configuring Thunderbird…';
      const res = await window.robos.configureThunderbird({
        accountId: acc.id,
        enableCalendar: suites.calendar?.enabled !== false,
        enableContacts: suites.contacts?.enabled !== false,
        enableMail: Boolean(suites.mail?.enabled),
      });
      syncTbBtn.disabled = false;
      syncTbBtn.textContent = '⚡ Sync to Thunderbird Calendar';
      if (res.ok) {
        showStatus(`✓ Configured Thunderbird Calendar (CalDAV) & Contacts (CardDAV) for ${res.email} in ${res.primaryProfilePath}`);
      } else {
        showStatus(`Error configuring Thunderbird: ${res.error}`);
      }
      await refreshAccounts();
    };
  }

  const deleteBtn = document.getElementById('btn-detail-delete');
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      const res = await window.robos.deleteAccount(acc.id);
      if (res.ok) {
        _selectedId = null;
        showStatus(`Removed account ${acc.label}.`);
        await refreshAccounts();
      }
    };
  }

  const reauthBtn = document.getElementById('btn-reauth-google');
  if (reauthBtn) {
    reauthBtn.onclick = async () => {
      showStatus(`Opening Google OAuth 2.0 sign-in for ${acc.email} in your browser…`);
      const res = await window.robos.startGoogleOAuth({ accountId: acc.id, email: acc.email });
      if (res.ok) {
        showStatus(`✓ Google account ${res.email} re-authenticated and synced.`);
        await refreshAccounts();
      } else {
        showStatus(`OAuth sign-in not completed: ${res.error}`);
      }
    };
  }

  container.querySelectorAll('.suite-toggle').forEach(cb => {
    cb.onchange = async () => {
      const suiteKey = cb.dataset.suite;
      const res = await window.robos.updateSuites(acc.id, { [suiteKey]: cb.checked });
      if (res.ok) {
        showStatus(`✓ Updated ${suiteKey} suite setting for ${acc.email}.`);
        await refreshAccounts();
      }
    };
  });
}

document.getElementById('btn-google-oauth').onclick = async () => {
  showStatus('Opening Google OAuth 2.0 sign-in in your browser…');
  const res = await window.robos.startGoogleOAuth({});
  if (res.ok) {
    showStatus(`✓ Connected Google Account: ${res.email}`);
    await refreshAccounts();
  } else {
    showStatus(`Google sign-in note: ${res.error}`);
  }
};

document.getElementById('btn-open-calendar-app').onclick = () => {
  window.robos.launchApp('google-calendar');
};

document.getElementById('btn-open-datasources').onclick = () => {
  window.robos.launchApp('data-sources');
};

document.getElementById('btn-refresh').onclick = () => {
  refreshAccounts();
};

document.getElementById('btn-save-account').onclick = async () => {
  const provider = document.getElementById('add-provider').value;
  const email = document.getElementById('add-email').value.trim();
  const label = document.getElementById('add-label').value.trim();
  if (!email) {
    showStatus('Please enter an account email or username.');
    return;
  }
  const res = await window.robos.saveAccount({
    provider,
    email,
    label: label || undefined,
    loggedIn: true,
    createDataSource: provider === 'google' || provider === 'microsoft',
  });
  if (res.ok) {
    document.getElementById('add-email').value = '';
    document.getElementById('add-label').value = '';
    _selectedId = res.account?.id || _selectedId;
    showStatus(`✓ Saved ${res.account?.label || email}.`);
    await refreshAccounts();
  } else {
    showStatus(`Error saving account: ${res.error}`);
  }
};

refreshAccounts();
