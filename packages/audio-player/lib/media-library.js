'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');

class MediaLibrary {
  constructor(options = {}) {
    this.configDir = options.configDir || path.join(os.homedir(), '.config', 'robos');
    this.cacheFile = path.join(this.configDir, 'audio-library.json');
    this.playlistsFile = path.join(this.configDir, 'audio-playlists.json');
    this.tracks = [];
    this.artists = new Map();
    this.albums = new Map();
    this.albumArtRegistry = new Map(); // artId -> { buffer, format }
    this.nextArtId = 1;
    this._mm = null;
    this.currentWorker = null;
    this.playlists = [];

    this._loadCache();
    this._loadPlaylists();
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

  _loadPlaylists() {
    try {
      if (fs.existsSync(this.playlistsFile)) {
        const raw = fs.readFileSync(this.playlistsFile, 'utf8');
        const data = JSON.parse(raw);
        this.playlists = Array.isArray(data) ? data : (data.playlists || []);
      } else {
        // Seed default playlists if file does not exist yet
        this.playlists = [
          {
            id: 'pl_favorites',
            name: 'Favorites',
            description: 'Starred tracks and favorite coding anthems',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tracks: []
          },
          {
            id: 'pl_focus',
            name: 'Focus & Deep Work',
            description: 'Synthesizers, ambient soundscapes, and instrumental flow sessions',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tracks: [
              {
                id: 'default-1',
                title: 'RobOS Lo-Fi Synth Session',
                artist: 'Procedural Ambient Engine',
                album: 'RobOS Focus Series',
                duration: 180,
                src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3'
              }
            ]
          }
        ];
        this._savePlaylists();
      }
    } catch (err) {
      console.warn('[MediaLibrary] Could not load playlists cache:', err.message);
      this.playlists = [];
    }
  }

  _savePlaylists() {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.playlistsFile, JSON.stringify(this.playlists, null, 2));
    } catch (err) {
      console.warn('[MediaLibrary] Could not save playlists cache:', err.message);
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
      })),
      playlists: this.playlists
    };
  }

  getPlaylists() {
    return this.playlists;
  }

  getPlaylist(playlistId) {
    return this.playlists.find(p => p.id === playlistId) || null;
  }

  createPlaylist({ name, description, tracks = [] }) {
    const id = `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const playlist = {
      id,
      name: (name && name.trim()) || 'Untitled Playlist',
      description: (description && description.trim()) || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tracks: Array.isArray(tracks) ? [...tracks] : []
    };
    this.playlists.push(playlist);
    this._savePlaylists();
    return playlist;
  }

  updatePlaylist(playlistId, updates = {}) {
    const idx = this.playlists.findIndex(p => p.id === playlistId);
    if (idx === -1) throw new Error(`Playlist ${playlistId} not found`);
    const current = this.playlists[idx];
    const updated = {
      ...current,
      ...updates,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    };
    if (updates.name !== undefined) updated.name = updates.name.trim() || current.name;
    if (updates.description !== undefined) updated.description = updates.description.trim();
    if (updates.tracks !== undefined) updated.tracks = Array.isArray(updates.tracks) ? updates.tracks : current.tracks;
    this.playlists[idx] = updated;
    this._savePlaylists();
    return updated;
  }

  deletePlaylist(playlistId) {
    const initialLen = this.playlists.length;
    this.playlists = this.playlists.filter(p => p.id !== playlistId);
    if (this.playlists.length !== initialLen) {
      this._savePlaylists();
      return true;
    }
    return false;
  }

  addTracksToPlaylist(playlistId, newTracks = []) {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) throw new Error(`Playlist ${playlistId} not found`);
    const tracksToAdd = Array.isArray(newTracks) ? newTracks : [newTracks];
    for (const track of tracksToAdd) {
      if (track) {
        playlist.tracks.push(track);
      }
    }
    playlist.updatedAt = new Date().toISOString();
    this._savePlaylists();
    return playlist;
  }

  removeTrackFromPlaylist(playlistId, trackIndex) {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) throw new Error(`Playlist ${playlistId} not found`);
    if (trackIndex >= 0 && trackIndex < playlist.tracks.length) {
      playlist.tracks.splice(trackIndex, 1);
      playlist.updatedAt = new Date().toISOString();
      this._savePlaylists();
    }
    return playlist;
  }

  reorderPlaylistTracks(playlistId, fromIndex, toIndex) {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) throw new Error(`Playlist ${playlistId} not found`);
    if (fromIndex >= 0 && fromIndex < playlist.tracks.length && toIndex >= 0 && toIndex < playlist.tracks.length) {
      const [moved] = playlist.tracks.splice(fromIndex, 1);
      playlist.tracks.splice(toIndex, 0, moved);
      playlist.updatedAt = new Date().toISOString();
      this._savePlaylists();
    }
    return playlist;
  }

  exportM3u(playlistId, targetPath) {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) throw new Error(`Playlist ${playlistId} not found`);
    let content = `#EXTM3U\n#PLAYLIST:${playlist.name}\n`;
    for (const t of playlist.tracks) {
      const durationSec = Math.round(t.duration || 0);
      const title = t.title || 'Unknown Title';
      const artist = t.artist || 'Unknown Artist';
      content += `#EXTINF:${durationSec},${artist} - ${title}\n`;
      content += `${t.filePath || t.src || ''}\n`;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
    return { ok: true, path: targetPath, trackCount: playlist.tracks.length };
  }

  async importM3u(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const m3uDir = path.dirname(filePath);

    let playlistName = path.parse(filePath).name;
    const tracks = [];

    let currentExtInf = null;

    for (const line of lines) {
      if (line.startsWith('#PLAYLIST:')) {
        playlistName = line.substring(10).trim() || playlistName;
      } else if (line.startsWith('#EXTINF:')) {
        const info = line.substring(8);
        const commaIdx = info.indexOf(',');
        let duration = 0;
        let titleArtist = info;
        if (commaIdx >= 0) {
          duration = parseFloat(info.substring(0, commaIdx)) || 0;
          titleArtist = info.substring(commaIdx + 1).trim();
        }
        let artist = 'Unknown Artist';
        let title = titleArtist;
        if (titleArtist.includes(' - ')) {
          const parts = titleArtist.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }
        currentExtInf = { duration, artist, title };
      } else if (!line.startsWith('#')) {
        let resolvedPath = line;
        if (!line.startsWith('http://') && !line.startsWith('https://') && !line.startsWith('file://')) {
          if (!path.isAbsolute(line)) {
            resolvedPath = path.resolve(m3uDir, line);
          }
        }

        let trackObj = null;
        if (fs.existsSync(resolvedPath)) {
          try {
            trackObj = await this.parseTrack(resolvedPath);
          } catch {}
        }
        if (!trackObj) {
          trackObj = {
            id: `trk_${Buffer.from(resolvedPath).toString('base64url').slice(0, 16)}`,
            filePath: resolvedPath,
            title: currentExtInf?.title || path.parse(resolvedPath).name,
            artist: currentExtInf?.artist || 'Unknown Artist',
            album: 'Imported Playlist',
            duration: currentExtInf?.duration || 0,
            src: resolvedPath.startsWith('http') ? resolvedPath : `file://${resolvedPath}`
          };
        }
        tracks.push(trackObj);
        currentExtInf = null;
      }
    }

    const playlist = this.createPlaylist({
      name: playlistName,
      description: `Imported from ${path.basename(filePath)}`,
      tracks
    });
    return playlist;
  }
}

module.exports = { MediaLibrary };
