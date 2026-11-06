'use strict';

/**
 * Keeps a media player's library and watch history in step with your RobOS backup vault
 * (RobOS Preferences → Backup vault, for example "RobOS Config Vault" on Google Drive).
 *
 * Desktop Manager syncs the whole vault in the background on Linux. On Windows and macOS
 * nothing does that, and a player should not wait minutes to show the episode you just
 * finished on the other computer anyway. So each player runs this loop itself, limited to
 * its own Config Sync category ('movie-library' or 'audio-library'):
 *
 *   - a few seconds after the player starts,
 *   - every `intervalMs` (default 2 minutes) while it runs,
 *   - `debounceMs` after you watch or play something (notifyLocalChange()).
 *
 * Watch history files merge entry by entry, so two computers never conflict over them.
 * Folders and playlists changed on both computers are a real conflict: the run stops,
 * nothing is overwritten, and Preferences shows it (background sync's notification).
 *
 * Nothing happens until a vault is connected and its first sync is done in Preferences.
 *
 *   const s = startMediaCloudSync({ category: 'movie-library', onPulled: rels => reload(rels) });
 *   s.notifyLocalChange();  s.runNow('manual');  s.status();  s.stop();
 */

const os = require('node:os');

function loadSync() {
  try { return require('./config-sync'); } catch { return null; }
}

function startMediaCloudSync({
  category,
  homeDir,
  onPulled = () => {},
  onStatus = () => {},
  log = () => {},
  startDelayMs = Number(process.env.ROBOS_MEDIA_SYNC_START_MS || 4000),
  intervalMs = Number(process.env.ROBOS_MEDIA_SYNC_INTERVAL_MS || 120000),
  debounceMs = Number(process.env.ROBOS_MEDIA_SYNC_DEBOUNCE_MS || 8000),
  fetchImpl,
  sync = loadSync(),
} = {}) {
  const home = homeDir || process.env.HOME || os.homedir();
  let timer = null, changeTimer = null, running = null, stopped = false;
  let last = { outcome: 'idle', at: null };

  const schedule = ms => {
    clearTimeout(timer);
    if (!stopped) { timer = setTimeout(() => run('interval'), ms); timer.unref?.(); }
  };

  async function once(reason) {
    if (!sync) return { outcome: 'unavailable' };
    const v = sync.getVault({ homeDir: home });
    if (!v) return { outcome: 'no-vault' };
    if (!v.lastSyncAt) return { outcome: 'first-sync-pending' };
    if (v.auto && v.auto.enabled === false && reason !== 'manual') return { outcome: 'disabled' };
    if (!v.categories.includes(category)) return { outcome: 'category-off' };
    for (let i = 0; i < 2; i++) {
      try {
        const plan = await sync.planVaultSync({ homeDir: home, categories: [category], fetchImpl });
        const conflicts = plan.actions.filter(a => a.action === 'conflict');
        if (conflicts.length) return { outcome: 'conflicts', conflicts: conflicts.map(c => c.rel) };
        if (!plan.actions.length) return { outcome: 'up-to-date' };
        const r = await sync.applyVaultSync({ homeDir: home, categories: [category], fetchImpl });
        return { outcome: 'synced', pushed: r.pushed, pulled: r.pulled, merged: r.merged || [], generation: r.generation };
      } catch (err) {
        if (err.code === 'REMOTE_CHANGED' && i === 0) continue;
        if (err.code === 'BUSY') return { outcome: 'busy' };
        if (err.code === 'CONFLICTS') return { outcome: 'conflicts', conflicts: (err.conflicts || []).map(c => c.rel) };
        return { outcome: 'error', error: err.message, code: err.code || null };
      }
    }
    return { outcome: 'busy' };
  }

  async function run(reason = 'manual') {
    if (running) return running;
    clearTimeout(changeTimer);
    running = once(reason).catch(err => ({ outcome: 'error', error: err.message }));
    try {
      const res = await running;
      last = { ...res, reason, at: new Date().toISOString() };
      if (res.outcome === 'synced') {
        log(`media sync (${category}, ${reason}): ↑${res.pushed.length} ↓${res.pulled.length} ⇄${res.merged.length}`);
        const changedHere = [...res.pulled, ...res.merged];
        if (changedHere.length) { try { onPulled(changedHere, res); } catch (err) { log(`media sync onPulled failed: ${err.message}`); } }
      } else if (res.outcome === 'error' || res.outcome === 'conflicts') {
        log(`media sync (${category}, ${reason}): ${res.outcome}${res.error ? ` (${res.error})` : ''}`);
      }
      try { onStatus(last); } catch {}
      return last;
    } finally {
      running = null;
      schedule(intervalMs);
    }
  }

  function notifyLocalChange() {
    if (stopped) return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => run('change'), debounceMs);
    changeTimer.unref?.();
  }

  schedule(startDelayMs);
  return {
    runNow: reason => run(reason || 'manual'),
    notifyLocalChange,
    status: () => ({ category, ...last, vault: sync ? sync.getVault({ homeDir: home }) : null }),
    stop() { stopped = true; clearTimeout(timer); clearTimeout(changeTimer); },
  };
}

module.exports = { startMediaCloudSync };
