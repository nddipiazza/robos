/**
 * Library Folder Manager for RobOS Movie Player
 *
 * Persists user-configured video/movie library folders to
 * ~/.config/robos/movie-folders.json, seeds defaults (~/Videos, ~/Movies),
 * and reports per-folder movie counts & disk byte sizes.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'robos');
const FOLDERS_FILE = path.join(CONFIG_DIR, 'movie-folders.json');

class LibraryFoldersManager {
  constructor({ configFile = FOLDERS_FILE } = {}) {
    this.configFile = configFile;
    this.folders = [];
    this._loaded = false;
  }

  ensureLoaded() {
    if (this._loaded) return;
    this._loaded = true;
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        if (Array.isArray(raw.folders)) {
          this.folders = raw.folders.map(f => ({
            path: f.path,
            label: f.label || path.basename(f.path) || f.path,
            enabled: f.enabled !== false,
            addedAt: f.addedAt || Date.now(),
            lastScanAt: f.lastScanAt || null
          }));
          return;
        }
      }
    } catch (_) {}

    const defaultVideoDir = path.join(os.homedir(), 'Videos');
    const defaultMovieDir = path.join(os.homedir(), 'Movies');
    const seeded = [];
    if (fs.existsSync(defaultVideoDir)) {
      seeded.push({
        path: defaultVideoDir,
        label: 'Videos',
        enabled: true,
        addedAt: Date.now(),
        lastScanAt: null
      });
    }
    if (fs.existsSync(defaultMovieDir) && defaultMovieDir !== defaultVideoDir) {
      seeded.push({
        path: defaultMovieDir,
        label: 'Movies',
        enabled: true,
        addedAt: Date.now(),
        lastScanAt: null
      });
    }
    if (seeded.length === 0) {
      seeded.push({
        path: defaultVideoDir,
        label: 'Videos',
        enabled: true,
        addedAt: Date.now(),
        lastScanAt: null
      });
    }
    this.folders = seeded;
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
      fs.writeFileSync(this.configFile, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        folders: this.folders
      }, null, 2));
    } catch (_) {}
  }

  listWithStats(libraryIndex = null) {
    this.ensureLoaded();
    const tracks = libraryIndex && Array.isArray(libraryIndex.tracks) ? libraryIndex.tracks : [];
    return this.folders.map(f => {
      const prefix = f.path.endsWith(path.sep) ? f.path : f.path + path.sep;
      let trackCount = 0;
      let totalBytes = 0;
      let totalDuration = 0;
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t && t.path && (t.path === f.path || t.path.startsWith(prefix))) {
          trackCount++;
          totalBytes += Number(t.size) || 0;
          totalDuration += Number(t.duration) || 0;
        }
      }
      return {
        ...f,
        exists: fs.existsSync(f.path),
        trackCount,
        totalBytes,
        totalDuration
      };
    });
  }

  addFolder(dirPath, label = null) {
    this.ensureLoaded();
    if (!dirPath) throw new Error('Folder path is required');
    const resolved = path.resolve(dirPath);
    const existing = this.folders.find(f => f.path === resolved);
    if (existing) {
      existing.enabled = true;
      if (label) existing.label = label;
      this.save();
      return { folder: existing, added: false };
    }
    const entry = {
      path: resolved,
      label: label || path.basename(resolved) || resolved,
      enabled: true,
      addedAt: Date.now(),
      lastScanAt: null
    };
    this.folders.push(entry);
    this.save();
    return { folder: entry, added: true };
  }

  removeFolder(dirPath) {
    this.ensureLoaded();
    if (!dirPath) return false;
    const resolved = path.resolve(dirPath);
    const before = this.folders.length;
    this.folders = this.folders.filter(f => f.path !== resolved && f.path !== dirPath);
    if (this.folders.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  markScanned(dirPath) {
    this.ensureLoaded();
    const resolved = path.resolve(dirPath);
    const entry = this.folders.find(f => f.path === resolved || f.path === dirPath);
    if (entry) {
      entry.lastScanAt = Date.now();
      this.save();
    }
  }
}

module.exports = { LibraryFoldersManager, FOLDERS_FILE };
