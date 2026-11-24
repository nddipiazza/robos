'use strict';

/**
 * RobOS Media History — what you watched and played, in a form every computer agrees on.
 *
 * The Movie Player and Audio Player keep play counts and resume positions per track, keyed
 * by a hash of the file's path on this computer. The same episode streamed from the same
 * Google Drive folder has a different path on another computer (another user name, another
 * cache folder, Windows vs Linux), so that history cannot follow you.
 *
 * This module keeps a second, portable copy keyed by what the media *is*:
 *
 *   tv:<show>:s<season>:e<episode>     tv:the office:s3:e12
 *   movie:<title>:<year>               movie:dune part two:2024
 *   audio:<artist>:<album>:<title>     audio:radiohead:ok computer:airbag
 *
 * One file per app, ~/.config/robos/media-history/<app>.json:
 *
 *   { format: 'robos-media-history/1', updatedAt, entries: { <key>: Entry } }
 *   Entry = { key, kind, title, show?, season?, episode?, episodeTitle?, year?, artist?, album?,
 *             positionSec, durationSec, progressPct, completed, inProgress, plays, lastPlayed,
 *             loved, updatedAt, by }
 *
 * The file is backed up by RobOS Config Sync (Preferences → Backup vault, for example on
 * Google Drive). Two computers can both change it between syncs: Config Sync merges it
 * entry by entry with mergeDocs() instead of asking which file to keep. For each key the
 * newer change wins, and play counts never go down.
 *
 * Queries (used by the players' control API, the media MCP server, the CLI and RobOS Voice):
 *   showStatus(query, { entries, tracks })   where you left off in a show, and what is next
 *   movieStatus(query, { entries, tracks })  whether a movie was watched or how far in
 *   continueWatching(entries)                in-progress shows and movies, newest first
 *   recentHistory(entries, { kind })         recently watched / played
 *   spokenShowStatus(status)                 one or two sentences for RobOS Voice
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FORMAT = 'robos-media-history/1';
const APPS = ['movie-player', 'audio-player'];

function configDirOf(configDir) {
  return configDir || process.env.ROBOS_CONFIG_DIR || path.join(process.env.HOME || os.homedir(), '.config', 'robos');
}

function historyFile(app, configDir) {
  if (!APPS.includes(app)) throw new Error(`Unknown media app "${app}"`);
  return path.join(configDirOf(configDir), 'media-history', `${app}.json`);
}

function machineName() { return process.env.ROBOS_MACHINE_NAME || os.hostname(); }

// ── Keys ─────────────────────────────────────────────────────────────────────

/** Lowercase, no accents or punctuation, single spaces. "The Office (US)" → "the office us". */
function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function kindOf(track) {
  if (!track) return null;
  if (track.mediaType === 'tv' || (track.showName && num(track.seasonNumber) !== null && num(track.episodeNumber) !== null)) return 'tv';
  if (track.mediaType === 'movie') return 'movie';
  if (track.mediaType === 'audio') return 'audio';
  return track.artist && track.album ? 'audio' : 'movie';
}

/** What the media is, independent of where its file lives. */
function describe(track) {
  const kind = kindOf(track);
  if (kind === 'tv') {
    return {
      kind,
      show: String(track.showName || track.albumArtist || track.album || '').trim(),
      season: num(track.seasonNumber ?? track.discNumber),
      episode: num(track.episodeNumber ?? track.trackNumber),
      episodeTitle: track.episodeTitle || null,
      title: track.title || null,
    };
  }
  if (kind === 'movie') {
    return { kind, title: String(track.movieTitle || track.title || '').trim(), year: num(track.year) };
  }
  return { kind: 'audio', title: String(track.title || '').trim(), artist: String(track.artist || '').trim(), album: String(track.album || '').trim() };
}

/** The portable key for a library track, or null when the track says too little about itself. */
function mediaKey(track) {
  if (!track) return null;
  const d = describe(track);
  if (d.kind === 'tv' && normalizeName(d.show) && d.season !== null && d.episode !== null) return `tv:${normalizeName(d.show)}:s${d.season}:e${d.episode}`;
  if (d.kind === 'movie' && normalizeName(d.title)) return `movie:${normalizeName(d.title)}:${d.year ?? ''}`;
  if (d.kind === 'audio' && normalizeName(d.title)) return `audio:${normalizeName(d.artist)}:${normalizeName(d.album)}:${normalizeName(d.title)}`;
  // Last resort: a Drive file ID is the same on every computer.
  if (track.cloud?.driveId) return `file:gdrive:${track.cloud.driveId}`;
  return null;
}

// ── File ─────────────────────────────────────────────────────────────────────

function emptyDoc() { return { format: FORMAT, updatedAt: null, entries: {} }; }

function readDoc(file) {
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (doc && typeof doc.entries === 'object' && doc.entries) return { ...emptyDoc(), ...doc, format: FORMAT };
  } catch {}
  return emptyDoc();
}

function writeDoc(file, doc) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

const time = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };
const entryTime = e => time(e?.updatedAt) || time(e?.lastPlayed);

/** The newer change wins; play counts never go down unless explicitly reset. */
function mergeEntry(a, b) {
  if (!a) return b;
  if (!b) return a;
  const [older, newer] = entryTime(a) > entryTime(b) ? [b, a] : [a, b];
  const merged = { ...older, ...newer };
  if (newer.resetPlays) {
    merged.plays = Number(newer.plays) || 0;
    merged.lastPlayed = newer.lastPlayed || null;
  } else {
    merged.plays = Math.max(Number(a.plays) || 0, Number(b.plays) || 0);
    if (time(older.lastPlayed) > time(newer.lastPlayed)) merged.lastPlayed = older.lastPlayed;
  }
  return merged;
}

/** Combines two copies of a history file (this computer's and the vault's). */
function mergeDocs(local, remote) {
  const l = local && local.entries ? local : emptyDoc();
  const r = remote && remote.entries ? remote : emptyDoc();
  const entries = {};
  for (const key of new Set([...Object.keys(l.entries), ...Object.keys(r.entries)])) entries[key] = mergeEntry(l.entries[key], r.entries[key]);
  const updatedAt = [l.updatedAt, r.updatedAt].filter(Boolean).sort().pop() || null;
  return { format: FORMAT, updatedAt, entries: sortEntries(entries) };
}

// Stable order, so the same history always produces the same bytes (and the same sync hash).
function sortEntries(entries) {
  const out = {};
  for (const key of Object.keys(entries).sort()) out[key] = entries[key];
  return out;
}

const PLAY_FIELDS = ['positionSec', 'durationSec', 'progressPct', 'completed', 'inProgress', 'plays', 'lastPlayed', 'loved', 'lovedAt', 'dismissedFromWatchlist', 'resetPlays'];

/**
 * One app's history file. record() re-reads the file before writing, so a copy that
 * Config Sync pulled from another computer a moment ago is merged, never overwritten.
 */
class MediaHistory {
  constructor({ app, configDir, file } = {}) {
    this.app = app;
    this.file = file || historyFile(app, configDir);
    this.doc = readDoc(this.file);
    this._mtime = this._stat();
  }

  _stat() { try { return fs.statSync(this.file).mtimeMs; } catch { return 0; } }

  /** Re-reads the file if something else (a sync) changed it. Returns true when it did. */
  reloadIfChanged() {
    const m = this._stat();
    if (m === this._mtime) return false;
    this.doc = readDoc(this.file);
    this._mtime = m;
    return true;
  }

  entries() { this.reloadIfChanged(); return this.doc.entries; }
  get(key) { return key ? this.entries()[key] || null : null; }
  forTrack(track) { return this.get(mediaKey(track)); }

  /** Saves a track's play state (a MediaLibrary stats entry). Returns the stored entry, or null. */
  record(track, stats = {}) {
    const key = mediaKey(track);
    if (!key) return null;
    this.reloadIfChanged();
    const now = new Date().toISOString();
    const prev = this.doc.entries[key] || {};
    const entry = { ...prev, key, ...describe(track) };
    for (const f of PLAY_FIELDS) if (stats[f] !== undefined) entry[f] = stats[f];
    if (!entry.durationSec && track.duration) entry.durationSec = Math.round(track.duration);
    if (stats.resetPlays) {
      entry.plays = Number(stats.plays) || 0;
      entry.lastPlayed = stats.lastPlayed ?? null;
    } else {
      entry.plays = Math.max(Number(prev.plays) || 0, Number(stats.plays) || 0);
      entry.resetPlays = false;
    }
    entry.updatedAt = now;
    entry.by = machineName();
    this.doc.entries[key] = entry;
    this.doc.entries = sortEntries(this.doc.entries);
    this.doc.updatedAt = now;
    writeDoc(this.file, this.doc);
    this._mtime = this._stat();
    return entry;
  }

  /** Records many tracks at once (bulk "mark watched"), with one write. */
  recordMany(items) {
    this.reloadIfChanged();
    const now = new Date().toISOString();
    const out = [];
    for (const { track, stats = {} } of items) {
      const key = mediaKey(track);
      if (!key) continue;
      const prev = this.doc.entries[key] || {};
      const entry = { ...prev, key, ...describe(track) };
      for (const f of PLAY_FIELDS) if (stats[f] !== undefined) entry[f] = stats[f];
      if (!entry.durationSec && track.duration) entry.durationSec = Math.round(track.duration);
      if (stats.resetPlays) {
        entry.plays = Number(stats.plays) || 0;
        entry.lastPlayed = stats.lastPlayed ?? null;
      } else {
        entry.plays = Math.max(Number(prev.plays) || 0, Number(stats.plays) || 0);
        entry.resetPlays = false;
      }
      entry.updatedAt = stats.updatedAt || now;
      entry.by = machineName();
      this.doc.entries[key] = entry;
      out.push(entry);
    }
    if (!out.length) return out;
    this.doc.entries = sortEntries(this.doc.entries);
    this.doc.updatedAt = now;
    writeDoc(this.file, this.doc);
    this._mtime = this._stat();
    return out;
  }
}

/**
 * Brings a player's per-track stats up to date with the portable history: when the history
 * holds a newer change for a track (watched on another computer), its play state is copied
 * into stats[track.id]. Returns { trackId: newStatsEntry } for what changed.
 */
function overlayStats(tracks, stats, entries) {
  const changed = {};
  if (!entries || !Array.isArray(tracks)) return changed;
  for (const t of tracks) {
    if (!t || !t.id) continue;
    const h = entries[mediaKey(t)];
    if (!h) continue;
    const s = stats[t.id];
    if (s && entryTime(s) >= entryTime(h)) continue;
    const next = { ...(s || {}) };
    for (const f of PLAY_FIELDS) if (h[f] !== undefined) next[f] = h[f];
    if (h.resetPlays) {
      next.plays = Number(h.plays) || 0;
      next.lastPlayed = h.lastPlayed ?? null;
    } else {
      next.plays = Math.max(Number(s?.plays) || 0, Number(h.plays) || 0);
    }
    next.updatedAt = h.updatedAt;
    next.syncedFrom = h.by || null;
    stats[t.id] = next;
    changed[t.id] = next;
  }
  return changed;
}

/**
 * Connects a player's MediaLibrary to its portable history: every play, resume point,
 * watched / unwatched and loved change is also written to media-history/<app>.json, and
 * library.syncHistory() copies newer changes from that file (another computer) into the
 * library's stats. Returns the MediaHistory.
 */
function attachHistory(library, { app, configDir, onChange = () => {} } = {}) {
  const history = new MediaHistory({ app, configDir });
  const trackById = id => library.tracks.find(t => t && t.id === id) || null;
  const stamp = entry => { if (entry && typeof entry === 'object') entry.updatedAt = new Date().toISOString(); };
  const wrap = (name, after) => {
    const original = library[name];
    if (typeof original !== 'function') return;
    library[name] = function wrapped(...args) {
      const out = original.apply(this, args);
      try { if (after(args, out)) { library._saveStats?.(); onChange(); } } catch (err) { console.warn(`[media-history] ${name}: ${err.message}`); }
      return out;
    };
  };
  const one = ([id], entry) => {
    if (!entry) return false;
    stamp(entry);
    const track = trackById(id);
    return Boolean(track && history.record(track, entry));
  };
  const many = (_args, changed) => {
    const items = [];
    for (const [id, entry] of Object.entries(changed || {})) {
      if (!entry.updatedAt) stamp(entry);
      const track = trackById(id);
      if (track) items.push({ track, stats: entry });
    }
    return history.recordMany(items).length > 0;
  };
  wrap('recordPlay', one);
  wrap('saveProgress', one);
  wrap('setWatched', many);
  wrap('setLoved', many);
  wrap('applyEpisodeCursor', many);
  wrap('dismissFromWatchlist', many);

  library.history = history;
  library.syncHistory = () => {
    history.reloadIfChanged();
    const changed = overlayStats(library.tracks, library.stats, history.entries());
    if (Object.keys(changed).length) library._saveStats?.();
    return changed;
  };
  library.syncHistory();
  return history;
}

// ── Matching what someone said to a show or movie ────────────────────────────

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'show', 'series', 'tv', 'movie', 'film']);
const tokens = s => normalizeName(s).split(' ').filter(w => w && !STOP.has(w));

/** 0..1, how well a spoken query names a title. */
function titleScore(query, title) {
  const q = normalizeName(query), t = normalizeName(title);
  if (!q || !t) return 0;
  if (q === t) return 1;
  const qs = q.replace(/^the /, ''), ts = t.replace(/^the /, '');
  if (qs === ts) return 0.98;
  if (ts.startsWith(qs) || qs.startsWith(ts)) return 0.9;
  const qt = tokens(q), tt = tokens(t);
  if (!qt.length || !tt.length) return 0;
  const hit = qt.filter(w => tt.some(x => x === w || (w.length > 3 && (x.startsWith(w) || w.startsWith(x))))).length;
  const score = (hit / qt.length) * 0.7 + (hit / tt.length) * 0.25;
  return ts.includes(qs) || qs.includes(ts) ? Math.max(score, 0.8) : score;
}

function bestMatch(query, names, min = 0.5) {
  let best = null;
  for (const name of names) {
    const score = titleScore(query, name);
    if (score >= min && (!best || score > best.score)) best = { name, score };
  }
  return best;
}

// ── Queries ──────────────────────────────────────────────────────────────────

function epCode(season, episode) { return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`; }
const byEpisode = (a, b) => (a.season - b.season) || (a.episode - b.episode);

/** Every show named in the history or the library. */
function listShows({ entries = {}, tracks = [] } = {}) {
  const shows = new Map();
  const add = (name, from) => {
    const k = normalizeName(name);
    if (!k) return;
    const s = shows.get(k) || { name, key: k, episodes: 0, watched: 0, inProgress: 0, lastPlayed: null };
    if (from) {
      if (from.completed) s.watched++;
      if (from.inProgress) s.inProgress++;
      if (time(from.lastPlayed) > time(s.lastPlayed)) s.lastPlayed = from.lastPlayed;
    } else s.episodes++;
    shows.set(k, s);
  };
  for (const t of tracks) if (kindOf(t) === 'tv') add(describe(t).show);
  for (const e of Object.values(entries)) if (e.kind === 'tv') add(e.show, e);
  return [...shows.values()].sort((a, b) => time(b.lastPlayed) - time(a.lastPlayed) || a.name.localeCompare(b.name));
}

/**
 * Where you left off in a show, and what is next.
 *   { ok, show, lastWatched, nextUp, seasons: [{ season, episodes, watched, inProgress }],
 *     watchedEpisodes, totalEpisodes, finished, spoken }
 */
function showStatus(query, { entries = {}, tracks = [] } = {}) {
  const shows = listShows({ entries, tracks });
  const match = bestMatch(query, shows.map(s => s.name));
  if (!match) {
    const error = `I could not find a show called "${query}" in your library or watch history.`;
    return { ok: false, query, error, spoken: error, suggestions: shows.slice(0, 5).map(s => s.name) };
  }
  const key = normalizeName(match.name);
  const library = tracks.filter(t => kindOf(t) === 'tv' && normalizeName(describe(t).show) === key)
    .map(t => ({ ...describe(t), trackId: t.id, durationSec: t.duration ? Math.round(t.duration) : null }))
    .filter(e => e.season !== null && e.episode !== null);
  const history = Object.values(entries).filter(e => e.kind === 'tv' && normalizeName(e.show) === key);
  const histByEp = new Map(history.map(e => [`${e.season}:${e.episode}`, e]));

  const episodes = new Map();
  for (const e of library) episodes.set(`${e.season}:${e.episode}`, { ...e, ...(histByEp.get(`${e.season}:${e.episode}`) ? pickPlay(histByEp.get(`${e.season}:${e.episode}`)) : {}) });
  for (const e of history) if (!episodes.has(`${e.season}:${e.episode}`)) episodes.set(`${e.season}:${e.episode}`, { ...e });
  const all = [...episodes.values()].sort(byEpisode);

  const played = all.filter(e => e.lastPlayed && (e.completed || e.inProgress || e.plays));
  const last = played.sort((a, b) => time(b.lastPlayed) - time(a.lastPlayed))[0] || null;

  let nextUp = null;
  if (last && last.inProgress) nextUp = { ...last, resume: true };
  else if (last) {
    const idx = all.findIndex(e => e.season === last.season && e.episode === last.episode);
    nextUp = all.slice(idx + 1).find(e => !e.completed) || null;
    if (!nextUp && !library.length) nextUp = { season: last.season, episode: last.episode + 1, show: match.name, guessed: true };
  } else nextUp = all.find(e => !e.completed) || null;

  const seasons = [...new Set(all.map(e => e.season))].sort((a, b) => a - b).map(season => {
    const eps = all.filter(e => e.season === season);
    return { season, episodes: eps.length, watched: eps.filter(e => e.completed).length, inProgress: eps.filter(e => e.inProgress).length };
  });
  const status = {
    ok: true,
    query,
    show: library[0]?.show || history[0]?.show || match.name,
    matchScore: Number(match.score.toFixed(2)),
    lastWatched: last ? summarizeEpisode(last) : null,
    nextUp: nextUp ? summarizeEpisode(nextUp) : null,
    seasons,
    watchedEpisodes: all.filter(e => e.completed).length,
    totalEpisodes: library.length || null,
    finished: Boolean(library.length) && all.every(e => e.completed),
    // The last episode you finished is the newest one this library has.
    atLatest: Boolean(library.length && last && last.completed && !nextUp),
  };
  status.spoken = spokenShowStatus(status);
  return status;
}

function pickPlay(h) {
  const out = {};
  for (const f of [...PLAY_FIELDS, 'updatedAt', 'by']) if (h[f] !== undefined) out[f] = h[f];
  return out;
}

function summarizeEpisode(e) {
  return {
    season: e.season, episode: e.episode, code: epCode(e.season, e.episode),
    episodeTitle: cleanEpisodeTitle(e.episodeTitle), trackId: e.trackId || null,
    positionSec: e.positionSec || 0, durationSec: e.durationSec || null, progressPct: e.progressPct || 0,
    completed: Boolean(e.completed), inProgress: Boolean(e.inProgress), lastPlayed: e.lastPlayed || null,
    watchedOn: e.by || null, resume: Boolean(e.resume), guessed: Boolean(e.guessed),
  };
}

function cleanEpisodeTitle(t) {
  const s = String(t || '').trim();
  return !s || /^Episode\s+\d+$/i.test(s) ? null : s;
}

function minutes(sec) {
  const m = Math.round((Number(sec) || 0) / 60);
  return m <= 1 ? 'about a minute' : `${m} minutes`;
}

function ago(iso, now = Date.now()) {
  const t = time(iso);
  if (!t) return '';
  const d = Math.floor((now - t) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'last week';
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}

/** One or two sentences RobOS Voice can say. */
function spokenShowStatus(s, { now = Date.now() } = {}) {
  if (!s.ok) return s.error;
  const name = s.show;
  if (!s.lastWatched) {
    return s.nextUp
      ? `You haven't started ${name} yet. It starts with season ${s.nextUp.season}, episode ${s.nextUp.episode}.`
      : `You haven't watched any of ${name} yet.`;
  }
  const l = s.lastWatched;
  const title = l.episodeTitle ? `, "${l.episodeTitle}"` : '';
  const when = ago(l.lastPlayed, now);
  const where = l.watchedOn ? ` on ${l.watchedOn}` : '';
  let first;
  if (l.inProgress) first = `You left off on season ${l.season} of ${name}: episode ${l.episode}${title}, ${minutes(l.positionSec)} in${when ? `, ${when}` : ''}${where}.`;
  else first = `You left off on season ${l.season} of ${name}. The last episode you finished was episode ${l.episode}${title}${when ? `, ${when}` : ''}${where}.`;
  if (s.finished) return `${first} That was the last episode in your library, so you're all caught up.`;
  if (s.atLatest) return `${first} That's the newest episode in your library.`;
  const n = s.nextUp;
  if (!n || n.resume) return first;
  const nt = n.episodeTitle ? `, "${n.episodeTitle}"` : '';
  const next = n.season !== l.season ? `Next up is the start of season ${n.season}: episode ${n.episode}${nt}.` : `Next up is episode ${n.episode}${nt}.`;
  return `${first} ${n.guessed ? next.replace('Next up is', 'Next up is probably') : next}`;
}

/** Whether a movie was watched, or how far in you are. */
function movieStatus(query, { entries = {}, tracks = [] } = {}) {
  const movies = new Map();
  for (const t of tracks) if (kindOf(t) === 'movie') { const d = describe(t); movies.set(mediaKey(t), { ...d, trackId: t.id }); }
  for (const e of Object.values(entries)) if (e.kind === 'movie') movies.set(e.key, { ...(movies.get(e.key) || {}), ...e });
  const list = [...movies.values()];
  const match = bestMatch(query, list.map(m => m.title));
  if (!match) return { ok: false, query, error: `I could not find a movie called "${query}".` };
  const m = list.filter(x => x.title === match.name).sort((a, b) => time(b.lastPlayed) - time(a.lastPlayed))[0];
  const year = m.year ? ` (${m.year})` : '';
  let spoken;
  if (m.completed) spoken = `You finished ${m.title}${year} ${ago(m.lastPlayed) || 'before'}${m.by ? ` on ${m.by}` : ''}.`;
  else if (m.inProgress) spoken = `You're ${minutes(m.positionSec)} into ${m.title}${year}${m.durationSec ? `, ${minutes(Math.max(0, m.durationSec - m.positionSec))} left` : ''}.`;
  else spoken = `You haven't watched ${m.title}${year} yet.`;
  return {
    ok: true, query, title: m.title, year: m.year || null, trackId: m.trackId || null,
    completed: Boolean(m.completed), inProgress: Boolean(m.inProgress), positionSec: m.positionSec || 0,
    durationSec: m.durationSec || null, lastPlayed: m.lastPlayed || null, watchedOn: m.by || null, spoken,
  };
}

/** In-progress shows and movies, newest first (one row per show). */
function continueWatching(entries = {}, { limit = 10 } = {}) {
  const rows = [];
  const seenShows = new Set();
  const dismissedShows = new Set();
  for (const e of Object.values(entries)) {
    if (e && e.kind === 'tv' && e.dismissedFromWatchlist && normalizeName(e.show)) {
      dismissedShows.add(normalizeName(e.show));
    }
  }
  for (const e of Object.values(entries).filter(x => x.kind !== 'audio' && x.lastPlayed).sort((a, b) => time(b.lastPlayed) - time(a.lastPlayed))) {
    if (e.kind === 'tv') {
      const k = normalizeName(e.show);
      if (seenShows.has(k) || dismissedShows.has(k)) continue;
      seenShows.add(k);
      if (!e.inProgress && !e.completed) continue;
      rows.push({ kind: 'tv', show: e.show, season: e.season, episode: e.episode, code: epCode(e.season, e.episode), inProgress: Boolean(e.inProgress), completed: Boolean(e.completed), positionSec: e.positionSec || 0, lastPlayed: e.lastPlayed, watchedOn: e.by || null });
    } else if (e.inProgress && !e.dismissedFromWatchlist) {
      rows.push({ kind: 'movie', title: e.title, year: e.year || null, positionSec: e.positionSec || 0, durationSec: e.durationSec || null, lastPlayed: e.lastPlayed, watchedOn: e.by || null });
    }
    if (rows.length >= limit) break;
  }
  return rows;
}

/** Recently watched or played entries, newest first. kind: 'tv' | 'movie' | 'audio' | undefined (all). */
function recentHistory(entries = {}, { kind, limit = 20 } = {}) {
  return Object.values(entries)
    .filter(e => e.lastPlayed && (!kind || e.kind === kind))
    .sort((a, b) => time(b.lastPlayed) - time(a.lastPlayed))
    .slice(0, limit);
}

/** Finds the library tracks for one show's season/episode (for "mark season 2 watched"). */
function findEpisodeTracks(query, { tracks = [], season = null, episode = null } = {}) {
  const shows = [...new Set(tracks.filter(t => kindOf(t) === 'tv').map(t => describe(t).show))];
  const match = bestMatch(query, shows);
  if (!match) return { show: null, tracks: [] };
  const key = normalizeName(match.name);
  return {
    show: match.name,
    tracks: tracks.filter(t => {
      if (kindOf(t) !== 'tv') return false;
      const d = describe(t);
      return normalizeName(d.show) === key && (season === null || d.season === Number(season)) && (episode === null || d.episode === Number(episode));
    }),
  };
}

// ── Watchlist & Episode Cursor Helpers ───────────────────────────────────────

const SMALL_NUM_WORDS = {
  zero: 0, one: 1, first: 1, two: 2, second: 2, three: 3, third: 3,
  four: 4, fourth: 4, five: 5, fifth: 5, six: 6, sixth: 6,
  seven: 7, seventh: 7, eight: 8, eighth: 8, nine: 9, ninth: 9,
  ten: 10, tenth: 10, eleven: 11, eleventh: 11, twelve: 12, twelfth: 12,
  thirteen: 13, thirteenth: 13, fourteen: 14, fourteenth: 14,
  fifteen: 15, fifteenth: 15, sixteen: 16, sixteenth: 16,
  seventeen: 17, seventeenth: 17, eighteen: 18, eighteenth: 18,
  nineteen: 19, nineteenth: 19,
};
const TENS_NUM_WORDS = {
  twenty: 20, twentieth: 20,
  thirty: 30, thirtieth: 30,
  forty: 40, fortieth: 40,
  fifty: 50, fiftieth: 50,
};

function replaceSpokenNumbers(raw) {
  const toks = String(raw || '')
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i].replace(/[^a-z0-9]/g, '');
    if (TENS_NUM_WORDS[w] !== undefined) {
      const next = (toks[i + 1] || '').replace(/[^a-z0-9]/g, '');
      if (SMALL_NUM_WORDS[next] !== undefined && SMALL_NUM_WORDS[next] >= 1 && SMALL_NUM_WORDS[next] <= 9) {
        out.push(String(TENS_NUM_WORDS[w] + SMALL_NUM_WORDS[next]));
        i++;
        continue;
      }
      out.push(String(TENS_NUM_WORDS[w]));
      continue;
    }
    if (SMALL_NUM_WORDS[w] !== undefined) {
      out.push(String(SMALL_NUM_WORDS[w]));
      continue;
    }
    out.push(toks[i]);
  }
  return out.join(' ');
}

/**
 * Parses natural-language or shorthand episode expressions:
 *   "S02E05", "s2 e5", "2x05", "season 2 episode 5", "season twenty one episode five",
 *   "episode 5 of season 2", "season 3" -> S03E01, "episode 5" -> episodeOnly: 5,
 *   or an episode title like "Dinner Party" -> { titleQuery: "Dinner Party" }.
 */
function parseEpisodeSpec(rawSpec) {
  const raw = String(rawSpec || '').trim();
  if (!raw) return null;
  const norm = replaceSpokenNumbers(raw)
    .replace(/[,:;()[\]"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. S02E05 / s2 e5 / s02 ep 05
  let m = norm.match(/\bs(?:eason)?\s*(\d{1,3})\s*e(?:p(?:isode)?)?\s*(\d{1,4})\b/i);
  if (m) return { season: Number(m[1]), episode: Number(m[2]), raw };

  // 2. 2x05
  m = norm.match(/\b(\d{1,3})\s*x\s*(\d{1,4})\b/i);
  if (m) return { season: Number(m[1]), episode: Number(m[2]), raw };

  // 3. "episode 5 of/in season 2" / "5th episode of season 2"
  m = norm.match(/\b(?:e(?:p(?:isode)?)?\s*(\d{1,4})|(\d{1,4})\s*episode)\s*(?:of|in|from)?\s*s(?:eason)?\s*(\d{1,3})\b/i);
  if (m) return { season: Number(m[3]), episode: Number(m[1] || m[2]), raw };

  // 4. "season 2, 5" or "season 2 part 5"
  m = norm.match(/\bs(?:eason)?\s*(\d{1,3})\s+(?:part|chapter|ep|episode)?\s*(\d{1,4})\b/i);
  if (m) return { season: Number(m[1]), episode: Number(m[2]), raw };

  // 5. "episode 5" / "ep 5" / "part 5"
  m = norm.match(/^(?:the\s+)?(?:e(?:p(?:isode)?)?|part|chapter)\s*(\d{1,4})$/i)
    || norm.match(/^(?:the\s+)?(\d{1,4})\s*episode$/i);
  if (m) return { season: null, episode: Number(m[1]), episodeOnly: true, raw };

  // 6. "season 3" / "start of season 3" -> S03E01
  m = norm.match(/^(?:the\s+)?(?:start\s+of\s+|beginning\s+of\s+)?s(?:eason)?\s*(\d{1,3})$/i);
  if (m) return { season: Number(m[1]), episode: 1, seasonOnly: true, raw };

  // 7. Plain number "5" -> episode 5
  if (/^\d{1,4}$/.test(norm)) {
    return { season: null, episode: Number(norm), episodeOnly: true, raw };
  }

  return { season: null, episode: null, titleQuery: raw, raw };
}

/**
 * Resolves a spoken or typed title to either a TV Show (all episodes) or a Movie
 * across `tracks` and portable `entries`.
 */
function findWatchlistTarget(query, { tracks = [], entries = {}, preferredKind = null } = {}) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'Say which show or movie.' };

  const showNames = new Set();
  for (const t of tracks) if (kindOf(t) === 'tv') { const s = describe(t).show; if (s) showNames.add(s); }
  for (const e of Object.values(entries)) if (e && e.kind === 'tv' && e.show) showNames.add(e.show);

  const movieMap = new Map();
  for (const t of tracks) {
    if (kindOf(t) === 'movie') {
      const d = describe(t);
      if (d.title) movieMap.set(normalizeName(d.title), { title: d.title, year: d.year });
    }
  }
  for (const e of Object.values(entries)) {
    if (e && e.kind === 'movie' && e.title) {
      const k = normalizeName(e.title);
      if (!movieMap.has(k)) movieMap.set(k, { title: e.title, year: e.year || null });
    }
  }

  const showMatch = preferredKind === 'movie' ? null : bestMatch(q, [...showNames]);
  const movieMatch = preferredKind === 'tv' ? null : bestMatch(q, [...movieMap.values()].map(m => m.title));

  if (!showMatch && !movieMatch) {
    return { ok: false, query: q, error: `I could not find "${q}" in your movie or TV library.` };
  }

  const pickShow = showMatch && (!movieMatch || preferredKind === 'tv' || showMatch.score >= movieMatch.score);
  if (pickShow) {
    const key = normalizeName(showMatch.name);
    const matchedTracks = tracks.filter(t => kindOf(t) === 'tv' && normalizeName(describe(t).show) === key);
    const entryKeys = Object.keys(entries).filter(k => entries[k]?.kind === 'tv' && normalizeName(entries[k].show) === key);
    return {
      ok: true,
      kind: 'tv',
      name: matchedTracks[0] ? describe(matchedTracks[0]).show : showMatch.name,
      score: showMatch.score,
      tracks: matchedTracks,
      entryKeys,
    };
  }

  const key = normalizeName(movieMatch.name);
  const matchedTracks = tracks.filter(t => kindOf(t) === 'movie' && normalizeName(describe(t).title) === key);
  const entryKeys = Object.keys(entries).filter(k => entries[k]?.kind === 'movie' && normalizeName(entries[k].title) === key);
  const info = movieMap.get(key) || { title: movieMatch.name, year: null };
  return {
    ok: true,
    kind: 'movie',
    name: info.title,
    year: info.year || null,
    score: movieMatch.score,
    tracks: matchedTracks,
    entryKeys,
  };
}

/**
 * Builds the user's Watchlist view (My Watchlist loved shows & movies + Continue Watching + custom Watchlists).
 */
function watchlistSummary({ entries = {}, tracks = [], stats = {}, playlists = [], limit = 50 } = {}) {
  const lovedShowMap = new Map();
  const lovedMovies = new Map();

  const noteLovedTv = (showName) => {
    const k = normalizeName(showName);
    if (!k || lovedShowMap.has(k)) return;
    const st = showStatus(showName, { entries, tracks });
    lovedShowMap.set(k, {
      kind: 'tv',
      show: st.ok ? st.show : showName,
      loved: true,
      nextUp: st.ok ? st.nextUp : null,
      watchedEpisodes: st.ok ? st.watchedEpisodes : 0,
      totalEpisodes: st.ok ? st.totalEpisodes : null,
      finished: Boolean(st.ok && st.finished),
    });
  };

  const noteLovedMovie = (title, year, trackId = null) => {
    const k = normalizeName(title);
    if (!k || lovedMovies.has(k)) return;
    const ms = movieStatus(title, { entries, tracks });
    lovedMovies.set(k, {
      kind: 'movie',
      title: ms.ok ? ms.title : title,
      year: (ms.ok ? ms.year : year) || null,
      trackId: (ms.ok ? ms.trackId : trackId) || trackId,
      loved: true,
      completed: Boolean(ms.ok && ms.completed),
      inProgress: Boolean(ms.ok && ms.inProgress),
      positionSec: ms.ok ? ms.positionSec : 0,
    });
  };

  for (const t of tracks) {
    if (!t || !stats[t.id]?.loved) continue;
    const d = describe(t);
    if (d.kind === 'tv' && d.show) noteLovedTv(d.show);
    else if (d.kind === 'movie' && d.title) noteLovedMovie(d.title, d.year, t.id);
  }
  for (const e of Object.values(entries)) {
    if (!e || !e.loved) continue;
    if (e.kind === 'tv' && e.show) noteLovedTv(e.show);
    else if (e.kind === 'movie' && e.title) noteLovedMovie(e.title, e.year);
  }
  // Also include items inside custom "Watch Later" / "*Watchlist*" playlists
  for (const pl of (Array.isArray(playlists) ? playlists : [])) {
    if (!pl || !Array.isArray(pl.tracks) || !pl.tracks.length) continue;
    if (pl.id === 'pl_watchlist' || /watch\s*list|watch\s*later/i.test(pl.name || '')) {
      for (const t of pl.tracks) {
        const d = describe(t);
        if (d.kind === 'tv' && d.show) noteLovedTv(d.show);
        else if (d.kind === 'movie' && d.title) noteLovedMovie(d.title, d.year, t.id);
      }
    }
  }

  const cont = continueWatching(entries, { limit });
  const items = [];
  const seenKeys = new Set();

  for (const s of lovedShowMap.values()) {
    const k = `tv:${normalizeName(s.show)}`;
    seenKeys.add(k);
    items.push({ ...s, source: 'watchlist' });
  }
  for (const m of lovedMovies.values()) {
    const k = `movie:${normalizeName(m.title)}`;
    seenKeys.add(k);
    items.push({ ...m, source: 'watchlist' });
  }
  for (const c of cont) {
    const k = c.kind === 'tv' ? `tv:${normalizeName(c.show)}` : `movie:${normalizeName(c.title)}`;
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    if (c.kind === 'tv') {
      const st = showStatus(c.show, { entries, tracks });
      items.push({
        kind: 'tv',
        show: st.ok ? st.show : c.show,
        loved: false,
        nextUp: st.ok ? st.nextUp : { season: c.season, episode: c.episode, code: c.code },
        watchedEpisodes: st.ok ? st.watchedEpisodes : 0,
        totalEpisodes: st.ok ? st.totalEpisodes : null,
        finished: Boolean(st.ok && st.finished),
        source: 'continue-watching',
      });
    } else {
      items.push({ ...c, loved: false, source: 'continue-watching' });
    }
  }

  const trimmed = items.slice(0, limit);
  let spoken;
  if (!trimmed.length) {
    spoken = 'Your Movie Player watchlist is currently empty.';
  } else {
    const parts = trimmed.slice(0, 6).map(it => {
      if (it.kind === 'tv') {
        return it.nextUp ? `${it.show} (up to ${it.nextUp.code})` : it.show;
      }
      return `${it.title}${it.year ? ` (${it.year})` : ''}`;
    });
    const more = trimmed.length > 6 ? `, plus ${trimmed.length - 6} more` : '';
    spoken = `On your watchlist: ${parts.join(', ')}${more}.`;
  }

  return {
    ok: true,
    items: trimmed,
    lovedShows: [...lovedShowMap.values()],
    lovedMovies: [...lovedMovies.values()],
    continueWatching: cont,
    spoken,
  };
}

/**
 * Plans the exact episode cursor update for:
 *   "my/our current episode of {show} is {epInput}"
 * Every episode strictly before target `(season, episode)` becomes Watched;
 * target `(season, episode)` and every episode after it becomes Unwatched / New,
 * so `{show}`'s Next Up / Continue Watching lands directly on `{targetEpisode}`!
 */
function planCurrentEpisode(query, epInput, { tracks = [], entries = {} } = {}) {
  const shows = listShows({ entries, tracks });
  const match = bestMatch(query, shows.map(s => s.name));
  if (!match) {
    const error = `I could not find a show called "${query}" in your library or watch history.`;
    return { ok: false, query, error, spoken: error, suggestions: shows.slice(0, 5).map(s => s.name) };
  }

  const key = normalizeName(match.name);
  const showTracks = tracks
    .filter(t => kindOf(t) === 'tv' && normalizeName(describe(t).show) === key)
    .map(t => ({ track: t, ...describe(t) }))
    .filter(x => x.season !== null && x.episode !== null)
    .sort(byEpisode);

  const histEntries = Object.values(entries)
    .filter(e => e && e.kind === 'tv' && normalizeName(e.show) === key && e.season != null && e.episode != null)
    .sort(byEpisode);

  const showName = showTracks[0]?.show || histEntries[0]?.show || match.name;

  // Merge unique (season, episode) catalog across library tracks and history
  const epMap = new Map();
  for (const st of showTracks) {
    const k = `${st.season}:${st.episode}`;
    if (!epMap.has(k)) epMap.set(k, { season: st.season, episode: st.episode, episodeTitle: st.episodeTitle || st.title || null, tracks: [], entryKeys: [] });
    epMap.get(k).tracks.push(st.track);
  }
  for (const he of histEntries) {
    const k = `${he.season}:${he.episode}`;
    if (!epMap.has(k)) epMap.set(k, { season: Number(he.season), episode: Number(he.episode), episodeTitle: he.episodeTitle || he.title || null, tracks: [], entryKeys: [] });
    if (he.key) epMap.get(k).entryKeys.push(he.key);
  }
  const allEpisodes = [...epMap.values()].sort(byEpisode);

  let parsed = typeof epInput === 'object' && epInput !== null && (epInput.season != null || epInput.episode != null)
    ? { season: epInput.season != null ? Number(epInput.season) : null, episode: epInput.episode != null ? Number(epInput.episode) : null, episodeOnly: epInput.season == null && epInput.episode != null }
    : parseEpisodeSpec(epInput);

  if (!parsed) {
    const error = `Say which episode of ${showName} you're on, like "Season 2 Episode 5" or "S02E05".`;
    return { ok: false, query, show: showName, error, spoken: error };
  }

  let targetSeason = parsed.season;
  let targetEpisode = parsed.episode;

  if (parsed.titleQuery) {
    const candidates = allEpisodes.filter(e => cleanEpisodeTitle(e.episodeTitle));
    const titleHit = bestMatch(parsed.titleQuery, candidates.map(c => cleanEpisodeTitle(c.episodeTitle)), 0.55);
    if (!titleHit) {
      const error = `I couldn't match "${parsed.titleQuery}" to an episode of ${showName}. Try saying the season and episode number, like Season 2 Episode 5.`;
      return { ok: false, query, show: showName, error, spoken: error };
    }
    const foundEp = candidates.find(c => cleanEpisodeTitle(c.episodeTitle) === titleHit.name);
    targetSeason = foundEp.season;
    targetEpisode = foundEp.episode;
  } else if (parsed.episodeOnly && targetEpisode != null) {
    // Check if Season 1 (or lowest season) has this episode number; otherwise resolve Nth overall episode if within range
    const firstSeason = allEpisodes[0]?.season ?? 1;
    const inFirstSeason = allEpisodes.find(e => e.season === firstSeason && e.episode === targetEpisode);
    if (inFirstSeason || !allEpisodes.length) {
      targetSeason = firstSeason;
    } else if (targetEpisode >= 1 && targetEpisode <= allEpisodes.length) {
      const absEp = allEpisodes[targetEpisode - 1];
      targetSeason = absEp.season;
      targetEpisode = absEp.episode;
    } else {
      targetSeason = firstSeason;
    }
  }

  if (targetSeason == null || targetEpisode == null || targetSeason < 0 || targetEpisode < 1) {
    const error = `Invalid episode "${epInput}" for ${showName}.`;
    return { ok: false, query, show: showName, error, spoken: error };
  }

  const before = allEpisodes.filter(e => e.season < targetSeason || (e.season === targetSeason && e.episode < targetEpisode));
  const fromCurrent = allEpisodes.filter(e => e.season > targetSeason || (e.season === targetSeason && e.episode >= targetEpisode));
  const exactTarget = allEpisodes.find(e => e.season === targetSeason && e.episode === targetEpisode) || {
    season: targetSeason,
    episode: targetEpisode,
    episodeTitle: null,
    tracks: [],
    entryKeys: [],
  };

  const code = epCode(targetSeason, targetEpisode);
  const epTitleClean = cleanEpisodeTitle(exactTarget.episodeTitle);
  const titlePart = epTitleClean ? ` ("${epTitleClean}")` : '';

  let spoken;
  if (before.length === 0) {
    spoken = `Set your current episode of ${showName} to Season ${targetSeason}, Episode ${targetEpisode}${titlePart}, and marked all ${fromCurrent.length || 'remaining'} episodes as unwatched.`;
  } else {
    const prevEp = before[before.length - 1];
    spoken = `Updated ${showName}: marked ${before.length} episode${before.length === 1 ? '' : 's'} watched through ${epCode(prevEp.season, prevEp.episode)}, and set your current episode to Season ${targetSeason}, Episode ${targetEpisode}${titlePart}${fromCurrent.length ? ` (${fromCurrent.length} unwatched from here)` : ''}.`;
  }

  return {
    ok: true,
    show: showName,
    targetSeason,
    targetEpisode,
    targetCode: code,
    targetEpisodeTitle: epTitleClean,
    watchedBeforeCount: before.length,
    unwatchedFromCurrentCount: fromCurrent.length,
    watchedTracks: before.flatMap(e => e.tracks),
    unwatchedTracks: fromCurrent.flatMap(e => e.tracks),
    targetTracks: exactTarget.tracks,
    watchedEntryKeys: before.flatMap(e => e.entryKeys),
    unwatchedEntryKeys: fromCurrent.flatMap(e => e.entryKeys),
    spoken,
  };
}

/** Reads a player's library index (~/.config/robos/<movie|audio>-library.json) without the app running. */
function readLibraryTracks(app, configDir) {
  const file = path.join(configDirOf(configDir), app === 'audio-player' ? 'audio-library.json' : 'movie-library.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).tracks || []; } catch { return []; }
}

function readEntries(app, configDir) { return readDoc(historyFile(app, configDir)).entries; }

module.exports = {
  FORMAT, APPS,
  historyFile, normalizeName, mediaKey, describe, kindOf,
  readDoc, writeDoc, mergeEntry, mergeDocs, emptyDoc,
  MediaHistory, overlayStats, attachHistory,
  titleScore, bestMatch, listShows, showStatus, movieStatus, continueWatching, recentHistory, findEpisodeTracks,
  parseEpisodeSpec, findWatchlistTarget, watchlistSummary, planCurrentEpisode,
  spokenShowStatus, readLibraryTracks, readEntries, epCode,
};
