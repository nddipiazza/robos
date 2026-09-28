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
  const enemiesDir = path.join(baseDir, 'enemies');
  const spellsDir = path.join(baseDir, 'spells');
  const abilitiesDir = path.join(baseDir, 'abilities');
  const eventsDir = path.join(baseDir, 'events');
  const mapsDir = path.join(baseDir, 'maps');
  const scenesDir = path.join(baseDir, 'scenes');
  const blockoutsDir = path.join(baseDir, 'assets/blockouts');
  const portraitsDir = path.join(baseDir, 'assets/portraits');
  const iconsDir = path.join(baseDir, 'assets/icons');
  const mapsAssetsDir = path.join(baseDir, 'assets/maps');
  const backgroundsDir = path.join(baseDir, 'assets/backgrounds');
  const modelsDir = path.join(baseDir, 'assets/models');
  const tokensDir = path.join(baseDir, 'assets/tokens');
  const spritesDir = path.join(baseDir, 'assets/sprites');
  const blockoutPackageDir = path.join(repoRoot, 'packages/robos-crpg-blockout');
  return {
    repoRoot,
    baseDir,
    campaignsDir,
    charactersDir,
    itemsDir,
    enemiesDir,
    spellsDir,
    abilitiesDir,
    eventsDir,
    mapsDir,
    scenesDir,
    blockoutsDir,
    portraitsDir,
    iconsDir,
    mapsAssetsDir,
    backgroundsDir,
    modelsDir,
    tokensDir,
    spritesDir,
    blockoutPackageDir,
  };
}

function ensureWorkspaceDirs(paths) {
  [
    paths.campaignsDir,
    paths.charactersDir,
    paths.itemsDir,
    paths.enemiesDir,
    paths.spellsDir,
    paths.abilitiesDir,
    paths.eventsDir,
    paths.mapsDir,
    paths.scenesDir,
    paths.blockoutsDir,
    paths.portraitsDir,
    paths.iconsDir,
    paths.mapsAssetsDir,
    paths.backgroundsDir,
    paths.modelsDir,
    paths.tokensDir,
    paths.spritesDir,
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

// Helper to seed initial enemy entities if enemiesDir is empty
function ensureSeedEnemies(enemiesDir) {
  try {
    if (!fs.existsSync(enemiesDir)) {
      fs.mkdirSync(enemiesDir, { recursive: true });
    }
    const existing = fs.readdirSync(enemiesDir).filter(f => f.endsWith('.jsonld'));
    if (existing.length > 0) return;

    const seedEnemies = [
      {
        slug: 'corrupted-hound',
        name: 'Corrupted Shadow Hound',
        creatureType: 'beast',
        challengeRating: '1/4',
        armorClass: 12,
        hitPoints: 11,
        speed: 40,
        alignment: 'Neutral Evil',
        abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
        attacks: [
          { name: 'Bite', attackBonus: 4, damage: '1d6+2', damageType: 'piercing', range: 5 }
        ],
        portrait: '🐺',
        spriteAssetRef: 'flare:creature:wolf',
        behavior: 'aggressive',
        xpReward: 50,
        goldDrop: 0,
        isBoss: false,
        description: 'Savage shadow wolf warped by abyssal miasma, hunting in coordinated packs.'
      },
      {
        slug: 'feral-guard-skirmisher',
        name: 'Feral Guard Skirmisher',
        creatureType: 'undead',
        challengeRating: '1/2',
        armorClass: 14,
        hitPoints: 16,
        speed: 30,
        alignment: 'Lawful Evil',
        abilities: { str: 14, dex: 12, con: 14, int: 8, wis: 10, cha: 8 },
        attacks: [
          { name: 'Spear Thrust', attackBonus: 4, damage: '1d6+2', damageType: 'piercing', range: 5 }
        ],
        portrait: '💀',
        spriteAssetRef: 'flare:creature:skeleton',
        behavior: 'defensive',
        xpReward: 100,
        goldDrop: 8,
        isBoss: false,
        description: 'Fallen garrison guards resurrected by necromantic curse, wielding rusty spears.'
      },
      {
        slug: 'skeleton-archer',
        name: 'Skeleton Marksman',
        creatureType: 'undead',
        challengeRating: '1/4',
        armorClass: 13,
        hitPoints: 13,
        speed: 30,
        alignment: 'Lawful Evil',
        abilities: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
        attacks: [
          { name: 'Shortbow', attackBonus: 4, damage: '1d6+2', damageType: 'piercing', range: 80 }
        ],
        portrait: '🏹',
        spriteAssetRef: 'flare:creature:skeleton',
        behavior: 'ranged_kiter',
        xpReward: 50,
        goldDrop: 5,
        isBoss: false,
        description: 'Skeletal sharpshooter guarding dungeon parapets.'
      },
      {
        slug: 'goblin-raider',
        name: 'Goblin Raider',
        creatureType: 'humanoid',
        challengeRating: '1/4',
        armorClass: 15,
        hitPoints: 7,
        speed: 30,
        alignment: 'Neutral Evil',
        abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        attacks: [
          { name: 'Scimitar', attackBonus: 4, damage: '1d6+2', damageType: 'slashing', range: 5 }
        ],
        portrait: '👺',
        spriteAssetRef: 'flare:creature:goblin',
        behavior: 'flanker',
        xpReward: 50,
        goldDrop: 12,
        isBoss: false,
        description: 'Cunning mountain ambusher armed with a notched scimitar.'
      },
      {
        slug: 'minotaur-marauder',
        name: 'Minotaur Marauder',
        creatureType: 'monstrosity',
        challengeRating: '3',
        armorClass: 14,
        hitPoints: 76,
        speed: 40,
        alignment: 'Chaotic Evil',
        abilities: { str: 18, dex: 11, con: 16, int: 6, wis: 16, cha: 9 },
        attacks: [
          { name: 'Greataxe', attackBonus: 6, damage: '2d12+4', damageType: 'slashing', range: 5 },
          { name: 'Gore / Horns', attackBonus: 6, damage: '2d8+4', damageType: 'piercing', range: 5 }
        ],
        portrait: '🧌',
        spriteAssetRef: 'flare:creature:minotaur',
        behavior: 'aggressive',
        xpReward: 700,
        goldDrop: 50,
        isBoss: false,
        description: 'Towering beast of the subterranean maze who charges trespassers.'
      },
      {
        slug: 'captain-malakor-boss',
        name: 'Dark Lord Malakor (Boss)',
        creatureType: 'fiend',
        challengeRating: '5',
        armorClass: 16,
        hitPoints: 85,
        speed: 30,
        alignment: 'Chaotic Evil',
        abilities: { str: 16, dex: 14, con: 16, int: 16, wis: 14, cha: 18 },
        attacks: [
          { name: 'Shadow Scythe', attackBonus: 7, damage: '2d8+3', damageType: 'slashing', range: 5 },
          { name: 'Necrotic Blast', attackBonus: 6, damage: '3d6', damageType: 'necrotic', range: 60 }
        ],
        portrait: '😈',
        spriteAssetRef: 'flare:creature:minotaur',
        behavior: 'boss_phase',
        xpReward: 1800,
        goldDrop: 250,
        isBoss: true,
        description: 'Dread sorcerer-warlord threatening the kingdom with abyssal dark magic.'
      },
      {
        slug: 'red-dragon-wyrm',
        name: 'Red Dragonlord (Boss)',
        creatureType: 'dragon',
        challengeRating: '10',
        armorClass: 18,
        hitPoints: 178,
        speed: 40,
        alignment: 'Chaotic Evil',
        abilities: { str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 17 },
        attacks: [
          { name: 'Bite', attackBonus: 10, damage: '2d10+6', damageType: 'piercing', range: 10 },
          { name: 'Fire Breath', attackBonus: 9, damage: '8d6', damageType: 'fire', range: 30 }
        ],
        portrait: '🐉',
        spriteAssetRef: 'flare:creature:dragon',
        behavior: 'boss_phase',
        xpReward: 5900,
        goldDrop: 1200,
        isBoss: true,
        description: 'Ancient wyrm that hoards stolen artifacts of light within deep cavern vaults.'
      }
    ];

    for (const enemy of seedEnemies) {
      const slug = enemy.slug;
      const jsonld = {
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
          oslc_am: 'http://open-services.net/ns/am#'
        },
        '@id': `urn:robos:crpg:monster:${slug}`,
        '@type': [
          'robos:CRPGMonster',
          'oslc_am:Resource',
          'schema:Person'
        ],
        'dcterms:title': enemy.name,
        'schema:name': enemy.name,
        'robos:slug': slug,
        slug: slug,
        'robos:challengeRating': enemy.challengeRating,
        challengeRating: enemy.challengeRating,
        'robos:creatureType': enemy.creatureType,
        creatureType: enemy.creatureType,
        'robos:armorClass': enemy.armorClass,
        armorClass: enemy.armorClass,
        'robos:hitPoints': enemy.hitPoints,
        hitPoints: enemy.hitPoints,
        'robos:speed': enemy.speed,
        speed: enemy.speed,
        'robos:alignment': enemy.alignment,
        alignment: enemy.alignment,
        'robos:abilities': enemy.abilities,
        abilities: enemy.abilities,
        'robos:attacks': enemy.attacks,
        attacks: enemy.attacks,
        'robos:isBoss': enemy.isBoss,
        isBoss: enemy.isBoss,
        'robos:portrait': enemy.portrait,
        portrait: enemy.portrait,
        'robos:spriteAssetRef': enemy.spriteAssetRef,
        spriteAssetRef: enemy.spriteAssetRef,
        'robos:xpReward': enemy.xpReward,
        xpReward: enemy.xpReward,
        'robos:goldDrop': enemy.goldDrop,
        goldDrop: enemy.goldDrop,
        'robos:behavior': enemy.behavior,
        behavior: enemy.behavior,
        'dcterms:description': enemy.description,
        description: enemy.description,
      };
      fs.writeFileSync(path.join(enemiesDir, `${slug}.jsonld`), JSON.stringify(jsonld, null, 2) + '\n', 'utf8');
    }
  } catch (err) {
    console.warn('Could not seed default enemies:', err.message);
  }
}

// IPC Handler Registrations
function setupIpcHandlers() {
  const paths = getPaths();
  ensureWorkspaceDirs(paths);
  ensureSeedCharacters(paths.charactersDir);
  ensureSeedEnemies(paths.enemiesDir);

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

      const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
      const formatted = {
        ...existing,
        ...data,
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
          xsd: 'http://www.w3.org/2001/XMLSchema#',
          ...(existing['@context'] || {}),
          ...(data['@context'] || {}),
        },
        '@id': `urn:robos:crpg:campaign:${safeSlug}`,
        '@type': ['robos:CRPGCampaign', 'schema:CreativeWork'],
        'dcterms:title': data.title || data['dcterms:title'] || existing['dcterms:title'] || safeSlug,
        'dcterms:description': data.description !== undefined ? data.description : (data['dcterms:description'] !== undefined ? data['dcterms:description'] : (existing['dcterms:description'] || '')),
        'robos:setting': data.setting !== undefined ? data.setting : (data['robos:setting'] !== undefined ? data['robos:setting'] : (existing['robos:setting'] || '')),
        'robos:ruleSet': data.ruleSet || data['robos:ruleSet'] || existing['robos:ruleSet'] || 'D&D 5e SRD',
        'robos:difficulty': data.difficulty || data['robos:difficulty'] || existing['robos:difficulty'] || 'Core Rules',
        'robos:startingMap': data.startingMap || data['robos:startingMap'] || data.currentScene || existing['robos:startingMap'] || '',
        'robos:maps': Array.isArray(data.maps) ? data.maps : (Array.isArray(data['robos:maps']) ? data['robos:maps'] : (existing['robos:maps'] || [])),
        'robos:characters': Array.isArray(data.characters) ? data.characters : (Array.isArray(data['robos:characters']) ? data['robos:characters'] : (existing['robos:characters'] || [])),
        'robos:heroes': data.heroes || data['robos:heroes'] || existing['robos:heroes'] || [],
        'robos:gameState': data.gameState || data['robos:gameState'] || existing['robos:gameState'] || {
          'robos:currentScene': data.startingMap || '',
          'robos:activeParty': [],
          'robos:partyLeaderIndex': 0,
          'robos:partyFormation': 'rank',
          'robos:sharedInventory': { gold: 0, silver: 0, copper: 0, items: [] },
          'robos:questLog': [],
          'robos:worldFlags': {},
        },
        'robos:storyFlow': data['robos:storyFlow'] || data.storyFlow || existing['robos:storyFlow'] || undefined,
        'robos:startingSpawn': data['robos:startingSpawn'] || data.startingSpawn || existing['robos:startingSpawn'] || undefined,
        'robos:mapConnections': data['robos:mapConnections'] || data.mapConnections || existing['robos:mapConnections'] || undefined,
        'robos:scenes': data.scenes || data['robos:scenes'] || existing['robos:scenes'] || [],
      };
      if (!formatted['robos:storyFlow']) delete formatted['robos:storyFlow'];
      if (!formatted['robos:startingSpawn']) delete formatted['robos:startingSpawn'];
      if (!formatted['robos:mapConnections']) delete formatted['robos:mapConnections'];

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

  // 1c. Render Campaign as Real cRPG Game (Godot 4 Engine)
  ipcMain.handle('campaigns:render-as-game', async (_event, { slug, data, headless = false }) => {
    try {
      if (!slug) throw new Error('Campaign slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.campaignsDir, `${safeSlug}.jsonld`);

      // 1. Ensure current campaign state is written to disk
      if (data) {
        const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
        const formatted = {
          ...existing,
          ...data,
          '@context': {
            robos: 'https://robos.dev/ns/sdlc#',
            dcterms: 'http://purl.org/dc/terms/',
            schema: 'https://schema.org/',
            xsd: 'http://www.w3.org/2001/XMLSchema#',
            ...(existing['@context'] || {}),
            ...(data['@context'] || {}),
          },
          '@id': `urn:robos:crpg:campaign:${safeSlug}`,
          '@type': ['robos:CRPGCampaign', 'schema:CreativeWork'],
          'dcterms:title': data.title || data['dcterms:title'] || existing['dcterms:title'] || safeSlug,
          'robos:startingMap': data.startingMap || data['robos:startingMap'] || data.currentScene || existing['robos:startingMap'] || '',
          'robos:heroes': data.heroes || data['robos:heroes'] || existing['robos:heroes'] || [],
          'robos:gameState': data.gameState || data['robos:gameState'] || existing['robos:gameState'] || {},
          'robos:storyFlow': data['robos:storyFlow'] || data.storyFlow || existing['robos:storyFlow'] || undefined,
          'robos:startingSpawn': data['robos:startingSpawn'] || data.startingSpawn || existing['robos:startingSpawn'] || undefined,
          'robos:mapConnections': data['robos:mapConnections'] || data.mapConnections || existing['robos:mapConnections'] || undefined,
        };
        fs.writeFileSync(filePath, JSON.stringify(formatted, null, 2) + '\n', 'utf8');
      }

      // 2. Also write active campaign JSON descriptor into data/v1/active_campaign.json
      const dataV1Dir = path.join(paths.baseDir, 'data/v1');
      if (!fs.existsSync(dataV1Dir)) {
        fs.mkdirSync(dataV1Dir, { recursive: true });
      }
      const activeCampPath = path.join(dataV1Dir, 'active_campaign.json');
      const activeData = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : (data || {});
      fs.writeFileSync(activeCampPath, JSON.stringify(activeData, null, 2) + '\n', 'utf8');

      const gameEngineDir = path.join(paths.repoRoot, 'games/crpg-realm');

      // 2b. Auto-bundle Player Cartridge for instant Godot 4 engine execution
      try {
        const { CartridgeBundler } = require('../crpg-builder/lib/cartridge-bundler');
        const bundler = new CartridgeBundler(paths.baseDir);
        const cartridge = bundler.bundle(safeSlug);
        const targetDirs = [path.join(paths.baseDir, 'cartridges'), path.join(gameEngineDir, 'cartridges')];
        for (const cDir of targetDirs) {
          if (!fs.existsSync(cDir)) fs.mkdirSync(cDir, { recursive: true });
          const cartOut = path.join(cDir, `${safeSlug}.cartridge.json`);
          fs.writeFileSync(cartOut, JSON.stringify(cartridge, null, 2) + '\n', 'utf8');
          console.log(`[campaign:render-as-game] Bundled Player Cartridge at: ${cartOut}`);
        }
      } catch (bundErr) {
        console.warn(`[campaign:render-as-game] Note on bundling cartridge:`, bundErr.message);
      }

      // 3. Find Godot executable
      const candidateBins = [
        process.env.GODOT_BIN,
        path.join(process.env.HOME || '', '.local/bin/godot4'),
        path.join(process.env.HOME || '', 'apps/godot4'),
        '/usr/bin/godot4',
        '/usr/local/bin/godot4',
        '/usr/bin/godot',
      ].filter(Boolean);

      let godotBin = null;
      for (const bin of candidateBins) {
        if (fs.existsSync(bin)) {
          godotBin = bin;
          break;
        }
      }

      if (!godotBin) {
        const playScript = path.join(gameEngineDir, 'play.sh');
        if (fs.existsSync(playScript)) {
          godotBin = playScript;
        } else {
          throw new Error('Godot 4 binary not found. Please install Godot 4 or set GODOT_BIN.');
        }
      }

      // 4. Launch Godot process in Real cRPG mode with Player Cartridge
      const spawnArgs = ['--path', `"${gameEngineDir}"`, '--cartridge', `"${safeSlug}"`];
      if (headless) {
        spawnArgs.unshift('--headless');
      }

      const display = process.env.DISPLAY || ':0';
      const childEnv = {
        ...process.env,
        DISPLAY: display,
        CRPG_CAMPAIGN: safeSlug,
        CRPG_CARTRIDGE: safeSlug,
        CRPG_MODE: 'real',
      };

      const launchCmd = `"${godotBin}" ${spawnArgs.join(' ')}`;
      console.log(`[campaign:render-as-game] Launching: ${launchCmd} on DISPLAY=${display}`);

      const child = exec(launchCmd, {
        cwd: gameEngineDir,
        env: childEnv,
      });

      console.log(`[campaign:render-as-game] Launched Real Game (PID: ${child.pid}) for '${safeSlug}'`);

      return {
        success: true,
        pid: child.pid,
        campaign: safeSlug,
        title: activeData['dcterms:title'] || safeSlug,
        startingMap: activeData['robos:startingMap'] || '',
        mode: 'real',
        display,
      };
    } catch (err) {
      console.error('[campaign:render-as-game] Error:', err);
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
      return { success: true, slug, filePath, data, item: data };
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

  // 5b. Enemies / Monsters Bestiary API
  ipcMain.handle('enemies:list', async () => {
    try {
      if (!fs.existsSync(paths.enemiesDir)) {
        fs.mkdirSync(paths.enemiesDir, { recursive: true });
      }
      const files = fs.readdirSync(paths.enemiesDir).filter(f => f.endsWith('.jsonld'));
      const enemies = [];

      for (const file of files) {
        const slug = file.replace(/\.jsonld$/, '');
        const fullPath = path.join(paths.enemiesDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw);
          const name = data['dcterms:title'] || data['schema:name'] || data.name || data.title || slug;
          const cr = data['robos:challengeRating'] || data.challengeRating || data.cr || '1/4';
          const creatureType = data['robos:creatureType'] || data.creatureType || data.type || 'beast';
          const ac = Number(data['robos:armorClass'] ?? data.armorClass ?? data.ac ?? 10);
          const hp = Number(data['robos:hitPoints'] ?? data.hitPoints ?? data.hp ?? 10);
          const speed = Number(data['robos:speed'] ?? data.speed ?? 30);
          const abilities = data['robos:abilities'] || data.abilities || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
          const attacks = Array.isArray(data['robos:attacks']) ? data['robos:attacks'] : (Array.isArray(data.attacks) ? data.attacks : []);
          const isBoss = Boolean(data['robos:isBoss'] ?? data.isBoss ?? data.boss ?? false);
          const portrait = data['robos:portrait'] || data.portrait || (isBoss ? '😈' : '👹');
          const spriteAssetRef = data['robos:spriteAssetRef'] || data.spriteAssetRef || '';
          const alignment = data['robos:alignment'] || data.alignment || 'Neutral Evil';
          const behavior = data['robos:behavior'] || data.behavior || 'aggressive';
          const xpReward = Number(data['robos:xpReward'] ?? data.xpReward ?? 50);
          const goldDrop = Number(data['robos:goldDrop'] ?? data.goldDrop ?? 0);
          const description = data['dcterms:description'] || data.description || '';

          enemies.push({
            slug,
            fileName: file,
            path: fullPath,
            id: data['@id'] || `urn:robos:crpg:monster:${slug}`,
            name,
            title: name,
            challengeRating: cr,
            cr,
            creatureType,
            type: creatureType,
            armorClass: ac,
            ac,
            hitPoints: hp,
            hp,
            speed,
            abilities,
            attacks,
            isBoss,
            boss: isBoss,
            portrait,
            icon: portrait,
            spriteAssetRef,
            alignment,
            behavior,
            xpReward,
            goldDrop,
            description,
            raw: data,
          });
        } catch (e) {
          enemies.push({ slug, fileName: file, path: fullPath, name: slug, error: e.message });
        }
      }
      return { success: true, enemies };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('enemies:load', async (_event, slug) => {
    try {
      const filePath = path.join(paths.enemiesDir, `${slug}.jsonld`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Enemy file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      return { success: true, slug, filePath, data, enemy: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('enemies:save', async (_event, { slug, data }) => {
    try {
      if (!slug) throw new Error('Enemy slug is required');
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const filePath = path.join(paths.enemiesDir, `${safeSlug}.jsonld`);

      const name = data.name || data['dcterms:title'] || safeSlug;
      const cr = data.challengeRating || data.cr || data['robos:challengeRating'] || '1/4';
      const creatureType = data.creatureType || data.type || data['robos:creatureType'] || 'beast';
      const ac = Number(data.armorClass ?? data.ac ?? data['robos:armorClass'] ?? 10);
      const hp = Number(data.hitPoints ?? data.hp ?? data['robos:hitPoints'] ?? 10);
      const speed = Number(data.speed ?? data['robos:speed'] ?? 30);
      const abilities = data.abilities || data['robos:abilities'] || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      const attacks = Array.isArray(data.attacks) ? data.attacks : (Array.isArray(data['robos:attacks']) ? data['robos:attacks'] : []);
      const isBoss = Boolean(data.isBoss ?? data.boss ?? data['robos:isBoss'] ?? false);
      const portrait = data.portrait || data.icon || data['robos:portrait'] || (isBoss ? '😈' : '👹');
      const spriteAssetRef = data.spriteAssetRef || data['robos:spriteAssetRef'] || '';
      const alignment = data.alignment || data['robos:alignment'] || 'Neutral Evil';
      const behavior = data.behavior || data['robos:behavior'] || 'aggressive';
      const xpReward = Number(data.xpReward ?? data['robos:xpReward'] ?? 50);
      const goldDrop = Number(data.goldDrop ?? data['robos:goldDrop'] ?? 0);
      const description = data.description || data['dcterms:description'] || '';

      const formatted = {
        '@context': {
          robos: 'https://robos.dev/ns/sdlc#',
          dcterms: 'http://purl.org/dc/terms/',
          schema: 'https://schema.org/',
          oslc_am: 'http://open-services.net/ns/am#'
        },
        '@id': data['@id'] || `urn:robos:crpg:monster:${safeSlug}`,
        '@type': [
          'robos:CRPGMonster',
          'oslc_am:Resource',
          'schema:Person'
        ],
        'dcterms:title': name,
        'schema:name': name,
        'robos:slug': safeSlug,
        slug: safeSlug,
        'robos:challengeRating': cr,
        challengeRating: cr,
        'robos:creatureType': creatureType,
        creatureType,
        'robos:armorClass': ac,
        armorClass: ac,
        'robos:hitPoints': hp,
        hitPoints: hp,
        'robos:speed': speed,
        speed,
        'robos:alignment': alignment,
        alignment,
        'robos:abilities': abilities,
        abilities,
        'robos:attacks': attacks,
        attacks,
        'robos:isBoss': isBoss,
        isBoss,
        'robos:portrait': portrait,
        portrait,
        'robos:spriteAssetRef': spriteAssetRef,
        spriteAssetRef,
        'robos:xpReward': xpReward,
        xpReward,
        'robos:goldDrop': goldDrop,
        goldDrop,
        'robos:behavior': behavior,
        behavior,
        'dcterms:description': description,
        description,
      };

      if (!fs.existsSync(paths.enemiesDir)) {
        fs.mkdirSync(paths.enemiesDir, { recursive: true });
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

  ipcMain.handle('enemies:delete', async (_event, slug) => {
    try {
      const filePath = path.join(paths.enemiesDir, `${slug}.jsonld`);
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

  // 9. Visual Assets & 3D Models API
  function scanAssetDirectory(dir, category, subCategory = '') {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const results = [];
    for (const ent of entries) {
      if (ent.name.endsWith('.import')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        results.push(...scanAssetDirectory(full, category, ent.name));
      } else {
        const ext = path.extname(ent.name).toLowerCase();
        const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext);
        const isModel = ['.glb', '.gltf'].includes(ext);
        if (isImage || isModel) {
          const rel = path.relative(paths.baseDir, full);
          const stat = fs.statSync(full);
          const cleanName = ent.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
          results.push({
            id: rel,
            fileName: ent.name,
            name: cleanName,
            category,
            subCategory: subCategory || category,
            relativePath: rel,
            webPath: `../../../games/crpg-realm/${rel}`,
            fullPath: full,
            extension: ext,
            fileType: isModel ? 'model' : 'image',
            size: stat.size,
            mtime: stat.mtimeMs,
          });
        }
      }
    }
    return results;
  }

  ipcMain.handle('assets:list', async (_event, filter = {}) => {
    try {
      const category = filter.category || 'all';
      let assets = [];

      if (category === 'all' || category === 'portraits') {
        assets.push(...scanAssetDirectory(paths.portraitsDir, 'portraits'));
      }
      if (category === 'all' || category === 'tokens') {
        assets.push(...scanAssetDirectory(paths.tokensDir, 'tokens'));
      }
      if (category === 'all' || category === 'items') {
        assets.push(...scanAssetDirectory(paths.iconsDir, 'items'));
      }
      if (category === 'all' || category === 'spells') {
        const spellsDir = path.join(paths.iconsDir, 'spells');
        const statusDir = path.join(paths.iconsDir, 'status_effects');
        assets.push(...scanAssetDirectory(spellsDir, 'spells', 'spells'));
        assets.push(...scanAssetDirectory(statusDir, 'spells', 'status_effects'));
      }
      if (category === 'all' || category === 'maps') {
        assets.push(...scanAssetDirectory(paths.mapsAssetsDir, 'maps', 'maps'));
        assets.push(...scanAssetDirectory(paths.backgroundsDir, 'maps', 'backgrounds'));
        assets.push(...scanAssetDirectory(paths.blockoutsDir, 'maps', 'blockouts'));
      }
      if (category === 'all' || category === 'models') {
        assets.push(...scanAssetDirectory(paths.modelsDir, 'models'));
      }
      if (category === 'all' || category === 'sprites') {
        assets.push(...scanAssetDirectory(paths.spritesDir, 'sprites'));
      }

      // Sort alphabetically by name
      assets.sort((a, b) => a.name.localeCompare(b.name));

      return {
        success: true,
        assets,
        counts: {
          all: assets.length,
          portraits: assets.filter(a => a.category === 'portraits').length,
          tokens: assets.filter(a => a.category === 'tokens').length,
          items: assets.filter(a => a.category === 'items').length,
          spells: assets.filter(a => a.category === 'spells').length,
          maps: assets.filter(a => a.category === 'maps').length,
          models: assets.filter(a => a.category === 'models').length,
          sprites: assets.filter(a => a.category === 'sprites').length,
        }
      };
    } catch (err) {
      return { success: false, error: err.message, assets: [] };
    }
  });

  ipcMain.handle('assets:import', async (_event, payload = {}) => {
    try {
      const category = payload.category || 'portraits';
      let destDir = paths.portraitsDir;
      if (category === 'tokens') destDir = paths.tokensDir;
      else if (category === 'items') destDir = path.join(paths.iconsDir, payload.subCategory || 'weapons');
      else if (category === 'spells') destDir = path.join(paths.iconsDir, 'spells');
      else if (category === 'maps') destDir = paths.mapsAssetsDir;
      else if (category === 'models') destDir = paths.modelsDir;

      let sourcePath = payload.sourcePath;
      if (!sourcePath) {
        const dialogRes = await dialog.showOpenDialog(mainWindow, {
          title: 'Select Image or 3D Model',
          properties: ['openFile'],
          filters: [
            { name: 'All Visual Assets', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'glb', 'gltf'] },
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] },
            { name: '3D Models', extensions: ['glb', 'gltf'] },
          ],
        });
        if (dialogRes.canceled || !dialogRes.filePaths.length) {
          return { success: false, canceled: true };
        }
        sourcePath = dialogRes.filePaths[0];
      }

      const fileName = payload.fileName || path.basename(sourcePath);
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const targetPath = path.join(destDir, safeFileName);

      fs.copyFileSync(sourcePath, targetPath);
      const rel = path.relative(paths.baseDir, targetPath);

      return {
        success: true,
        fileName: safeFileName,
        relativePath: rel,
        webPath: `../../../games/crpg-realm/${rel}`,
        fullPath: targetPath,
        category,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('assets:generate-token', async (_event, payload = {}) => {
    try {
      const { portraitRelativePath, tokenName, ringColor = 'gold' } = payload;
      if (!portraitRelativePath) {
        return { success: false, error: 'Missing portraitRelativePath' };
      }
      const absSrc = path.join(paths.baseDir, portraitRelativePath);
      if (!fs.existsSync(absSrc)) {
        return { success: false, error: `Source portrait not found: ${absSrc}` };
      }
      const slug = (tokenName || path.basename(portraitRelativePath, path.extname(portraitRelativePath)))
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');
      const tokenFileName = `token_${slug}.png`;
      if (!fs.existsSync(paths.tokensDir)) {
        fs.mkdirSync(paths.tokensDir, { recursive: true });
      }
      const absDst = path.join(paths.tokensDir, tokenFileName);
      const generatorScript = path.join(paths.repoRoot, 'packages/crpg-builder/lib/token_generator.py');

      const cmd = `python3 "${generatorScript}" --src "${absSrc}" --dst "${absDst}" --ring "${ringColor}" --size 256`;
      await execPromise(cmd);

      const rel = path.relative(paths.baseDir, absDst);
      return {
        success: true,
        fileName: tokenFileName,
        relativePath: rel,
        webPath: `../../../games/crpg-realm/${rel}`,
        ringColor,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
