'use strict';

const { execFileSync, execFile } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

// Explorer and a running launcher retain the PATH from before WinGet installed
// a tool. Read the current Windows values each time a RobOS app starts.
const registryArgs = ['-NoProfile', '-NonInteractive', '-Command',
  "[Environment]::GetEnvironmentVariable('Path','Machine'); [Environment]::GetEnvironmentVariable('Path','User')"];
function refreshWindowsPath(root, env = process.env, toolsRoot = root, { readRegistry = true } = {}) {
  if (process.platform !== 'win32') return env.PATH;
  let registered = '';
  try {
    if (readRegistry) registered = execFileSync('powershell.exe', registryArgs,
    { encoding: 'utf8', windowsHide: true, timeout: 8000 });
  } catch { /* Keep inherited PATH if Windows policy prevents the registry read. */ }
  return mergePath(root, env, toolsRoot, registered);
}
function mergePath(root, env, toolsRoot, registered) {
  const values = [path.join(toolsRoot, 'tools/bin'), path.join(toolsRoot, 'tools/npm'), path.join(root, 'runtime'), path.join(root, 'runtime/git/cmd'),
    path.join(os.homedir(), 'AppData/Local/Microsoft/WinGet/Links'), registered.replace(/\r?\n/g, ';'), env.PATH || ''];
  const seen = new Set();
  env.PATH = values.join(';').split(';').map(p => p.trim()).filter(p => {
    if (!p || seen.has(p.toLowerCase())) return false;
    seen.add(p.toLowerCase()); return true;
  }).join(';');
  return env.PATH;
}
function refreshWindowsPathAsync(root, env = process.env, toolsRoot = root) {
  if (process.platform !== 'win32') return Promise.resolve(env.PATH);
  return new Promise(resolve => {
    execFile('powershell.exe', registryArgs, { encoding: 'utf8', windowsHide: true, timeout: 8000 }, (_error, stdout) => {
      const result = mergePath(root, env, toolsRoot, stdout || '');
      env.ROBOS_WINDOWS_PATH_UPDATED = String(Date.now());
      resolve(result);
    });
  });
}
module.exports = { refreshWindowsPath, refreshWindowsPathAsync };
