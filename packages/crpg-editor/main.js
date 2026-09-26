const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
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
  const campaignsDir = path.join(repoRoot, 'games/crpg-realm/campaigns');
  const mapsDir = path.join(repoRoot, 'games/crpg-realm/maps');
  const scenesDir = path.join(repoRoot, 'games/crpg-realm/scenes');
  const blockoutsDir = path.join(repoRoot, 'games/crpg-realm/assets/blockouts');
  const portraitsDir = path.join(repoRoot, 'games/crpg-realm/assets/portraits');
  const blockoutPackageDir = path.join(repoRoot, 'packages/robos-crpg-blockout');
  return {
    repoRoot,
    campaignsDir,
    mapsDir,
    scenesDir,
    blockoutsDir,
    portraitsDir,
    blockoutPackageDir,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1100,
    minHeight: 740,
    backgroundColor: '#0d1117',
    title: 'RobOS cRPG Editor — Campaign, Character, Inventory & Blockmap Studio',
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
    startDebugServer(mainWindow, 19194, 'crpg-editor');
  } catch (err) {
    try {
      const localDom = require('../robos-lib/dom-snapshot');
      localDom.registerSnapshotIPC(mainWindow);
      localDom.startDebugServer(mainWindow, 19194, 'crpg-editor');
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

  // 1. Environment Paths
  ipcMain.handle('app:get-paths', async () => paths);

  // 2. Campaigns API
  ipcMain.handle('campaigns:list', async () => {
    try {
      if (!fs.existsSync(paths.campaignsDir)) {
        fs.mkdirSync(paths.campaignsDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.campaignsDir).filter(f => f.endsWith('.jsonld'));
      const campaigns = [];

      for (const file of files) {
        const slug = file.replace(/\.jsonld$/, '');
        const fullPath = path.join(paths.campaignsDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          const gs = data['robos:gameState'] || data.gameState || {};
          const heroes = Array.isArray(data['robos:heroes']) ? data['robos:heroes'] : (Array.isArray(data.heroes) ? data.heroes : []);
          const quests = Array.isArray(gs['robos:questLog']) ? gs['robos:questLog'] : (Array.isArray(gs.questLog) ? gs.questLog : []);

          campaigns.push({
            slug,
            fileName: file,
            path: fullPath,
            id: data['@id'] || `urn:robos:crpg:campaign:${slug}`,
            title: data['dcterms:title'] || data.title || slug,
            description: data['dcterms:description'] || data.description || '',
            setting: data['robos:setting'] || data.setting || 'Sword Coast',
            ruleSet: data['robos:ruleSet'] || data.ruleSet || 'D&D 5e SRD',
            difficulty: data['robos:difficulty'] || data.difficulty || 'Core Rules',
            currentScene: gs['robos:currentScene'] || gs.currentScene || data.currentScene || '',
            heroCount: heroes.length,
            questCount: quests.length,
            partyGold: gs['robos:sharedInventory']?.gold ?? gs.sharedInventory?.gold ?? 0,
          });
        } catch (e) {
          campaigns.push({ slug, fileName: file, path: fullPath, title: slug, error: e.message });
        }
      }
      return { success: true, campaigns };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('campaigns:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.campaignsDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Campaign file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return { success: true, slug, filePath, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('campaigns:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Campaign slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.campaignsDir, `${safeSlug}.jsonld`);

      const formatted = {
        '@context': {
          robos: 'urn:robos:',
          dcterms: 'http://purl.org/dc/terms/',
          xsd: 'http://www.w3.org/2001/XMLSchema#',
        },
        '@id': data['@id'] || `urn:robos:crpg:campaign:${safeSlug}`,
        '@type': 'robos:CRPGCampaign',
        'dcterms:title': data.title || data['dcterms:title'] || safeSlug,
        'dcterms:description': data.description || data['dcterms:description'] || '',
        'robos:setting': data.setting || data['robos:setting'] || 'Sword Coast',
        'robos:ruleSet': data.ruleSet || data['robos:ruleSet'] || 'D&D 5e SRD',
        'robos:difficulty': data.difficulty || data['robos:difficulty'] || 'Core Rules',
        'robos:heroes': data.heroes || data['robos:heroes'] || [],
        'robos:gameState': data.gameState || data['robos:gameState'] || {
          'robos:currentScene': 'candlekeep-exterior',
          'robos:activeParty': [],
          'robos:partyLeaderIndex': 0,
          'robos:partyFormation': 'rank',
          'robos:sharedInventory': { gold: 100, items: [] },
          'robos:questLog': [],
          'robos:worldFlags': {},
        },
        'robos:scenes': data.scenes || data['robos:scenes'] || [],
      };

      if (!fs.existsSync(paths.campaignsDir)) {
        fs.mkdirSync(paths.campaignsDir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(formatted, null, 2) + '\n', 'utf8');

      return {
        success: true,
        slug: safeSlug,
        filePath,
        savedAt: new Date().toISOString(),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('campaigns:delete', async (_event, slug) => {
    try {
      const filePath = path.join(paths.campaignsDir, `${slug}.jsonld`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 3. Battle Maps API
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

  ipcMain.handle('maps:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Map slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.mapsDir, `${safeSlug}.jsonld`);

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
        'robos:backgroundImage': data['robos:backgroundImage'] || data.backgroundImage || '',
        'robos:backgroundOpacity': Number(data['robos:backgroundOpacity'] ?? data.backgroundOpacity ?? 1.0),
        'robos:mapObjects': data['robos:mapObjects'] || [],
      };

      if (data['robos:blockout']) {
        formatted['robos:blockout'] = data['robos:blockout'];
      }

      fs.writeFileSync(filePath, JSON.stringify(formatted, null, 2) + '\n', 'utf8');
      return { success: true, slug: safeSlug, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

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

  // 4. Scenes API
  ipcMain.handle('scenes:list', async () => {
    try {
      if (!fs.existsSync(paths.scenesDir)) {
        fs.mkdirSync(paths.scenesDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.scenesDir).filter(f => f.endsWith('.jsonld'));
      const scenes = files.map(f => {
        const slug = f.replace(/\.jsonld$/, '');
        let title = slug;
        try {
          const content = JSON.parse(fs.readFileSync(path.join(paths.scenesDir, f), 'utf8'));
          title = content['dcterms:title'] || content.title || slug;
        } catch {}
        return { slug, fileName: f, title };
      });
      return { success: true, scenes };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
