'use strict';

/**
 * RobOS Universal Watch & Play History Importer
 * ---------------------------------------------
 * Imports watch & play history files exported from:
 *   1. Plex Watch History JSON (`{ exportedAt, server, accounts, history: [...] }`)
 *   2. Raw Plex Media Server API JSON (`MediaContainer.Metadata` / `Video`)
 *   3. Tautulli / Jellyfin / Trakt / Generic JSON arrays or objects
 *   4. RobOS Portable Media History JSON (`robos-media-history/1`)
 *   5. CSV / TSV watch logs (Letterboxd `watched.csv`, Trakt CSV, Tautulli CSV)
 *
 * Updates:
 *   - RobOS Movie Player (`movie-track-stats.json` + `media-history/movie-player.json` + live UI)
 *   - RobOS Audio Player (`audio-track-stats.json` + `media-history/audio-player.json`)
 *   - RobOS Media Server (`POST /api/progress` batch sync so Roku TV & LAN clients match)
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const historyLib = require('./media-history');

function configDirOf(opts = {}) {
  return opts.configDir || process.env.ROBOS_CONFIG_DIR || path.join(opts.homeDir || process.env.HOME || os.homedir(), '.config', 'robos');
}

// ── Canonical Title & Show Matching ──────────────────────────────────────────

function extractYearTag(str) {
  const m = String(str || '').match(/\(\s*((?:19|20)\d{2})(?:\s*[-–—]\s*(?:19|20)?\d{2,4})?\s*\)/);
  if (m) return Number(m[1]);
  const trailing = String(str || '').match(/\b((?:19|20)\d{2})\b(?:\s+S\d{1,2}|\s+Season|\s*$)/i);
  return trailing ? Number(trailing[1]) : null;
}

/**
 * Produces a clean canonical TV show key that unifies folder naming noise:
 *   "House (2004) Season 1-8 S01-S08" -> "house"
 *   "House, M D Season 2"             -> "house md" (plus alias "house")
 *   "Big Brother (US)" / "Big Brother US" -> "big brother" (with region "us")
 *   "Stargate SG-1" / "Stargate SG1"  -> "stargate sg1"
 *   "Travelers (2016)" / "Travelers S01" -> "travelers"
 */
function canonicalShowParts(rawName) {
  let s = String(rawName || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  const year = extractYearTag(s);
  const regionMatch = s.match(/(?:\(\s*(US|UK|AU|CA)\s*\)|\b(US|UK|AU)\s*$)/i);
  const region = regionMatch ? (regionMatch[1] || regionMatch[2]).toLowerCase() : null;

  // Remove parenthesized years, regions, language tags
  s = s
    .replace(/\(\s*(?:19|20)\d{2}(?:\s*[-–—]\s*(?:19|20)?\d{2,4})?\s*\)/g, ' ')
    .replace(/\(\s*(?:US|UK|AU|CA|Eng|English|Sub|Dub)\s*\)/gi, ' ')
    // Strip multi-season / folder release suffixes ("Season 1-8 S01-S08", "Complete Series...", "S01", "Season 1 to 26 Mp4")
    .replace(/\bcomplete\s+series\b.*$/i, ' ')
    .replace(/\bseasons?\s+\d+.*$/i, ' ')
    .replace(/\bs\d{1,2}(?:\s*[-–—]\s*s?\d{1,2}|extra)?\b.*$/i, ' ')
    .replace(/\b(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}\b.*$/g, ' ')
    .replace(/\b(?:19|20)\d{2}\s*$/g, ' ')
    .replace(/\b(?:us|uk)\s*$/i, ' ')
    // Collapse SG-1 -> sg1, M.D. / M D -> md
    .replace(/\bsg[\s-]*(\d+)\b/gi, 'sg$1')
    .replace(/\bm[\s.,]*d\.?\b/gi, 'md')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const aliases = new Set([s]);
  const noThe = s.replace(/^the\s+/, '').trim();
  if (noThe) aliases.add(noThe);
  // "house md" <-> "house"
  if (s.endsWith(' md') && s.length > 5) {
    aliases.add(s.slice(0, -3).trim());
  }

  return {
    base: s,
    year,
    region,
    aliases: [...aliases].filter(Boolean),
  };
}

function canonicalMovieTitle(rawTitle) {
  return String(rawTitle || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\s*(?:19|20)\d{2}\s*\)\s*$/, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalAudioPart(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\s*(?:remaster(?:ed)?|deluxe|expanded|bonus|anniversary|explicit|edition)[^)]*\)/gi, ' ')
    .replace(/\[\s*(?:remaster(?:ed)?|deluxe|expanded|bonus)[^\]]*\]/gi, ' ')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTimestampToIso(val) {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') {
    // Unix seconds vs milliseconds
    const ms = val < 1e11 ? val * 1000 : val;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s);
    const ms = n < 1e11 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseYear(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number' && val >= 1880 && val <= 2100) return val;
  const m = String(val).match(/\b((?:19|20)\d{2})\b/);
  return m ? Number(m[1]) : null;
}

// ── CSV Parser (Quoted fields supported) ─────────────────────────────────────

function parseCsvRows(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const delim = lines[0].includes('\t') && !lines[0].includes(',') ? '\t' : ',';

  const splitRow = (line) => {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delim && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const headers = splitRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitRow(lines[i]);
    if (!vals.some(Boolean)) continue;
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = vals[idx] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

// ── Normalizing Raw Import Records ───────────────────────────────────────────

function normalizeRawEvent(raw, { serverName = '' } = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const rawType = String(raw.type || raw.mediaType || raw.media_type || raw.kind || '').toLowerCase().trim();
  const libName = String(raw.library || raw.section || raw.library_name || '').toLowerCase();

  let kind = null;
  if (rawType === 'episode' || rawType === 'tv' || rawType === 'show') kind = 'tv';
  else if (rawType === 'movie' || rawType === 'film') kind = 'movie';
  else if (rawType === 'track' || rawType === 'audio' || rawType === 'song' || rawType === 'music') kind = 'audio';
  else if (libName.includes('music')) kind = 'audio';
  else if (libName.includes('tv') || raw.show || raw.showName || raw.grandparentTitle || raw.grandparent_title || raw.series_name || (raw.show_or_artist && raw.season != null && raw.episode != null)) kind = 'tv';
  else kind = 'movie';

  const account = String(raw.account || raw.user || raw.username || raw.friendly_name || raw.by || '').trim() || null;
  const viewedAt = parseTimestampToIso(
    raw.viewedAt ?? raw.watched_at ?? raw.watchedAt ?? raw.lastViewedAt ?? raw.lastPlayed ?? raw.played_at ?? raw.watched_date ?? raw.date ?? raw.updatedAt
  );

  // Position / duration (Plex uses milliseconds in viewOffset/duration, RobOS uses seconds)
  let positionSec = 0;
  let durationSec = 0;
  if (raw.positionSec !== undefined) positionSec = Math.max(0, Math.round(Number(raw.positionSec) || 0));
  else if (raw.viewOffset !== undefined || raw.view_offset !== undefined) {
    positionSec = Math.max(0, Math.round((Number(raw.viewOffset ?? raw.view_offset) || 0) / 1000));
  }
  if (raw.durationSec !== undefined) durationSec = Math.max(0, Math.round(Number(raw.durationSec) || 0));
  else if (raw.duration !== undefined) {
    const dNum = Number(raw.duration) || 0;
    durationSec = dNum > 36000 ? Math.round(dNum / 1000) : Math.round(dNum);
  }

  const explicitInProgress = raw.inProgress === true || (raw.completed === false && positionSec >= 1);
  const completed = raw.completed !== undefined
    ? Boolean(raw.completed)
    : !explicitInProgress;

  const plays = Math.max(1, Number(raw.plays ?? raw.viewCount ?? raw.play_count) || 1);
  const loved = raw.loved !== undefined ? Boolean(raw.loved) : undefined;
  const sourceLabel = serverName
    ? (account ? `Plex (${account})` : `Plex (${serverName})`)
    : (account || 'Watch History Import');

  if (kind === 'tv') {
    const show = String(
      raw.show_or_artist || raw.show || raw.showName || raw.grandparentTitle || raw.grandparent_title || raw.series_name || raw.series || ''
    ).trim();
    const season = raw.season ?? raw.seasonNumber ?? raw.parentIndex ?? raw.parent_media_index;
    const episode = raw.episode ?? raw.episodeNumber ?? raw.index ?? raw.media_index;
    const sNum = season !== null && season !== undefined && season !== '' ? Number(season) : null;
    const eNum = episode !== null && episode !== undefined && episode !== '' ? Number(episode) : null;
    if (!show || !Number.isFinite(sNum) || !Number.isFinite(eNum)) return null;
    return {
      kind: 'tv',
      show,
      season: sNum,
      episode: eNum,
      episodeTitle: String(raw.episodeTitle || raw.title || '').trim() || null,
      year: parseYear(raw.released || raw.originallyAvailableAt || raw.year) || extractYearTag(show),
      viewedAt,
      account,
      sourceLabel,
      completed,
      inProgress: !completed && (explicitInProgress || positionSec >= 1),
      positionSec: completed ? 0 : positionSec,
      durationSec,
      plays,
      loved,
    };
  }

  if (kind === 'audio') {
    const artist = String(raw.show_or_artist || raw.artist || raw.grandparentTitle || raw.grandparent_title || '').trim();
    const album = String(raw.season_or_album || raw.album || raw.parentTitle || raw.parent_title || '').trim();
    const title = String(raw.title || raw.track || '').trim();
    if (!title) return null;
    return {
      kind: 'audio',
      artist,
      album,
      title,
      trackNumber: raw.episode != null ? Number(raw.episode) : (raw.trackNumber != null ? Number(raw.trackNumber) : null),
      discNumber: raw.season != null ? Number(raw.season) : (raw.discNumber != null ? Number(raw.discNumber) : null),
      viewedAt,
      account,
      sourceLabel,
      completed: true,
      inProgress: false,
      positionSec: 0,
      durationSec,
      plays,
      loved,
    };
  }

  const title = String(raw.title || raw.name || raw.movie || raw.film || '').trim();
  if (!title) return null;
  return {
    kind: 'movie',
    title,
    year: parseYear(raw.year ?? raw.released ?? raw.originallyAvailableAt) || extractYearTag(title),
    viewedAt,
    account,
    sourceLabel,
    completed,
    inProgress: !completed && (explicitInProgress || positionSec >= 1),
    positionSec: completed ? 0 : positionSec,
    durationSec,
    plays,
    loved,
  };
}

/**
 * Parses a watch history file or payload into normalized events + metadata.
 */
function parseWatchHistoryPayload(input, { filePath = '', account = null } = {}) {
  let raw = input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) throw new Error('Watch history file is empty.');
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || filePath.toLowerCase().endsWith('.json')) {
      raw = JSON.parse(trimmed);
    } else {
      raw = parseCsvRows(trimmed);
    }
  }

  let format = 'generic';
  let serverName = '';
  let exportedAt = null;
  let rawItems = [];
  const discoveredAccounts = new Set();

  if (Array.isArray(raw)) {
    rawItems = raw;
  } else if (raw && typeof raw === 'object') {
    if (raw.format === 'robos-media-history/1' && raw.entries && typeof raw.entries === 'object') {
      format = 'robos-media-history';
      exportedAt = raw.updatedAt || null;
      rawItems = Object.values(raw.entries);
    } else if (Array.isArray(raw.history)) {
      format = raw.server ? 'plex-watch-history' : 'json-history';
      serverName = String(raw.server || '').trim();
      exportedAt = raw.exportedAt || null;
      if (Array.isArray(raw.accounts)) raw.accounts.forEach(a => a && discoveredAccounts.add(String(a)));
      rawItems = raw.history;
    } else if (raw.MediaContainer && Array.isArray(raw.MediaContainer.Metadata || raw.MediaContainer.Video)) {
      format = 'plex-media-container';
      serverName = String(raw.MediaContainer.friendlyName || raw.MediaContainer.title1 || 'Plex').trim();
      rawItems = raw.MediaContainer.Metadata || raw.MediaContainer.Video;
    } else {
      const arrKey = ['items', 'entries', 'watches', 'plays', 'records', 'data', 'rows'].find(k => Array.isArray(raw[k]));
      if (arrKey) {
        rawItems = raw[arrKey];
      } else {
        throw new Error('Unrecognized watch history JSON structure. Expected a `history` / `items` / `entries` array or RobOS media-history document.');
      }
    }
  } else {
    throw new Error('Unsupported watch history input.');
  }

  const accountFilter = account && String(account).trim() && String(account).toLowerCase() !== 'all'
    ? String(account).trim().toLowerCase()
    : null;

  const events = [];
  for (const item of rawItems) {
    const ev = normalizeRawEvent(item, { serverName });
    if (!ev) continue;
    if (ev.account) discoveredAccounts.add(ev.account);
    if (accountFilter && String(ev.account || '').toLowerCase() !== accountFilter) continue;
    events.push(ev);
  }

  return {
    format,
    serverName: serverName || null,
    exportedAt,
    accounts: [...discoveredAccounts],
    totalRawItems: rawItems.length,
    events,
  };
}

// ── Aggregating Event Streams Into Unique Media Items ────────────────────────

function aggregateWatchEvents(events = []) {
  // Detect which TV show base names appear with multiple DISTINCT explicit years inside the import itself
  // (e.g. "Avatar: The Last Airbender" vs "Avatar: The Last Airbender (2024)")
  const importedShowVariantsByBase = new Map();
  for (const ev of events) {
    if (ev.kind !== 'tv') continue;
    const p = canonicalShowParts(ev.show);
    if (!p.base) continue;
    if (!importedShowVariantsByBase.has(p.base)) importedShowVariantsByBase.set(p.base, new Set());
    importedShowVariantsByBase.get(p.base).add(p.year ? `${p.base}:${p.year}` : `${p.base}:noyear`);
  }

  const multiEditionBases = new Set();
  for (const [base, variants] of importedShowVariantsByBase.entries()) {
    // Only treat as distinct multi-edition if there are 2+ variants AND at least one has a recent remake year
    // while another has a different year or no year (and isn't just "Bluey" + "Bluey (2018)" which is the same 2018 show!).
    // Known remakes typically have a year >= 2020 alongside an older un-yeared original; let's check both!
    if (variants.size >= 2) {
      const years = [...variants].map(v => v.split(':')[1]).filter(y => y !== 'noyear').map(Number);
      if (years.length >= 2 && Math.max(...years) - Math.min(...years) >= 3) {
        multiEditionBases.add(base);
      } else if (years.length === 1 && years[0] >= 2022 && variants.has(`${base}:noyear`)) {
        // e.g. "Avatar: The Last Airbender" (2005) AND "Avatar: The Last Airbender (2024)" both in Plex!
        multiEditionBases.add(base);
      }
    }
  }

  const tvGroups = new Map();
  const movieGroups = new Map();
  const audioGroups = new Map();

  for (const ev of events) {
    const ts = ev.viewedAt || null;
    const tsMs = ts ? Date.parse(ts) || 0 : 0;

    if (ev.kind === 'tv') {
      const parts = canonicalShowParts(ev.show);
      if (!parts.base) continue;
      const keepYearInKey = multiEditionBases.has(parts.base) && parts.year;
      const showGroupKey = keepYearInKey ? `${parts.base} (${parts.year})` : parts.base;
      const epKey = `${showGroupKey}::s${ev.season}:e${ev.episode}`;
      let g = tvGroups.get(epKey);
      if (!g) {
        g = {
          kind: 'tv',
          showGroupKey,
          showParts: parts,
          keepYearSeparate: Boolean(keepYearInKey),
          rawShowNames: new Set(),
          season: ev.season,
          episode: ev.episode,
          episodeTitle: ev.episodeTitle || null,
          year: ev.year || null,
          timestamps: new Set(),
          explicitPlays: 0,
          latestAt: null,
          latestMs: 0,
          completed: false,
          inProgress: false,
          positionSec: 0,
          durationSec: 0,
          loved: undefined,
          sourceLabel: ev.sourceLabel,
        };
        tvGroups.set(epKey, g);
      }
      g.rawShowNames.add(ev.show);
      if (!g.episodeTitle && ev.episodeTitle) g.episodeTitle = ev.episodeTitle;
      if (ts) g.timestamps.add(ts);
      g.explicitPlays = Math.max(g.explicitPlays, ev.plays || 1);
      if (ev.completed) g.completed = true;
      if (ev.loved !== undefined) g.loved = ev.loved;
      if (ev.durationSec > g.durationSec) g.durationSec = ev.durationSec;
      if (tsMs >= g.latestMs) {
        g.latestMs = tsMs;
        if (ts) g.latestAt = ts;
        g.sourceLabel = ev.sourceLabel || g.sourceLabel;
        if (ev.inProgress && !ev.completed) {
          g.inProgress = true;
          g.completed = false;
          g.positionSec = ev.positionSec || 0;
        } else if (ev.completed) {
          g.completed = true;
          g.inProgress = false;
          g.positionSec = 0;
        }
      }
    } else if (ev.kind === 'movie') {
      const normTitle = canonicalMovieTitle(ev.title);
      if (!normTitle) continue;
      // Group movies by normalized title + year bucket
      let matchedKey = null;
      for (const [k, existing] of movieGroups.entries()) {
        if (existing.normTitle !== normTitle) continue;
        if (!ev.year || !existing.year || Math.abs(ev.year - existing.year) <= 1) {
          matchedKey = k;
          break;
        }
      }
      const key = matchedKey || `${normTitle}::${ev.year || ''}`;
      let g = movieGroups.get(key);
      if (!g) {
        g = {
          kind: 'movie',
          normTitle,
          title: ev.title.replace(/\s*\(\s*(?:19|20)\d{2}\s*\)\s*$/, '').trim() || ev.title,
          year: ev.year || null,
          timestamps: new Set(),
          explicitPlays: 0,
          latestAt: null,
          latestMs: 0,
          completed: false,
          inProgress: false,
          positionSec: 0,
          durationSec: 0,
          loved: undefined,
          sourceLabel: ev.sourceLabel,
        };
        movieGroups.set(key, g);
      }
      if (!g.year && ev.year) g.year = ev.year;
      if (ts) g.timestamps.add(ts);
      g.explicitPlays = Math.max(g.explicitPlays, ev.plays || 1);
      if (ev.completed) g.completed = true;
      if (ev.loved !== undefined) g.loved = ev.loved;
      if (ev.durationSec > g.durationSec) g.durationSec = ev.durationSec;
      if (tsMs >= g.latestMs) {
        g.latestMs = tsMs;
        if (ts) g.latestAt = ts;
        g.sourceLabel = ev.sourceLabel || g.sourceLabel;
        if (ev.inProgress && !ev.completed) {
          g.inProgress = true;
          g.completed = false;
          g.positionSec = ev.positionSec || 0;
        } else if (ev.completed) {
          g.completed = true;
          g.inProgress = false;
          g.positionSec = 0;
        }
      }
    } else if (ev.kind === 'audio') {
      const artistNorm = canonicalAudioPart(ev.artist);
      const albumNorm = canonicalAudioPart(ev.album);
      const titleNorm = canonicalAudioPart(ev.title);
      if (!titleNorm) continue;
      const key = `${artistNorm}::${albumNorm}::${titleNorm}`;
      let g = audioGroups.get(key);
      if (!g) {
        g = {
          kind: 'audio',
          artist: ev.artist || '',
          album: ev.album || '',
          title: ev.title,
          artistNorm,
          albumNorm,
          titleNorm,
          timestamps: new Set(),
          explicitPlays: 0,
          latestAt: null,
          latestMs: 0,
          loved: undefined,
          sourceLabel: ev.sourceLabel,
        };
        audioGroups.set(key, g);
      }
      if (ts) g.timestamps.add(ts);
      g.explicitPlays = Math.max(g.explicitPlays, ev.plays || 1);
      if (ev.loved !== undefined) g.loved = ev.loved;
      if (tsMs >= g.latestMs) {
        g.latestMs = tsMs;
        if (ts) g.latestAt = ts;
        g.sourceLabel = ev.sourceLabel || g.sourceLabel;
      }
    }
  }

  for (const g of [...tvGroups.values(), ...movieGroups.values(), ...audioGroups.values()]) {
    g.plays = Math.max(g.timestamps.size, g.explicitPlays, 1);
  }

  return {
    tv: [...tvGroups.values()],
    movies: [...movieGroups.values()],
    audio: [...audioGroups.values()],
    multiEditionBases,
  };
}

// ── Building Fast Lookup Indexes Over RobOS Libraries ────────────────────────

function indexMovieLibrary(tracks = []) {
  // alias -> Map<"s:e", Track[]>
  const tvByAlias = new Map();
  // alias -> Set<year>
  const tvYearsByAlias = new Map();
  // normTitle -> Track[]
  const moviesByTitle = new Map();

  for (const t of tracks) {
    if (!t || !t.id) continue;
    const kind = historyLib.kindOf(t);
    if (kind === 'tv') {
      const d = historyLib.describe(t);
      if (!d.show || d.season === null || d.episode === null) continue;
      const parts = canonicalShowParts(d.show);
      const epKey = `${d.season}:${d.episode}`;
      for (const alias of parts.aliases) {
        if (!tvByAlias.has(alias)) tvByAlias.set(alias, new Map());
        const epMap = tvByAlias.get(alias);
        if (!epMap.has(epKey)) epMap.set(epKey, []);
        epMap.get(epKey).push({ track: t, showName: d.show, year: parts.year || parseYear(t.year) });
        if (parts.year) {
          if (!tvYearsByAlias.has(alias)) tvYearsByAlias.set(alias, new Set());
          tvYearsByAlias.get(alias).add(parts.year);
        }
      }
    } else if (kind === 'movie') {
      const d = historyLib.describe(t);
      const norm = canonicalMovieTitle(d.title || t.title);
      if (!norm) continue;
      if (!moviesByTitle.has(norm)) moviesByTitle.set(norm, []);
      moviesByTitle.get(norm).push({ track: t, title: d.title || t.title, year: d.year || extractYearTag(t.title) });
    }
  }

  return { tvByAlias, tvYearsByAlias, moviesByTitle };
}

function indexAudioLibrary(tracks = []) {
  const byFull = new Map(); // artist::album::title -> Track[]
  const byArtistTitle = new Map(); // artist::title -> Track[]

  for (const t of tracks) {
    if (!t || !t.id) continue;
    const artistNorm = canonicalAudioPart(t.artist || t.albumArtist || '');
    const albumNorm = canonicalAudioPart(t.album || '');
    const titleNorm = canonicalAudioPart(t.title || '');
    if (!titleNorm) continue;
    const fullKey = `${artistNorm}::${albumNorm}::${titleNorm}`;
    if (!byFull.has(fullKey)) byFull.set(fullKey, []);
    byFull.get(fullKey).push(t);

    if (artistNorm) {
      const atKey = `${artistNorm}::${titleNorm}`;
      if (!byArtistTitle.has(atKey)) byArtistTitle.set(atKey, []);
      byArtistTitle.get(atKey).push(t);
    }
  }

  return { byFull, byArtistTitle };
}

function matchTvGroupToTracks(g, libIndex) {
  const epKey = `${g.season}:${g.episode}`;
  const candidates = [];
  const seenIds = new Set();

  for (const alias of g.showParts.aliases) {
    const epMap = libIndex.tvByAlias.get(alias);
    if (!epMap) continue;
    const list = epMap.get(epKey) || [];
    for (const item of list) {
      if (seenIds.has(item.track.id)) continue;
      // If this show had multiple year-distinct editions in the import (e.g. Avatar 2024 vs 2005),
      // enforce year compatibility so a 2024 remake doesn't mark 2005 episodes watched!
      if (g.keepYearSeparate && g.showParts.year) {
        if (!item.year || Math.abs(item.year - g.showParts.year) > 1) continue;
      }
      seenIds.add(item.track.id);
      candidates.push(item);
    }
  }

  return candidates.map(c => c.track);
}

function matchMovieGroupToTracks(g, libIndex) {
  const list = libIndex.moviesByTitle.get(g.normTitle) || [];
  if (!list.length) return [];
  if (g.year) {
    const yearMatches = list.filter(x => x.year && Math.abs(x.year - g.year) <= 1);
    if (yearMatches.length) return yearMatches.map(x => x.track);
    // If local tracks have explicit years that ALL conflict (e.g. Halloween 1978 vs 2018), do not cross-match!
    const allHaveConflictingYear = list.every(x => x.year && Math.abs(x.year - g.year) > 1);
    if (allHaveConflictingYear) return [];
  }
  return list.map(x => x.track);
}

// ── Applying Imported History to Stats, Portable History & Media Server ─────

function readStatsFile(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (raw && typeof raw.tracks === 'object' && raw.tracks) ? raw.tracks : {};
  } catch {
    return {};
  }
}

function writeStatsFile(file, tracksMap) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), tracks: tracksMap }));
  fs.renameSync(tmp, file);
}

function mergeImportedTrackStat(existing, g, nowIso) {
  const prev = existing || {};
  const prevTs = Date.parse(prev.lastPlayed || prev.updatedAt || '') || 0;
  const impTs = g.latestMs || Date.parse(g.latestAt || '') || 0;
  const plays = Math.max(Number(prev.plays) || 0, Number(g.plays) || 1);
  const lastPlayed = impTs >= prevTs
    ? (g.latestAt || prev.lastPlayed || nowIso)
    : (prev.lastPlayed || g.latestAt || nowIso);

  // If the user has newer in-progress playback locally after the export was taken, preserve their resume position!
  if (prevTs > impTs && impTs > 0 && prev.inProgress && Number(prev.positionSec) >= 1) {
    return {
      ...prev,
      plays,
      lastPlayed,
      dismissedFromWatchlist: false,
      resetPlays: false,
      updatedAt: nowIso,
    };
  }

  const completed = Boolean(g.completed || prev.completed);
  const inProgress = !completed && Boolean(g.inProgress);
  const positionSec = completed ? 0 : (inProgress ? g.positionSec : 0);
  const durationSec = Math.max(Number(prev.durationSec) || 0, Number(g.durationSec) || 0);
  const progressPct = completed
    ? 100
    : (inProgress && durationSec > 0 && positionSec > 0
      ? Math.min(99, Math.max(1, Math.round((positionSec / durationSec) * 100)))
      : (inProgress ? 1 : 0));

  return {
    ...prev,
    completed,
    inProgress,
    positionSec,
    ...(durationSec > 0 ? { durationSec } : {}),
    progressPct,
    plays,
    lastPlayed,
    ...(g.loved !== undefined ? { loved: Boolean(g.loved), lovedAt: g.loved ? nowIso : null } : {}),
    dismissedFromWatchlist: false,
    resetPlays: false,
    syncedFrom: g.sourceLabel || prev.syncedFrom || 'Watch History Import',
    updatedAt: nowIso,
  };
}

/**
 * Main entry point: imports a watch history file or object into RobOS Movie Player,
 * RobOS Audio Player, Portable Media History, and RobOS Media Server.
 *
 * When `movieLibrary` (a live `MediaLibrary` instance in `movie-player/main.js`) is passed,
 * mutates `movieLibrary.stats` directly so the open Electron app stays in sync in memory.
 */
async function importWatchHistory(source, {
  filePath = '',
  account = null,
  includeAudio = true,
  pushToServer = true,
  configDir: customConfigDir,
  homeDir,
  movieLibrary = null,
} = {}) {
  const dir = configDirOf({ configDir: customConfigDir, homeDir });
  let payload = source;
  let resolvedPath = filePath;

  if (!payload && filePath) {
    resolvedPath = path.resolve(String(filePath).replace(/^~(?=$|\/|\\)/, os.homedir()));
    if (!fs.existsSync(resolvedPath)) {
      return { ok: false, error: `Watch history file not found: ${resolvedPath}` };
    }
    payload = fs.readFileSync(resolvedPath, 'utf8');
  } else if (typeof source === 'string' && !source.trim().startsWith('{') && !source.trim().startsWith('[') && fs.existsSync(path.resolve(source.replace(/^~(?=$|\/|\\)/, os.homedir())))) {
    resolvedPath = path.resolve(source.replace(/^~(?=$|\/|\\)/, os.homedir()));
    payload = fs.readFileSync(resolvedPath, 'utf8');
  }

  let parsed;
  try {
    parsed = parseWatchHistoryPayload(payload, { filePath: resolvedPath, account });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const agg = aggregateWatchEvents(parsed.events);
  const nowIso = new Date().toISOString();

  // ── 1. Movie Player (TV Shows + Movies) ────────────────────────────────────
  const movieTracks = movieLibrary
    ? movieLibrary.tracks
    : historyLib.readLibraryTracks('movie-player', dir);
  const movieStats = movieLibrary
    ? movieLibrary.stats
    : readStatsFile(path.join(dir, 'movie-track-stats.json'));

  const movieHistoryPath = historyLib.historyFile('movie-player', dir);
  const movieHistoryDoc = historyLib.readDoc(movieHistoryPath);
  const movieIdx = indexMovieLibrary(movieTracks);

  const changedMovieStats = {};
  const serverBatchRecords = [];
  const matchedShowsSet = new Set();
  let matchedTvTrackCount = 0;
  let matchedMovieTrackCount = 0;

  for (const g of agg.tv) {
    const matchedTracks = matchTvGroupToTracks(g, movieIdx);
    const displayShow = matchedTracks.length
      ? (historyLib.describe(matchedTracks[0]).show || [...g.rawShowNames][0])
      : [...g.rawShowNames][0];

    if (matchedTracks.length) {
      matchedShowsSet.add(displayShow);
      for (const t of matchedTracks) {
        const nextStat = mergeImportedTrackStat(movieStats[t.id], g, nowIso);
        movieStats[t.id] = nextStat;
        changedMovieStats[t.id] = nextStat;
        matchedTvTrackCount++;
        serverBatchRecords.push({
          track: t,
          payload: {
            completed: nextStat.completed,
            unwatched: !nextStat.completed && !nextStat.inProgress,
            inProgress: nextStat.inProgress,
            positionSec: nextStat.positionSec || 0,
            durationSec: nextStat.durationSec || t.duration || 0,
            plays: nextStat.plays,
            lastPlayed: nextStat.lastPlayed,
          },
        });

        const pKey = historyLib.mediaKey(t);
        if (pKey) {
          const prevEntry = movieHistoryDoc.entries[pKey] || {};
          movieHistoryDoc.entries[pKey] = {
            ...prevEntry,
            key: pKey,
            ...historyLib.describe(t),
            episodeTitle: g.episodeTitle || t.episodeTitle || prevEntry.episodeTitle || null,
            completed: nextStat.completed,
            inProgress: nextStat.inProgress,
            positionSec: nextStat.positionSec,
            durationSec: nextStat.durationSec || (t.duration ? Math.round(t.duration) : prevEntry.durationSec || null),
            progressPct: nextStat.progressPct,
            plays: Math.max(Number(prevEntry.plays) || 0, nextStat.plays),
            lastPlayed: nextStat.lastPlayed,
            dismissedFromWatchlist: false,
            resetPlays: false,
            updatedAt: nowIso,
            by: g.sourceLabel,
          };
        }
      }
    } else {
      // Store in portable history even when episode file isn't in this machine's library
      const pKey = `tv:${historyLib.normalizeName(displayShow)}:s${g.season}:e${g.episode}`;
      const prevEntry = movieHistoryDoc.entries[pKey] || {};
      const nextStat = mergeImportedTrackStat(prevEntry, g, nowIso);
      movieHistoryDoc.entries[pKey] = {
        ...prevEntry,
        key: pKey,
        kind: 'tv',
        show: displayShow,
        season: g.season,
        episode: g.episode,
        episodeTitle: g.episodeTitle || prevEntry.episodeTitle || null,
        title: g.episodeTitle || `${displayShow} S${String(g.season).padStart(2, '0')}E${String(g.episode).padStart(2, '0')}`,
        completed: nextStat.completed,
        inProgress: nextStat.inProgress,
        positionSec: nextStat.positionSec,
        durationSec: nextStat.durationSec || prevEntry.durationSec || null,
        progressPct: nextStat.progressPct,
        plays: nextStat.plays,
        lastPlayed: nextStat.lastPlayed,
        dismissedFromWatchlist: false,
        resetPlays: false,
        updatedAt: nowIso,
        by: g.sourceLabel,
      };
    }
  }

  for (const g of agg.movies) {
    const matchedTracks = matchMovieGroupToTracks(g, movieIdx);
    if (matchedTracks.length) {
      for (const t of matchedTracks) {
        const nextStat = mergeImportedTrackStat(movieStats[t.id], g, nowIso);
        movieStats[t.id] = nextStat;
        changedMovieStats[t.id] = nextStat;
        matchedMovieTrackCount++;
        serverBatchRecords.push({
          track: t,
          payload: {
            completed: nextStat.completed,
            unwatched: !nextStat.completed && !nextStat.inProgress,
            inProgress: nextStat.inProgress,
            positionSec: nextStat.positionSec || 0,
            durationSec: nextStat.durationSec || t.duration || 0,
            plays: nextStat.plays,
            lastPlayed: nextStat.lastPlayed,
          },
        });

        const pKey = historyLib.mediaKey(t);
        if (pKey) {
          const prevEntry = movieHistoryDoc.entries[pKey] || {};
          movieHistoryDoc.entries[pKey] = {
            ...prevEntry,
            key: pKey,
            ...historyLib.describe(t),
            completed: nextStat.completed,
            inProgress: nextStat.inProgress,
            positionSec: nextStat.positionSec,
            durationSec: nextStat.durationSec || (t.duration ? Math.round(t.duration) : prevEntry.durationSec || null),
            progressPct: nextStat.progressPct,
            plays: Math.max(Number(prevEntry.plays) || 0, nextStat.plays),
            lastPlayed: nextStat.lastPlayed,
            dismissedFromWatchlist: false,
            resetPlays: false,
            updatedAt: nowIso,
            by: g.sourceLabel,
          };
        }
      }
    } else {
      const pKey = `movie:${historyLib.normalizeName(g.title)}:${g.year ?? ''}`;
      const prevEntry = movieHistoryDoc.entries[pKey] || {};
      const nextStat = mergeImportedTrackStat(prevEntry, g, nowIso);
      movieHistoryDoc.entries[pKey] = {
        ...prevEntry,
        key: pKey,
        kind: 'movie',
        title: g.title,
        year: g.year || prevEntry.year || null,
        completed: nextStat.completed,
        inProgress: nextStat.inProgress,
        positionSec: nextStat.positionSec,
        durationSec: nextStat.durationSec || prevEntry.durationSec || null,
        progressPct: nextStat.progressPct,
        plays: nextStat.plays,
        lastPlayed: nextStat.lastPlayed,
        dismissedFromWatchlist: false,
        resetPlays: false,
        updatedAt: nowIso,
        by: g.sourceLabel,
      };
    }
  }

  if (agg.tv.length || agg.movies.length) {
    if (movieLibrary) {
      movieLibrary._saveStats();
    } else {
      writeStatsFile(path.join(dir, 'movie-track-stats.json'), movieStats);
    }
    movieHistoryDoc.updatedAt = nowIso;
    historyLib.writeDoc(movieHistoryPath, movieHistoryDoc);
    if (movieLibrary?.history) movieLibrary.history.reloadIfChanged();
  }

  // ── 2. Audio Player (Music Tracks) ─────────────────────────────────────────
  let matchedAudioTrackCount = 0;
  if (includeAudio && agg.audio.length > 0) {
    const audioTracks = historyLib.readLibraryTracks('audio-player', dir);
    const audioStatsPath = path.join(dir, 'audio-track-stats.json');
    const audioStats = readStatsFile(audioStatsPath);
    const audioHistoryPath = historyLib.historyFile('audio-player', dir);
    const audioHistoryDoc = historyLib.readDoc(audioHistoryPath);
    const audioIdx = indexAudioLibrary(audioTracks);

    for (const g of agg.audio) {
      const fullKey = `${g.artistNorm}::${g.albumNorm}::${g.titleNorm}`;
      let hits = audioIdx.byFull.get(fullKey) || [];
      if (!hits.length && g.artistNorm) {
        hits = audioIdx.byArtistTitle.get(`${g.artistNorm}::${g.titleNorm}`) || [];
      }

      if (hits.length) {
        for (const t of hits) {
          const prev = audioStats[t.id] || {};
          const prevTs = Date.parse(prev.lastPlayed || '') || 0;
          const impTs = g.latestMs || 0;
          const nextPlays = Math.max(Number(prev.plays) || 0, g.plays);
          const nextLast = impTs >= prevTs ? (g.latestAt || prev.lastPlayed || nowIso) : prev.lastPlayed;
          audioStats[t.id] = {
            ...prev,
            plays: nextPlays,
            lastPlayed: nextLast,
            ...(g.loved !== undefined ? { loved: Boolean(g.loved), lovedAt: g.loved ? nowIso : null } : {}),
            syncedFrom: g.sourceLabel,
            updatedAt: nowIso,
          };
          matchedAudioTrackCount++;

          const pKey = historyLib.mediaKey(t);
          if (pKey) {
            const prevEntry = audioHistoryDoc.entries[pKey] || {};
            audioHistoryDoc.entries[pKey] = {
              ...prevEntry,
              key: pKey,
              ...historyLib.describe(t),
              plays: Math.max(Number(prevEntry.plays) || 0, nextPlays),
              lastPlayed: nextLast,
              updatedAt: nowIso,
              by: g.sourceLabel,
            };
          }
        }
      } else {
        const pKey = `audio:${historyLib.normalizeName(g.artist)}:${historyLib.normalizeName(g.album)}:${historyLib.normalizeName(g.title)}`;
        const prevEntry = audioHistoryDoc.entries[pKey] || {};
        audioHistoryDoc.entries[pKey] = {
          ...prevEntry,
          key: pKey,
          kind: 'audio',
          artist: g.artist,
          album: g.album,
          title: g.title,
          plays: Math.max(Number(prevEntry.plays) || 0, g.plays),
          lastPlayed: g.latestAt || prevEntry.lastPlayed || nowIso,
          updatedAt: nowIso,
          by: g.sourceLabel,
        };
      }
    }

    writeStatsFile(audioStatsPath, audioStats);
    audioHistoryDoc.updatedAt = nowIso;
    historyLib.writeDoc(audioHistoryPath, audioHistoryDoc);
  }

  // ── 3. Push Batch Progress to RobOS Media Server (Chunked) ─────────────────
  let pushedToMediaServer = 0;
  if (pushToServer && serverBatchRecords.length > 0) {
    try {
      const svc = require('./media-service-client');
      if (svc && typeof svc.pushBatchProgressToMediaServer === 'function') {
        const CHUNK = 500;
        for (let i = 0; i < serverBatchRecords.length; i += CHUNK) {
          const slice = serverBatchRecords.slice(i, i + CHUNK);
          const res = await svc.pushBatchProgressToMediaServer(slice, { timeoutMs: 12000 });
          if (res && res.pushed) pushedToMediaServer += Number(res.pushed) || 0;
        }
      }
    } catch {}
  }

  const summaryParts = [];
  if (agg.tv.length) summaryParts.push(`${agg.tv.length} unique TV episode${agg.tv.length === 1 ? '' : 's'} (${matchedShowsSet.size} library show${matchedShowsSet.size === 1 ? '' : 's'} matched)`);
  if (agg.movies.length) summaryParts.push(`${agg.movies.length} movie${agg.movies.length === 1 ? '' : 's'} (${matchedMovieTrackCount} in library)`);
  if (includeAudio && agg.audio.length) summaryParts.push(`${agg.audio.length} song${agg.audio.length === 1 ? '' : 's'} (${matchedAudioTrackCount} in Audio Player)`);

  const fromLabel = parsed.serverName ? ` from "${parsed.serverName}"` : (resolvedPath ? ` from ${path.basename(resolvedPath)}` : '');
  const spoken = summaryParts.length
    ? `Imported ${parsed.events.length.toLocaleString()} watch history events${fromLabel}: ${summaryParts.join(', ')}.`
    : `No watch history entries were found${fromLabel}.`;

  return {
    ok: true,
    format: parsed.format,
    filePath: resolvedPath || null,
    serverName: parsed.serverName,
    exportedAt: parsed.exportedAt,
    accounts: parsed.accounts,
    accountFilter: account || null,
    imported: {
      totalEvents: parsed.events.length,
      uniqueEpisodes: agg.tv.length,
      uniqueMovies: agg.movies.length,
      uniqueSongs: includeAudio ? agg.audio.length : 0,
    },
    matchedLibrary: {
      showsUpdated: matchedShowsSet.size,
      shows: [...matchedShowsSet].sort(),
      tvTracksUpdated: matchedTvTrackCount,
      movieTracksUpdated: matchedMovieTrackCount,
      audioTracksUpdated: matchedAudioTrackCount,
    },
    pushedToMediaServer,
    changedMovieStats,
    spoken,
  };
}

/**
 * Discovers the most recent `*watch*history*.{json,csv}` file in `~/Downloads` (or home dir)
 * when a voice command says "import my watch history" without naming an explicit file path.
 */
function findDefaultWatchHistoryFile({ homeDir } = {}) {
  const home = homeDir || process.env.HOME || os.homedir();
  const dirs = [path.join(home, 'Downloads'), home];
  const candidates = [];
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) continue;
      for (const name of fs.readdirSync(d)) {
        if (!/\.(?:json|csv|tsv)$/i.test(name)) continue;
        if (!/(?:watch[-_\s]*history|plex[-_\s]*history|tautulli|trakt|watched)/i.test(name)) continue;
        const full = path.join(d, name);
        const st = fs.statSync(full);
        if (st.isFile()) candidates.push({ path: full, mtimeMs: st.mtimeMs });
      }
    } catch {}
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.path || null;
}

module.exports = {
  canonicalShowParts,
  canonicalMovieTitle,
  canonicalAudioPart,
  parseWatchHistoryPayload,
  aggregateWatchEvents,
  importWatchHistory,
  findDefaultWatchHistoryFile,
};
