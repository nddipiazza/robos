'use strict';

/**
 * Two-way Google Docs & Google Drive synchronization for RobOS Shopping Lists.
 *
 * Uses the user's signed-in Google account from `robos-lib/cloud-accounts` and
 * `robos-lib/google-drive-fetch` (with `https://www.googleapis.com/auth/drive` scope):
 *
 *  - Creates or opens the `RobOS Household Shopping Lists` folder in Google Drive
 *  - Creates & updates 3 native Google Docs (`application/vnd.google-apps.document`):
 *      1. Grocery — RobOS Shopping List
 *      2. Target — RobOS Shopping List
 *      3. Costco — RobOS Shopping List
 *    (plus any additional custom lists)
 *  - Exports Google Docs (`text/plain`) to pull mobile check-offs or typed items back into RobOS
 *  - Stores `shopping-lists.json` + the serverless `Mobile-Form-Apps-Script/` (`Code.gs`, `Index.html`)
 *    inside the Drive folder so both RobOS and the Google Apps Script Mobile Form share live state
 *  - Shares the folder with spouse/family Google accounts (`permissions.create`)
 */

const path = require('node:path');
const { renderGoogleDocHtml, parseGoogleDocText } = require('./google-docs-format');
const { generateAppsScriptCodeGs, generateAppsScriptIndexHtml } = require('./apps-script-bundle');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GDOC_MIME = 'application/vnd.google-apps.document';
const DEFAULT_FOLDER_NAME = 'RobOS Household Shopping Lists';
const STATE_JSON_NAME = 'shopping-lists.json';
const APPS_SCRIPT_SUBFOLDER = 'Mobile-Form-Apps-Script';

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

function googleDocEditUrl(docId) {
  const base = (process.env.ROBOS_GDOCS_WEB_BASE || 'https://docs.google.com').replace(/\/+$/, '');
  return `${base}/document/d/${docId}/edit`;
}

function googleDriveFolderUrl(folderId) {
  const base = (process.env.ROBOS_GDRIVE_WEB_BASE || 'https://drive.google.com').replace(/\/+$/, '');
  return `${base}/drive/folders/${folderId}`;
}

function parseDriveFolderId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (raw.startsWith('gdrive:')) return raw.slice(7).trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const m = u.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
      if (m) return m[1];
      const qid = u.searchParams.get('id');
      if (qid) return qid;
    } catch {}
  }
  if (/^[A-Za-z0-9_-]{8,}$/.test(raw)) return raw;
  throw new Error('Paste a valid Google Drive folder URL or folder ID.');
}

function listGoogleAccounts({ homeDir } = {}) {
  try {
    const ca = requireRobosLib('cloud-accounts');
    const raw = ca.listAccounts(homeDir ? { homeDir } : {});
    const arr = Array.isArray(raw) ? raw : (raw?.accounts || []);
    return arr
      .filter((a) => a.provider === 'google')
      .map((a) => ({
        id: a.id,
        email: a.email || '',
        label: a.label || a.email || a.id,
        signedIn: Boolean(a.accessToken || a.refreshToken),
        isDefault: Boolean(a.isDefault),
      }));
  } catch {
    return [];
  }
}

async function signInGoogleAccount({ homeDir } = {}) {
  const ca = requireRobosLib('cloud-accounts');
  const res = await ca.startGoogleBrowserOAuth({
    suites: ['drive'],
    ...(homeDir ? { homeDir } : {}),
  });
  return res;
}

function createGoogleDocsDriveApi({ accountId, homeDir, tokens, fetchImpl }) {
  const { driveFetch, readDriveError, DriveError } = requireRobosLib('google-drive-fetch');
  const backends = requireRobosLib('config-sync-backends');
  const tokenSource = tokens || backends.googleTokenProvider(accountId, { homeDir });

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

  async function listChildren(parentId, { name, mimeType } = {}) {
    const parts = [`${qStr(parentId)} in parents`, 'trashed = false'];
    if (name) parts.push(`name = ${qStr(name)}`);
    if (mimeType) parts.push(`mimeType = ${qStr(mimeType)}`);
    const url = `/drive/v3/files?q=${encodeURIComponent(parts.join(' and '))}&fields=${encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink)')}&pageSize=200&${common}`;
    const res = await request('GET', url);
    return res.files || [];
  }

  async function findFolderByName(name) {
    const parts = [`name = ${qStr(name)}`, `mimeType = ${qStr(FOLDER_MIME)}`, 'trashed = false'];
    const url = `/drive/v3/files?q=${encodeURIComponent(parts.join(' and '))}&fields=${encodeURIComponent('files(id,name,modifiedTime)')}&pageSize=20&${common}`;
    const res = await request('GET', url);
    return (res.files || [])[0] || null;
  }

  async function getFile(fileId) {
    return request('GET', `/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent('id,name,mimeType,modifiedTime,webViewLink')}&supportsAllDrives=true`);
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

  async function createMultipartFile({ name, parentId, targetMimeType, contentMimeType, buf }) {
    const boundary = `robos-shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({
      name,
      mimeType: targetMimeType,
      ...(parentId ? { parents: [parentId] } : {}),
    });
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentMimeType}\r\n\r\n`),
      Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8'),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    return request('POST', `/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink&supportsAllDrives=true`, {
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: payload,
    });
  }

  async function updateFileMedia(fileId, contentMimeType, buf) {
    return request('PATCH', `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime&supportsAllDrives=true`, {
      headers: { 'Content-Type': contentMimeType },
      body: Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8'),
    });
  }

  async function exportGoogleDocText(docId) {
    const buf = await request('GET', `/drive/v3/files/${encodeURIComponent(docId)}/export?mimeType=${encodeURIComponent('text/plain')}`, { raw: true });
    return buf.toString('utf8');
  }

  async function downloadFile(fileId) {
    return request('GET', `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { raw: true });
  }

  async function sharePermission(fileId, email, role = 'writer', message = '') {
    const params = new URLSearchParams({ sendNotificationEmail: 'true', supportsAllDrives: 'true', fields: 'id,emailAddress,role' });
    if (message) params.set('emailMessage', message);
    return request('POST', `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?${params}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role, emailAddress: email }),
    });
  }

  return {
    listChildren,
    findFolderByName,
    getFile,
    createFolder,
    createMultipartFile,
    updateFileMedia,
    exportGoogleDocText,
    downloadFile,
    sharePermission,
  };
}

/**
 * Performs a full sync of all shopping lists (Grocery, Target, Costco, + custom lists)
 * with Google Drive and native Google Docs:
 *   1. Resolves or creates `RobOS Household Shopping Lists` folder in Drive.
 *   2. If `direction === 'pull'` or `pullFirst === true`, exports existing Google Docs (`text/plain`)
 *      to capture items checked off or added directly inside the Google Docs mobile app!
 *   3. Renders mobile-friendly HTML and creates/updates a native Google Doc (`application/vnd.google-apps.document`)
 *      for every shopping list.
 *   4. Writes canonical `shopping-lists.json` + serverless `Mobile-Form-Apps-Script` (`Code.gs`, `Index.html`)
 *      into the Drive folder.
 */
async function syncWithGoogleDrive({
  store,
  accountId,
  folderInput = '',
  appsScriptWebAppUrl,
  mobileLanUrl = '',
  pullFromDocs = false,
  homeDir,
  tokens,
  fetchImpl,
}) {
  const snapBefore = store.getSnapshot();
  const effectiveAccountId = accountId || snapBefore.sync.accountId;
  if (!effectiveAccountId && !tokens) {
    throw new Error('Select a signed-in Google account first (or click Sign in with Google).');
  }

  const api = createGoogleDocsDriveApi({ accountId: effectiveAccountId, homeDir, tokens, fetchImpl });

  // 1. Resolve or create target Drive folder
  let folderId = folderInput ? parseDriveFolderId(folderInput) : snapBefore.sync.folderId;
  let folderName = DEFAULT_FOLDER_NAME;
  if (folderId) {
    try {
      const meta = await api.getFile(folderId);
      folderName = meta.name || DEFAULT_FOLDER_NAME;
    } catch {
      folderId = '';
    }
  }
  if (!folderId) {
    const existing = await api.findFolderByName(DEFAULT_FOLDER_NAME);
    if (existing) {
      folderId = existing.id;
      folderName = existing.name;
    } else {
      const created = await api.createFolder(DEFAULT_FOLDER_NAME);
      folderId = created.id;
      folderName = created.name || DEFAULT_FOLDER_NAME;
    }
  }

  const folderUrl = googleDriveFolderUrl(folderId);
  const children = await api.listChildren(folderId);
  const existingDocsByName = new Map(
    children.filter((f) => f.mimeType === GDOC_MIME).map((f) => [f.name, f]),
  );

  const docIds = { ...(snapBefore.sync.docIds || {}) };
  const docUrls = { ...(snapBefore.sync.docUrls || {}) };
  const effectiveWebAppUrl = appsScriptWebAppUrl !== undefined
    ? String(appsScriptWebAppUrl || '').trim()
    : (snapBefore.sync.appsScriptWebAppUrl || '');

  // Match or pre-create Google Doc shells so cross-links between Grocery / Target / Costco Docs all resolve!
  for (const list of snapBefore.lists) {
    const docTitle = list.docTitle || `${list.name} — RobOS Shopping List`;
    let docId = docIds[list.id] || existingDocsByName.get(docTitle)?.id || '';
    if (docId) {
      try {
        await api.getFile(docId);
      } catch {
        docId = '';
      }
    }
    if (!docId) {
      const stubHtml = `<!DOCTYPE html><html><body><p>Initializing ${list.name}…</p></body></html>`;
      const createdDoc = await api.createMultipartFile({
        name: docTitle,
        parentId: folderId,
        targetMimeType: GDOC_MIME,
        contentMimeType: 'text/html; charset=UTF-8',
        buf: stubHtml,
      });
      docId = createdDoc.id;
    }
    docIds[list.id] = docId;
    docUrls[list.id] = googleDocEditUrl(docId);
  }

  // 2. Optional pull from Google Docs mobile edits before pushing formatted Google Docs
  let pulledChanges = 0;
  if (pullFromDocs) {
    const freshSnap = store.getSnapshot();
    for (const list of freshSnap.lists) {
      const docId = docIds[list.id];
      if (!docId) continue;
      if (!existingDocsByName.has(list.docTitle || `${list.name} — RobOS Shopping List`) && !snapBefore.sync.docIds?.[list.id]) {
        continue; // brand-new stub just created above
      }
      try {
        const plain = await api.exportGoogleDocText(docId);
        const parsed = parseGoogleDocText(plain, list);
        if (parsed.length > 0) {
          store.replaceListItemsFromSync(list.id, parsed);
          pulledChanges += 1;
        }
      } catch {}
    }
  }

  // 3. Push fresh mobile-formatted HTML into each native Google Doc
  const syncedAt = new Date().toISOString();
  const currentSnap = store.getSnapshot();
  for (const list of currentSnap.lists) {
    const docId = docIds[list.id];
    const html = renderGoogleDocHtml(list, {
      syncedAt,
      appsScriptWebAppUrl: effectiveWebAppUrl,
      mobileLanUrl,
      folderUrl,
      docUrls,
    });
    await api.updateFileMedia(docId, 'text/html; charset=UTF-8', html);
  }

  // 4. Write canonical `shopping-lists.json` in the Drive folder
  const jsonPayload = JSON.stringify(
    {
      schema: currentSnap.schema,
      activeListId: currentSnap.activeListId,
      lists: currentSnap.lists,
      sync: {
        folderId,
        folderUrl,
        docIds,
        docUrls,
        appsScriptWebAppUrl: effectiveWebAppUrl,
        lastSyncedAt: syncedAt,
      },
      updatedAt: syncedAt,
    },
    null,
    2,
  );
  const existingJson = children.find((f) => f.name === STATE_JSON_NAME && f.mimeType !== FOLDER_MIME);
  let manifestFileId = existingJson?.id || '';
  if (manifestFileId) {
    await api.updateFileMedia(manifestFileId, 'application/json; charset=UTF-8', jsonPayload);
  } else {
    const createdJson = await api.createMultipartFile({
      name: STATE_JSON_NAME,
      parentId: folderId,
      targetMimeType: 'application/json',
      contentMimeType: 'application/json; charset=UTF-8',
      buf: jsonPayload,
    });
    manifestFileId = createdJson.id;
  }

  // 5. Ensure `Mobile-Form-Apps-Script` subfolder holds up-to-date `Code.gs` and `Index.html`
  let scriptFolder = children.find((f) => f.name === APPS_SCRIPT_SUBFOLDER && f.mimeType === FOLDER_MIME);
  if (!scriptFolder) {
    scriptFolder = await api.createFolder(APPS_SCRIPT_SUBFOLDER, folderId);
  }
  const scriptChildren = await api.listChildren(scriptFolder.id);
  const codeGsContent = generateAppsScriptCodeGs({ folderId, docIds });
  const indexHtmlContent = generateAppsScriptIndexHtml();

  for (const [fname, mime, content] of [
    ['Code.gs', 'text/plain; charset=UTF-8', codeGsContent],
    ['Index.html', 'text/html; charset=UTF-8', indexHtmlContent],
  ]) {
    const found = scriptChildren.find((f) => f.name === fname);
    if (found) {
      await api.updateFileMedia(found.id, mime, content);
    } else {
      await api.createMultipartFile({
        name: fname,
        parentId: scriptFolder.id,
        targetMimeType: mime.split(';')[0],
        contentMimeType: mime,
        buf: content,
      });
    }
  }

  const nextState = store.updateSyncConfig({
    accountId: effectiveAccountId,
    folderId,
    folderName,
    folderUrl,
    manifestFileId,
    appsScriptFolderId: scriptFolder.id,
    appsScriptWebAppUrl: effectiveWebAppUrl,
    docIds,
    docUrls,
    lastSyncedAt: syncedAt,
    lastSyncStatus: 'ok',
    lastSyncMessage: `Synced ${currentSnap.lists.length} Google Docs (${currentSnap.lists.map((l) => l.name).join(', ')}) to Google Drive.`,
  });

  return {
    ok: true,
    folderId,
    folderUrl,
    docIds,
    docUrls,
    pulledChanges,
    syncedAt,
    state: nextState,
  };
}

async function shareShoppingFolder({ accountId, folderId, emails = [], role = 'writer', homeDir, tokens, fetchImpl }) {
  if (!folderId) throw new Error('Sync your shopping lists to Google Drive first to create the folder.');
  const cleanEmails = emails.map((e) => String(e || '').trim()).filter(Boolean);
  if (!cleanEmails.length) throw new Error('Enter at least one email address to share with.');
  const api = createGoogleDocsDriveApi({ accountId, homeDir, tokens, fetchImpl });
  const results = [];
  for (const email of cleanEmails) {
    try {
      await api.sharePermission(
        folderId,
        email,
        role,
        'Shared RobOS Household Shopping Lists (Grocery, Target, Costco) on Google Drive & Google Docs.',
      );
      results.push({ email, ok: true, role });
    } catch (err) {
      results.push({ email, ok: false, error: err.message });
    }
  }
  return results;
}

module.exports = {
  FOLDER_MIME,
  GDOC_MIME,
  DEFAULT_FOLDER_NAME,
  STATE_JSON_NAME,
  APPS_SCRIPT_SUBFOLDER,
  googleDocEditUrl,
  googleDriveFolderUrl,
  parseDriveFolderId,
  listGoogleAccounts,
  signInGoogleAccount,
  syncWithGoogleDrive,
  shareShoppingFolder,
};
