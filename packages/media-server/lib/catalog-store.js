'use strict';

/**
 * RobOS Media Server — Persistent Multi-Service Catalog, Incremental Scanner & Progress Store
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  VIDEO_EXTS,
  AUDIO_EXTS,
  BOOK_EXTS,
  DOC_BOOK_EXTS,
  itemIdForPath,
  mimeForPath,
  isSampleFile,
  parseVideoItem,
  parseMusicItem,
  parseBookItem,
} = require('./media-parser');
const { inspectEpubMetadata } = require('./epub-reader');

const SERVICE_KINDS = ['movies', 'shows', 'music', 'books', 'education', 'mixed'];

const DEFAULT_SERVICE_DEFS = [
  { id: 'movies', name: 'Movies', kind: 'movies', icon: 'film', description: 'Feature films, cinema releases, and home movies.' },
  { id: 'shows', name: 'TV Shows', kind: 'shows', icon: 'tv', description: 'Television series, multi-season packs, and kids shows.' },
  { id: 'music', name: 'Music & Audio', kind: 'music', icon: 'music', description: 'FLAC, MP3, M4A, OGG, and WAV albums, discographies, and soundtracks.' },
  { id: 'books', name: 'Books & Comics', kind: 'books', icon: 'book', description: 'EPUB, PDF, MOBI, AZW3, CBZ/CBR comics, and M4B audiobooks.' },
  { id: 'education', name: 'Courses & Education', kind: 'education', icon: 'graduation', description: 'Video courses, tutorials, and technical reference books.' },
];

function detectDefaultServices() {
  const services = [];
  const existingDirs = (candidates) => candidates.filter(p => {
    try { return fs.existsSync(p) && fs.statSync(p).isDirectory(); } catch { return false; }
  });

  const movieDirs = existingDirs(['/downloads/movies', path.join(os.homedir(), 'Videos'), path.join(os.homedir(), 'Movies')]);
  if (movieDirs.length) {
    services.push({ id: 'movies', name: 'Movies', kind: 'movies', folders: [movieDirs[0]], enabled: true, mcpEnabled: true });
  }

  const showDirs = existingDirs(['/downloads/shows', '/downloads/House MD', '/downloads/kids']);
  if (showDirs.length) {
    services.push({ id: 'shows', name: 'TV Shows', kind: 'shows', folders: showDirs, enabled: true, mcpEnabled: true });
  }

  const musicDirs = existingDirs(['/downloads/music', '/downloads/Dianas MUSIC', '/downloads/video game music', path.join(os.homedir(), 'Music')]);
  if (musicDirs.length) {
    const dlMusic = musicDirs.filter(d => d.startsWith('/downloads/'));
    services.push({ id: 'music', name: 'Music & Audio', kind: 'music', folders: dlMusic.length ? dlMusic : [musicDirs[0]], enabled: true, mcpEnabled: true });
  }

  const bookDirs = existingDirs(['/downloads/books', path.join(os.homedir(), 'Books')]);
  if (bookDirs.length) {
    services.push({ id: 'books', name: 'Books & eBooks', kind: 'books', folders: [bookDirs[0]], enabled: true, mcpEnabled: true });
  }

  const eduDirs = existingDirs(['/downloads/education']);
  if (eduDirs.length) {
    services.push({ id: 'education', name: 'Courses & Education', kind: 'education', folders: eduDirs, enabled: true, mcpEnabled: true });
  }

  return services;
}

function portableMediaKey(item) {
  if (!item) return '';
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (item.mediaType === 'tv') {
    return `tv:${slug(item.showName)}:s${item.seasonNumber || 1}:e${item.episodeNumber || 1}`;
  }
  if (item.mediaType === 'movie') {
    return `movie:${slug(item.title)}:${item.year || ''}`;
  }
  if (item.mediaType === 'music') {
    return `audio:${slug(item.artist)}:${slug(item.album)}:${slug(item.title)}`;
  }
  if (item.mediaType === 'book') {
    return `book:${slug(item.author)}:${slug(item.title)}`;
  }
  return `media:${slug(item.title)}`;
}

class MediaCatalogStore {
  constructor(options = {}) {
    const home = options.homeDir || process.env.HOME || os.homedir();
    this.dataDir = options.dataDir || process.env.ROBOS_MEDIA_SERVER_DIR || path.join(home, '.config', 'robos', 'media-server');
    this.cacheDir = options.cacheDir || path.join(home, '.cache', 'robos', 'media-server');
    this.configFile = path.join(this.dataDir, 'config.json');
    this.catalogFile = path.join(this.dataDir, 'catalog.json');
    this.progressFile = path.join(this.dataDir, 'progress.json');
    this.playlistsFile = path.join(this.dataDir, 'playlists.json');

    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(path.join(this.cacheDir, 'art'), { recursive: true });

    this.config = this._loadConfig(options.initialServices);
    this.items = [];
    this.byId = new Map();
    this.byPath = new Map();
    this.catalogRevision = 1;
    this.progressRevision = 1;
    this.updatedAt = new Date().toISOString();
    this.progress = this._readJson(this.progressFile, {});
    this.playlists = this._readJson(this.playlistsFile, []);
    this.scanState = {
      running: false,
      serviceId: null,
      scannedFiles: 0,
      added: 0,
      updated: 0,
      removed: 0,
      currentFile: '',
      startedAt: null,
      finishedAt: null,
      lastError: null,
    };
    this._watchers = new Map();
    this._watchDebounce = null;
    this._autoScanTimer = null;

    this._loadCatalog();
  }

  _readJson(file, fallback) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    return fallback;
  }

  _writeJsonAtomic(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  _loadConfig(initialServices) {
    const existing = this._readJson(this.configFile, null);
    if (existing && Array.isArray(existing.services)) {
      return {
        serverId: existing.serverId || `ms_${crypto.createHash('sha1').update(os.hostname()).digest('hex').slice(0, 10)}`,
        serverName: existing.serverName || `RobOS Media Server (${os.hostname()})`,
        mcpEnabled: existing.mcpEnabled !== false,
        transcodeEnabled: existing.transcodeEnabled !== false,
        autoWatchFolders: existing.autoWatchFolders !== false,
        autoScanIntervalMinutes: Number(existing.autoScanIntervalMinutes) || 15,
        services: existing.services,
      };
    }
    const cfg = {
      serverId: `ms_${crypto.createHash('sha1').update(os.hostname()).digest('hex').slice(0, 10)}`,
      serverName: `RobOS Media Server (${os.hostname()})`,
      mcpEnabled: true,
      transcodeEnabled: true,
      autoWatchFolders: true,
      autoScanIntervalMinutes: 15,
      services: Array.isArray(initialServices) ? initialServices : detectDefaultServices(),
    };
    this._writeJsonAtomic(this.configFile, cfg);
    return cfg;
  }

  saveConfig(patch = {}) {
    this.config = { ...this.config, ...patch };
    this._writeJsonAtomic(this.configFile, this.config);
    return this.config;
  }

  _loadCatalog() {
    const data = this._readJson(this.catalogFile, null);
    if (data && Array.isArray(data.items)) {
      this.items = data.items;
      this.catalogRevision = Number(data.catalogRevision) || 1;
      this.updatedAt = data.updatedAt || new Date().toISOString();
      this._rebuildMaps();
    }
  }

  _saveCatalog() {
    this.catalogRevision += 1;
    this.updatedAt = new Date().toISOString();
    this._writeJsonAtomic(this.catalogFile, {
      version: 1,
      serverId: this.config.serverId,
      catalogRevision: this.catalogRevision,
      updatedAt: this.updatedAt,
      items: this.items,
    });
  }

  _rebuildMaps() {
    this.byId.clear();
    this.byPath.clear();
    for (const item of this.items) {
      if (!item) continue;
      this.byId.set(item.id, item);
      if (item.filePath) this.byPath.set(item.filePath, item);
    }
  }

  // ── Media Services Management ──────────────────────────────────────────────

  listServices() {
    return this.config.services.map(svc => {
      const svcItems = this.items.filter(i => i.serviceId === svc.id);
      const counts = this._summarizeCounts(svcItems);
      return {
        ...svc,
        itemCount: svcItems.length,
        counts,
        foldersStatus: (svc.folders || []).map(f => ({
          path: f,
          exists: (() => { try { return fs.existsSync(f); } catch { return false; } })(),
        })),
      };
    });
  }

  upsertService(spec = {}) {
    const kind = SERVICE_KINDS.includes(spec.kind) ? spec.kind : 'mixed';
    const rawId = String(spec.id || spec.name || kind)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `svc-${Date.now().toString(36)}`;
    const folders = [...new Set(
      (Array.isArray(spec.folders) ? spec.folders : (spec.folder ? [spec.folder] : []))
        .map(f => String(f || '').trim())
        .filter(Boolean)
        .map(f => path.resolve(f))
    )];
    if (!folders.length) {
      throw new Error('At least one folder path is required for a media service');
    }

    const idx = this.config.services.findIndex(s => s.id === rawId);
    const preset = DEFAULT_SERVICE_DEFS.find(d => d.id === rawId || d.kind === kind);
    const prev = idx >= 0 ? this.config.services[idx] : null;
    const mergedFolders = spec.appendFolders && prev
      ? [...new Set([...(prev.folders || []), ...folders])]
      : folders;

    const nextSvc = {
      id: rawId,
      name: String(spec.name || prev?.name || preset?.name || rawId).trim(),
      kind,
      folders: mergedFolders,
      enabled: spec.enabled !== undefined ? Boolean(spec.enabled) : (prev ? prev.enabled !== false : true),
      mcpEnabled: spec.mcpEnabled !== undefined ? Boolean(spec.mcpEnabled) : (prev ? prev.mcpEnabled !== false : true),
      lastScannedAt: prev?.lastScannedAt || null,
    };

    if (idx >= 0) this.config.services[idx] = nextSvc;
    else this.config.services.push(nextSvc);
    this._writeJsonAtomic(this.configFile, this.config);
    this._refreshWatchers();
    return nextSvc;
  }

  updateService(id, patch = {}) {
    const svc = this.config.services.find(s => s.id === id);
    if (!svc) throw new Error(`Media service "${id}" not found`);
    if (patch.name !== undefined) svc.name = String(patch.name).trim() || svc.name;
    if (patch.kind !== undefined && SERVICE_KINDS.includes(patch.kind)) svc.kind = patch.kind;
    if (Array.isArray(patch.folders)) {
      svc.folders = [...new Set(patch.folders.map(f => String(f || '').trim()).filter(Boolean).map(f => path.resolve(f)))];
    }
    if (patch.enabled !== undefined) svc.enabled = Boolean(patch.enabled);
    if (patch.mcpEnabled !== undefined) svc.mcpEnabled = Boolean(patch.mcpEnabled);
    if (svc.enabled === false) {
      const before = this.items.length;
      this.items = this.items.filter(i => i.serviceId !== id);
      if (this.items.length !== before) {
        this._rebuildMaps();
        this._saveCatalog();
      }
    }
    this._writeJsonAtomic(this.configFile, this.config);
    this._refreshWatchers();
    return svc;
  }

  removeService(id) {
    const beforeSvc = this.config.services.length;
    this.config.services = this.config.services.filter(s => s.id !== id);
    if (this.config.services.length === beforeSvc) return { removed: false };
    this._writeJsonAtomic(this.configFile, this.config);
    const beforeItems = this.items.length;
    this.items = this.items.filter(i => i.serviceId !== id);
    this._rebuildMaps();
    this._saveCatalog();
    this._refreshWatchers();
    return { removed: true, removedItems: beforeItems - this.items.length };
  }

  // ── Incremental Multi-Media Scanner ────────────────────────────────────────

  _acceptsExtension(ext, kind) {
    if (kind === 'movies' || kind === 'shows') return VIDEO_EXTS.has(ext);
    if (kind === 'music') return AUDIO_EXTS.has(ext);
    if (kind === 'books') return DOC_BOOK_EXTS.has(ext);
    if (kind === 'education') return VIDEO_EXTS.has(ext) || DOC_BOOK_EXTS.has(ext) || AUDIO_EXTS.has(ext);
    return VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext) || BOOK_EXTS.has(ext);
  }

  async _walkRoot(rootDir, kind, out) {
    const stack = [rootDir];
    let visited = 0;
    while (stack.length > 0) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (/^(?:node_modules|__MACOSX|Subs|subs|Subtitles|subtitles|Sample|sample)$/i.test(entry.name)) continue;
          stack.push(full);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this._acceptsExtension(ext, kind)) {
            out.push({ filePath: full, rootDir, ext });
          }
        }
        visited += 1;
        if (visited % 250 === 0) {
          await new Promise(r => setImmediate(r));
        }
      }
    }
  }

  _parseDiscoveredFile({ filePath, rootDir, ext }, service) {
    let stat;
    try { stat = fs.statSync(filePath); } catch { return null; }
    if (stat.size === 0) return null;
    if (VIDEO_EXTS.has(ext) && isSampleFile(filePath, stat.size)) return null;
    if ((ext === '.txt' || ext === '.md') && stat.size < 8192) {
      // Skip tiny promo/readme text sidecars inside EPUB/PDF book or course directories
      try {
        const siblings = fs.readdirSync(path.dirname(filePath));
        if (siblings.some(f => /\.(epub|pdf|mobi|azw3|mp4|mkv)$/i.test(f))) return null;
      } catch {}
    }

    const prev = this.byPath.get(filePath);
    if (prev && prev.sizeBytes === stat.size && prev.mtimeMs === Math.floor(stat.mtimeMs) && prev.serviceId === service.id) {
      return { item: prev, reused: true };
    }

    let parsed = null;
    if (VIDEO_EXTS.has(ext)) {
      parsed = parseVideoItem(filePath, rootDir, stat, service.kind);
    } else if (AUDIO_EXTS.has(ext) && ext !== '.m4b') {
      parsed = parseMusicItem(filePath, rootDir, stat);
    } else if (DOC_BOOK_EXTS.has(ext)) {
      const epubMeta = ext === '.epub' ? inspectEpubMetadata(filePath) : null;
      parsed = parseBookItem(filePath, rootDir, stat, epubMeta);
      if (service.kind === 'education') {
        parsed.serviceCategory = 'education';
      }
    }
    if (!parsed) return null;

    const id = itemIdForPath(filePath);
    const item = {
      id,
      serviceId: service.id,
      serviceName: service.name,
      filePath,
      rootDir,
      ext,
      mimeType: mimeForPath(filePath),
      mtimeMs: Math.floor(stat.mtimeMs),
      addedAt: prev?.addedAt || stat.mtime.toISOString(),
      ...parsed,
    };
    item.mediaKey = portableMediaKey(item);
    return { item, reused: false, updated: Boolean(prev) };
  }

  async scan({ serviceId = null, force = false } = {}) {
    if (this.scanState.running) return { ok: true, alreadyRunning: true, scanState: this.scanState };
    const targets = (serviceId
      ? this.config.services.filter(s => s.id === serviceId)
      : this.config.services.filter(s => s.enabled !== false));

    this.scanState = {
      running: true,
      serviceId: serviceId || 'all',
      scannedFiles: 0,
      added: 0,
      updated: 0,
      removed: 0,
      currentFile: '',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastError: null,
    };

    try {
      const originalItems = this.items.slice();
      const targetIds = new Set(targets.map(s => s.id));
      const keptOtherServices = originalItems.filter(i => !targetIds.has(i.serviceId));
      const completedServiceIds = new Set();
      const nextServiceItems = [];
      let added = 0;
      let updated = 0;

      if (force) {
        for (const id of targetIds) {
          for (const it of originalItems) {
            if (it.serviceId === id) this.byPath.delete(it.filePath);
          }
        }
      }

      for (const svc of targets) {
        if (svc.enabled === false) continue;
        const discovered = [];
        for (const folder of (svc.folders || [])) {
          if (fs.existsSync(folder)) {
            await this._walkRoot(folder, svc.kind, discovered);
          }
        }

        const seenPaths = new Set();
        for (let i = 0; i < discovered.length; i++) {
          const entry = discovered[i];
          if (seenPaths.has(entry.filePath)) continue;
          seenPaths.add(entry.filePath);
          this.scanState.scannedFiles += 1;
          this.scanState.currentFile = path.basename(entry.filePath);

          const res = this._parseDiscoveredFile(entry, svc);
          if (res && res.item) {
            nextServiceItems.push(res.item);
            if (!res.reused) {
              if (res.updated) updated += 1;
              else added += 1;
              this.scanState.added = added;
              this.scanState.updated = updated;
            }
          }
          if (i % 60 === 0) {
            await new Promise(r => setImmediate(r));
          }
          if (i > 0 && i % 1500 === 0) {
            const pendingOld = originalItems.filter(it => targetIds.has(it.serviceId) && !completedServiceIds.has(it.serviceId) && it.serviceId !== svc.id);
            this.items = keptOtherServices.concat(pendingOld, nextServiceItems);
            this._rebuildMaps();
          }
        }
        completedServiceIds.add(svc.id);
        svc.lastScannedAt = new Date().toISOString();
        // Publish completed service items while preserving items from services not yet scanned
        const pendingOld = originalItems.filter(it => targetIds.has(it.serviceId) && !completedServiceIds.has(it.serviceId));
        this.items = keptOtherServices.concat(pendingOld, nextServiceItems);
        this._rebuildMaps();
      }

      const prevTargetCount = originalItems.length - keptOtherServices.length;
      const seenTargetPaths = new Set(nextServiceItems.map(i => i.filePath));
      let removed = 0;
      for (const old of originalItems) {
        if (targetIds.has(old.serviceId) && !seenTargetPaths.has(old.filePath)) removed += 1;
      }

      const changed = added > 0 || updated > 0 || removed > 0 || force || prevTargetCount !== nextServiceItems.length;
      this.items = keptOtherServices.concat(nextServiceItems);
      this._rebuildMaps();
      this._writeJsonAtomic(this.configFile, this.config);
      if (changed || !fs.existsSync(this.catalogFile)) {
        this._saveCatalog();
      }

      this.scanState = {
        ...this.scanState,
        running: false,
        added,
        updated,
        removed,
        currentFile: '',
        finishedAt: new Date().toISOString(),
      };
      return { ok: true, added, updated, removed, totalItems: this.items.length, catalogRevision: this.catalogRevision, scanState: this.scanState };
    } catch (err) {
      this.scanState.running = false;
      this.scanState.lastError = err.message;
      this.scanState.finishedAt = new Date().toISOString();
      return { ok: false, error: err.message, scanState: this.scanState };
    }
  }

  startAutoWatch() {
    this._refreshWatchers();
    clearInterval(this._autoScanTimer);
    const mins = Math.max(2, Number(this.config.autoScanIntervalMinutes) || 15);
    this._autoScanTimer = setInterval(() => {
      if (!this.scanState.running) this.scan().catch(() => {});
    }, mins * 60 * 1000);
    this._autoScanTimer.unref?.();
  }

  stopAutoWatch() {
    clearInterval(this._autoScanTimer);
    clearTimeout(this._watchDebounce);
    for (const w of this._watchers.values()) { try { w.close(); } catch {} }
    this._watchers.clear();
  }

  _refreshWatchers() {
    for (const w of this._watchers.values()) { try { w.close(); } catch {} }
    this._watchers.clear();
    if (this.config.autoWatchFolders === false) return;
    for (const svc of this.config.services) {
      if (svc.enabled === false) continue;
      for (const folder of (svc.folders || [])) {
        if (!fs.existsSync(folder) || this._watchers.has(folder)) continue;
        try {
          const w = fs.watch(folder, (_evt, filename) => {
            if (!filename || String(filename).startsWith('.')) return;
            clearTimeout(this._watchDebounce);
            this._watchDebounce = setTimeout(() => {
              if (!this.scanState.running) this.scan({ serviceId: svc.id }).catch(() => {});
            }, 4000);
            this._watchDebounce.unref?.();
          });
          w.on('error', () => { try { w.close(); } catch {} this._watchers.delete(folder); });
          this._watchers.set(folder, w);
        } catch {}
      }
    }
  }

  // ── Queries, Aggregations & URL Hydration ──────────────────────────────────

  _summarizeCounts(list = this.items) {
    let movies = 0, tvEpisodes = 0, musicTracks = 0, books = 0, education = 0;
    const shows = new Set();
    const artists = new Set();
    const albums = new Set();
    for (const i of list) {
      if (i.mediaType === 'movie') movies += 1;
      else if (i.mediaType === 'tv') { tvEpisodes += 1; if (i.showName) shows.add(i.showName.toLowerCase()); }
      else if (i.mediaType === 'music') {
        musicTracks += 1;
        if (i.artist) artists.add(i.artist.toLowerCase());
        if (i.album) albums.add(`${(i.artist || '').toLowerCase()}::${i.album.toLowerCase()}`);
      } else if (i.mediaType === 'book') books += 1;
      else if (i.mediaType === 'education') education += 1;
    }
    return {
      total: list.length,
      movies,
      shows: shows.size,
      episodes: tvEpisodes,
      musicTracks,
      artists: artists.size,
      albums: albums.size,
      books,
      education,
    };
  }

  getSummary(baseUrl = '') {
    const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
    return {
      ok: true,
      serverId: this.config.serverId,
      serverName: this.config.serverName,
      hostname: os.hostname(),
      catalogRevision: this.catalogRevision,
      updatedAt: this.updatedAt,
      mcpEnabled: this.config.mcpEnabled !== false,
      mcpEndpoint: cleanBase ? `${cleanBase}/mcp` : '/mcp',
      transcodeEnabled: this.config.transcodeEnabled !== false,
      counts: this._summarizeCounts(this.items),
      services: this.listServices(),
      scanState: this.scanState,
    };
  }

  hydrateItem(item, baseUrl = '') {
    if (!item) return null;
    const b = String(baseUrl || '').replace(/\/+$/, '');
    const ext = item.ext || '.mp4';
    const prog = this.progress[item.mediaKey] || this.progress[item.id] || null;
    const directStreamUrl = `${b}/stream/${encodeURIComponent(item.id)}${ext}`;
    const transcodeUrl = (item.mediaType === 'movie' || item.mediaType === 'tv' || item.mediaType === 'education')
      ? `${b}/transcode/${encodeURIComponent(item.id)}.mp4`
      : (item.mediaType === 'music' ? `${b}/transcode-audio/${encodeURIComponent(item.id)}.mp3` : null);

    return {
      ...item,
      streamUrl: item.needsTranscode && transcodeUrl ? transcodeUrl : directStreamUrl,
      directStreamUrl,
      transcodeUrl,
      artUrl: `${b}/api/art/${encodeURIComponent(item.id)}.jpg`,
      subtitlesUrl: (item.sidecarSubtitle || item.mediaType === 'movie' || item.mediaType === 'tv')
        ? `${b}/api/subtitles/${encodeURIComponent(item.id)}.vtt`
        : null,
      readerUrl: item.mediaType === 'book' ? `${b}/books/read/${encodeURIComponent(item.id)}` : null,
      downloadUrl: `${b}/download/${encodeURIComponent(item.id)}${ext}`,
      progress: prog,
    };
  }

  queryCatalog({ type = '', types = null, serviceId = '', q = '', genre = '', year = null, limit = 0, offset = 0, baseUrl = '' } = {}) {
    const allowedTypes = Array.isArray(types) && types.length
      ? new Set(types)
      : (type ? new Set(String(type).split(',').map(s => s.trim()).filter(Boolean)) : null);

    const needle = String(q || '').trim().toLowerCase();
    const tokens = needle ? needle.split(/\s+/).filter(Boolean) : [];
    const genreLower = String(genre || '').trim().toLowerCase();
    const yearNum = year ? Number(year) : null;

    let filtered = this.items.filter(item => {
      if (allowedTypes && !allowedTypes.has(item.mediaType)) return false;
      if (serviceId && item.serviceId !== serviceId) return false;
      if (yearNum && item.year !== yearNum) return false;
      if (genreLower) {
        const gs = Array.isArray(item.genres) ? item.genres : [item.genre || ''];
        if (!gs.some(g => String(g).toLowerCase().includes(genreLower))) return false;
      }
      if (tokens.length) {
        const hay = `${item.title || ''} ${item.showName || ''} ${item.episodeCode || ''} ${item.episodeTitle || ''} ${item.artist || ''} ${item.album || ''} ${item.author || ''} ${item.courseName || ''} ${item.genre || ''} ${item.year || ''}`.toLowerCase();
        if (!tokens.every(t => hay.includes(t))) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (a.mediaType === 'tv' && b.mediaType === 'tv') {
        const sc = String(a.showName || '').localeCompare(String(b.showName || ''));
        if (sc !== 0) return sc;
        if ((a.seasonNumber || 0) !== (b.seasonNumber || 0)) return (a.seasonNumber || 0) - (b.seasonNumber || 0);
        return (a.episodeNumber || 0) - (b.episodeNumber || 0);
      }
      if (a.mediaType === 'music' && b.mediaType === 'music') {
        const ac = String(a.artist || '').localeCompare(String(b.artist || ''));
        if (ac !== 0) return ac;
        const alc = String(a.album || '').localeCompare(String(b.album || ''));
        if (alc !== 0) return alc;
        return (a.trackNumber || 0) - (b.trackNumber || 0);
      }
      return String(a.title || '').localeCompare(String(b.title || ''));
    });

    const total = filtered.length;
    const start = Math.max(0, Number(offset) || 0);
    const lim = Number(limit) > 0 ? Number(limit) : total;
    const slice = filtered.slice(start, start + lim).map(i => this.hydrateItem(i, baseUrl));
    return {
      ok: true,
      catalogRevision: this.catalogRevision,
      total,
      offset: start,
      items: slice,
    };
  }

  listShows(baseUrl = '') {
    const map = new Map();
    for (const item of this.items) {
      if (item.mediaType !== 'tv') continue;
      const key = String(item.showName || 'Unknown').toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, {
          slug: key.replace(/[^a-z0-9]+/g, '-'),
          showName: item.showName || 'Unknown',
          year: item.year || null,
          genre: item.genre || 'TV Series',
          artUrl: `${String(baseUrl || '').replace(/\/+$/, '')}/api/art/${encodeURIComponent(item.id)}.jpg`,
          seasons: new Map(),
          episodeCount: 0,
          watchedCount: 0,
        });
      }
      const show = map.get(key);
      show.episodeCount += 1;
      const prog = this.progress[item.mediaKey];
      if (prog?.completed) show.watchedCount += 1;
      const sn = item.seasonNumber || 1;
      if (!show.seasons.has(sn)) show.seasons.set(sn, []);
      show.seasons.get(sn).push(this.hydrateItem(item, baseUrl));
    }

    return [...map.values()].map(s => ({
      slug: s.slug,
      showName: s.showName,
      year: s.year,
      genre: s.genre,
      artUrl: s.artUrl,
      seasonCount: s.seasons.size,
      episodeCount: s.episodeCount,
      watchedCount: s.watchedCount,
      seasons: [...s.seasons.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([seasonNumber, eps]) => ({
          seasonNumber,
          episodeCount: eps.length,
          episodes: eps.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0)),
        })),
    })).sort((a, b) => a.showName.localeCompare(b.showName));
  }

  getShow(nameOrSlug, baseUrl = '') {
    const q = String(nameOrSlug || '').toLowerCase().trim();
    const shows = this.listShows(baseUrl);
    return shows.find(s => s.slug === q || s.showName.toLowerCase() === q)
      || shows.find(s => s.showName.toLowerCase().includes(q))
      || null;
  }

  listAlbums(baseUrl = '') {
    const map = new Map();
    for (const item of this.items) {
      if (item.mediaType !== 'music') continue;
      const key = `${(item.artist || '').toLowerCase()}::${(item.album || '').toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          album: item.album || 'Singles',
          artist: item.artist || 'Unknown Artist',
          year: item.year || null,
          genre: item.genre || 'Music',
          lossless: Boolean(item.lossless),
          artUrl: `${String(baseUrl || '').replace(/\/+$/, '')}/api/art/${encodeURIComponent(item.id)}.jpg`,
          tracks: [],
        });
      }
      map.get(key).tracks.push(this.hydrateItem(item, baseUrl));
    }
    return [...map.values()].map(a => {
      a.tracks.sort((x, y) => ((x.discNumber || 1) - (y.discNumber || 1)) || ((x.trackNumber || 0) - (y.trackNumber || 0)));
      a.trackCount = a.tracks.length;
      return a;
    }).sort((a, b) => a.artist.localeCompare(b.artist) || (a.year || 9999) - (b.year || 9999) || a.album.localeCompare(b.album));
  }

  // ── Progress & Playlists ───────────────────────────────────────────────────

  updateProgress({
    itemId,
    mediaKey,
    positionSec = 0,
    durationSec = 0,
    chapterIndex = null,
    completed = false,
    unwatched = false,
    inProgress = undefined,
    plays = undefined,
    lastPlayed = undefined,
    loved = undefined,
    lovedAt = undefined,
    dismissedFromWatchlist = undefined,
    deviceName = '',
    _persist = true,
  } = {}) {
    const item = itemId ? this.byId.get(itemId) : null;
    const key = mediaKey || (item ? item.mediaKey : itemId);
    if (!key) throw new Error('itemId or mediaKey is required');
    const prev = this.progress[key] || {};
    const now = new Date().toISOString();
    const nextLoved = loved !== undefined ? Boolean(loved) : prev.loved;
    const nextLovedAt = loved !== undefined ? (loved ? (lovedAt || now) : null) : (prev.lovedAt ?? null);
    const nextDismissed = dismissedFromWatchlist !== undefined
      ? Boolean(dismissedFromWatchlist)
      : (completed || inProgress || positionSec >= 1 ? false : prev.dismissedFromWatchlist);
    if (unwatched) {
      const entry = {
        ...prev,
        key,
        itemId: item?.id || itemId || prev.itemId || null,
        mediaType: item?.mediaType || prev.mediaType || 'movie',
        title: item?.title || prev.title || key,
        showName: item?.showName || prev.showName || '',
        seasonNumber: item?.seasonNumber ?? prev.seasonNumber ?? null,
        episodeNumber: item?.episodeNumber ?? prev.episodeNumber ?? null,
        positionSec: 0,
        progressPct: 0,
        completed: false,
        inProgress: false,
        plays: plays !== undefined ? Number(plays) || 0 : 0,
        lastPlayed: lastPlayed !== undefined ? lastPlayed : null,
        ...(nextLoved !== undefined ? { loved: nextLoved, lovedAt: nextLovedAt } : {}),
        ...(nextDismissed !== undefined ? { dismissedFromWatchlist: Boolean(nextDismissed) } : {}),
        updatedAt: now,
        deviceName: deviceName || os.hostname(),
      };
      this.progress[key] = entry;
      if (_persist) {
        this.progressRevision += 1;
        this._writeJsonAtomic(this.progressFile, this.progress);
      }
      return entry;
    }
    const pos = Math.max(0, Number(positionSec) || 0);
    const dur = Math.max(0, Number(durationSec) || Number(prev.durationSec) || Number(item?.duration) || 0);
    const done = Boolean(completed) || (dur > 60 && (pos / dur >= 0.92 || (dur - pos <= 45 && pos >= 60)));
    const activeInProgress = !done && (inProgress === true || pos >= 1 || (chapterIndex !== null && chapterIndex > 0));
    const pct = done
      ? 100
      : activeInProgress && dur > 0
        ? Math.min(99, Math.max(1, Math.round((pos / dur) * 100)))
        : (activeInProgress ? (Number(prev.progressPct) || 1) : 0);
    const entry = {
      ...prev,
      key,
      itemId: item?.id || itemId || prev.itemId || null,
      mediaType: item?.mediaType || prev.mediaType || 'movie',
      title: item?.title || prev.title || key,
      showName: item?.showName || prev.showName || '',
      seasonNumber: item?.seasonNumber ?? prev.seasonNumber ?? null,
      episodeNumber: item?.episodeNumber ?? prev.episodeNumber ?? null,
      positionSec: done ? 0 : Math.round(pos),
      durationSec: Math.round(dur),
      progressPct: pct,
      chapterIndex: chapterIndex !== null ? Number(chapterIndex) : (prev.chapterIndex ?? null),
      completed: done,
      inProgress: activeInProgress,
      plays: Math.max(Number(prev.plays) || 0, Number(plays) || (done || activeInProgress ? 1 : 0)),
      lastPlayed: lastPlayed !== undefined ? lastPlayed : (done || activeInProgress ? now : (prev.lastPlayed || null)),
      ...(nextLoved !== undefined ? { loved: nextLoved, lovedAt: nextLovedAt } : {}),
      ...(nextDismissed !== undefined ? { dismissedFromWatchlist: Boolean(nextDismissed) } : {}),
      updatedAt: now,
      deviceName: deviceName || os.hostname(),
    };
    this.progress[key] = entry;
    if (_persist) {
      this.progressRevision += 1;
      this._writeJsonAtomic(this.progressFile, this.progress);
    }
    return entry;
  }

  updateProgressBatch(items = [], { deviceName = '' } = {}) {
    if (!Array.isArray(items) || !items.length) return [];
    const out = [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      try {
        out.push(this.updateProgress({ ...raw, deviceName: raw.deviceName || deviceName, _persist: false }));
      } catch {}
    }
    if (out.length) {
      this.progressRevision += 1;
      this._writeJsonAtomic(this.progressFile, this.progress);
    }
    return out;
  }

  /**
   * Builds the grouped, ASCII-clean 10-foot Roku Cinema+ catalog:
   * - Movies (individual feature films)
   * - TV Shows (grouped `isShowGroup: true` Series with sorted `episodes` array)
   * - Optional extraItems (e.g., Tablo OTA DVR recordings)
   */
  getRokuCinemaLibrary(baseUrl = '', { extraItems = [] } = {}) {
    const b = String(baseUrl || '').replace(/\/+$/, '');
    const cleanStr = (v) => String(v || '')
      .replace(/[—–·•]/g, '-')
      .replace(/[^\x20-\x7E]+/g, '')
      .replace(/^[-_.\s]+/, '')
      .trim();

    const rokuFormatAndUrl = (it) => {
      const ext = String(it.ext || '.mp4').toLowerCase();
      const hlsUrl = `${b}/hls/${encodeURIComponent(it.id)}/index.m3u8`;
      if (['.avi', '.wmv', '.flv', '.mpg', '.mpeg', '.ts', '.m2ts'].includes(ext)) {
        return { streamFormat: 'hls', streamUrl: hlsUrl, hlsUrl };
      }
      const fmt = ext === '.mkv' ? 'mkv' : 'mp4';
      return {
        streamFormat: fmt,
        streamUrl: `${b}/stream/${encodeURIComponent(it.id)}${ext}`,
        hlsUrl,
      };
    };

    const progFor = (it) => {
      const p = this.progress[it.mediaKey] || this.progress[it.id] || null;
      if (!p) return { inProgress: false, completed: false, positionSec: 0, progressPct: 0 };
      const pos = Number(p.positionSec) || 0;
      const dur = Number(p.durationSec) || Number(it.duration) || 0;
      const pct = p.completed ? 100 : (dur > 0 ? Math.min(99, Math.max(1, Math.round((pos / dur) * 100))) : (p.inProgress ? 15 : 0));
      return {
        inProgress: Boolean(p.inProgress),
        completed: Boolean(p.completed),
        positionSec: pos,
        progressPct: pct,
      };
    };

    const movieItems = this.items
      .filter(it => it.mediaType === 'movie')
      .sort((a, bIt) => cleanStr(a.title).localeCompare(cleanStr(bIt.title)))
      .map((it, idx) => {
        const { streamFormat, streamUrl, hlsUrl } = rokuFormatAndUrl(it);
        const p = progFor(it);
        return {
          index: idx + 1,
          id: it.id,
          repTrackId: it.id,
          title: cleanStr(it.title) || 'Untitled Film',
          artist: cleanStr(it.qualityBadge || it.artist || '1080p HD'),
          album: cleanStr(it.title),
          mediaType: 'movie',
          isShowGroup: false,
          genre: cleanStr(it.genre || 'Movies & Cinema'),
          year: it.year || null,
          qualityBadge: cleanStr(it.qualityBadge || '1080p HD'),
          overview: cleanStr(it.overview || ''),
          artUrl: `${b}/api/art/${encodeURIComponent(it.id)}.jpg`,
          streamUrl,
          hlsUrl,
          streamFormat,
          ...p,
        };
      });

    const shows = this.listShows(b);
    const showItems = shows.map((sh) => {
      const flatEps = [];
      let inProgressCount = 0;
      for (const season of sh.seasons) {
        for (const ep of season.episodes) {
          const raw = this.byId.get(ep.id) || ep;
          const { streamFormat, streamUrl, hlsUrl } = rokuFormatAndUrl(raw);
          const p = progFor(raw);
          if (p.inProgress) inProgressCount += 1;
          flatEps.push({
            id: ep.id,
            repTrackId: ep.id,
            title: cleanStr(ep.title),
            seasonNumber: ep.seasonNumber || 1,
            episodeNumber: ep.episodeNumber || 1,
            episodeCode: cleanStr(ep.episodeCode || `S${String(ep.seasonNumber || 1).padStart(2, '0')}E${String(ep.episodeNumber || 1).padStart(2, '0')}`),
            episodeTitle: cleanStr(ep.episodeTitle || `Episode ${ep.episodeNumber || 1}`),
            artUrl: `${b}/api/art/${encodeURIComponent(ep.id)}.jpg`,
            streamUrl,
            hlsUrl,
            streamFormat,
            ...p,
          });
        }
      }
      const nextEp = flatEps.find(e => e.inProgress)
        || flatEps.find(e => !e.completed)
        || flatEps[0]
        || null;

      return {
        id: `show_${sh.slug}`,
        repTrackId: nextEp ? nextEp.id : `show_${sh.slug}`,
        title: cleanStr(sh.showName),
        artist: `${sh.seasonCount} Seasons - ${sh.episodeCount} Episodes`,
        album: cleanStr(sh.showName),
        mediaType: 'tv',
        isShowGroup: true,
        showName: cleanStr(sh.showName),
        seasonCount: sh.seasonCount,
        episodeCount: sh.episodeCount,
        watchedCount: sh.watchedCount || 0,
        inProgressCount,
        inProgress: inProgressCount > 0,
        progressPct: nextEp?.inProgress ? nextEp.progressPct : 0,
        positionSec: nextEp?.inProgress ? nextEp.positionSec : 0,
        episodeCode: nextEp ? nextEp.episodeCode : 'S01E01',
        episodeTitle: nextEp ? nextEp.episodeTitle : 'Episode 1',
        year: sh.year || null,
        genre: cleanStr(sh.genre || 'TV Series'),
        qualityBadge: 'HD Series',
        overview: `${cleanStr(sh.showName)} - ${sh.seasonCount} Season${sh.seasonCount === 1 ? '' : 's'}, ${sh.episodeCount} Episode${sh.episodeCount === 1 ? '' : 's'} streaming directly from RobOS Media Server.`,
        artUrl: sh.artUrl,
        streamUrl: nextEp ? nextEp.streamUrl : '',
        hlsUrl: nextEp ? nextEp.hlsUrl : '',
        streamFormat: nextEp ? nextEp.streamFormat : 'mp4',
        episodes: flatEps,
      };
    });

    return {
      rev: `${this.catalogRevision}:${this.progressRevision}`,
      counts: {
        movies: movieItems.length,
        shows: showItems.length,
        episodes: showItems.reduce((acc, s) => acc + s.episodeCount, 0),
        tablo: Array.isArray(extraItems) ? extraItems.length : 0,
      },
      items: [...movieItems, ...showItems, ...(Array.isArray(extraItems) ? extraItems : [])],
    };
  }

  getContinueItems({ limit = 20, baseUrl = '' } = {}) {
    const entries = Object.values(this.progress)
      .filter(e => e && e.inProgress)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, limit);
    return entries.map(e => {
      const item = (e.itemId && this.byId.get(e.itemId)) || this.items.find(i => i.mediaKey === e.key) || null;
      return {
        ...e,
        item: item ? this.hydrateItem(item, baseUrl) : null,
      };
    });
  }

  listPlaylists() {
    return this.playlists;
  }

  upsertPlaylist({ id, name, description = '', itemIds = [] } = {}) {
    if (!name || !String(name).trim()) throw new Error('Playlist name is required');
    const pid = id || `pl_${crypto.randomUUID().slice(0, 8)}`;
    const idx = this.playlists.findIndex(p => p.id === pid);
    const pl = {
      id: pid,
      name: String(name).trim(),
      description: String(description || ''),
      itemIds: Array.isArray(itemIds) ? itemIds : [],
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) this.playlists[idx] = pl;
    else this.playlists.push(pl);
    this._writeJsonAtomic(this.playlistsFile, this.playlists);
    return pl;
  }
}

module.exports = {
  MediaCatalogStore,
  DEFAULT_SERVICE_DEFS,
  SERVICE_KINDS,
  detectDefaultServices,
  portableMediaKey,
};
