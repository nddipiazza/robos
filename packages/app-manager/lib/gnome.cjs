'use strict';
const { execFileSync } = require('node:child_process');
const MANAGER_ENTRY = 'robos-app-manager.desktop';
const SHELL = 'org.gnome.shell', FOLDERS = 'org.gnome.desktop.app-folders';
const FOLDER_ID = 'RobOS', FOLDER_NAME = 'RobOS Apps';
const FOLDER = `${FOLDERS}.folder:/org/gnome/desktop/app-folders/folders/${FOLDER_ID}/`;
const gsettings = args => execFileSync('gsettings', args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
// gsettings prints double quotes only for values holding an apostrophe. Those are
// not parsed, so a list that cannot be read faithfully is never written back.
function parseList(text) {
  if (text.includes('"')) throw new Error('Unsupported gsettings list');
  return [...text.matchAll(/'([^']*)'/g)].map(match => match[1]);
}
const formatList = items => `[${items.map(item => `'${item}'`).join(', ')}]`;
// Dock and app-grid state belongs to the user's GNOME session. It is a convenience
// on top of the desktop entries, so failures never block installing or removing apps.
function gnome({ run = gsettings, env = process.env } = {}) {
  // Electron replaces XDG_CURRENT_DESKTOP with "Unity" at startup and keeps the real value here.
  const enabled = /gnome/i.test(env.ORIGINAL_XDG_CURRENT_DESKTOP || env.XDG_CURRENT_DESKTOP || '');
  const attempt = work => { if (!enabled) return false; try { return work() !== false; } catch { return false; } };
  const update = (schema, key, change) => attempt(() => {
    const before = parseList(run(['get', schema, key])), after = change(before);
    if (after.join() === before.join()) return true;
    run(['set', schema, key, formatList(after)]);
  });
  return {
    pin: entry => update(SHELL, 'favorite-apps', list => list.includes(entry) ? list : [...list, entry]),
    unpin: match => update(SHELL, 'favorite-apps', list => list.filter(entry => !match(entry))),
    // Windows and macOS keep managed apps in a "RobOS Apps" folder. Membership is listed
    // by app ID because GNOME refreshes category folders from a stale list of new apps.
    addToFolder: entry => attempt(() => {
      if (!parseList(run(['get', FOLDERS, 'folder-children'])).includes(FOLDER_ID)) {
        run(['set', FOLDER, 'name', FOLDER_NAME]);
        update(FOLDERS, 'folder-children', list => [...list, FOLDER_ID]);
      }
      return update(FOLDER, 'apps', list => list.includes(entry) ? list : [...list, entry]);
    }),
    removeFromFolder: entry => update(FOLDER, 'apps', list => list.filter(item => item !== entry)),
    removeFolder: () => attempt(() => {
      update(FOLDERS, 'folder-children', list => list.filter(id => id !== FOLDER_ID));
      run(['reset-recursively', FOLDER]);
    }),
  };
}
module.exports = { gnome, parseList, formatList, MANAGER_ENTRY };
