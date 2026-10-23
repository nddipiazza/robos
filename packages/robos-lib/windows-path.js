'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

// Explorer and a running launcher retain the PATH from before WinGet installed
// a tool. Read the current Windows values each time a RobOS app starts.
function refreshWindowsPath(root, env = process.env, toolsRoot = root) {
  if (process.platform !== 'win32') return env.PATH;
  let registered = '';
  try {
    registered = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "[Environment]::GetEnvironmentVariable('Path','Machine'); [Environment]::GetEnvironmentVariable('Path','User')"],
    { encoding: 'utf8', windowsHide: true, timeout: 8000 });
  } catch { /* Keep inherited PATH if Windows policy prevents the registry read. */ }
  const values = [path.join(toolsRoot, 'tools/bin'), path.join(toolsRoot, 'tools/npm'), path.join(root, 'runtime'), path.join(root, 'runtime/git/cmd'),
    path.join(os.homedir(), 'AppData/Local/Microsoft/WinGet/Links'), registered.replace(/\r?\n/g, ';'), env.PATH || ''];
  const seen = new Set();
  env.PATH = values.join(';').split(';').map(p => p.trim()).filter(p => {
    if (!p || seen.has(p.toLowerCase())) return false;
    seen.add(p.toLowerCase()); return true;
  }).join(';');
  return env.PATH;
}
module.exports = { refreshWindowsPath };
