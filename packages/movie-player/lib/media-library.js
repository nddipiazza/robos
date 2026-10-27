'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const {
  generateTrackId,
  toSafeFileUrl,
  trackFromMetadata,
  fallbackTrack,
  guessFromRemotePath,
} = require('./track-metadata');
const { readCloudTags, mergeTags } = require('./cloud-tags');

const ART_MEMORY_LIMIT = 200;
const ART_EXTENSIONS = ['jpg', 'png', 'webp', 'svg'];

class MediaLibrary {
  // `tracks` is reassigned by LibraryFolders and older callers; every reassignment
  // invalidates the filePath → position index used for O(batch) merges.
  get tracks() {
    return this._tracks;
  }

  set tracks(list) {
    this._tracks = Array.isArray(list) ? list : [];
    this._pathIndex = null;
    this._indexesDirty = true;
  }

  constructor(options = {}) {
    this.configDir = options.configDir || path.join(os.homedir(), '.config', 'robos');
    this.cacheFile = path.join(this.configDir, 'movie-library.json');
    this.playlistsFile = path.join(this.configDir, 'movie-playlists.json');
    this.statsFile = path.join(this.configDir, 'movie-track-stats.json');
    // Cover art lives on disk so it survives restarts; tests pass configDir to stay hermetic.
    this.artDir = options.artDir || (options.configDir
      ? path.join(options.configDir, 'movie-art-cache')
      : path.join(os.homedir(), '.cache', 'robos', 'movie-player', 'art'));
    this.tracks = [];
    this.artists = new Map();
    this.albums = new Map();
    this.albumArtRegistry = new Map(); // artId -> { buffer, format }, small in-memory LRU over artDir
    this._mm = null;
    this.currentWorker = null;
    this.playlists = [];
    this.stats = {}; // trackId -> { plays, lastPlayed, loved, lovedAt }
    this.artAliases = new Map(); // legacy path-based artId -> content-based artId
    this._saveTimer = null;

    this._loadCache();
    this._loadPlaylists();
    this._loadStats();
  }

  _generateTrackId(filePath) {
    return generateTrackId(filePath);
  }

  _toSafeFileUrl(filePath) {
    return toSafeFileUrl(filePath);
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

        // Automatic self-healing: migrate any legacy duplicate IDs and fix unencoded file:// URLs
        let needsSave = false;
        const seenIds = new Set();
        for (const track of this.tracks) {
          if (track.filePath) {
            const properId = this._generateTrackId(track.filePath);
            if (track.id !== properId || seenIds.has(track.id)) {
              track.id = properId;
              needsSave = true;
            }
            seenIds.add(track.id);

            const properSrc = this._toSafeFileUrl(track.filePath);
            if (!track.cloud && track.src !== properSrc) {
              track.src = properSrc;
              needsSave = true;
            }
          }
          // Libraries indexed before "Recently Added" existed: use the file's mtime.
          if (!track.addedAt) {
            track.addedAt = this._fileTimeIso(track.filePath) || data.updatedAt || new Date().toISOString();
            needsSave = true;
          }
        }
        if (needsSave) {
          this._saveCache();
        }

        this._rebuildIndexes();
      }
    } catch (err) {
      console.warn('[MediaLibrary] Could not load library cache:', err.message);
      this.tracks = [];
    }
  }

  _fileTimeIso(filePath) {
    // Stat'ing thousands of files over a GVFS (SFTP/SMB) mount would stall startup.
    if (!filePath || filePath.includes('/gvfs/')) return null;
    try {
      if (fs.existsSync(filePath)) return fs.statSync(filePath).mtime.toISOString();
    } catch {}
    return null;
  }

  // Coalesces bursts of small library updates into one write. A 100k-track cache
  // is ~40 MB of JSON, far too much to rewrite for every 5-track scan batch.
  _saveCacheSoon(delayMs = 3000) {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._saveCache();
    }, delayMs);
    if (this._saveTimer.unref) this._saveTimer.unref();
  }

  // Writes any pending debounced save now (scan finished, app quitting).
  flush() {
    if (this._saveTimer) this._saveCache();
  }

  _ensurePathIndex() {
    if (!this._pathIndex) {
      this._pathIndex = new Map();
      this._tracks.forEach((t, i) => { if (t && t.filePath) this._pathIndex.set(t.filePath, i); });
    }
    return this._pathIndex;
  }

  /**
   * Replace-or-insert tracks by filePath, keeping when each one first entered the
   * library. Costs O(incoming), not O(library), so background scans of very large
   * libraries stay cheap. `deferSave` batches the disk write.
   */
  mergeTracks(incoming = [], { deferSave = false } = {}) {
    if (!incoming.length) return this.tracks;
    const index = this._ensurePathIndex();
    const list = this._tracks;
    const now = new Date().toISOString();
    for (const track of incoming) {
      if (!track) continue;
      const at = track.filePath ? index.get(track.filePath) : undefined;
      if (at !== undefined) {
        track.addedAt = list[at].addedAt || track.addedAt || now;
        list[at] = track;
      } else {
        track.addedAt = track.addedAt || now;
        if (track.filePath) index.set(track.filePath, list.length);
        list.push(track);
      }
    }
    this._indexesDirty = true;
    if (deferSave) this._saveCacheSoon();
    else this._saveCache();
    return this.tracks;
  }

  // ── Play statistics & loved tracks ─────────────────────────────────────────

  _loadStats() {
    try {
      if (fs.existsSync(this.statsFile)) {
        const data = JSON.parse(fs.readFileSync(this.statsFile, 'utf8'));
        this.stats = (data && typeof data === 'object' && data.tracks) || {};
      }
    } catch (err) {
      console.warn('[MediaLibrary] Could not load track stats:', err.message);
      this.stats = {};
    }
  }

  _saveStats() {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.statsFile, JSON.stringify({ updatedAt: new Date().toISOString(), tracks: this.stats }));
    } catch (err) {
      console.warn('[MediaLibrary] Could not save track stats:', err.message);
    }
  }

  getStats() {
    return this.stats;
  }

  recordPlay(trackId) {
    if (!trackId) return null;
    const entry = this.stats[trackId] || {};
    entry.plays = (entry.plays || 0) + 1;
    entry.lastPlayed = new Date().toISOString();
    this.stats[trackId] = entry;
    this._saveStats();
    return entry;
  }

  setLoved(trackIds, loved) {
    const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
    const now = new Date().toISOString();
    const changed = {};
    for (const id of ids.filter(Boolean)) {
      const entry = this.stats[id] || {};
      entry.loved = !!loved;
      entry.lovedAt = loved ? now : null;
      this.stats[id] = entry;
      changed[id] = entry;
    }
    this._saveStats();
    return changed;
  }

  // ── Cover art (content-addressed, persisted under artDir) ─────────────────

  _rememberArt(artId, art) {
    this.albumArtRegistry.delete(artId);
    this.albumArtRegistry.set(artId, art);
    if (this.albumArtRegistry.size > ART_MEMORY_LIMIT) {
      this.albumArtRegistry.delete(this.albumArtRegistry.keys().next().value);
    }
  }

  storeArt(artId, buffer, format = 'image/jpeg') {
    if (!artId || !buffer) return;
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : format === 'image/svg+xml' ? 'svg' : 'jpg';
    try {
      const target = path.join(this.artDir, `${artId}.${ext}`);
      if (!fs.existsSync(target)) {
        fs.mkdirSync(this.artDir, { recursive: true });
        fs.writeFileSync(target, buf);
      }
    } catch (err) {
      console.warn('[MediaLibrary] Could not persist cover art:', err.message);
    }
    this._rememberArt(artId, { buffer: buf, format });
  }

  _storeWorkerArtworks(artworks = []) {
    for (const art of artworks) {
      if (art && art.artId && art.buffer) this.storeArt(art.artId, art.buffer, art.format);
    }
  }

  _saveCache() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      // Compact JSON: indentation adds ~30% to a file that can hold 100k tracks.
      fs.writeFileSync(this.cacheFile, JSON.stringify({
        updatedAt: new Date().toISOString(),
        tracks: this.tracks
      }));
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

        // Self-heal tracks inside playlists
        let plNeedsSave = false;
        for (const pl of this.playlists) {
          if (Array.isArray(pl.tracks)) {
            for (const track of pl.tracks) {
              if (track.filePath) {
                const properId = this._generateTrackId(track.filePath);
                if (track.id !== properId) {
                  track.id = properId;
                  plNeedsSave = true;
                }
                const properSrc = this._toSafeFileUrl(track.filePath);
                if (!track.cloud && track.src !== properSrc) {
                  track.src = properSrc;
                  plNeedsSave = true;
                }
              }
            }
          }
        }
        if (plNeedsSave) {
          this._savePlaylists();
        }
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

  // Kept for callers that edit `tracks` directly; the summary maps are rebuilt
  // lazily the next time they're read instead of after every change.
  _rebuildIndexes() {
    this._indexesDirty = true;
  }

  _ensureIndexes() {
    if (!this._indexesDirty) return;
    this._indexesDirty = false;
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
    let result;
    try {
      const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: false });
      result = trackFromMetadata(filePath, metadata, mm);
    } catch (err) {
      result = fallbackTrack(filePath, err);
    }
    if (result.art) this.storeArt(result.art.artId, result.art.buffer, result.art.format);
    return result.track;
  }

  /**
   * Build a track entry for a remote cloud audio file without downloading it upfront.
   * If the file happens to already be in the local cache, parse its ID3 tags;
   * otherwise infer initial title/artist/album from the filename and folder path.
   */
  async buildCloudTrack(descriptor, streamUrl = null) {
    const filePath = descriptor.localPath;
    const id = this._generateTrackId(filePath);
    const cloudMeta = {
      connectionId: descriptor.connectionId,
      driverType: descriptor.driverType || 'gdrive',
      remotePath: descriptor.remotePath,
      driveId: descriptor.driveId || null,
      size: descriptor.size != null ? descriptor.size : null,
      modified: descriptor.modified || null,
      cached: !!descriptor.cached,
    };

    if (descriptor.cached && fs.existsSync(filePath)) {
      const parsed = await this.parseTrack(filePath);
      cloudMeta.tagsRead = true;
      return {
        ...parsed,
        id,
        filePath,
        cloud: cloudMeta,
        src: streamUrl || parsed.src,
      };
    }

    // Tags are read later (lib/cloud-tags); until then, go by the folder names.
    const guess = guessFromRemotePath(descriptor.remotePath, descriptor.name);
    return {
      id,
      filePath,
      title: guess.title,
      artist: guess.artist,
      album: guess.album,
      trackNumber: guess.trackNumber,
      discNumber: guess.discNumber,
      year: guess.year,
      duration: 0,
      addedAt: new Date().toISOString(),
      cloud: cloudMeta,
      src: streamUrl || this._toSafeFileUrl(filePath),
    };
  }

  /**
   * Fills in a cloud track's tags: from its cached copy when there is one, else by
   * fetching only the bytes that hold the tags (`readRange(cloud, start, end)`).
   * Resolves true when the track changed (and should be saved / re-sent).
   */
  async refreshCloudTags(track, readRange) {
    if (!track || !track.cloud) return false;
    const fileTitle = path.parse(track.filePath).name;
    let parsed = null;
    if (fs.existsSync(track.filePath)) {
      parsed = await this.parseTrack(track.filePath);
      if (parsed.error) parsed = null;
    } else {
      const mm = await this._getParser();
      let metadata = null;
      try {
        metadata = await readCloudTags({
          fetchRange: (start, end) => readRange(track.cloud, start, end),
          parser: mm,
          name: track.cloud.remotePath || track.filePath,
        });
      } catch (err) {
        if (err && err.authRequired) throw err;
        track.cloud.tagsFailed = (track.cloud.tagsFailed || 0) + 1;
        return true;
      }
      if (metadata) {
        const result = trackFromMetadata(track.filePath, metadata, mm);
        if (result.art) this.storeArt(result.art.artId, result.art.buffer, result.art.format);
        parsed = result.track;
      }
    }
    if (parsed) mergeTags(track, parsed, { fileTitle });
    track.cloud.tagsRead = true;
    delete track.cloud.tagsFailed;
    return true;
  }

  /** Cloud tracks still waiting for their tags (a couple of failed tries gives up). */
  cloudTracksNeedingTags() {
    return this.tracks.filter(t => t.cloud && !t.cloud.tagsRead && (t.cloud.tagsFailed || 0) < 3);
  }

  /**
   * Libraries from before tag reading named every un-played cloud song's artist
   * "Cloud Stream"; give those the folder-name guess until their tags arrive.
   */
  upgradeCloudGuesses() {
    let changed = 0;
    for (const t of this.tracks) {
      if (!t.cloud || t.cloud.tagsRead || t.artist !== 'Cloud Stream') continue;
      const g = guessFromRemotePath(t.cloud.remotePath, path.posix.basename(t.cloud.remotePath || ''));
      Object.assign(t, { title: g.title, artist: g.artist, album: g.album });
      for (const k of ['trackNumber', 'discNumber', 'year']) if (g[k] && !t[k]) t[k] = g[k];
      changed++;
    }
    if (changed) { this._rebuildIndexes(); this._saveCacheSoon(); }
    return changed;
  }

  getArt(artId) {
    if (!artId || !/^art_[\w-]+$/.test(artId)) return null;
    if (this.artAliases.has(artId)) artId = this.artAliases.get(artId);
    const cached = this.albumArtRegistry.get(artId);
    if (cached) return cached;
    for (const ext of ART_EXTENSIONS) {
      const file = path.join(this.artDir, `${artId}.${ext}`);
      try {
        if (fs.existsSync(file)) {
          const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
          const art = { buffer: fs.readFileSync(file), format: mime };
          this._rememberArt(artId, art);
          return art;
        }
      } catch {}
    }
    return null;
  }

  /**
   * Like getArt, but if the image is missing (e.g. a library indexed before art was
   * persisted) re-read the cover from one of the tracks that references it.
   */
  async getArtAsync(artId) {
    const art = this.getArt(artId);
    if (art) return art;
    const owner = this.tracks.find(t => t.artId === artId && t.filePath && fs.existsSync(t.filePath));
    if (!owner) return null;
    const fresh = await this.parseTrack(owner.filePath);
    if (fresh.artId && fresh.artId !== artId) {
      // Older libraries keyed art by file path; re-point every track of that album and
      // remember the old id, since the renderer may still ask for it.
      this.artAliases.set(artId, fresh.artId);
      for (const t of this.tracks) if (t.artId === artId) t.artId = fresh.artId;
      this._saveCacheSoon();
    }
    return fresh.artId ? this.getArt(fresh.artId) : null;
  }

  /**
   * Recursively scan directory for audio files and extract metadata
   */
  async scanDirectory(dirPath, onProgress = null) {
    if (!fs.existsSync(dirPath)) throw new Error(`Directory not found: ${dirPath}`);

    const audioExtensions = new Set([
      '.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ogv', '.ts', '.m2ts', '.mpg', '.mpeg', '.flv', '.wmv', '.3gp',
      '.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus', '.wma',
    ]);
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

    this.mergeTracks(parsedTracks);
    this._ensureIndexes();

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
    // Tracks found by this scan (references into the library, not copies).
    const scanned = [];
    const self = this;
    const withLibrary = (payload) => Object.defineProperty(payload, 'library', {
      // Lazy: building the full library payload is only worth it for callers that use it.
      get() { return self.getLibrary(); },
      enumerable: false,
    });

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
        this._storeWorkerArtworks(msg.artworks);
        this.mergeTracks(msg.tracks, { deferSave: true });
        for (const t of msg.tracks) scanned.push(t);

        if (typeof onBatch === 'function') {
          onBatch(withLibrary({
            tracks: msg.tracks,
            current: msg.current,
            total: msg.total,
          }));
        }
      } else if (msg.type === 'done') {
        this._storeWorkerArtworks(msg.artworks);
        if (msg.tracks && msg.tracks.length) {
          this.mergeTracks(msg.tracks, { deferSave: true });
          for (const t of msg.tracks) scanned.push(t);
        }
        this.flush();

        if (this.currentWorker === worker) {
          try { worker.terminate(); } catch {}
          this.currentWorker = null;
        }

        if (typeof onDone === 'function') {
          onDone(withLibrary({
            totalFound: msg.totalFound,
            tracks: scanned,
            canceled: !!msg.canceled,
          }));
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
    this.flush();
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
    this._ensureIndexes();
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

  createPlaylist({ name, description, tracks = [], ai = null, dj = null }) {
    const id = `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const playlist = {
      id,
      name: (name && name.trim()) || 'Untitled Playlist',
      description: (description && description.trim()) || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tracks: Array.isArray(tracks) ? [...tracks] : []
    };
    // AI playlists remember the request, and the Virtual DJ persona and script.
    if (ai && typeof ai === 'object') playlist.ai = ai;
    if (dj && typeof dj === 'object') playlist.dj = dj;
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
            id: this._generateTrackId(resolvedPath),
            filePath: resolvedPath,
            title: currentExtInf?.title || path.parse(resolvedPath).name,
            artist: currentExtInf?.artist || 'Unknown Artist',
            album: 'Imported Playlist',
            duration: currentExtInf?.duration || 0,
            src: resolvedPath.startsWith('http') ? resolvedPath : this._toSafeFileUrl(resolvedPath)
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
