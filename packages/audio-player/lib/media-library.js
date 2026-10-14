'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');

class MediaLibrary {
  constructor(options = {}) {
    this.configDir = options.configDir || path.join(os.homedir(), '.config', 'robos');
    this.cacheFile = path.join(this.configDir, 'audio-library.json');
    this.tracks = [];
    this.artists = new Map();
    this.albums = new Map();
    this.albumArtRegistry = new Map(); // artId -> { buffer, format }
    this.nextArtId = 1;
    this._mm = null;
    this.currentWorker = null;

    this._loadCache();
  }

  async _getParser() {
    if (!this._mm) {
      this._mm = await import('music-metadata');
    }
    return this._mm;
  }

  _loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const raw = fs.readFileSync(this.cacheFile, 'utf8');
        const data = JSON.parse(raw);
        this.tracks = data.tracks || [];
        this._rebuildIndexes();
      }
    } catch (err) {
      console.warn('[MediaLibrary] Could not load library cache:', err.message);
      this.tracks = [];
    }
  }

  _saveCache() {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify({
        updatedAt: new Date().toISOString(),
        tracks: this.tracks
      }, null, 2));
    } catch (err) {
      console.warn('[MediaLibrary] Could not save library cache:', err.message);
    }
  }

  _rebuildIndexes() {
    this.artists.clear();
    this.albums.clear();

    for (const track of this.tracks) {
      const artist = track.artist || 'Unknown Artist';
      const album = track.album || 'Unknown Album';

      if (!this.artists.has(artist)) this.artists.set(artist, []);
      this.artists.get(artist).push(track);

      if (!this.albums.has(album)) this.albums.set(album, []);
      this.albums.get(album).push(track);
    }
  }

  /**
   * Parse a single audio file with music-metadata
   */
  async parseTrack(filePath) {
    const mm = await this._getParser();
    try {
      const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: false });
      const common = metadata.common || {};
      const format = metadata.format || {};

      let artId = null;
      const cover = mm.selectCover(common.picture);
      if (cover) {
        artId = `art_${this.nextArtId++}_${Date.now()}`;
        this.albumArtRegistry.set(artId, {
          buffer: cover.data,
          format: cover.format || 'image/jpeg'
        });
      }

      return {
        id: `trk_${Buffer.from(filePath).toString('base64url').slice(0, 16)}`,
        filePath,
        title: common.title || path.parse(filePath).name,
        artist: common.artist || common.albumartist || 'Unknown Artist',
        album: common.album || 'Unknown Album',
        year: common.year || null,
        genre: (common.genre && common.genre[0]) || null,
        trackNumber: common.track?.no || null,
        duration: format.duration || 0,
        bitrate: format.bitrate || 0,
        sampleRate: format.sampleRate || 0,
        artId,
        src: `file://${filePath}`
      };
    } catch (err) {
      return {
        id: `trk_${Buffer.from(filePath).toString('base64url').slice(0, 16)}`,
        filePath,
        title: path.parse(filePath).name,
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        duration: 0,
        src: `file://${filePath}`,
        error: err.message
      };
    }
  }

  getArt(artId) {
    return this.albumArtRegistry.get(artId);
  }

  /**
   * Recursively scan directory for audio files and extract metadata
   */
  async scanDirectory(dirPath, onProgress = null) {
    if (!fs.existsSync(dirPath)) throw new Error(`Directory not found: ${dirPath}`);

    const audioExtensions = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus', '.wma']);
    const audioFiles = [];

    function walk(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Ignore hidden and system dirs
            if (!entry.name.startsWith('.')) {
              walk(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (audioExtensions.has(ext)) {
              audioFiles.push(fullPath);
            }
          }
        }
      } catch {}
    }

    walk(dirPath);

    const parsedTracks = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const track = await this.parseTrack(file);
      parsedTracks.push(track);

      if (typeof onProgress === 'function') {
        onProgress({ current: i + 1, total: audioFiles.length, file });
      }
    }

    // Merge into tracks list without duplicates
    const fileSet = new Set(parsedTracks.map(t => t.filePath));
    this.tracks = this.tracks.filter(t => !fileSet.has(t.filePath)).concat(parsedTracks);
    this._rebuildIndexes();
    this._saveCache();

    return {
      totalFound: audioFiles.length,
      libraryTotal: this.tracks.length,
      artistsCount: this.artists.size,
      albumsCount: this.albums.size,
      tracks: this.tracks
    };
  }

  /**
   * Scan folders in the background using a Node.js worker_thread
   * @param {string|string[]} folders
   * @param {Object} callbacks
   */
  scanFoldersInBackground(folders, callbacks = {}) {
    const { onDiscovered, onProgress, onBatch, onDone, onError } = callbacks;

    if (this.currentWorker) {
      try {
        this.currentWorker.terminate();
      } catch {}
      this.currentWorker = null;
    }

    const workerPath = path.resolve(__dirname, 'scan-worker.js');
    const normalizedFolders = Array.isArray(folders) ? folders : [folders];
    const worker = new Worker(workerPath, {
      workerData: { folders: normalizedFolders }
    });
    this.currentWorker = worker;

    worker.on('message', (msg) => {
      if (!msg) return;

      if (msg.type === 'discovered') {
        if (typeof onDiscovered === 'function') {
          onDiscovered(msg);
        }
      } else if (msg.type === 'progress') {
        if (typeof onProgress === 'function') {
          onProgress(msg);
        }
      } else if (msg.type === 'batch') {
        // Register artworks
        for (const art of (msg.artworks || [])) {
          if (art && art.artId && art.buffer) {
            this.albumArtRegistry.set(art.artId, {
              buffer: Buffer.from(art.buffer),
              format: art.format || 'image/jpeg'
            });
          }
        }
        // Merge tracks
        const incomingFileSet = new Set(msg.tracks.map(t => t.filePath));
        this.tracks = this.tracks.filter(t => !incomingFileSet.has(t.filePath)).concat(msg.tracks);
        this._rebuildIndexes();
        this._saveCache();

        if (typeof onBatch === 'function') {
          onBatch({
            tracks: msg.tracks,
            current: msg.current,
            total: msg.total,
            library: this.getLibrary()
          });
        }
      } else if (msg.type === 'done') {
        // Register artworks
        for (const art of (msg.artworks || [])) {
          if (art && art.artId && art.buffer) {
            this.albumArtRegistry.set(art.artId, {
              buffer: Buffer.from(art.buffer),
              format: art.format || 'image/jpeg'
            });
          }
        }
        // Final merge
        const incomingFileSet = new Set(msg.tracks.map(t => t.filePath));
        this.tracks = this.tracks.filter(t => !incomingFileSet.has(t.filePath)).concat(msg.tracks);
        this._rebuildIndexes();
        this._saveCache();

        if (this.currentWorker === worker) {
          try { worker.terminate(); } catch {}
          this.currentWorker = null;
        }

        if (typeof onDone === 'function') {
          onDone({
            totalFound: msg.totalFound,
            tracks: msg.tracks,
            library: this.getLibrary()
          });
        }
      } else if (msg.type === 'error') {
        if (this.currentWorker === worker) {
          try { worker.terminate(); } catch {}
          this.currentWorker = null;
        }
        if (typeof onError === 'function') {
          onError(new Error(msg.error || 'Unknown scan worker error'));
        }
      }
    });

    worker.on('error', (err) => {
      if (this.currentWorker === worker) {
        try { worker.terminate(); } catch {}
        this.currentWorker = null;
      }
      if (typeof onError === 'function') {
        onError(err);
      }
    });

    worker.on('exit', () => {
      if (this.currentWorker === worker) {
        this.currentWorker = null;
      }
    });

    return {
      worker,
      cancel: () => {
        try {
          worker.postMessage({ type: 'stop' });
          worker.terminate();
        } catch {}
        if (this.currentWorker === worker) {
          this.currentWorker = null;
        }
      }
    };
  }

  cancelScan() {
    if (this.currentWorker) {
      try {
        this.currentWorker.postMessage({ type: 'stop' });
        this.currentWorker.terminate();
      } catch {}
      this.currentWorker = null;
      return true;
    }
    return false;
  }

  isScanning() {
    return this.currentWorker !== null;
  }

  getLibrary() {
    return {
      tracks: this.tracks,
      artists: Array.from(this.artists.keys()).map(name => ({
        name,
        trackCount: this.artists.get(name).length
      })),
      albums: Array.from(this.albums.keys()).map(name => ({
        name,
        trackCount: this.albums.get(name).length
      }))
    };
  }
}

module.exports = { MediaLibrary };
