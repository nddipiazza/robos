const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

// Standard RobOS flags for VM / container stability
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

// Determine repository root and core paths
function getPaths() {
  const repoRoot = path.resolve(__dirname, '../..');
  const mapsDir = path.join(repoRoot, 'games/crpg-realm/maps');
  const blockoutsDir = path.join(repoRoot, 'games/crpg-realm/assets/blockouts');
  const blockoutPackageDir = path.join(repoRoot, 'packages/robos-crpg-blockout');
  return { repoRoot, mapsDir, blockoutsDir, blockoutPackageDir };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0d1117',
    title: 'RobOS cRPG Maker — Map & Level Designer',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Wire up snapshot debug server for DOM snapshots and test harness
  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(mainWindow);
    startDebugServer(mainWindow, 19194, 'crpg-maker');
  } catch (err) {
    // In local dev environment before deployment to /usr/local/share
    try {
      const localDom = require('../robos-lib/dom-snapshot');
      localDom.registerSnapshotIPC(mainWindow);
      localDom.startDebugServer(mainWindow, 19194, 'crpg-maker');
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler Registrations
function setupIpcHandlers() {
  const paths = getPaths();

  // 1. Get Environment Paths
  ipcMain.handle('app:get-paths', async () => {
    return paths;
  });

  // 2. List all available maps
  ipcMain.handle('maps:list', async () => {
    try {
      if (!fs.existsSync(paths.mapsDir)) {
        fs.mkdirSync(paths.mapsDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.mapsDir).filter(f => f.endsWith('.jsonld'));
      const maps = [];

      for (const file of files) {
        const slug = file.replace(/\.jsonld$/, '');
        const fullPath = path.join(paths.mapsDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          const pngPath = path.join(paths.blockoutsDir, `${slug}.png`);
          const pngExists = fs.existsSync(pngPath);

          maps.push({
            slug,
            fileName: file,
            path: fullPath,
            id: data['@id'] || `urn:robos:crpg:battle-map:${slug}`,
            title: data['dcterms:title'] || data.title || slug,
            width: data['robos:width'] || data.width || 120,
            height: data['robos:height'] || data.height || 80,
            terrain: data['robos:terrain'] || data.terrain || 'stone',
            objectCount: Array.isArray(data['robos:mapObjects']) ? data['robos:mapObjects'].length : 0,
            hasGrid: Boolean(data['robos:blockout']),
            pngExists,
            pngPath: pngExists ? pngPath : null,
          });
        } catch (e) {
          maps.push({ slug, fileName: file, path: fullPath, title: slug, error: e.message });
        }
      }
      return { success: true, maps };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 3. Load Map JSON-LD
  ipcMain.handle('maps:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.mapsDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Map file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      const pngPath = path.join(paths.blockoutsDir, `${slug}.png`);
      const pngExists = fs.existsSync(pngPath);

      return {
        success: true,
        slug,
        filePath,
        data,
        pngExists,
        pngPath: pngExists ? pngPath : null,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 4. Save Map JSON-LD
  ipcMain.handle('maps:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Map slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.mapsDir, `${safeSlug}.jsonld`);

      // Ensure standard KGraph schema structure
      const formatted = {
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
        },
        '@id': data['@id'] || `urn:robos:crpg:battle-map:${safeSlug}`,
        '@type': ['robos:CRPGBattleMap', 'schema:Place'],
        'dcterms:title': data['dcterms:title'] || data.title || safeSlug,
        'robos:width': Number(data['robos:width'] || data.width || 120),
        'robos:height': Number(data['robos:height'] || data.height || 80),
        'robos:terrain': data['robos:terrain'] || data.terrain || 'stone',
        'robos:mapObjects': data['robos:mapObjects'] || [],
      };

      // Preserve existing blockout grid if present and dimensions match
      if (data['robos:blockout']) {
        formatted['robos:blockout'] = data['robos:blockout'];
      }

      fs.writeFileSync(filePath, JSON.stringify(formatted, null, 2) + '\n', 'utf8');
      return { success: true, slug: safeSlug, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 5. Build Map Image & Collision Grid via Python blockout engine
  ipcMain.handle('maps:build', async (_event, { slug, debugCollision = false }) => {
    try {
      if (!slug) throw new Error('Map slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const mapPath = path.join(paths.mapsDir, `${safeSlug}.jsonld`);
      const targetPng = path.join(paths.blockoutsDir, `${safeSlug}.png`);

      if (!fs.existsSync(mapPath)) {
        throw new Error(`Map file not found: ${mapPath}`);
      }

      const flags = debugCollision ? '--debug-collision' : '';
      const cmd = `python3 -m robos_crpg_blockout build "${mapPath}" ${flags}`;
      
      const { stdout, stderr } = await execPromise(cmd, { cwd: paths.blockoutPackageDir });

      // Re-read updated map to return updated blockout collision stats
      const raw = fs.readFileSync(mapPath, 'utf8');
      const updatedData = JSON.parse(raw);
      const blockout = updatedData['robos:blockout'] || {};

      return {
        success: true,
        slug: safeSlug,
        mapPath,
        pngPath: targetPng,
        pngExists: fs.existsSync(targetPng),
        blockoutStats: {
          blocked: (blockout.blocked || []).length,
          opaque: (blockout.opaque || []).length,
          difficult: (blockout.difficult || []).length,
          halfCover: (blockout.halfCover || []).length,
          threeQuarterCover: (blockout.threeQuarterCover || []).length,
        },
        stdout,
        stderr,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 6. Direct Export / Save Image to User Location
  ipcMain.handle('maps:export-png', async (_event, { slug, targetPath }) => {
    try {
      const sourcePng = path.join(paths.blockoutsDir, `${slug}.png`);
      if (!fs.existsSync(sourcePng)) {
        throw new Error(`Blockout PNG not built yet at ${sourcePng}`);
      }
      fs.copyFileSync(sourcePng, targetPath);
      return { success: true, targetPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
