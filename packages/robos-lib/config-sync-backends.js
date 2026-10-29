'use strict';

/**
 * Storage backends for RobOS Config Sync.
 *
 * A backend is one folder that holds a manifest (`robos-config.json`) and a `blobs/`
 * subfolder of content-addressed, gzip'd (and optionally encrypted) file bodies.
 *
 *   gdrive — a Google Drive folder, addressed by its folder ID or URL, read and written
 *            with the Drive v3 REST API using a RobOS Cloud Accounts Google sign-in.
 *   folder — any local directory: a Dropbox / OneDrive / Nextcloud sync folder, an rclone
 *            mount, a NAS share or a USB stick.
 *
 * Both expose the same interface:
 *   describe() → { kind, folderId?, path?, url, name }
 *   readManifest() → Buffer | null          writeManifest(buf)
 *   listBlobs() → Set<string>               readBlob(id) → Buffer
 *   writeBlob(id, buf)                      deleteBlob(id)
 *   grantAccess(emails, { role, message }) → [{ email, ok, error? }]   (gdrive only)
 */

const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_NAME = 'robos-config.json';
const BLOBS_DIR = 'blobs';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function driveApiBase() {
  return (process.env.ROBOS_GDRIVE_API_BASE || 'https://www.googleapis.com').replace(/\/+$/, '');
}

function driveFolderUrl(folderId) {
  const web = (process.env.ROBOS_GDRIVE_WEB_BASE || 'https://drive.google.com').replace(/\/+$/, '');
  return `${web}/drive/folders/${folderId}`;
}

/**
 * Turns whatever the user pasted into a folder reference.
 *   https://drive.google.com/drive/folders/<id>[?usp=sharing]  → gdrive
 *   https://drive.google.com/open?id=<id>                      → gdrive
 *   gdrive:<id> or a bare Drive ID                              → gdrive
 *   /abs/path, ~/path, file:///path                             → folder
 */
function parseFolderRef(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Paste a Google Drive folder link or ID, or a local folder path.');
  if (raw.startsWith('file://')) return { kind: 'folder', path: decodeURIComponent(raw.slice(7)) };
  if (raw.startsWith('/') || raw.startsWith('~')) {
    const home = process.env.HOME || require('node:os').homedir();
    return { kind: 'folder', path: raw.startsWith('~') ? path.join(home, raw.slice(1)) : raw };
  }
  if (raw.startsWith('gdrive:')) return { kind: 'gdrive', folderId: raw.slice(7) };
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const m = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
    if (m) return { kind: 'gdrive', folderId: m[1] };
    const id = url.searchParams.get('id');
    if (id) return { kind: 'gdrive', folderId: id };
    throw new Error('That link is not a Google Drive folder link. Open the folder in Drive and copy the address bar.');
  }
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return { kind: 'gdrive', folderId: raw };
  throw new Error(`"${raw}" is not a Google Drive folder link, Drive folder ID or local folder path.`);
}

// ── Local folder ─────────────────────────────────────────────────────────────

function createFolderBackend({ path: dir, create = false, name }) {
  if (!dir) throw new Error('Folder path is required.');
  if (create) fs.mkdirSync(path.join(dir, BLOBS_DIR), { recursive: true });
  if (!fs.existsSync(dir)) throw new Error(`Folder not found: ${dir}`);
  const blobDir = path.join(dir, BLOBS_DIR);
  return {
    kind: 'folder',
    describe: () => ({ kind: 'folder', path: dir, url: `file://${dir}`, name: name || path.basename(dir) }),
    async readManifest() {
      const p = path.join(dir, MANIFEST_NAME);
      return fs.existsSync(p) ? fs.readFileSync(p) : null;
    },
    async writeManifest(buf) {
      const p = path.join(dir, MANIFEST_NAME);
      fs.writeFileSync(p + '.tmp', buf);
      fs.renameSync(p + '.tmp', p);
    },
    async listBlobs() {
      return new Set(fs.existsSync(blobDir) ? fs.readdirSync(blobDir) : []);
    },
    async readBlob(id) {
      return fs.readFileSync(path.join(blobDir, id));
    },
    async writeBlob(id, buf) {
      fs.mkdirSync(blobDir, { recursive: true });
      fs.writeFileSync(path.join(blobDir, id), buf);
    },
    async deleteBlob(id) {
      fs.rmSync(path.join(blobDir, id), { force: true });
    },
    async grantAccess(emails) {
      return emails.map(email => ({ email, ok: false, error: 'Local folders are shared by the app that syncs them (Dropbox, OneDrive, Nextcloud). Share the folder there.' }));
    },
  };
}

// ── Google Drive ─────────────────────────────────────────────────────────────

function loadCloudAccounts() {
  return require('./cloud-accounts');
}

/** Returns a function that yields a valid access token for a Cloud Accounts Google sign-in. */
function googleTokenProvider(accountId, { homeDir } = {}) {
  const ca = loadCloudAccounts();
  const opts = homeDir ? { homeDir } : {};
  let token = null;
  return {
    async get() {
      if (token) return token;
      const acc = ca.getAccountById(accountId, opts);
      if (!acc) throw new Error(`Cloud account "${accountId}" is not signed in on this machine. Sign in with Google in Preferences → Cloud Suite Accounts.`);
      if (acc.provider !== 'google') throw new Error(`${acc.label} is not a Google account.`);
      if (!acc.accessToken && !acc.refreshToken) throw new Error(`${acc.email || acc.label} needs to sign in again (no token on this machine).`);
      token = acc.accessToken;
      if (!token) token = (await ca.refreshGoogleAccountToken(acc.id, opts)).accessToken;
      return token;
    },
    async refresh() {
      const acc = ca.getAccountById(accountId, opts);
      if (!acc?.refreshToken) throw new Error(`${acc?.email || accountId} needs to sign in again: the Google token expired.`);
      token = (await ca.refreshGoogleAccountToken(acc.id, opts)).accessToken;
      return token;
    },
  };
}

class DriveError extends Error {
  constructor(message, status, reason = '') { super(message); this.status = status; this.reason = reason; }
}

// Drive answers quota and per-user throttling with 403 rateLimitExceeded /
// userRateLimitExceeded (or 429), and transient faults with 5xx. Those are retried with
// exponential backoff; every other 403 is a real permission problem.
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'RATE_LIMIT_EXCEEDED']);
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

function driveRetryDelayMs(attempt, retryAfter) {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 60) * 1000;
  const base = Number(process.env.ROBOS_GDRIVE_RETRY_BASE_MS || 500);
  return Math.min(base * 2 ** attempt, 32000) + Math.floor(Math.random() * base);
}

function createDriveClient({ tokens, fetchImpl = fetch, maxRetries = Number(process.env.ROBOS_GDRIVE_MAX_RETRIES || 8) }) {
  const base = driveApiBase();

  async function call(method, url, { body, headers = {}, raw = false, retried = false, attempt = 0 } = {}) {
    const token = await tokens.get();
    const res = await fetchImpl(url.startsWith('http') ? url : base + url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...headers },
      body,
      signal: AbortSignal.timeout(60000),
    });
    if (res.status === 401 && !retried && tokens.refresh) {
      await tokens.refresh();
      return call(method, url, { body, headers, raw, retried: true, attempt });
    }
    if (!res.ok) {
      let err = {};
      try { err = (await res.json())?.error || {}; } catch {}
      const detail = err.message || '';
      const reason = err.errors?.[0]?.reason || err.details?.find(d => d.reason)?.reason || '';
      const rateLimited = res.status === 429 || (res.status === 403 && RATE_LIMIT_REASONS.has(reason));
      if ((rateLimited || RETRY_STATUSES.has(res.status)) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, driveRetryDelayMs(attempt, res.headers?.get?.('retry-after'))));
        return call(method, url, { body, headers, raw, retried, attempt: attempt + 1 });
      }
      if (rateLimited) throw new DriveError(`Google Drive is rate-limiting requests right now. Try again in a minute. ${detail}`.trim(), res.status, reason);
      if (res.status === 404) throw new DriveError(`Google Drive could not find that folder, or this account cannot see it. Ask the owner to share it with this account. ${detail}`.trim(), 404, reason);
      if (res.status === 403 && reason === 'storageQuotaExceeded') throw new DriveError(`This Google account's Drive storage is full. ${detail}`.trim(), 403, reason);
      if (res.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(reason)) throw new DriveError(`This Google sign-in does not include Drive access. Sign in with Google again in Preferences → Cloud Suite Accounts. ${detail}`.trim(), 403, reason);
      if (res.status === 403) throw new DriveError(`This Google account does not have access. Ask the owner to share the folder with you. ${detail}`.trim(), 403, reason);
      throw new DriveError(`Google Drive ${method} failed (HTTP ${res.status}) ${detail}`.trim(), res.status, reason);
    }
    if (raw) return Buffer.from(await res.arrayBuffer());
    if (res.status === 204) return null;
    return res.json();
  }

  const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const common = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

  async function listChildren(parentId, { name, mimeType } = {}) {
    const parts = [`${q(parentId)} in parents`, 'trashed = false'];
    if (name) parts.push(`name = ${q(name)}`);
    if (mimeType) parts.push(`mimeType = ${q(mimeType)}`);
    const out = [];
    let pageToken = '';
    do {
      const url = `/drive/v3/files?q=${encodeURIComponent(parts.join(' and '))}&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType,size,modifiedTime)')}&pageSize=1000&${common}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const page = await call('GET', url);
      out.push(...(page.files || []));
      pageToken = page.nextPageToken || '';
    } while (pageToken);
    return out;
  }

  async function getFile(fileId, fields = 'id,name,mimeType,owners(emailAddress,displayName),capabilities(canEdit,canShare)') {
    return call('GET', `/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`);
  }

  async function createFolder(name, parentId) {
    return call('POST', `/drive/v3/files?fields=id,name&supportsAllDrives=true`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
    });
  }

  async function upload(name, parentId, buf, mimeType = 'application/octet-stream') {
    const boundary = `robos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name, parents: [parentId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    return call('POST', `/upload/drive/v3/files?uploadType=multipart&fields=id,name&supportsAllDrives=true`, {
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  async function updateContent(fileId, buf, mimeType = 'application/octet-stream') {
    return call('PATCH', `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id&supportsAllDrives=true`, {
      headers: { 'Content-Type': mimeType },
      body: buf,
    });
  }

  async function download(fileId) {
    return call('GET', `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { raw: true });
  }

  async function remove(fileId) {
    return call('DELETE', `/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`);
  }

  async function share(fileId, email, role, message) {
    const params = new URLSearchParams({ sendNotificationEmail: 'true', supportsAllDrives: 'true', fields: 'id,emailAddress,role' });
    if (message) params.set('emailMessage', message);
    return call('POST', `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?${params}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role, emailAddress: email }),
    });
  }

  async function listPermissions(fileId) {
    const res = await call('GET', `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=${encodeURIComponent('permissions(id,emailAddress,role,type)')}&supportsAllDrives=true`);
    return res.permissions || [];
  }

  return { listChildren, getFile, createFolder, upload, updateContent, download, remove, share, listPermissions };
}

/** Creates a new Drive folder (optionally inside `parentId`) and returns its reference. */
async function createDriveFolder({ accountId, name, parentId, homeDir, fetchImpl }) {
  const drive = createDriveClient({ tokens: googleTokenProvider(accountId, { homeDir }), fetchImpl });
  const folder = await drive.createFolder(name, parentId);
  await drive.createFolder(BLOBS_DIR, folder.id);
  return { kind: 'gdrive', folderId: folder.id, name: folder.name, url: driveFolderUrl(folder.id) };
}

// Access a share grants to files inside the folder reaches the recipient a few seconds
// after the folder itself, so a listing can briefly miss files the manifest names.
function consistencyWaitsMs() {
  const base = Number(process.env.ROBOS_GDRIVE_CONSISTENCY_BASE_MS || 1000);
  return [1, 2, 4, 8, 15].map(n => n * base);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function createGDriveBackend({ folderId, accountId, homeDir, fetchImpl, tokens }) {
  if (!folderId) throw new Error('Google Drive folder ID is required.');
  const drive = createDriveClient({ tokens: tokens || googleTokenProvider(accountId, { homeDir }), fetchImpl });
  let folderName = null;
  let blobFolderId = null;
  let blobIndex = null; // name → fileId
  let manifestFileId;
  let readOnly = false; // a share someone else owns: an empty listing means "not visible yet"

  async function blobFolder(create) {
    if (blobFolderId) return blobFolderId;
    const found = await drive.listChildren(folderId, { name: BLOBS_DIR, mimeType: FOLDER_MIME });
    if (found[0]) blobFolderId = found[0].id;
    else if (create) blobFolderId = (await drive.createFolder(BLOBS_DIR, folderId)).id;
    return blobFolderId;
  }

  async function index() {
    if (blobIndex) return blobIndex;
    blobIndex = new Map();
    const id = await blobFolder(false);
    if (id) for (const f of await drive.listChildren(id)) blobIndex.set(f.name, f.id);
    return blobIndex;
  }

  return {
    kind: 'gdrive',
    drive,
    describe: () => ({ kind: 'gdrive', folderId, accountId, url: driveFolderUrl(folderId), name: folderName || folderId }),
    async open() {
      const meta = await drive.getFile(folderId);
      if (meta.mimeType && meta.mimeType !== FOLDER_MIME) throw new Error(`"${meta.name}" is a file, not a folder.`);
      folderName = meta.name;
      readOnly = meta.capabilities?.canEdit === false;
      return meta;
    },
    async readManifest() {
      let found = await drive.listChildren(folderId, { name: MANIFEST_NAME });
      for (const wait of readOnly ? consistencyWaitsMs() : []) {
        if (found.length) break;
        await sleep(wait);
        found = await drive.listChildren(folderId, { name: MANIFEST_NAME });
      }
      manifestFileId = found[0]?.id || null;
      return manifestFileId ? drive.download(manifestFileId) : null;
    },
    async writeManifest(buf) {
      if (manifestFileId === undefined) await this.readManifest();
      if (manifestFileId) await drive.updateContent(manifestFileId, buf, 'application/json');
      else manifestFileId = (await drive.upload(MANIFEST_NAME, folderId, buf, 'application/json')).id;
    },
    async listBlobs() {
      return new Set((await index()).keys());
    },
    async readBlob(id) {
      let fileId = (await index()).get(id);
      for (const wait of consistencyWaitsMs()) {
        if (fileId) break;
        await sleep(wait);
        blobIndex = null;
        fileId = (await index()).get(id);
      }
      if (!fileId) throw new Error(`The vault is missing a file body (${id.slice(0, 12)}…). Push again from a machine that has it.`);
      return drive.download(fileId);
    },
    async writeBlob(id, buf) {
      const idx = await index();
      if (idx.has(id)) return;
      const created = await drive.upload(id, await blobFolder(true), buf);
      idx.set(id, created.id);
    },
    async deleteBlob(id) {
      const idx = await index();
      const fileId = idx.get(id);
      if (!fileId) return;
      await drive.remove(fileId);
      idx.delete(id);
    },
    async grantAccess(emails, { role = 'reader', message = '' } = {}) {
      const out = [];
      for (const email of emails) {
        try { await drive.share(folderId, email, role, message); out.push({ email, ok: true, role }); }
        catch (err) { out.push({ email, ok: false, error: err.message }); }
      }
      return out;
    },
    async listAccess() {
      return drive.listPermissions(folderId);
    },
  };
}

/** Opens a backend from a stored or parsed reference. */
function openBackend(ref, { homeDir, fetchImpl, create = false } = {}) {
  if (ref.kind === 'folder') return createFolderBackend({ path: ref.path, create, name: ref.name });
  if (ref.kind === 'gdrive') return createGDriveBackend({ folderId: ref.folderId, accountId: ref.accountId, homeDir, fetchImpl });
  throw new Error(`Unknown storage kind "${ref.kind}".`);
}

module.exports = {
  MANIFEST_NAME, BLOBS_DIR, FOLDER_MIME,
  parseFolderRef, driveFolderUrl, createFolderBackend, createGDriveBackend, createDriveFolder, createDriveClient,
  googleTokenProvider, openBackend, DriveError,
};
