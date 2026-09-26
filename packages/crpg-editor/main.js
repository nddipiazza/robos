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
  const itemsDir = path.join(baseDir, 'items');
  const spellsDir = path.join(baseDir, 'spells');
  const abilitiesDir = path.join(baseDir, 'abilities');
  const eventsDir = path.join(baseDir, 'events');
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
    itemsDir,
    spellsDir,
    abilitiesDir,
    eventsDir,
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
    paths.itemsDir,
    paths.spellsDir,
    paths.abilitiesDir,
    paths.eventsDir,
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
        spells: '',
        abilities: ['second-wind', 'action-surge'],
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
        spells: '',
        abilities: ['sneak-attack', 'cunning-action'],
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
            mainHand: data['robos:mainHand'] || data.mainHand || '',
            offHand: data['robos:offHand'] || data.offHand || '',
            armor: data['robos:armor'] || data.armor || '',
            helmet: data['robos:helmet'] || data.helmet || '',
            cloak: data['robos:cloak'] || data.cloak || '',
            boots: data['robos:boots'] || data.boots || '',
            ring1: data['robos:ring1'] || data.ring1 || '',
            quickItems: data['robos:quickItems'] || data.quickItems || '',
            inventory: data['robos:inventory'] || data.inventory || [],
            'robos:inventory': data['robos:inventory'] || data.inventory || [],
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

  // 5. Items API
  ipcMain.handle('items:list', async () => {
    try {
      if (!fs.existsSync(paths.itemsDir)) {
        fs.mkdirSync(paths.itemsDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.itemsDir).filter(f => f.endsWith('.jsonld'));
      const items = [];

      for (const file of files) {
        const slug = file.replace(/\.jsonld$/, '');
        const fullPath = path.join(paths.itemsDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          items.push({
            slug,
            fileName: file,
            path: fullPath,
            id: data['@id'] || `urn:robos:crpg:item:${slug}`,
            name: data['dcterms:title'] || data['schema:name'] || data.name || slug,
            title: data['dcterms:title'] || data['schema:name'] || data.name || slug,
            category: data['robos:itemCategory'] || data.itemCategory || data.category || 'misc',
            itemCategory: data['robos:itemCategory'] || data.itemCategory || data.category || 'misc',
            equipSlot: data['robos:equipSlot'] || data.equipSlot || null,
            cost: Number(data['robos:cost'] ?? data.cost ?? 0),
            weight: Number(data['robos:weight'] ?? data.weight ?? 0),
            rarity: data['robos:rarity'] || data.rarity || 'common',
            icon: data['robos:icon'] || data.icon || '📦',
            damageDice: data['robos:damageDice'] || data.damageDice || '',
            damageType: data['robos:damageType'] || data.damageType || '',
            acBonus: Number(data['robos:acBonus'] ?? data.acBonus ?? 0),
            effect: data['robos:effect'] || data.effect || '',
            description: data['dcterms:description'] || data.description || '',
            raw: data,
          });
        } catch (e) {
          items.push({ slug, fileName: file, path: fullPath, name: slug, error: e.message });
        }
      }
      return { success: true, items };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('items:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.itemsDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Item file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return { success: true, slug, filePath, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('items:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Item slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.itemsDir, `${safeSlug}.jsonld`);

      const formatted = {
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
          xsd: 'http://www.w3.org/2001/XMLSchema#',
        },
        '@id': data['@id'] || `urn:robos:crpg:item:${safeSlug}`,
        '@type': [
          'robos:CRPGItem',
          'schema:Product',
          'oslc_am:Resource',
        ],
        'dcterms:title': data.name || data['dcterms:title'] || safeSlug,
        'schema:name': data.name || data['dcterms:title'] || safeSlug,
        'robos:slug': safeSlug,
        slug: safeSlug,
        'robos:itemCategory': data.category || data.itemCategory || data['robos:itemCategory'] || 'misc',
        itemCategory: data.category || data.itemCategory || data['robos:itemCategory'] || 'misc',
        'robos:equipSlot': data.equipSlot || data['robos:equipSlot'] || null,
        equipSlot: data.equipSlot || data['robos:equipSlot'] || null,
        'robos:cost': Number(data.cost ?? data['robos:cost'] ?? 0),
        cost: Number(data.cost ?? data['robos:cost'] ?? 0),
        'robos:weight': Number(data.weight ?? data['robos:weight'] ?? 0),
        weight: Number(data.weight ?? data['robos:weight'] ?? 0),
        'robos:rarity': data.rarity || data['robos:rarity'] || 'common',
        rarity: data.rarity || data['robos:rarity'] || 'common',
        'robos:icon': data.icon || data['robos:icon'] || '📦',
        icon: data.icon || data['robos:icon'] || '📦',
        'robos:damageDice': data.damageDice || data['robos:damageDice'] || '',
        damageDice: data.damageDice || data['robos:damageDice'] || '',
        'robos:damageType': data.damageType || data['robos:damageType'] || '',
        damageType: data.damageType || data['robos:damageType'] || '',
        'robos:acBonus': Number(data.acBonus ?? data['robos:acBonus'] ?? 0),
        acBonus: Number(data.acBonus ?? data['robos:acBonus'] ?? 0),
        'robos:effect': data.effect || data['robos:effect'] || '',
        effect: data.effect || data['robos:effect'] || '',
        'dcterms:description': data.description || data['dcterms:description'] || '',
        description: data.description || data['dcterms:description'] || '',
      };

      if (!fs.existsSync(paths.itemsDir)) {
        fs.mkdirSync(paths.itemsDir, { recursive: true });
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

  ipcMain.handle('items:delete', async (_event, slug) => {
    try {
      const filePath = path.join(paths.itemsDir, `${slug}.jsonld`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 6. Spells API
  ipcMain.handle('spells:list', async () => {
    try {
      if (!fs.existsSync(paths.spellsDir)) {
        fs.mkdirSync(paths.spellsDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.spellsDir).filter(f => f.endsWith('.jsonld'));
      const spells = [];

      for (const file of files) {
        const slug = file.replace(/\.jsonld$/, '');
        const fullPath = path.join(paths.spellsDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          spells.push({
            slug,
            fileName: file,
            path: fullPath,
            id: data['@id'] || `urn:robos:crpg:spell:${slug}`,
            name: data['dcterms:title'] || data['schema:name'] || data.name || slug,
            title: data['dcterms:title'] || data['schema:name'] || data.title || slug,
            level: Number(data['robos:spellLevel'] ?? data.spellLevel ?? data.level ?? 0),
            spellLevel: Number(data['robos:spellLevel'] ?? data.spellLevel ?? data.level ?? 0),
            school: data['robos:magicSchool'] || data.magicSchool || data.school || 'Evocation',
            magicSchool: data['robos:magicSchool'] || data.magicSchool || data.school || 'Evocation',
            castingTime: data['robos:castingTime'] || data.castingTime || '1 action',
            range: data['robos:range'] || data.range || 'Touch',
            damageFormula: data['robos:damageFormula'] || data.damageFormula || '',
            damageType: data['robos:damageType'] || data.damageType || '',
            duration: data['robos:duration'] || data.duration || 'Instantaneous',
            components: data['robos:components'] || data.components || 'V, S',
            savingThrow: data['robos:savingThrow'] || data.savingThrow || 'None',
            icon: data['robos:icon'] || data.icon || '✨',
            description: data['dcterms:description'] || data.description || '',
            mechanics: data['robos:mechanics'] || data.mechanics || {},
            raw: data,
          });
        } catch (e) {
          spells.push({ slug, fileName: file, path: fullPath, title: slug, error: e.message });
        }
      }
      // Sort by level then name
      spells.sort((a, b) => (a.level - b.level) || a.title.localeCompare(b.title));
      return { success: true, spells };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('spells:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.spellsDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Spell file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return { success: true, slug, filePath, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('spells:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Spell slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.spellsDir, `${safeSlug}.jsonld`);

      const formatted = {
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
          xsd: 'http://www.w3.org/2001/XMLSchema#',
        },
        '@id': data['@id'] || `urn:robos:crpg:spell:${safeSlug}`,
        '@type': [
          'robos:CRPGSpell',
          'schema:Action',
          'oslc_am:Resource',
        ],
        'dcterms:title': data.title || data.name || data['dcterms:title'] || safeSlug,
        'schema:name': data.title || data.name || data['dcterms:title'] || safeSlug,
        'robos:slug': safeSlug,
        slug: safeSlug,
        'robos:spellLevel': Number(data.level ?? data.spellLevel ?? data['robos:spellLevel'] ?? 0),
        spellLevel: Number(data.level ?? data.spellLevel ?? data['robos:spellLevel'] ?? 0),
        'robos:magicSchool': data.school || data.magicSchool || data['robos:magicSchool'] || 'Evocation',
        magicSchool: data.school || data.magicSchool || data['robos:magicSchool'] || 'Evocation',
        'robos:castingTime': data.castingTime || data['robos:castingTime'] || '1 action',
        castingTime: data.castingTime || data['robos:castingTime'] || '1 action',
        'robos:range': data.range || data['robos:range'] || 'Touch',
        range: data.range || data['robos:range'] || 'Touch',
        'robos:damageFormula': data.damageFormula || data['robos:damageFormula'] || '',
        damageFormula: data.damageFormula || data['robos:damageFormula'] || '',
        'robos:damageType': data.damageType || data['robos:damageType'] || '',
        damageType: data.damageType || data['robos:damageType'] || '',
        'robos:icon': data.icon || data['robos:icon'] || '✨',
        icon: data.icon || data['robos:icon'] || '✨',
        'robos:duration': data.duration || data['robos:duration'] || 'Instantaneous',
        duration: data.duration || data['robos:duration'] || 'Instantaneous',
        'robos:components': data.components || data['robos:components'] || 'V, S',
        components: data.components || data['robos:components'] || 'V, S',
        'robos:savingThrow': data.savingThrow || data['robos:savingThrow'] || 'None',
        savingThrow: data.savingThrow || data['robos:savingThrow'] || 'None',
        'robos:mechanics': data.mechanics || data['robos:mechanics'] || {},
        mechanics: data.mechanics || data['robos:mechanics'] || {},
        'dcterms:description': data.description || data['dcterms:description'] || '',
        description: data.description || data['dcterms:description'] || '',
      };

      if (!fs.existsSync(paths.spellsDir)) {
        fs.mkdirSync(paths.spellsDir, { recursive: true });
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

  ipcMain.handle('spells:delete', async (_event, slug) => {
    try {
      const filePath = path.join(paths.spellsDir, `${slug}.jsonld`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 7. Abilities API
  ipcMain.handle('abilities:list', async () => {
    try {
      if (!fs.existsSync(paths.abilitiesDir)) {
        fs.mkdirSync(paths.abilitiesDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.abilitiesDir).filter(f => f.endsWith('.jsonld'));
      const abilities = [];

      for (const file of files) {
        const slug = file.replace(/\.jsonld$/, '');
        const fullPath = path.join(paths.abilitiesDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          abilities.push({
            slug,
            fileName: file,
            path: fullPath,
            id: data['@id'] || `urn:robos:crpg:ability:${slug}`,
            name: data['dcterms:title'] || data['schema:name'] || data.name || slug,
            title: data['dcterms:title'] || data['schema:name'] || data.title || slug,
            category: data['robos:category'] || data.category || 'class_feature',
            actionType: data['robos:actionType'] || data.actionType || 'action',
            recharge: data['robos:recharge'] || data.recharge || 'short_rest',
            resourceCost: data['robos:resourceCost'] || data.resourceCost || 'None',
            range: data['robos:range'] || data.range || 'Self',
            duration: data['robos:duration'] || data.duration || 'Instantaneous',
            icon: data['robos:icon'] || data.icon || '⚡',
            prerequisites: data['robos:prerequisites'] || data.prerequisites || '',
            effectFormula: data['robos:effectFormula'] || data.effectFormula || '',
            description: data['dcterms:description'] || data.description || '',
            mechanics: data['robos:mechanics'] || data.mechanics || {},
            raw: data,
          });
        } catch (e) {
          abilities.push({ slug, fileName: file, path: fullPath, title: slug, error: e.message });
        }
      }
      // Sort by category then title
      abilities.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
      return { success: true, abilities };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('abilities:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.abilitiesDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Ability file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return { success: true, slug, filePath, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('abilities:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Ability slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.abilitiesDir, `${safeSlug}.jsonld`);

      const formatted = {
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
          xsd: 'http://www.w3.org/2001/XMLSchema#',
        },
        '@id': data['@id'] || `urn:robos:crpg:ability:${safeSlug}`,
        '@type': [
          'robos:CRPGAbility',
          'schema:Action',
          'oslc_am:Resource',
        ],
        'dcterms:title': data.title || data.name || data['dcterms:title'] || safeSlug,
        'schema:name': data.title || data.name || data['dcterms:title'] || safeSlug,
        'robos:slug': safeSlug,
        slug: safeSlug,
        'robos:category': data.category || data['robos:category'] || 'class_feature',
        category: data.category || data['robos:category'] || 'class_feature',
        'robos:actionType': data.actionType || data['robos:actionType'] || 'action',
        actionType: data.actionType || data['robos:actionType'] || 'action',
        'robos:recharge': data.recharge || data['robos:recharge'] || 'short_rest',
        recharge: data.recharge || data['robos:recharge'] || 'short_rest',
        'robos:resourceCost': data.resourceCost || data['robos:resourceCost'] || 'None',
        resourceCost: data.resourceCost || data['robos:resourceCost'] || 'None',
        'robos:range': data.range || data['robos:range'] || 'Self',
        range: data.range || data['robos:range'] || 'Self',
        'robos:duration': data.duration || data['robos:duration'] || 'Instantaneous',
        duration: data.duration || data['robos:duration'] || 'Instantaneous',
        'robos:icon': data.icon || data['robos:icon'] || '⚡',
        icon: data.icon || data['robos:icon'] || '⚡',
        'robos:prerequisites': data.prerequisites || data['robos:prerequisites'] || '',
        prerequisites: data.prerequisites || data['robos:prerequisites'] || '',
        'robos:effectFormula': data.effectFormula || data['robos:effectFormula'] || '',
        effectFormula: data.effectFormula || data['robos:effectFormula'] || '',
        'robos:mechanics': data.mechanics || data['robos:mechanics'] || {},
        mechanics: data.mechanics || data['robos:mechanics'] || {},
        'dcterms:description': data.description || data['dcterms:description'] || '',
        description: data.description || data['dcterms:description'] || '',
      };

      if (!fs.existsSync(paths.abilitiesDir)) {
        fs.mkdirSync(paths.abilitiesDir, { recursive: true });
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

  ipcMain.handle('abilities:delete', async (_event, slug) => {
    try {
      const filePath = path.join(paths.abilitiesDir, `${slug}.jsonld`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 8. Game Events API (Knowledge Graph & Infinity Engine interactions)
  ipcMain.handle('events:list', async () => {
    try {
      if (!fs.existsSync(paths.eventsDir)) {
        fs.mkdirSync(paths.eventsDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.eventsDir).filter(f => f.endsWith('.jsonld'));
      const events = [];

      for (const file of files) {
        const slug = file.replace(/\.jsonld$/, '');
        const fullPath = path.join(paths.eventsDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          const infinity = data['robos:infinityInteraction'] || data.infinityInteraction || {};
          const mutations = data['robos:stateMutations'] || data.stateMutations || {};

          events.push({
            slug,
            fileName: file,
            path: fullPath,
            id: data['@id'] || `urn:robos:crpg:event:${slug}`,
            urn: data['@id'] || `urn:robos:crpg:event:${slug}`,
            title: data['dcterms:title'] || data['schema:name'] || data.title || slug,
            name: data['schema:name'] || data['dcterms:title'] || data.name || slug,
            description: data['dcterms:description'] || data.description || '',
            eventType: data['robos:eventType'] || data.eventType || 'dialogue',
            infinityInteraction: {
              interactionType: infinity['robos:interactionType'] || infinity.interactionType || 'bcs_script_action',
              scriptVm: infinity['robos:scriptVm'] || infinity.scriptVm || 'urn:robos:infinity:subsystem:bcs-script-vm',
              dialogueMachine: infinity['robos:dialogueMachine'] || infinity.dialogueMachine || 'urn:robos:infinity:subsystem:dialogue-state-machine',
              bcsTrigger: infinity['robos:bcsTrigger'] || infinity.bcsTrigger || '',
              bcsAction: infinity['robos:bcsAction'] || infinity.bcsAction || '',
              dialogueRef: infinity['robos:dialogueRef'] || infinity.dialogueRef || '',
              journalEntry: infinity['robos:journalEntry'] || infinity.journalEntry || '',
              cutsceneRef: infinity['robos:cutsceneRef'] || infinity.cutsceneRef || '',
              scenarioRef: infinity['robos:scenarioRef'] || infinity.scenarioRef || '',
            },
            stateMutations: {
              setFlags: mutations['robos:setFlags'] || mutations.setFlags || {},
              xpAward: mutations['robos:xpAward'] || mutations.xpAward || 0,
              goldChange: mutations['robos:goldChange'] || mutations.goldChange || 0,
            },
            raw: data,
          });
        } catch (e) {
          events.push({ slug, fileName: file, path: fullPath, title: slug, error: e.message });
        }
      }
      events.sort((a, b) => a.title.localeCompare(b.title));
      return { success: true, events };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('events:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.eventsDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Game event file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return { success: true, slug, filePath, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('events:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Game event slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.eventsDir, `${safeSlug}.jsonld`);

      const infinity = data.infinityInteraction || {};
      const mutations = data.stateMutations || {};

      const formatted = {
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          infinity: 'https://robos.dev/ns/infinity#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
          xsd: 'http://www.w3.org/2001/XMLSchema#',
        },
        '@id': data['@id'] || `urn:robos:crpg:event:${safeSlug}`,
        '@type': [
          'robos:CRPGGameEvent',
          'schema:Event',
          'oslc_am:Resource',
        ],
        'dcterms:title': data.title || data.name || safeSlug,
        'schema:name': data.title || data.name || safeSlug,
        'robos:slug': safeSlug,
        slug: safeSlug,
        'dcterms:description': data.description || '',
        description: data.description || '',
        'robos:eventType': data.eventType || 'dialogue',
        eventType: data.eventType || 'dialogue',
        'robos:infinityInteraction': {
          'robos:interactionType': infinity.interactionType || 'bcs_script_action',
          interactionType: infinity.interactionType || 'bcs_script_action',
          'robos:scriptVm': infinity.scriptVm || 'urn:robos:infinity:subsystem:bcs-script-vm',
          'robos:dialogueMachine': infinity.dialogueMachine || 'urn:robos:infinity:subsystem:dialogue-state-machine',
          'robos:bcsTrigger': infinity.bcsTrigger || '',
          bcsTrigger: infinity.bcsTrigger || '',
          'robos:bcsAction': infinity.bcsAction || '',
          bcsAction: infinity.bcsAction || '',
          ...(infinity.dialogueRef ? { 'robos:dialogueRef': infinity.dialogueRef, dialogueRef: infinity.dialogueRef } : {}),
          ...(infinity.journalEntry ? { 'robos:journalEntry': infinity.journalEntry, journalEntry: infinity.journalEntry } : {}),
          ...(infinity.cutsceneRef ? { 'robos:cutsceneRef': infinity.cutsceneRef, cutsceneRef: infinity.cutsceneRef } : {}),
          ...(infinity.scenarioRef ? { 'robos:scenarioRef': infinity.scenarioRef, scenarioRef: infinity.scenarioRef } : {}),
        },
        'robos:stateMutations': mutations,
        stateMutations: mutations,
        'robos:package': 'crpg',
        'robos:namespace': 'robos.crpg',
      };

      if (!fs.existsSync(paths.eventsDir)) {
        fs.mkdirSync(paths.eventsDir, { recursive: true });
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

  ipcMain.handle('events:delete', async (_event, slug) => {
    try {
      const filePath = path.join(paths.eventsDir, `${slug}.jsonld`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
