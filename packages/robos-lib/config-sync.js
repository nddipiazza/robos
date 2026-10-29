'use strict';

/**
 * RobOS Config Sync — mirror ~/.config/robos and ~/.robos to a protected cloud folder,
 * load it on another machine, and share chosen parts of it with other people.
 *
 * Two kinds of remote folder, both laid out as `robos-config.json` + `blobs/`:
 *
 *   vault — your full backup. Every machine you own syncs with it both ways. Sync is a
 *           three-way compare per file (this machine, the vault, and what both looked
 *           like at the last sync), like the IntelliJ settings repository. Files changed
 *           on both sides are conflicts the user resolves; nothing is overwritten silently.
 *   share — a read-only bundle of chosen categories for someone else (family, a new hire,
 *           a coworker). Joining a share merges its items into your own lists by id, so
 *           your existing projects, lights or playlists stay. Leaving removes only what the
 *           share added.
 *
 * Guarantees, for every file that leaves the machine:
 *   - JSON keys that hold credentials (tokens, passwords, keys, secrets) are removed, and
 *     put back from the local copy on pull. Each machine signs in once.
 *   - The home directory is written as ${HOME} and expanded on the receiving machine.
 *   - Caches, logs, sockets, machine identity (the mesh private key) are never copied.
 *   - Optional passphrase: AES-256-GCM per file and for the manifest, key from scrypt.
 *   - Every local write is preceded by a restore point that can be rolled back.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { isDeepStrictEqual } = require('node:util');

const catalog = require('./config-sync-catalog');
const backends = require('./config-sync-backends');

const FORMAT = 'robos-config/1';
const HOME_TOKEN = '${HOME}';
const HISTORY_LIMIT = 30;
const RESTORE_POINT_LIMIT = 15;

class ConfigSyncError extends Error {
  constructor(message, code, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}

// ── Paths & state ────────────────────────────────────────────────────────────

function homeOf(opts = {}) { return opts.homeDir || process.env.HOME || os.homedir(); }
function roots(home) { return { config: path.join(home, '.config', 'robos'), robos: path.join(home, '.robos') }; }
function syncDir(home) { return path.join(roots(home).config, 'config-sync'); }

function absPath(home, rel) {
  const [root, ...rest] = rel.split('/');
  const base = roots(home)[root];
  if (!base || !rest.length || rest.some(p => p === '..' || p === '')) throw new ConfigSyncError(`Refusing unsafe config path "${rel}".`, 'UNSAFE_PATH');
  return path.join(base, ...rest);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, data, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2) + '\n', mode ? { mode } : undefined);
  fs.renameSync(file + '.tmp', file);
}

function loadState(home) {
  const state = readJson(path.join(syncDir(home), 'state.json'), null) || {};
  if (!state.machineId) state.machineId = crypto.randomUUID();
  state.version = 1;
  state.vault = state.vault || null;
  state.shares = state.shares || [];
  state.subscriptions = state.subscriptions || [];
  return state;
}

function saveState(home, state) { writeJson(path.join(syncDir(home), 'state.json'), state, 0o600); }

function keyFile(home) { return path.join(syncDir(home), 'keys.json'); }
function storeKey(home, remoteId, key, kdf) {
  const keys = readJson(keyFile(home), {});
  keys[remoteId] = { key: key.toString('hex'), kdf };
  writeJson(keyFile(home), keys, 0o600);
}
function loadKey(home, remoteId) {
  const entry = readJson(keyFile(home), {})[remoteId];
  return entry ? Buffer.from(entry.key, 'hex') : null;
}
function forgetKey(home, remoteId) {
  const keys = readJson(keyFile(home), {});
  if (keys[remoteId]) { delete keys[remoteId]; writeJson(keyFile(home), keys, 0o600); }
}

function machineName() { return process.env.ROBOS_MACHINE_NAME || os.hostname(); }

function userLabel(home) {
  const id = readJson(path.join(roots(home).config, 'identity.json'), {});
  return { name: id.displayName || id.name || os.userInfo().username, email: id.email || '' };
}

// ── Globs & categories ───────────────────────────────────────────────────────

const _reCache = new Map();
function globRe(glob) {
  if (_reCache.has(glob)) return _reCache.get(glob);
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  const out = new RegExp(`^${re}$`);
  _reCache.set(glob, out);
  return out;
}
const matchAny = (rel, globs) => globs.some(g => globRe(g).test(rel));

function isExcluded(rel) { return matchAny(rel, catalog.EXCLUDE); }
function categoryOf(rel) { return catalog.CATEGORIES.find(c => matchAny(rel, c.include))?.id || 'other'; }
function categoryById(id) { return catalog.CATEGORIES.find(c => c.id === id); }

// ── Local files ──────────────────────────────────────────────────────────────

function listLocalFiles(home) {
  const files = [];
  const skipped = [];
  for (const [root, base] of Object.entries(roots(home))) {
    const walk = (dir, relDir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const rel = `${relDir}/${e.name}`;
        const abs = path.join(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
          if (isExcluded(`${rel}/x`) && isExcluded(`${rel}/x/y`)) continue;
          walk(abs, rel);
        } else if (e.isFile()) {
          if (isExcluded(rel)) continue;
          const st = fs.statSync(abs);
          if (st.size > catalog.MAX_FILE_BYTES) { skipped.push({ rel, reason: `larger than ${catalog.MAX_FILE_BYTES / 1048576} MB` }); continue; }
          files.push({ rel, abs, size: st.size, mtime: st.mtime.toISOString() });
        }
      }
    };
    walk(base, root);
  }
  return { files, skipped };
}

// ── Transforms: secrets and ${HOME} ──────────────────────────────────────────

function isSecretKey(key) {
  return !catalog.SECRET_KEY_ALLOW.has(key) && catalog.SECRET_KEY_RE.test(key);
}

function hasValue(v) {
  if (v === null || v === undefined || v === '' || v === false) return false;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

function homeRe(home) { return new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=/|$|[\\s"\'])', 'g'); }
const TOKEN_RE = /\$\{HOME\}/g;

function isTextPath(rel) { return /\.(json|jsonld|ya?ml|txt|md|toml|ini|conf|srt|vtt|lrc|csv)$/i.test(rel); }

/** Prepares a local file for upload. Returns the bytes to store and what was removed. */
function exportBuffer(rel, buf, { home, sealable = [] }) {
  const removed = [];
  if (/\.(json|jsonld)$/i.test(rel)) {
    let data;
    try { data = JSON.parse(buf.toString('utf8')); } catch { data = undefined; }
    if (data !== undefined) {
      const re = homeRe(home);
      const localKeys = localKeysFor(rel);
      const walk = (node, trail) => {
        if (Array.isArray(node)) return node.map((v, i) => walk(v, trail.concat(itemLabel(v, i))));
        if (node && typeof node === 'object') {
          const out = {};
          for (const [k, v] of Object.entries(node)) {
            if (localKeys.has(k)) continue;
            if (isSecretKey(k) && hasValue(v) && !sealable.includes(k)) { removed.push({ key: k, at: trail.join(' › ') }); continue; }
            out[k] = walk(v, trail.concat(k));
          }
          return out;
        }
        return typeof node === 'string' ? node.replace(re, HOME_TOKEN) : node;
      };
      return { buf: Buffer.from(JSON.stringify(walk(data, []), null, 2) + '\n'), removed };
    }
  }
  if (isTextPath(rel)) return { buf: Buffer.from(buf.toString('utf8').replace(homeRe(home), HOME_TOKEN)), removed };
  return { buf, removed };
}

function itemLabel(v, i) {
  if (v && typeof v === 'object') for (const k of catalog.ID_KEYS) if (typeof v[k] === 'string' || typeof v[k] === 'number') return String(v[k]);
  return `#${i}`;
}

function expandHome(rel, buf, home) {
  if (!isTextPath(rel)) return buf;
  return Buffer.from(buf.toString('utf8').replace(TOKEN_RE, home));
}

const NO_KEYS = new Set();
function localKeysFor(rel) { return catalog.LOCAL_KEYS[rel] ? new Set(catalog.LOCAL_KEYS[rel]) : NO_KEYS; }

/**
 * Copies credentials and machine-local keys from the local version into the incoming one,
 * matching list items by id.
 */
function restoreSecrets(incoming, local, localKeys = NO_KEYS) {
  if (Array.isArray(incoming) && Array.isArray(local)) {
    const key = idKeyFor(incoming);
    incoming.forEach((item, i) => {
      const match = key ? local.find(l => l && l[key] === item?.[key]) : (incoming.length === local.length ? local[i] : null);
      if (match) restoreSecrets(item, match, localKeys);
    });
  } else if (incoming && local && typeof incoming === 'object' && typeof local === 'object') {
    for (const [k, v] of Object.entries(local)) {
      if ((isSecretKey(k) || localKeys.has(k)) && !(k in incoming)) incoming[k] = v;
      else if (k in incoming && typeof incoming[k] === 'object') restoreSecrets(incoming[k], v, localKeys);
    }
  }
  return incoming;
}

/** Turns stored bytes back into the local file, keeping this machine's credentials. */
function importBuffer(rel, buf, localBuf, { home }) {
  const expanded = expandHome(rel, buf, home);
  if (!/\.(json|jsonld)$/i.test(rel) || !localBuf) return expanded;
  let incoming, local;
  try { incoming = JSON.parse(expanded.toString('utf8')); local = JSON.parse(localBuf.toString('utf8')); } catch { return expanded; }
  return Buffer.from(JSON.stringify(keepSignedInItems(restoreSecrets(incoming, local, localKeysFor(rel)), local), null, 2) + '\n');
}

function holdsSecret(node) {
  if (Array.isArray(node)) return node.some(holdsSecret);
  if (node && typeof node === 'object') return Object.entries(node).some(([k, v]) => (isSecretKey(k) && hasValue(v)) || holdsSecret(v));
  return false;
}

/**
 * Pulling never signs this machine out: a local list item that holds credentials and is
 * missing from the incoming list (for example a Google sign-in made only on this machine)
 * is kept. The next sync uploads it, without its credentials.
 */
function keepSignedInItems(incoming, local) {
  if (Array.isArray(incoming) && Array.isArray(local)) {
    const key = idKeyFor(incoming.length ? incoming : local);
    if (!key) return incoming;
    for (const item of local) {
      if (item && item[key] !== undefined && holdsSecret(item) && !incoming.some(i => i && i[key] === item[key])) incoming.push(item);
    }
    for (const item of incoming) {
      const match = local.find(l => l && item && l[key] === item[key]);
      if (match) keepSignedInItems(item, match);
    }
  } else if (incoming && local && typeof incoming === 'object' && typeof local === 'object') {
    for (const [k, v] of Object.entries(incoming)) if (v && typeof v === 'object' && local[k]) keepSignedInItems(v, local[k]);
  }
  return incoming;
}

function idKeyFor(arr) {
  const objs = arr.filter(x => x && typeof x === 'object' && !Array.isArray(x));
  if (!objs.length || objs.length !== arr.length) return null;
  return catalog.ID_KEYS.find(k => objs.every(o => typeof o[k] === 'string' || typeof o[k] === 'number')) || null;
}

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Reads the local config as it would be stored remotely.
 *   mode 'vault' — every non-excluded file in the enabled categories.
 *   mode 'share' — only shareable categories in `categories`, minus their shareExclude.
 */
function snapshotLocal({ home, mode = 'vault', categories = null, sealSecrets = false }) {
  const { files, skipped } = listLocalFiles(home);
  const wanted = categories ? new Set(categories) : null;
  const out = new Map();
  for (const f of files) {
    const category = categoryOf(f.rel);
    if (wanted && !wanted.has(category)) continue;
    const cat = categoryById(category);
    if (mode === 'share' && (!cat.shareable || matchAny(f.rel, cat.shareExclude || []))) continue;
    const raw = fs.readFileSync(f.abs);
    const { buf, removed } = exportBuffer(f.rel, raw, { home, sealable: sealSecrets ? (cat.sealable || []) : [] });
    out.set(f.rel, { rel: f.rel, category, sha: sha256(buf), size: buf.length, mtime: f.mtime, buf, removed });
  }
  return { files: out, skipped };
}

// ── Encryption & blobs ───────────────────────────────────────────────────────

const KDF = { alg: 'aes-256-gcm', kdf: 'scrypt', N: 32768, r: 8, p: 1 };

function deriveKey(passphrase, kdf) {
  if (!passphrase) throw new ConfigSyncError('This folder is encrypted. Enter its passphrase.', 'PASSPHRASE_REQUIRED');
  return crypto.scryptSync(String(passphrase), Buffer.from(kdf.salt, 'base64'), 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 128 * 1024 * 1024 });
}

function encrypt(key, buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function decrypt(key, buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

const blobIdFor = (sha, key) => key ? crypto.createHmac('sha256', key).update(sha).digest('hex') : sha;
const packBlob = (buf, key) => { const z = zlib.gzipSync(buf); return key ? encrypt(key, z) : z; };
const unpackBlob = (buf, key) => zlib.gunzipSync(key ? decrypt(key, buf) : buf);

// ── Manifest ─────────────────────────────────────────────────────────────────

function newManifest(kind, name) {
  return { format: FORMAT, kind, id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), updatedAt: null, generation: 0, files: {}, history: [] };
}

/** Reads and (if needed) decrypts the manifest. Returns { manifest, key, kdf } or null when the folder is empty. */
async function readManifest(backend, { home, passphrase, key } = {}) {
  const raw = await backend.readManifest();
  if (!raw) return null;
  let outer;
  try { outer = JSON.parse(raw.toString('utf8')); } catch { throw new ConfigSyncError('robos-config.json in that folder is not valid JSON.', 'BAD_MANIFEST'); }
  if (outer.format !== FORMAT) throw new ConfigSyncError(`That folder holds "${outer.format || 'unknown'}" data, not a RobOS config.`, 'BAD_MANIFEST');
  if (!outer.encrypted) return { manifest: outer, key: null, kdf: null };
  const kdf = outer.encrypted;
  let k = key || (home && loadKey(home, outer.id));
  if (passphrase) k = deriveKey(passphrase, kdf);
  if (!k) throw new ConfigSyncError('This folder is encrypted. Enter its passphrase.', 'PASSPHRASE_REQUIRED', { kind: outer.kind });
  try {
    const manifest = JSON.parse(decrypt(k, Buffer.from(outer.payload, 'base64')).toString('utf8'));
    return { manifest, key: k, kdf };
  } catch {
    throw new ConfigSyncError('Wrong passphrase for this folder.', 'WRONG_PASSPHRASE', { kind: outer.kind });
  }
}

async function writeManifest(backend, manifest, key, kdf) {
  const body = key
    ? { format: FORMAT, kind: manifest.kind, id: manifest.id, encrypted: kdf, payload: encrypt(key, Buffer.from(JSON.stringify(manifest))).toString('base64') }
    : manifest;
  await backend.writeManifest(Buffer.from(JSON.stringify(body, null, 2) + '\n'));
}

function newKdf() { return { ...KDF, salt: crypto.randomBytes(16).toString('base64') }; }

/** Uploads the bodies the remote does not have yet. */
async function uploadBlobs(backend, entries, key) {
  const have = await backend.listBlobs();
  let uploaded = 0;
  for (const e of entries) {
    const id = blobIdFor(e.sha, key);
    if (!have.has(id)) { await backend.writeBlob(id, packBlob(e.buf, key)); have.add(id); uploaded++; }
  }
  return uploaded;
}

async function fetchBlob(backend, entry, key) {
  const buf = unpackBlob(await backend.readBlob(entry.blob || blobIdFor(entry.sha, key)), key);
  if (sha256(buf) !== entry.sha) throw new ConfigSyncError(`A file body in the folder is corrupt (${entry.sha.slice(0, 12)}…).`, 'CORRUPT_BLOB');
  return buf;
}

/** Deletes bodies that the previous manifest used and the new one does not. */
async function collectGarbage(backend, before, after) {
  const keep = new Set(Object.values(after.files).map(f => f.blob));
  for (const f of Object.values(before.files || {})) {
    if (!keep.has(f.blob)) { try { await backend.deleteBlob(f.blob); } catch {} keep.add(f.blob); }
  }
}

function backendFor(ref, home, opts = {}) { return backends.openBackend(ref, { homeDir: home, fetchImpl: opts.fetchImpl, create: opts.create }); }

function normalizeRef(input, accountId) {
  const ref = typeof input === 'string' ? backends.parseFolderRef(input) : { ...input };
  if (ref.kind === 'gdrive') {
    ref.accountId = ref.accountId || accountId || null;
    ref.url = ref.url || backends.driveFolderUrl(ref.folderId);
  } else if (ref.kind === 'folder') ref.url = `file://${ref.path}`;
  return ref;
}

/** Opens the folder and confirms access, returning the backend with its display name. */
async function openRef(ref, home, opts = {}) {
  const backend = backendFor(ref, home, opts);
  if (backend.open) { const meta = await backend.open(); ref.name = ref.name || meta.name; }
  else ref.name = ref.name || path.basename(ref.path);
  return backend;
}

// ── Restore points ───────────────────────────────────────────────────────────

function restoreDir(home) { return path.join(syncDir(home), 'restore-points'); }

function createRestorePoint(home, reason, rels) {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const dir = path.join(restoreDir(home), id);
  const files = [];
  for (const rel of [...new Set(rels)]) {
    const abs = absPath(home, rel);
    const existed = fs.existsSync(abs);
    if (existed) {
      const dest = path.join(dir, 'files', ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
    }
    files.push({ rel, existed });
  }
  writeJson(path.join(dir, 'restore-point.json'), { id, at: new Date().toISOString(), reason, machine: machineName(), files }, 0o600);
  const all = listRestorePoints({ homeDir: home });
  for (const old of all.slice(RESTORE_POINT_LIMIT)) fs.rmSync(path.join(restoreDir(home), old.id), { recursive: true, force: true });
  return id;
}

function listRestorePoints(opts = {}) {
  const home = homeOf(opts);
  const dir = restoreDir(home);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(id => readJson(path.join(dir, id, 'restore-point.json'), null))
    .filter(Boolean)
    .sort((a, b) => b.at.localeCompare(a.at))
    .map(rp => ({ id: rp.id, at: rp.at, reason: rp.reason, machine: rp.machine, fileCount: rp.files.length, files: rp.files.map(f => f.rel) }));
}

/**
 * Puts the files in a restore point back as they were (all of them, or only `files`).
 * The current state becomes a new restore point first, so a restore can be undone too.
 */
function restoreRestorePoint(opts = {}) {
  const home = homeOf(opts);
  const dir = path.join(restoreDir(home), opts.id || '');
  const rp = readJson(path.join(dir, 'restore-point.json'), null);
  if (!rp) throw new ConfigSyncError(`Restore point "${opts.id}" not found.`, 'NOT_FOUND');
  const files = opts.files?.length ? rp.files.filter(f => opts.files.includes(f.rel)) : rp.files;
  if (!files.length) throw new ConfigSyncError('None of those files are in this restore point.', 'NOT_FOUND');
  const undoId = createRestorePoint(home, `Before restoring ${files.length === 1 ? files[0].rel.split('/').pop() : `${files.length} files`} from ${rp.reason}`, files.map(f => f.rel));
  for (const f of files) {
    const abs = absPath(home, f.rel);
    if (f.existed) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.copyFileSync(path.join(dir, 'files', ...f.rel.split('/')), abs);
    } else fs.rmSync(abs, { force: true });
  }
  // The vault base no longer matches these files, so the next sync sees them as local edits.
  return { ok: true, restored: files.length, undoRestorePointId: undoId };
}

function writeLocal(home, rel, buf) {
  const abs = absPath(home, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.robos-sync.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, abs);
}

// ── Status & catalog ─────────────────────────────────────────────────────────

function publicVault(v) {
  if (!v) return null;
  return {
    name: v.ref.name, kind: v.ref.kind, url: v.ref.url, folderId: v.ref.folderId || null, path: v.ref.path || null,
    accountId: v.ref.accountId || null, id: v.id, encrypted: Boolean(v.encrypted), categories: v.categories,
    lastSyncAt: v.lastSyncAt || null, lastGeneration: v.lastGeneration || 0, connectedAt: v.connectedAt, trackedFiles: Object.keys(v.base || {}).length,
  };
}

function describeCategories(home) {
  const { files } = listLocalFiles(home);
  const counts = {};
  for (const f of files) {
    const c = categoryOf(f.rel);
    counts[c] = counts[c] || { files: 0, bytes: 0 };
    counts[c].files++; counts[c].bytes += f.size;
  }
  return catalog.CATEGORIES.map(c => ({
    id: c.id, label: c.label, description: c.description, shareable: c.shareable, sealable: c.sealable || [],
    localFiles: counts[c.id]?.files || 0, localBytes: counts[c.id]?.bytes || 0,
  }));
}

function getStatus(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  saveState(home, state);
  return {
    ok: true,
    machine: { id: state.machineId, name: machineName(), user: userLabel(home) },
    vault: publicVault(state.vault),
    shares: state.shares.map(s => ({ ...s, ref: undefined, url: s.ref.url, kind: s.ref.kind })),
    subscriptions: state.subscriptions.map(s => ({ ...s, owned: undefined, ref: undefined, url: s.ref.url, kind: s.ref.kind, ownedItems: countOwned(s.owned) })),
    categories: describeCategories(home),
    templates: catalog.SHARE_TEMPLATES,
    restorePoints: listRestorePoints({ homeDir: home }).slice(0, 10),
  };
}

function countOwned(owned = {}) { return Object.values(owned).reduce((n, o) => n + (o.items?.length || 0) + (o.file ? 1 : 0), 0); }

// ── Vault ────────────────────────────────────────────────────────────────────

/**
 * Connects this machine to a backup vault.
 *   create: { kind: 'gdrive', accountId, name, parentId? } | { kind: 'folder', path, name? }
 *   ref:    a Drive folder URL/ID or local path of an existing vault (or an empty folder).
 * Returns the first-sync plan so the UI can ask how to combine this machine with the vault.
 */
async function connectVault(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  let ref;
  if (opts.create) {
    const c = opts.create;
    if (c.kind === 'gdrive') {
      const created = await backends.createDriveFolder({ accountId: c.accountId, name: c.name || 'RobOS Config Vault', parentId: c.parentId, homeDir: home, fetchImpl: opts.fetchImpl });
      ref = { kind: 'gdrive', folderId: created.folderId, accountId: c.accountId, url: created.url, name: created.name };
    } else {
      const dir = path.join(c.path, c.name || '');
      fs.mkdirSync(dir, { recursive: true });
      ref = { kind: 'folder', path: dir, url: `file://${dir}`, name: path.basename(dir) };
    }
  } else {
    ref = normalizeRef(opts.ref, opts.accountId);
  }
  const backend = await openRef(ref, home, { ...opts, create: true });
  let read;
  try { read = await readManifest(backend, { home, passphrase: opts.passphrase }); }
  catch (err) { err.ref = ref; throw err; }

  let manifest, key = null, kdf = null;
  if (read) {
    ({ manifest, key, kdf } = read);
    if (manifest.kind !== 'vault') throw new ConfigSyncError(`"${ref.name}" is a shared config from ${manifest.share?.publisher?.name || 'someone'}, not a backup vault. Open it under "Shared with me" instead.`, 'WRONG_KIND');
  } else {
    manifest = newManifest('vault', ref.name);
    if (opts.passphrase) { kdf = newKdf(); key = deriveKey(opts.passphrase, kdf); }
    manifest.updatedAt = new Date().toISOString();
    manifest.updatedBy = { machineId: state.machineId, machineName: machineName(), user: userLabel(home) };
    await writeManifest(backend, manifest, key, kdf);
  }
  if (key) storeKey(home, manifest.id, key, kdf);
  state.vault = {
    ref, id: manifest.id, encrypted: Boolean(key),
    categories: opts.categories || catalog.CATEGORIES.map(c => c.id),
    base: {}, lastSyncAt: null, lastGeneration: 0, connectedAt: new Date().toISOString(),
  };
  saveState(home, state);
  const plan = await planVaultSync({ homeDir: home, fetchImpl: opts.fetchImpl });
  return { ok: true, vault: publicVault(state.vault), plan };
}

function disconnectVault(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  if (state.vault) forgetKey(home, state.vault.id);
  state.vault = null;
  saveState(home, state);
  return { ok: true };
}

function setVaultCategories(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  if (!state.vault) throw new ConfigSyncError('Connect a backup vault first.', 'NO_VAULT');
  const valid = new Set(catalog.CATEGORIES.map(c => c.id));
  state.vault.categories = (opts.categories || []).filter(c => valid.has(c));
  saveState(home, state);
  return { ok: true, vault: publicVault(state.vault) };
}

/**
 * Compares this machine with the vault.
 * strategy only matters on the first sync, when there is no shared history:
 *   'use-vault'  files that differ come from the vault       (a new or rebuilt machine)
 *   'use-local'  files that differ come from this machine    (seeding a new vault)
 *   'merge'      files that differ are conflicts to resolve one by one
 * Nothing is deleted on a first sync: files only on one side are copied to the other.
 */
async function planVaultSync(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  if (!state.vault) throw new ConfigSyncError('Connect a backup vault first.', 'NO_VAULT');
  const v = state.vault;
  const backend = backendFor(v.ref, home, opts);
  const read = await readManifest(backend, { home, key: loadKey(home, v.id), passphrase: opts.passphrase });
  const remote = read?.manifest || newManifest('vault', v.ref.name);
  const enabled = new Set(v.categories);
  const local = snapshotLocal({ home, mode: 'vault', categories: v.categories });
  const base = v.base || {};
  const firstSync = !v.lastSyncAt;
  const localCount = local.files.size;
  const remoteCount = Object.keys(remote.files).length;
  // A machine that has much less configuration than the vault is new or rebuilt: its
  // sign-in, profile and the KGraph packages RobOS scaffolds on first launch do not count.
  const ownFiles = [...local.files.values()].filter(f => f.category !== 'cloud-accounts' && f.category !== 'profile' && !(f.category === 'kgraph' && remote.files[f.rel])).length;
  const recommended = !firstSync ? null : remoteCount === 0 ? 'use-local' : ownFiles * 2 < remoteCount ? 'use-vault' : 'merge';
  const strategy = firstSync ? (opts.strategy || recommended) : null;

  const actions = [];
  const rels = new Set([...local.files.keys(), ...Object.keys(remote.files)]);
  for (const rel of [...rels].sort()) {
    const l = local.files.get(rel);
    const r = remote.files[rel];
    const category = l?.category || r?.category || categoryOf(rel);
    if (!enabled.has(category) || isExcluded(rel)) continue;
    const L = l?.sha, R = r?.sha, B = base[rel];
    if (L === R) continue;
    let action;
    if (firstSync) {
      if (L && !R) action = 'push';
      else if (R && !L) action = 'pull';
      else action = strategy === 'use-vault' ? 'pull' : strategy === 'use-local' ? 'push' : 'conflict';
    } else if (L !== B && R === B) action = L ? 'push' : 'delete-remote';
    else if (R !== B && L === B) action = R ? 'pull' : 'delete-local';
    else action = 'conflict';
    actions.push({
      rel, category, action,
      local: l ? { sha: L, size: l.size, mtime: l.mtime } : null,
      remote: r ? { sha: R, size: r.size, mtime: r.mtime, by: r.by } : null,
      removedSecrets: l?.removed?.length || 0,
    });
  }
  const counts = actions.reduce((acc, a) => { acc[a.action] = (acc[a.action] || 0) + 1; return acc; }, {});
  return {
    ok: true, firstSync, recommended, strategy, actions, counts,
    local: { files: localCount, skipped: local.skipped, removedSecrets: [...local.files.values()].reduce((n, f) => n + f.removed.length, 0) },
    remote: { files: remoteCount, generation: remote.generation, updatedAt: remote.updatedAt, updatedBy: remote.updatedBy || null, history: (remote.history || []).slice(-8).reverse() },
  };
}

/**
 * Runs a sync. `resolutions` maps a conflicting path to 'local' or 'remote'.
 * Throws CONFLICTS when a conflict is unresolved and REMOTE_CHANGED when another machine
 * pushed in between (plan again and retry).
 */
async function applyVaultSync(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  if (!state.vault) throw new ConfigSyncError('Connect a backup vault first.', 'NO_VAULT');
  const v = state.vault;
  const plan = await planVaultSync(opts);
  const resolutions = opts.resolutions || {};
  const unresolved = plan.actions.filter(a => a.action === 'conflict' && !['local', 'remote'].includes(resolutions[a.rel]));
  if (unresolved.length) throw new ConfigSyncError(`${unresolved.length} file(s) changed on both this machine and the vault. Choose which version to keep.`, 'CONFLICTS', { conflicts: unresolved });

  const steps = plan.actions.map(a => {
    if (a.action !== 'conflict') return a;
    const keep = resolutions[a.rel];
    if (keep === 'local') return { ...a, action: a.local ? 'push' : 'delete-remote', resolved: 'local' };
    return { ...a, action: a.remote ? 'pull' : 'delete-local', resolved: 'remote' };
  });

  const backend = backendFor(v.ref, home, opts);
  const key = loadKey(home, v.id);
  const read = await readManifest(backend, { home, key });
  const before = read?.manifest || newManifest('vault', v.ref.name);
  const kdf = read?.kdf || (key ? readJson(keyFile(home), {})[v.id]?.kdf : null);
  if (before.generation !== plan.remote.generation) throw new ConfigSyncError('Another machine synced while you were reviewing. Review the changes again.', 'REMOTE_CHANGED');

  const local = snapshotLocal({ home, mode: 'vault', categories: v.categories });
  const pulls = steps.filter(s => s.action === 'pull');
  const localDeletes = steps.filter(s => s.action === 'delete-local');
  const pushes = steps.filter(s => s.action === 'push');
  const remoteDeletes = steps.filter(s => s.action === 'delete-remote');

  // Download everything first so a network failure leaves local files untouched.
  const incoming = new Map();
  for (const s of pulls) incoming.set(s.rel, await fetchBlob(backend, before.files[s.rel], key));

  let restorePointId = null;
  if (pulls.length || localDeletes.length) {
    restorePointId = createRestorePoint(home, `Vault sync from ${before.updatedBy?.machineName || 'vault'}`, [...pulls, ...localDeletes].map(s => s.rel));
  }
  for (const s of pulls) {
    const abs = absPath(home, s.rel);
    const localBuf = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    writeLocal(home, s.rel, importBuffer(s.rel, incoming.get(s.rel), localBuf, { home }));
  }
  for (const s of localDeletes) fs.rmSync(absPath(home, s.rel), { force: true });

  let after = before;
  if (pushes.length || remoteDeletes.length) {
    const entries = pushes.map(s => local.files.get(s.rel));
    await uploadBlobs(backend, entries, key);
    after = JSON.parse(JSON.stringify(before));
    const by = machineName();
    for (const e of entries) after.files[e.rel] = { sha: e.sha, blob: blobIdFor(e.sha, key), size: e.size, category: e.category, mtime: e.mtime, by };
    for (const s of remoteDeletes) delete after.files[s.rel];
    after.generation = before.generation + 1;
    after.updatedAt = new Date().toISOString();
    after.updatedBy = { machineId: state.machineId, machineName: by, user: userLabel(home) };
    after.history = [...(before.history || []), { generation: after.generation, at: after.updatedAt, machine: by, uploaded: pushes.map(s => s.rel), deleted: remoteDeletes.map(s => s.rel) }].slice(-HISTORY_LIMIT);
    const check = await readManifest(backend, { home, key });
    if ((check?.manifest.generation || 0) !== before.generation) throw new ConfigSyncError('Another machine synced while you were uploading. Sync again.', 'REMOTE_CHANGED');
    await writeManifest(backend, after, key, kdf);
    await collectGarbage(backend, before, after);
  }

  // The new base: files identical on both sides, plus what was just pulled as the vault
  // had it. A pulled file that kept a local-only sign-in then reads as a local edit and
  // is uploaded on the next sync, instead of looking like a conflict.
  const nowLocal = snapshotLocal({ home, mode: 'vault', categories: v.categories });
  const base = { ...(v.base || {}) };
  for (const [rel, f] of Object.entries(after.files)) if (nowLocal.files.get(rel)?.sha === f.sha) base[rel] = f.sha;
  for (const s of pulls) base[s.rel] = before.files[s.rel].sha;
  for (const s of [...localDeletes, ...remoteDeletes]) delete base[s.rel];
  state.vault.base = base;
  state.vault.lastSyncAt = new Date().toISOString();
  state.vault.lastGeneration = after.generation;
  saveState(home, state);

  return {
    ok: true, restorePointId, generation: after.generation,
    pushed: pushes.map(s => s.rel), pulled: pulls.map(s => s.rel),
    deletedLocal: localDeletes.map(s => s.rel), deletedRemote: remoteDeletes.map(s => s.rel),
  };
}

// ── Shares: publishing ───────────────────────────────────────────────────────

/** Data sources referenced by the shared files, described without credentials. */
function referencedConnections(home, files) {
  const sources = readJson(path.join(roots(home).config, 'data-sources.json'), []);
  if (!Array.isArray(sources)) return [];
  const text = [...files.values()].filter(f => /\.(json|jsonld)$/.test(f.rel)).map(f => f.buf.toString('utf8')).join('\n');
  return sources
    .filter(ds => ds?.id && text.includes(`"${ds.id}"`))
    .map(ds => ({ id: ds.id, name: ds.name || ds.id, driverType: ds.driverType || ds.type || 'unknown' }));
}

function requirementsFor(files, connections) {
  const req = [];
  for (const f of files.values()) {
    if (!f.removed.length) continue;
    const where = [...new Set(f.removed.map(r => r.at.split(' › ')[0]).filter(Boolean))].slice(0, 6);
    req.push({
      kind: 'sign-in', rel: f.rel, app: catalog.FILE_LABELS[f.rel] || f.rel.split('/').pop(),
      count: f.removed.length, keys: [...new Set(f.removed.map(r => r.key))], where,
      detail: `${f.removed.length} credential(s) were removed. Sign in again in ${catalog.FILE_LABELS[f.rel] || 'the app'}${where.length ? ` for ${where.join(', ')}` : ''}.`,
    });
  }
  for (const c of connections) {
    req.push({ kind: 'connection', id: c.id, driverType: c.driverType, name: c.name, detail: `Uses the ${c.driverType} data source "${c.name}". The files stay in the publisher's storage: recipients use their own ${c.driverType} sign-in and need the folder shared with them, or they stream over a Private Network.` });
  }
  return req;
}

function shareCategories(categories) {
  return (categories || []).filter(id => categoryById(id)?.shareable);
}

/** What a share would contain, without uploading anything. */
function previewShare(opts = {}) {
  const home = homeOf(opts);
  const cats = shareCategories(opts.categories);
  const seal = Boolean(opts.includeNetworkSecret && opts.passphrase);
  const snap = snapshotLocal({ home, mode: 'share', categories: cats, sealSecrets: seal });
  const connections = referencedConnections(home, snap.files);
  return {
    ok: true,
    categories: cats.map(id => {
      const files = [...snap.files.values()].filter(f => f.category === id);
      return { id, label: categoryById(id).label, files: files.length, bytes: files.reduce((n, f) => n + f.size, 0) };
    }),
    files: [...snap.files.values()].map(f => ({ rel: f.rel, category: f.category, size: f.size, removedSecrets: f.removed.length })),
    requires: requirementsFor(snap.files, connections),
    sealedNetworkSecret: seal,
    skipped: snap.skipped,
  };
}

async function writeShareContents(backend, manifestBase, snap, key, kdf, home, extra) {
  await uploadBlobs(backend, [...snap.files.values()], key);
  const manifest = { ...manifestBase };
  manifest.files = {};
  for (const f of snap.files.values()) manifest.files[f.rel] = { sha: f.sha, blob: blobIdFor(f.sha, key), size: f.size, category: f.category, mtime: f.mtime, by: machineName() };
  const connections = referencedConnections(home, snap.files);
  manifest.share = { ...(manifestBase.share || {}), ...extra, connections, requires: requirementsFor(snap.files, connections) };
  manifest.generation = (manifestBase.generation || 0) + 1;
  manifest.updatedAt = new Date().toISOString();
  manifest.updatedBy = { machineName: machineName(), user: userLabel(home) };
  manifest.history = [...(manifestBase.history || []), { generation: manifest.generation, at: manifest.updatedAt, machine: machineName(), files: Object.keys(manifest.files).length }].slice(-HISTORY_LIMIT);
  await writeManifest(backend, manifest, key, kdf);
  return manifest;
}

/**
 * Publishes chosen categories to a new folder and gives the recipients access.
 *   target: { kind: 'gdrive', accountId, parentId? } | { kind: 'folder', path }
 */
async function publishShare(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  const name = String(opts.name || '').trim();
  if (!name) throw new ConfigSyncError('Give the share a name.', 'INVALID');
  const cats = shareCategories(opts.categories);
  if (!cats.length) throw new ConfigSyncError('Pick at least one category to share.', 'INVALID');
  if (opts.includeNetworkSecret && !opts.passphrase) throw new ConfigSyncError('The network join secret can only travel in an encrypted share. Set a passphrase and tell it to the people you share with.', 'INVALID');
  const recipients = [...new Set((opts.recipients || []).map(e => String(e).trim().toLowerCase()).filter(Boolean))];
  for (const r of recipients) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r)) throw new ConfigSyncError(`"${r}" is not an email address.`, 'INVALID');

  const target = opts.target || {};
  let ref;
  if (target.kind === 'gdrive') {
    const created = await backends.createDriveFolder({ accountId: target.accountId, name: `RobOS Share — ${name}`, parentId: target.parentId, homeDir: home, fetchImpl: opts.fetchImpl });
    ref = { kind: 'gdrive', folderId: created.folderId, accountId: target.accountId, url: created.url, name: created.name };
  } else if (target.kind === 'folder') {
    const dir = path.join(target.path, name.replace(/[^\w .-]+/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    ref = { kind: 'folder', path: dir, url: `file://${dir}`, name: path.basename(dir) };
  } else throw new ConfigSyncError('Choose where to publish the share.', 'INVALID');

  const backend = backendFor(ref, home, { ...opts, create: true });
  let key = null, kdf = null;
  if (opts.passphrase) { kdf = newKdf(); key = deriveKey(opts.passphrase, kdf); }
  const seal = Boolean(opts.includeNetworkSecret && key);
  const snap = snapshotLocal({ home, mode: 'share', categories: cats, sealSecrets: seal });
  const template = catalog.SHARE_TEMPLATES.find(t => t.id === opts.template)?.id || 'custom';
  const manifest = await writeShareContents(backend, newManifest('share', name), snap, key, kdf, home, {
    template, description: String(opts.description || ''), categories: cats, publisher: userLabel(home), sealedNetworkSecret: seal,
  });
  if (key) storeKey(home, manifest.id, key, kdf);

  const grants = recipients.length ? await backend.grantAccess(recipients, { role: 'reader', message: opts.message || `${userLabel(home).name} shared the RobOS config "${name}" with you. In RobOS Preferences → Config Sync & Sharing → Shared with me, paste this folder link.` }) : [];
  const record = {
    id: manifest.id, name, template, description: manifest.share.description, categories: cats, ref,
    encrypted: Boolean(key), sealedNetworkSecret: seal, recipients: grants.map(g => ({ email: g.email, ok: g.ok, error: g.error || null })),
    generation: manifest.generation, publishedAt: manifest.updatedAt, files: Object.keys(manifest.files).length,
  };
  state.shares = state.shares.filter(s => s.id !== record.id).concat(record);
  saveState(home, state);
  return { ok: true, share: { ...record, url: ref.url }, url: ref.url, grants, requires: manifest.share.requires };
}

/** Re-publishes a share from the current local config. Subscribers see an update. */
async function updateShare(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  const rec = state.shares.find(s => s.id === opts.shareId);
  if (!rec) throw new ConfigSyncError('Share not found on this machine.', 'NOT_FOUND');
  const backend = backendFor(rec.ref, home, opts);
  const read = await readManifest(backend, { home, key: loadKey(home, rec.id), passphrase: opts.passphrase });
  if (!read) throw new ConfigSyncError('The share folder is empty or was deleted.', 'NOT_FOUND');
  const snap = snapshotLocal({ home, mode: 'share', categories: rec.categories, sealSecrets: rec.sealedNetworkSecret && Boolean(read.key) });
  const manifest = await writeShareContents(backend, read.manifest, snap, read.key, read.kdf, home, {});
  await collectGarbage(backend, read.manifest, manifest);
  rec.generation = manifest.generation;
  rec.publishedAt = manifest.updatedAt;
  rec.files = Object.keys(manifest.files).length;
  saveState(home, state);
  return { ok: true, share: { ...rec, url: rec.ref.url }, generation: manifest.generation, requires: manifest.share.requires };
}

async function grantShare(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  const rec = state.shares.find(s => s.id === opts.shareId);
  if (!rec) throw new ConfigSyncError('Share not found on this machine.', 'NOT_FOUND');
  const recipients = [...new Set((opts.recipients || []).map(e => String(e).trim().toLowerCase()).filter(Boolean))];
  const grants = await backendFor(rec.ref, home, opts).grantAccess(recipients, { role: 'reader', message: opts.message });
  for (const g of grants) rec.recipients = rec.recipients.filter(r => r.email !== g.email).concat({ email: g.email, ok: g.ok, error: g.error || null });
  saveState(home, state);
  return { ok: true, grants, share: { ...rec, url: rec.ref.url } };
}

function forgetShare(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  state.shares = state.shares.filter(s => s.id !== opts.shareId);
  saveState(home, state);
  return { ok: true };
}

// ── Shares: joining ──────────────────────────────────────────────────────────

/**
 * Merges `incoming` into `local`. Lists of objects merge by their id key; items already
 * present are updated field by field so local-only fields (credentials, local state) stay.
 * Every list item the share adds is recorded in `owned` so leaving can remove it.
 */
function mergeIncoming(local, incoming, trail = [], owned = [], stats = { added: 0, updated: 0, unchanged: 0 }) {
  if (Array.isArray(local) && Array.isArray(incoming)) {
    const key = idKeyFor(incoming);
    const out = local.slice();
    for (const item of incoming) {
      if (key) {
        const idx = out.findIndex(x => x && typeof x === 'object' && x[key] === item[key]);
        if (idx < 0) { out.push(item); stats.added++; owned.push(trail.concat({ k: key, v: item[key] })); }
        else if (isDeepStrictEqual(out[idx], item)) stats.unchanged++;
        else {
          const before = JSON.stringify(out[idx]);
          out[idx] = mergeIncoming(out[idx], item, trail.concat({ k: key, v: item[key] }), owned, { added: 0, updated: 0, unchanged: 0 });
          if (JSON.stringify(out[idx]) !== before) stats.updated++; else stats.unchanged++;
        }
      } else if (!out.some(x => isDeepStrictEqual(x, item))) { out.push(item); stats.added++; }
      else stats.unchanged++;
    }
    return out;
  }
  if (local && incoming && typeof local === 'object' && typeof incoming === 'object' && !Array.isArray(local) && !Array.isArray(incoming)) {
    const out = { ...local };
    for (const [k, v] of Object.entries(incoming)) {
      if (!(k in local)) { out[k] = v; stats.added++; }
      else if (isDeepStrictEqual(local[k], v)) stats.unchanged++;
      else if (local[k] && typeof local[k] === 'object' && v && typeof v === 'object') out[k] = mergeIncoming(local[k], v, trail.concat(k), owned, stats);
      else { out[k] = v; stats.updated++; }
    }
    return out;
  }
  if (!isDeepStrictEqual(local, incoming)) stats.updated++;
  return incoming;
}

/** Removes the list items a share added, given their recorded paths. */
function removeOwned(data, trails) {
  let removed = 0;
  for (const t of trails) {
    let node = data;
    for (let i = 0; i < t.length && node; i++) {
      const seg = t[i];
      const last = i === t.length - 1;
      if (typeof seg === 'string') { node = node[seg]; continue; }
      if (!Array.isArray(node)) { node = null; break; }
      const idx = node.findIndex(x => x && x[seg.k] === seg.v);
      if (idx < 0) { node = null; break; }
      if (last) { node.splice(idx, 1); removed++; } else node = node[idx];
    }
  }
  return removed;
}

function localConnections(home) {
  const sources = readJson(path.join(roots(home).config, 'data-sources.json'), []);
  return Array.isArray(sources) ? sources : [];
}

/** Maps the publisher's data-source ids to this machine's sources of the same type. */
function planConnections(home, connections = []) {
  const mine = localConnections(home);
  return connections.map(c => {
    const same = mine.find(m => m.id === c.id);
    if (same) return { ...c, mappedTo: same.id, mappedName: same.name || same.id };
    const match = mine.find(m => (m.driverType || m.type) === c.driverType && (m.loggedIn || m.authStatus === 'authenticated')) || mine.find(m => (m.driverType || m.type) === c.driverType);
    return { ...c, mappedTo: match?.id || null, mappedName: match ? match.name || match.id : null };
  });
}

function rebind(value, map) {
  if (!map.size) return value;
  if (Array.isArray(value)) return value.map(v => rebind(v, map));
  if (value && typeof value === 'object') { const out = {}; for (const [k, v] of Object.entries(value)) out[k] = rebind(v, map); return out; }
  return typeof value === 'string' && map.has(value) ? map.get(value) : value;
}

async function openShare(opts, home) {
  const ref = normalizeRef(opts.ref, opts.accountId);
  const backend = await openRef(ref, home, opts);
  const read = await readManifest(backend, { home, passphrase: opts.passphrase, key: opts.key });
  if (!read) throw new ConfigSyncError(`"${ref.name}" is empty. Ask the sender to publish the share again.`, 'NOT_FOUND');
  if (read.manifest.kind !== 'share') throw new ConfigSyncError(`"${ref.name}" is a backup vault, not a share. To load a vault on this machine use "Backup vault → Use an existing folder".`, 'WRONG_KIND');
  return { ref, backend, ...read };
}

/** Computes what joining (or updating) a share would change, without writing anything. */
async function computeShareEffects(home, opened, categories) {
  const { manifest, backend, key } = opened;
  const wanted = new Set(categories || manifest.share?.categories || []);
  const connections = planConnections(home, manifest.share?.connections);
  const map = new Map(connections.filter(c => c.mappedTo && c.mappedTo !== c.id).map(c => [c.id, c.mappedTo]));
  const results = [];
  for (const [rel, entry] of Object.entries(manifest.files)) {
    if (!wanted.has(entry.category) || isExcluded(rel)) continue;
    const incomingBuf = expandHome(rel, await fetchBlob(backend, entry, key), home);
    const abs = absPath(home, rel);
    const localBuf = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    const result = { rel, category: entry.category, owned: { items: [], file: false } };
    if (/\.(json|jsonld)$/i.test(rel)) {
      let inc;
      try { inc = rebind(JSON.parse(incomingBuf.toString('utf8')), map); } catch { inc = undefined; }
      if (inc !== undefined) {
        if (!localBuf) {
          result.effect = 'add'; result.stats = { added: countItems(inc), updated: 0, unchanged: 0 };
          result.buf = Buffer.from(JSON.stringify(inc, null, 2) + '\n'); result.owned.file = true;
        } else {
          let loc;
          try { loc = JSON.parse(localBuf.toString('utf8')); } catch { loc = undefined; }
          if (loc === undefined) { result.effect = 'replace'; result.buf = Buffer.from(JSON.stringify(inc, null, 2) + '\n'); }
          else {
            const stats = { added: 0, updated: 0, unchanged: 0 };
            const merged = mergeIncoming(loc, inc, [], result.owned.items, stats);
            result.stats = stats;
            result.effect = stats.added || stats.updated ? 'merge' : 'same';
            result.buf = Buffer.from(JSON.stringify(merged, null, 2) + '\n');
          }
        }
        results.push(result);
        continue;
      }
    }
    if (!localBuf) { result.effect = 'add'; result.owned.file = true; }
    else result.effect = localBuf.equals(incomingBuf) ? 'same' : 'replace';
    result.buf = incomingBuf;
    results.push(result);
  }
  return { results, connections };
}

function countItems(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.values(v).reduce((n, x) => n + (Array.isArray(x) ? x.length : 0), 0) || 1;
  return 1;
}

function shareSummary(manifest, ref) {
  return {
    id: manifest.id, name: manifest.name, description: manifest.share?.description || '', template: manifest.share?.template || 'custom',
    publisher: manifest.share?.publisher || null, categories: manifest.share?.categories || [], generation: manifest.generation,
    updatedAt: manifest.updatedAt, sealedNetworkSecret: Boolean(manifest.share?.sealedNetworkSecret), url: ref.url,
  };
}

async function previewJoin(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  const opened = await openShare(opts, home);
  const { results, connections } = await computeShareEffects(home, opened, opts.categories);
  const existing = state.subscriptions.find(s => s.id === opened.manifest.id);
  return {
    ok: true,
    share: { ...shareSummary(opened.manifest, opened.ref), encrypted: Boolean(opened.key) },
    categories: (opened.manifest.share?.categories || []).map(id => ({
      id, label: categoryById(id)?.label || id,
      files: results.filter(r => r.category === id).map(r => ({ rel: r.rel, effect: r.effect, stats: r.stats || null })),
    })),
    requires: (opened.manifest.share?.requires || []).filter(r => r.kind !== 'connection'),
    connections,
    alreadyJoined: existing ? { appliedGeneration: existing.appliedGeneration } : null,
  };
}

/** Joins a share, or applies its latest version if already joined. */
async function joinShare(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  const opened = await openShare(opts, home);
  const { manifest, ref, key, kdf } = opened;
  const existing = state.subscriptions.find(s => s.id === manifest.id);
  const categories = opts.categories || existing?.categories || manifest.share?.categories || [];
  const { results, connections } = await computeShareEffects(home, opened, categories);
  const writes = results.filter(r => r.effect !== 'same');
  const restorePointId = writes.length ? createRestorePoint(home, `${existing ? 'Update' : 'Join'} share "${manifest.name}"`, writes.map(r => r.rel)) : null;
  const owned = existing?.owned || {};
  for (const r of writes) {
    writeLocal(home, r.rel, r.buf);
    const o = owned[r.rel] || { items: [], file: false };
    if (r.owned.file && !existing?.owned?.[r.rel]) o.file = true;
    for (const t of r.owned.items) if (!o.items.some(x => isDeepStrictEqual(x, t))) o.items.push(t);
    o.sha = sha256(r.buf);
    owned[r.rel] = o;
  }
  if (key) storeKey(home, manifest.id, key, kdf);
  const record = {
    id: manifest.id, name: manifest.name, description: manifest.share?.description || '', template: manifest.share?.template || 'custom',
    publisher: manifest.share?.publisher || null, categories, ref, encrypted: Boolean(key),
    appliedGeneration: manifest.generation, latestGeneration: manifest.generation,
    joinedAt: existing?.joinedAt || new Date().toISOString(), updatedAt: new Date().toISOString(), owned,
  };
  state.subscriptions = state.subscriptions.filter(s => s.id !== manifest.id).concat(record);
  saveState(home, state);
  return {
    ok: true, restorePointId, subscription: { ...record, owned: undefined, ref: undefined, url: ref.url, ownedItems: countOwned(owned) },
    written: writes.map(r => ({ rel: r.rel, effect: r.effect, stats: r.stats || null })),
    requires: (manifest.share?.requires || []).filter(r => r.kind !== 'connection'), connections,
  };
}

/** Asks each joined share whether the publisher released a newer version. */
async function checkSubscriptions(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  const out = [];
  for (const sub of state.subscriptions) {
    try {
      const backend = backendFor(sub.ref, home, opts);
      const read = await readManifest(backend, { home, key: loadKey(home, sub.id) });
      sub.latestGeneration = read?.manifest.generation || 0;
      sub.checkedAt = new Date().toISOString();
      sub.error = null;
    } catch (err) { sub.error = err.message; }
    out.push({ id: sub.id, name: sub.name, appliedGeneration: sub.appliedGeneration, latestGeneration: sub.latestGeneration, updateAvailable: sub.latestGeneration > sub.appliedGeneration, error: sub.error || null });
  }
  saveState(home, state);
  return { ok: true, subscriptions: out };
}

async function updateSubscription(opts = {}) {
  const home = homeOf(opts);
  const sub = loadState(home).subscriptions.find(s => s.id === opts.subscriptionId);
  if (!sub) throw new ConfigSyncError('You have not joined that share on this machine.', 'NOT_FOUND');
  return joinShare({ ...opts, ref: sub.ref, key: loadKey(home, sub.id), categories: sub.categories });
}

/** Leaves a share. With removeItems, takes out every list item and file the share added. */
function leaveShare(opts = {}) {
  const home = homeOf(opts);
  const state = loadState(home);
  const sub = state.subscriptions.find(s => s.id === opts.subscriptionId);
  if (!sub) throw new ConfigSyncError('You have not joined that share on this machine.', 'NOT_FOUND');
  let removedItems = 0, removedFiles = 0, restorePointId = null;
  if (opts.removeItems) {
    const rels = Object.keys(sub.owned || {}).filter(rel => fs.existsSync(absPath(home, rel)));
    if (rels.length) restorePointId = createRestorePoint(home, `Leave share "${sub.name}"`, rels);
    for (const rel of rels) {
      const o = sub.owned[rel];
      const abs = absPath(home, rel);
      const buf = fs.readFileSync(abs);
      if (o.file && sha256(buf) === o.sha) { fs.rmSync(abs, { force: true }); removedFiles++; continue; }
      if (o.items?.length && /\.(json|jsonld)$/i.test(rel)) {
        try {
          const data = JSON.parse(buf.toString('utf8'));
          const n = removeOwned(data, o.items);
          if (n) { writeLocal(home, rel, Buffer.from(JSON.stringify(data, null, 2) + '\n')); removedItems += n; }
        } catch {}
      }
    }
  }
  forgetKey(home, sub.id);
  state.subscriptions = state.subscriptions.filter(s => s.id !== sub.id);
  saveState(home, state);
  return { ok: true, removedItems, removedFiles, restorePointId };
}

module.exports = {
  ConfigSyncError, FORMAT, HOME_TOKEN,
  // status
  getStatus, describeCategories, listLocalFiles, categoryOf, isExcluded,
  // vault
  connectVault, disconnectVault, setVaultCategories, planVaultSync, applyVaultSync,
  // shares
  previewShare, publishShare, updateShare, grantShare, forgetShare,
  previewJoin, joinShare, checkSubscriptions, updateSubscription, leaveShare,
  // restore points
  listRestorePoints, restoreRestorePoint, createRestorePoint,
  // internals exposed for tests
  _internal: { exportBuffer, importBuffer, restoreSecrets, mergeIncoming, removeOwned, snapshotLocal, globRe, isSecretKey, encrypt, decrypt, deriveKey, newKdf },
};
