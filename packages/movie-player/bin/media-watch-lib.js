'use strict';
// Finds robos-lib/media-watch: ROBOS_LIB_PATH (App Manager installs), the repo checkout, or the VM.
const path = require('node:path');

module.exports = function loadMediaWatch() {
  const candidates = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'media-watch'),
    path.resolve(__dirname, '..', '..', 'robos-lib', 'media-watch'),
    '/usr/local/share/robos/robos-lib/media-watch',
  ].filter(Boolean);
  for (const p of candidates) {
    try { return require(p); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
  }
  throw new Error('robos-lib (media-watch) is not installed. Install "RobOS Movie Player" with App Manager, or run from the RobOS repository.');
};
