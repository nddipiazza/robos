'use strict';
// Managed library folders: local directories and RobOS cloud storage folders
// (Data Sources FTP / SFTP connections). A folder owns the tracks that live
// under its path (for cloud folders, under its local download cache).

const fs = require('fs');
const os = require('os');
const path = require('path');

class LibraryFolders {
  constructor({ mediaLibrary, cloud, castService, configDir }) {
    this.mediaLibrary = mediaLibrary;
    this.cloud = cloud;
    this.castService = castService || null;
    this.file = path.join(configDir || path.join(process.env.HOME || os.homedir(), '.config', 'robos'), 'audio-folders.json');
    this.folders = this._load();
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
    return folder.kind === 'cloud' ? this.cloud.localDirFor(folder.connectionId, folder.path) : folder.path;
  }

  _owns(folder, filePath) {
    const root = this.localRoot(folder);
    return filePath === root || filePath.startsWith(root + path.sep);
  }

  list() {
    const connections = this.cloud.listConnections();
    return this.folders.map(f => {
      const conn = f.kind === 'cloud' ? connections.find(c => c.id === f.connectionId) : null;
      return {
        ...f,
        localRoot: this.localRoot(f),
        trackCount: this.mediaLibrary.tracks.filter(t => this._owns(f, t.filePath)).length,
        connectionName: conn ? conn.name : null,
        connectionMissing: f.kind === 'cloud' && !conn,
        protocol: conn ? conn.driverType : null,
        available: f.kind === 'local' ? fs.existsSync(f.path) : !!conn,
      };
    });
  }

  add(spec) {
    const norm = spec.kind === 'cloud'
      ? { kind: 'cloud', connectionId: spec.connectionId, path: path.posix.normalize('/' + (spec.path || '/')) }
      : { kind: 'local', path: path.resolve(spec.path) };
    const existing = this.folders.find(f => f.kind === norm.kind && f.path === norm.path && f.connectionId === norm.connectionId);
    if (existing) return existing;
    const folder = {
      id: `fld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      label: spec.label || (path.basename(norm.path) || norm.path),
      addedAt: new Date().toISOString(),
      lastSynced: null,
      ...norm,
    };
    this.folders.push(folder);
    this._save();
    return folder;
  }

  get(id) {
    return this.folders.find(f => f.id === id) || null;
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
  async syncCloud(id, onProgress) {
    const f = this.get(id);
    if (!f || f.kind !== 'cloud') throw new Error('Not a cloud folder');
    const descriptors = typeof this.cloud.indexCloudAudio === 'function'
      ? await this.cloud.indexCloudAudio(f.connectionId, [f.path], onProgress)
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
    for (const desc of descriptors) {
      const existing = existingByPath.get(desc.localPath);
      if (existing) {
        existing.cloud = {
          connectionId: desc.connectionId,
          driverType: desc.driverType || (existing.cloud && existing.cloud.driverType) || 'gdrive',
          remotePath: desc.remotePath,
          driveId: desc.driveId || (existing.cloud && existing.cloud.driveId) || null,
          size: desc.size != null ? desc.size : (existing.cloud && existing.cloud.size) || null,
          cached: !!desc.cached,
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
    const before = ml.tracks.length;
    ml.tracks = ml.tracks.filter(t => !this._owns(f, t.filePath) || keep.has(t.filePath)).concat(added);
    const removed = before + added.length - ml.tracks.length;
    ml._rebuildIndexes();
    ml._saveCache();
    this.markSynced(id);
    return { added: added.length, removed };
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
