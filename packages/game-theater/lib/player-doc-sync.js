'use strict';

/**
 * RobOS AI Multiplayer Game Theater — Per-Player Google Doc Launch Sync.
 *
 * Uses the exact same Google Drive v3 + Google Docs HTML upload & permission sharing
 * architecture as `packages/google-calendar/lib/access-doc-sync.js` and `packages/shopping-lists`:
 *   - Creates/reuses Drive folder: "RobOS AI Multiplayer Game Theater"
 *   - Creates ONE dedicated Google Doc per player:
 *       "RobOS Game Theater — <Player Name> (Player Launch Doc)"
 *     containing a prominent 1-click Launch Button (`?auth=<256-bit-player-token>`)
 *     that opens the Godot 4 HTTPS Web Client and uniquely identifies them as that RobOS Game User.
 *   - Shares each player's Google Doc (`role: 'reader'`) ONLY with that player's Google account.
 *   - Creates/updates an owner-only "RobOS AI Multiplayer Game Theater — Host Directory" Google Doc.
 */

const path = require('node:path');
const {
  loadRawSettings,
  updateTheaterSettings,
  loadTheaterPlayers,
  upsertTheaterPlayer,
  buildPlayerLaunchUrl,
} = require('./player-registry');
const { detectLanIp } = require('./tls-cert');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GDOC_MIME = 'application/vnd.google-apps.document';
const DEFAULT_FOLDER_NAME = 'RobOS AI Multiplayer Game Theater';
const HOST_DIRECTORY_DOC_TITLE = 'RobOS AI Multiplayer Game Theater — Host Directory';

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

function getPlayerLaunchDocTitle(player = {}) {
  const cleanName = String(player.name || player.shortName || player.uid || 'Player').trim();
  return `RobOS Game Theater — ${cleanName} (Player Launch Doc)`;
}

function isShareableEmail(email, ownerEmail = '') {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) return false;
  if (clean.endsWith('.local') || clean.endsWith('@localhost')) return false;
  if (ownerEmail && clean === String(ownerEmail).trim().toLowerCase()) return false;
  return true;
}

/**
 * Renders the HTML for an individual RobOS Game User's personal Google Doc Launcher.
 */
function renderPlayerLaunchDocHtml(player, options = {}) {
  const primaryBaseUrl = String(
    options.webAppUrl ||
    options.publicTunnelUrl ||
    options.lanHttpsUrl ||
    `https://${detectLanIp()}:${Number(process.env.GAME_THEATER_HTTPS_PORT || 19229)}`,
  ).replace(/\/+$/, '');

  const lanHttpsBaseUrl = String(
    options.lanHttpsUrl ||
    `https://${detectLanIp()}:${Number(process.env.GAME_THEATER_HTTPS_PORT || 19229)}`,
  ).replace(/\/+$/, '');

  const launchUrl = buildPlayerLaunchUrl(primaryBaseUrl, player);
  const lanLaunchUrl = buildPlayerLaunchUrl(lanHttpsBaseUrl, player);
  const docTitle = getPlayerLaunchDocTitle(player);
  const activeGameTitle = options.activeGameTitle || 'Dynamic AI Multiplayer Stage (Create or Pick Any Game in Lobby)';
  const syncedAt = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escHtml(docTitle)}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.45;">
  <h1 style="margin:0 0 4px 0;font-size:20pt;color:#0f172a;">🎭 ${escHtml(player.avatar || '🎮')} ${escHtml(player.name)} — RobOS AI Multiplayer Game Theater</h1>
  <p style="margin:0 0 12px 0;font-size:10pt;color:#475569;">
    Personal RobOS Game User Pass · Godot 4 HTTPS Web Client · Updated ${escHtml(syncedAt)}
  </p>

  <table style="width:100%;border-collapse:collapse;margin:10px 0 14px 0;border:2px solid #cbd5e1;background-color:#f8fafc;">
    <tr>
      <td style="padding:12px 16px;">
        <p style="margin:0 0 4px 0;font-size:10.5pt;font-weight:bold;color:#0f172a;">🪪 Authenticated RobOS Player Identity:</p>
        <p style="margin:0;font-size:11pt;color:#1e293b;">
          <strong>${escHtml(player.avatar || '🎮')} ${escHtml(player.name)}</strong>
          &nbsp;·&nbsp; GamerTag: <strong>@${escHtml(player.gamerTag || player.shortName || player.uid)}</strong>
          &nbsp;·&nbsp; RobOS ID: <code>${escHtml(player.uid)}</code>
        </p>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;margin:14px 0 18px 0;border:3px solid #0284c7;background-color:#eff6ff;">
    <tr>
      <td style="padding:24px 20px;text-align:center;">
        <p style="margin:0 0 10px 0;font-size:17.5pt;font-weight:bold;line-height:1.35;">
          <a href="${escHtml(launchUrl)}" style="color:#0369a1;text-decoration:underline;font-weight:bold;">👉 CLICK THIS TO LAUNCH ROBOS AI MULTIPLAYER GAME THEATER AS ${escHtml(String(player.shortName || player.name).toUpperCase())}</a>
        </p>
        <p style="margin:0 0 14px 0;font-size:11pt;">
          <a href="${escHtml(launchUrl)}" style="color:#0284c7;text-decoration:none;font-weight:bold;">🎮 Enter the Godot 4 Multiplayer Lobby, Play Live Games, or Ask the RobOS Agent to Create / Change Any Game →</a>
        </p>
        ${
          lanLaunchUrl !== launchUrl
            ? `<p style="margin:0 0 12px 0;font-size:10pt;color:#334155;">
                <strong>Home Wi-Fi Direct HTTPS Link:</strong> &nbsp;
                <a href="${escHtml(lanLaunchUrl)}" style="color:#0f766e;text-decoration:underline;font-weight:bold;">🔒 Open Direct LAN HTTPS Godot 4 Client (${escHtml(lanHttpsBaseUrl)}) ↗</a>
              </p>`
            : ''
        }
        <p style="margin:0 0 10px 0;font-size:10pt;color:#1e293b;">
          <strong>Current Stage:</strong> ${escHtml(activeGameTitle)}
        </p>
        <p style="margin:0;padding:9px 12px;background-color:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:10pt;font-weight:bold;">
          ⚠️ DO NOT SHARE OR EDIT THIS DOC — Your launch button contains your personal RobOS Game User token so the lobby knows it is you (${escHtml(player.name)}).
        </p>
      </td>
    </tr>
  </table>

  <h2 style="font-size:12.5pt;color:#0f172a;margin:14px 0 6px 0;">✨ What You Can Do Inside the Theater</h2>
  <ul style="margin:0 0 14px 18px;padding:0;font-size:10pt;color:#334155;">
    <li style="margin-bottom:5px;"><strong>1-Click Sign-In:</strong> Clicking the launch button above logs you directly into the Godot 4 HTTPS Web Client as <strong>${escHtml(player.name)} (@${escHtml(player.gamerTag)})</strong>.</li>
    <li style="margin-bottom:5px;"><strong>Multiplayer Lobby:</strong> See who else is online in the lobby, claim a player seat, and play live multiplayer matches together.</li>
    <li style="margin-bottom:5px;"><strong>Dynamic AI Game Creation:</strong> Any RobOS Game User in the lobby can describe a brand-new multiplayer game — the RobOS Agent writes both the authoritative multiplayer server and the Godot 4 client on the fly!</li>
    <li style="margin-bottom:5px;"><strong>Live Game Evolution:</strong> Want new rules, visuals, scoring, or turn mechanics? Any player can ask the RobOS Agent to modify the current game and everyone's Godot 4 client hot-reloads automatically.</li>
  </ul>
</body>
</html>`;
}

/**
 * Renders the owner-only Host Directory Google Doc linking to each player's individual Launch Doc.
 */
function renderHostDirectoryDocHtml(players = [], options = {}) {
  const primaryBaseUrl = String(
    options.webAppUrl ||
    options.publicTunnelUrl ||
    options.lanHttpsUrl ||
    `https://${detectLanIp()}:${Number(process.env.GAME_THEATER_HTTPS_PORT || 19229)}`,
  ).replace(/\/+$/, '');

  const syncedAt = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const rowsHtml = players
    .map((p) => {
      const launchUrl = buildPlayerLaunchUrl(primaryBaseUrl, p);
      const docCell = p.docUrl
        ? `<a href="${escHtml(p.docUrl)}" style="color:#7c3aed;font-weight:bold;text-decoration:underline;">📄 Open ${escHtml(p.shortName || p.name)}'s Doc ↗</a>`
        : '<span style="color:#94a3b8;">—</span>';
      return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${escHtml(p.avatar || '🎮')} ${escHtml(p.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#0f766e;font-weight:bold;">@${escHtml(p.gamerTag || p.uid)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">${escHtml(p.email || 'Local / Unset')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${docCell}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">
          <a href="${escHtml(launchUrl)}" style="color:#0284c7;font-weight:bold;text-decoration:underline;">🎮 Launch as ${escHtml(p.shortName || p.name)} ↗</a>
        </td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escHtml(HOST_DIRECTORY_DOC_TITLE)}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.45;">
  <h1 style="margin:0 0 4px 0;font-size:20pt;color:#0f172a;">🎭 RobOS AI Multiplayer Game Theater — Host Directory</h1>
  <p style="margin:0 0 14px 0;font-size:10pt;color:#475569;">
    Per-Player Google Doc Launchers &amp; Godot 4 HTTPS Endpoints · Updated ${escHtml(syncedAt)}
  </p>

  <table style="width:100%;border-collapse:collapse;margin:0 0 16px 0;border:1px solid #cbd5e1;font-size:10pt;">
    <thead>
      <tr style="background-color:#f1f5f9;">
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Player</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">GamerTag</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Shared Email</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Personal Launch Google Doc</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Direct Godot 4 Launch</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
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

  async function getAboutEmail() {
    try {
      const res = await request('GET', '/drive/v3/about?fields=user(emailAddress)');
      return String(res?.user?.emailAddress || '').trim();
    } catch {
      return '';
    }
  }

  async function findFolderByName(name) {
    const parts = [`name = ${qStr(name)}`, `mimeType = ${qStr(FOLDER_MIME)}`, 'trashed = false'];
    const url = `/drive/v3/files?q=${encodeURIComponent(parts.join(' and '))}&fields=${encodeURIComponent('files(id,name,modifiedTime)')}&pageSize=10&${common}`;
    const res = await request('GET', url);
    return (res.files || [])[0] || null;
  }

  async function createFolder(name, parentId) {
    return request('POST', '/drive/v3/files?fields=id,name&supportsAllDrives=true', {
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
    const boundary = `robos-theater-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
    return request(
      'POST',
      '/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink&supportsAllDrives=true',
      {
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
    );
  }

  async function updateFileMedia(fileId, contentMimeType, buf) {
    return request(
      'PATCH',
      `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,webViewLink&supportsAllDrives=true`,
      {
        headers: { 'Content-Type': contentMimeType },
        body: buf,
      },
    );
  }

  async function listPermissions(fileId) {
    const url = `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=${encodeURIComponent('permissions(id,type,role,emailAddress)')}&supportsAllDrives=true`;
    const res = await request('GET', url);
    return res?.permissions || [];
  }

  async function deletePermission(fileId, permissionId) {
    return request(
      'DELETE',
      `/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`,
    );
  }

  async function shareFile(fileId, { email, role = 'reader', sendNotificationEmail = false, emailMessage = '' } = {}) {
    const params = new URLSearchParams({
      sendNotificationEmail: sendNotificationEmail ? 'true' : 'false',
      supportsAllDrives: 'true',
    });
    if (sendNotificationEmail && emailMessage) {
      params.set('emailMessage', String(emailMessage));
    }
    return request(
      'POST',
      `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?${params.toString()}`,
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user',
          role,
          emailAddress: email,
        }),
      },
    );
  }

  return {
    getAboutEmail,
    findFolderByName,
    createFolder,
    listChildren,
    listPermissions,
    deletePermission,
    shareFile,
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
  };
}

/**
 * Creates or updates a dedicated Google Doc for EVERY RobOS Game Theater player
 * (or a subset via `options.onlyPlayerUids`) plus the Host Directory Google Doc.
 */
async function syncPlayerLaunchDocsWithGoogleDrive(options = {}) {
  const settings = loadRawSettings(options);
  const allPlayers = loadTheaterPlayers(options);
  const filterSet = Array.isArray(options.onlyPlayerUids) && options.onlyPlayerUids.length
    ? new Set(options.onlyPlayerUids)
    : null;
  const targetPlayers = filterSet ? allPlayers.filter((p) => filterSet.has(p.uid)) : allPlayers;

  const httpsPort = Number(options.httpsPort || process.env.GAME_THEATER_HTTPS_PORT || 19229);
  const lanHttpsUrl = options.lanHttpsUrl || settings.lanHttpsUrl || `https://${detectLanIp()}:${httpsPort}`;
  const primaryWebUrl = String(
    options.webAppUrl ||
    settings.publicTunnelUrl ||
    lanHttpsUrl,
  ).replace(/\/+$/, '');

  const api = options.driveApi || createGoogleDocsDriveApi({
    accountId: options.accountId || null,
    homeDir: options.homeDir,
    tokens: options.tokens,
    fetchImpl: options.fetchImpl,
  });

  const ownerEmail = options.ownerEmail || (typeof api.getAboutEmail === 'function' ? await api.getAboutEmail() : '');

  let folderId = options.folderId || settings.hostDoc?.folderId || '';
  if (!folderId) {
    const found = await api.findFolderByName(DEFAULT_FOLDER_NAME);
    if (found?.id) {
      folderId = found.id;
    } else {
      const created = await api.createFolder(DEFAULT_FOLDER_NAME);
      folderId = created.id;
    }
  }

  const syncedAt = new Date().toISOString();
  const existingPlayerDocs = { ...(settings.playerDocs || {}) };
  const syncedPlayerDocs = {};

  for (const player of targetPlayers) {
    const docTitle = getPlayerLaunchDocTitle(player);
    const html = renderPlayerLaunchDocHtml(player, {
      webAppUrl: primaryWebUrl,
      lanHttpsUrl,
      activeGameTitle: options.activeGameTitle || '',
    });

    let docId = existingPlayerDocs[player.uid]?.docId || '';
    if (!docId && folderId) {
      try {
        const found = await api.listChildren(folderId, { name: docTitle, mimeType: GDOC_MIME });
        if (found.length > 0) docId = found[0].id;
      } catch {}
    }

    if (docId) {
      try {
        await api.updateDocFromHtml(docId, html);
      } catch {
        const created = await api.createDocFromHtml({ name: docTitle, parentId: folderId, html });
        docId = created.id;
      }
    } else {
      const created = await api.createDocFromHtml({ name: docTitle, parentId: folderId, html });
      docId = created.id;
    }

    const docUrl = googleDocEditUrl(docId);
    const launchUrl = buildPlayerLaunchUrl(primaryWebUrl, player);
    const lanLaunchUrl = buildPlayerLaunchUrl(lanHttpsUrl, player);

    let sharedWithEmail = existingPlayerDocs[player.uid]?.sharedWithEmail || '';
    if (options.shareWithPlayers !== false && isShareableEmail(player.email, ownerEmail)) {
      try {
        await api.shareFile(docId, {
          email: player.email,
          role: 'reader',
          sendNotificationEmail: Boolean(options.sendNotificationEmail),
          emailMessage: options.emailMessage || '',
        });
        sharedWithEmail = player.email;
      } catch {}
    }

    const entry = {
      uid: player.uid,
      playerName: player.name,
      gamerTag: player.gamerTag,
      docId,
      docTitle,
      docUrl,
      launchUrl,
      lanLaunchUrl,
      sharedWithEmail,
      lastSyncedAt: syncedAt,
    };
    existingPlayerDocs[player.uid] = entry;
    syncedPlayerDocs[player.uid] = entry;
  }

  // Render & sync the Host Directory Google Doc
  const directoryPlayers = allPlayers.map((p) => ({
    ...p,
    docUrl: existingPlayerDocs[p.uid]?.docUrl || '',
  }));
  const hostHtml = renderHostDirectoryDocHtml(directoryPlayers, {
    webAppUrl: primaryWebUrl,
    lanHttpsUrl,
  });

  let hostDocId = settings.hostDoc?.docId || '';
  if (!hostDocId && folderId) {
    try {
      const found = await api.listChildren(folderId, { name: HOST_DIRECTORY_DOC_TITLE, mimeType: GDOC_MIME });
      if (found.length > 0) hostDocId = found[0].id;
    } catch {}
  }

  if (hostDocId) {
    try {
      await api.updateDocFromHtml(hostDocId, hostHtml);
    } catch {
      const created = await api.createDocFromHtml({ name: HOST_DIRECTORY_DOC_TITLE, parentId: folderId, html: hostHtml });
      hostDocId = created.id;
    }
  } else {
    const created = await api.createDocFromHtml({ name: HOST_DIRECTORY_DOC_TITLE, parentId: folderId, html: hostHtml });
    hostDocId = created.id;
  }

  const hostDocUrl = googleDocEditUrl(hostDocId);
  const folderUrl = googleDriveFolderUrl(folderId);

  updateTheaterSettings(
    {
      lanHttpsUrl,
      hostDoc: {
        docId: hostDocId,
        docTitle: HOST_DIRECTORY_DOC_TITLE,
        docUrl: hostDocUrl,
        folderId,
        folderUrl,
        webAppUrl: primaryWebUrl,
        lastSyncedAt: syncedAt,
      },
      playerDocs: existingPlayerDocs,
    },
    options,
  );

  return {
    ok: true,
    folderId,
    folderUrl,
    hostDocId,
    hostDocTitle: HOST_DIRECTORY_DOC_TITLE,
    hostDocUrl,
    webAppUrl: primaryWebUrl,
    lanHttpsUrl,
    playerDocs: syncedPlayerDocs,
    totalPlayerDocs: Object.keys(existingPlayerDocs).length,
    syncedAt,
  };
}

/**
 * Syncs a player's Launch Google Doc and (re)sends an official Google Docs share invitation link.
 * Removes any pre-existing silent/reader permission first so Google Drive always dispatches
 * a fresh notification email when clicking "Resend Share".
 */
async function invitePlayerToTheaterDoc({ uid, name, email, gamerTag, message = '' } = {}, options = {}) {
  let target = null;
  const players = loadTheaterPlayers(options);
  if (uid || email || name) {
    const q = String(uid || email || name).trim().toLowerCase();
    target = players.find(
      (p) =>
        p.uid === q ||
        String(p.email || '').toLowerCase() === q ||
        p.name.toLowerCase() === q ||
        p.shortName.toLowerCase() === q,
    );
  }
  if (!target && name) {
    target = upsertTheaterPlayer({ name, email, gamerTag }, options);
  } else if (target && email && String(email).trim() && target.email !== String(email).trim()) {
    target = upsertTheaterPlayer({ ...target, email: String(email).trim() }, options);
  }
  if (!target) {
    throw new Error('Player not found.');
  }

  const targetEmail = String(email || target.email || '').trim().toLowerCase();
  if (!isShareableEmail(targetEmail)) {
    const err = new Error(`Enter a valid Google email address for ${target.name} to send their Google Doc share link.`);
    err.code = 'EMAIL_REQUIRED';
    throw err;
  }

  // 1. Ensure the player's Google Doc is freshly synced with the latest HTTPS launch button
  const syncRes = await syncPlayerLaunchDocsWithGoogleDrive({
    ...options,
    onlyPlayerUids: [target.uid],
    shareWithPlayers: false,
  });
  const pDoc = syncRes.playerDocs[target.uid];
  if (!pDoc || !pDoc.docId) {
    throw new Error(`Could not find or create Google Doc for ${target.name}.`);
  }

  const api = options.driveApi || createGoogleDocsDriveApi({
    accountId: options.accountId || null,
    homeDir: options.homeDir,
    tokens: options.tokens,
    fetchImpl: options.fetchImpl,
  });
  const ownerEmail = String(
    options.ownerEmail || (typeof api.getAboutEmail === 'function' ? await api.getAboutEmail() : ''),
  ).trim().toLowerCase();

  const defaultMessage =
    message ||
    `You are invited to RobOS AI Multiplayer Game Theater as ${target.name} (@${target.gamerTag})!\n\nOpen this Google Doc and click the Launch Button to enter the Godot 4 Multiplayer Lobby:\n${pDoc.docUrl}`;

  let delivery = 'google-drive-share';
  let notificationEmailSent = false;

  if (ownerEmail && targetEmail === ownerEmail) {
    // Owner already owns the Google Doc (Drive suppresses owner-to-self share emails).
    // Attempt Thunderbird Bridge self-email if running; otherwise return owner-doc-ready so UI copies link too.
    let sentViaTb = false;
    try {
      const tbMail = requireRobosLib('thunderbird-mail');
      const st = await tbMail.getStatus(options);
      if (st?.addonConnected) {
        await tbMail.sendEmail(
          {
            to: [targetEmail],
            subject: pDoc.docTitle,
            text: `${defaultMessage}\n\nDirect Launch Link: ${pDoc.launchUrl}`,
          },
          { launch: false },
        );
        sentViaTb = true;
      }
    } catch {}
    delivery = sentViaTb ? 'thunderbird-email' : 'owner-doc-ready';
    notificationEmailSent = sentViaTb;
  } else {
    // Delete any pre-existing non-owner permission first so Google Drive ALWAYS resends the notification email!
    try {
      if (typeof api.listPermissions === 'function' && typeof api.deletePermission === 'function') {
        const perms = await api.listPermissions(pDoc.docId);
        for (const perm of perms) {
          if (String(perm.emailAddress || '').toLowerCase() === targetEmail && perm.role !== 'owner' && perm.id) {
            await api.deletePermission(pDoc.docId, perm.id);
          }
        }
      }
    } catch {}

    await api.shareFile(pDoc.docId, {
      email: targetEmail,
      role: 'reader',
      sendNotificationEmail: true,
      emailMessage: defaultMessage,
    });
    notificationEmailSent = true;
  }

  const sharedAt = new Date().toISOString();
  const settings = loadRawSettings(options);
  const updatedPlayerDocs = {
    ...(settings.playerDocs || {}),
    [target.uid]: {
      ...pDoc,
      sharedWithEmail: targetEmail,
      lastSharedAt: sharedAt,
    },
  };
  updateTheaterSettings({ playerDocs: updatedPlayerDocs }, options);

  return {
    ok: true,
    delivery,
    notificationEmailSent,
    invitedEmail: targetEmail,
    sharedAt,
    player: target,
    playerDoc: updatedPlayerDocs[target.uid],
    folderUrl: syncRes.folderUrl,
  };
}

module.exports = {
  DEFAULT_FOLDER_NAME,
  HOST_DIRECTORY_DOC_TITLE,
  googleDocEditUrl,
  googleDriveFolderUrl,
  getPlayerLaunchDocTitle,
  renderPlayerLaunchDocHtml,
  renderHostDirectoryDocHtml,
  createGoogleDocsDriveApi,
  syncPlayerLaunchDocsWithGoogleDrive,
  invitePlayerToTheaterDoc,
};
