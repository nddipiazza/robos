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

// ── Changes ──────────────────────────────────────────────────────────────────

async function setWatched({ show, season = null, episode = null, watched = true, ...opts } = {}) {
  if (!show) return { ok: false, error: 'Which show?' };
  const body = { show, season: season === '' ? null : season, episode: episode === '' ? null : episode, watched: watched !== false };
  const live = await callPlayer('movie-player', 'POST', '/api/set-watched', body, opts);
  if (live) return { ...live, via: 'movie-player' };
  // The player is closed: write the history file; the player applies it when it opens.
  const { tracks } = load('movie-player', opts);
  const found = history.findEpisodeTracks(show, { tracks, season: body.season, episode: body.episode });
  if (!found.tracks.length) return { ok: false, error: `No episodes of "${show}" matched in this computer's library.` };
  const h = new history.MediaHistory({ app: 'movie-player', configDir: configDir(opts) });
  const now = new Date().toISOString();
  const stats = body.watched
    ? { completed: true, inProgress: false, positionSec: 0, progressPct: 100, plays: 1, lastPlayed: now }
    : { completed: false, inProgress: false, positionSec: 0, progressPct: 0 };
  h.recordMany(found.tracks.map(track => ({ track, stats })));
  return { ok: true, show: found.show, season: body.season, episode: body.episode, watched: body.watched, count: found.tracks.length, via: 'history-file' };
}

async function playNextEpisode({ show, targetIp = null, ...opts } = {}) {
  if (!show) return { ok: false, error: 'Which show?' };
  const live = await callPlayer('movie-player', 'POST', '/api/play-next-episode', { show, targetIp }, { ...opts, timeoutMs: 30000 });
  if (live) return live;
  const status = await watchStatus(show, opts);
  return { ok: false, error: 'Open RobOS Movie Player first, then ask again.', status };
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
  watchStatus, movieStatus, continueWatching, listShows, history: historyList,
  setWatched, playNextEpisode, syncNow, callPlayer, controlInfo,
};
