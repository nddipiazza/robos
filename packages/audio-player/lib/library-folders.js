'use strict';
// Managed library folders: local directories and RobOS cloud storage folders
// (Data Sources FTP / SFTP connections). A folder owns the tracks that live
// under its path (for cloud folders, under its local download cache).

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

let _mediaServiceClient = null;
for (const p of [
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'media-service-client'),
  path.resolve(__dirname, '..', '..', 'robos-lib', 'media-service-client'),
  '/usr/local/share/robos/robos-lib/media-service-client',
].filter(Boolean)) {
  try { _mediaServiceClient = require(p); break; } catch {}
}

function normalizeEndpointUrl(raw) {
  let s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return 'http://127.0.0.1:19234';
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (!u.port && u.protocol === 'http:') u.port = '19234';
    return u.origin;
  } catch {
    return s;
  }
}

class LibraryFolders {
  constructor({ mediaLibrary, cloud, castService, configDir }) {
    this.mediaLibrary = mediaLibrary;
    this.cloud = cloud;
    this.castService = castService || null;
    this.configDir = configDir || path.join(process.env.HOME || os.homedir(), '.config', 'robos');
    this.file = path.join(this.configDir, 'audio-folders.json');
    this.folders = this._load();
    this.syncs = new Map();
  }

  _load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.folders, null, 2));
    } catch {}
  }

  // Directory on this machine that holds the folder's audio files.
  localRoot(folder) {
    if (folder.kind === 'media-service') {
      const url = normalizeEndpointUrl(folder.endpoint || folder.path);
      if (_mediaServiceClient) return _mediaServiceClient.virtualRootForServer(this.configDir, url, 'audio');
      const safe = url.replace(/[^a-zA-Z0-9._-]+/g, '_');
      return path.resolve(path.join(this.configDir, 'media-service-streams', `audio_${safe}`));
    }
    return path.resolve(folder.kind === 'cloud' ? this.cloud.localDirFor(folder.connectionId, folder.path) : folder.path);
  }

  _owns(folder, filePath) {
    if (!filePath) return false;
    const root = this.localRoot(folder);
    if (folder.aliasRoots?.some(r => filePath === r || filePath.startsWith(r + path.sep))) return true;
    if (filePath === root || filePath.startsWith(root + path.sep)) return true;
    // If this folder was migrated from a legacy single-folder "/" root, tracks previously
    // indexed directly at the connection cache root belong to this primary linked folder.
    if (folder.kind === 'cloud' && folder.isPrimaryLinkedFolder && this.cloud && typeof this.cloud.localDirFor === 'function') {
      const connRoot = this.cloud.localDirFor(folder.connectionId, '/');
      if (path.dirname(filePath) === connRoot) return true;
    }
    return false;
  }

  _syncWithDataSources(connections) {
    if (!Array.isArray(connections) || !connections.length) return;
    let changed = false;

    for (const conn of connections) {
      if (!conn.browsable || !Array.isArray(conn.folders) || !conn.folders.length) continue;

      // Migrate legacy generic "/" folder entry to the first linked folder
      const legacyRoot = this.folders.find(
        f => f.kind === 'cloud' && f.connectionId === conn.id && f.path === '/' && (f.label === '/' || f.label === 'root')
      );
      if (legacyRoot) {
        const firstLf = conn.folders[0];
        const alreadyHasFirst = this.folders.some(
          f => f !== legacyRoot && f.kind === 'cloud' && f.connectionId === conn.id && f.path === firstLf.remotePath
        );
        if (alreadyHasFirst) {
          this.folders = this.folders.filter(f => f !== legacyRoot);
        } else {
          legacyRoot.label = firstLf.label;
          legacyRoot.path = firstLf.remotePath;
          legacyRoot.isPrimaryLinkedFolder = true;
        }
        changed = true;
      }

      // Ensure every linked folder from Data Sources appears in the Library folder list
      conn.folders.forEach((lf, idx) => {
        if (!lf || !lf.remotePath) return;
        const existing = this.folders.find(f => this._sameCloudFolder(f, conn.id, lf.remotePath, connections));
        if (existing) {
          if (idx === 0 && !existing.isPrimaryLinkedFolder) {
            existing.isPrimaryLinkedFolder = true;
            changed = true;
          }
          if (existing.label === '/' || existing.label === 'root' || existing.label === lf.folderId) {
            existing.label = lf.label;
            changed = true;
          }
        } else {
          this.folders.push({
            // The same id and no timestamp on every computer, so two computers that both
            // pick up this Data Sources folder write the same entry (RobOS Config Sync).
            id: `fld_ds_${require('crypto').createHash('sha1').update(`${conn.id}:${lf.remotePath}`).digest('hex').slice(0, 12)}`,
            label: lf.label || path.basename(lf.remotePath) || lf.remotePath,
            kind: 'cloud',
            connectionId: conn.id,
            path: lf.remotePath,
            isPrimaryLinkedFolder: idx === 0,
            syncEnabled: false,
          });
          changed = true;
        }
      });
    }

    if (changed) this._save();
  }

  _syncWithMediaServers() {
    try {
      const file = path.join(this.configDir, 'media-servers.json');
      if (!fs.existsSync(file)) return;
      const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!cfg || cfg.autoSyncPlayers === false || !Array.isArray(cfg.servers)) return;
      let changed = false;
      for (const srv of cfg.servers) {
        if (!srv || srv.enabled === false || srv.autoConnectAudioPlayer === false || !srv.url) continue;
        const endpoint = normalizeEndpointUrl(srv.url);
        const detId = _mediaServiceClient
          ? _mediaServiceClient.deterministicFolderId(endpoint, 'audio')
          : `fld_ms_audio_${crypto.createHash('sha1').update(endpoint.toLowerCase()).digest('hex').slice(0, 10)}`;
        const existing = this.folders.find(
          f => f.id === detId || (f.kind === 'media-service' && normalizeEndpointUrl(f.endpoint || f.path) === endpoint)
        );
        if (!existing) {
          this.folders.push({
            id: detId,
            label: srv.name ? `${srv.name} (Music)` : `RobOS Media Service (${endpoint.replace(/^https?:\/\//, '')})`,
            kind: 'media-service',
            endpoint,
            path: endpoint,
            serverId: srv.id || null,
            syncEnabled: true,
            lastSynced: null,
          });
          changed = true;
        }
      }
      if (changed) this._save();
    } catch {}
  }

  list() {
    const connections = this.cloud.listConnections();
    this._syncWithDataSources(connections);
    this._syncWithMediaServers();
    // Collapse old duplicate records without deleting their music or cache files.
    const unique = new Map();
    this.folders = this.folders.filter(f => {
      const key = f.kind === 'media-service'
        ? `media-service:${normalizeEndpointUrl(f.endpoint || f.path).toLowerCase()}`
        : (f.kind === 'cloud' ? this.cloudIdentity(f.connectionId, f.path, connections) : `local:${f.path}`);
      const kept = unique.get(key);
      if (!kept) { unique.set(key, f); return true; }
      kept.aliasRoots = [...new Set([...(kept.aliasRoots || []), this.localRoot(f), ...(f.aliasRoots || [])])];
      kept.syncEnabled = kept.syncEnabled !== false || f.syncEnabled !== false;
      if (!kept.lastSynced) kept.lastSynced = f.lastSynced;
      return false;
    });
    this._save();
    return this.folders.map(f => {
      const conn = f.kind === 'cloud' ? connections.find(c => c.id === f.connectionId) : null;
      const legacyRootDir = (f.kind === 'cloud' && f.isPrimaryLinkedFolder && this.cloud && typeof this.cloud.localDirFor === 'function')
        ? this.cloud.localDirFor(f.connectionId, '/')
        : null;
      return {
        ...f,
        cloudKey: f.kind === 'cloud' ? this.cloudIdentity(f.connectionId, f.path, connections) : null,
        localRoot: this.localRoot(f),
        legacyRootDir,
        trackCount: this.mediaLibrary.tracks.filter(t => this._owns(f, t.filePath)).length,
        connectionName: f.kind === 'media-service' ? (f.serverName || 'RobOS Media Server') : (conn ? conn.name : null),
        connectionMissing: f.kind === 'cloud' && !conn,
        protocol: f.kind === 'media-service' ? 'media-service' : (conn ? conn.driverType : null),
        available: f.kind === 'media-service' ? true : (f.kind === 'local' ? fs.existsSync(f.path) : !!conn),
      };
    });
  }

  add(spec) {
    const norm = spec.kind === 'media-service'
      ? { kind: 'media-service', endpoint: normalizeEndpointUrl(spec.endpoint || spec.path || 'http://127.0.0.1:19234'), path: normalizeEndpointUrl(spec.endpoint || spec.path || 'http://127.0.0.1:19234') }
      : (spec.kind === 'cloud'
        ? { kind: 'cloud', connectionId: spec.connectionId, path: path.posix.normalize('/' + (spec.path || '/')) }
        : { kind: 'local', path: path.resolve(spec.path) });
    const connections = this.cloud.listConnections();
    const existing = this.folders.find(f => norm.kind === 'cloud'
      ? this._sameCloudFolder(f, norm.connectionId, norm.path, connections)
      : (norm.kind === 'media-service'
        ? (f.kind === 'media-service' && normalizeEndpointUrl(f.endpoint || f.path) === norm.endpoint)
        : f.kind === norm.kind && f.path === norm.path));
    if (existing) { existing.syncEnabled = true; if (spec.label) existing.label = spec.label; this._save(); return existing; }
    const detId = norm.kind === 'media-service'
      ? (_mediaServiceClient ? _mediaServiceClient.deterministicFolderId(norm.endpoint, 'audio') : `fld_ms_audio_${crypto.createHash('sha1').update(norm.endpoint.toLowerCase()).digest('hex').slice(0, 10)}`)
      : `fld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const folder = {
      id: detId,
      label: spec.label || (norm.kind === 'media-service'
        ? `RobOS Media Service (${norm.endpoint.replace(/^https?:\/\//, '')})`
        : (path.basename(norm.path) || norm.path)),
      addedAt: new Date().toISOString(),
      lastSynced: null,
      syncEnabled: true,
      ...norm,
    };
    this.folders.push(folder);
    this._save();
    return folder;
  }

  get(id) {
    return this.folders.find(f => f.id === id) || null;
  }

  // Google folder IDs are stable across duplicate Data Sources connections.
  // My Drive's special "root" ID is scoped to its account instead.
  cloudIdentity(connectionId, remotePath, connections) {
    const conn = connections.find(c => c.id === connectionId);
    const normalized = path.posix.normalize('/' + (remotePath || '/')).replace(/\/$/, '') || '/';
    const linked = conn?.folders?.find(lf => (lf.remotePath.replace(/\/$/, '') || '/') === normalized);
    if (conn?.driverType === 'gdrive' && linked?.folderId && linked.folderId !== 'root') return `gdrive:${linked.folderId}`;
    if (conn?.driverType === 'gdrive' && conn.user) return `gdrive:${conn.user.toLowerCase()}:${linked?.folderId || normalized}`;
    return `${connectionId}:${normalized}`;
  }

  _sameCloudFolder(folder, connectionId, remotePath, connections) {
    return folder.kind === 'cloud' && this.cloudIdentity(folder.connectionId, folder.path, connections)
      === this.cloudIdentity(connectionId, remotePath, connections);
  }

  setEnabled(id, enabled) {
    const folder = this.get(id);
    if (!folder) throw new Error('Folder not found');
    folder.syncEnabled = !!enabled;
    this._save();
    return folder;
  }

  markSynced(id) {
    const f = this.get(id);
    if (f) { f.lastSynced = new Date().toISOString(); this._save(); }
  }

  rename(id, label) {
    const f = this.get(id);
    if (f && label && label.trim()) { f.label = label.trim(); this._save(); }
  }

  // Indexes remote audio files for a cloud folder (metadata only, NO bulk downloads)
  // and drops tracks whose remote file is gone.
  syncCloud(id, onProgress) {
    if (this.syncs.has(id)) return this.syncs.get(id);
    const pending = this._syncCloud(id, onProgress).catch(err => {
      const folder = this.get(id);
      if (folder) { folder.syncError = err.message; this._save(); }
      throw err;
    }).finally(() => this.syncs.delete(id));
    this.syncs.set(id, pending);
    return pending;
  }

  async _syncCloud(id, onProgress) {
    const f = this.get(id);
    if (!f || f.kind !== 'cloud') throw new Error('Not a cloud folder');
    const descriptors = typeof this.cloud.indexCloudAudio === 'function'
      ? await this.cloud.indexCloudAudio(f.connectionId, [f.path], onProgress, { forceRefresh: true, strict: true })
      : (await this.cloud.fetchAudio(f.connectionId, [f.path], onProgress)).map(localPath => ({
          connectionId: f.connectionId,
          remotePath: f.path,
          localPath,
          name: path.basename(localPath),
          cached: fs.existsSync(localPath),
        }));

    const keep = new Set(descriptors.map(d => d.localPath));
    const ml = this.mediaLibrary;
    const existingByPath = new Map(ml.tracks.map(t => [t.filePath, t]));

    const added = [];
    const seen = new Set();
    for (const desc of descriptors) {
      if (seen.has(desc.localPath)) continue;
      seen.add(desc.localPath);
      const existing = existingByPath.get(desc.localPath);
      if (existing) {
        const changed = existing.cloud && ((desc.modified && existing.cloud.modified && desc.modified !== existing.cloud.modified)
          || (desc.size != null && existing.cloud.size != null && desc.size !== existing.cloud.size));
        if (changed) {
          // A replaced remote song must not keep playing the old cached bytes.
          const cacheRoot = this.localRoot(f);
          if (desc.localPath.startsWith(cacheRoot + path.sep)) {
            try { fs.unlinkSync(desc.localPath); } catch {}
          }
          desc.cached = false;
        }
        existing.cloud = {
          connectionId: desc.connectionId,
          driverType: desc.driverType || (existing.cloud && existing.cloud.driverType) || 'gdrive',
          remotePath: desc.remotePath,
          driveId: desc.driveId || (existing.cloud && existing.cloud.driveId) || null,
          size: desc.size != null ? desc.size : (existing.cloud && existing.cloud.size) || null,
          modified: desc.modified || null,
          cached: !!desc.cached,
          // Tags already read stay read across syncs.
          ...(!changed && existing.cloud && existing.cloud.tagsRead ? { tagsRead: true } : {}),
          ...(!changed && existing.cloud && existing.cloud.tagsFailed ? { tagsFailed: existing.cloud.tagsFailed } : {}),
        };
        if (this.castService && typeof this.castService.getCloudStreamUrl === 'function') {
          existing.src = this.castService.getCloudStreamUrl(existing.id, false);
        }
        continue;
      }
      try {
        const trackId = ml._generateTrackId(desc.localPath);
        const streamUrl = (this.castService && typeof this.castService.getCloudStreamUrl === 'function')
          ? this.castService.getCloudStreamUrl(trackId, false)
          : null;
        const track = typeof ml.buildCloudTrack === 'function'
          ? await ml.buildCloudTrack(desc, streamUrl)
          : await ml.parseTrack(desc.localPath);
        added.push(track);
      } catch {}
    }
    const addedAt = new Date().toISOString();
    for (const t of added) if (!t.addedAt) t.addedAt = addedAt;
    const before = ml.tracks.length;
    ml.tracks = ml.tracks.filter(t => !this._owns(f, t.filePath) || keep.has(t.filePath)).concat(added);
    const removed = before + added.length - ml.tracks.length;
    ml._rebuildIndexes();
    ml._saveCache();
    delete f.syncError;
    this.markSynced(id);
    return { added: added.length, removed };
  }

  syncMediaService(id, onProgress) {
    if (this.syncs.has(id)) return this.syncs.get(id);
    const pending = this._syncMediaService(id, onProgress).catch(err => {
      const folder = this.get(id);
      if (folder) { folder.syncError = err.message; this._save(); }
      throw err;
    }).finally(() => this.syncs.delete(id));
    this.syncs.set(id, pending);
    return pending;
  }

  async _syncMediaService(id, onProgress) {
    const f = this.get(id);
    if (!f || f.kind !== 'media-service') throw new Error('Not a RobOS Media Service folder');
    const endpoint = normalizeEndpointUrl(f.endpoint || f.path);
    const rootDir = this.localRoot(f);
    if (typeof onProgress === 'function') {
      onProgress({ phase: 'connecting', current: 0, total: 1, file: endpoint });
    }

    let info, fetchedTracks;
    if (_mediaServiceClient) {
      const res = await _mediaServiceClient.fetchAudioCatalogTracks(endpoint, {
        folderId: f.id,
        virtualRoot: rootDir,
        serverName: f.label,
      });
      info = res.info;
      fetchedTracks = res.tracks;
    } else {
      const catalogUrl = `${endpoint}/api/catalog?type=music`;
      const cat = await new Promise((resolve, reject) => {
        const mod = catalogUrl.startsWith('https:') ? https : http;
        const req = mod.get(catalogUrl, { timeout: 10000 }, (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            res.resume();
            return reject(new Error(`Media Server returned HTTP ${res.statusCode}`));
          }
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
          });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Media Server timed out')); });
        req.on('error', reject);
      });
      info = { serverName: 'RobOS Media Server' };
      fetchedTracks = (cat.items || []).map((item) => {
        const ext = item.ext || '.mp3';
        const localPath = path.join(rootDir, `${item.id}${ext}`);
        return {
          id: typeof this.mediaLibrary._generateTrackId === 'function' ? this.mediaLibrary._generateTrackId(localPath) : `ms_${item.id}`,
          filePath: localPath,
          src: item.streamUrl || `${endpoint}/stream/${encodeURIComponent(item.id)}${ext}`,
          title: item.title,
          artist: item.artist || 'Unknown Artist',
          albumArtist: item.albumArtist || item.artist || 'Unknown Artist',
          album: item.album || 'Singles',
          genre: item.genre || 'Music',
          year: item.year || null,
          trackNumber: item.trackNumber || null,
          discNumber: item.discNumber || null,
          lossless: Boolean(item.lossless),
          codec: item.codec || ext.slice(1).toUpperCase(),
          artId: item.artUrl || `${endpoint}/api/art/${encodeURIComponent(item.id)}.jpg`,
          addedAt: item.addedAt || new Date().toISOString(),
          mediaService: {
            folderId: f.id,
            endpoint,
            remoteItemId: item.id,
            streamUrl: item.streamUrl || `${endpoint}/stream/${encodeURIComponent(item.id)}${ext}`,
          },
        };
      });
    }

    if (info?.serverName) {
      f.serverName = info.serverName;
      if (f.label.startsWith('RobOS Media Service (')) {
        f.label = `${info.serverName} (Music)`;
      }
    }

    const ml = this.mediaLibrary;
    const existingByPath = new Map(ml.tracks.map(t => [t.filePath, t]));
    const nextTracks = [];
    let addedCount = 0;

    for (const t of fetchedTracks) {
      const prev = existingByPath.get(t.filePath);
      if (prev) {
        t.addedAt = prev.addedAt || t.addedAt;
      } else {
        addedCount += 1;
      }
      nextTracks.push(t);
    }

    const otherTracks = ml.tracks.filter(t => !this._owns(f, t.filePath));
    const removed = (ml.tracks.length - otherTracks.length) - (nextTracks.length - addedCount);
    ml.tracks = otherTracks.concat(nextTracks);
    ml._rebuildIndexes();
    ml._saveCache();
    delete f.syncError;
    this.markSynced(id);
    if (typeof onProgress === 'function') {
      onProgress({ phase: 'complete', current: nextTracks.length, total: nextTracks.length, file: '' });
    }
    return { added: addedCount, removed: Math.max(0, removed), total: nextTracks.length };
  }

  remove(id, removeTracks) {
    const f = this.get(id);
    if (!f) return { removed: 0 };
    let removed = 0;
    if (removeTracks) {
      const ml = this.mediaLibrary;
      const before = ml.tracks.length;
      ml.tracks = ml.tracks.filter(t => !this._owns(f, t.filePath));
      removed = before - ml.tracks.length;
      ml._rebuildIndexes();
      ml._saveCache();
      if (f.kind === 'cloud') {
        // Only ever delete inside our own download cache.
        const root = this.localRoot(f);
        const overlaps = this.folders.some(o => o.id !== id && o.kind === 'cloud' && (() => {
          const r = this.localRoot(o);
          return r === root || r.startsWith(root + path.sep) || root.startsWith(r + path.sep);
        })());
        if (!overlaps) { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} }
      }
    }
    this.folders = this.folders.filter(x => x.id !== id);
    this._save();
    return { removed };
  }
}

module.exports = { LibraryFolders };
