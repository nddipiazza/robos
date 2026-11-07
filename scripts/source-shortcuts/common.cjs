'use strict';
// Names and locations shared by the shortcut installer and the launch host, so a running
// window always carries the same identity as the shortcut that started it.
const path = require('node:path');
const os = require('node:os');

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const repo = path.resolve(__dirname, '../..');
const host = path.join(__dirname, 'source-host.cjs');

/** The shared Electron every shortcut runs (scripts/source-shortcuts/node_modules/electron), or null. */
function sharedElectron() {
  const pkg = path.join(__dirname, 'node_modules/electron');
  try { delete require.cache[require.resolve(pkg)]; const bin = require(pkg); return require('node:fs').existsSync(bin) ? bin : null; } catch { return null; }
}

/** "RobOS Dev Central (From Source)": Start menu and GNOME search find every app by typing "RobOS". */
const displayName = label => `${/^robos\b/i.test(label) ? label : `RobOS ${label}`} (From Source)`;
const fileName = label => displayName(label).replace(/[<>:"/\\|?*]/g, '_');
// Windows groups a taskbar button with the shortcut whose AppUserModelID matches the window's.
const appUserModelId = id => `com.rowbose.robos.source.${id}`;
// GNOME ties a window to a desktop entry by WM_CLASS (X11) / app_id (Wayland) = StartupWMClass.
const wmClass = id => `robos-source-${id}`;
// Distinct from App Manager's names so installed and from-source copies never collide.
const iconName = id => `robos-source-${id}`;
const icoName = id => `source-${id}`;

function locations({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(home, 'AppData/Local');
    const roaming = env.APPDATA || path.join(home, 'AppData/Roaming');
    return { data: path.join(local, 'RobOS'),
      menu: path.join(roaming, 'Microsoft/Windows/Start Menu/Programs/RobOS (From Source)'),
      // Start menu search leaves icons blank when they sit where app-container processes may
      // write (all of AppData\Local can be granted that); AppData\Local\Programs is safe.
      icons: path.join(local, 'Programs/RobOS/icons') };
  }
  if (platform === 'darwin') {
    return { data: path.join(home, 'Library/Application Support/RobOS'), menu: path.join(home, 'Applications/RobOS (From Source)'),
      desktop: path.join(home, 'Desktop') };
  }
  const xdg = env.XDG_DATA_HOME || path.join(home, '.local/share');
  return { data: path.join(xdg, 'robos'), menu: path.join(xdg, 'applications'), icons: path.join(xdg, 'icons/hicolor') };
}

module.exports = { ID, repo, host, sharedElectron, displayName, fileName, appUserModelId, wmClass, iconName, icoName, locations };
