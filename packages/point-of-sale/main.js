'use strict';
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const os = require('node:os');
const path = require('node:path');
const { PointOfSale } = require('./lib/pos');
const { createServer, listen } = require('./lib/server');

app.setName('robos-point-of-sale');
for (const flag of ['no-sandbox', 'disable-gpu', 'disable-dev-shm-usage']) app.commandLine.appendSwitch(flag);

const DEBUG_PORT = 19201; // see PORT_REGISTRY in packages/robos-lib/snapshot-cli.js
const dataDir = process.env.ROBOS_POS_DATA || path.join(os.homedir(), '.config', 'robos', 'point-of-sale');
let origin;
let mainWindow;

function open(route, { fullscreen = false, title } = {}) {
  const win = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#0d1117', fullscreen, autoHideMenuBar: true, title: title || 'RobOS Point of Sale',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') },
  });
  // The UI only ever talks to its own local server; anything else opens in the system browser.
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith(origin)) return { action: 'allow' }; shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(origin + route);
  return win;
}

app.whenReady().then(async () => {
  const pos = new PointOfSale({ dir: dataDir });
  // Loopback by default. Set ROBOS_POS_HOST=0.0.0.0 to let a tablet on the shop network open /kiosk.
  const host = process.env.ROBOS_POS_HOST || '127.0.0.1';
  const port = await listen(createServer(pos, { lan: host !== '127.0.0.1' }), { port: Number(process.env.ROBOS_POS_PORT || 0), host });
  origin = `http://127.0.0.1:${port}`;
  ipcMain.handle('pos:info', () => ({ origin, dataDir }));
  ipcMain.handle('pos:openKiosk', () => { open('/kiosk', { fullscreen: true, title: 'Self-checkout' }); });
  ipcMain.handle('pos:openReadyBoard', () => { open('/ready', { fullscreen: true, title: 'Orders ready' }); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Point of Sale', submenu: [
      { label: 'Open self-checkout window', click: () => open('/kiosk', { fullscreen: true, title: 'Self-checkout' }) },
      { label: 'Open order-ready board', click: () => open('/ready', { fullscreen: true, title: 'Orders ready' }) },
      { type: 'separator' }, { role: 'toggleDevTools' }, { role: 'quit' },
    ] },
  ]));
  mainWindow = open(process.argv.includes('--kiosk') ? '/kiosk' : '/', { fullscreen: process.argv.includes('--kiosk') });
  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(mainWindow);
    startDebugServer(mainWindow, DEBUG_PORT, 'point-of-sale');
  } catch { /* robos-lib not installed */ }
});

app.on('window-all-closed', () => app.quit());
