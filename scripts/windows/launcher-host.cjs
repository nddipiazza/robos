'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launchApp } = require('./launch-app.cjs');

const ACCELERATOR = 'Super+Shift+Space';
function loginCommand(executable, host, packaged, portableExecutable) {
  return { path: portableExecutable || executable, args: [...(packaged ? [] : [host]), '--background'] };
}

function startLauncher(electron, { root, apps, host, home = os.homedir() }) {
  const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut } = electron;
  const prefsFile = path.join(home, '.config/robos/windows-launcher.json');
  let prefs = { shortcutEnabled: false, startAtLogin: false };
  try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(prefsFile, 'utf8')) }; } catch {}
  let win, tray, quitting = false, shortcutError = '';
  const pending = new Map();
  app.on('before-quit', () => { quitting = true; });
  const lifetime = require('./portable-lifetime.cjs').portableLifetime(app, BrowserWindow, !!process.env.PORTABLE_EXECUTABLE_FILE);
  const save = () => {
    fs.mkdirSync(path.dirname(prefsFile), { recursive: true });
    fs.writeFileSync(`${prefsFile}.tmp`, JSON.stringify(prefs, null, 2));
    fs.renameSync(`${prefsFile}.tmp`, prefsFile);
  };
  const state = () => ({ ...prefs, shortcutActive: globalShortcut.isRegistered(ACCELERATOR), shortcutError });
  const show = () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus(); win.webContents.send('launcher:shown');
  };
  const toggle = () => win?.isVisible() && win.isFocused() ? win.hide() : show();
  const shortcut = enabled => {
    if (enabled && !globalShortcut.isRegistered(ACCELERATOR) && !globalShortcut.register(ACCELERATOR, toggle)) {
      shortcutError = 'Win + Shift + Space is in use by another application.';
      throw new Error(shortcutError);
    }
    if (!enabled) globalShortcut.unregister(ACCELERATOR);
    shortcutError = ''; prefs.shortcutEnabled = enabled; save(); return state();
  };
  app.on('will-quit', () => { globalShortcut.unregisterAll(); tray?.destroy(); });
  app.on('second-instance', () => app.whenReady().then(show));
  app.whenReady().then(() => {
    ipcMain.handle('apps:list', () => apps);
    ipcMain.handle('apps:launch', async (_event, id) => {
      if (!apps.some(a => a.id === id)) throw new Error('Unknown app');
      if (!pending.has(id)) pending.set(id, launchApp({ executable: process.execPath, host, packaged: app.isPackaged, id,
        logDir: path.join(home, '.config/robos/logs'), env: process.env, watch: child => lifetime.watch(child) }).finally(() => pending.delete(id)));
      const result = await pending.get(id);
      win.hide(); return result;
    });
    ipcMain.handle('launcher:state', state);
    ipcMain.handle('launcher:shortcut', (_event, enabled) => shortcut(enabled === true));
    ipcMain.handle('launcher:login', (_event, enabled) => {
      const command = loginCommand(process.execPath, host, app.isPackaged, process.env.PORTABLE_EXECUTABLE_FILE);
      app.setLoginItemSettings({ ...command, openAtLogin: enabled === true, name: 'RobOS Launcher' });
      prefs.startAtLogin = app.getLoginItemSettings(command).openAtLogin;
      save(); return state();
    });
    ipcMain.handle('launcher:hide', () => win.hide());
    win = new BrowserWindow({ width: 1220, height: 900, minWidth: 900, minHeight: 650, show: false,
      backgroundColor: '#10141c', autoHideMenuBar: true, icon: path.join(host, 'robos.ico'),
      webPreferences: { preload: path.join(host, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
    win.on('close', event => { if (!quitting) { event.preventDefault(); win.hide(); } });
    win.once('ready-to-show', () => { if (!process.argv.includes('--background')) show(); });
    win.loadFile(path.join(host, 'index.html'));
    tray = new Tray(nativeImage.createFromPath(path.join(host, 'robos.ico')).resize({ width: 16, height: 16 }));
    tray.setToolTip('RobOS — ready in the background');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open RobOS', click: show }, { type: 'separator' },
      { label: 'Quit RobOS launcher', click: () => app.quit() },
    ]));
    tray.on('click', show);
    if (prefs.shortcutEnabled) { try { shortcut(true); } catch {} }
    // Registry reads are slow on a cold Windows machine. They never block showing
    // the cached launcher, and launched apps inherit the refreshed environment.
    const refresh = () => require(path.join(root, 'packages/robos-lib/windows-path')).refreshWindowsPathAsync(root, process.env, process.env.ROBOS_TOOL_ROOT).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 60000); timer.unref();
    app.on('will-quit', () => clearInterval(timer));
  });
}
module.exports = { startLauncher, loginCommand, ACCELERATOR };
