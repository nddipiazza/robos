'use strict';
const path = require('node:path');
const os = require('node:os');
function paths({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  const xdg = env.XDG_DATA_HOME || path.join(home, '.local/share');
  const local = env.LOCALAPPDATA || path.join(home, 'AppData/Local');
  const data = platform === 'win32' ? path.join(local, 'RobOS') : platform === 'darwin' ? path.join(home, 'Library/Application Support/RobOS') : path.join(xdg, 'robos');
  return { data, root: path.join(data, 'app-manager'),
    // Windows Start menu search leaves an icon blank when a sandboxed (app container) process
    // may write the file, which other software can grant on all of AppData\Local. Windows makes
    // AppData\Local\Programs (its per-user install folder) with permissions of its own.
    icons: platform === 'win32' ? path.join(local, 'Programs/RobOS/icons') : null,
    shortcuts: platform === 'win32' ? path.join(env.APPDATA || path.join(home, 'AppData/Roaming'), 'Microsoft/Windows/Start Menu/Programs/RobOS Apps') :
      platform === 'darwin' ? path.join(home, 'Applications/RobOS Apps') : path.join(xdg, 'applications'),
    image: path.join(data, 'RobOS.AppImage'), macManager: path.join(home, 'Applications/RobOS.app') };
}
module.exports = { paths };
