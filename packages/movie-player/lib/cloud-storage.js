/**
 * Cloud Storage & On-Demand Video Streaming Service for RobOS Movie Player
 *
 * Bridges `~/.config/robos/data-sources.json` (configured in the RobOS Data Sources app)
 * and `~/.config/robos/cloud-accounts.json` with the Movie Player:
 *
 *   1. Reads all configured cloud & remote filesystem sources:
 *      - Google Drive (`google-drive`)
 *      - Microsoft OneDrive (`onedrive`)
 *      - Dropbox (`dropbox`)
 *      - S3 / MinIO (`s3`)
 *      - SFTP / SSH (`sftp`)
 *      - FTP / FTPS (`ftp`)
 *      - Local / NFS / SMB mounted folders (`filesystem`)
 *   2. Metadata-Only Indexing (`indexSource`):
 *      Recursively walks a source's remote movie folders and builds `LibraryIndex`
 *      movie records WITHOUT downloading video bodies — so a 50,000-movie cloud
 *      library indexes in seconds and uses zero disk space.
 *   3. Local HTTP Byte-Range Streaming Proxy (`/cloud-stream/:trackId`):
 *      When a cloud movie is played or cast to a Google TV / Chromecast, streams
 *      it on-demand via an internal HTTP server supporting `Range: bytes=...`
 *      and caches recently watched movies in a bounded LRU cache
 *      (`~/.cache/robos/movie-player/cloud`, default 2 GB max).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { AUDIO_EXTENSIONS, guessFromRemotePath, readTrackMetadata } = require('./track-metadata');
const { enrichCloudTrackTags } = require('./cloud-tags');

const DATA_SOURCES_PATH = path.join(os.homedir(), '.config', 'robos', 'data-sources.json');
const CACHE_SETTINGS_PATH = path.join(os.homedir(), '.config', 'robos', 'movie-cache-settings.json');
const CLOUD_CACHE_DIR = path.join(os.homedir(), '.cache', 'robos', 'movie-player', 'cloud');
const DEFAULT_MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB LRU budget for video

const CLOUD_SOURCE_TYPES = new Set([
  'google-drive',
  'onedrive',
  'dropbox',
  's3',
  'sftp',
  'ftp',
  'filesystem'
]);

const MIME_BY_EXT = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ogv': 'video/ogg',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg'
};

function readPassSecret(passPath) {
  if (!passPath) return '';
  return new Promise(resolve => {
    const proc = spawn('pass', ['show', passPath], { timeout: 5000 });
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('close', code => {
      resolve(code === 0 ? out.split('\n')[0].trim() : '');
    });
    proc.on('error', () => resolve(''));
  });
}

function httpsJsonRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: res.statusCode, data: JSON.parse(text), headers: res.headers });
        } catch (_) {
          resolve({ status: res.statusCode, data: text, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Cloud API timeout')));
    if (body) req.write(body);
    req.end();
  });
}

function downloadHttpsToFile(options, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tmp = `${destPath}.part-${process.pid}-${Date.now()}`;
    const out = fs.createWriteStream(tmp);
    const req = https.request(options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        out.close();
        try { fs.unlinkSync(tmp); } catch (_) {}
        const redirected = new URL(res.headers.location);
        downloadHttpsToFile({
          hostname: redirected.hostname,
          path: redirected.pathname + redirected.search,
          method: 'GET',
          headers: options.headers
        }, destPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        out.close();
        try { fs.unlinkSync(tmp); } catch (_) {}
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          try {
            fs.renameSync(tmp, destPath);
            resolve(destPath);
          } catch (e) {
            reject(e);
          }
        });
      });
    });
    req.on('error', err => {
      out.close();
      try { fs.unlinkSync(tmp); } catch (_) {}
      reject(err);
    });
    req.end();
  });
}

class CloudStorageManager {
  constructor({ libraryIndex, artDir }) {
    this.libraryIndex = libraryIndex;
    this.artDir = artDir;
    this.server = null;
    this.port = 0;
    this.inflightDownloads = new Map();
    this.maxCacheBytes = DEFAULT_MAX_CACHE_BYTES;
    fs.mkdirSync(CLOUD_CACHE_DIR, { recursive: true });
    this._loadSettings();
  }

  _loadSettings() {
    try {
      if (fs.existsSync(CACHE_SETTINGS_PATH)) {
        const raw = JSON.parse(fs.readFileSync(CACHE_SETTINGS_PATH, 'utf8'));
        if (Number(raw.maxCacheBytes) >= 64 * 1024 * 1024) {
          this.maxCacheBytes = Number(raw.maxCacheBytes);
        }
      }
    } catch (_) {}
  }

  _saveSettings() {
    try {
      fs.mkdirSync(path.dirname(CACHE_SETTINGS_PATH), { recursive: true });
      fs.writeFileSync(CACHE_SETTINGS_PATH, JSON.stringify({
        maxCacheBytes: this.maxCacheBytes,
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch (_) {}
  }

  setMaxCacheBytes(bytes) {
    const val = Number(bytes);
    if (!Number.isFinite(val) || val < 64 * 1024 * 1024) {
      throw new Error('Max cache size must be at least 64 MB');
    }
    this.maxCacheBytes = Math.round(val);
    this._saveSettings();
    this.enforceCacheBudget(0);
    return this.getCacheStatus();
  }

  clearCache() {
    let removed = 0;
    try {
      const files = fs.readdirSync(CLOUD_CACHE_DIR);
      for (const f of files) {
        const full = path.join(CLOUD_CACHE_DIR, f);
        try {
          fs.unlinkSync(full);
          removed++;
        } catch (_) {}
      }
    } catch (_) {}
    return { removed, ...this.getCacheStatus() };
  }

  loadConfiguredSources() {
    try {
      if (!fs.existsSync(DATA_SOURCES_PATH)) return [];
      const data = JSON.parse(fs.readFileSync(DATA_SOURCES_PATH, 'utf8'));
      const sources = Array.isArray(data.sources) ? data.sources : [];
      return sources
        .filter(s => CLOUD_SOURCE_TYPES.has(s.type))
        .map(s => ({
          id: s.id,
          name: s.name,
          type: s.type,
          status: s.status || 'unknown',
          description: s.description || '',
          tags: s.tags || [],
          config: s.config || {}
        }));
    } catch (_) {
      return [];
    }
  }

  getSourceById(sourceId) {
    const all = this.loadConfiguredSources();
    return all.find(s => s.id === sourceId) || null;
  }

  async resolveAccessToken(source) {
    const cfg = source.config || {};
    if (cfg.accessToken) return cfg.accessToken;
    const passPath = cfg.passStorePath || `robos/data-sources/${source.id}`;
    const secret = await readPassSecret(passPath);
    if (!secret) return '';

    if (source.type === 'google-drive' && cfg.clientId && secret.startsWith('1//')) {
      const clientSecret = await readPassSecret(`${passPath}-client-secret`);
      const form = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: clientSecret,
        refresh_token: secret,
        grant_type: 'refresh_token'
      }).toString();
      const resp = await httpsJsonRequest({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(form)
        }
      }, form);
      if (resp.data && resp.data.access_token) return resp.data.access_token;
    }

    if (source.type === 'onedrive' && cfg.clientId && secret.length > 40 && !secret.startsWith('ey')) {
      const tenant = cfg.tenantId || 'common';
      const form = new URLSearchParams({
        client_id: cfg.clientId,
        refresh_token: secret,
        grant_type: 'refresh_token',
        scope: 'Files.Read offline_access'
      }).toString();
      const resp = await httpsJsonRequest({
        hostname: 'login.microsoftonline.com',
        path: `/${tenant}/oauth2/v2.0/token`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(form)
        }
      }, form);
      if (resp.data && resp.data.access_token) return resp.data.access_token;
    }

    return secret;
  }

  resolveLocalMirrorPath(source, subPath = '') {
    const cfg = source.config || {};
    const candidates = [
      cfg.localSyncPath,
      cfg.rootPath,
      cfg.mountPath,
      source.type === 'google-drive' ? path.join(os.homedir(), 'GoogleDrive') : null,
      source.type === 'google-drive' ? path.join(os.homedir(), 'Google Drive') : null,
      source.type === 'onedrive' ? path.join(os.homedir(), 'OneDrive') : null,
      source.type === 'dropbox' ? path.join(os.homedir(), 'Dropbox') : null
    ].filter(Boolean);

    for (const root of candidates) {
      const expanded = root.replace(/^~(?=$|\/)/, os.homedir());
      if (fs.existsSync(expanded)) {
        const cleanSub = String(subPath || '').replace(/^\/+/, '');
        const joined = path.resolve(expanded, cleanSub);
        if (joined.startsWith(path.resolve(expanded)) && fs.existsSync(joined)) {
          return joined;
        }
      }
    }
    return null;
  }

  async browse(sourceId, remotePath = '/') {
    const source = this.getSourceById(sourceId);
    if (!source) throw new Error(`Cloud source not found: ${sourceId}`);

    const localDir = this.resolveLocalMirrorPath(source, remotePath);
    if (localDir && fs.existsSync(localDir)) {
      const entries = fs.readdirSync(localDir, { withFileTypes: true });
      const items = [];
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(localDir, e.name);
        const rel = path.posix.join(remotePath || '/', e.name);
        if (e.isDirectory()) {
          items.push({ name: e.name, path: rel, type: 'folder', size: 0 });
        } else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (AUDIO_EXTENSIONS.has(ext)) {
            let st = null;
            try { st = fs.statSync(full); } catch (_) {}
            items.push({
              name: e.name,
              path: rel,
              type: 'audio',
              size: st ? st.size : 0,
              mtime: st ? st.mtime.toISOString() : null
            });
          }
        }
      }
      items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
      return { source, path: remotePath, mode: 'local-mirror', items };
    }

    if (source.type === 'google-drive') {
      const token = await this.resolveAccessToken(source);
      if (!token) {
        return {
          source,
          path: remotePath,
          mode: 'unauthenticated',
          items: [],
          hint: 'Configure Google Drive OAuth token in RobOS Cloud Accounts / Data Sources or set a local sync folder (~/GoogleDrive).'
        };
      }
      const parentId = (!remotePath || remotePath === '/')
        ? (source.config.rootFolderId || 'root')
        : remotePath;
      const q = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
      const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime)');
      const resp = await httpsJsonRequest({
        hostname: 'www.googleapis.com',
        path: `/drive/v3/files?q=${q}&pageSize=500&fields=${fields}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      const files = (resp.data && Array.isArray(resp.data.files)) ? resp.data.files : [];
      const items = [];
      for (const f of files) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          items.push({ name: f.name, path: f.id, displayPath: `${remotePath}/${f.name}`, type: 'folder', size: 0 });
        } else {
          const ext = path.extname(f.name).toLowerCase();
          if (AUDIO_EXTENSIONS.has(ext) || (f.mimeType && (f.mimeType.startsWith('video/') || f.mimeType.startsWith('audio/')))) {
            items.push({
              id: f.id,
              name: f.name,
              path: `${remotePath === '/' ? '' : remotePath}/${f.name}`,
              driveFileId: f.id,
              type: 'audio',
              size: Number(f.size) || 0,
              mtime: f.modifiedTime || null
            });
          }
        }
      }
      return { source, path: remotePath, mode: 'google-drive-api', items };
    }

    if (source.type === 'onedrive') {
      const token = await this.resolveAccessToken(source);
      if (!token) {
        return {
          source,
          path: remotePath,
          mode: 'unauthenticated',
          items: [],
          hint: 'Configure OneDrive OAuth token in RobOS Cloud Accounts / Data Sources or mount ~/OneDrive locally.'
        };
      }
      const cleanPath = (!remotePath || remotePath === '/')
        ? '/me/drive/root/children'
        : `/me/drive/root:${encodeURI(remotePath)}:/children`;
      const resp = await httpsJsonRequest({
        hostname: 'graph.microsoft.com',
        path: `/v1.0${cleanPath}?$top=500&$select=id,name,size,folder,file,video,audio,lastModifiedDateTime`,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      const values = (resp.data && Array.isArray(resp.data.value)) ? resp.data.value : [];
      const items = [];
      for (const v of values) {
        const itemPath = `${remotePath === '/' ? '' : remotePath}/${v.name}`;
        if (v.folder) {
          items.push({ name: v.name, path: itemPath, type: 'folder', size: v.size || 0 });
        } else {
          const ext = path.extname(v.name).toLowerCase();
          if (AUDIO_EXTENSIONS.has(ext) || v.video || v.audio) {
            items.push({
              id: v.id,
              name: v.name,
              path: itemPath,
              onedriveItemId: v.id,
              type: 'audio',
              size: Number(v.size) || 0,
              mtime: v.lastModifiedDateTime || null,
              videoMeta: v.video || null
            });
          }
        }
      }
      return { source, path: remotePath, mode: 'onedrive-graph-api', items };
    }

    if (source.type === 'dropbox') {
      const token = await this.resolveAccessToken(source);
      if (!token) {
        return {
          source,
          path: remotePath,
          mode: 'unauthenticated',
          items: [],
          hint: 'Configure Dropbox access token in RobOS Data Sources or mount ~/Dropbox.'
        };
      }
      const body = JSON.stringify({
        path: (!remotePath || remotePath === '/') ? '' : remotePath,
        recursive: false,
        limit: 500
      });
      const resp = await httpsJsonRequest({
        hostname: 'api.dropboxapi.com',
        path: '/2/files/list_folder',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, body);
      const entries = (resp.data && Array.isArray(resp.data.entries)) ? resp.data.entries : [];
      const items = [];
      for (const e of entries) {
        if (e['.tag'] === 'folder') {
          items.push({ name: e.name, path: e.path_display || e.path_lower, type: 'folder', size: 0 });
        } else if (e['.tag'] === 'file') {
          const ext = path.extname(e.name).toLowerCase();
          if (AUDIO_EXTENSIONS.has(ext)) {
            items.push({
              id: e.id,
              name: e.name,
              path: e.path_display || e.path_lower,
              type: 'audio',
              size: Number(e.size) || 0,
              mtime: e.server_modified || null
            });
          }
        }
      }
      return { source, path: remotePath, mode: 'dropbox-api', items };
    }

    return {
      source,
      path: remotePath,
      mode: 'unsupported-live',
      items: [],
      hint: `Mount or sync "${source.name}" to a local folder or configure OAuth credentials in RobOS Cloud Accounts.`
    };
  }

  async indexSource(sourceId, rootRemotePath = '/', maxDepth = 4, onProgress = null) {
    const source = this.getSourceById(sourceId);
    if (!source) throw new Error(`Cloud source not found: ${sourceId}`);

    const discovered = [];
    const queue = [{ path: rootRemotePath, depth: 0 }];

    while (queue.length > 0 && discovered.length < 50000) {
      const current = queue.shift();
      const res = await this.browse(sourceId, current.path);
      for (const item of (res.items || [])) {
        if (item.type === 'folder' && current.depth < maxDepth) {
          queue.push({ path: item.path, depth: current.depth + 1 });
        } else if (item.type === 'audio') {
          const localMirror = this.resolveLocalMirrorPath(source, item.path);
          let track;
          if (localMirror && fs.existsSync(localMirror)) {
            track = await readTrackMetadata(localMirror, { artDir: this.artDir });
            track.source = 'cloud';
            track.sourceId = source.id;
            track.sourceName = source.name;
            track.sourceType = source.type;
            track.remotePath = item.path;
          } else {
            track = guessFromRemotePath({
              sourceId: source.id,
              sourceName: source.name,
              sourceType: source.type,
              remotePath: item.path,
              size: item.size,
              mtime: item.mtime
            });
            if (item.driveFileId) track.driveFileId = item.driveFileId;
            if (item.onedriveItemId) track.onedriveItemId = item.onedriveItemId;
            if (item.videoMeta) {
              if (item.videoMeta.duration) track.duration = Math.round(item.videoMeta.duration / 1000);
              if (item.videoMeta.height) {
                track.height = item.videoMeta.height;
                track.width = item.videoMeta.width;
                track.resolution = item.videoMeta.height >= 2160 ? '4K' : item.videoMeta.height >= 1080 ? '1080p' : '720p';
              }
            }
          }
          discovered.push(track);
        }
      }
      if (onProgress) onProgress({ indexed: discovered.length, currentPath: current.path });
    }

    if (this.libraryIndex && discovered.length > 0) {
      this.libraryIndex.upsertTracks(discovered);
    }
    return { source, indexedCount: discovered.length, tracks: discovered };
  }

  getCacheStatus() {
    let usedBytes = 0;
    let fileCount = 0;
    try {
      const entries = fs.readdirSync(CLOUD_CACHE_DIR);
      for (const name of entries) {
        if (name.includes('.part-')) continue;
        const full = path.join(CLOUD_CACHE_DIR, name);
        const st = fs.statSync(full);
        if (st.isFile()) {
          usedBytes += st.size;
          fileCount++;
        }
      }
    } catch (_) {}
    return {
      cacheDir: CLOUD_CACHE_DIR,
      usedBytes,
      maxBytes: this.maxCacheBytes,
      fileCount
    };
  }

  enforceCacheBudget(extraBytesNeeded = 0) {
    try {
      const entries = fs.readdirSync(CLOUD_CACHE_DIR)
        .filter(n => !n.includes('.part-'))
        .map(name => {
          const full = path.join(CLOUD_CACHE_DIR, name);
          const st = fs.statSync(full);
          return { full, size: st.size, atimeMs: st.atimeMs || st.mtimeMs || 0 };
        })
        .sort((a, b) => a.atimeMs - b.atimeMs);

      let total = entries.reduce((s, e) => s + e.size, 0);
      for (const entry of entries) {
        if (total + extraBytesNeeded <= this.maxCacheBytes) break;
        try {
          fs.unlinkSync(entry.full);
          total -= entry.size;
        } catch (_) {}
      }
    } catch (_) {}
  }

  async ensureCachedFile(track) {
    if (!track) throw new Error('Track is required');
    if (track.source !== 'cloud' && fs.existsSync(track.path)) {
      return track.path;
    }
    const source = this.getSourceById(track.sourceId);
    if (source) {
      const mirror = this.resolveLocalMirrorPath(source, track.remotePath);
      if (mirror && fs.existsSync(mirror)) return mirror;
    }
    if (!track.path.startsWith('cloud://') && fs.existsSync(track.path)) {
      return track.path;
    }

    const ext = path.extname(track.remotePath || track.path || '.mp4') || '.mp4';
    const cachedPath = path.join(CLOUD_CACHE_DIR, `${track.id}${ext}`);
    if (fs.existsSync(cachedPath)) {
      const now = new Date();
      try { fs.utimesSync(cachedPath, now, now); } catch (_) {}
      return cachedPath;
    }

    if (this.inflightDownloads.has(track.id)) {
      return this.inflightDownloads.get(track.id);
    }

    const promise = (async () => {
      if (!source) throw new Error(`Cloud source "${track.sourceId}" is not configured`);
      const token = await this.resolveAccessToken(source);
      if (!token) throw new Error(`No credentials available for cloud source "${source.name}"`);

      this.enforceCacheBudget(track.size || 50 * 1024 * 1024);

      if (source.type === 'google-drive') {
        const fileId = track.driveFileId || track.remotePath;
        await downloadHttpsToFile({
          hostname: 'www.googleapis.com',
          path: `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        }, cachedPath);
      } else if (source.type === 'onedrive') {
        const itemPath = track.onedriveItemId
          ? `/v1.0/me/drive/items/${encodeURIComponent(track.onedriveItemId)}/content`
          : `/v1.0/me/drive/root:${encodeURI(track.remotePath)}:/content`;
        await downloadHttpsToFile({
          hostname: 'graph.microsoft.com',
          path: itemPath,
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        }, cachedPath);
      } else if (source.type === 'dropbox') {
        await downloadHttpsToFile({
          hostname: 'content.dropboxapi.com',
          path: '/2/files/download',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: track.remotePath })
          }
        }, cachedPath);
      } else {
        throw new Error(`On-demand streaming for source type "${source.type}" requires a local mount path`);
      }
      return cachedPath;
    })().finally(() => {
      this.inflightDownloads.delete(track.id);
    });

    this.inflightDownloads.set(track.id, promise);
    return promise;
  }

  async enrichTrackMetadata(trackId) {
    const track = this.libraryIndex && this.libraryIndex.byId.get(trackId);
    if (!track) throw new Error('Track not found');
    const source = this.getSourceById(track.sourceId);
    if (!source) throw new Error(`Cloud source "${track.sourceId}" not found`);

    const mirror = this.resolveLocalMirrorPath(source, track.remotePath);
    if (mirror && fs.existsSync(mirror)) {
      const full = await readTrackMetadata(mirror, { artDir: this.artDir });
      Object.assign(track, {
        title: full.title || track.title,
        artist: full.artist || track.artist,
        album: full.album || track.album,
        year: full.year || track.year,
        genre: full.genre || track.genre,
        duration: full.duration || track.duration,
        artId: full.artId || track.artId
      });
      this.libraryIndex.upsertTracks([track]);
      return track;
    }

    const token = await this.resolveAccessToken(source);
    if (!token) throw new Error(`No credentials configured for ${source.name}`);
    const enriched = await enrichCloudTrackTags({
      track,
      source,
      token,
      artDir: this.artDir
    });
    this.libraryIndex.upsertTracks([enriched]);
    return enriched;
  }

  async startStreamServer() {
    if (this.server) return this.port;
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          const urlObj = new URL(req.url, 'http://127.0.0.1');
          const m = urlObj.pathname.match(/^\/cloud-stream\/([a-f0-9]+)$/i);
          if (!m) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          const trackId = m[1];
          const track = this.libraryIndex && this.libraryIndex.byId.get(trackId);
          if (!track) {
            res.writeHead(404);
            res.end('Track not found');
            return;
          }

          const localFile = await this.ensureCachedFile(track);
          const stat = fs.statSync(localFile);
          const ext = path.extname(localFile).toLowerCase();
          const mime = MIME_BY_EXT[ext] || 'video/mp4';
          const range = req.headers.range;

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', mime);

          if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10) || 0;
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunkSize = (end - start) + 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Content-Length': chunkSize
            });
            fs.createReadStream(localFile, { start, end }).pipe(res);
          } else {
            res.writeHead(200, { 'Content-Length': stat.size });
            fs.createReadStream(localFile).pipe(res);
          }
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      this.server.listen(0, '0.0.0.0', () => {
        this.port = this.server.address().port;
        resolve(this.port);
      });
      this.server.on('error', reject);
    });
  }

  async getStreamUrl(track, hostIp = '127.0.0.1') {
    const port = await this.startStreamServer();
    return `http://${hostIp}:${port}/cloud-stream/${track.id}`;
  }

  shutdown() {
    if (this.server) {
      try { this.server.close(); } catch (_) {}
      this.server = null;
      this.port = 0;
    }
  }
}

module.exports = {
  CloudStorageManager,
  CLOUD_CACHE_DIR,
  DATA_SOURCES_PATH
};
