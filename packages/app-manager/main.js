'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { paths } = require('./lib/paths.cjs');
const { integration } = require('./lib/integration.cjs');
const { Manager } = require('./lib/manager.cjs');
const { activeApps } = require('./lib/leases.cjs');
const locations = paths();
const id = process.argv.find(arg => arg.startsWith('--app='))?.slice(6);
if (id) {
  require('./lib/app-host.cjs').start(id, locations);
} else {
  app.setName('robos-app-manager');
  const profile = path.join(os.homedir(), '.config/robos/electron/app-manager');
  fs.mkdirSync(profile, { recursive: true }); app.setPath('userData', profile);
  if (!app.requestSingleInstanceLock()) { app.quit(); } else {
    let window, manager;
    const running = new Map();
    const image = process.env.APPIMAGE;
    const macBundle = process.platform === 'darwin' && app.isPackaged ? path.resolve(path.dirname(process.execPath), '../..') : null;
    const fromDiskImage = macBundle && !macBundle.startsWith('/Applications/') && !macBundle.startsWith(path.join(os.homedir(), 'Applications') + path.sep);
    const executable = process.platform === 'linux' && image ? locations.image : fromDiskImage ? path.join(locations.macManager, 'Contents/MacOS/RobOS') : process.execPath;
    const native = integration({ locations, executable, host: path.dirname(__filename), packaged: app.isPackaged, shell });
    const show = () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } };
    const removeRequested = argv => argv.find(arg => arg.startsWith('--remove='))?.slice(9);
    async function remove(id) {
      if (activeApps(locations.root).includes(id)) throw new Error('Close the app before removing it');
      const item = manager.installed[id]; if (!item) throw new Error('App is not installed');
      const { response } = await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep app', 'Uninstall'], defaultId: 0, cancelId: 0,
        message: `Uninstall ${item.label}?`, detail: 'The app and its shortcuts will be removed. Your personal data and settings will be kept.' });
      if (response === 1) await manager.uninstall(id);
      return manager.state();
    }
    app.on('second-instance', (_event, argv) => { show(); const id = removeRequested(argv); if (id) remove(id).catch(error => dialog.showErrorBox('Could not remove app', error.message)); });
    app.whenReady().then(async () => {
      fs.mkdirSync(path.join(os.homedir(), '.config/robos/logs'), { recursive: true });
      const logger = require('pino')({ name: 'app-manager' }, require('pino').destination(path.join(os.homedir(), '.config/robos/logs/app-manager.ndjson')));
      manager = new Manager({ locations, native, version: require('./package.json').version, logger });
      try { manager.loadCached(); } catch (error) { logger.warn({ err: error }, 'Ignoring invalid cached catalog'); }
      if (image) native.installManager(image);
      if (fromDiskImage) native.installManager(macBundle);
      ipcMain.handle('manager:state', () => manager.state());
      ipcMain.handle('manager:refresh', () => manager.refresh());
      ipcMain.handle('manager:preview', (_event, ids) => manager.preview(ids));
      ipcMain.handle('manager:install', (_event, ids) => {
        const active = activeApps(locations.root);
        if (active.length && manager.preview(ids).items.length) throw new Error('Close running RobOS apps before installing or updating shared components');
        return manager.install(ids);
      });
      ipcMain.handle('manager:cancel', () => manager.cancel());
      ipcMain.handle('manager:uninstall', (_event, id) => remove(id));
      ipcMain.handle('manager:launch', (_event, id) => {
        if (!manager.installed[id] || manager.installed[id].kind !== 'app') throw new Error('Install this app first');
        if (activeApps(locations.root).includes(id)) throw new Error('This app is already running. Switch to its open window.');
        const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
        const logDir = path.join(os.homedir(), '.config/robos/logs'); fs.mkdirSync(logDir, { recursive: true });
        const log = fs.openSync(path.join(logDir, `${id}.log`), 'a');
        let child;
        try { child = spawn(executable, [...(app.isPackaged ? [] : [path.dirname(__filename)]), `--app=${id}`], { env, stdio: ['ignore', log, log, 'ipc'] }); }
        finally { fs.closeSync(log); }
        running.set(id, child); child.once('exit', () => running.delete(id));
        return new Promise((resolve, reject) => {
          const finish = error => { clearTimeout(timer); child.removeAllListeners('message'); child.removeListener('exit', failed); if (child.connected) child.disconnect(); error ? reject(error) : resolve(true); };
          const failed = code => finish(new Error(`App exited before opening a window (${code}). See ${path.join(logDir, `${id}.log`)}`));
          const timer = setTimeout(() => finish(new Error(`The app did not open a window. See ${path.join(logDir, `${id}.log`)}`)), 30000);
          child.once('error', error => finish(error)); child.once('exit', failed);
          child.on('message', message => { if (message?.type === 'robos:window-ready' && message.id === id) finish(); });
        });
      });
      ipcMain.handle('manager:remove-all', async () => {
        if (activeApps(locations.root).length) throw new Error('Close your running RobOS apps first');
        const { response } = await dialog.showMessageBox(window, { type: 'warning', buttons: ['Keep RobOS', 'Uninstall RobOS'], defaultId: 0, cancelId: 0,
          message: 'Uninstall RobOS and all managed apps?', detail: 'This removes the app downloads and their Start menu or GNOME entries. Personal app data and settings are kept.' });
        if (response !== 1) return;
        await manager.removeAll();
        if (process.platform === 'win32' && app.isPackaged) {
          const uninstaller = path.join(path.dirname(process.execPath), 'Uninstall RobOS.exe');
          if (fs.existsSync(uninstaller)) { const child = spawn(uninstaller, [], { detached: true, stdio: 'ignore' }); child.unref(); }
        } else if (process.platform === 'linux') {
          fs.rmSync(path.join(locations.shortcuts, 'robos-app-manager.desktop'), { force: true });
          fs.rmSync(locations.image, { force: true });
        } else if (process.platform === 'darwin' && macBundle?.endsWith('/RobOS.app')) {
          await shell.trashItem(fromDiskImage ? locations.macManager : macBundle);
        }
        app.quit();
      });
      window = new BrowserWindow({ width: 1180, height: 850, minWidth: 960, minHeight: 600, backgroundColor: '#202020', autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', event => event.preventDefault());
      manager.on('state', state => { if (!window.isDestroyed()) window.webContents.send('manager:state', state); });
      manager.on('progress', value => { if (!window.isDestroyed()) window.webContents.send('manager:progress', value); });
      window.on('close', event => { if (manager.busy) { event.preventDefault(); dialog.showMessageBox(window, { message: 'Wait for the operation to finish or cancel the download before closing.' }); } });
      await window.loadFile(path.join(__dirname, 'renderer/index.html'));
      try {
        const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
        registerSnapshotIPC(window); startDebugServer(window, 19207, 'app-manager');
      } catch { /* Shared diagnostics are optional in standalone builds. */ }
      const requested = removeRequested(process.argv); if (requested) await remove(requested);
    }).catch(error => { dialog.showErrorBox('RobOS App Manager', error.stack || error.message); app.quit(); });
    app.on('window-all-closed', () => app.quit());
  }
}
