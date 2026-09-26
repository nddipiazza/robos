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
  const baseDir = process.env.ROBOS_CRPG_DIR
    ? path.resolve(process.env.ROBOS_CRPG_DIR)
    : path.join(repoRoot, 'games/crpg-realm');
  const campaignsDir = path.join(baseDir, 'campaigns');
  const charactersDir = path.join(baseDir, 'characters');
  const mapsDir = path.join(baseDir, 'maps');
  const scenesDir = path.join(baseDir, 'scenes');
  const blockoutsDir = path.join(baseDir, 'assets/blockouts');
  const portraitsDir = path.join(baseDir, 'assets/portraits');
  const blockoutPackageDir = path.join(repoRoot, 'packages/robos-crpg-blockout');
  return {
    repoRoot,
    baseDir,
    campaignsDir,
    charactersDir,
    mapsDir,
    scenesDir,
    blockoutsDir,
    portraitsDir,
    blockoutPackageDir,
  };
}

function ensureWorkspaceDirs(paths) {
  [
    paths.campaignsDir,
    paths.charactersDir,
    paths.mapsDir,
    paths.scenesDir,
    paths.blockoutsDir,
    paths.portraitsDir,
  ].forEach(d => {
    if (!fs.existsSync(d)) {
      try { fs.mkdirSync(d, { recursive: true }); } catch {}
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1100,
    minHeight: 740,
    backgroundColor: '#0d1117',
    title: 'RobOS cRPG Editor — Campaign, Character, Inventory & Maps Studio',
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

// Helper to seed initial character entities if charactersDir is empty
function ensureSeedCharacters(charactersDir) {
  try {
    if (!fs.existsSync(charactersDir)) {
      fs.mkdirSync(charactersDir, { recursive: true });
    }
    const existing = fs.readdirSync(charactersDir).filter(f => f.endsWith('.jsonld'));
    if (existing.length > 0) return;

    const seedList = [
      {
        slug: 'hero-vance',
        characterType: 'hero',
        name: 'Vance',
        race: 'Human',
        class: 'Fighter',
        subclass: 'Champion',
        background: 'Ward of Gorion',
        alignment: 'Neutral Good',
        level: 1,
        xp: 0,
        portrait: '⚔️',
        str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8,
        ac: 16, hpMax: 12, hpCurrent: 12, speed: 30, initiative: 2, prof: 2,
        mainHand: 'Longsword (+5 to hit, 1d8+3 sl)',
        offHand: 'Steel Shield (+2 AC)',
        armor: 'Chain Mail (AC 16)',
        helmet: 'Iron Bascinet',
        cloak: "Traveler's Cloak",
        boots: 'Stout Boots',
        ring1: 'Ring of Princes (+1 AC/Saves)',
        quickItems: '2x Potion of Healing, Torch',
        spells: 'Second Wind (1d10+1 hp/rest)',
        backstory: 'Raised within the fortified monastery of Candlekeep by the sage Gorion. Trained in bladecraft by the Watchers.'
      },
      {
        slug: 'hero-imoen',
        characterType: 'hero',
        name: 'Imoen',
        race: 'Human',
        class: 'Rogue',
        subclass: 'Thief',
        background: 'Candlekeep Mischief',
        alignment: 'Neutral Good',
        level: 1,
        xp: 0,
        portrait: '🏹',
        str: 9, dex: 18, con: 16, int: 12, wis: 11, cha: 16,
        ac: 15, hpMax: 10, hpCurrent: 10, speed: 30, initiative: 4, prof: 2,
        mainHand: 'Shortbow (+6 to hit, 1d6+4 pierc)',
        offHand: 'Dagger (+6 to hit, 1d4+4)',
        armor: 'Studded Leather Armor (AC 12+DEX)',
        helmet: 'Leather Cap',
        cloak: 'Cloak of Elvenkind',
        boots: 'Soft Leather Boots',
        ring1: 'Ring of Lockpicking',
        quickItems: "Thieves' Tools, 20x Arrows, Potion of Speed",
        spells: 'Sneak Attack (1d6), Cunning Action',
        backstory: 'Childhood companion and foster sister in Candlekeep, always picking locks and following along on adventures.'
      },
      {
        slug: 'hero-ignis',
        characterType: 'hero',
        name: 'Ignis',
        race: 'High Elf',
        class: 'Wizard',
        subclass: 'Evoker',
        background: 'Scholar of Candlekeep',
        alignment: 'True Neutral',
        level: 1,
        xp: 0,
        portrait: '🔮',
        str: 8, dex: 15, con: 13, int: 17, wis: 12, cha: 10,
        ac: 12, hpMax: 7, hpCurrent: 7, speed: 30, initiative: 2, prof: 2,
        mainHand: 'Quarterstaff (+1 to hit, 1d6 blud)',
        offHand: 'Spell Component Pouch',
        armor: 'Mage Robes',
        helmet: 'Circlet of Focus',
        cloak: "Scholar's Mantle",
        boots: 'Cloth Slippers',
        ring1: 'Ring of Wizardry',
        quickItems: 'Scroll of Magic Missile, Wand of Frost (3 ch)',
        spells: 'Cantrips: Fire Bolt, Light, Prestidigitation. Spells: Magic Missile, Shield, Mage Armor, Burning Hands',
        backstory: 'Apprentice archivist studying under Firebead Elfmirk. Fascinated by the weave of destructive magic.'
      },
      {
        slug: 'npc-elora',
        characterType: 'npc',
        name: 'Elora',
        role: 'partner',
        alignment: 'Chaotic Good',
        portrait: '🌲',
        interactionType: 'talk',
        location: 'homestead',
        facing: 'down',
        col: 6,
        row: 5,
        dialogue: [
          'You finally woke up. We need to prepare before venturing out towards the village square.'
        ],
        backstory: 'Trusted companion and scout at the homestead.'
      }
    ];

    for (const char of seedList) {
      const slug = char.slug;
      const isNpc = char.characterType === 'npc';
      const jsonld = {
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
        },
        '@id': `urn:robos:crpg:character:${slug}`,
        '@type': [
          'robos:CRPGCharacter',
          ...(isNpc ? ['robos:CRPGNPC'] : ['robos:CRPGPlayerCharacter', 'robos:CRPGHero']),
          'schema:Person',
        ],
        'dcterms:title': char.name,
        'robos:characterType': char.characterType,
        'robos:name': char.name,
        ...char,
      };
      fs.writeFileSync(path.join(charactersDir, `${slug}.jsonld`), JSON.stringify(jsonld, null, 2) + '\n', 'utf8');
    }
  } catch (err) {
    console.warn('Could not seed default characters:', err.message);
  }
}

// IPC Handler Registrations
function setupIpcHandlers() {
  const paths = getPaths();
  ensureWorkspaceDirs(paths);

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
          const maps = Array.isArray(data['robos:maps']) ? data['robos:maps'] : (Array.isArray(data.maps) ? data.maps : []);
          const characters = Array.isArray(data['robos:characters']) ? data['robos:characters'] : (Array.isArray(data.characters) ? data.characters : []);

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
            startingMap: data['robos:startingMap'] || data.startingMap || gs['robos:currentScene'] || gs.currentScene || data.currentScene || '',
            currentScene: gs['robos:currentScene'] || gs.currentScene || data.currentScene || '',
            heroCount: heroes.length,
            mapCount: maps.length,
            characterCount: characters.length,
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
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
          xsd: 'http://www.w3.org/2001/XMLSchema#',
        },
        '@id': `urn:robos:crpg:campaign:${safeSlug}`,
        '@type': ['robos:CRPGCampaign', 'schema:CreativeWork'],
        'dcterms:title': data.title || data['dcterms:title'] || safeSlug,
        'dcterms:description': data.description || data['dcterms:description'] || '',
        'robos:setting': data.setting || data['robos:setting'] || '',
        'robos:ruleSet': data.ruleSet || data['robos:ruleSet'] || 'D&D 5e SRD',
        'robos:difficulty': data.difficulty || data['robos:difficulty'] || 'Core Rules',
        'robos:startingMap': data.startingMap || data['robos:startingMap'] || data.currentScene || '',
        'robos:maps': Array.isArray(data.maps) ? data.maps : (Array.isArray(data['robos:maps']) ? data['robos:maps'] : []),
        'robos:characters': Array.isArray(data.characters) ? data.characters : (Array.isArray(data['robos:characters']) ? data['robos:characters'] : []),
        'robos:heroes': data.heroes || data['robos:heroes'] || [],
        'robos:gameState': data.gameState || data['robos:gameState'] || {
          'robos:currentScene': data.startingMap || '',
          'robos:activeParty': [],
          'robos:partyLeaderIndex': 0,
          'robos:partyFormation': 'rank',
          'robos:sharedInventory': { gold: 0, silver: 0, copper: 0, items: [] },
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

  // 2b. Character & NPC APIs
  ipcMain.handle('characters:list', async () => {
    try {
      if (!fs.existsSync(paths.charactersDir)) {
        fs.mkdirSync(paths.charactersDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.charactersDir).filter(f => f.endsWith('.jsonld'));
      const characters = [];

      for (const file of files) {
        const slug = file.replace(/\.jsonld$/, '');
        const fullPath = path.join(paths.charactersDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          const charType = data['robos:characterType'] || data.characterType || (data['@type']?.includes('robos:CRPGNPC') ? 'npc' : 'hero');
          characters.push({
            slug,
            fileName: file,
            path: fullPath,
            id: data['@id'] || `urn:robos:crpg:character:${slug}`,
            name: data['dcterms:title'] || data['robos:name'] || data.name || slug,
            characterType: charType,
            role: data['robos:role'] || data.role || (charType === 'npc' ? 'villager' : ''),
            class: data['robos:class'] || data.class || '',
            subclass: data['robos:subclass'] || data.subclass || '',
            race: data['robos:race'] || data.race || 'Human',
            background: data['robos:background'] || data.background || '',
            level: data['robos:level'] || data.level || 1,
            alignment: data['robos:alignment'] || data.alignment || 'True Neutral',
            portrait: data['robos:portrait'] || data.portrait || (charType === 'npc' ? '👤' : '⚔️'),
            interactionType: data['robos:interactionType'] || data.interactionType || 'talk',
            location: data['robos:location'] || data.location || '',
            col: data['robos:col'] ?? data.col ?? 0,
            row: data['robos:row'] ?? data.row ?? 0,
            facing: data['robos:facing'] || data.facing || 'down',
            dialogue: data['robos:dialogue'] || data.dialogue || [],
            raw: data,
          });
        } catch (e) {
          characters.push({ slug, fileName: file, path: fullPath, name: slug, error: e.message });
        }
      }
      return { success: true, characters };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('characters:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.charactersDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Character file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return { success: true, slug, filePath, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('characters:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Character slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.charactersDir, `${safeSlug}.jsonld`);
      const charType = data.characterType || (data['@type']?.includes('robos:CRPGNPC') ? 'npc' : 'hero');
      const isNpc = charType === 'npc';

      const formatted = {
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
        },
        '@id': data['@id'] || `urn:robos:crpg:character:${safeSlug}`,
        '@type': [
          'robos:CRPGCharacter',
          ...(isNpc ? ['robos:CRPGNPC'] : ['robos:CRPGPlayerCharacter', 'robos:CRPGHero']),
          'schema:Person',
        ],
        'dcterms:title': data.name || data['dcterms:title'] || safeSlug,
        'robos:characterType': charType,
        ...data,
        slug: safeSlug,
      };

      if (!fs.existsSync(paths.charactersDir)) {
        fs.mkdirSync(paths.charactersDir, { recursive: true });
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

  ipcMain.handle('characters:delete', async (_event, slug) => {
    try {
      const filePath = path.join(paths.charactersDir, `${slug}.jsonld`);
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
        '@id': `urn:robos:crpg:battle-map:${safeSlug}`,
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
      const cmd = `python3 -m robos_crpg_blockout build "${mapPath}" --game-dir "${paths.baseDir}" ${flags}`;
      console.log(`[maps:build] Executing: ${cmd}`);

      const { stdout, stderr } = await execPromise(cmd, {
        cwd: paths.blockoutPackageDir,
        env: { ...process.env, PYTHONPATH: paths.blockoutPackageDir },
      });
      console.log(`[maps:build] Output:\n${stdout}`);
      if (stderr) console.warn(`[maps:build] Stderr:\n${stderr}`);

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
      console.error(`[maps:build] Error:`, err);
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
