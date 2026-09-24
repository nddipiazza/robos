const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// RobOS flags for VM / container stability
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

function getPaths() {
  const repoRoot = path.resolve(__dirname, '../..');
  const campaignsDir = path.join(repoRoot, 'games/crpg-realm/campaigns');
  const scenesDir = path.join(repoRoot, 'games/crpg-realm/scenes');
  const mapsDir = path.join(repoRoot, 'games/crpg-realm/maps');
  const portraitsDir = path.join(repoRoot, 'games/crpg-realm/assets/portraits');
  return { repoRoot, campaignsDir, scenesDir, mapsDir, portraitsDir };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#0d1117',
    title: 'RobOS cRPG Campaign — Roster & Game State Studio',
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
    startDebugServer(mainWindow, 19195, 'crpg-campaign');
  } catch (err) {
    try {
      const localDom = require('../robos-lib/dom-snapshot');
      localDom.registerSnapshotIPC(mainWindow);
      localDom.startDebugServer(mainWindow, 19195, 'crpg-campaign');
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
            setting: data['robos:setting'] || data.setting || 'Forgotten Realms',
            ruleSet: data['robos:ruleSet'] || data.ruleSet || 'D&D 5e SRD',
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

      // Ensure standard KGraph schema structure
      const formatted = {
        '@context': {
          'robos': 'urn:robos:',
          'dcterms': 'http://purl.org/dc/terms/',
          'xsd': 'http://www.w3.org/2001/XMLSchema#'
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
