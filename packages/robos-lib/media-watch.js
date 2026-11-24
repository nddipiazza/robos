'use strict';

/**
 * Watch status and play history for agents, the CLI, MCP and RobOS Voice.
 *
 * Questions are answered from the files every computer keeps (no app has to be running):
 *   ~/.config/robos/media-history/movie-player.json   what you watched, synced through the vault
 *   ~/.config/robos/movie-library.json                which episodes this computer's library has
 *
 * Changes go through the running Movie Player when it is open (its window updates at once)
 * and are written to the history file directly when it is not.
 *
 *   const watch = require('robos-lib/media-watch');
 *   await watch.watchStatus('the office')       → { ok, show, lastWatched, nextUp, seasons, spoken }
 *   await watch.movieStatus('dune')             → { ok, title, completed, inProgress, spoken }
 *   await watch.continueWatching()              → { ok, items }
 *   await watch.history({ app: 'audio-player' }) → { ok, items }
 *   await watch.setWatched({ show, season, episode, watched })
 *   await watch.playNextEpisode({ show })
 *   await watch.syncNow()                       → syncs both players' library and history with the vault
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const history = require('./media-history');

function configDir(opts = {}) {
  return opts.configDir || process.env.ROBOS_CONFIG_DIR || path.join(opts.homeDir || process.env.HOME || os.homedir(), '.config', 'robos');
}

function load(app, opts) {
  const dir = configDir(opts);
  return { entries: history.readEntries(app, dir), tracks: history.readLibraryTracks(app, dir) };
}

function readTrackStats(dir) {
  const file = path.join(dir, 'movie-track-stats.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (raw && typeof raw.tracks === 'object' && raw.tracks) ? raw.tracks : {};
  } catch {
    return {};
  }
}

function writeTrackStats(dir, stats) {
  const file = path.join(dir, 'movie-track-stats.json');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), tracks: stats }));
  fs.renameSync(tmp, file);
}

function readPlaylists(dir) {
  const file = path.join(dir, 'movie-playlists.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? raw : (raw?.playlists || []);
  } catch {
    return [];
  }
}

function writePlaylists(dir, playlists) {
  const file = path.join(dir, 'movie-playlists.json');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(playlists, null, 2));
  fs.renameSync(tmp, file);
}

async function pushOfflineBatch(records) {
  if (!records || !records.length) return;
  try {
    const svc = require('./media-service-client');
    if (svc && typeof svc.pushBatchProgressToMediaServer === 'function') {
      await svc.pushBatchProgressToMediaServer(records);
    }
  } catch {}
}

// ── The running player's control API (lib/control-server.js in each player) ──

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

function controlInfo(app, opts) {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(configDir(opts), `${app}-control.json`), 'utf8'));
    return info && info.port && info.token && pidAlive(info.pid) ? info : null;
  } catch { return null; }
}

function callPlayer(app, method, apiPath, body, opts = {}) {
  const info = controlInfo(app, opts);
  if (!info) return Promise.resolve(null);
  return new Promise((resolve) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: info.port, path: apiPath, method, timeout: opts.timeoutMs || 15000,
      headers: { 'X-RobOS-Token': info.token, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => { try { resolve(JSON.parse(text)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(payload || undefined);
  });
}

// ── Questions ────────────────────────────────────────────────────────────────

async function watchStatus(show, opts = {}) {
  if (!String(show || '').trim()) return { ok: false, error: 'Which show?' };
  const { entries, tracks } = load('movie-player', opts);
  return history.showStatus(show, { entries, tracks });
}

async function movieStatus(title, opts = {}) {
  if (!String(title || '').trim()) return { ok: false, error: 'Which movie?' };
  const { entries, tracks } = load('movie-player', opts);
  return history.movieStatus(title, { entries, tracks });
}

async function continueWatching(opts = {}) {
  const { entries } = load('movie-player', opts);
  const items = history.continueWatching(entries, { limit: opts.limit || 10 });
  const spoken = !items.length ? 'Nothing is in progress right now.'
    : `You're in the middle of ${items.slice(0, 4).map(i => (i.kind === 'tv' ? `${i.show} (season ${i.season}, episode ${i.episode})` : i.title)).join(', ')}.`;
  return { ok: true, items, spoken };
}

async function listShows(opts = {}) {
  const { entries, tracks } = load('movie-player', opts);
  return { ok: true, shows: history.listShows({ entries, tracks }) };
}

async function historyList(opts = {}) {
  const app = opts.app === 'audio-player' ? 'audio-player' : 'movie-player';
  const { entries } = load(app, opts);
  return { ok: true, app, items: history.recentHistory(entries, { kind: opts.kind || undefined, limit: opts.limit || 20 }) };
}

async function watchlist(opts = {}) {
  const live = await callPlayer('movie-player', 'GET', `/api/watchlist?limit=${Number(opts.limit) || 50}`, null, opts);
  if (live && live.ok) return { ...live, via: 'movie-player' };
  const dir = configDir(opts);
  const { entries, tracks } = load('movie-player', opts);
  const stats = readTrackStats(dir);
  const playlists = readPlaylists(dir);
  return {
    ...history.watchlistSummary({ entries, tracks, stats, playlists, limit: Number(opts.limit) || 50 }),
    via: 'history-file',
  };
}

// ── Changes ──────────────────────────────────────────────────────────────────

async function setWatched({ show, season = null, episode = null, watched = true, ...opts } = {}) {
  if (!show) return { ok: false, error: 'Which show?' };
  const body = { show, season: season === '' ? null : season, episode: episode === '' ? null : episode, watched: watched !== false };
  const live = await callPlayer('movie-player', 'POST', '/api/set-watched', body, opts);
  if (live) return { ...live, via: 'movie-player' };
  // The player is closed: write stats + history file; the player applies it when it opens.
  const dir = configDir(opts);
  const { tracks } = load('movie-player', opts);
  const found = history.findEpisodeTracks(show, { tracks, season: body.season, episode: body.episode });
  if (!found.tracks.length) return { ok: false, error: `No episodes of "${show}" matched in this computer's library.` };
  const h = new history.MediaHistory({ app: 'movie-player', configDir: dir });
  const now = new Date().toISOString();
  const trackStats = readTrackStats(dir);
  const stats = body.watched
    ? { completed: true, inProgress: false, positionSec: 0, progressPct: 100, plays: 1, lastPlayed: now, dismissedFromWatchlist: false, resetPlays: false, updatedAt: now }
    : { completed: false, inProgress: false, positionSec: 0, progressPct: 0, plays: 0, lastPlayed: null, resetPlays: true, updatedAt: now };
  for (const t of found.tracks) {
    trackStats[t.id] = { ...(trackStats[t.id] || {}), ...stats };
  }
  writeTrackStats(dir, trackStats);
  h.recordMany(found.tracks.map(track => ({ track, stats })));
  await pushOfflineBatch(found.tracks.map(track => ({
    track,
    payload: { ...stats, completed: body.watched, unwatched: !body.watched },
  })));
  const scopeLabel = body.episode !== null
    ? ` Season ${body.season} Episode ${body.episode}`
    : (body.season !== null ? ` Season ${body.season}` : '');
  const spoken = body.watched
    ? `Marked ${found.show}${scopeLabel} (${found.tracks.length} episode${found.tracks.length === 1 ? '' : 's'}) as watched.`
    : `Marked ${found.show}${scopeLabel} (${found.tracks.length} episode${found.tracks.length === 1 ? '' : 's'}) as new and unwatched.`;
  return { ok: true, show: found.show, season: body.season, episode: body.episode, watched: body.watched, count: found.tracks.length, spoken, via: 'history-file' };
}

async function addToWatchlist(queryOrOpts, maybeOpts = {}) {
  const raw = typeof queryOrOpts === 'string'
    ? { query: queryOrOpts, ...maybeOpts }
    : { ...(queryOrOpts || {}), ...maybeOpts };
  const query = String(raw.query || raw.title || raw.show || '').trim();
  if (!query) return { ok: false, error: 'Say which show or movie to add to your watchlist.', spoken: 'Say which show or movie to add to your watchlist.' };
  const kind = raw.kind || null;

  const live = await callPlayer('movie-player', 'POST', '/api/watchlist-add', { query, kind }, raw);
  if (live) return { ...live, via: 'movie-player' };

  const dir = configDir(raw);
  const { entries, tracks } = load('movie-player', raw);
  const target = history.findWatchlistTarget(query, { tracks, entries, preferredKind: kind });
  if (!target.ok) return { ok: false, error: target.error, spoken: target.error };
  if (!target.tracks.length) {
    const error = `"${target.name}" is not in this computer's Movie Player library.`;
    return { ok: false, error, spoken: error };
  }
  const now = new Date().toISOString();
  const trackStats = readTrackStats(dir);
  for (const t of target.tracks) {
    trackStats[t.id] = {
      ...(trackStats[t.id] || {}),
      loved: true,
      lovedAt: now,
      dismissedFromWatchlist: false,
      updatedAt: now,
    };
  }
  writeTrackStats(dir, trackStats);
  const h = new history.MediaHistory({ app: 'movie-player', configDir: dir });
  h.recordMany(target.tracks.map(track => ({ track, stats: trackStats[track.id] })));
  await pushOfflineBatch(target.tracks.map(track => ({
    track,
    payload: { ...(trackStats[track.id] || {}), loved: true },
  })));
  const label = target.kind === 'movie' && target.year ? `${target.name} (${target.year})` : target.name;
  const spoken = `Added ${label} to your Movie Player watchlist.`;
  return { ok: true, action: 'added', kind: target.kind, name: target.name, year: target.year || null, count: target.tracks.length, spoken, via: 'history-file' };
}

async function removeFromWatchlist(queryOrOpts, maybeOpts = {}) {
  const raw = typeof queryOrOpts === 'string'
    ? { query: queryOrOpts, ...maybeOpts }
    : { ...(queryOrOpts || {}), ...maybeOpts };
  const query = String(raw.query || raw.title || raw.show || '').trim();
  if (!query) return { ok: false, error: 'Say which show or movie to remove from your watchlist.', spoken: 'Say which show or movie to remove from your watchlist.' };
  const kind = raw.kind || null;

  const live = await callPlayer('movie-player', 'POST', '/api/watchlist-remove', { query, kind }, raw);
  if (live) return { ...live, via: 'movie-player' };

  const dir = configDir(raw);
  const { entries, tracks } = load('movie-player', raw);
  const target = history.findWatchlistTarget(query, { tracks, entries, preferredKind: kind });
  if (!target.ok) return { ok: false, error: target.error, spoken: target.error };

  const now = new Date().toISOString();
  const trackStats = readTrackStats(dir);
  const idSet = new Set(target.tracks.map(t => t.id));
  for (const t of target.tracks) {
    const prev = trackStats[t.id] || {};
    trackStats[t.id] = {
      ...prev,
      loved: false,
      lovedAt: null,
      inProgress: false,
      positionSec: 0,
      progressPct: prev.completed ? 100 : 0,
      dismissedFromWatchlist: true,
      updatedAt: now,
    };
  }
  if (target.tracks.length) writeTrackStats(dir, trackStats);

  // Remove from custom playlists if present
  if (idSet.size) {
    const playlists = readPlaylists(dir);
    let plMutated = false;
    for (const pl of playlists) {
      if (!pl || !Array.isArray(pl.tracks)) continue;
      const before = pl.tracks.length;
      pl.tracks = pl.tracks.filter(t => !t || !idSet.has(t.id));
      if (pl.tracks.length !== before) {
        pl.updatedAt = now;
        plMutated = true;
      }
    }
    if (plMutated) writePlaylists(dir, playlists);
  }

  const h = new history.MediaHistory({ app: 'movie-player', configDir: dir });
  if (target.tracks.length) {
    h.recordMany(target.tracks.map(track => ({ track, stats: trackStats[track.id] })));
  }
  if (target.entryKeys && target.entryKeys.length) {
    const hFile = history.historyFile('movie-player', dir);
    const doc = history.readDoc(hFile);
    let mutated = false;
    for (const k of target.entryKeys) {
      if (doc.entries && doc.entries[k]) {
        doc.entries[k] = {
          ...doc.entries[k],
          loved: false,
          lovedAt: null,
          inProgress: false,
          positionSec: 0,
          dismissedFromWatchlist: true,
          updatedAt: now,
        };
        mutated = true;
      }
    }
    if (mutated) {
      doc.updatedAt = now;
      history.writeDoc(hFile, doc);
    }
  }

  await pushOfflineBatch(target.tracks.map(track => ({
    track,
    payload: {
      ...(trackStats[track.id] || {}),
      loved: false,
      inProgress: false,
      positionSec: 0,
      completed: Boolean(trackStats[track.id]?.completed),
      unwatched: !trackStats[track.id]?.completed,
      dismissedFromWatchlist: true,
    },
  })));

  const label = target.kind === 'movie' && target.year ? `${target.name} (${target.year})` : target.name;
  const spoken = `Removed ${label} from your watchlist.`;
  return { ok: true, action: 'removed', kind: target.kind, name: target.name, year: target.year || null, count: target.tracks.length, spoken, via: 'history-file' };
}

async function markAllNew(queryOrOpts, maybeOpts = {}) {
  const raw = typeof queryOrOpts === 'string'
    ? { show: queryOrOpts, ...maybeOpts }
    : { ...(queryOrOpts || {}), ...maybeOpts };
  const show = String(raw.show || raw.query || raw.title || '').trim();
  const season = raw.season === '' || raw.season === undefined || raw.season === null ? null : Number(raw.season);
  if (!show) return { ok: false, error: 'Say which show to mark as new.', spoken: 'Say which show to mark as new.' };

  const live = await callPlayer('movie-player', 'POST', '/api/mark-episodes-new', { show, season }, raw);
  if (live) return { ...live, via: 'movie-player' };

  const dir = configDir(raw);
  const { entries, tracks } = load('movie-player', raw);
  const found = history.findEpisodeTracks(show, { tracks, season });
  let targetTracks = found.tracks;
  let targetLabel = found.show;
  let kind = 'tv';

  if (!targetTracks.length) {
    const movieTarget = history.findWatchlistTarget(show, { tracks, entries, preferredKind: 'movie' });
    if (movieTarget.ok && movieTarget.tracks.length) {
      targetTracks = movieTarget.tracks;
      targetLabel = movieTarget.name;
      kind = 'movie';
    } else {
      const error = `I could not find "${show}" in your library.`;
      return { ok: false, error, spoken: error };
    }
  }

  const now = new Date().toISOString();
  const trackStats = readTrackStats(dir);
  const resetState = {
    completed: false,
    inProgress: false,
    positionSec: 0,
    progressPct: 0,
    plays: 0,
    lastPlayed: null,
    resetPlays: true,
    updatedAt: now,
  };
  for (const t of targetTracks) {
    trackStats[t.id] = { ...(trackStats[t.id] || {}), ...resetState };
  }
  writeTrackStats(dir, trackStats);
  const h = new history.MediaHistory({ app: 'movie-player', configDir: dir });
  h.recordMany(targetTracks.map(track => ({ track, stats: trackStats[track.id] })));
  await pushOfflineBatch(targetTracks.map(track => ({
    track,
    payload: { unwatched: true, plays: 0, lastPlayed: null },
  })));

  const seasonLabel = season !== null ? ` Season ${season}` : '';
  const spoken = kind === 'movie'
    ? `Marked ${targetLabel} as new and unwatched.`
    : `Marked all ${targetTracks.length} episode${targetTracks.length === 1 ? '' : 's'} of ${targetLabel}${seasonLabel} as new and unwatched.`;
  return { ok: true, kind, show: targetLabel, season, count: targetTracks.length, spoken, via: 'history-file' };
}

async function setCurrentEpisode(opts = {}) {
  const show = String(opts.show || opts.query || opts.title || '').trim();
  const ep = opts.ep !== undefined && opts.ep !== null && String(opts.ep).trim() !== '' ? String(opts.ep).trim() : null;
  const season = opts.season !== undefined && opts.season !== null && opts.season !== '' ? Number(opts.season) : null;
  const episode = opts.episode !== undefined && opts.episode !== null && opts.episode !== '' ? Number(opts.episode) : null;
  if (!show) return { ok: false, error: 'Say which show.', spoken: 'Say which show.' };

  const live = await callPlayer('movie-player', 'POST', '/api/set-current-episode', { show, ep, season, episode }, opts);
  if (live) return { ...live, via: 'movie-player' };

  const dir = configDir(opts);
  const { entries, tracks } = load('movie-player', opts);
  const epInput = ep !== null ? ep : { season, episode };
  const plan = history.planCurrentEpisode(show, epInput, { tracks, entries });
  if (!plan.ok) return plan;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const trackStats = readTrackStats(dir);
  const addLoved = plan.watchedTracks.length === 0;
  const historyItems = [];

  plan.watchedTracks.forEach((t, idx) => {
    const stamp = new Date(nowMs - (plan.watchedTracks.length - 1 - idx) * 1000).toISOString();
    const next = {
      ...(trackStats[t.id] || {}),
      completed: true,
      inProgress: false,
      positionSec: 0,
      progressPct: 100,
      plays: Math.max(1, Number(trackStats[t.id]?.plays) || 0),
      lastPlayed: stamp,
      dismissedFromWatchlist: false,
      resetPlays: false,
      updatedAt: nowIso,
    };
    trackStats[t.id] = next;
    historyItems.push({ track: t, stats: next });
  });

  for (const t of plan.unwatchedTracks) {
    const next = {
      ...(trackStats[t.id] || {}),
      completed: false,
      inProgress: false,
      positionSec: 0,
      progressPct: 0,
      plays: 0,
      lastPlayed: null,
      dismissedFromWatchlist: false,
      resetPlays: true,
      ...(addLoved ? { loved: true, lovedAt: trackStats[t.id]?.lovedAt || nowIso } : {}),
      updatedAt: nowIso,
    };
    trackStats[t.id] = next;
    historyItems.push({ track: t, stats: next });
  }

  if (historyItems.length) {
    writeTrackStats(dir, trackStats);
    const h = new history.MediaHistory({ app: 'movie-player', configDir: dir });
    h.recordMany(historyItems);
  }

  // Also update any history-only entries (from another machine) that have no local track
  if (plan.watchedEntryKeys.length || plan.unwatchedEntryKeys.length) {
    const hFile = history.historyFile('movie-player', dir);
    const doc = history.readDoc(hFile);
    let mutated = false;
    plan.watchedEntryKeys.forEach((k, idx) => {
      if (doc.entries && doc.entries[k]) {
        const stamp = new Date(nowMs - (plan.watchedEntryKeys.length - 1 - idx) * 1000).toISOString();
        doc.entries[k] = {
          ...doc.entries[k],
          completed: true,
          inProgress: false,
          positionSec: 0,
          progressPct: 100,
          plays: Math.max(1, Number(doc.entries[k].plays) || 0),
          lastPlayed: stamp,
          dismissedFromWatchlist: false,
          resetPlays: false,
          updatedAt: nowIso,
        };
        mutated = true;
      }
    });
    for (const k of plan.unwatchedEntryKeys) {
      if (doc.entries && doc.entries[k]) {
        doc.entries[k] = {
          ...doc.entries[k],
          completed: false,
          inProgress: false,
          positionSec: 0,
          progressPct: 0,
          plays: 0,
          lastPlayed: null,
          dismissedFromWatchlist: false,
          resetPlays: true,
          updatedAt: nowIso,
        };
        mutated = true;
      }
    }
    if (mutated) {
      doc.updatedAt = nowIso;
      history.writeDoc(hFile, doc);
    }
  }

  await pushOfflineBatch([
    ...plan.watchedTracks.map(track => ({
      track,
      payload: { ...(trackStats[track.id] || {}), completed: true, unwatched: false, inProgress: false, positionSec: 0 },
    })),
    ...plan.unwatchedTracks.map(track => ({
      track,
      payload: { ...(trackStats[track.id] || {}), completed: false, unwatched: true, inProgress: false, positionSec: 0, plays: 0, lastPlayed: null },
    })),
  ]);

  return {
    ok: true,
    show: plan.show,
    targetSeason: plan.targetSeason,
    targetEpisode: plan.targetEpisode,
    targetCode: plan.targetCode,
    targetEpisodeTitle: plan.targetEpisodeTitle,
    watchedBeforeCount: plan.watchedBeforeCount,
    unwatchedFromCurrentCount: plan.unwatchedFromCurrentCount,
    spoken: plan.spoken,
    via: 'history-file',
  };
}

async function playNextEpisode({ show, targetIp = null, ...opts } = {}) {
  if (!show) return { ok: false, error: 'Which show?' };
  const live = await callPlayer('movie-player', 'POST', '/api/play-next-episode', { show, targetIp }, { ...opts, timeoutMs: 30000 });
  if (live) return live;
  const status = await watchStatus(show, opts);
  return { ok: false, error: 'Open RobOS Movie Player first, then ask again.', status };
}

/**
 * Imports a watch history file or payload (Plex JSON, Tautulli/Trakt/Letterboxd JSON or CSV,
 * RobOS portable history) into Movie Player, Audio Player, Portable History, and RobOS Media Server.
 */
async function importWatchHistory(sourceOrOpts, maybeOpts = {}) {
  const imp = require('./watch-history-import');
  const raw = typeof sourceOrOpts === 'string'
    ? { filePath: sourceOrOpts, ...maybeOpts }
    : { ...(sourceOrOpts || {}), ...maybeOpts };

  let filePath = raw.filePath || raw.path || null;
  if (!filePath && !raw.data && !raw.payload) {
    filePath = imp.findDefaultWatchHistoryFile({ homeDir: raw.homeDir });
    if (!filePath) {
      const error = 'No watch history file specified, and none found in ~/Downloads.';
      return { ok: false, error, spoken: error };
    }
  }
  if (filePath) {
    filePath = path.resolve(String(filePath).replace(/^~(?=$|\/|\\)/, raw.homeDir || process.env.HOME || os.homedir()));
  }

  const body = {
    ...(filePath ? { filePath } : {}),
    ...(raw.data || raw.payload ? { data: raw.data || raw.payload } : {}),
    ...(raw.account ? { account: raw.account } : {}),
    includeAudio: raw.includeAudio !== false,
    pushToServer: raw.pushToServer !== false,
  };

  const live = await callPlayer('movie-player', 'POST', '/api/import-watch-history', body, { ...raw, timeoutMs: 60000 });
  if (live) {
    const { changedMovieStats: _omit, ...rest } = live;
    return { ...rest, via: 'movie-player' };
  }

  const res = await imp.importWatchHistory(raw.data || raw.payload || null, {
    filePath: filePath || '',
    account: raw.account || null,
    includeAudio: raw.includeAudio !== false,
    pushToServer: raw.pushToServer !== false,
    configDir: raw.configDir,
    homeDir: raw.homeDir,
  });
  if (!res.ok) return res;
  const { changedMovieStats: _omit, ...clean } = res;
  return { ...clean, via: 'history-file' };
}

/** Syncs both players' folders, playlists and history with the backup vault now. */
async function syncNow(opts = {}) {
  let sync;
  try { sync = require('./config-sync'); } catch { return { ok: false, error: 'RobOS Config Sync is not installed.' }; }
  const v = sync.getVault({ homeDir: opts.homeDir });
  if (!v) return { ok: false, error: 'No backup vault is connected. In RobOS Preferences open Config Sync → Backup vault → "Use my Google Drive".' };
  if (!v.lastSyncAt) return { ok: false, error: 'Finish the first sync in RobOS Preferences → Config Sync → Backup vault.' };
  const categories = ['movie-library', 'audio-library'].filter(c => v.categories.includes(c));
  try {
    const r = await sync.applyVaultSync({ homeDir: opts.homeDir, categories });
    return { ok: true, vault: v.name, pushed: r.pushed, pulled: r.pulled, merged: r.merged || [] };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || null };
  }
}

module.exports = {
  watchStatus, movieStatus, continueWatching, watchlist, listShows, history: historyList,
  setWatched, addToWatchlist, removeFromWatchlist, markAllNew, setCurrentEpisode,
  importWatchHistory, playNextEpisode, syncNow, callPlayer, controlInfo,
};
