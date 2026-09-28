/**
 * RobOS cRPG Cartridge Bundler
 * Compiles and packages self-contained Player Cartridges (.cartridge.json)
 * from campaign manifests, battle maps, characters, items, and quests.
 */

const fs = require('fs');
const path = require('path');

class CartridgeBundler {
  constructor(baseDir = null) {
    this.baseDir = baseDir || path.resolve(__dirname, '../../../games/crpg-realm');
  }

  _cleanSlug(urnOrSlug) {
    if (!urnOrSlug) return '';
    const parts = String(urnOrSlug).split(':');
    return parts[parts.length - 1].replace(/\.jsonld$/, '').replace(/\.json$/, '');
  }

  _readJsonSafe(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (err) {
      console.warn(`[CartridgeBundler] Warning reading ${filePath}:`, err.message);
    }
    return null;
  }

  bundle(campaignSlug) {
    const cleanCampSlug = this._cleanSlug(campaignSlug);
    const campPath = path.join(this.baseDir, 'campaigns', `${cleanCampSlug}.jsonld`);
    let campaign = this._readJsonSafe(campPath);
    if (!campaign) {
      const altPath = path.join(this.baseDir, 'campaigns', `${cleanCampSlug}.json`);
      campaign = this._readJsonSafe(altPath);
    }

    if (!campaign) {
      throw new Error(`Campaign '${campaignSlug}' not found at ${campPath}`);
    }

    const title = campaign['dcterms:title'] || campaign.title || campaign.name || cleanCampSlug;
    const desc = campaign['dcterms:description'] || campaign.description || campaign['robos:description'] || '';
    const setting = campaign['robos:setting'] || 'Fantasy Realm';
    const ruleset = campaign['robos:ruleSet'] || campaign['robos:ruleset'] || 'D&D 5e SRD';
    const difficulty = campaign['robos:difficulty'] || 'Normal';
    const startingMap = campaign['robos:startingMap'] || campaign.startingMap || 'throne-room';
    
    let startingSpawn = { x: 25, y: 20 };
    if (campaign['robos:startingSpawn'] && campaign['robos:startingSpawn'].position) {
      startingSpawn = {
        x: campaign['robos:startingSpawn'].position[0],
        y: campaign['robos:startingSpawn'].position[1]
      };
    } else if (campaign['robos:startingPosition']) {
      startingSpawn = campaign['robos:startingPosition'];
    }

    // 1. Bundle Maps
    const maps = {};
    const mapRefs = campaign['robos:maps'] || [];
    for (const ref of mapRefs) {
      const mapSlug = this._cleanSlug(ref);
      const mapPath = path.join(this.baseDir, 'maps', `${mapSlug}.jsonld`);
      let mapData = this._readJsonSafe(mapPath);
      if (!mapData) {
        mapData = this._readJsonSafe(path.join(this.baseDir, 'maps', `${mapSlug}.json`));
      }
      if (mapData) {
        maps[mapSlug] = mapData;
      }
    }

    // If starting map wasn't in robos:maps, ensure it's loaded
    if (!maps[startingMap]) {
      const mapPath = path.join(this.baseDir, 'maps', `${startingMap}.jsonld`);
      const mapData = this._readJsonSafe(mapPath);
      if (mapData) maps[startingMap] = mapData;
    }

    // Also include any maps from mapConnections
    const connections = campaign['robos:mapConnections'] || [];
    for (const conn of connections) {
      for (const mKey of ['fromMap', 'toMap']) {
        const mSlug = conn[mKey];
        if (mSlug && !maps[mSlug]) {
          const mData = this._readJsonSafe(path.join(this.baseDir, 'maps', `${mSlug}.jsonld`));
          if (mData) maps[mSlug] = mData;
        }
      }
    }

    // 2. Bundle Characters
    const characters = {};
    const charRefs = campaign['robos:characters'] || [];
    for (const ref of charRefs) {
      const charSlug = this._cleanSlug(ref);
      const charPath = path.join(this.baseDir, 'characters', `${charSlug}.jsonld`);
      let charData = this._readJsonSafe(charPath);
      if (!charData) {
        charData = this._readJsonSafe(path.join(this.baseDir, 'characters', `${charSlug}.json`));
      }
      if (charData) {
        characters[charSlug] = charData;
      }
    }

    // Also inspect activeParty in gameState
    const activeParty = campaign['robos:gameState']?.['robos:activeParty'] || [];
    for (const ref of activeParty) {
      const charSlug = this._cleanSlug(ref);
      if (charSlug && !characters[charSlug]) {
        const charPath = path.join(this.baseDir, 'characters', `${charSlug}.jsonld`);
        const charData = this._readJsonSafe(charPath) || this._readJsonSafe(path.join(this.baseDir, 'characters', `${charSlug}.json`));
        if (charData) characters[charSlug] = charData;
      }
    }

    // Also inspect heroes array
    const heroes = campaign['robos:heroes'] || campaign.heroes || [];
    for (const hero of heroes) {
      const heroSlug = hero.slug || this._cleanSlug(hero.id);
      if (heroSlug && !characters[heroSlug]) {
        characters[heroSlug] = hero;
      }
    }

    // 3. Bundle Items
    const items = {};
    // Collect item references from heroes equipped gear and known items directory
    const checkItemRef = (ref) => {
      if (!ref) return;
      const itSlug = this._cleanSlug(ref);
      if (itSlug && !items[itSlug]) {
        const itPath = path.join(this.baseDir, 'items', `${itSlug}.jsonld`);
        let itData = this._readJsonSafe(itPath);
        if (!itData) {
          itData = this._readJsonSafe(path.join(this.baseDir, 'items', `${itSlug}.json`));
        }
        if (itData) items[itSlug] = itData;
      }
    };

    for (const hero of heroes) {
      if (hero.equipped) {
        Object.values(hero.equipped).forEach(checkItemRef);
      }
      if (hero.inventory) {
        hero.inventory.forEach(checkItemRef);
      }
    }

    // Also scan items directory for any campaign items (like heros-sword)
    const itemsDir = path.join(this.baseDir, 'items');
    if (fs.existsSync(itemsDir)) {
      const files = fs.readdirSync(itemsDir);
      for (const file of files) {
        if (file.endsWith('.jsonld') || file.endsWith('.json')) {
          const itSlug = file.replace(/\.jsonld$/, '').replace(/\.json$/, '');
          if (!items[itSlug]) {
            const itData = this._readJsonSafe(path.join(itemsDir, file));
            if (itData) items[itSlug] = itData;
          }
        }
      }
    }

    // 3b. Bundle Enemies / Monsters
    const enemies = {};
    const enemiesDir = path.join(this.baseDir, 'enemies');
    if (fs.existsSync(enemiesDir)) {
      const files = fs.readdirSync(enemiesDir);
      for (const file of files) {
        if (file.endsWith('.jsonld') || file.endsWith('.json')) {
          const eSlug = file.replace(/\.jsonld$/, '').replace(/\.json$/, '');
          if (!enemies[eSlug]) {
            const eData = this._readJsonSafe(path.join(enemiesDir, file));
            if (eData) enemies[eSlug] = eData;
          }
        }
      }
    }

    // Also include any monsters defined in characters directory with robos:CRPGMonster
    for (const [cSlug, cData] of Object.entries(characters)) {
      const types = Array.isArray(cData['@type']) ? cData['@type'] : [cData['@type']];
      if (types.includes('robos:CRPGMonster') || cData.characterType === 'boss' || cData.characterType === 'creature') {
        if (!enemies[cSlug]) {
          enemies[cSlug] = cData;
        }
      }
    }

    // 4. Bundle Quests
    let quests = [];
    if (campaign['robos:gameState'] && Array.isArray(campaign['robos:gameState']['robos:questLog'])) {
      quests = campaign['robos:gameState']['robos:questLog'];
    } else if (Array.isArray(campaign.quests)) {
      quests = campaign.quests;
    }

    // 5. Story DAG
    const storyDAG = campaign['robos:storyFlow'] || campaign.storyDAG || {};

    // 6. Cover Styling & Badge
    let coverColor = '#1e3a8a'; // Deep royal blue
    let icon = '📼';
    if (cleanCampSlug.includes('princess') || cleanCampSlug.includes('rescue')) {
      coverColor = '#7c2d12'; // Amber/Crimson royal
      icon = '👑';
    } else if (cleanCampSlug.includes('dragonwarrior')) {
      coverColor = '#065f46'; // Dragon emerald
      icon = '🐉';
    } else if (cleanCampSlug.includes('candlekeep')) {
      coverColor = '#431407'; // Scholar parchment / wood
      icon = '📜';
    }

    const cartridge = {
      crpgCartridgeVersion: '1.0.0',
      cartridgeId: cleanCampSlug,
      header: {
        title,
        slug: cleanCampSlug,
        author: 'RobOS AI Studio',
        genre: 'Tactical cRPG',
        ruleset,
        difficulty,
        setting,
        description: desc,
        coverColor,
        icon,
        mapCount: Object.keys(maps).length,
        characterCount: Object.keys(characters).length,
        itemCount: Object.keys(items).length,
        enemyCount: Object.keys(enemies).length,
        questCount: quests.length,
        startingMap,
        startingPosition: startingSpawn,
        partyLimit: campaign['robos:partyLimit'] || 1,
        createdDate: new Date().toISOString()
      },
      campaign,
      maps,
      characters,
      items,
      enemies,
      quests,
      storyDAG
    };

    return cartridge;
  }

  saveCartridge(campaignSlug, outPath = null) {
    const cartridge = this.bundle(campaignSlug);
    const targetPath = outPath || path.join(this.baseDir, 'cartridges', `${cartridge.cartridgeId}.cartridge.json`);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(cartridge, null, 2), 'utf8');
    return { targetPath, cartridge };
  }

  listCampaigns() {
    const campDir = path.join(this.baseDir, 'campaigns');
    if (!fs.existsSync(campDir)) return [];
    return fs.readdirSync(campDir)
      .filter(f => f.endsWith('.jsonld') || f.endsWith('.json'))
      .map(f => f.replace(/\.jsonld$/, '').replace(/\.json$/, ''));
  }

  listCartridges() {
    const cartDir = path.join(this.baseDir, 'cartridges');
    if (!fs.existsSync(cartDir)) return [];
    return fs.readdirSync(cartDir)
      .filter(f => f.endsWith('.cartridge.json') || f.endsWith('.crpgcart'))
      .map(f => {
        const fullPath = path.join(cartDir, f);
        try {
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          return {
            file: f,
            path: fullPath,
            header: data.header || {}
          };
        } catch {
          return { file: f, path: fullPath, header: { title: f } };
        }
      });
  }
}

module.exports = { CartridgeBundler };
