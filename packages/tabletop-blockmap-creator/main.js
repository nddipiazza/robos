'use strict';

const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TABLETOP_DIR = path.join(REPO_ROOT, 'games/tabletop-rpg');
const BOARDS_DIR = path.join(TABLETOP_DIR, 'assets/boards');
const CARTRIDGES_DIR = path.join(TABLETOP_DIR, 'cartridges');

// Ensure stable rendering inside VM and container framebuffers
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;
let startupTarget = null;

// Parse command line arguments for target file
function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--cartridge=')) {
      startupTarget = { type: 'cartridge', value: arg.slice(arg.indexOf('=') + 1).replace(/^["']|["']$/g, '') };
    } else if (arg === '--cartridge' && i + 1 < args.length) {
      startupTarget = { type: 'cartridge', value: args[++i].replace(/^["']|["']$/g, '') };
    } else if (arg.startsWith('--blockmap=')) {
      startupTarget = { type: 'blockmap', value: arg.slice(arg.indexOf('=') + 1).replace(/^["']|["']$/g, '') };
    } else if (arg === '--blockmap' && i + 1 < args.length) {
      startupTarget = { type: 'blockmap', value: args[++i].replace(/^["']|["']$/g, '') };
    } else if (arg.startsWith('--map=')) {
      startupTarget = { type: 'image', value: arg.slice(arg.indexOf('=') + 1).replace(/^["']|["']$/g, '') };
    } else if (arg === '--map' && i + 1 < args.length) {
      startupTarget = { type: 'image', value: args[++i].replace(/^["']|["']$/g, '') };
    } else if (!arg.startsWith('--') && !arg.startsWith('-')) {
      const cleanArg = arg.replace(/^["']|["']$/g, '');
      if (cleanArg.endsWith('.blockmap.json') || cleanArg.includes('.blockmap.')) {
        startupTarget = { type: 'blockmap', value: cleanArg };
      } else if (cleanArg.endsWith('.cartridge.json') || cleanArg.includes('cartridge')) {
        startupTarget = { type: 'cartridge', value: cleanArg };
      } else if (cleanArg.endsWith('.json')) {
        startupTarget = { type: 'blockmap', value: cleanArg };
      } else if (/\.(png|jpg|jpeg|webp|bmp)$/i.test(cleanArg)) {
        startupTarget = { type: 'image', value: cleanArg };
      } else {
        startupTarget = { type: 'preset', value: cleanArg };
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
    title: 'RobOS Tabletop Blockmap Creator',
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Wire up snapshot debug server on registered port 19199
  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(mainWindow);
    startDebugServer(mainWindow, 19199, 'tabletop-blockmap-creator');
  } catch (err) {
    try {
      const localDom = require('../robos-lib/dom-snapshot');
      localDom.registerSnapshotIPC(mainWindow);
      localDom.startDebugServer(mainWindow, 19199, 'tabletop-blockmap-creator');
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setName('RobOS Tabletop Blockmap Creator');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: Return initial startup target
ipcMain.handle('blockmap:get-startup-args', async () => {
  return startupTarget || {
    type: 'preset',
    value: 'first-light-dungeon',
    defaultBoard: 'first_light_dungeon.png'
  };
});

// Available board presets in repository
const PRESETS = [
  {
    id: 'first-light-dungeon',
    title: 'HeroQuest: First Light Side A (1014×738)',
    file: 'first_light_dungeon.png',
    defaultCols: 26,
    defaultRows: 19,
    defaultTileSize: 39.0,
    offsetX: 0,
    offsetY: 0,
    blockmapFile: 'first-light-dungeon.blockmap.json'
  },
  {
    id: 'heroquest-classic',
    title: 'HeroQuest Classic Stone Dungeon (1024×768)',
    file: 'heroquest_board.png',
    defaultCols: 28,
    defaultRows: 21,
    defaultTileSize: 36.57,
    offsetX: 0,
    offsetY: 0,
    blockmapFile: 'heroquest-classic.blockmap.json'
  },
  {
    id: 'first-light-caverns',
    title: 'HeroQuest First Light Side B Caverns (1200×896)',
    file: 'first_light_caverns.png',
    defaultCols: 26,
    defaultRows: 19,
    defaultTileSize: 42.0,
    offsetX: 0,
    offsetY: 0
  },
  {
    id: 'fan-dungeon-28x21',
    title: 'Fan Cavern Citadel (1024×768)',
    file: 'fan_dungeon_28x21.png',
    defaultCols: 28,
    defaultRows: 21,
    defaultTileSize: 36.57,
    offsetX: 0,
    offsetY: 0
  }
];

// Helper: Resolve image path
function resolveImagePath(rawPath, blockmapDir = null) {
  if (!rawPath) return null;
  let clean = rawPath.replace(/^res:\/\//, '');
  const candidates = [
    clean,
    path.resolve(clean),
    blockmapDir ? path.join(blockmapDir, clean) : null,
    blockmapDir ? path.join(blockmapDir, path.basename(clean)) : null,
    path.join(BOARDS_DIR, path.basename(clean)),
    path.join(TABLETOP_DIR, clean),
    path.join(REPO_ROOT, clean),
    path.join(TABLETOP_DIR, 'assets/boards', path.basename(clean))
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return c;
    }
  }
  return null;
}

// IPC: List available board presets in repository
ipcMain.handle('blockmap:list-presets', async () => {
  try {
    return { success: true, presets: PRESETS };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Load Image from path or preset
ipcMain.handle('blockmap:load-image', async (_event, filePath) => {
  try {
    const fullPath = resolveImagePath(filePath);
    if (!fullPath) {
      return { success: false, error: `Image file not found: ${filePath}` };
    }
    const ext = path.extname(fullPath).toLowerCase();
    const mime = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
    const data = fs.readFileSync(fullPath).toString('base64');
    return {
      success: true,
      dataUrl: `data:${mime};base64,${data}`,
      filePath: fullPath,
      fileName: path.basename(fullPath)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Open Native File Dialog
ipcMain.handle('blockmap:open-file-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Dungeon Map Image',
      defaultPath: BOARDS_DIR,
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const fullPath = result.filePaths[0];
    const ext = path.extname(fullPath).toLowerCase();
    const mime = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
    const data = fs.readFileSync(fullPath).toString('base64');
    return {
      success: true,
      filePath: fullPath,
      fileName: path.basename(fullPath),
      dataUrl: `data:${mime};base64,${data}`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Load Board Blockmap JSON
ipcMain.handle('blockmap:load-board-map', async (_event, boardId) => {
  try {
    let blockmapPath = null;
    let clean = 'first-light-dungeon';

    if (boardId && typeof boardId === 'string') {
      const trimmed = boardId.trim().replace(/^["']|["']$/g, '');
      if (fs.existsSync(trimmed) && fs.statSync(trimmed).isFile()) {
        blockmapPath = trimmed;
        clean = path.basename(trimmed).replace(/\.blockmap\.json$/, '').replace(/\.json$/, '').toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
      } else {
        clean = trimmed.toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
        const candidates = [
          path.join(CARTRIDGES_DIR, `${clean}.blockmap.json`),
          path.join(CARTRIDGES_DIR, `${trimmed}.blockmap.json`),
          path.join(CARTRIDGES_DIR, trimmed),
          path.resolve(trimmed)
        ];
        for (const c of candidates) {
          if (fs.existsSync(c) && fs.statSync(c).isFile()) {
            blockmapPath = c;
            break;
          }
        }
      }
    }
    if (!blockmapPath || !fs.existsSync(blockmapPath)) {
      return { success: false, error: `Blockmap not found: ${boardId}` };
    }

    const raw = fs.readFileSync(blockmapPath, 'utf8');
    const boardData = JSON.parse(raw);
    const resolvedBoardId = boardData.id || clean;

    const blockmapDir = path.dirname(blockmapPath);
    let imgData = null;
    const bgImage = boardData.backgroundImage || 'res://assets/boards/first_light_dungeon.png';
    let resolvedPath = resolveImagePath(bgImage, blockmapDir);

    if (!resolvedPath) {
      // Fallback: check matching preset in PRESETS
      const preset = PRESETS.find(p => p.id === resolvedBoardId || p.id === clean || p.blockmapFile === path.basename(blockmapPath));
      if (preset && preset.file) {
        resolvedPath = resolveImagePath(preset.file, blockmapDir);
      }
    }

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
      boardId: resolvedBoardId,
      boardData,
      imageData: imgData
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Save Board Blockmap JSON
ipcMain.handle('blockmap:save-board-map', async (_event, payload) => {
  try {
    const { boardId, boardData } = payload;
    const cleanId = (boardId || 'custom-board').toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
    const blockmapPath = path.join(CARTRIDGES_DIR, `${cleanId}.blockmap.json`);
    fs.writeFileSync(blockmapPath, JSON.stringify(boardData, null, 2) + '\n', 'utf8');
    return {
      success: true,
      filePath: blockmapPath,
      fileName: `${cleanId}.blockmap.json`,
      boardId: cleanId
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Load Cartridge Map
ipcMain.handle('blockmap:load-cartridge-map', async (_event, slugOrPath, mapId) => {
  try {
    let cartFile = slugOrPath;
    if (!cartFile.endsWith('.cartridge.json')) {
      cartFile = path.join(CARTRIDGES_DIR, `${slugOrPath}.cartridge.json`);
    }
    if (!fs.existsSync(cartFile)) {
      cartFile = path.join(CARTRIDGES_DIR, `${slugOrPath}`);
    }
    if (!fs.existsSync(cartFile)) {
      return { success: false, error: `Cartridge not found: ${slugOrPath}` };
    }

    const raw = fs.readFileSync(cartFile, 'utf8');
    const cart = JSON.parse(raw);
    const maps = cart.maps || {};
    let targetMap = null;
    let targetMapId = mapId;

    if (targetMapId && maps[targetMapId]) {
      targetMap = maps[targetMapId];
    } else {
      const keys = Object.keys(maps);
      if (keys.length > 0) {
        targetMapId = keys[0];
        targetMap = maps[targetMapId];
      }
    }

    if (!targetMap) {
      return { success: false, error: 'No maps found in cartridge' };
    }

    let imgData = null;
    const bgImage = targetMap.backgroundImage || 'res://assets/boards/first_light_dungeon.png';
    const resolvedPath = resolveImagePath(bgImage);
    if (resolvedPath) {
      const ext = path.extname(resolvedPath).toLowerCase();
      const mime = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'image/png';
      imgData = {
        dataUrl: `data:${mime};base64,${fs.readFileSync(resolvedPath).toString('base64')}`,
        filePath: resolvedPath,
        fileName: path.basename(resolvedPath)
      };
    }

    return {
      success: true,
      cartridgeSlug: path.basename(cartFile, '.cartridge.json'),
      cartridgePath: cartFile,
      mapId: targetMapId,
      mapData: targetMap,
      imageData: imgData
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Save Map back to Cartridge
ipcMain.handle('blockmap:save-cartridge-map', async (_event, payload) => {
  try {
    const { cartridgeSlug, mapId, mapData } = payload;
    if (!cartridgeSlug) throw new Error('Cartridge slug is required');
    const cartPath = path.join(CARTRIDGES_DIR, `${cartridgeSlug}.cartridge.json`);
    if (!fs.existsSync(cartPath)) {
      throw new Error(`Cartridge file not found: ${cartPath}`);
    }

    const raw = fs.readFileSync(cartPath, 'utf8');
    const cart = JSON.parse(raw);
    if (!cart.maps) cart.maps = {};

    const targetMapId = mapId || Object.keys(cart.maps)[0] || 'main-map';
    const existing = cart.maps[targetMapId] || {};

    // Merge updated map data preserving stories, quests, and triggers
    cart.maps[targetMapId] = {
      ...existing,
      width: mapData.width,
      height: mapData.height,
      rooms: mapData.rooms,
      doors: mapData.doors,
      wallBlocks: mapData.wallBlocks || existing.wallBlocks || [],
      startingStair: mapData.startingStair || existing.startingStair || [0, 1],
      calibration: mapData.calibration || existing.calibration || {}
    };

    if (mapData.backgroundImage) {
      cart.maps[targetMapId].backgroundImage = mapData.backgroundImage;
    }

    fs.writeFileSync(cartPath, JSON.stringify(cart, null, 2) + '\n', 'utf8');
    return {
      success: true,
      cartridgePath: cartPath,
      mapId: targetMapId
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Save Map to File
ipcMain.handle('blockmap:save-map-to-file', async (_event, payload) => {
  try {
    const { content, suggestedName } = payload;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Blockmap JSON',
      defaultPath: path.join(TABLETOP_DIR, 'cartridges', suggestedName || 'custom-blockmap.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, content, 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Copy to Clipboard
ipcMain.handle('blockmap:copy-to-clipboard', async (_event, text) => {
  clipboard.writeText(text || '');
  return { success: true };
});
