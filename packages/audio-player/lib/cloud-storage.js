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
    return {
      id: d.id,
      name: d.name,
      driverType: d.driverType,
      host: d.driverType === 'gdrive' ? (d.folderId || 'My Drive') : (d.host || d.bucket || 'local'),
      startPath,
      browsable: !!(rs && rs.isRemoteDriver(d.driverType)),
    };
  });
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
async function indexCloudAudio(id, remotePaths, onProgress) {
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
    const walked = await rs.walk(ds, rp, isAudio);
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
      } else {
        await rs.download(ds, remotePath, partPath);
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

/**
 * Streams a cloud track to an HTTP response (`res`) while progressive-caching
 * it to disk on play. If the track is already in the local cache, serves it
 * directly from disk with full byte-range support and updates its LRU timestamp.
 */
async function streamCloudTrackToHttp(req, res, cloudMeta, onCached = null) {
  const { connectionId, remotePath, driveId, size, contentType = 'audio/mpeg' } = cloudMeta;
  const localPath = cachePathFor(connectionId, remotePath);

  // 1. Cache Hit: serve directly from local cache with Range support & touch LRU
  if (isTrackCached(localPath, size)) {
    touchCacheFile(localPath);
    const stat = fs.statSync(localPath);
    const total = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? Math.min(parseInt(parts[1], 10), total - 1) : total - 1;
      const chunksize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'X-RobOS-Cache': 'HIT',
      });
      fs.createReadStream(localPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'X-RobOS-Cache': 'HIT',
      });
      fs.createReadStream(localPath).pipe(res);
    }
    return;
  }

  // 2. Cache Miss: Stream from remote storage while caching to disk in background
  const ds = getConnection(connectionId);
  const rs = loadRemoteStorage();

  // Trigger background full-file cache write if not already running for this track
  if (!activeCacheWrites.has(localPath)) {
    ensureTrackCached({ connectionId, remotePath, driveId, size })
      .then((cachedFile) => {
        if (typeof onCached === 'function') {
          try { onCached(cachedFile); } catch {}
        }
      })
      .catch((err) => {
        console.warn('[CloudStorage] Background cache write failed:', err.message);
      });
  }

  // For Google Drive, stream bytes immediately to the player with Range forwarding
  if (ds.driverType === 'gdrive' && typeof rs.openGDriveMediaStream === 'function') {
    const rangeHeader = req.headers.range || undefined;
    const upstream = await rs.openGDriveMediaStream(ds, {
      remoteFile: remotePath,
      driveId: driveId || null,
      range: rangeHeader,
    });

    const resHeaders = {
      'Content-Type': upstream.headers['content-type'] || contentType,
      'Accept-Ranges': 'bytes',
      'X-RobOS-Cache': 'MISS-STREAMING',
    };
    if (upstream.headers['content-length']) {
      resHeaders['Content-Length'] = upstream.headers['content-length'];
    }
    if (upstream.headers['content-range']) {
      resHeaders['Content-Range'] = upstream.headers['content-range'];
    }

    res.writeHead(upstream.statusCode === 206 ? 206 : 200, resHeaders);
    upstream.stream.pipe(res);
    req.on('close', () => {
      try { upstream.stream.destroy(); } catch {}
    });
    return;
  }

  // Fallback for non-HTTP drivers (SFTP/FTP): wait for the on-demand cache file, then serve
  const cachedFile = await ensureTrackCached({ connectionId, remotePath, driveId, size });
  if (typeof onCached === 'function') {
    try { onCached(cachedFile); } catch {}
  }
  const stat = fs.statSync(cachedFile);
  res.writeHead(200, {
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'X-RobOS-Cache': 'MISS-DOWNLOADED',
  });
  fs.createReadStream(cachedFile).pipe(res);
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
  isTrackCached,
  touchCacheFile,
  enforceCacheLimit,
  getCacheStats,
  setMaxCacheBytes,
  clearCache,
};
