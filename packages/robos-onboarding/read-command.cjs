'use strict';
const { execFile } = require('node:child_process');

// Status checks must not freeze Electron while a tool initializes or hangs.
function readCommand(file, args = [], { timeout = 5000 } = {}) {
  return new Promise(resolve => {
    execFile(file, args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        if (error.killed) console.warn(JSON.stringify({ level: 40, app: 'robos-onboarding', msg: 'Status probe timed out', tool: file, timeout }));
        resolve(null);
      } else resolve(stdout.trim());
    });
  });
}
module.exports = { readCommand };
