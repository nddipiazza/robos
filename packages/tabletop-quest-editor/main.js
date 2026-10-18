'use strict';

const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage } = require('electron');
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
  const iconPng = path.join(__dirname, 'icon.png');
  const iconSvg = path.join(__dirname, 'icon.svg');
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    title: 'RobOS Tabletop Quest Map Editor',
    icon: fs.existsSync(iconPng) ? iconPng : iconSvg,
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

// IPC: List Monsters from KGraph tabletop-game package.jsonld
ipcMain.handle('quest:list-monsters', async () => {
  try {
    const kgraphPath = path.join(REPO_ROOT, '.robos/kgraphs/tabletop-game/package.jsonld');
    const monsters = [];
    if (fs.existsSync(kgraphPath)) {
      const raw = fs.readFileSync(kgraphPath, 'utf8');
      const data = JSON.parse(raw);
      const graph = Array.isArray(data['@graph']) ? data['@graph'] : [];
      for (const node of graph) {
        const types = [].concat(node['@type'] || []);
        if (types.includes('robos:TabletopMonster')) {
          const id = String(node['@id'] || '');
          const slug = id.replace(/^urn:robos:tabletop:monster:/, '') || node['robos:slug'] || '';
          if (!slug) continue;
          monsters.push({
            id,
            slug,
            name: node['dcterms:title'] || slug,
            description: node['dcterms:description'] || '',
            category: node['robos:category'] || 'Base Game',
            archetype: node['robos:monsterArchetype'] || node['robos:archetype'] || '',
            icon: node['robos:icon'] || '',
            bp: Number(node['robos:bodyPoints'] ?? 1),
            mp: Number(node['robos:mindPoints'] ?? 1),
            atk: Number(node['robos:attackDice'] ?? 2),
            def: Number(node['robos:defendDice'] ?? 2),
            move: Number(node['robos:movementSquares'] ?? 6),
            isBoss: Boolean(node['robos:isBoss']),
            isUndead: Boolean(node['robos:isUndead']),
            isCaster: Boolean(node['robos:isSpellcaster']),
            spells: Array.isArray(node['robos:spells'])
              ? node['robos:spells'].map(s => String(s).replace(/^urn:robos:tabletop:spell:/, ''))
              : [],
            color: node['robos:tokenColor'] || '#ca8a04'
          });
        }
      }
    }
    return { success: true, monsters };
  } catch (err) {
    return { success: false, error: err.message, monsters: [] };
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

// IPC: Open Native File Dialog for Cartridge
ipcMain.handle('quest:open-cartridge-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Quest Cartridge (.cartridge.json)',
      defaultPath: CARTRIDGES_DIR,
      properties: ['openFile'],
      filters: [
        { name: 'Quest Cartridge JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const fullPath = result.filePaths[0];
    const raw = fs.readFileSync(fullPath, 'utf8');
    const cartridge = JSON.parse(raw);
    const slug = path.basename(fullPath, '.cartridge.json');

    return {
      success: true,
      cartridge,
      slug,
      filePath: fullPath
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

// IPC: Export File to Disk (Text or Binary)
ipcMain.handle('quest:save-file-dialog', async (_event, payload) => {
  try {
    const { content, base64Data, suggestedName, title, filters } = payload;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: title || 'Export Quest File',
      defaultPath: path.join(CARTRIDGES_DIR, suggestedName || 'custom-quest.json'),
      filters: filters || [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    if (base64Data) {
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(result.filePath, Buffer.from(cleanBase64, 'base64'));
    } else {
      fs.writeFileSync(result.filePath, content || '', 'utf8');
    }
    return { success: true, filePath: result.filePath, fileName: path.basename(result.filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Export Quest Map Image (PNG)
ipcMain.handle('quest:save-png', async (_event, payload) => {
  try {
    const rawData = payload.base64Data || payload.dataUrl || '';
    if (!rawData) {
      return { success: false, error: 'No image data provided for PNG export' };
    }

    const { suggestedName, title } = payload;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: title || 'Export Quest Map Image (PNG)',
      defaultPath: path.join(CARTRIDGES_DIR, suggestedName || 'quest-map.png'),
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const cleanBase64 = rawData.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(result.filePath, Buffer.from(cleanBase64, 'base64'));
    return { success: true, filePath: result.filePath, fileName: path.basename(result.filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Export Printable Quest Sheet (PDF) via Electron printToPDF
ipcMain.handle('quest:export-pdf', async (_event, payload) => {
  let printWin = null;
  let tempFile = null;
  try {
    const { html, suggestedName, landscape, pageSize } = payload;
    if (!html) {
      return { success: false, error: 'No HTML content provided for PDF export' };
    }

    // 1. Prompt Save Dialog first so user can choose destination or cancel before rendering
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Quest Sheet Document (PDF)',
      defaultPath: path.join(CARTRIDGES_DIR, suggestedName || 'quest-sheet.pdf'),
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    // 2. Write HTML to temporary file to avoid ERR_INVALID_URL from large base64 data URLs
    tempFile = path.join(app.getPath('temp'), `robos-quest-sheet-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(tempFile, html, 'utf8');

    // 3. Render HTML in invisible BrowserWindow
    printWin = new BrowserWindow({
      show: false,
      width: landscape !== false ? 1400 : 950,
      height: landscape !== false ? 950 : 1400,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await printWin.loadFile(tempFile);

    // Allow time for images, CSS fonts, and layout to finish rendering
    await new Promise(r => setTimeout(r, 350));

    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      landscape: landscape !== false,
      pageSize: pageSize || 'A4',
      margins: {
        marginType: 'none'
      }
    });

    printWin.close();
    printWin = null;

    fs.writeFileSync(result.filePath, pdfBuffer);
    return { success: true, filePath: result.filePath, fileName: path.basename(result.filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (printWin) {
      try { printWin.close(); } catch (_) {}
    }
    if (tempFile) {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch (_) {}
    }
  }
});

// IPC: Copy Text to Clipboard
ipcMain.handle('quest:copy-to-clipboard', async (_event, text) => {
  clipboard.writeText(text || '');
  return { success: true };
});

// IPC: Copy Image to System Clipboard
ipcMain.handle('quest:copy-image-to-clipboard', async (_event, base64Data) => {
  try {
    const cleanBase64 = base64Data.startsWith('data:')
      ? base64Data
      : `data:image/png;base64,${base64Data}`;
    const img = nativeImage.createFromDataURL(cleanBase64);
    clipboard.writeImage(img);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
    let runScript = path.join(TABLETOP_DIR, 'play.sh');
    if (!fs.existsSync(runScript)) {
      runScript = path.join(TABLETOP_DIR, 'run.sh');
    }
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

// IPC: Ensure RobOS Voice overlay app is running
ipcMain.handle('voice:ensure-running', async () => {
  try {
    let voiceClient = null;
    try {
      const { RobOSVoiceClient } = require('../robos-lib/voice');
      voiceClient = new RobOSVoiceClient();
    } catch {
      try {
        const { RobOSVoiceClient } = require('/usr/local/share/robos/robos-lib/voice');
        voiceClient = new RobOSVoiceClient();
      } catch {}
    }

    if (voiceClient && typeof voiceClient.ensureRunning === 'function') {
      return await voiceClient.ensureRunning();
    }

    const hudScript = path.resolve(__dirname, '../voice-prompt/bin/robos-voice-hud');
    if (fs.existsSync(hudScript)) {
      const child = spawn(hudScript, [], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
      });
      child.unref();
      return { ok: true, launched: true, pid: child.pid };
    }

    return { ok: false, error: 'Voice HUD script not found' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC: Open currently selected blockmap in Tabletop Blockmap Creator
ipcMain.handle('quest:open-blockmap-editor', async (_event, blockmapArg) => {
  try {
    const targetBlockmap = blockmapArg || 'first-light-dungeon';

    // 1. Resolve blockmap path
    let resolvedBlockmap = targetBlockmap;
    if (!path.isAbsolute(targetBlockmap)) {
      const candidates = [
        path.join(CARTRIDGES_DIR, targetBlockmap),
        path.join(CARTRIDGES_DIR, `${targetBlockmap}.blockmap.json`),
        path.join(CARTRIDGES_DIR, `${targetBlockmap.replace(/\.blockmap\.json$/, '')}.blockmap.json`)
      ];
      for (const cp of candidates) {
        if (fs.existsSync(cp) && fs.statSync(cp).isFile()) {
          resolvedBlockmap = cp;
          break;
        }
      }
    }

    // 2. Locate tabletop-blockmap-creator package / launcher
    const repoBlockmapDir = path.join(REPO_ROOT, 'packages/tabletop-blockmap-creator');
    const repoLaunchScript = path.join(repoBlockmapDir, 'launch.sh');
    const vmBlockmapDir = '/usr/local/share/robos/tabletop-blockmap-creator';

    let execCmd = null;
    let execArgs = [];
    let execCwd = process.cwd();

    if (fs.existsSync(repoLaunchScript)) {
      execCmd = repoLaunchScript;
      execArgs = ['--blockmap=' + resolvedBlockmap];
      execCwd = repoBlockmapDir;
    } else if (fs.existsSync(repoBlockmapDir)) {
      execCmd = process.execPath;
      execArgs = [repoBlockmapDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--blockmap=' + resolvedBlockmap];
      execCwd = repoBlockmapDir;
    } else if (fs.existsSync(vmBlockmapDir)) {
      execCmd = process.execPath;
      execArgs = [vmBlockmapDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--blockmap=' + resolvedBlockmap];
      execCwd = vmBlockmapDir;
    } else {
      return { success: false, error: 'Tabletop Blockmap Creator not found on system' };
    }

    const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' };
    const child = spawn(execCmd, execArgs, {
      cwd: execCwd,
      env,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    return {
      success: true,
      pid: child.pid,
      targetBlockmap: resolvedBlockmap,
      blockmapName: path.basename(resolvedBlockmap)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
