const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// RobOS flags for VM / container stability
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

function getPaths() {
  const repoRoot = path.resolve(__dirname, '../..');
  const scenesDir = path.join(repoRoot, 'games/crpg-realm/scenes');
  const mapsDir = path.join(repoRoot, 'games/crpg-realm/maps');
  const campaignsDir = path.join(repoRoot, 'games/crpg-realm/campaigns');
  const blockoutsDir = path.join(repoRoot, 'games/crpg-realm/assets/blockouts');
  const assetsDir = path.join(repoRoot, 'games/crpg-realm/assets');
  return { repoRoot, scenesDir, mapsDir, campaignsDir, blockoutsDir, assetsDir };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1100,
    minHeight: 740,
    backgroundColor: '#0d1117',
    title: 'RobOS cRPG Scene Studio — Stage & Entity Designer',
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
    startDebugServer(mainWindow, 19196, 'crpg-scene-studio');
  } catch (err) {
    try {
      const localDom = require('../robos-lib/dom-snapshot');
      localDom.registerSnapshotIPC(mainWindow);
      localDom.startDebugServer(mainWindow, 19196, 'crpg-scene-studio');
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

function setupIpcHandlers() {
  const paths = getPaths();

  ipcMain.handle('app:get-paths', async () => paths);

  // Scenes
  ipcMain.handle('scenes:list', async () => {
    try {
      if (!fs.existsSync(paths.scenesDir)) {
        fs.mkdirSync(paths.scenesDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.scenesDir).filter(f => f.endsWith('.jsonld'));
      const scenes = [];

      for (const file of files) {
        const slug = file.replace(/\.jsonld$/, '');
        const fullPath = path.join(paths.scenesDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          const entities = Array.isArray(data['robos:entities']) ? data['robos:entities'] : [];

          scenes.push({
            slug,
            fileName: file,
            path: fullPath,
            id: data['@id'] || `urn:robos:crpg:scene:${slug}`,
            title: data['dcterms:title'] || data.title || slug,
            map: data['robos:map'] || '',
            campaign: data['robos:campaign'] || '',
            entityCount: entities.length,
            lighting: data['robos:atmosphere']?.['robos:lighting'] || 'Day Sunlight',
          });
        } catch (e) {
          scenes.push({ slug, fileName: file, path: fullPath, title: slug, error: e.message });
        }
      }
      return { success: true, scenes };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scenes:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.scenesDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Scene file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return { success: true, slug, filePath, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scenes:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Scene slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.scenesDir, `${safeSlug}.jsonld`);

      const formatted = {
        '@context': {
          'robos': 'urn:robos:',
          'dcterms': 'http://purl.org/dc/terms/',
          'xsd': 'http://www.w3.org/2001/XMLSchema#'
        },
        '@id': data['@id'] || `urn:robos:crpg:scene:${safeSlug}`,
        '@type': 'robos:CRPGScene',
        'dcterms:title': data.title || data['dcterms:title'] || safeSlug,
        'dcterms:description': data.description || data['dcterms:description'] || '',
        'robos:map': data.map || data['robos:map'] || '',
        'robos:campaign': data.campaign || data['robos:campaign'] || '',
        'robos:dimensions': data.dimensions || data['robos:dimensions'] || { width: 5120, height: 3840, feetWidth: 320, feetHeight: 240 },
        'robos:atmosphere': data.atmosphere || data['robos:atmosphere'] || {
          'robos:lighting': 'Day Sunlight',
          'robos:ambientAudio': 'candlekeep_day_theme.ogg',
          'robos:fogOfWar': false
        },
        'robos:entities': data.entities || data['robos:entities'] || [],
      };

      if (!fs.existsSync(paths.scenesDir)) {
        fs.mkdirSync(paths.scenesDir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(formatted, null, 2), 'utf8');

      return {
        success: true,
        slug: safeSlug,
        filePath,
        savedAt: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scenes:delete', async (_event, slug) => {
    try {
      const filePath = path.join(paths.scenesDir, `${slug}.jsonld`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Maps listing and loading
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
            id: data['@id'] || `urn:robos:crpg:battle-map:${slug}`,
            title: data['dcterms:title'] || data.title || slug,
            width: data['robos:width'] || data.width || 120,
            height: data['robos:height'] || data.height || 80,
            pngExists,
            pngPath: pngExists ? pngPath : null,
            bgImage: data['robos:backgroundImage'] || '',
          });
        } catch {}
      }
      return { success: true, maps };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('maps:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.mapsDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) throw new Error(`Map not found: ${filePath}`);
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      const pngPath = path.join(paths.blockoutsDir, `${slug}.png`);
      const pngExists = fs.existsSync(pngPath);
      return { success: true, slug, data, pngExists, pngPath: pngExists ? pngPath : null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Campaigns listing and loading
  ipcMain.handle('campaigns:list', async () => {
    try {
      if (!fs.existsSync(paths.campaignsDir)) {
        fs.mkdirSync(paths.campaignsDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.campaignsDir).filter(f => f.endsWith('.jsonld'));
      const campaigns = files.map(f => {
        const slug = f.replace(/\.jsonld$/, '');
        let title = slug;
        try {
          const content = JSON.parse(fs.readFileSync(path.join(paths.campaignsDir, f), 'utf8'));
          title = content['dcterms:title'] || content.title || slug;
        } catch {}
        return { slug, fileName: f, title };
      });
      return { success: true, campaigns };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('campaigns:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.campaignsDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) throw new Error(`Campaign not found: ${filePath}`);
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return { success: true, slug, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
