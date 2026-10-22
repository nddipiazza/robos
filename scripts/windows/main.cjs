'use strict';
if (process.env.ROBOS_WINDOWS_AUDIT) {
  const fail = error => { console.error(error?.stack || error); process.exit(1); };
  process.on('uncaughtException', fail);
  process.on('unhandledRejection', fail);
}
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = app.isPackaged ? path.join(process.resourcesPath, 'suite') : path.resolve(__dirname, '..');
const apps = JSON.parse(fs.readFileSync(path.join(root, 'apps.json')));
const id = process.argv.find(a => a.startsWith('--app='))?.slice(6);
process.env.HOME ||= os.homedir();
process.env.ROBOS_LIB_PATH = path.join(root, 'packages/robos-lib');
process.env.ROBOS_APP_BASE = path.join(root, 'packages');
process.env.ROBOS_WINDOWS_HOST = app.isPackaged ? path.join(root, 'windows') : __dirname;
process.env.ROBOS_TOOL_ROOT = app.isPackaged ? path.join(os.homedir(), 'RobOS') : root;
if (process.platform === 'win32') {
  // Software Center's private npm prefix and WinGet portable command aliases.
  require(path.join(root, 'packages/robos-lib/windows-path')).refreshWindowsPath(root, process.env, process.env.ROBOS_TOOL_ROOT);
  process.env.ROBOS_DM_SOCKET ||= require(path.join(root, 'packages/robos-lib/local-ipc-path')).localIpcPath('desktop-manager');
}
// Older apps use the appliance's shared-library prefix. Resolve it inside this installation.
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith('/usr/local/share/robos/')) request = path.join(root, 'packages', request.slice('/usr/local/share/robos/'.length));
  return resolve.call(this, request, ...args);
};
// Shared scripts and styles in older renderers also use the appliance prefix.
app.on('web-contents-created', (_event, contents) => {
  contents.session.webRequest.onBeforeRequest({ urls: ['file:///*'] }, (details, callback) => {
    const pathname = decodeURIComponent(new URL(details.url).pathname);
    const match = pathname.match(/^(?:\/[A-Za-z]:)?\/usr\/local\/share\/robos\/(.*)$/);
    callback(match ? { redirectURL: pathToFileURL(path.join(root, 'packages', match[1])).href } : {});
  });
});
if (id) {
  if (!apps.some(a => a.id === id)) throw new Error('Unknown RobOS app');
  const dir = path.join(root, 'packages', id);
  process.chdir(dir);
  app.setPath('userData', path.join(os.homedir(), '.config/robos/electron', id));
  app.setAppPath(dir);
  if (id === 'household') {
    app.whenReady().then(async () => {
      const server = await require(path.join(dir, 'server.js')).start(0);
      const win = new BrowserWindow({ width: 1280, height: 850, webPreferences: { contextIsolation: true, nodeIntegration: false } });
      win.loadURL(`http://127.0.0.1:${server.address().port}`);
      app.on('before-quit', () => server.close());
    });
    app.on('window-all-closed', () => app.quit());
  } else require(path.join(dir, 'main.js'));
} else {
  app.setName('RobOS');
  app.whenReady().then(() => {
    ipcMain.handle('apps:list', () => apps);
    ipcMain.handle('apps:launch', (_event, appId) => {
      if (!apps.some(a => a.id === appId)) throw new Error('Unknown app');
      const logDir = path.join(os.homedir(), '.config/robos/logs');
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, `${appId}-windows.log`);
      const log = fs.openSync(logPath, 'a');
      const child = spawn(process.execPath, [__dirname, `--app=${appId}`], { detached: true, stdio: ['ignore', log, log], windowsHide: true });
      fs.closeSync(log);
      child.on('error', error => dialog.showErrorBox('Unable to launch app', error.message));
      child.once('exit', code => { if (code) dialog.showErrorBox('App exited with an error', `${appId}: see ${logPath}`); });
      child.unref();
    });
    const win = new BrowserWindow({ width: 1220, height: 900, minWidth: 900, minHeight: 650, backgroundColor: '#10141c', autoHideMenuBar: true, icon: path.join(__dirname, 'robos.ico'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
    win.loadFile(path.join(__dirname, 'index.html'));
  });
  app.on('window-all-closed', () => app.quit());
}
