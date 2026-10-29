'use strict';
// Managed library folders: local directories and RobOS cloud storage folders
// (Data Sources FTP / SFTP connections). A folder owns the tracks that live
// under its path (for cloud folders, under its local download cache).

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { summarizeMediaBreakdown } = require('./library-index');
const { upgradeTrackVideoGrouping, isSampleVideoPath } = require('./track-metadata');

class LibraryFolders {
  constructor({ mediaLibrary, cloud, castService, configDir }) {
    this.mediaLibrary = mediaLibrary;
    this.cloud = cloud;
    this.castService = castService || null;
    this.configDir = configDir || path.join(process.env.HOME || os.homedir(), '.config', 'robos');
    this.file = path.join(this.configDir, 'movie-folders.json');
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

  // Directory on this machine that holds the folder's audio/video files.
  localRoot(folder) {
    if (folder.kind === 'peer') {
      const safeEndpoint = String(folder.endpoint || folder.path || 'peer').replace(/[^a-zA-Z0-9._-]+/g, '_');
      return path.resolve(path.join(this.configDir, 'peer-streams', safeEndpoint));
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
            id: `fld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${idx}`,
            label: lf.label || path.basename(lf.remotePath) || lf.remotePath,
            addedAt: new Date().toISOString(),
            lastSynced: null,
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

  list() {
    const connections = this.cloud.listConnections();
    this._syncWithDataSources(connections);
    // Collapse old duplicate records without deleting their music or cache files.
    const unique = new Map();
    this.folders = this.folders.filter(f => {
      const key = f.kind === 'peer'
        ? `peer:${String(f.endpoint || f.path || '').toLowerCase()}`
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
      const ownedTracks = this.mediaLibrary.tracks.filter(t => this._owns(f, t.filePath));
      const breakdown = summarizeMediaBreakdown(ownedTracks);
      return {
        ...f,
        cloudKey: f.kind === 'cloud' ? this.cloudIdentity(f.connectionId, f.path, connections) : null,
        localRoot: this.localRoot(f),
        legacyRootDir,
        trackCount: ownedTracks.length,
        movieCount: breakdown.movieCount,
        showCount: breakdown.showCount,
        seasonCount: breakdown.seasonCount,
        episodeCount: breakdown.episodeCount,
        shows: breakdown.shows,
        connectionName: f.kind === 'peer' ? (f.peerNodeName || 'RobOS Private Network') : (conn ? conn.name : null),
        connectionMissing: f.kind === 'cloud' && !conn,
        protocol: f.kind === 'peer' ? 'p2p' : (conn ? conn.driverType : null),
        available: f.kind === 'peer' ? true : (f.kind === 'local' ? fs.existsSync(f.path) : !!conn),
      };
    }).sort((a, b) => {
      const aActive = a.syncEnabled !== false ? 1 : 0;
      const bActive = b.syncEnabled !== false ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aHasTracks = a.trackCount > 0 ? 1 : 0;
      const bHasTracks = b.trackCount > 0 ? 1 : 0;
      if (aHasTracks !== bHasTracks) return bHasTracks - aHasTracks;
      return 0;
    });
  }

  add(spec) {
    let norm;
    if (spec.kind === 'peer') {
      const rawEndpoint = String(spec.endpoint || spec.path || 'http://127.0.0.1:19215').trim().replace(/\/+$/, '');
      const endpoint = /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `http://${rawEndpoint}`;
      norm = { kind: 'peer', endpoint, path: endpoint };
    } else if (spec.kind === 'cloud') {
      norm = { kind: 'cloud', connectionId: spec.connectionId, path: path.posix.normalize('/' + (spec.path || '/')) };
    } else {
      norm = { kind: 'local', path: path.resolve(spec.path) };
    }
    const connections = this.cloud.listConnections();
    const existing = this.folders.find(f => norm.kind === 'cloud'
      ? this._sameCloudFolder(f, norm.connectionId, norm.path, connections)
      : (norm.kind === 'peer'
        ? (f.kind === 'peer' && String(f.endpoint || f.path).toLowerCase() === norm.endpoint.toLowerCase())
        : (f.kind === norm.kind && f.path === norm.path)));
    if (existing) { existing.syncEnabled = true; this._save(); return existing; }
    const folder = {
      id: `fld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      label: spec.label || (norm.kind === 'peer' ? `P2P Stream (${norm.endpoint.replace(/^https?:\/\//, '')})` : (path.basename(norm.path) || norm.path)),
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

    const filteredDescriptors = descriptors.filter(d => !isSampleVideoPath(d.remotePath || d.localPath));
    const keep = new Set(filteredDescriptors.map(d => d.localPath));
    const ml = this.mediaLibrary;
    const existingByPath = new Map(ml.tracks.map(t => [t.filePath, t]));

    const added = [];
    const seen = new Set();
    for (const desc of filteredDescriptors) {
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
        upgradeTrackVideoGrouping(existing);
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

  syncPeer(id, onProgress) {
    if (this.syncs.has(id)) return this.syncs.get(id);
    const pending = this._syncPeer(id, onProgress).catch(err => {
      const folder = this.get(id);
      if (folder) { folder.syncError = err.message; this._save(); }
      throw err;
    }).finally(() => this.syncs.delete(id));
    this.syncs.set(id, pending);
    return pending;
  }

  async _syncPeer(id, onProgress) {
    const f = this.get(id);
    if (!f || f.kind !== 'peer') throw new Error('Not a P2P peer folder');
    const endpoint = String(f.endpoint || f.path || 'http://127.0.0.1:19215').replace(/\/+$/, '');
    const catalogUrl = `${endpoint}/api/tv-library?all=1`;
    if (typeof onProgress === 'function') {
      onProgress({ phase: 'connecting', current: 0, total: 1, file: catalogUrl });
    }

    const catalog = await new Promise((resolve, reject) => {
      const mod = catalogUrl.startsWith('https:') ? https : http;
      const req = mod.get(catalogUrl, { timeout: 6000 }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return reject(new Error(`Peer returned HTTP ${res.statusCode}`));
        }
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (err) { reject(new Error(`Invalid peer JSON: ${err.message}`)); }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Peer connection timed out')); });
      req.on('error', reject);
    });

    if (catalog.nodeName) {
      f.peerNodeName = catalog.nodeName;
      if (f.label.startsWith('P2P Stream (')) {
        f.label = `${catalog.nodeName} (P2P Stream)`;
      }
    }

    const rawItems = Array.isArray(catalog.items) ? catalog.items : [];
    const flatItems = [];
    for (const item of rawItems) {
      if (item && item.isShowGroup && Array.isArray(item.episodes) && item.episodes.length > 0) {
        for (const ep of item.episodes) {
          flatItems.push({ ...ep, showName: ep.showName || item.showName || item.title });
        }
      } else if (item) {
        flatItems.push(item);
      }
    }

    const rootDir = this.localRoot(f);
    const ml = this.mediaLibrary;
    const existingByPath = new Map(ml.tracks.map(t => [t.filePath, t]));
    const keep = new Set();
    const added = [];
    const addedAt = new Date().toISOString();

    for (let i = 0; i < flatItems.length; i++) {
      const item = flatItems[i];
      const ext = item.streamFormat === 'mkv' ? '.mkv' : '.mp4';
      const safeId = String(item.id || `track_${i}`).replace(/[^a-zA-Z0-9._-]+/g, '_');
      const localPath = path.join(rootDir, `${safeId}${ext}`);
      keep.add(localPath);

      const streamUrl = item.streamUrl
        ? String(item.streamUrl).replace(/^https?:\/\/[^/]+/, endpoint)
        : `${endpoint}/stream/${encodeURIComponent(item.id)}${ext}`;

      const existing = existingByPath.get(localPath);
      if (existing) {
        existing.src = streamUrl;
        existing.title = item.title || existing.title;
        existing.artist = item.artist || catalog.nodeName || existing.artist || 'RobOS Peer';
        existing.album = item.album || 'RobOS Private Network';
        existing.overview = item.overview || existing.overview || '';
        existing.year = item.year || existing.year || null;
        existing.rating = item.rating || existing.rating || null;
        existing.duration = item.duration || existing.duration || 0;
        existing.peerStream = {
          folderId: f.id,
          endpoint,
          remoteTrackId: item.id,
          streamUrl,
          artUrl: item.artUrl ? String(item.artUrl).replace(/^https?:\/\/[^/]+/, endpoint) : '',
        };
        continue;
      }

      const trackId = typeof ml._generateTrackId === 'function' ? ml._generateTrackId(localPath) : `peer_${safeId}`;
      const track = {
        id: trackId,
        filePath: localPath,
        src: streamUrl,
        title: item.title || 'Remote Peer Video',
        artist: item.artist || catalog.nodeName || 'RobOS Peer',
        album: item.album || 'RobOS Private Network',
        mediaType: item.mediaType || 'movie',
        showName: item.showName || '',
        seasonNumber: item.seasonNumber ?? null,
        episodeNumber: item.episodeNumber ?? null,
        episodeCode: item.episodeCode || '',
        episodeTitle: item.episodeTitle || '',
        genre: item.genre || 'Movies',
        genres: Array.isArray(item.genres) ? item.genres : [item.genre || 'Movies'],
        year: item.year || 2026,
        rating: item.rating || null,
        overview: item.overview || `Streamed from ${catalog.nodeName || endpoint} over RobOS Private Network Mutual TLS 1.3.`,
        duration: Number(item.duration) || 0,
        artId: null,
        addedAt,
        peerStream: {
          folderId: f.id,
          endpoint,
          remoteTrackId: item.id,
          streamUrl,
          artUrl: item.artUrl ? String(item.artUrl).replace(/^https?:\/\/[^/]+/, endpoint) : '',
        },
      };
      upgradeTrackVideoGrouping(track);
      added.push(track);
    }

    const before = ml.tracks.length;
    ml.tracks = ml.tracks.filter(t => !this._owns(f, t.filePath) || keep.has(t.filePath)).concat(added);
    const removed = before + added.length - ml.tracks.length;
    ml._rebuildIndexes();
    ml._saveCache();
    delete f.syncError;
    this.markSynced(id);
    if (typeof onProgress === 'function') {
      onProgress({ phase: 'complete', current: flatItems.length, total: flatItems.length, file: '' });
    }
    return { added: added.length, removed, total: flatItems.length };
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
