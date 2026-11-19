'use strict';

/**
 * Google Docs & Google Drive publisher for RobOS Camera Watch Web Browser Sharing.
 *
 * Uses the same security model as `packages/shopping-lists/lib/google-drive-sync.js`:
 *  - Creates or opens the private `RobOS Camera Watch` folder in the user's Google Drive
 *  - Creates or updates a native Google Doc (`application/vnd.google-apps.document`)
 *    embedding the authenticated Cloudflare HTTPS link (`https://<tunnel>.trycloudflare.com/?auth=<256-bit-key>`)
 *  - Because the Google Doc lives in Google Drive, access is gated by Google Login; sharing
 *    the Google Doc with a family member or trusted guest gives them 1-tap browser access
 *    without exposing inbound router ports or requiring a custom app/VPN.
 */

const path = require('node:path');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GDOC_MIME = 'application/vnd.google-apps.document';
const DEFAULT_FOLDER_NAME = 'RobOS Camera Watch';

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

function formatTimestamp(isoStr) {
  const d = isoStr ? new Date(isoStr) : new Date();
  if (Number.isNaN(d.getTime())) return String(isoStr || '');
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function googleDocEditUrl(docId) {
  const base = (process.env.ROBOS_GDOCS_WEB_BASE || 'https://docs.google.com').replace(/\/+$/, '');
  return `${base}/document/d/${docId}/edit`;
}

function googleDriveFolderUrl(folderId) {
  const base = (process.env.ROBOS_GDRIVE_WEB_BASE || 'https://drive.google.com').replace(/\/+$/, '');
  return `${base}/drive/folders/${folderId}`;
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
        isDefault: Boolean(a.isDefault),
      }));
  } catch {
    return [];
  }
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
    const url = `/drive/v3/files?q=${encodeURIComponent(parts.join(' and '))}&fields=${encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink)')}&pageSize=100&${common}`;
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
    const boundary = `robos-cam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

  async function sharePermission(fileId, email, role = 'reader', message = '', { sendNotificationEmail = true } = {}) {
    const params = new URLSearchParams({
      sendNotificationEmail: sendNotificationEmail ? 'true' : 'false',
      supportsAllDrives: 'true',
      fields: 'id,emailAddress,role,displayName',
    });
    if (message && sendNotificationEmail) params.set('emailMessage', message);
    return request('POST', `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?${params}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role, emailAddress: email }),
    });
  }

  async function listPermissions(fileId) {
    const params = new URLSearchParams({
      supportsAllDrives: 'true',
      fields: 'permissions(id,emailAddress,role,displayName,type)',
    });
    const res = await request('GET', `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?${params}`);
    return res.permissions || [];
  }

  async function deletePermission(fileId, permissionId) {
    const params = new URLSearchParams({ supportsAllDrives: 'true' });
    return request('DELETE', `/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?${params}`);
  }

  return {
    listChildren,
    findFolderByName,
    getFile,
    createFolder,
    createMultipartFile,
    updateFileMedia,
    sharePermission,
    listPermissions,
    deletePermission,
  };
}

function maskEmailAddress(email = '') {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at <= 0) return s;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}***@${domain}`;
}

function isRoutableGoogleEmail(email = '') {
  const s = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && !s.endsWith('@robos.local');
}

function loadRobosPeople({ configDir } = {}) {
  try {
    const ps = requireRobosLib('people-store');
    return ps.loadAllPeople({ configDir, includePhotoDataUrl: false });
  } catch {
    return [];
  }
}

function resolveEffectiveGoogleAccount({ accountId = '', webConfig = {}, homeDir, tokens } = {}) {
  const accounts = listGoogleAccounts({ homeDir });
  let effectiveAccountId = accountId || webConfig.accountId || '';
  if (!effectiveAccountId && !tokens) {
    const chosen = accounts.find((a) => a.isDefault) || accounts[0];
    if (chosen) effectiveAccountId = chosen.id;
  }
  const ownerEmail = accounts.find((a) => a.id === effectiveAccountId)?.email || webConfig.ownerEmail || '';
  return { accounts, effectiveAccountId, ownerEmail };
}

/**
 * Renders clean, human-readable Google Doc HTML with the 1-tap Cloudflare HTTPS + 256-bit
 * capability launch link prominently at the top.
 */
function renderCameraGoogleDocHtml({
  cameras = [],
  authedTunnelUrl = '',
  publicTunnelUrl = '',
  authedLanUrl = '',
  folderUrl = '',
  ownerEmail = '',
  syncedAt = new Date().toISOString(),
}) {
  const primaryName = cameras.length === 1
    ? cameras[0].name
    : (cameras.length > 1 ? `${cameras.length} Live Cameras (${cameras.map((c) => c.name).join(', ')})` : 'RobOS Live Camera');
  const launchHref = authedTunnelUrl || authedLanUrl;
  const formattedSync = formatTimestamp(syncedAt);

  const calloutHtml = launchHref
    ? `
      <table style="width:100%;border-collapse:collapse;margin:12px 0 16px 0;border:3px solid #0284c7;background-color:#f0f9ff;">
        <tr>
          <td style="padding:18px 20px;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:16pt;font-weight:bold;line-height:1.35;">
              <a href="${escHtml(launchHref)}" style="color:#0369a1;text-decoration:underline;font-weight:bold;">📹 CLICK HERE TO WATCH LIVE CAMERA IN YOUR BROWSER</a>
            </p>
            <p style="margin:0 0 10px 0;font-size:11pt;">
              <a href="${escHtml(launchHref)}" style="color:#0284c7;text-decoration:none;font-weight:bold;">📱 Open ${escHtml(primaryName)} Live Stream, Fullscreen, Zoom &amp; Flashlight Controls →</a>
            </p>
            <p style="margin:0;padding:8px 12px;background-color:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;font-size:10pt;font-weight:bold;">
              🔒 Protected by Google Login + Outbound Cloudflare HTTPS Tunnel: tapping the link above sets a 1-year encrypted session cookie in your browser (works over 5G cellular or any Wi-Fi with zero VPN or app install).
            </p>
          </td>
        </tr>
      </table>`
    : `<p style="color:#b91c1c;font-weight:bold;">Waiting for Cloudflare HTTPS tunnel URL — start <code>node packages/camera-watch/serve-web.js</code> to activate the live external link.</p>`;

  const rowsHtml = cameras.map((cam) => {
    const camHref = launchHref
      ? `${launchHref}${launchHref.includes('?') ? '&' : '?'}camera=${encodeURIComponent(cam.id)}`
      : '';
    return `
      <tr>
        <td style="padding:10px 12px;border:1px solid #cbd5e1;font-weight:bold;color:#0f172a;">
          ${camHref ? `<a href="${escHtml(camHref)}" style="color:#0369a1;text-decoration:underline;font-weight:bold;">📹 ${escHtml(cam.name)}</a>` : escHtml(cam.name)}
        </td>
        <td style="padding:10px 12px;border:1px solid #cbd5e1;color:#334155;">${escHtml(cam.room || 'Smart Home')}</td>
        <td style="padding:10px 12px;border:1px solid #cbd5e1;color:#334155;">Live Browser Stream · Snapshot · 1x/2x/4x Zoom · Flashlight · Flip Lens</td>
        <td style="padding:10px 12px;border:1px solid #cbd5e1;color:#047857;font-weight:bold;">Online (Cloudflare HTTPS)</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escHtml(primaryName)} — RobOS Live Camera</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
  <h1 style="margin:0 0 4px 0;font-size:20pt;color:#0f172a;">📹 ${escHtml(primaryName)} — Live Browser Access</h1>
  <p style="margin:0 0 12px 0;font-size:10pt;color:#475569;">
    Managed by <strong>RobOS Camera Watch &amp; RobOS IP Camera</strong>${ownerEmail ? ` · Owner: <strong>${escHtml(ownerEmail)}</strong>` : ''} · Tunnel updated: <strong>${escHtml(formattedSync)}</strong>
    ${folderUrl ? ` · <a href="${escHtml(folderUrl)}" style="color:#0284c7;text-decoration:none;font-weight:bold;">📁 Google Drive Folder</a>` : ''}
  </p>

  ${calloutHtml}

  <h2 style="font-size:13pt;color:#0f172a;margin:18px 0 8px 0;">Included Live Cameras</h2>
  <table style="width:100%;border-collapse:collapse;font-size:10.5pt;">
    <thead>
      <tr style="background-color:#f1f5f9;">
        <th style="padding:9px 12px;border:1px solid #cbd5e1;text-align:left;">CAMERA</th>
        <th style="padding:9px 12px;border:1px solid #cbd5e1;text-align:left;">LOCATION</th>
        <th style="padding:9px 12px;border:1px solid #cbd5e1;text-align:left;">BROWSER CONTROLS</th>
        <th style="padding:9px 12px;border:1px solid #cbd5e1;text-align:left;">EXTERNAL ACCESS</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <h2 style="font-size:13pt;color:#0f172a;margin:20px 0 6px 0;">How to Share This Camera Securely with Another Person</h2>
  <ol style="font-size:10.5pt;color:#334155;margin:0 0 14px 0;padding-left:22px;">
    <li>Click the blue <strong>Share</strong> button at the top-right of this Google Doc and add their Google email as a <strong>Viewer</strong>.</li>
    <li>Google requires them to sign in to their Google account before opening this document.</li>
    <li>When they tap <strong>CLICK HERE TO WATCH LIVE CAMERA IN YOUR BROWSER</strong> above, the outbound Cloudflare HTTPS tunnel verifies the embedded 256-bit key, sets a 1-year <code>HttpOnly; Secure</code> cookie in their browser, and opens the live camera view — with zero router ports opened on your home network.</li>
    <li>To revoke access later, remove them from this Google Doc and click <strong>Rotate Browser Key</strong> in RobOS Camera Watch.</li>
  </ol>

  ${publicTunnelUrl ? `<p style="font-size:9.5pt;color:#64748b;">Cloudflare Edge Endpoint (returns <code>401 Protected by Google Login</code> without this document's launch link): <code>${escHtml(publicTunnelUrl)}</code>${authedLanUrl ? ` · Home Wi-Fi Direct Link: <a href="${escHtml(authedLanUrl)}" style="color:#0284c7;">LAN Browser View</a>` : ''}</p>` : ''}
</body>
</html>`;
}

/**
 * Creates or updates the Google Doc in the user's Google Drive with the live Cloudflare HTTPS
 * authenticated camera viewer URL.
 */
async function syncCameraGoogleDoc({
  cameras = [],
  webConfig = {},
  authedTunnelUrl = '',
  publicTunnelUrl = '',
  authedLanUrl = '',
  shareWithEmail = '',
  accountId = '',
  homeDir,
  tokens,
  fetchImpl,
}) {
  const accounts = listGoogleAccounts({ homeDir });
  let effectiveAccountId = accountId || webConfig.accountId || '';
  if (!effectiveAccountId && !tokens) {
    const chosen = accounts.find((a) => a.isDefault) || accounts[0];
    if (chosen) effectiveAccountId = chosen.id;
  }
  if (!effectiveAccountId && !tokens) {
    throw new Error('Sign in with Google in RobOS Cloud Accounts or Preferences first.');
  }
  const ownerEmail = accounts.find((a) => a.id === effectiveAccountId)?.email || '';
  const api = createGoogleDocsDriveApi({ accountId: effectiveAccountId, homeDir, tokens, fetchImpl });

  // 1. Resolve or create `RobOS Camera Watch` folder in Google Drive
  let folderId = webConfig.folderId || '';
  if (folderId) {
    try {
      await api.getFile(folderId);
    } catch {
      folderId = '';
    }
  }
  if (!folderId) {
    const found = await api.findFolderByName(DEFAULT_FOLDER_NAME);
    folderId = found ? found.id : (await api.createFolder(DEFAULT_FOLDER_NAME)).id;
  }
  const folderUrl = googleDriveFolderUrl(folderId);

  // 2. Render Google Doc HTML
  const primaryTitle = cameras.length === 1
    ? `${cameras[0].name} — RobOS Live Camera`
    : 'RobOS Camera Watch — Live Cameras';
  const syncedAt = new Date().toISOString();
  const html = renderCameraGoogleDocHtml({
    cameras,
    authedTunnelUrl,
    publicTunnelUrl,
    authedLanUrl,
    folderUrl,
    ownerEmail,
    syncedAt,
  });

  // 3. Create or update the native Google Doc
  let docId = webConfig.docId || '';
  if (docId) {
    try {
      await api.updateFileMedia(docId, 'text/html; charset=UTF-8', Buffer.from(html, 'utf8'));
    } catch {
      docId = '';
    }
  }
  if (!docId) {
    const existingDocs = await api.listChildren(folderId, { name: primaryTitle, mimeType: GDOC_MIME });
    if (existingDocs.length > 0) {
      docId = existingDocs[0].id;
      await api.updateFileMedia(docId, 'text/html; charset=UTF-8', Buffer.from(html, 'utf8'));
    } else {
      const created = await api.createMultipartFile({
        name: primaryTitle,
        parentId: folderId,
        targetMimeType: GDOC_MIME,
        contentMimeType: 'text/html; charset=UTF-8',
        buf: Buffer.from(html, 'utf8'),
      });
      docId = created.id;
    }
  }

  const docUrl = googleDocEditUrl(docId);

  // 4. Optional: share with a recipient email right away
  if (shareWithEmail && shareWithEmail.includes('@')) {
    await api.sharePermission(
      docId,
      shareWithEmail.trim(),
      'reader',
      'Shared a live RobOS Camera Watch browser view with you. Open the Google Doc and tap the link at the top to watch.',
    );
  }

  return {
    accountId: effectiveAccountId,
    ownerEmail,
    folderId,
    folderUrl,
    docId,
    docUrl,
    docTitle: primaryTitle,
    syncedAt,
  };
}

/**
 * Lists all RobOS users from `people-store` annotated with whether the camera's Google Drive Doc
 * is currently shared with their Google account (`shared: true`, `permissionId`, `isOwner`).
 */
async function listRobosUsersWithShareStatus({
  webConfig = {},
  accountId = '',
  configDir,
  homeDir,
  tokens,
  fetchImpl,
  maskEmails = false,
} = {}) {
  const people = loadRobosPeople({ configDir });
  const { effectiveAccountId, ownerEmail } = resolveEffectiveGoogleAccount({ accountId, webConfig, homeDir, tokens });
  const ownerLower = String(ownerEmail || '').trim().toLowerCase();
  const docId = String(webConfig.docId || '').trim();

  // Map lowercase email -> { permissionId, role, displayName }
  const permByEmail = new Map();
  if (Array.isArray(webConfig.sharedUsers)) {
    for (const s of webConfig.sharedUsers) {
      if (s && s.email) {
        permByEmail.set(String(s.email).trim().toLowerCase(), {
          permissionId: String(s.permissionId || ''),
          role: String(s.role || 'reader'),
          displayName: String(s.name || ''),
        });
      }
    }
  }

  if (docId && (effectiveAccountId || tokens)) {
    try {
      const api = createGoogleDocsDriveApi({ accountId: effectiveAccountId, homeDir, tokens, fetchImpl });
      const livePerms = await api.listPermissions(docId);
      permByEmail.clear();
      for (const p of livePerms) {
        const em = String(p.emailAddress || '').trim().toLowerCase();
        if (!em) continue;
        permByEmail.set(em, {
          permissionId: String(p.id || ''),
          role: String(p.role || 'reader'),
          displayName: String(p.displayName || ''),
        });
      }
    } catch {
      // Keep cached sharedUsers fallback if offline or token not needed yet
    }
  }

  const matchedEmails = new Set();
  const users = people.map((p) => {
    const rawEmail = String(p.email || '').trim();
    const lower = rawEmail.toLowerCase();
    if (lower) matchedEmails.add(lower);
    const perm = lower ? permByEmail.get(lower) : null;
    const isOwner = Boolean((ownerLower && lower === ownerLower) || perm?.role === 'owner');
    const canShare = isRoutableGoogleEmail(rawEmail) && !isOwner;
    const shared = Boolean(!isOwner && perm && perm.role !== 'owner');
    return {
      uid: p.uid,
      name: p.displayName || p.name || p.uid,
      nickname: p.nickname || '',
      avatar: p.avatar || p.gameProfile?.avatar || '👤',
      color: p.color || '#00bcd4',
      groups: Array.isArray(p.groups) ? p.groups.slice(0, 3) : [],
      relationshipRole: p.relationshipRole || '',
      email: maskEmails ? maskEmailAddress(rawEmail) : rawEmail,
      hasGoogleEmail: isRoutableGoogleEmail(rawEmail),
      canShare,
      isOwner,
      shared,
      permissionId: shared ? (perm?.permissionId || '') : '',
      role: isOwner ? 'owner' : (shared ? (perm?.role || 'reader') : ''),
    };
  });

  // Sort: shareable RobOS users first (shared at top, then alphabetical), owner last
  users.sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? 1 : -1;
    if (a.hasGoogleEmail !== b.hasGoogleEmail) return a.hasGoogleEmail ? -1 : 1;
    if (a.shared !== b.shared) return a.shared ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const extraShares = [];
  for (const [lower, perm] of permByEmail.entries()) {
    if (matchedEmails.has(lower) || perm.role === 'owner' || lower === ownerLower) continue;
    extraShares.push({
      email: maskEmails ? maskEmailAddress(lower) : lower,
      name: perm.displayName || (maskEmails ? maskEmailAddress(lower) : lower),
      permissionId: perm.permissionId,
      role: perm.role,
    });
  }

  return {
    docId,
    docUrl: docId ? googleDocEditUrl(docId) : (webConfig.docUrl || ''),
    docTitle: webConfig.docTitle || '',
    folderUrl: webConfig.folderUrl || '',
    publicTunnelUrl: webConfig.publicTunnelUrl || '',
    ownerEmail: maskEmails ? maskEmailAddress(ownerEmail) : ownerEmail,
    users,
    extraShares,
  };
}

/**
 * Ensures the camera's Google Doc is up to date in Google Drive with the live Cloudflare HTTPS
 * link, and grants Google Drive Viewer (`reader`) access to the selected RobOS user.
 */
async function shareWithRobosUser({
  uid = '',
  email = '',
  cameras = [],
  webConfig = {},
  authedTunnelUrl = '',
  publicTunnelUrl = '',
  authedLanUrl = '',
  accountId = '',
  configDir,
  homeDir,
  tokens,
  fetchImpl,
  sendNotificationEmail = true,
}) {
  const people = loadRobosPeople({ configDir });
  const person = uid ? people.find((p) => p.uid === uid) : null;
  if (uid && !person && !email) {
    throw new Error(`RobOS user "${uid}" was not found.`);
  }
  const targetEmail = String(email || person?.email || '').trim();
  if (!isRoutableGoogleEmail(targetEmail)) {
    const label = person ? (person.displayName || person.uid) : 'that RobOS user';
    throw new Error(`Add a Google email address for ${label} first.`);
  }

  const synced = await syncCameraGoogleDoc({
    cameras,
    webConfig,
    authedTunnelUrl,
    publicTunnelUrl,
    authedLanUrl,
    accountId,
    homeDir,
    tokens,
    fetchImpl,
  });

  const api = createGoogleDocsDriveApi({
    accountId: synced.accountId,
    homeDir,
    tokens,
    fetchImpl,
  });

  const recipientLabel = person?.displayName || targetEmail;
  const perm = await api.sharePermission(
    synced.docId,
    targetEmail,
    'reader',
    `Shared live RobOS Camera access (${synced.docTitle}) with you. Open this Google Doc and tap "CLICK HERE TO WATCH LIVE CAMERA IN YOUR BROWSER" at the top.`,
    { sendNotificationEmail },
  );

  return {
    ...synced,
    sharedWith: {
      uid: person?.uid || '',
      name: recipientLabel,
      email: targetEmail,
      permissionId: String(perm?.id || ''),
      role: String(perm?.role || 'reader'),
    },
  };
}

/**
 * Revokes a RobOS user's Google Drive permission on the camera Google Doc and optionally updates
 * the Google Doc with a newly rotated 256-bit Cloudflare session token.
 */
async function revokeRobosUserShare({
  uid = '',
  email = '',
  permissionId = '',
  cameras = [],
  webConfig = {},
  authedTunnelUrl = '',
  publicTunnelUrl = '',
  authedLanUrl = '',
  accountId = '',
  configDir,
  homeDir,
  tokens,
  fetchImpl,
}) {
  const docId = String(webConfig.docId || '').trim();
  if (!docId) {
    throw new Error('No camera Google Doc exists yet.');
  }
  const people = loadRobosPeople({ configDir });
  const person = uid ? people.find((p) => p.uid === uid) : null;
  const targetEmail = String(email || person?.email || '').trim().toLowerCase();

  const { effectiveAccountId } = resolveEffectiveGoogleAccount({ accountId, webConfig, homeDir, tokens });
  if (!effectiveAccountId && !tokens) {
    throw new Error('Sign in with Google in RobOS Cloud Accounts or Preferences first.');
  }
  const api = createGoogleDocsDriveApi({ accountId: effectiveAccountId, homeDir, tokens, fetchImpl });

  let resolvedPermId = String(permissionId || '').trim();
  if (!resolvedPermId && targetEmail) {
    const perms = await api.listPermissions(docId);
    const hit = perms.find((p) => p.role !== 'owner' && String(p.emailAddress || '').trim().toLowerCase() === targetEmail);
    if (hit?.id) resolvedPermId = String(hit.id);
  }
  if (!resolvedPermId && targetEmail && Array.isArray(webConfig.sharedUsers)) {
    const cached = webConfig.sharedUsers.find((s) => String(s.email || '').trim().toLowerCase() === targetEmail);
    if (cached?.permissionId) resolvedPermId = String(cached.permissionId);
  }
  if (resolvedPermId) {
    await api.deletePermission(docId, resolvedPermId);
  }

  let synced = null;
  if (authedTunnelUrl || authedLanUrl) {
    synced = await syncCameraGoogleDoc({
      cameras,
      webConfig,
      authedTunnelUrl,
      publicTunnelUrl: publicTunnelUrl || webConfig.publicTunnelUrl || '',
      authedLanUrl,
      accountId: effectiveAccountId,
      homeDir,
      tokens,
      fetchImpl,
    });
  }

  return {
    revoked: true,
    uid: person?.uid || uid || '',
    email: targetEmail,
    permissionId: resolvedPermId,
    ...(synced || {}),
  };
}

module.exports = {
  createGoogleDocsDriveApi,
  listGoogleAccounts,
  loadRobosPeople,
  listRobosUsersWithShareStatus,
  shareWithRobosUser,
  revokeRobosUserShare,
  renderCameraGoogleDocHtml,
  syncCameraGoogleDoc,
  googleDocEditUrl,
  googleDriveFolderUrl,
  maskEmailAddress,
};
