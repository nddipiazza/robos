'use strict';
/**
 * RobOS structured event logger.
 *
 * Usage (in any Electron main.js or Node process):
 *   const { createLogger } = require('/usr/local/share/robos/robos-lib/logger');
 *   const log = createLogger('task-planner');
 *   log.info('created-ticket', 'Created Jira ticket', { key: 'KAN-42', summary: 'Fix login' });
 *   log.warn('jira-auth-fail', 'Jira auth failed', { status: 401 });
 *   log.error('crash', 'Renderer crashed', { stack: err.stack });
 *
 * Log files: ~/.config/robos/logs/<app-id>.ndjson
 * Each line is a JSON object: { ts, app, level, event, msg, ...extras }
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const LOG_DIR = path.join(os.homedir(), '.config', 'robos', 'logs');
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per log file — rotate at limit

let _ensuredDirs = new Set();

function ensureDir(dir) {
  if (_ensuredDirs.has(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
  _ensuredDirs.add(dir);
}

function rotateLogs(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_BYTES) {
      const rotated = filePath.replace('.ndjson', `.${Date.now()}.ndjson`);
      fs.renameSync(filePath, rotated);
      // Keep only last 3 rotated files
      const base = path.basename(filePath, '.ndjson');
      const dir  = path.dirname(filePath);
      const old  = fs.readdirSync(dir)
        .filter(f => f.startsWith(base + '.') && f.endsWith('.ndjson'))
        .sort()
        .slice(0, -3);
      old.forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });
    }
  } catch { /* ignore if file doesn't exist yet */ }
}

function writeEntry(filePath, entry) {
  rotateLogs(filePath);
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
}

function createLogger(appId) {
  if (!appId) throw new Error('createLogger requires an appId');

  function log(level, event, msg, extras) {
    try {
      ensureDir(LOG_DIR);
      const filePath = path.join(LOG_DIR, `${appId}.ndjson`);
      const entry = {
        ts:    new Date().toISOString(),
        app:   appId,
        level,
        event,
        msg:   msg || event,
        ...(extras && typeof extras === 'object' ? extras : {}),
      };
      writeEntry(filePath, entry);
    } catch (e) {
      // Never crash the app due to logging failure
      try { process.stderr.write(`[robos-logger] ${e.message}\n`); } catch {}
    }
  }

  return {
    info:  (event, msg, extras) => log('info',  event, msg, extras),
    warn:  (event, msg, extras) => log('warn',  event, msg, extras),
    error: (event, msg, extras) => log('error', event, msg, extras),
    debug: (event, msg, extras) => log('debug', event, msg, extras),
    /** Raw log with explicit level */
    log,
  };
}

/**
 * Read recent log entries across all apps or a specific app.
 * Returns array of parsed JSON entries, newest last.
 * @param {object} opts - { appId?, limit?, level?, event?, since? (ISO string) }
 */
function readLogs(opts = {}) {
  const { appId, limit = 200, level, event: eventFilter, since, search } = opts;
  const entries = [];

  try {
    ensureDir(LOG_DIR);
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.ndjson') && !f.match(/\.\d+\.ndjson$/))
      .filter(f => !appId || f === `${appId}.ndjson`)
      .sort();

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(LOG_DIR, file), 'utf8');
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (level && entry.level !== level) continue;
            if (eventFilter && entry.event !== eventFilter) continue;
            if (since && entry.ts < since) continue;
            if (search) {
              const hay = (entry.msg + ' ' + entry.event + ' ' + (entry.app || '')).toLowerCase();
              if (!hay.includes(search.toLowerCase())) continue;
            }
            entries.push(entry);
          } catch { /* skip malformed lines */ }
        }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* return empty on error */ }

  // Sort newest first then apply limit
  entries.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  return entries.slice(0, limit);
}

/**
 * List all app IDs that have log files.
 */
function listLogApps() {
  try {
    ensureDir(LOG_DIR);
    return fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.ndjson') && !f.match(/\.\d+\.ndjson$/))
      .map(f => f.replace('.ndjson', ''))
      .sort();
  } catch { return []; }
}

module.exports = { createLogger, readLogs, listLogApps, LOG_DIR, registerLogsIPC };

/**
 * Register IPC handlers for log search in any Electron app's main.js.
 * Call once during app startup: registerLogsIPC(ipcMain)
 * Renderer can then invoke 'logs-search' and 'logs-list-apps'.
 */
function registerLogsIPC(ipcMain) {
  try {
    ipcMain.handle('logs-search', async (_, opts = {}) => {
      try {
        const entries = readLogs(opts);
        return { ok: true, entries };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    ipcMain.handle('logs-list-apps', async () => {
      try {
        return { ok: true, apps: listLogApps() };
      } catch (err) {
        return { ok: false, apps: [] };
      }
    });
  } catch { /* graceful failure if called in non-Electron context */ }
}
