'use strict';

const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TABLETOP_DIR = path.join(REPO_ROOT, 'games/tabletop-rpg');
const BOARDS_DIR = path.join(TABLETOP_DIR, 'assets/boards');
const CARTRIDGES_DIR = path.join(TABLETOP_DIR, 'cartridges');
const ASSETS_DIR = path.join(TABLETOP_DIR, 'assets');

// Ensure stable rendering inside VM and container framebuffers
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;
let startupTarget = null;

// Parse command line arguments for target file
function parseArgs() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--cartridge=')) {
      startupTarget = { type: 'cartridge', value: arg.split('=')[1] };
    } else if (arg.startsWith('--blockmap=')) {
      startupTarget = { type: 'blockmap', value: arg.split('=')[1] };
    } else if (!arg.startsWith('--') && !arg.startsWith('-')) {
      if (arg.endsWith('.cartridge.json') || arg.includes('cartridge')) {
        startupTarget = { type: 'cartridge', value: arg };
      } else if (arg.endsWith('.blockmap.json')) {
        startupTarget = { type: 'blockmap', value: arg };
      } else {
        startupTarget = { type: 'blockmap', value: arg };
      }
    }
  }
}

parseArgs();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    title: 'RobOS Tabletop Quest Map Editor',
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Wire up snapshot debug server on port 19195
  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(mainWindow);
    startDebugServer(mainWindow, 19195, 'tabletop-quest-editor');
  } catch (err) {
    try {
      const localDom = require('../robos-lib/dom-snapshot');
      localDom.registerSnapshotIPC(mainWindow);
      localDom.startDebugServer(mainWindow, 19195, 'tabletop-quest-editor');
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setName('RobOS Tabletop Quest Map Editor');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Helper: Resolve image path
function resolveImagePath(rawPath) {
  if (!rawPath) return null;
  let clean = rawPath.replace(/^res:\/\//, '');
  const candidates = [
    clean,
    path.resolve(clean),
    path.join(BOARDS_DIR, path.basename(clean)),
    path.join(ASSETS_DIR, clean),
    path.join(TABLETOP_DIR, clean),
    path.join(REPO_ROOT, clean)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return c;
    }
  }
  return null;
}

// IPC: Return initial startup target
ipcMain.handle('quest:get-startup-args', async () => {
  return startupTarget || {
    type: 'blockmap',
    value: 'first-light-dungeon'
  };
});

// IPC: List available blockmaps in cartridges directory
ipcMain.handle('quest:list-blockmaps', async () => {
  try {
    const blockmaps = [];
    if (fs.existsSync(CARTRIDGES_DIR)) {
      const files = fs.readdirSync(CARTRIDGES_DIR).filter(f => f.endsWith('.blockmap.json'));
      for (const f of files) {
        const fullPath = path.join(CARTRIDGES_DIR, f);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          blockmaps.push({
            id: data.id || path.basename(f, '.blockmap.json'),
            title: data.title || path.basename(f, '.blockmap.json'),
            file: f,
            path: fullPath,
            backgroundImage: data.backgroundImage || '',
            gridDimensions: data.gridDimensions || [26, 19],
            roomCount: (data.rooms || []).length
          });
        } catch {}
      }
    }

    // Default fallback if no blockmaps found
    if (blockmaps.length === 0) {
      blockmaps.push({
        id: 'first-light-dungeon',
        title: 'HeroQuest: First Light Side A (1014×738)',
        file: 'first-light-dungeon.blockmap.json',
        path: path.join(CARTRIDGES_DIR, 'first-light-dungeon.blockmap.json'),
        backgroundImage: 'res://assets/boards/first_light_dungeon.png',
        gridDimensions: [26, 19],
        roomCount: 22
      });
    }

    return { success: true, blockmaps };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Load a Blockmap
ipcMain.handle('quest:load-blockmap', async (_event, slugOrPath) => {
  try {
    let bPath = slugOrPath;
    if (!bPath.endsWith('.blockmap.json')) {
      bPath = path.join(CARTRIDGES_DIR, `${slugOrPath}.blockmap.json`);
    }
    if (!fs.existsSync(bPath)) {
      bPath = path.join(CARTRIDGES_DIR, slugOrPath);
    }
    if (!fs.existsSync(bPath)) {
      return { success: false, error: `Blockmap not found: ${slugOrPath}` };
    }

    const raw = fs.readFileSync(bPath, 'utf8');
    const blockmap = JSON.parse(raw);

    // Resolve image
    let imgData = null;
    const bgImage = blockmap.backgroundImage || 'res://assets/boards/first_light_dungeon.png';
    const resolvedPath = resolveImagePath(bgImage);
    if (resolvedPath) {
      const ext = path.extname(resolvedPath).toLowerCase();
      const mime = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
      imgData = {
        dataUrl: `data:${mime};base64,${fs.readFileSync(resolvedPath).toString('base64')}`,
        filePath: resolvedPath,
        fileName: path.basename(resolvedPath)
      };
    }

    return {
      success: true,
      blockmap,
      blockmapPath: bPath,
      imageData: imgData
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Open Native File Dialog for Blockmap
ipcMain.handle('quest:open-blockmap-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Dungeon Blockmap (.blockmap.json)',
      defaultPath: CARTRIDGES_DIR,
      properties: ['openFile'],
      filters: [
        { name: 'Blockmap JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const fullPath = result.filePaths[0];
    const raw = fs.readFileSync(fullPath, 'utf8');
    const blockmap = JSON.parse(raw);

    let imgData = null;
    const bgImage = blockmap.backgroundImage || 'res://assets/boards/first_light_dungeon.png';
    const resolvedPath = resolveImagePath(bgImage);
    if (resolvedPath) {
      const ext = path.extname(resolvedPath).toLowerCase();
      const mime = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
      imgData = {
        dataUrl: `data:${mime};base64,${fs.readFileSync(resolvedPath).toString('base64')}`,
        filePath: resolvedPath,
        fileName: path.basename(resolvedPath)
      };
    }

    return {
      success: true,
      blockmap,
      blockmapPath: fullPath,
      imageData: imgData
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: List Cartridges
ipcMain.handle('quest:list-cartridges', async () => {
  try {
    const cartridges = [];
    if (fs.existsSync(CARTRIDGES_DIR)) {
      const files = fs.readdirSync(CARTRIDGES_DIR).filter(f => f.endsWith('.cartridge.json'));
      for (const f of files) {
        const fullPath = path.join(CARTRIDGES_DIR, f);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          const slug = path.basename(f, '.cartridge.json');
          cartridges.push({
            slug,
            title: data.header?.title || slug,
            mapCount: data.header?.mapCount || (data.maps ? Object.keys(data.maps).length : 0),
            filePath: fullPath
          });
        } catch {}
      }
    }
    return { success: true, cartridges };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Load Cartridge
ipcMain.handle('quest:load-cartridge', async (_event, slugOrPath) => {
  try {
    let cPath = slugOrPath;
    if (!cPath.endsWith('.cartridge.json')) {
      cPath = path.join(CARTRIDGES_DIR, `${slugOrPath}.cartridge.json`);
    }
    if (!fs.existsSync(cPath)) {
      cPath = path.join(CARTRIDGES_DIR, slugOrPath);
    }
    if (!fs.existsSync(cPath)) {
      return { success: false, error: `Cartridge not found: ${slugOrPath}` };
    }

    const raw = fs.readFileSync(cPath, 'utf8');
    const cartridge = JSON.parse(raw);
    const slug = path.basename(cPath, '.cartridge.json');

    return {
      success: true,
      cartridge,
      slug,
      filePath: cPath
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Save Cartridge
ipcMain.handle('quest:save-cartridge', async (_event, payload) => {
  try {
    const { slug, cartridgeData } = payload;
    const cleanSlug = (slug || 'custom-quest').toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
    const cPath = path.join(CARTRIDGES_DIR, `${cleanSlug}.cartridge.json`);

    fs.writeFileSync(cPath, JSON.stringify(cartridgeData, null, 2) + '\n', 'utf8');
    return {
      success: true,
      slug: cleanSlug,
      fileName: `${cleanSlug}.cartridge.json`,
      filePath: cPath
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Export JSON to File
ipcMain.handle('quest:save-file-dialog', async (_event, payload) => {
  try {
    const { content, suggestedName, title } = payload;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: title || 'Export Quest File',
      defaultPath: path.join(CARTRIDGES_DIR, suggestedName || 'custom-quest.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, content, 'utf8');
    return { success: true, filePath: result.filePath, fileName: path.basename(result.filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Copy to Clipboard
ipcMain.handle('quest:copy-to-clipboard', async (_event, text) => {
  clipboard.writeText(text || '');
  return { success: true };
});

// IPC: Load Asset Sprite / Texture as Data URL
ipcMain.handle('quest:load-asset-image', async (_event, relPath) => {
  try {
    const clean = relPath.replace(/^res:\/\//, '');
    const candidates = [
      path.join(TABLETOP_DIR, clean),
      path.join(ASSETS_DIR, clean),
      path.join(REPO_ROOT, clean)
    ];
    let found = null;
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        found = c;
        break;
      }
    }
    if (!found) return { success: false, error: `Asset not found: ${relPath}` };

    const ext = path.extname(found).toLowerCase();
    const mime = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
    const dataUrl = `data:${mime};base64,${fs.readFileSync(found).toString('base64')}`;
    return { success: true, dataUrl, filePath: found };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Launch Tabletop Game in Godot with this cartridge
ipcMain.handle('quest:launch-game', async (_event, slug) => {
  try {
    const runScript = path.join(TABLETOP_DIR, 'run.sh');
    if (!fs.existsSync(runScript)) {
      return { success: false, error: `Run script not found: ${runScript}` };
    }
    const env = { ...process.env, TABLETOP_CARTRIDGE: slug, DISPLAY: process.env.DISPLAY || ':0' };
    const child = spawn(runScript, ['--cartridge=' + slug], {
      cwd: TABLETOP_DIR,
      env,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { success: true, pid: child.pid };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
