'use strict';

let _state = { accounts: [], defaultAccountId: null, thunderbird: null };
let _namedState = { calendars: [], familyMembers: [], events: [], accessDoc: {}, webAppUrl: '', localWebAppUrl: '' };
let _selectedAccountId = null;
let _selectedFamilyEmails = new Set();

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

function initDefaultEventDate() {
  const el = document.getElementById('ev-start-date');
  if (!el || el.value) return;
  const now = new Date();
  el.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function loadState() {
  initDefaultEventDate();
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
  await loadNamedCalendarsAndDoc();
  await updatePreviewAndOverview();
}

async function loadNamedCalendarsAndDoc() {
  if (!window.robos.getNamedCalendars) return;
  const res = await window.robos.getNamedCalendars(_selectedAccountId);
  if (!res.ok) return;
  _namedState = res;
  renderAccessDocCard();
  renderNamedCalendarsCard();
  renderQuickEventForm();
  renderUpcomingEventsList();
}

function renderAccessDocCard() {
  const box = document.getElementById('access-doc-status');
  const openDocBtn = document.getElementById('btn-open-doc-link');
  const doc = _namedState.accessDoc || {};
  const webUrl = _namedState.webAppUrl || _namedState.localWebAppUrl || 'http://127.0.0.1:19226';

  if (doc.docUrl) {
    box.innerHTML = `
      <div><span class="badge badge-ok">✓ Google Doc Active</span> <strong>${esc(doc.docTitle || 'RobOS Calendar — Add Event Access Form')}</strong></div>
      <div style="margin-top:4px;"><strong>Google Doc URL:</strong> <code>${esc(doc.docUrl)}</code></div>
      <div style="margin-top:2px;"><strong>1-Button WebApp Target:</strong> <code>${esc(webUrl)}</code></div>
    `;
    if (openDocBtn) {
      openDocBtn.classList.remove('hidden');
      openDocBtn.onclick = () => window.robos.openUrl(doc.docUrl);
    }
  } else {
    box.innerHTML = `
      <div><span class="badge badge-warn">Ready to Create</span> Click <strong>📄 Create / Update Calendar Request Google Doc</strong> below to generate your 1-button Google Doc launcher on Google Drive.</div>
      <div style="margin-top:4px;"><strong>Add Event WebApp URL:</strong> <code>${esc(webUrl)}</code></div>
    `;
    if (openDocBtn) openDocBtn.classList.add('hidden');
  }
}

function renderNamedCalendarsCard() {
  const listEl = document.getElementById('named-calendars-list');
  const renameSel = document.getElementById('rename-cal-select');
  const evCalSel = document.getElementById('ev-calendar-select');
  const cals = _namedState.calendars || [];

  if (!cals.length) {
    if (listEl) listEl.textContent = 'No named Google Calendars discovered yet.';
    return;
  }

  if (listEl) {
    listEl.innerHTML = cals.map(c => {
      const role = c.primary ? 'Primary · Owner' : c.isFamilyCalendar ? 'Shared Family Calendar' : c.writable ? 'Shared · Writable' : 'Read-Only Feed';
      const sharedInfo = Array.isArray(c.sharedWith) && c.sharedWith.length
        ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">Shared with Family: ${c.sharedWith.map(m => `${esc(m.avatar)} ${esc(m.nickname || m.firstName)}`).join(', ')}</div>`
        : '';
      return `
        <div class="named-cal-row">
          <div>
            <div><span class="named-cal-dot" style="background:${esc(c.color)}"></span><strong>${esc(c.name)}</strong> <span class="badge ${c.writable ? 'badge-ok' : 'badge-warn'}">${esc(role)}</span></div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;">ID: <code>${esc(c.id)}</code></div>
            ${sharedInfo}
          </div>
        </div>
      `;
    }).join('');
  }

  if (renameSel) {
    renameSel.innerHTML = cals.map(c => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.id)})</option>`).join('');
  }

  if (evCalSel) {
    const writable = cals.filter(c => c.writable !== false);
    evCalSel.innerHTML = writable.map(c =>
      `<option value="${esc(c.id)}"${c.id === _namedState.defaultCalendarId ? ' selected' : ''}>${c.isFamilyCalendar ? '👨‍👩‍👧‍👦 ' : '📅 '}${esc(c.name)}</option>`
    ).join('');
  }
}

function renderQuickEventForm() {
  const chipsEl = document.getElementById('desktop-family-chips');
  if (!chipsEl) return;
  const fmList = _namedState.familyMembers || [];
  chipsEl.innerHTML = fmList.map(fm => {
    const sel = _selectedFamilyEmails.has(fm.email);
    return `
      <span class="family-chip-pill ${sel ? 'selected' : ''}" data-email="${esc(fm.email)}" title="${esc(fm.name)} <${esc(fm.email)}>">
        ${esc(fm.avatar)} ${esc(fm.nickname || fm.firstName || fm.name)}
      </span>
    `;
  }).join('');

  chipsEl.querySelectorAll('.family-chip-pill').forEach(pill => {
    pill.onclick = () => {
      const email = pill.dataset.email;
      if (!email) return;
      if (_selectedFamilyEmails.has(email)) _selectedFamilyEmails.delete(email);
      else _selectedFamilyEmails.add(email);
      renderQuickEventForm();
    };
  });
}

function renderUpcomingEventsList() {
  const el = document.getElementById('desktop-events-list');
  if (!el) return;
  const nowMs = Date.now() - 3600 * 1000;
  const upcoming = (_namedState.events || []).filter(e => new Date(e.end || e.start).getTime() >= nowMs).slice(0, 12);
  if (!upcoming.length) {
    el.innerHTML = `No upcoming events found. Use the form above or click <strong>Open Add Event WebApp</strong> to schedule an event.`;
    return;
  }
  el.innerHTML = upcoming.map(ev => {
    const dt = new Date(ev.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #21262d;">
        <div>
          <div><span class="named-cal-dot" style="background:${esc(ev.color || '#00bcd4')}"></span><strong>${esc(ev.summary)}</strong></div>
          <div style="font-size:11.5px;color:var(--muted);">${esc(ev.calendarName || 'Primary')} · ${esc(dt)}${ev.location ? ` · 📍 ${esc(ev.location)}` : ''}</div>
        </div>
        <button class="btn btn-del-ev" data-id="${esc(ev.id)}" data-cal="${esc(ev.calendarId || '')}" style="padding:3px 8px;font-size:11px;">Delete</button>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.btn-del-ev').forEach(btn => {
    btn.onclick = async () => {
      await window.robos.deleteEvent({ eventId: btn.dataset.id, calendarId: btn.dataset.cal });
      showStatus('✓ Deleted event from Google Calendar');
      await loadNamedCalendarsAndDoc();
    };
  });
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
      <div><strong>Re-used Google Account:</strong> <code>${esc(active.email)}</code> <span class="badge ${active.loggedIn ? 'badge-ok' : 'badge-warn'}">${active.loggedIn ? 'Authenticated via RobOS Cloud Accounts' : 'CalDAV OAuth Active'}</span></div>
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

async function handleCreateAccessDoc() {
  const shareWithFamily = document.getElementById('chk-share-family')?.checked !== false;
  showStatus('Creating / updating "RobOS Calendar — Add Event Access Form" on Google Docs…');
  const res = await window.robos.syncAccessDoc({ accountId: _selectedAccountId, shareWithFamily });
  if (res.ok) {
    showStatus(`✓ Created / updated Google Doc "${res.docTitle}": ${res.docUrl}`);
    await loadNamedCalendarsAndDoc();
  } else {
    showStatus(`Error creating Google Doc: ${res.error}`);
  }
}

function handleOpenWebApp() {
  const url = _namedState.localWebAppUrl || _namedState.webAppUrl || 'http://127.0.0.1:19226';
  window.robos.openUrl(url);
}

document.getElementById('btn-create-access-doc')?.addEventListener('click', handleCreateAccessDoc);
document.getElementById('btn-sync-doc-card')?.addEventListener('click', handleCreateAccessDoc);
document.getElementById('btn-open-webapp')?.addEventListener('click', handleOpenWebApp);
document.getElementById('btn-open-webapp-card')?.addEventListener('click', handleOpenWebApp);
document.getElementById('btn-desktop-open-full-form')?.addEventListener('click', handleOpenWebApp);

document.getElementById('btn-sync-named-cals')?.addEventListener('click', async () => {
  showStatus('Syncing all Named Google Calendars to Mozilla Thunderbird…');
  const res = await window.robos.syncNamedCalendars(_selectedAccountId);
  if (res.ok) {
    showStatus(`✓ Synced ${res.calendarsSynced.length} Named Google Calendars (${res.calendarsSynced.map(c => c.name).join(', ')}) to Thunderbird!`);
    await loadState();
  } else {
    showStatus(`Error: ${res.error}`);
  }
});

document.getElementById('btn-save-cal-name')?.addEventListener('click', async () => {
  const id = document.getElementById('rename-cal-select').value;
  const name = document.getElementById('rename-cal-input').value.trim();
  if (!id || !name) return;
  const res = await window.robos.saveNamedCalendar({ id, name, accountId: _selectedAccountId });
  if (res.ok) {
    document.getElementById('rename-cal-input').value = '';
    showStatus(`✓ Renamed calendar to "${name}" & updated Thunderbird!`);
    await loadState();
  }
});

document.getElementById('btn-nl-fill')?.addEventListener('click', async () => {
  const text = document.getElementById('quick-nl-input').value.trim();
  if (!text) return;
  const res = await window.robos.parseNaturalEvent({ text });
  if (res.ok && res.parsed) {
    const p = res.parsed;
    if (p.summary) document.getElementById('ev-title').value = p.summary;
    if (p.calendarId) document.getElementById('ev-calendar-select').value = p.calendarId;
    if (p.startDate) document.getElementById('ev-start-date').value = p.startDate;
    if (p.startTime) document.getElementById('ev-start-time').value = p.startTime;
    if (p.endTime) document.getElementById('ev-end-time').value = p.endTime;
    if (p.location) document.getElementById('ev-location').value = p.location;
    if (p.recurrence) document.getElementById('ev-recurrence').value = p.recurrence;
    if (Array.isArray(p.attendees)) {
      p.attendees.forEach(a => a.email && _selectedFamilyEmails.add(a.email));
      renderQuickEventForm();
    }
    showStatus('✨ Parsed natural-language event into form!');
  }
});

document.getElementById('btn-desktop-create-ev')?.addEventListener('click', async () => {
  const summary = document.getElementById('ev-title').value.trim();
  if (!summary) {
    showStatus('Please enter an event title.');
    return;
  }
  const calendarId = document.getElementById('ev-calendar-select').value;
  const startDate = document.getElementById('ev-start-date').value;
  const startTime = document.getElementById('ev-start-time').value || '17:00';
  const endTime = document.getElementById('ev-end-time').value || '18:00';
  const location = document.getElementById('ev-location').value.trim();
  const recurrence = document.getElementById('ev-recurrence').value;
  const attendees = [..._selectedFamilyEmails];

  const res = await window.robos.createEvent({
    summary,
    calendarId,
    startDate,
    startTime,
    endDate: startDate,
    endTime,
    location,
    recurrence,
    attendees,
  });
  if (res.ok) {
    document.getElementById('ev-title').value = '';
    document.getElementById('ev-location').value = '';
    showStatus(`✓ Added "${res.event.summary}" to ${res.event.calendarName}${res.syncedToGoogle ? ' (Synced live to Google Calendar!)' : ''}`);
    await loadNamedCalendarsAndDoc();
  } else {
    showStatus(`Error: ${res.error}`);
  }
});

document.getElementById('account-select').onchange = async (e) => {
  _selectedAccountId = e.target.value;
  renderAccountSelector();
  await loadNamedCalendarsAndDoc();
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
