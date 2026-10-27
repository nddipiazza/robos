'use strict';
const path = require('node:path');
const os = require('node:os');
function paths({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  const data = platform === 'win32' ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData/Local'), 'RobOS') : path.join(home, '.local/share/robos');
  return { data, root: path.join(data, 'app-manager'),
    shortcuts: platform === 'win32' ? path.join(env.APPDATA || path.join(home, 'AppData/Roaming'), 'Microsoft/Windows/Start Menu/Programs/RobOS Apps') : path.join(home, '.local/share/applications'),
    image: path.join(data, 'RobOS.AppImage') };
}
module.exports = { paths };
