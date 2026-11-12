'use strict';

/**
 * RobOS Google Calendar — Google Doc Access Form ("Calendar Request / Add Event") Generator & Sync.
 *
 * Creates and updates a native Google Doc (`application/vnd.google-apps.document`) in Google Drive:
 *   "RobOS Calendar — Add Event Access Form"
 *
 * The Google Doc is a 1-button access launcher whose primary element is a prominent button
 * (`👉 CLICK THIS TO OPEN THE ROBOS ADD CALENDAR EVENT APP`) that links to the authenticated
 * RobOS Add Calendar Event web app (`?auth=<256-bit-token>`), plus a read-only overview of
 * Named Google Calendars and upcoming events.
 */

const path = require('node:path');
const {
  loadCalendarSettings,
  updateCalendarSettings,
  discoverNamedCalendars,
  listEventsAcrossNamedCalendars,
} = require('./named-calendars');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GDOC_MIME = 'application/vnd.google-apps.document';
const DEFAULT_FOLDER_NAME = 'RobOS Household Calendar';
const DEFAULT_DOC_TITLE = 'RobOS Calendar — Add Event Access Form';

function requireRobosLib(modName) {
  const candidates = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, modName),
    path.resolve(__dirname, '..', '..', 'robos-lib', modName),
    `/usr/local/share/robos/robos-lib/${modName}`,
  ].filter(Boolean);
  for (const p of candidates) {
    try { return require(p); } catch {}
  }
  throw new Error(`RobOS shared module "${modName}" not found.`);
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function googleDocEditUrl(docId) {
  const base = (process.env.ROBOS_GDOCS_WEB_BASE || 'https://docs.google.com').replace(/\/+$/, '');
  return `${base}/document/d/${docId}/edit`;
}

function googleDriveFolderUrl(folderId) {
  const base = (process.env.ROBOS_GDRIVE_WEB_BASE || 'https://drive.google.com').replace(/\/+$/, '');
  return `${base}/drive/folders/${folderId}`;
}

function formatDateTimeHuman(isoStr, allDay = false) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return String(isoStr);
  if (allDay) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' (All day)';
  }
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Returns the Google Doc title for a specific Named Calendar's Invite & Access Doc.
 */
function getCalendarInviteDocTitle(cal = {}) {
  const rawName = String(cal.name || cal.id || 'Calendar').trim();
  const cleanName = rawName.replace(/\s*\([^)]*@[^)]*\)\s*$/, '').trim() || rawName;
  if (cal.primary) {
    return `RobOS Calendar — ${cleanName} (Private Calendar Access Doc)`;
  }
  return `RobOS Calendar — ${cleanName} (Invite & Access Doc)`;
}

/**
 * Renders the HTML for a single Named Calendar's dedicated "Invite & Access Google Doc".
 * Designed so that each calendar (`Family`, `Kids Calendar`, `Primary`) has its own
 * Google Doc that can be shared ONLY with the members of that specific calendar.
 */
function renderSingleCalendarInviteDocHtml(cal = {}, options = {}) {
  const baseWebUrl = String(options.webAppUrl || options.authedWebAppUrl || options.localWebAppUrl || 'http://127.0.0.1:19226').trim();
  const sep = baseWebUrl.includes('?') ? '&' : '?';
  const calWebAppUrl = `${baseWebUrl}${sep}calendar=${encodeURIComponent(cal.id || '')}`;
  const gcalHref = cal.googleCalendarUrl || `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(cal.id || '')}`;
  const gcalEmbedHref = cal.googleCalendarEmbedUrl || `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(cal.id || '')}`;
  const docTitle = getCalendarInviteDocTitle(cal);
  const badge = cal.isFamilyCalendar ? '👨‍👩‍👧‍👦' : cal.primary ? '🔒' : '🗓️';
  const roleLabel = cal.primary
    ? 'Private Personal Calendar (Owner Only)'
    : cal.isFamilyCalendar
      ? 'Shared Household Family Calendar'
      : 'Shared Extended Family / Kids Calendar';
  const description =
    cal.description ||
    (cal.isFamilyCalendar
      ? 'For stuff that our private family needs (household plans, family trips, dinners, and shared household activities).'
      : cal.primary
        ? 'My private calendar — for stuff that only I care about (personal reminders, solo work, and private appointments).'
        : 'Shared Named Google Calendar.');
  const members = Array.isArray(cal.sharedWith) ? cal.sharedWith : [];
  const syncedAt = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const membersTableHtml = members.length
    ? `
  <h2 style="font-size:13pt;color:#0f172a;margin:16px 0 8px 0;">👥 People Invited to ${escHtml(cal.name)} (${members.length})</h2>
  <table style="width:100%;border-collapse:collapse;margin:0 0 16px 0;border:1px solid #cbd5e1;font-size:10pt;">
    <thead>
      <tr style="background-color:#f1f5f9;">
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Member</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Role / Relationship</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Google Account / Email</th>
      </tr>
    </thead>
    <tbody>
      ${members
        .map(
          (m) => `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${escHtml(m.avatar || '👤')} ${escHtml(m.name || m.firstName || m.email)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">${escHtml(m.role || 'Calendar Member')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#0369a1;">${escHtml(m.email || '')}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>`
    : `
  <p style="margin:12px 0 16px 0;padding:10px 14px;background-color:#f8fafc;border:1px solid #cbd5e1;font-size:10pt;color:#334155;">
    🔒 <strong>Private Calendar:</strong> This calendar is private to the calendar owner${options.ownerEmail ? ` (${escHtml(options.ownerEmail)})` : ''} and is not shared with other household members.
  </p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escHtml(docTitle)}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.45;">
  <h1 style="margin:0 0 4px 0;font-size:20pt;color:#0f172a;">${badge} ${escHtml(cal.name)} — Calendar Invite &amp; Access Doc</h1>
  <p style="margin:0 0 12px 0;font-size:10pt;color:#475569;">
    ${escHtml(roleLabel)} · Synced with Google Calendar &amp; Mozilla Thunderbird CalDAV · Updated ${escHtml(syncedAt)}
  </p>

  <table style="width:100%;border-collapse:collapse;margin:10px 0 14px 0;border:2px solid #cbd5e1;background-color:#f8fafc;">
    <tr>
      <td style="padding:12px 16px;">
        <p style="margin:0 0 4px 0;font-size:10.5pt;font-weight:bold;color:#0f172a;">📌 What This Calendar Is Used For:</p>
        <p style="margin:0;font-size:11pt;color:#1e293b;">${escHtml(description)}</p>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;margin:14px 0 18px 0;border:3px solid #0284c7;background-color:#eff6ff;">
    <tr>
      <td style="padding:22px 20px;text-align:center;">
        <p style="margin:0 0 10px 0;font-size:17pt;font-weight:bold;line-height:1.35;">
          <a href="${escHtml(calWebAppUrl)}" style="color:#0369a1;text-decoration:underline;font-weight:bold;">👉 CLICK THIS TO OPEN &amp; ADD EVENTS TO ${escHtml(String(cal.name || 'THIS CALENDAR').toUpperCase())}</a>
        </p>
        <p style="margin:0 0 14px 0;font-size:11pt;">
          <a href="${escHtml(calWebAppUrl)}" style="color:#0284c7;text-decoration:none;font-weight:bold;">➕ Add Single-Day or Multi-Day Events, Paste Flight/Hotel Itineraries, or Dictate by Voice (Pre-Selected to ${escHtml(cal.name)}) →</a>
        </p>
        <p style="margin:0 0 14px 0;font-size:11pt;color:#1e293b;">
          <strong>Open in Google Calendar:</strong> &nbsp;
          <a href="${escHtml(gcalHref)}" style="color:#0f766e;text-decoration:underline;font-weight:bold;">🌐 Open ${escHtml(cal.name)} in Google Calendar (Browser / App) ↗</a>
          &nbsp;·&nbsp;
          <a href="${escHtml(gcalEmbedHref)}" style="color:#475569;text-decoration:underline;font-weight:bold;">📅 Full-Screen Calendar View ↗</a>
        </p>
        <p style="margin:0;padding:9px 12px;background-color:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:10pt;font-weight:bold;">
          ⚠️ DO NOT TRY TO EDIT THIS DOC — This Google Doc is for calendar invitation &amp; access purposes and is READ-ONLY. Click the links above to view the calendar or add events.
        </p>
      </td>
    </tr>
  </table>

  ${membersTableHtml}

  <h2 style="font-size:12.5pt;color:#0f172a;margin:14px 0 6px 0;">✨ How to Use ${escHtml(cal.name)}</h2>
  <ul style="margin:0 0 14px 18px;padding:0;font-size:10pt;color:#334155;">
    <li style="margin-bottom:4px;"><strong>View in Google Calendar:</strong> Click <em>Open ${escHtml(cal.name)} in Google Calendar</em> above to view or subscribe in your browser or phone.</li>
    <li style="margin-bottom:4px;"><strong>Add or Edit Events:</strong> Click the big blue link above to open the RobOS Add Calendar Event web app pre-selected to <strong>${escHtml(cal.name)}</strong>.</li>
    <li style="margin-bottom:4px;"><strong>Automatic Member Invites:</strong> Events added to <strong>${escHtml(cal.name)}</strong> automatically pre-select the invited members of this calendar.</li>
  </ul>
</body>
</html>`;
}

/**
 * Renders the HTML for the "RobOS Calendar — Add Event Access Form" Google Doc.
 * Primary feature: 1 prominent button linking to the RobOS Add Calendar Event web app,
 * plus direct browser links to each shared/named Google Calendar and its per-calendar Invite Google Doc.
 * Does NOT include a static upcoming-events snapshot (users open the WebApp or Google Calendar link).
 */
function renderCalendarAccessDocHtml(options = {}) {
  const webAppUrl = String(options.webAppUrl || options.authedWebAppUrl || options.localWebAppUrl || 'http://127.0.0.1:19226').trim();
  const calendars = Array.isArray(options.calendars) ? options.calendars : [];
  const syncedAt = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const writableCals = calendars.filter((c) => c.writable !== false);
  const calLinksHtml = writableCals.length
    ? writableCals
        .map((c) => {
          const sep = webAppUrl.includes('?') ? '&' : '?';
          const href = `${webAppUrl}${sep}calendar=${encodeURIComponent(c.id)}`;
          const badge = c.isFamilyCalendar ? '👨‍👩‍👧‍👦 ' : c.primary ? '📅 ' : '🗓️ ';
          return `<a href="${escHtml(href)}" style="color:#0369a1;text-decoration:underline;font-weight:bold;">${badge}${escHtml(c.name)}</a>`;
        })
        .join(' &nbsp;·&nbsp; ')
    : '';

  const gcalBrowserLinksHtml = calendars.length
    ? calendars
        .map((c) => {
          const gcalHref = c.googleCalendarUrl || `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(c.id)}`;
          const badge = c.isFamilyCalendar ? '👨‍👩‍👧‍👦 ' : c.primary ? '📅 ' : '🗓️ ';
          return `<a href="${escHtml(gcalHref)}" style="color:#0f766e;text-decoration:underline;font-weight:bold;">${badge}Open ${escHtml(c.name)} in Google Calendar ↗</a>`;
        })
        .join(' &nbsp;·&nbsp; ')
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escHtml(DEFAULT_DOC_TITLE)}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.45;">
  <h1 style="margin:0 0 4px 0;font-size:20pt;color:#0f172a;">📅 RobOS Google Calendar — Add Event Access Form</h1>
  <p style="margin:0 0 12px 0;font-size:10pt;color:#475569;">
    Synced with Google Calendar &amp; Mozilla Thunderbird CalDAV · Updated ${escHtml(syncedAt)}
  </p>

  <table style="width:100%;border-collapse:collapse;margin:14px 0 18px 0;border:3px solid #0284c7;background-color:#eff6ff;">
    <tr>
      <td style="padding:22px 20px;text-align:center;">
        <p style="margin:0 0 10px 0;font-size:18pt;font-weight:bold;line-height:1.35;">
          <a href="${escHtml(webAppUrl)}" style="color:#0369a1;text-decoration:underline;font-weight:bold;">👉 CLICK THIS TO OPEN THE ROBOS ADD CALENDAR EVENT APP</a>
        </p>
        <p style="margin:0 0 12px 0;font-size:11.5pt;">
          <a href="${escHtml(webAppUrl)}" style="color:#0284c7;text-decoration:none;font-weight:bold;">➕ Create a New Google Calendar Event &amp; View Live Schedule (Title, Named Calendar, Date/Time, Family Guests, Reminders &amp; Voice Dictation) →</a>
        </p>
        ${calLinksHtml ? `<p style="margin:0 0 8px 0;font-size:10.5pt;color:#1e293b;"><strong>Quick-Add to Named Calendar:</strong> ${calLinksHtml}</p>` : ''}
        ${gcalBrowserLinksHtml ? `<p style="margin:0 0 12px 0;font-size:10.5pt;color:#1e293b;"><strong>View Shared Calendar in Google Calendar:</strong> ${gcalBrowserLinksHtml}</p>` : ''}
        <p style="margin:0;padding:9px 12px;background-color:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:10pt;font-weight:bold;">
          ⚠️ DO NOT TRY TO EDIT THIS DOC — This Google Doc is for data &amp; access purposes and is READ-ONLY. Click the button above to open the RobOS Add Calendar Event web app.
        </p>
      </td>
    </tr>
  </table>

  <h2 style="font-size:13pt;color:#0f172a;margin:16px 0 8px 0;">🗂️ Named &amp; Shared Google Calendars (Each with Its Own Invite Google Doc)</h2>
  <table style="width:100%;border-collapse:collapse;margin:0 0 16px 0;border:1px solid #cbd5e1;font-size:10pt;">
    <thead>
      <tr style="background-color:#f1f5f9;">
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Calendar Name</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">What This Calendar Is Used For (Description)</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Shared Members / Role</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Calendar Invite Google Doc</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Open in Google Calendar (Browser)</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Add Event in RobOS WebApp</th>
      </tr>
    </thead>
    <tbody>
      ${calendars
        .map((c) => {
          const sep = webAppUrl.includes('?') ? '&' : '?';
          const href = `${webAppUrl}${sep}calendar=${encodeURIComponent(c.id)}`;
          const gcalHref = c.googleCalendarUrl || `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(c.id)}`;
          const gcalEmbedHref = c.googleCalendarEmbedUrl || `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(c.id)}`;
          const roleBadge = c.primary ? 'Primary · Private (Owner)' : c.isFamilyCalendar ? 'Shared Family Calendar' : c.writable ? 'Shared (Writable)' : 'Read-Only Feed';
          const sharedStr = Array.isArray(c.sharedWith) && c.sharedWith.length
            ? `${roleBadge} — ${c.sharedWith.map((m) => m.nickname || m.firstName || m.name).join(', ')}`
            : roleBadge;
          const inviteDocCell = c.inviteDocUrl
            ? `<a href="${escHtml(c.inviteDocUrl)}" style="color:#7c3aed;font-weight:bold;text-decoration:underline;">📄 Open ${escHtml(c.name)} Invite Doc ↗</a>`
            : '<span style="color:#94a3b8;">—</span>';
          return `
          <tr>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${escHtml(c.name)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#1e293b;">${escHtml(c.description || '')}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">${escHtml(sharedStr)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">${inviteDocCell}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">
              <a href="${escHtml(gcalHref)}" style="color:#0f766e;font-weight:bold;text-decoration:underline;">🌐 Open in Google Calendar ↗</a>
              &nbsp;·&nbsp;
              <a href="${escHtml(gcalEmbedHref)}" style="color:#475569;text-decoration:underline;">📅 Full-Screen View</a>
            </td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">
              ${c.writable !== false ? `<a href="${escHtml(href)}" style="color:#0284c7;font-weight:bold;">+ Add Event to ${escHtml(c.name)}</a>` : '<span style="color:#94a3b8;">Read-only</span>'}
            </td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>
</body>
</html>`;
}

function createGoogleDocsDriveApi({ accountId, homeDir, tokens, fetchImpl } = {}) {
  const { driveFetch, readDriveError, DriveError } = requireRobosLib('google-drive-fetch');
  const backends = requireRobosLib('config-sync-backends');
  const tokenSource = tokens || backends.googleTokenProvider(accountId || null, { homeDir });

  async function request(method, url, { body, headers = {}, raw = false, retried = false } = {}) {
    const token = await tokenSource.get();
    const res = await driveFetch(
      url,
      { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body },
      { fetchImpl, timeoutMs: 45000 },
    );
    if (res.status === 401 && !retried && tokenSource.refresh) {
      await tokenSource.refresh();
      return request(method, url, { body, headers, raw, retried: true });
    }
    if (!res.ok) {
      const err = await readDriveError(res);
      throw new DriveError(err.userMessage, err.status, err.reason, err.kind);
    }
    if (raw) return Buffer.from(await res.arrayBuffer());
    if (res.status === 204) return null;
    return res.json();
  }

  const qStr = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const common = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

  async function findFolderByName(name) {
    const parts = [`name = ${qStr(name)}`, `mimeType = ${qStr(FOLDER_MIME)}`, 'trashed = false'];
    const url = `/drive/v3/files?q=${encodeURIComponent(parts.join(' and '))}&fields=${encodeURIComponent('files(id,name,modifiedTime)')}&pageSize=10&${common}`;
    const res = await request('GET', url);
    return (res.files || [])[0] || null;
  }

  async function createFolder(name, parentId) {
    return request('POST', `/drive/v3/files?fields=id,name&supportsAllDrives=true`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
  }

  async function listChildren(parentId, { name, mimeType } = {}) {
    const parts = [`${qStr(parentId)} in parents`, 'trashed = false'];
    if (name) parts.push(`name = ${qStr(name)}`);
    if (mimeType) parts.push(`mimeType = ${qStr(mimeType)}`);
    const url = `/drive/v3/files?q=${encodeURIComponent(parts.join(' and '))}&fields=${encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink)')}&pageSize=50&${common}`;
    const res = await request('GET', url);
    return res.files || [];
  }

  async function createMultipartFile({ name, parentId, targetMimeType, contentMimeType, buf }) {
    const boundary = `robos-cal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({
      name,
      mimeType: targetMimeType,
      ...(parentId ? { parents: [parentId] } : {}),
    });
    const head = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentMimeType}\r\n\r\n`,
      'utf8',
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([head, buf, tail]);
    return request('POST', `/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink&supportsAllDrives=true`, {
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  async function updateFileMedia(fileId, contentMimeType, buf) {
    return request('PATCH', `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,webViewLink&supportsAllDrives=true`, {
      headers: { 'Content-Type': contentMimeType },
      body: buf,
    });
  }

  async function shareFile(fileId, { email, role = 'reader', sendNotificationEmail = false } = {}) {
    return request(
      'POST',
      `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=${sendNotificationEmail ? 'true' : 'false'}&supportsAllDrives=true`,
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user',
          role,
          emailAddress: email,
        }),
      }
    );
  }

  return {
    findFolderByName,
    createFolder,
    listChildren,
    createDocFromHtml: ({ name, parentId, html }) =>
      createMultipartFile({
        name,
        parentId,
        targetMimeType: GDOC_MIME,
        contentMimeType: 'text/html; charset=UTF-8',
        buf: Buffer.from(html, 'utf8'),
      }),
    updateDocFromHtml: (docId, html) =>
      updateFileMedia(docId, 'text/html; charset=UTF-8', Buffer.from(html, 'utf8')),
    shareFile,
  };
}

/**
 * Creates or updates:
 *   1. A dedicated Invite & Access Google Doc for EACH writable Named Calendar (`Family`, `Kids Calendar`, `Primary`),
 *      automatically shared in Google Drive ONLY with the members of that specific calendar (`cal.sharedWith`).
 *   2. The master "RobOS Calendar — Add Event Access Form" Google Doc in Google Drive.
 */
async function syncCalendarAccessDocWithGoogleDrive(options = {}) {
  const settings = loadCalendarSettings(options);
  const state = await listEventsAcrossNamedCalendars(options.accountId || null, options);

  const token = settings.webAuthToken;
  const baseWebUrl =
    options.webAppUrl ||
    settings.publicTunnelUrl ||
    settings.lanWebAppUrl ||
    `http://127.0.0.1:${Number(process.env.GOOGLE_CALENDAR_WEB_PORT || 19226)}`;

  const authedWebAppUrl = baseWebUrl.includes('auth=')
    ? baseWebUrl
    : `${baseWebUrl.replace(/\/+$/, '')}/?auth=${encodeURIComponent(token)}`;

  const api = options.driveApi || createGoogleDocsDriveApi({
    accountId: options.accountId || null,
    homeDir: options.homeDir,
    tokens: options.tokens,
    fetchImpl: options.fetchImpl,
  });

  let folderId = options.folderId || settings.accessDoc?.folderId || '';
  if (!folderId) {
    const existingFolder = await api.findFolderByName(DEFAULT_FOLDER_NAME);
    if (existingFolder?.id) {
      folderId = existingFolder.id;
    } else {
      const created = await api.createFolder(DEFAULT_FOLDER_NAME);
      folderId = created.id;
    }
  }

  const syncedAt = new Date().toISOString();
  const existingCalendarDocs = { ...(settings.calendarDocs || {}) };
  const calendarDocsResult = {};

  // 1. Sync a dedicated Invite & Access Google Doc for each writable Named Calendar
  if (options.syncPerCalendarDocs !== false) {
    const writableCalendars = (state.calendars || []).filter((c) => c.writable !== false);
    for (const cal of writableCalendars) {
      const calDocTitle = getCalendarInviteDocTitle(cal);
      const calHtml = renderSingleCalendarInviteDocHtml(cal, {
        webAppUrl: authedWebAppUrl,
        ownerEmail: state.email,
      });

      let calDocId = existingCalendarDocs[cal.id]?.docId || '';
      if (!calDocId && folderId) {
        try {
          const found = await api.listChildren(folderId, { name: calDocTitle, mimeType: GDOC_MIME });
          if (found.length > 0) calDocId = found[0].id;
        } catch {}
      }

      if (calDocId) {
        try {
          await api.updateDocFromHtml(calDocId, calHtml);
        } catch {
          const created = await api.createDocFromHtml({ name: calDocTitle, parentId: folderId, html: calHtml });
          calDocId = created.id;
        }
      } else {
        const created = await api.createDocFromHtml({ name: calDocTitle, parentId: folderId, html: calHtml });
        calDocId = created.id;
      }

      const calDocUrl = googleDocEditUrl(calDocId);
      const sep = authedWebAppUrl.includes('?') ? '&' : '?';
      const calWebAppUrl = `${authedWebAppUrl}${sep}calendar=${encodeURIComponent(cal.id)}`;

      // Share this calendar's Invite Google Doc with the specific members of this calendar
      const calSharedEmails = [];
      if (options.shareCalendarDocs !== false && Array.isArray(cal.sharedWith) && cal.sharedWith.length > 0) {
        for (const member of cal.sharedWith) {
          const memberEmail = String(member?.email || '').trim();
          if (!memberEmail || memberEmail.toLowerCase() === String(state.email || '').toLowerCase()) continue;
          try {
            await api.shareFile(calDocId, { email: memberEmail, role: 'reader', sendNotificationEmail: false });
            calSharedEmails.push(memberEmail);
          } catch {}
        }
      }

      cal.inviteDocId = calDocId;
      cal.inviteDocTitle = calDocTitle;
      cal.inviteDocUrl = calDocUrl;

      const entry = {
        calendarId: cal.id,
        calendarName: cal.name,
        description: cal.description || '',
        docId: calDocId,
        docTitle: calDocTitle,
        docUrl: calDocUrl,
        authedWebAppUrl: calWebAppUrl,
        googleCalendarUrl: cal.googleCalendarUrl || '',
        sharedEmails: calSharedEmails.length ? calSharedEmails : (existingCalendarDocs[cal.id]?.sharedEmails || []),
        lastSyncedAt: syncedAt,
      };
      existingCalendarDocs[cal.id] = entry;
      calendarDocsResult[cal.id] = entry;
    }
  }

  // 2. Render & sync the Master "RobOS Calendar — Add Event Access Form" Google Doc (with links to each per-calendar doc)
  const html = renderCalendarAccessDocHtml({
    webAppUrl: authedWebAppUrl,
    calendars: state.calendars,
    events: state.events,
  });

  const docTitle = options.docTitle || settings.accessDoc?.docTitle || DEFAULT_DOC_TITLE;
  let docId = options.docId || settings.accessDoc?.docId || '';

  if (!docId && folderId) {
    const existingDocs = await api.listChildren(folderId, { name: docTitle, mimeType: GDOC_MIME });
    if (existingDocs.length > 0) {
      docId = existingDocs[0].id;
    }
  }

  let docMeta;
  if (docId) {
    try {
      docMeta = await api.updateDocFromHtml(docId, html);
    } catch {
      docMeta = await api.createDocFromHtml({ name: docTitle, parentId: folderId, html });
      docId = docMeta.id;
    }
  } else {
    docMeta = await api.createDocFromHtml({ name: docTitle, parentId: folderId, html });
    docId = docMeta.id;
  }

  const docUrl = googleDocEditUrl(docId);
  const folderUrl = googleDriveFolderUrl(folderId);

  // Share master doc with household family members if requested
  const sharedEmails = [];
  if (options.shareWithFamily) {
    for (const fm of state.familyMembers || []) {
      if (!fm.email || fm.email.toLowerCase() === String(state.email || '').toLowerCase()) continue;
      if (Array.isArray(fm.groups) && fm.groups.length > 0 && !fm.groups.some((g) => /^household$/i.test(g))) continue;
      try {
        await api.shareFile(docId, { email: fm.email, role: 'reader', sendNotificationEmail: false });
        sharedEmails.push(fm.email);
      } catch {}
    }
  }

  updateCalendarSettings(
    {
      accessDoc: {
        docId,
        docTitle,
        docUrl,
        folderId,
        folderUrl,
        authedWebAppUrl,
        lastSyncedAt: syncedAt,
        sharedEmails: sharedEmails.length ? sharedEmails : (settings.accessDoc?.sharedEmails || []),
      },
      calendarDocs: existingCalendarDocs,
    },
    options
  );

  // Refresh KGraph store so each calendar node includes its robos:inviteDocUrl
  try {
    await discoverNamedCalendars(options.accountId || null, { ...options, skipNetwork: true });
  } catch {}

  return {
    ok: true,
    docId,
    docTitle,
    docUrl,
    folderId,
    folderUrl,
    authedWebAppUrl,
    calendarDocs: calendarDocsResult,
    syncedAt,
    calendarsCount: state.calendars.length,
    upcomingEventsCount: state.events.length,
  };
}

module.exports = {
  DEFAULT_FOLDER_NAME,
  DEFAULT_DOC_TITLE,
  googleDocEditUrl,
  googleDriveFolderUrl,
  getCalendarInviteDocTitle,
  renderSingleCalendarInviteDocHtml,
  renderCalendarAccessDocHtml,
  createGoogleDocsDriveApi,
  syncCalendarAccessDocWithGoogleDrive,
};
