'use strict';
// Electron entry point for "(From Source)" shortcuts:
//   <package's electron> scripts/source-shortcuts/source-host.cjs --app=<id>
// It runs packages/<id>/main.js from this clone exactly as `npm start` would (same userData
// folder, same app path and working directory) and gives the process the identity its
// shortcut declares, so the taskbar / dock / Alt+Tab show the app's own icon and group the
// running window with the pinned shortcut instead of a generic Electron entry:
//   Windows  AppUserModelID com.rowbose.robos.source.<id> + the app's .ico on every window
//   Linux    WM_CLASS / desktop name robos-source-<id> + icon.png as _NET_WM_ICON
//   macOS    the app's icon on the Dock tile
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const common = require('./common.cjs');

const id = (process.argv.find(arg => arg.startsWith('--app=')) || '').slice('--app='.length);
const dir = path.join(common.repo, 'packages', id);
if (!common.ID.test(id) || !fs.existsSync(path.join(dir, 'package.json'))) {
  console.error(`source-host: no RobOS app "${id}" in ${path.join(common.repo, 'packages')}`);
  process.exit(64);
}
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const name = pkg.productName || pkg.name || id;

// `electron <dir>` names the app after package.json and keeps its data in appData/<name>.
app.setPath('userData', path.join(app.getPath('appData'), name));
process.env.ROBOS_SOURCE_APP = id;

if (process.platform === 'linux') {
  // Chromium derives WM_CLASS / the Wayland app_id from the app name. Many apps rename
  // themselves in main.js; that would split the window from its launcher entry in the dock.
  app.setName(common.wmClass(id));
  app.setName = () => {};
  if (app.setDesktopName) app.setDesktopName(`${common.wmClass(id)}.desktop`);
} else app.setName(name);

if (process.platform === 'win32') {
  app.setAppUserModelId(common.appUserModelId(id));
  // An app setting its own ID would detach its windows from the shortcut's icon.
  app.setAppUserModelId = () => {};
}

if (typeof app.setAppPath === 'function') app.setAppPath(dir);
process.chdir(dir);

const png = path.join(dir, 'icon.png');
let windowIcon = null;
if (fs.existsSync(png)) {
  if (process.platform === 'win32') {
    // Windows wants an .ico (with small sizes) for the taskbar button and Alt+Tab.
    try { windowIcon = require('./icons.cjs').ensureIco(png, common.locations().icons, common.icoName(id)); } catch {}
  } else if (process.platform === 'linux') windowIcon = png; // Electron needs a raster image here.
  else app.whenReady().then(() => { try { app.dock?.setIcon(png); } catch {} });
}
if (windowIcon) app.on('browser-window-created', (_event, window) => { try { window.setIcon(windowIcon); } catch {} });

if (id === 'household') {
  // Household is a web server; App Manager opens it the same way (lib/app-host.cjs).
  app.whenReady().then(async () => {
    const server = await require(path.join(dir, 'server.js')).start(0);
    const win = new BrowserWindow({ width: 1280, height: 850, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    win.loadURL(`http://127.0.0.1:${server.address().port}`);
    app.on('before-quit', () => server.close());
  });
  app.on('window-all-closed', () => app.quit());
} else require(path.join(dir, pkg.main || 'main.js'));
