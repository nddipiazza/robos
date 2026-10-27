'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
function start(id, locations) {
  const { app, BrowserWindow } = require('electron');
  const installed = JSON.parse(fs.readFileSync(path.join(locations.root, 'installed.json'), 'utf8'));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || installed[id]?.kind !== 'app') throw new Error('This RobOS app is not installed');
  const root = locations.root, dir = path.join(root, 'packages', id);
  try {
    const release = require('./leases.cjs').acquire(root, id);
    app.on('will-quit', release);
  } catch (error) {
    if (error.code === 'EEXIST') { app.quit(); return; }
    throw error;
  }
  process.env.HOME ||= os.homedir();
  process.env.ROBOS_APP_BASE = path.join(root, 'packages');
  process.env.ROBOS_LIB_PATH = path.join(root, 'packages/robos-lib');
  process.env.ROBOS_GRAPH_ROOT = root;
  process.env.ROBOS_TOOL_ROOT = path.join(locations.data, 'tools');
  // Bridge appliance library imports and file URLs into the per-user installation.
  const Module = require('node:module'), original = Module._resolveFilename;
  Module._resolveFilename = function(request, ...args) {
    if (request.startsWith('/usr/local/share/robos/')) request = path.join(root, 'packages', request.slice('/usr/local/share/robos/'.length));
    return original.call(this, request, ...args);
  };
  app.on('web-contents-created', (_event, contents) => {
    contents.session.webRequest.onBeforeRequest({ urls: ['file:///*'] }, (details, callback) => {
      const match = decodeURIComponent(new URL(details.url).pathname).match(/^(?:\/[A-Za-z]:)?\/usr\/local\/share\/robos\/(.*)$/);
      callback(match ? { redirectURL: pathToFileURL(path.join(root, 'packages', match[1])).href } : {});
    });
  });
  if (process.platform === 'win32') {
    try { require(path.join(root, 'packages/robos-lib/windows-path')).refreshWindowsPath(root, process.env, process.env.ROBOS_TOOL_ROOT); } catch {}
  }
  app.setName(`robos-${id}`);
  app.setPath('userData', path.join(os.homedir(), '.config/robos/electron', id));
  app.setAppPath(dir); process.chdir(dir);
  if (process.platform === 'win32') app.setAppUserModelId(`com.rowbose.robos.${id}`);
  app.on('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', () => {
      if (!window.isDestroyed() && process.connected) process.send({ type: 'robos:window-ready', id, title: window.getTitle() });
    });
  });
  if (id === 'household') {
    app.whenReady().then(async () => {
      const server = await require(path.join(dir, 'server.js')).start(0);
      const win = new BrowserWindow({ width: 1280, height: 850, webPreferences: { contextIsolation: true, nodeIntegration: false } });
      win.loadURL(`http://127.0.0.1:${server.address().port}`); app.on('before-quit', () => server.close());
    });
    app.on('window-all-closed', () => app.quit());
  } else require(path.join(dir, 'main.js'));
}
module.exports = { start };
