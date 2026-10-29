'use strict';

/**
 * RobOS Config Sync — background sync, so the backup vault stays mirrored without
 * opening Preferences (like the IntelliJ settings repository).
 *
 * Desktop Manager, which starts at login, calls startAutoSync(). It syncs:
 *   - shortly after login,
 *   - every vault.auto.intervalMinutes (default 5),
 *   - soon after a backed-up file under ~/.config/robos or ~/.robos changes (vault.auto.watch).
 *
 * A background run only applies a plan with no conflicts. When a file changed both here
 * and in the vault, the vault is encrypted and this machine has no key, or the vault
 * cannot be opened, nothing is written: it posts one RobOS notification
 * ("Config Sync needs you: 1 conflict") whose action opens Preferences on the Backup
 * vault tab, and keeps that state in state.json (vault.auto.attention) until a sync succeeds.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const sync = require('./config-sync');

const SOURCE = 'robos-config-sync';
const ACCESS_RE = /sign in again|not signed in|HTTP 40[13]|does not have access|could not find that folder/i;

const homeOf = opts => opts.homeDir || process.env.HOME || os.homedir();
const configDir = home => path.join(home, '.config', 'robos');
const envMs = (name, fallback) => (process.env[name] && Number(process.env[name]) >= 0 ? Number(process.env[name]) : fallback);

// ── Notifications ────────────────────────────────────────────────────────────

function store() { try { return require('./auth-notifications'); } catch { return null; } }

/** Prepends an entry to ~/.config/robos/notifications.json (robos-toast shows it). */
function postNotification(home, entry) {
  const s = store();
  if (!s) return null;
  s.update(configDir(home), file => s.write(file, [entry, ...s.read(file, [])].slice(0, 500)));
  return entry.id;
}

function markRead(home, id) {
  const s = store();
  if (!s || !id) return;
  s.update(configDir(home), file => {
    const list = s.read(file, []);
    if (list.some(n => n.id === id && !n.read)) s.write(file, list.map(n => (n.id === id ? { ...n, read: true, resolvedAt: new Date().toISOString() } : n)));
  });
}

function attentionText(a) {
  if (a.kind === 'conflicts') {
    const names = a.rels.slice(0, 3).map(r => r.split('/').pop()).join(', ') + (a.rels.length > 3 ? ` and ${a.rels.length - 3} more` : '');
    return {
      title: `Config Sync needs you: ${a.count} conflict${a.count > 1 ? 's' : ''}`,
      body: `${names} changed on this machine and in your backup vault. Background sync is paused until you choose which version to keep.`,
    };
  }
  if (a.kind === 'locked') {
    return { title: 'Config Sync needs you: vault passphrase', body: 'Your backup vault is encrypted and this machine has no key for it. Reconnect it with the passphrase to keep syncing.' };
  }
  return { title: 'Config Sync needs you: cannot open the vault', body: a.message };
}

function notificationFor(a) {
  return {
    id: crypto.randomUUID(), entityKey: 'config-sync:vault', ...attentionText(a),
    icon: 'sync', category: 'system', tier: 'warning', source: SOURCE, sticky: true, bypassAntiSpam: true,
    ts: new Date().toISOString(), read: false,
    action: { type: 'open-app', app: 'robos-preferences', label: 'Review in Preferences', open: { section: 'config_sync', tab: 'vault', reason: a.kind } },
  };
}

// ── One background run ───────────────────────────────────────────────────────

async function attempt(home, opts) {
  for (let i = 0; ; i++) {
    const plan = await sync.planVaultSync({ homeDir: home, fetchImpl: opts.fetchImpl });
    const conflicts = plan.actions.filter(a => a.action === 'conflict');
    if (conflicts.length) return { outcome: 'conflicts', conflicts };
    if (!plan.actions.length) return { outcome: 'up-to-date' };
    try {
      const r = await sync.applyVaultSync({ homeDir: home, fetchImpl: opts.fetchImpl });
      return { outcome: 'synced', generation: r.generation, pushed: r.pushed, pulled: r.pulled, deleted: [...r.deletedLocal, ...r.deletedRemote], restorePointId: r.restorePointId };
    } catch (err) {
      if (err.code === 'CONFLICTS') return { outcome: 'conflicts', conflicts: err.conflicts };
      // Another machine pushed between the plan and the upload: plan once more.
      if (err.code === 'REMOTE_CHANGED' && i === 0) continue;
      throw err;
    }
  }
}

function attentionOf(res) {
  if (res.outcome === 'conflicts') {
    const rels = res.conflicts.map(c => c.rel).sort();
    return { kind: 'conflicts', count: rels.length, rels, signature: `conflicts:${rels.join('|')}` };
  }
  if (res.outcome === 'locked' || res.outcome === 'access') return { kind: res.outcome, count: 1, rels: [], message: res.error, signature: `${res.outcome}:${res.error}` };
  return null;
}

/**
 * Runs one background sync if the vault has it turned on (or opts.force). Never resolves
 * conflicts and never throws for sync failures; returns { outcome, ... } where outcome is
 * no-vault | disabled | first-sync-pending | busy | up-to-date | synced | conflicts | locked | access | error.
 */
async function runAutoSync(opts = {}) {
  const home = homeOf(opts);
  const v = sync.getVault({ homeDir: home });
  if (!v) return { outcome: 'no-vault' };
  if (!v.auto.enabled && !opts.force) return { outcome: 'disabled' };
  // The first sync decides how to combine this machine with the vault; the user does that.
  if (!v.lastSyncAt) return { outcome: 'first-sync-pending' };

  let res;
  try { res = await attempt(home, opts); }
  catch (err) {
    if (err.code === 'BUSY') return { outcome: 'busy' };
    const outcome = err.code === 'PASSPHRASE_REQUIRED' || err.code === 'WRONG_PASSPHRASE' ? 'locked' : ACCESS_RE.test(err.message) ? 'access' : 'error';
    res = { outcome, error: err.message, code: err.code || null };
  }

  const prev = v.auto.attention;
  let attention = attentionOf(res);
  if (attention) {
    if (prev?.signature === attention.signature) attention = prev;
    else {
      markRead(home, prev?.notificationId);
      attention = { ...attention, at: new Date().toISOString(), notificationId: postNotification(home, notificationFor(attention)) };
    }
    res.notified = attention !== prev;
  } else if (res.outcome === 'error') {
    attention = prev || null; // offline for a while is not something to act on
  } else if (prev) {
    markRead(home, prev.notificationId);
  }
  sync.recordAutoRun({
    homeDir: home, vaultId: v.id,
    patch: { lastRunAt: new Date().toISOString(), lastOutcome: res.outcome, lastError: res.error || null, attention },
  });
  return { ...res, attention };
}

/** Clears the "needs you" state after the user synced from Preferences. */
function clearAttention(opts = {}) {
  const home = homeOf(opts);
  const v = sync.getVault({ homeDir: home });
  if (!v?.auto.attention) return { ok: true, cleared: false };
  markRead(home, v.auto.attention.notificationId);
  sync.recordAutoRun({ homeDir: home, vaultId: v.id, patch: { attention: null, lastOutcome: 'synced', lastError: null } });
  return { ok: true, cleared: true };
}

// ── The background loop ──────────────────────────────────────────────────────

/**
 * Starts background sync for this user. Timers can be shortened for tests with
 * ROBOS_CONFIG_SYNC_LOGIN_DELAY_MS, ROBOS_CONFIG_SYNC_INTERVAL_MS and ROBOS_CONFIG_SYNC_DEBOUNCE_MS.
 * Returns { runNow(reason), stop() }.
 */
function startAutoSync(opts = {}) {
  const home = homeOf(opts);
  const log = opts.log || (() => {});
  const loginDelayMs = opts.loginDelayMs ?? envMs('ROBOS_CONFIG_SYNC_LOGIN_DELAY_MS', 20000);
  const debounceMs = opts.debounceMs ?? envMs('ROBOS_CONFIG_SYNC_DEBOUNCE_MS', 15000);
  const intervalMs = opts.intervalMs ?? envMs('ROBOS_CONFIG_SYNC_INTERVAL_MS', 0);
  const roots = { config: configDir(home), robos: path.join(home, '.robos') };
  const syncDir = path.join(roots.config, 'config-sync');

  let timer = null, changeTimer = null, stateTimer = null, running = null, stopped = false, quietUntil = 0, key = null, active = false;
  const watchers = new Map();

  const schedule = ms => { clearTimeout(timer); timer = stopped ? null : setTimeout(() => run('interval'), ms); };

  async function run(reason) {
    if (running) return running;
    clearTimeout(changeTimer);
    running = runAutoSync({ homeDir: home, fetchImpl: opts.fetchImpl, reason })
      .catch(err => ({ outcome: 'error', error: err.message }))
      .then(res => {
        const moved = res.outcome === 'synced' ? ` ↑${res.pushed.length} ↓${res.pulled.length} ✕${res.deleted.length}` : '';
        if (res.outcome !== 'no-vault' && res.outcome !== 'disabled') log(`${reason}: ${res.outcome}${moved}${res.error ? ` (${res.error})` : ''}`);
        return res;
      });
    try { return await running; } finally {
      running = null;
      quietUntil = Date.now() + 1500; // our own pulls are not edits
      clearTimeout(timer); timer = null;
      refresh();
    }
  }

  function toRel(abs) {
    for (const [root, base] of Object.entries(roots)) if (abs.startsWith(base + path.sep)) return `${root}/${abs.slice(base.length + 1).split(path.sep).join('/')}`;
    return null;
  }

  function onChange(dir, name) {
    if (!name || running || Date.now() < quietUntil || /\.tmp$|~$/.test(name)) return;
    const rel = toRel(path.join(dir, String(name)));
    if (!rel || rel.startsWith('config/config-sync/') || sync.isExcluded(rel)) return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => run('change'), debounceMs);
  }

  // Watches the folders that hold backed-up files (not whole trees, which can be large).
  function rewatch() {
    const dirs = new Set(Object.values(roots).filter(d => fs.existsSync(d)));
    for (const f of sync.listLocalFiles(home).files) { if (dirs.size >= 1000) break; dirs.add(path.dirname(f.abs)); }
    for (const [dir, w] of watchers) if (!dirs.has(dir)) { w.close(); watchers.delete(dir); }
    for (const dir of dirs) {
      if (watchers.has(dir)) continue;
      try { const w = fs.watch(dir, (_, name) => onChange(dir, name)); w.on('error', () => { w.close(); watchers.delete(dir); }); watchers.set(dir, w); } catch {}
    }
  }
  const unwatch = () => { for (const w of watchers.values()) w.close(); watchers.clear(); };

  // Re-reads vault.auto (Preferences may have changed it) and adjusts the timer and watchers.
  function refresh() {
    if (stopped) return;
    const v = sync.getVault({ homeDir: home });
    const next = v ? [v.id, v.auto.enabled, v.auto.intervalMinutes, v.auto.watch, Boolean(v.lastSyncAt)].join('|') : 'none';
    const changed = next !== key;
    key = next;
    const wasActive = active;
    active = Boolean(v && v.auto.enabled && v.lastSyncAt);
    if (!active) { clearTimeout(timer); timer = null; unwatch(); return; }
    if (v.auto.watch) rewatch(); else unwatch();
    // Just turned on (or first sync done in Preferences): sync soon, then on the interval.
    if (wasActive && (changed || !timer)) schedule(intervalMs || v.auto.intervalMinutes * 60000);
    else if (!wasActive) schedule(Math.min(loginDelayMs, 5000));
  }

  fs.mkdirSync(syncDir, { recursive: true });
  let stateWatcher = null;
  try {
    stateWatcher = fs.watch(syncDir, (_, name) => {
      if (name !== 'state.json' || running) return;
      clearTimeout(stateTimer);
      stateTimer = setTimeout(refresh, 300);
    });
  } catch {}

  refresh();
  if (timer) schedule(loginDelayMs);

  return {
    runNow: (reason = 'manual') => run(reason),
    stop() {
      stopped = true;
      clearTimeout(timer); clearTimeout(changeTimer); clearTimeout(stateTimer);
      stateWatcher?.close();
      unwatch();
    },
  };
}

module.exports = { runAutoSync, startAutoSync, clearAttention, SOURCE, _internal: { attentionText, notificationFor } };
