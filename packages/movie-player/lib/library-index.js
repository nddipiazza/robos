/**
 * High-speed in-memory library indexer and query engine for RobOS Movie Player.
 *
 * Designed for 100,000+ movies, episodes, and video clips:
 *   - Pre-computes lowercase search haystack per item once on ingest
 *   - Builds Collections/Series (albums), Directors/Creators (artists), Genres, Decades,
 *     Studios/Writers (composers), and Folders maps in a single O(N) pass
 *   - Supports sub-15ms filtered + sorted + paginated queries (`queryTracks`)
 *   - Tracks play counts, last-watched timestamps, and Loved/Watchlist status
 */

const path = require('path');

class LibraryIndex {
  constructor() {
    this.tracks = [];
    this.byId = new Map();
    this.byPath = new Map();
    this.albums = [];
    this.artists = [];
    this.genres = [];
    this.decades = [];
    this.composers = [];
    this.folders = [];
    this.stats = new Map(); // trackId -> { playCount, lastPlayed, loved, rating, resumeTime }
    this.dirty = true;
  }

  loadStats(statsObj = {}) {
    this.stats.clear();
    for (const [id, s] of Object.entries(statsObj || {})) {
      this.stats.set(id, {
        playCount: Number(s.playCount) || 0,
        lastPlayed: Number(s.lastPlayed) || 0,
        loved: Boolean(s.loved),
        rating: Number(s.rating) || 0,
        resumeTime: Number(s.resumeTime) || 0
      });
    }
  }

  exportStats() {
    const out = {};
    for (const [id, s] of this.stats.entries()) {
      if (s.playCount || s.lastPlayed || s.loved || s.rating || s.resumeTime) {
        out[id] = s;
      }
    }
    return out;
  }

  decorateTrack(t) {
    const st = this.stats.get(t.id);
    t.playCount = st ? st.playCount : (t.playCount || 0);
    t.lastPlayed = st ? st.lastPlayed : (t.lastPlayed || 0);
    t.loved = st ? Boolean(st.loved) : Boolean(t.loved);
    t.rating = st ? st.rating : (t.rating || 0);
    t.resumeTime = st ? st.resumeTime : (t.resumeTime || 0);
    t._q = `${t.title || ''}\t${t.artist || ''}\t${t.album || ''}\t${t.genre || ''}\t${t.composer || ''}\t${t.year || ''}\t${t.resolution || ''}\t${t.videoCodec || ''}`.toLowerCase();
    return t;
  }

  setTracks(tracks = []) {
    this.tracks = [];
    this.byId.clear();
    this.byPath.clear();
    for (let i = 0; i < tracks.length; i++) {
      const raw = tracks[i];
      if (!raw || !raw.path) continue;
      if (raw.picture && typeof raw.picture === 'string') {
        delete raw.picture;
      }
      this.decorateTrack(raw);
      this.tracks.push(raw);
      this.byId.set(raw.id, raw);
      this.byPath.set(raw.path, raw);
    }
    this.rebuildAggregates();
  }

  upsertTracks(newTracks = []) {
    let added = 0;
    let updated = 0;
    for (let i = 0; i < newTracks.length; i++) {
      const t = newTracks[i];
      if (!t || !t.path) continue;
      if (t.picture && typeof t.picture === 'string') delete t.picture;
      this.decorateTrack(t);
      const existing = this.byPath.get(t.path) || this.byId.get(t.id);
      if (existing) {
        Object.assign(existing, t);
        this.decorateTrack(existing);
        this.byId.set(existing.id, existing);
        this.byPath.set(existing.path, existing);
        updated++;
      } else {
        this.tracks.push(t);
        this.byId.set(t.id, t);
        this.byPath.set(t.path, t);
        added++;
      }
    }
    if (added > 0 || updated > 0) this.rebuildAggregates();
    return { added, updated, total: this.tracks.length };
  }

  removeByPredicate(pred) {
    const next = [];
    let removed = 0;
    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i];
      if (pred(t)) {
        this.byId.delete(t.id);
        this.byPath.delete(t.path);
        removed++;
      } else {
        next.push(t);
      }
    }
    if (removed > 0) {
      this.tracks = next;
      this.rebuildAggregates();
    }
    return removed;
  }

  recordPlay(trackId) {
    const cur = this.stats.get(trackId) || { playCount: 0, lastPlayed: 0, loved: false, rating: 0, resumeTime: 0 };
    cur.playCount = (cur.playCount || 0) + 1;
    cur.lastPlayed = Date.now();
    this.stats.set(trackId, cur);
    const t = this.byId.get(trackId);
    if (t) {
      t.playCount = cur.playCount;
      t.lastPlayed = cur.lastPlayed;
    }
    return cur;
  }

  toggleLoved(trackId, loved) {
    const cur = this.stats.get(trackId) || { playCount: 0, lastPlayed: 0, loved: false, rating: 0, resumeTime: 0 };
    cur.loved = typeof loved === 'boolean' ? loved : !cur.loved;
    this.stats.set(trackId, cur);
    const t = this.byId.get(trackId);
    if (t) t.loved = cur.loved;
    return cur;
  }

  rebuildAggregates() {
    const albumMap = new Map();
    const artistMap = new Map();
    const genreMap = new Map();
    const decadeMap = new Map();
    const composerMap = new Map();
    const folderMap = new Map();

    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i];
      const albumName = t.album || 'Standalone Films';
      const artistName = t.artist || 'Unknown Director';
      const albumArtist = t.albumArtist || artistName;
      const genreName = t.genre || 'Cinema';
      const albumKey = albumName.toLowerCase();

      let alb = albumMap.get(albumKey);
      if (!alb) {
        alb = {
          key: albumKey,
          name: albumName,
          artist: albumArtist,
          year: t.year || null,
          genre: genreName,
          artId: t.artId || null,
          trackCount: 0,
          duration: 0,
          addedAt: t.addedAt || 0,
          sampleTrackId: t.id
        };
        albumMap.set(albumKey, alb);
      }
      alb.trackCount++;
      alb.duration += t.duration || 0;
      if (!alb.artId && t.artId) alb.artId = t.artId;
      if (!alb.year && t.year) alb.year = t.year;
      if ((t.addedAt || 0) > alb.addedAt) alb.addedAt = t.addedAt;

      const artKey = artistName.toLowerCase();
      let art = artistMap.get(artKey);
      if (!art) {
        art = {
          key: artKey,
          name: artistName,
          artId: t.artId || null,
          trackCount: 0,
          albumSet: new Set(),
          duration: 0,
          genre: genreName
        };
        artistMap.set(artKey, art);
      }
      art.trackCount++;
      art.duration += t.duration || 0;
      art.albumSet.add(albumKey);
      if (!art.artId && t.artId) art.artId = t.artId;

      const gKey = genreName.toLowerCase();
      let g = genreMap.get(gKey);
      if (!g) {
        g = { key: gKey, name: genreName, trackCount: 0, duration: 0, artId: t.artId || null };
        genreMap.set(gKey, g);
      }
      g.trackCount++;
      g.duration += t.duration || 0;
      if (!g.artId && t.artId) g.artId = t.artId;

      if (t.year && t.year >= 1900 && t.year <= 2100) {
        const dec = `${Math.floor(t.year / 10) * 10}s`;
        let d = decadeMap.get(dec);
        if (!d) {
          d = { key: dec, name: dec, decade: Math.floor(t.year / 10) * 10, trackCount: 0, duration: 0, artId: t.artId || null };
          decadeMap.set(dec, d);
        }
        d.trackCount++;
        d.duration += t.duration || 0;
        if (!d.artId && t.artId) d.artId = t.artId;
      }

      if (t.composer) {
        const cKey = t.composer.toLowerCase();
        let c = composerMap.get(cKey);
        if (!c) {
          c = { key: cKey, name: t.composer, trackCount: 0, duration: 0, artId: t.artId || null };
          composerMap.set(cKey, c);
        }
        c.trackCount++;
        c.duration += t.duration || 0;
        if (!c.artId && t.artId) c.artId = t.artId;
      }

      const folderPath = t.source === 'cloud'
        ? `cloud://${t.sourceId}/${path.posix.dirname(t.remotePath || '')}`
        : path.dirname(t.path || '');
      let f = folderMap.get(folderPath);
      if (!f) {
        f = {
          path: folderPath,
          name: path.basename(folderPath) || folderPath,
          source: t.source || 'local',
          sourceId: t.sourceId || null,
          trackCount: 0,
          duration: 0
        };
        folderMap.set(folderPath, f);
      }
      f.trackCount++;
      f.duration += t.duration || 0;
    }

    this.albums = Array.from(albumMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.artists = Array.from(artistMap.values())
      .map(a => ({
        key: a.key,
        name: a.name,
        artId: a.artId,
        trackCount: a.trackCount,
        albumCount: a.albumSet.size,
        duration: a.duration,
        genre: a.genre
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.genres = Array.from(genreMap.values()).sort((a, b) => b.trackCount - a.trackCount);
    this.decades = Array.from(decadeMap.values()).sort((a, b) => a.decade - b.decade);
    this.composers = Array.from(composerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.folders = Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.dirty = false;
  }

  getSummary() {
    let totalDuration = 0;
    let totalSize = 0;
    let cloudCount = 0;
    let lovedCount = 0;
    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i];
      totalDuration += t.duration || 0;
      totalSize += t.size || 0;
      if (t.source === 'cloud') cloudCount++;
      if (t.loved) lovedCount++;
    }
    return {
      trackCount: this.tracks.length,
      albumCount: this.albums.length,
      artistCount: this.artists.length,
      genreCount: this.genres.length,
      decadeCount: this.decades.length,
      composerCount: this.composers.length,
      folderCount: this.folders.length,
      cloudCount,
      lovedCount,
      totalDuration,
      totalSize
    };
  }

  /**
   * Filter, sort, and slice tracks in memory.
   */
  queryTracks(opts = {}) {
    const {
      search = '',
      artist = null,
      album = null,
      albumKey = null,
      genre = null,
      decade = null,
      composer = null,
      folder = null,
      source = null,
      sourceId = null,
      smartFilter = null, // 'loved' | 'recent-added' | 'recent-played' | 'most-played' | 'cloud'
      sortBy = 'title',
      sortDir = 'asc',
      offset = 0,
      limit = 500,
      idsOnly = false
    } = opts;

    const tokens = String(search || '')
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const artistLower = artist ? String(artist).toLowerCase() : null;
    const albumLower = album ? String(album).toLowerCase() : null;
    const genreLower = genre ? String(genre).toLowerCase() : null;
    const composerLower = composer ? String(composer).toLowerCase() : null;
    const decadeNum = decade ? parseInt(String(decade), 10) : null;

    const matched = [];
    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i];
      if (tokens.length > 0) {
        const hay = t._q || '';
        let ok = true;
        for (let k = 0; k < tokens.length; k++) {
          if (hay.indexOf(tokens[k]) === -1) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      if (artistLower && (t.artist || '').toLowerCase() !== artistLower && (t.albumArtist || '').toLowerCase() !== artistLower) continue;
      if (albumLower && (t.album || '').toLowerCase() !== albumLower) continue;
      if (albumKey) {
        const tk = (t.album || 'Standalone Films').toLowerCase();
        if (tk !== albumKey && `${tk}::${(t.albumArtist || t.artist || 'Unknown Director').toLowerCase()}` !== albumKey) continue;
      }
      if (genreLower && (t.genre || '').toLowerCase() !== genreLower) continue;
      if (composerLower && (t.composer || '').toLowerCase() !== composerLower) continue;
      if (decadeNum && (!t.year || Math.floor(t.year / 10) * 10 !== decadeNum)) continue;
      if (folder) {
        const fp = t.source === 'cloud'
          ? `cloud://${t.sourceId}/${path.posix.dirname(t.remotePath || '')}`
          : path.dirname(t.path || '');
        if (fp !== folder && !fp.startsWith(folder + '/')) continue;
      }
      if (source && (t.source || 'local') !== source) continue;
      if (sourceId && t.sourceId !== sourceId) continue;

      if (smartFilter === 'loved' && !t.loved) continue;
      if (smartFilter === 'cloud' && t.source !== 'cloud') continue;
      if (smartFilter === 'recent-played' && !(t.lastPlayed > 0)) continue;
      if (smartFilter === 'most-played' && !(t.playCount > 0)) continue;

      matched.push(t);
    }

    let effectiveSort = sortBy;
    let effectiveDir = sortDir;
    if (smartFilter === 'recent-added' && sortBy === 'title') {
      effectiveSort = 'addedAt';
      effectiveDir = 'desc';
    } else if (smartFilter === 'recent-played' && sortBy === 'title') {
      effectiveSort = 'lastPlayed';
      effectiveDir = 'desc';
    } else if (smartFilter === 'most-played' && sortBy === 'title') {
      effectiveSort = 'playCount';
      effectiveDir = 'desc';
    }

    const dirMul = effectiveDir === 'desc' ? -1 : 1;
    matched.sort((a, b) => {
      switch (effectiveSort) {
        case 'artist':
          return dirMul * ((a.artist || '').localeCompare(b.artist || '') || (a.album || '').localeCompare(b.album || '') || (a.trackNumber || 0) - (b.trackNumber || 0));
        case 'album':
          return dirMul * ((a.album || '').localeCompare(b.album || '') || (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0));
        case 'genre':
          return dirMul * ((a.genre || '').localeCompare(b.genre || '') || (a.title || '').localeCompare(b.title || ''));
        case 'year':
          return dirMul * ((a.year || 0) - (b.year || 0));
        case 'duration':
          return dirMul * ((a.duration || 0) - (b.duration || 0));
        case 'addedAt':
          return dirMul * ((a.addedAt || 0) - (b.addedAt || 0));
        case 'lastPlayed':
          return dirMul * ((a.lastPlayed || 0) - (b.lastPlayed || 0));
        case 'playCount':
          return dirMul * ((a.playCount || 0) - (b.playCount || 0));
        case 'trackNumber':
          return dirMul * (((a.discNumber || 1) - (b.discNumber || 1)) || ((a.trackNumber || 0) - (b.trackNumber || 0)));
        case 'title':
        default:
          return dirMul * (a.title || '').localeCompare(b.title || '');
      }
    });

    const total = matched.length;
    const start = Math.max(0, Number(offset) || 0);
    const end = limit > 0 ? Math.min(total, start + Number(limit)) : total;
    const slice = matched.slice(start, end);

    return {
      total,
      offset: start,
      limit: end - start,
      tracks: idsOnly ? slice.map(t => t.id) : slice
    };
  }
}

module.exports = { LibraryIndex };
