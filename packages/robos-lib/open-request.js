'use strict';

/**
 * Open requests — "open this app at this place" handed from a notification to an app.
 *
 * Desktop Manager launches apps by id only, so a toast or the Notifications app that
 * wants RobOS Preferences on Config Sync → Backup vault writes the place here first:
 *
 *   ~/.config/robos/open-requests/<app-id>.json   { section, tab, reason, at }
 *
 * The app takes (reads and deletes) it when it starts or is brought to the front.
 * Requests older than two minutes are ignored, so a stale one never hijacks a later launch.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_AGE_MS = 2 * 60 * 1000;

function fileFor(appId, homeDir) {
  if (!/^[a-z0-9-]+$/.test(appId || '')) throw new Error(`Invalid app id "${appId}".`);
  return path.join(homeDir || process.env.HOME || os.homedir(), '.config', 'robos', 'open-requests', `${appId}.json`);
}

function writeOpenRequest(appId, request, { homeDir } = {}) {
  const file = fileFor(appId, homeDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...request, at: Date.now() }));
  return file;
}

function takeOpenRequest(appId, { homeDir, maxAgeMs = MAX_AGE_MS } = {}) {
  const file = fileFor(appId, homeDir);
  let req = null;
  try { req = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  fs.rmSync(file, { force: true });
  return req && Date.now() - (req.at || 0) <= maxAgeMs ? req : null;
}

module.exports = { writeOpenRequest, takeOpenRequest };
