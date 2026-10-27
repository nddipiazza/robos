'use strict';

let _state = { accounts: [], defaultAccountId: null, thunderbird: null };
let _selectedAccountId = null;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showStatus(msg) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.remove('hidden');
}

function appendLog(text) {
  const logEl = document.getElementById('install-log');
  if (!logEl) return;
  logEl.textContent += text;
  logEl.scrollTop = logEl.scrollHeight;
}

const DEFAULT_REFRESH_MINUTES = 15;

function currentRefreshMinutes() {
  const minutes = Math.round(Number(document.getElementById('refresh-minutes').value));
  return minutes > 0 ? minutes : DEFAULT_REFRESH_MINUTES;
}

function renderRefreshLabel() {
  const label = document.getElementById('refresh-minutes-label');
  if (label) label.textContent = String(currentRefreshMinutes());
}

function currentOptions() {
  return {
    accountId: _selectedAccountId,
    enableCalendar: document.getElementById('chk-calendar').checked,
    enableContacts: document.getElementById('chk-contacts').checked,
    enableMail: document.getElementById('chk-mail').checked,
    calendarColor: document.getElementById('calendar-color').value.trim() || '#00bcd4',
    refreshMinutes: currentRefreshMinutes(),
  };
}

async function loadState() {
  const res = await window.robos.getState();
  if (!res.ok) {
    showStatus(`Error loading Google Calendar state: ${res.error}`);
    return;
  }
  _state = res;
  if (!_selectedAccountId || !_state.accounts.some(a => a.id === _selectedAccountId)) {
    _selectedAccountId = _state.defaultAccountId || _state.accounts[0]?.id || null;
  }

  renderAccountSelector();
  renderThunderbirdStatus();
  await updatePreviewAndOverview();
}

function renderAccountSelector() {
  const sel = document.getElementById('account-select');
  const summary = document.getElementById('account-summary');
  if (!sel || !summary) return;

  if (!_state.accounts.length) {
    sel.innerHTML = `<option value="">No Google accounts signed in yet</option>`;
    summary.innerHTML = `No Google account found in RobOS Cloud Accounts. Click <strong>+ Sign in / Switch Google Account</strong> above to connect your Google account.`;
    return;
  }

  sel.innerHTML = _state.accounts.map(acc =>
    `<option value="${esc(acc.id)}"${acc.id === _selectedAccountId ? ' selected' : ''}>${esc(acc.email)} — ${esc(acc.label)}${acc.isDefault ? ' (Default)' : ''}</option>`
  ).join('');

  const active = _state.accounts.find(a => a.id === _selectedAccountId) || _state.accounts[0];
  if (active) {
    document.getElementById('chk-calendar').checked = active.suites?.calendar?.enabled !== false;
    document.getElementById('chk-contacts').checked = active.suites?.contacts?.enabled !== false;
    document.getElementById('chk-mail').checked = Boolean(active.suites?.mail?.enabled);
    document.getElementById('calendar-color').value = active.calendarColor || '#00bcd4';
    document.getElementById('refresh-minutes').value = String(active.calendarRefreshMinutes || DEFAULT_REFRESH_MINUTES);
    renderRefreshLabel();

    summary.innerHTML = `
      <div><strong>Re-used Google Account:</strong> <code>${esc(active.email)}</code> <span class="badge ${active.loggedIn ? 'badge-ok' : 'badge-warn'}">${active.loggedIn ? 'Authenticated via RobOS Cloud Accounts' : 'Login Required'}</span></div>
      <div style="margin-top:4px;"><strong>CalDAV Endpoint:</strong> <code>${esc(active.endpoints?.caldavUrl || '')}</code></div>
      <div style="margin-top:2px;"><strong>CardDAV Endpoint:</strong> <code>${esc(active.endpoints?.carddavUrl || '')}</code></div>
      ${active.thunderbirdConfigured ? `<div style="margin-top:4px;"><span class="badge badge-ok">✓ Already Configured in Thunderbird</span> Profile: <code>${esc(active.thunderbirdProfilePath || 'default-release')}</code></div>` : ''}
    `;
  }
}

function renderThunderbirdStatus() {
  const box = document.getElementById('thunderbird-status-box');
  if (!box) return;
  const tb = _state.thunderbird || {};
  if (tb.installed) {
    box.innerHTML = `
      <div><span class="badge badge-ok">✓ Installed</span> <strong>${esc(tb.version || 'Mozilla Thunderbird')}</strong> at <code>${esc(tb.binaryPath)}</code> (${esc(tb.packageType || 'apt')})</div>
      <div style="margin-top:4px;"><strong>Default Profile:</strong> <code>${esc(tb.primaryProfilePath || 'Will be initialized on configure')}</code></div>
      ${tb.configuredAccounts?.length ? `<div style="margin-top:4px;"><strong>Configured CalDAV Accounts:</strong> <code>${esc(tb.configuredAccounts.join(', '))}</code></div>` : ''}
    `;
  } else {
    box.innerHTML = `
      <div><span class="badge badge-warn">Not Installed Yet</span> Mozilla Thunderbird is not currently installed on this workstation.</div>
      <div style="margin-top:4px;">Click <strong>⚡ Install &amp; Configure Thunderbird</strong> below to automatically install Thunderbird via <code>apt</code>/<code>snap</code> and pre-configure your Google Calendar (CalDAV), Google Contacts (CardDAV), and OAuth2 profile, or click <strong>✓ Write Configuration to Thunderbird Profile</strong> to pre-stage the profile immediately.</div>
    `;
  }
}

async function updatePreviewAndOverview() {
  const previewEl = document.getElementById('config-preview');
  const overviewEl = document.getElementById('calendar-overview-box');
  if (!_selectedAccountId) {
    if (previewEl) previewEl.textContent = '// Connect a Google account to generate Thunderbird user.js configuration.';
    if (overviewEl) overviewEl.textContent = 'No Google account selected.';
    return;
  }

  const prev = await window.robos.previewConfig(currentOptions());
  if (prev.ok && previewEl) {
    previewEl.textContent = prev.userJsBlock;
  }

  const ov = await window.robos.fetchOverview(_selectedAccountId);
  if (ov.ok && overviewEl) {
    const cals = (ov.calendars || []).map(c => `<code>${esc(c.summary)}</code>`).join(', ');
    overviewEl.innerHTML = `
      <div><strong>Discovered Calendars for ${esc(ov.email)}:</strong> ${cals || 'Primary Calendar'}</div>
      <div style="margin-top:4px;color:var(--muted);font-size:11.5px;">${esc(ov.note || 'CalDAV & CardDAV endpoints ready for Thunderbird.')}</div>
    `;
  }
}

document.getElementById('account-select').onchange = async (e) => {
  _selectedAccountId = e.target.value;
  renderAccountSelector();
  await updatePreviewAndOverview();
};

['chk-calendar', 'chk-contacts', 'chk-mail', 'calendar-color', 'refresh-minutes'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.onchange = () => {
      if (id === 'refresh-minutes') renderRefreshLabel();
      updatePreviewAndOverview();
    };
  }
});

document.getElementById('btn-configure-only').onclick = async () => {
  const btn = document.getElementById('btn-configure-only');
  btn.disabled = true;
  btn.textContent = 'Writing Configuration…';
  const res = await window.robos.configureOnly(currentOptions());
  btn.disabled = false;
  btn.textContent = '✓ Write Configuration to Thunderbird Profile';
  if (res.ok) {
    showStatus(`✓ Wrote Google Calendar (CalDAV) & Contacts (CardDAV) configuration for ${res.email} to ${res.primaryProfilePath}/user.js`);
    document.getElementById('install-log').textContent = `✓ Configured Thunderbird profile:\n  ${res.writtenFiles.join('\n  ')}\n`;
    await loadState();
  } else {
    showStatus(`Error: ${res.error}`);
  }
};

document.getElementById('btn-install-and-configure').onclick = async () => {
  const btn = document.getElementById('btn-install-and-configure');
  btn.disabled = true;
  btn.textContent = 'Installing & Configuring…';
  document.getElementById('install-log').textContent = '';
  showStatus('Running automatic Thunderbird installation and Google Calendar (CalDAV) / Contacts (CardDAV) configuration…');

  const res = await window.robos.installAndConfigure(currentOptions());
  btn.disabled = false;
  btn.textContent = '⚡ Install & Configure Thunderbird';
  if (res.ok) {
    showStatus(`✓ Thunderbird is configured with Google Calendar (CalDAV) & Contacts (CardDAV) for ${res.email}!`);
    await loadState();
  } else {
    showStatus(`Setup error: ${res.error}`);
  }
};

document.getElementById('btn-launch-tb-calendar').onclick = async () => {
  const res = await window.robos.launchThunderbird('calendar');
  if (res.ok) {
    showStatus(`✓ Launched Mozilla Thunderbird Calendar (${res.binaryPath} -calendar).`);
  } else {
    showStatus(res.error);
  }
};

document.getElementById('btn-open-cloud-accounts').onclick = () => {
  window.robos.launchApp('cloud-accounts');
};

document.getElementById('btn-google-signin').onclick = async () => {
  showStatus('Opening Google OAuth 2.0 sign-in in your browser…');
  const res = await window.robos.startGoogleOAuth({ accountId: _selectedAccountId });
  if (res.ok) {
    _selectedAccountId = res.account?.id || _selectedAccountId;
    showStatus(`✓ Signed in as ${res.email}.`);
    await loadState();
  } else {
    showStatus(`Sign-in note: ${res.error}`);
  }
};

document.getElementById('btn-refresh').onclick = () => loadState();

window.robos.onInstallLog((line) => {
  appendLog(line);
});

loadState();
