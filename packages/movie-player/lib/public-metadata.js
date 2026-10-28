'use strict';

// Plex-Style Public Metadata & Artwork Indexer for RobOS Movie Player
//
// Strictly uses public, zero-API-key, non-AI metadata & artwork APIs:
// 1. TVmaze Public REST API (`https://api.tvmaze.com/singlesearch/shows?q=...&embed=episodes`):
//    - Official TV series posters (high-res portrait)
//    - Series plot overview / synopsis, premiere year, rating, network/streaming service, status, genres
//    - Season & episode titles, episode air dates, episode runtimes, episode summaries, and episode thumbnails
// 2. IMDb Public Suggestion API (`https://v3.sg.media-imdb.com/suggestion/<char>/<slug>.json`):
//    - Official theatrical movie posters (high-res portrait), canonical release year, IMDb ID (`tt...`), top cast
// 3. Wikipedia / Wikimedia REST API (`https://en.wikipedia.org/api/rest_v1/page/summary/...` & MediaWiki Search):
//    - Full theatrical movie plot descriptions / synopses and fallback poster artwork

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { generateArtId } = require('./track-metadata');
const { buildIndex, fold } = require('./library-index');

const USER_AGENT = 'RobOSMoviePlayer/1.0 (https://github.com/nddipiazza/robos)';

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchJson(url, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        family: 4,
        timeout: timeoutMs,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const nextUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          return fetchJson(nextUrl, timeoutMs).then(resolve);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function fetchBuffer(url, timeoutMs = 10000) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        family: 4,
        timeout: timeoutMs,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/jpeg,image/png,image/webp,image/*,*/*',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const nextUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          return fetchBuffer(nextUrl, timeoutMs).then(resolve);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        const contentType = String(res.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (buffer.length < 512) return resolve(null);
          resolve({ buffer, format: contentType });
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Resize Amazon/IMDb poster URLs to crisp 600px portrait so posters download fast and look sharp.
 */
function optimizeImdbPosterUrl(imageUrl) {
  if (!imageUrl) return null;
  return String(imageUrl).replace(/\._V1_.*?\.(jpg|png)$/i, '._V1_SX600_.$1');
}

/**
 * Fetch TV Show metadata + full episode guide from TVmaze public API.
 */
async function lookupTvShowPublicMetadata(showName) {
  const cleanName = String(showName || '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .trim();
  if (!cleanName) return null;

  let data = await fetchJson(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanName)}&embed=episodes`);
  if (!data || !data.name) {
    // Fallback without colons/subtitles
    const simpleName = cleanName.split(/[:–-]/)[0].trim();
    if (simpleName && simpleName !== cleanName) {
      data = await fetchJson(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(simpleName)}&embed=episodes`);
    }
  }
  if (!data || !data.name) return null;

  const yearMatch = /^(\d{4})/.exec(data.premiered || '');
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const overview = stripHtml(data.summary);
  const rating = data.rating && data.rating.average ? Number(data.rating.average) : null;
  const network = (data.webChannel && data.webChannel.name) || (data.network && data.network.name) || null;
  const genres = Array.isArray(data.genres) && data.genres.length ? data.genres : [];
  const posterUrl = (data.image && (data.image.original || data.image.medium)) || null;
  const mediumPosterUrl = (data.image && (data.image.medium || data.image.original)) || null;
  const averageRuntimeMin = Number(data.averageRuntime || data.runtime || 0) || null;

  const episodeMap = new Map();
  const rawEpisodes = (data._embedded && Array.isArray(data._embedded.episodes)) ? data._embedded.episodes : [];
  for (const ep of rawEpisodes) {
    if (ep.season == null || ep.number == null) continue;
    const key = `S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`;
    if (!episodeMap.has(key)) {
      episodeMap.set(key, {
        title: ep.name || null,
        seasonNumber: Number(ep.season),
        episodeNumber: Number(ep.number),
        episodeCode: key,
        airdate: ep.airdate || null,
        runtimeSec: ep.runtime ? Number(ep.runtime) * 60 : (averageRuntimeMin ? averageRuntimeMin * 60 : null),
        overview: stripHtml(ep.summary),
        stillUrl: (ep.image && (ep.image.medium || ep.image.original)) || null,
      });
    }
  }

  return {
    provider: 'tvmaze',
    externalId: data.id ? `tvmaze:${data.id}` : null,
    imdbId: data.externals?.imdb || null,
    title: data.name,
    year,
    overview,
    rating,
    network,
    status: data.status || null,
    genres,
    posterUrl: mediumPosterUrl || posterUrl,
    highResPosterUrl: posterUrl,
    averageRuntimeSec: averageRuntimeMin ? averageRuntimeMin * 60 : null,
    episodes: episodeMap,
  };
}

/**
 * Fetch Wikipedia plot summary for a Movie (by title & release year).
 */
async function lookupWikipediaMovieSummary(title, year) {
  const cleanTitle = String(title || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
  if (!cleanTitle) return null;

  const candidates = [];
  if (year) {
    candidates.push(`${cleanTitle} (${year} film)`);
  }
  candidates.push(`${cleanTitle} (film)`);
  candidates.push(cleanTitle);

  for (const cand of candidates) {
    const slug = encodeURIComponent(cand.replace(/\s+/g, '_'));
    const sum = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, 5000);
    if (sum && sum.type === 'standard' && sum.extract) {
      const descLower = String(sum.description || sum.extract || '').toLowerCase();
      if (
        cand.includes('film') ||
        descLower.includes('film') ||
        descLower.includes('movie') ||
        descLower.includes('directed by') ||
        descLower.includes('animated') ||
        descLower.includes('documentary')
      ) {
        return {
          overview: sum.extract.trim(),
          shortDescription: sum.description || null,
          posterUrl: sum.originalimage?.source || sum.thumbnail?.source || null,
        };
      }
    }
  }

  // Fallback: MediaWiki search for "<title> <year> film"
  const q = encodeURIComponent(`${cleanTitle} ${year || ''} film`.trim());
  const search = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json&srlimit=3`,
    5000
  );
  const hits = search?.query?.search || [];
  for (const hit of hits) {
    if (!hit?.title) continue;
    const slug = encodeURIComponent(hit.title.replace(/\s+/g, '_'));
    const sum = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, 5000);
    if (sum && sum.type === 'standard' && sum.extract) {
      const descLower = String(sum.description || sum.extract || '').toLowerCase();
      if (descLower.includes('film') || descLower.includes('movie') || descLower.includes('directed')) {
        return {
          overview: sum.extract.trim(),
          shortDescription: sum.description || null,
          posterUrl: sum.originalimage?.source || sum.thumbnail?.source || null,
        };
      }
    }
  }
  return null;
}

/**
 * Fetch Movie metadata + official theatrical poster from IMDb Suggestion API + Wikipedia Summary API.
 */
async function lookupMoviePublicMetadata(rawTitle, rawYear = null) {
  const cleanTitle = String(rawTitle || '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\([^)]*$/g, '')
    .trim();
  if (!cleanTitle) return null;

  const firstChar = (cleanTitle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()[0] || 'x');
  const queryWithYear = rawYear ? `${cleanTitle} ${rawYear}` : cleanTitle;

  let imdbData = await fetchJson(`https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(queryWithYear)}.json`);
  let list = (imdbData && Array.isArray(imdbData.d)) ? imdbData.d : [];
  if (!list.length && rawYear) {
    imdbData = await fetchJson(`https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(cleanTitle)}.json`);
    list = (imdbData && Array.isArray(imdbData.d)) ? imdbData.d : [];
  }

  // Pick best matching movie entry
  const movieHits = list.filter((item) => item && item.id && String(item.id).startsWith('tt'));
  let best = null;
  if (rawYear) {
    best = movieHits.find((item) => item.y === Number(rawYear) && item.i?.imageUrl)
      || movieHits.find((item) => Math.abs((item.y || 0) - Number(rawYear)) <= 1 && item.i?.imageUrl);
  }
  if (!best) {
    best = movieHits.find((item) => (item.qid === 'movie' || item.qid === 'tvMovie' || item.qid === 'video') && item.i?.imageUrl)
      || movieHits.find((item) => item.i?.imageUrl)
      || movieHits[0]
      || null;
  }

  const matchedYear = best?.y || rawYear || null;
  const matchedTitle = best?.l || cleanTitle;
  const cast = best?.s || null;
  const imdbId = best?.id || null;
  const posterUrl = optimizeImdbPosterUrl(best?.i?.imageUrl) || null;

  const wiki = await lookupWikipediaMovieSummary(matchedTitle, matchedYear);

  // Extract director from Wikipedia shortDescription ("2021 film directed by Denis Villeneuve")
  let director = null;
  if (wiki?.shortDescription) {
    const dirMatch = /directed by\s+([^,.;]+)/i.exec(wiki.shortDescription) || /film by\s+([^,.;]+)/i.exec(wiki.shortDescription);
    if (dirMatch) director = dirMatch[1].trim();
  }
  if (!director && wiki?.overview) {
    const dirMatch = /directed by\s+([A-Z][a-zA-Z\s.-]+?)(?:,\s*who|\s+and\s+written|\s+from\s+a|\.|,)/i.exec(wiki.overview);
    if (dirMatch && dirMatch[1].length < 45) director = dirMatch[1].trim();
  }

  const fallbackOverview = cast
    ? `${matchedTitle}${matchedYear ? ` (${matchedYear})` : ''} — Starring ${cast}.`
    : `${matchedTitle}${matchedYear ? ` (${matchedYear})` : ''} — Theatrical feature film.`;

  return {
    provider: 'imdb+wikipedia',
    imdbId,
    title: matchedTitle,
    year: matchedYear ? Number(matchedYear) : null,
    cast,
    director,
    overview: wiki?.overview || fallbackOverview,
    shortDescription: wiki?.shortDescription || null,
    posterUrl: posterUrl || wiki?.posterUrl || null,
  };
}

class PublicMetadataService {
  constructor({ mediaLibrary, castService, configDir } = {}) {
    this.mediaLibrary = mediaLibrary;
    this.castService = castService || null;
    this.configDir = configDir || path.join(os.homedir(), '.config', 'robos');
    this.cacheFile = path.join(this.configDir, 'movie-public-metadata-cache.json');
    this.cache = this._loadCache();
    this._running = false;
    this._cancelRequested = false;
  }

  _loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')) || { shows: {}, movies: {} };
      }
    } catch {}
    return { shows: {}, movies: {} };
  }

  _saveCache() {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch {}
  }

  isRunning() {
    return this._running;
  }

  cancel() {
    this._cancelRequested = true;
  }

  async _downloadAndStoreArt(posterUrl) {
    if (!posterUrl || !this.mediaLibrary) return null;
    const downloaded = await fetchBuffer(posterUrl);
    if (!downloaded || !downloaded.buffer) return null;
    const artId = generateArtId(downloaded.buffer);
    this.mediaLibrary.storeArt(artId, downloaded.buffer, downloaded.format || 'image/jpeg');
    return artId;
  }

  /**
   * Enriches a single TV Show (all its seasons & episodes) with TVmaze poster, show overview,
   * rating, network, genres, and per-episode titles, summaries & runtimes.
   */
  async enrichTvShow(showAlbum, { force = false } = {}) {
    const showKey = fold(showAlbum.title);
    const firstTrack = showAlbum.tracks[0];
    if (!firstTrack) return { updated: 0 };

    const alreadyHasArt = showAlbum.tracks.every((t) => t.artId && this.mediaLibrary.getArt(t.artId));
    const alreadyHasOverview = showAlbum.tracks.every((t) => t.overview && t.showOverview);
    if (!force && alreadyHasArt && alreadyHasOverview) {
      return { updated: 0, skipped: true };
    }

    let meta = await lookupTvShowPublicMetadata(showAlbum.title);
    if (!meta) return { updated: 0 };

    let showArtId = showAlbum.artId;
    if ((!showArtId || !this.mediaLibrary.getArt(showArtId) || force) && meta.posterUrl) {
      const fetchedArtId = await this._downloadAndStoreArt(meta.posterUrl);
      if (fetchedArtId) showArtId = fetchedArtId;
    }

    let updated = 0;
    for (const track of showAlbum.tracks) {
      const sNum = track.seasonNumber != null ? Number(track.seasonNumber) : 1;
      const eNum = track.episodeNumber != null ? Number(track.episodeNumber) : 1;
      const code = track.episodeCode || `S${String(sNum).padStart(2, '0')}E${String(eNum).padStart(2, '0')}`;
      const epMeta = meta.episodes.get(code) || null;

      if (showArtId && track.artId !== showArtId) {
        track.artId = showArtId;
        updated++;
      }
      if (meta.overview && track.showOverview !== meta.overview) {
        track.showOverview = meta.overview;
        updated++;
      }
      if (epMeta?.overview) {
        track.overview = epMeta.overview;
      } else if (meta.overview && !track.overview) {
        track.overview = meta.overview;
      }
      if (epMeta?.title && (!track.episodeTitle || /^Episode\s+\d+$/i.test(track.episodeTitle) || /^\d+p\b/i.test(track.episodeTitle))) {
        track.episodeTitle = epMeta.title;
        track.title = `${showAlbum.title} · ${code} · ${epMeta.title}`;
        updated++;
      }
      if (epMeta?.airdate) {
        track.airdate = epMeta.airdate;
        const epYear = /^(\d{4})/.exec(epMeta.airdate);
        if (epYear && !track.year) track.year = Number(epYear[1]);
      } else if (meta.year && !track.year) {
        track.year = meta.year;
      }
      if (!track.duration && (epMeta?.runtimeSec || meta.averageRuntimeSec)) {
        track.duration = epMeta?.runtimeSec || meta.averageRuntimeSec;
      }
      if (meta.rating && track.rating !== meta.rating) {
        track.rating = meta.rating;
      }
      if (meta.network && track.network !== meta.network) {
        track.network = meta.network;
        if (!track.composer) track.composer = meta.network;
      }
      if (meta.status) {
        track.showStatus = meta.status;
      }
      if (meta.genres && meta.genres.length) {
        const combinedGenres = ['TV Series', ...meta.genres];
        track.genre = combinedGenres.join('; ');
      }
      if (meta.imdbId) track.imdbId = meta.imdbId;
      track.metadataProvider = 'tvmaze';
      track.metadataFetchedAt = new Date().toISOString();
    }

    this.cache.shows[showKey] = {
      title: meta.title,
      year: meta.year,
      rating: meta.rating,
      network: meta.network,
      genres: meta.genres,
      overview: meta.overview,
      artId: showArtId,
      updatedAt: new Date().toISOString(),
    };

    return { updated: Math.max(1, updated), artId: showArtId, meta };
  }

  /**
   * Enriches a standalone Movie (all its video parts) with IMDb poster, Wikipedia plot synopsis,
   * release year, cast, and director.
   */
  async enrichMovie(movieAlbum, { force = false } = {}) {
    const firstTrack = movieAlbum.tracks[0];
    if (!firstTrack) return { updated: 0 };

    const alreadyHasArt = movieAlbum.tracks.every((t) => t.artId && this.mediaLibrary.getArt(t.artId));
    const alreadyHasOverview = movieAlbum.tracks.every((t) => t.overview && t.overview.length > 20);
    if (!force && alreadyHasArt && alreadyHasOverview) {
      return { updated: 0, skipped: true };
    }

    const cleanTitle = String(firstTrack.title || movieAlbum.title || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
    const movieKey = fold(`${cleanTitle} ${firstTrack.year || movieAlbum.year || ''}`);

    const meta = await lookupMoviePublicMetadata(cleanTitle, firstTrack.year || movieAlbum.year);
    if (!meta) return { updated: 0 };

    let movieArtId = movieAlbum.artId;
    if ((!movieArtId || !this.mediaLibrary.getArt(movieArtId) || force) && meta.posterUrl) {
      const fetchedArtId = await this._downloadAndStoreArt(meta.posterUrl);
      if (fetchedArtId) movieArtId = fetchedArtId;
    }

    let updated = 0;
    for (const track of movieAlbum.tracks) {
      if (movieArtId && track.artId !== movieArtId) {
        track.artId = movieArtId;
        updated++;
      }
      if (meta.overview && track.overview !== meta.overview) {
        track.overview = meta.overview;
        updated++;
      }
      if (meta.year && !track.year) {
        track.year = meta.year;
        updated++;
      }
      if (meta.cast && track.cast !== meta.cast) {
        track.cast = meta.cast;
      }
      if (meta.director && !track.composer) {
        track.composer = meta.director;
        track.director = meta.director;
      }
      if (meta.imdbId) {
        track.imdbId = meta.imdbId;
      }
      track.metadataProvider = 'imdb+wikipedia';
      track.metadataFetchedAt = new Date().toISOString();
    }

    this.cache.movies[movieKey] = {
      title: meta.title,
      year: meta.year,
      imdbId: meta.imdbId,
      cast: meta.cast,
      director: meta.director,
      overview: meta.overview,
      artId: movieArtId,
      updatedAt: new Date().toISOString(),
    };

    return { updated: Math.max(1, updated), artId: movieArtId, meta };
  }

  /**
   * File-by-file / Show-by-Show Plex-style metadata & artwork sync across the library (or a subset of tracks).
   */
  async syncAll({ trackIds = null, force = false, onProgress = null } = {}) {
    if (this._running) {
      return { ok: false, error: 'Metadata fetch is already running' };
    }
    this._running = true;
    this._cancelRequested = false;

    try {
      const allTracks = this.mediaLibrary.tracks || [];
      const targetTracks = Array.isArray(trackIds) && trackIds.length
        ? allTracks.filter((t) => trackIds.includes(t.id))
        : allTracks;

      const index = buildIndex(targetTracks);
      const items = [
        ...index.tvShows.map((s) => ({ kind: 'tv', album: s })),
        ...index.moviesOnly.map((m) => ({ kind: 'movie', album: m })),
      ];

      const total = items.length;
      let current = 0;
      let updatedShows = 0;
      let updatedMovies = 0;
      let updatedTracks = 0;

      for (const item of items) {
        if (this._cancelRequested) break;
        current++;
        const label = item.album.title;
        if (typeof onProgress === 'function') {
          onProgress({
            current,
            total,
            title: label,
            kind: item.kind,
            message: item.kind === 'tv'
              ? `Fetching TV Show poster & episode guide for "${label}" (${current}/${total})…`
              : `Fetching Movie poster & plot synopsis for "${label}" (${current}/${total})…`,
          });
        }

        try {
          if (item.kind === 'tv') {
            const res = await this.enrichTvShow(item.album, { force });
            if (res.updated > 0) {
              updatedShows++;
              updatedTracks += item.album.tracks.length;
            }
          } else {
            const res = await this.enrichMovie(item.album, { force });
            if (res.updated > 0) {
              updatedMovies++;
              updatedTracks += item.album.tracks.length;
            }
          }
        } catch (err) {
          console.warn(`[PublicMetadata] Error enriching ${label}:`, err.message);
        }

        // Persist incrementally every 8 items so artwork and descriptions appear live
        if (current % 8 === 0) {
          this.mediaLibrary._rebuildIndexes();
          this.mediaLibrary._saveCache();
          this._saveCache();
        }
      }

      this.mediaLibrary._rebuildIndexes();
      this.mediaLibrary._saveCache();
      this._saveCache();
      if (this.castService && typeof this.castService._saveStreamServerEndpoint === 'function') {
        this.castService._saveStreamServerEndpoint();
      }

      return {
        ok: true,
        canceled: this._cancelRequested,
        totalItems: total,
        updatedShows,
        updatedMovies,
        showsMatched: updatedShows,
        moviesMatched: updatedMovies,
        updatedTracks,
      };
    } finally {
      this._running = false;
    }
  }
}

module.exports = {
  PublicMetadataService,
  lookupTvShowPublicMetadata,
  lookupMoviePublicMetadata,
  lookupWikipediaMovieSummary,
  stripHtml,
};
