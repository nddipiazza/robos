const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let win = null;

const NOTIF_FILE = path.join(os.homedir(), '.config', 'robos', 'notifications.json');

function loadNotifications() {
  try {
    if (fs.existsSync(NOTIF_FILE)) return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
  } catch {}
  return [];
}

function saveNotifications(data) {
  fs.mkdirSync(path.dirname(NOTIF_FILE), { recursive: true });
  fs.writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function createWindow() {
  win = new BrowserWindow({
    skipTaskbar: true,
    show: false,
    width: 800, height: 650, minWidth: 600, minHeight: 400,
    title: 'RobOS Notifications',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (e) => { e.preventDefault(); win.hide(); });
}

function showWindow() {
  if (!win) return;
  if (!win.isVisible()) win.show();
  win.focus();
  win.moveTop();
}

app.on('second-instance', () => showWindow());

app.setName('notifications');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {});

ipcMain.handle('get-notifications', () => loadNotifications());

ipcMain.handle('mark-read', (_, id) => {
  const data = loadNotifications();
  data.forEach(n => { if (!id || n.id === id) n.read = true; });
  saveNotifications(data);
  return true;
});

ipcMain.handle('delete-notification', (_, id) => {
  const data = loadNotifications().filter(n => n.id !== id);
  saveNotifications(data);
  return true;
});

ipcMain.handle('clear-all', () => {
  saveNotifications([]);
  return true;
});
