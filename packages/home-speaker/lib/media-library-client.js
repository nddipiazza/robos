'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

class MediaLibraryClient {
  constructor(options = {}) {
    this.configDir = options.configDir || path.join(os.homedir(), '.config', 'robos');
    this.libraryFile = path.join(this.configDir, 'audio-library.json');
    this.tracks = [];
    this.artists = new Map();
    this.albums = new Map();
    this.lastLoaded = 0;

    this.reload();
  }

  reload() {
    try {
      if (fs.existsSync(this.libraryFile)) {
        const raw = fs.readFileSync(this.libraryFile, 'utf8');
        const data = JSON.parse(raw);
        this.tracks = Array.isArray(data.tracks) ? data.tracks : [];
        this._rebuildIndexes();
        this.lastLoaded = Date.now();
      } else {
        this.tracks = [];
      }
    } catch (err) {
      console.warn('[MediaLibraryClient] Failed to load library:', err.message);
      this.tracks = [];
    }
    return this.tracks;
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

  getTracks(limit = 100) {
    this.reload();
    return this.tracks.slice(0, limit);
  }

  getTrackById(id) {
    this.reload();
    return this.tracks.find(t => t.id === id);
  }

  findTrack(query) {
    this.reload();
    if (!query) return null;
    const q = query.toLowerCase().trim();
    return this.tracks.find(t => 
      t.id === query ||
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.filePath && t.filePath.toLowerCase().includes(q))
    );
  }

  search(query, limit = 50) {
    this.reload();
    if (!query || !query.trim()) {
      return this.tracks.slice(0, limit);
    }
    const q = query.toLowerCase().trim();
    return this.tracks.filter(t => {
      const title = (t.title || '').toLowerCase();
      const artist = (t.artist || '').toLowerCase();
      const album = (t.album || '').toLowerCase();
      const file = (t.filePath || '').toLowerCase();
      return title.includes(q) || artist.includes(q) || album.includes(q) || file.includes(q);
    }).slice(0, limit);
  }

  listAlbums() {
    this.reload();
    const result = [];
    for (const [albumName, tracks] of this.albums.entries()) {
      result.push({
        album: albumName,
        artist: tracks[0]?.artist || 'Unknown Artist',
        year: tracks[0]?.year || null,
        trackCount: tracks.length,
        tracks: tracks.map(t => ({ id: t.id, title: t.title, duration: t.duration, trackNumber: t.trackNumber }))
      });
    }
    return result;
  }
}

module.exports = { MediaLibraryClient };
