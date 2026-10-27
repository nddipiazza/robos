'use strict';
const path = require('node:path');
const os = require('node:os');
function paths({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  const xdg = env.XDG_DATA_HOME || path.join(home, '.local/share');
  const data = platform === 'win32' ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData/Local'), 'RobOS') : platform === 'darwin' ? path.join(home, 'Library/Application Support/RobOS') : path.join(xdg, 'robos');
  return { data, root: path.join(data, 'app-manager'),
    shortcuts: platform === 'win32' ? path.join(env.APPDATA || path.join(home, 'AppData/Roaming'), 'Microsoft/Windows/Start Menu/Programs/RobOS Apps') :
      platform === 'darwin' ? path.join(home, 'Applications/RobOS Apps') : path.join(xdg, 'applications'),
    image: path.join(data, 'RobOS.AppImage'), macManager: path.join(home, 'Applications/RobOS.app') };
}
module.exports = { paths };
