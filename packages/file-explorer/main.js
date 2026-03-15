const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

const NAV_MAILBOX = path.join(os.homedir(), '.config', 'robos', 'file-explorer-nav.json');

// ── Single-instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is running — it will pick up the mailbox via fs.watch
  app.quit();
} else {
  app.on('second-instance', () => {
    // A second launch was attempted (e.g. from open-in-explorer) — focus our window
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    // Give the mailbox writer a moment then navigate
    setTimeout(checkNavMailbox, 150);
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 800,
    minWidth: 700, minHeight: 500,
    title: 'RobOS File Explorer',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.on('did-finish-load', () => {
    // Check if we were launched with a nav target
    checkNavMailbox();
  });
}

function checkNavMailbox() {
  try {
    if (!fs.existsSync(NAV_MAILBOX)) return;
    const data = JSON.parse(fs.readFileSync(NAV_MAILBOX, 'utf8'));
    if (data && data.path && win && !win.isDestroyed()) {
      win.webContents.send('navigate-to', data.path);
      win.focus();
      fs.unlinkSync(NAV_MAILBOX);
    }
  } catch {}
}

app.whenReady().then(() => {
  if (!gotLock) return;
  createWindow();
  // Watch for external navigation requests (file-based IPC)
  const dir = path.dirname(NAV_MAILBOX);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.watch(dir, (event, filename) => {
      if (filename === 'file-explorer-nav.json') {
        setTimeout(checkNavMailbox, 100);
      }
    });
  } catch {}
});
app.on('window-all-closed', () => app.quit());

// ── Helpers ───────────────────────────────────────────────────────────────────
function stat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function readDir(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map(e => {
      const full = path.join(dirPath, e.name);
      const s    = stat(full);
      return {
        name:     e.name,
        path:     full,
        isDir:    e.isDirectory(),
        isLink:   e.isSymbolicLink(),
        size:     s ? s.size : 0,
        mtime:    s ? s.mtimeMs : 0,
        hidden:   e.name.startsWith('.'),
      };
    }).sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    return { error: err.message };
  }
}

function readTreeChildren(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, path: path.join(dirPath, e.name), hasChildren: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('read-dir', (_, p) => readDir(p || os.homedir()));

ipcMain.handle('read-tree-children', (_, p) => readTreeChildren(p));

ipcMain.handle('get-home', () => os.homedir());

ipcMain.handle('open-file', (_, p) => {
  shell.openPath(p);
  return true;
});

ipcMain.handle('open-terminal-here', (_, p) => {
  cp.spawn('tilix', ['-w', p], { detached: true, stdio: 'ignore' }).unref();
  return true;
});

ipcMain.handle('open-in-editor', (_, p) => {
  cp.spawn('cursor', [p], { detached: true, stdio: 'ignore' }).unref();
  return true;
});

ipcMain.handle('copy-path', async (_, p) => {
  const { clipboard } = require('electron');
  clipboard.writeText(p);
  return true;
});

ipcMain.handle('get-file-content', (_, p) => {
  try {
    const s = stat(p);
    if (s && s.size > 2 * 1024 * 1024) return { error: 'File too large to preview (>2MB)' };
    return { content: fs.readFileSync(p, 'utf8') };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('delete-item', (_, p) => {
  try {
    fs.rmSync(p, { recursive: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('rename-item', (_, { from, to }) => {
  try {
    fs.renameSync(from, to);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mkdir', (_, p) => {
  try {
    fs.mkdirSync(p, { recursive: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('show-context-menu', (event, { itemPath, isDir }) => {
  const template = [
    { label: isDir ? '📂 Open Folder' : '📄 Open File',
      click: () => win.webContents.send('ctx-action', { action: 'open', path: itemPath }) },
    ...(isDir ? [
      { label: '💻 Open Terminal Here',
        click: () => win.webContents.send('ctx-action', { action: 'terminal', path: itemPath }) },
      { label: '✏️ Open in Cursor',
        click: () => win.webContents.send('ctx-action', { action: 'editor', path: itemPath }) },
    ] : [
      { label: '✏️ Open in Cursor',
        click: () => win.webContents.send('ctx-action', { action: 'editor', path: itemPath }) },
    ]),
    { type: 'separator' },
    { label: '📋 Copy Path',
      click: () => win.webContents.send('ctx-action', { action: 'copy-path', path: itemPath }) },
    { type: 'separator' },
    { label: '✏️ Rename',
      click: () => win.webContents.send('ctx-action', { action: 'rename', path: itemPath }) },
    { label: '🗑️ Delete',
      click: () => win.webContents.send('ctx-action', { action: 'delete', path: itemPath }) },
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: win });
});
