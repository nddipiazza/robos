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
 * Renders the HTML for the "RobOS Calendar — Add Event Access Form" Google Doc.
 * Primary feature: 1 prominent button linking to the RobOS Add Calendar Event web app,
 * plus direct browser links to each shared/named Google Calendar.
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

  <h2 style="font-size:13pt;color:#0f172a;margin:16px 0 8px 0;">🗂️ Named &amp; Shared Google Calendars</h2>
  <table style="width:100%;border-collapse:collapse;margin:0 0 16px 0;border:1px solid #cbd5e1;font-size:10pt;">
    <thead>
      <tr style="background-color:#f1f5f9;">
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Calendar Name</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Type / Shared Access</th>
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
          const roleBadge = c.primary ? 'Primary (Owner)' : c.isFamilyCalendar ? 'Shared Family Calendar' : c.writable ? 'Shared (Writable)' : 'Read-Only Feed';
          return `
          <tr>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${escHtml(c.name)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">${escHtml(roleBadge)}</td>
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
 * Creates or updates the "RobOS Calendar — Add Event Access Form" Google Doc in Google Drive.
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

  const html = renderCalendarAccessDocHtml({
    webAppUrl: authedWebAppUrl,
    calendars: state.calendars,
    events: state.events,
  });

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
  const syncedAt = new Date().toISOString();

  // Share with family members if requested
  const sharedEmails = [];
  if (options.shareWithFamily) {
    for (const fm of state.familyMembers || []) {
      if (!fm.email || fm.email.toLowerCase() === String(state.email || '').toLowerCase()) continue;
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
    },
    options
  );

  return {
    ok: true,
    docId,
    docTitle,
    docUrl,
    folderId,
    folderUrl,
    authedWebAppUrl,
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
  renderCalendarAccessDocHtml,
  createGoogleDocsDriveApi,
  syncCalendarAccessDocWithGoogleDrive,
};
