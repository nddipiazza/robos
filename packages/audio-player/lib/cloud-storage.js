'use strict';
// Bridges the Audio Player to RobOS cloud storage connections configured in
// Data Sources (~/.config/robos/data-sources.json).
//
// Design:
// 1. Metadata-only indexing: Adding or syncing a cloud folder NEVER downloads all
//    audio files upfront. It lists/walks the remote folder and returns lightweight
//    track descriptors pointing to their future local cache path.
// 2. Stream-to-file upon play: When a cloud track is played (locally or via Cast),
//    it is streamed immediately to the HTTP response while tee-writing to a
//    temporary `.part` file in `~/.cache/robos/audio-player/cloud/`. Once the
//    stream finishes, `.part` is atomically renamed to the final cache path so
//    subsequent plays/seeks are served directly from the local cache.
// 3. Bounded LRU cache: After any file is cached (or when the max size setting
//    is updated), `enforceCacheLimit()` evicts the least-recently-used cached
//    audio files so total disk usage stays within `maxCacheBytes` (default 500 MB).

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR = path.join(process.env.HOME || os.homedir(), '.config', 'robos');
const CONFIG_FILE = path.join(CONFIG_DIR, 'data-sources.json');
const CACHE_SETTINGS_FILE = path.join(CONFIG_DIR, 'audio-cache-settings.json');
const CACHE_ROOT = path.join(process.env.HOME || os.homedir(), '.cache', 'robos', 'audio-player', 'cloud');
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus', '.wma']);

const DEFAULT_MAX_CACHE_BYTES = 500 * 1024 * 1024; // 500 MB default
const MIN_MAX_CACHE_BYTES = 50 * 1024 * 1024;      // 50 MB minimum

// Track active background downloads to avoid duplicate concurrent streams to the same file
// cachePath -> Promise<string>
const activeCacheWrites = new Map();

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

// Never hands passwords/tokens to the renderer.
function listConnections() {
  const rs = (() => { try { return loadRemoteStorage(); } catch { return null; } })();
  return readConnections().map(d => {
    const rawStart = d.database || '/';
    const startPath = (d.driverType === 'sftp' || d.driverType === 'ftp')
      ? rawStart
      : (String(rawStart).startsWith('/') ? rawStart : '/');
    const rawLinked = (rs && (d.driverType === 'gdrive' || d.driverType === 'onedrive'))
      ? rs.normalizeCloudFoldersArray(d)
      : [];
    const linkedFolders = rawLinked.map((f, _idx, arr) => ({
      id: f.id,
      folderId: f.id,
      label: f.label || f.id,
      virtualName: f.virtualName || f.label || f.id,
      remotePath: arr.length > 1 ? `/${f.virtualName || f.label || f.id}` : '/',
    }));
    const folderSummary = linkedFolders.length > 1
      ? `${linkedFolders.length} folders (${linkedFolders.map(f => f.label || f.id).join(', ')})`
      : (linkedFolders[0]?.label || d.folderId);
    return {
      id: d.id,
      name: d.name,
      user: d.user || '',
      driverType: d.driverType,
      folders: linkedFolders,
      host: d.driverType === 'gdrive'
        ? (folderSummary || 'My Drive')
        : d.driverType === 'onedrive'
          ? (folderSummary || d.user || 'OneDrive')
          : (d.host || d.bucket || 'local'),
      startPath,
      browsable: !!(rs && rs.isRemoteDriver(d.driverType)),
    };
  });
}

async function list(id, remotePath, options = {}) {
  const ds = getConnection(id);
  const listing = await loadRemoteStorage().listDir(ds, remotePath, options);
  return {
    path: listing.path,
    entries: listing.entries.filter(e => e.type === 'dir' || AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase())),
  };
}

function cachePathFor(id, remoteFile) {
  const rel = path.posix.normalize('/' + remoteFile).split('/').filter(p => p && p !== '..').join(path.sep);
  return path.join(CACHE_ROOT, String(id).replace(/[^a-zA-Z0-9._-]/g, '_'), rel);
}

// Local directory that mirrors a remote folder in the download cache.
function localDirFor(id, remoteDir) {
  return cachePathFor(id, remoteDir);
}

// ── Bounded LRU Audio Cache Management ──────────────────────────────────────

function getCacheSettings() {
  try {
    if (fs.existsSync(CACHE_SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CACHE_SETTINGS_FILE, 'utf8'));
      const maxBytes = Number(parsed.maxCacheBytes);
      if (Number.isFinite(maxBytes) && maxBytes >= MIN_MAX_CACHE_BYTES) {
        return { maxCacheBytes: maxBytes };
      }
    }
  } catch {}
  return { maxCacheBytes: DEFAULT_MAX_CACHE_BYTES };
}

function setMaxCacheBytes(maxBytes) {
  const normalized = Math.max(MIN_MAX_CACHE_BYTES, Number(maxBytes) || DEFAULT_MAX_CACHE_BYTES);
  try {
    fs.mkdirSync(path.dirname(CACHE_SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(CACHE_SETTINGS_FILE, JSON.stringify({
      maxCacheBytes: normalized,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch {}
  enforceCacheLimit();
  return getCacheStats();
}

function touchCacheFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const now = new Date();
      fs.utimesSync(filePath, now, now);
    }
  } catch {}
}

function listCachedAudioFiles(dir = CACHE_ROOT) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const walk = (currentDir) => {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.part') || entry.name.startsWith('.')) continue;
        try {
          const stat = fs.statSync(fullPath);
          results.push({
            path: fullPath,
            name: entry.name,
            size: stat.size,
            LastUsedMs: Math.max(stat.mtimeMs || 0, stat.atimeMs || 0),
          });
        } catch {}
      }
    }
  };

  walk(dir);
  return results;
}

/**
 * Enforces the LRU cache size limit by evicting least-recently-used cached audio
 * files until total cache size is <= maxCacheBytes.
 * @param {string[]} [protectedPaths] - Optional file paths that should not be evicted right now
 */
function enforceCacheLimit(protectedPaths = []) {
  const { maxCacheBytes } = getCacheSettings();
  const protectedSet = new Set(protectedPaths.filter(Boolean));
  for (const activePath of activeCacheWrites.keys()) {
    protectedSet.add(activePath);
  }

  const files = listCachedAudioFiles();
  let totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const evicted = [];

  if (totalBytes <= maxCacheBytes) {
    return { totalBytes, maxCacheBytes, fileCount: files.length, evicted };
  }

  // Sort ascending by LastUsedMs (oldest / least recently used first)
  files.sort((a, b) => a.LastUsedMs - b.LastUsedMs);

  for (const file of files) {
    if (totalBytes <= maxCacheBytes) break;
    if (protectedSet.has(file.path)) continue;
    try {
      fs.unlinkSync(file.path);
      totalBytes -= file.size;
      evicted.push(file.path);
    } catch {}
  }

  return {
    totalBytes: Math.max(0, totalBytes),
    maxCacheBytes,
    fileCount: Math.max(0, files.length - evicted.length),
    evicted,
  };
}

function getCacheStats() {
  const { maxCacheBytes } = getCacheSettings();
  const files = listCachedAudioFiles();
  const usedBytes = files.reduce((acc, f) => acc + f.size, 0);
  return {
    cacheRoot: CACHE_ROOT,
    usedBytes,
    maxCacheBytes,
    fileCount: files.length,
    activeStreams: activeCacheWrites.size,
  };
}

function clearCache(protectedPaths = []) {
  const protectedSet = new Set(protectedPaths.filter(Boolean));
  const files = listCachedAudioFiles();
  let removed = 0;
  for (const file of files) {
    if (protectedSet.has(file.path)) continue;
    try {
      fs.unlinkSync(file.path);
      removed++;
    } catch {}
  }
  return { removed, ...getCacheStats() };
}

function isTrackCached(localPath, expectedSize = null) {
  try {
    if (!localPath || !fs.existsSync(localPath)) return false;
    const stat = fs.statSync(localPath);
    if (stat.size <= 0) return false;
    if (expectedSize != null && expectedSize > 0 && stat.size !== expectedSize) return false;
    return true;
  } catch {
    return false;
  }
}

// ── Metadata-Only Cloud Indexing (No Bulk Upfront Downloads) ────────────────

/**
 * Indexes audio files from a remote connection/path WITHOUT downloading the
 * audio files upfront. Returns track metadata descriptors pointing to their
 * future local cache path.
 */
async function indexCloudAudio(id, remotePaths, onProgress, options = {}) {
  const ds = getConnection(id);
  const rs = loadRemoteStorage();
  const isAudio = (n) => AUDIO_EXTENSIONS.has(path.extname(n).toLowerCase());

  const descriptors = [];
  for (const rp of remotePaths) {
    if (isAudio(rp)) {
      const localPath = cachePathFor(id, rp);
      descriptors.push({
        connectionId: id,
        driverType: ds.driverType,
        remotePath: path.posix.normalize('/' + rp),
        driveId: null,
        name: path.posix.basename(rp),
        size: null,
        modified: null,
        localPath,
        cached: isTrackCached(localPath),
      });
      continue;
    }
    onProgress && onProgress({ phase: 'scanning', path: rp });
    const walked = await rs.walk(ds, rp, isAudio, Number.MAX_SAFE_INTEGER, options);
    for (const e of walked) {
      const localPath = cachePathFor(id, e.path);
      descriptors.push({
        connectionId: id,
        driverType: ds.driverType,
        remotePath: e.path,
        driveId: e.driveId || null,
        name: e.name || path.posix.basename(e.path),
        size: e.size != null ? e.size : null,
        modified: e.modified || null,
        localPath,
        cached: isTrackCached(localPath, e.size),
      });
    }
  }

  onProgress && onProgress({ phase: 'done', done: descriptors.length, total: descriptors.length });
  return descriptors;
}

/**
 * Ensures a single cloud track is downloaded into the local cache on demand,
 * then enforces the LRU cache size limit.
 */
async function ensureTrackCached({ connectionId, remotePath, driveId, size }) {
  const localPath = cachePathFor(connectionId, remotePath);
  if (isTrackCached(localPath, size)) {
    touchCacheFile(localPath);
    return localPath;
  }

  if (activeCacheWrites.has(localPath)) {
    return activeCacheWrites.get(localPath);
  }

  const downloadPromise = (async () => {
    const ds = getConnection(connectionId);
    const rs = loadRemoteStorage();
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const partPath = `${localPath}.part.${process.pid}.${Date.now()}`;

    try {
      if (ds.driverType === 'gdrive' && typeof rs.openGDriveMediaStream === 'function') {
        const { stream } = await rs.openGDriveMediaStream(ds, {
          remoteFile: remotePath,
          driveId: driveId || null,
        });
        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(partPath);
          stream.pipe(out);
          out.on('finish', () => out.close(resolve));
          out.on('error', reject);
          stream.on('error', reject);
        });
      } else if (ds.driverType === 'onedrive' && typeof rs.openOneDriveMediaStream === 'function') {
        const { stream } = await rs.openOneDriveMediaStream(ds, {
          remoteFile: remotePath,
          driveId: driveId || null,
        });
        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(partPath);
          stream.pipe(out);
          out.on('finish', () => out.close(resolve));
          out.on('error', reject);
          stream.on('error', reject);
        });
      } else {
        await rs.download(ds, remotePath, partPath, { driveId: driveId || '' });
      }

      fs.renameSync(partPath, localPath);
      touchCacheFile(localPath);
      enforceCacheLimit([localPath]);
      return localPath;
    } catch (err) {
      try { if (fs.existsSync(partPath)) fs.unlinkSync(partPath); } catch {}
      throw err;
    } finally {
      activeCacheWrites.delete(localPath);
    }
  })();

  activeCacheWrites.set(localPath, downloadPromise);
  return downloadPromise;
}

function serveFromLocalCache(req, res, localPath, contentType = 'audio/mpeg', cacheHeader = 'HIT') {
  touchCacheFile(localPath);
  const stat = fs.statSync(localPath);
  const total = stat.size;
  const range = req.headers && req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10) || 0;
    const end = parts[1] ? Math.min(parseInt(parts[1], 10), total - 1) : total - 1;
    const chunksize = Math.max(0, (end - start) + 1);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'X-RobOS-Cache': cacheHeader,
    });
    fs.createReadStream(localPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      'X-RobOS-Cache': cacheHeader,
    });
    fs.createReadStream(localPath).pipe(res);
  }
}

/**
 * Streams a cloud track to an HTTP response (`res`) using single-flight caching.
 * If the track is already in the local cache, serves it directly from disk with
 * full byte-range support (0 API calls). On a cache miss, deduplicates concurrent
 * browser Range requests through `ensureTrackCached` (`activeCacheWrites`) so at
 * most ONE Google Drive / OneDrive request is made per song, then serves from disk.
 */
async function streamCloudTrackToHttp(req, res, cloudMeta, onCached = null) {
  const { connectionId, remotePath, driveId, size, contentType = 'audio/mpeg' } = cloudMeta;
  const localPath = cachePathFor(connectionId, remotePath);

  // 1. Cache Hit: serve directly from local cache with Range support & touch LRU (0 API calls)
  if (isTrackCached(localPath, size)) {
    serveFromLocalCache(req, res, localPath, contentType, 'HIT');
    return;
  }

  // 2. Cache Miss: Single-flight download into cache (deduplicating concurrent Range requests)
  const wasAlreadyDownloading = activeCacheWrites.has(localPath);
  const cachedFile = await ensureTrackCached({ connectionId, remotePath, driveId, size });
  if (!wasAlreadyDownloading && typeof onCached === 'function') {
    try { onCached(cachedFile); } catch {}
  }
  serveFromLocalCache(req, res, cachedFile, contentType, 'MISS-CACHED');
}

/**
 * Reads bytes [start, end] of a cloud audio file without caching it (used to read
 * tags). Resolves { buffer, totalSize }, or null for connections that cannot
 * fetch byte ranges (FTP / SFTP).
 */
async function readRemoteRange({ connectionId, remotePath, driveId }, start, end) {
  const ds = getConnection(connectionId);
  const rs = loadRemoteStorage();
  const open = ds.driverType === 'gdrive' ? rs.openGDriveMediaStream
    : ds.driverType === 'onedrive' ? rs.openOneDriveMediaStream
      : null;
  if (typeof open !== 'function') return null;
  const res = await open(ds, { remoteFile: remotePath, driveId: driveId || '', range: `bytes=${start}-${end}` });
  // A server that ignores Range sends the whole file from byte 0.
  const skip = res.status === 206 ? 0 : start;
  const want = end - start + 1;
  const chunks = [];
  let seen = 0;
  let kept = 0;
  await new Promise((resolve, reject) => {
    const stream = res.stream;
    const finish = () => { stream.removeAllListeners('data'); stream.destroy(); resolve(); };
    stream.on('data', (chunk) => {
      let c = chunk;
      if (seen < skip) {
        const drop = Math.min(skip - seen, c.length);
        seen += drop;
        c = c.subarray(drop);
      }
      if (c.length) {
        c = c.subarray(0, want - kept);
        chunks.push(c);
        kept += c.length;
      }
      if (kept >= want) finish();
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const m = /\/(\d+)\s*$/.exec(res.contentRange || '');
  const totalSize = m ? Number(m[1]) : (res.status !== 206 && res.contentLength ? Number(res.contentLength) : null);
  return { buffer: Buffer.concat(chunks), totalSize };
}

// Legacy alias kept for compatibility, but now indexes metadata only unless explicitly requested
async function fetchAudio(id, remotePaths, onProgress) {
  const descriptors = await indexCloudAudio(id, remotePaths, onProgress);
  return descriptors.map(d => d.localPath);
}

module.exports = {
  CACHE_ROOT,
  DEFAULT_MAX_CACHE_BYTES,
  listConnections,
  list,
  cachePathFor,
  localDirFor,
  indexCloudAudio,
  fetchAudio,
  ensureTrackCached,
  streamCloudTrackToHttp,
  readRemoteRange,
  isTrackCached,
  touchCacheFile,
  enforceCacheLimit,
  getCacheStats,
  setMaxCacheBytes,
  clearCache,
};
