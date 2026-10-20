'use strict';
// Bridges the Audio Player to RobOS cloud storage: the FTP / SFTP connections
// configured in Data Sources (~/.config/robos/data-sources.json).

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(process.env.HOME || os.homedir(), '.config', 'robos', 'data-sources.json');
const CACHE_ROOT = path.join(process.env.HOME || os.homedir(), '.cache', 'robos', 'audio-player', 'cloud');
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus', '.wma']);

function loadRemoteStorage() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'data-sources', 'lib', 'remote-storage'),
    '/usr/local/share/robos/data-sources/lib/remote-storage',
  ];
  for (const c of candidates) {
    try { return require(c); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
  }
  throw new Error('RobOS Data Sources is not installed; cannot reach cloud storage.');
}

function readConnections() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return Array.isArray(data) ? data.filter(d => d.category === 'storage') : [];
  } catch {
    return [];
  }
}

function resolveKey(ds) {
  if (ds.privateKeyPath && ds.privateKeyPath.startsWith('~')) {
    return { ...ds, privateKeyPath: path.join(process.env.HOME || os.homedir(), ds.privateKeyPath.slice(1)) };
  }
  return ds;
}

function getConnection(id) {
  const ds = readConnections().find(d => d.id === id);
  if (!ds) throw new Error('Cloud storage connection not found. Check Data Sources.');
  return resolveKey(ds);
}

// Never hands passwords to the renderer.
function listConnections() {
  const rs = (() => { try { return loadRemoteStorage(); } catch { return null; } })();
  return readConnections().map(d => ({
    id: d.id,
    name: d.name,
    driverType: d.driverType,
    host: d.host,
    startPath: d.database || '/',
    browsable: !!(rs && rs.isRemoteDriver(d.driverType)),
  }));
}

async function list(id, remotePath) {
  const ds = getConnection(id);
  const listing = await loadRemoteStorage().listDir(ds, remotePath);
  return {
    path: listing.path,
    entries: listing.entries.filter(e => e.type === 'dir' || AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase())),
  };
}

function cachePathFor(id, remoteFile) {
  const rel = path.posix.normalize('/' + remoteFile).split('/').filter(p => p && p !== '..').join(path.sep);
  return path.join(CACHE_ROOT, id.replace(/[^a-zA-Z0-9._-]/g, '_'), rel);
}

// Downloads the chosen files (and audio found under chosen folders) into the
// local cache and returns the local paths.
async function fetchAudio(id, remotePaths, onProgress) {
  const ds = getConnection(id);
  const rs = loadRemoteStorage();
  const isAudio = (n) => AUDIO_EXTENSIONS.has(path.extname(n).toLowerCase());

  const files = [];
  for (const rp of remotePaths) {
    if (isAudio(rp)) { files.push({ path: rp, size: null }); continue; }
    onProgress && onProgress({ phase: 'scanning', path: rp });
    for (const e of await rs.walk(ds, rp, isAudio)) files.push({ path: e.path, size: e.size });
  }

  const out = [];
  let done = 0;
  for (const f of files) {
    const local = cachePathFor(id, f.path);
    let cached = false;
    try { cached = f.size != null && fs.statSync(local).size === f.size; } catch {}
    onProgress && onProgress({ phase: 'downloading', done, total: files.length, name: path.posix.basename(f.path) });
    if (!cached) await rs.download(ds, f.path, local);
    out.push(local);
    done++;
  }
  onProgress && onProgress({ phase: 'done', done, total: files.length });
  return out;
}

// Local directory that mirrors a remote folder in the download cache.
function localDirFor(id, remoteDir) {
  return cachePathFor(id, remoteDir);
}

module.exports = { listConnections, list, fetchAudio, localDirFor };
