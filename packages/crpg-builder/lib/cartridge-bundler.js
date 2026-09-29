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

  _resolvePrettyBackground(mapSlug, mapData) {
    if (!mapData) return null;
    let bg = mapData['robos:backgroundImage'] || mapData.backgroundImage || '';
    if (!bg || bg.includes('blockouts')) {
      const s = mapSlug.toLowerCase();
      if (s.includes('tantegel') || s.includes('throne')) {
        bg = 'res://assets/backgrounds/tantegel_throne_room.png';
      } else if (s.includes('charlock') || s.includes('catacomb') || s.includes('antechamber') || s.includes('corridor') || s.includes('crypt') || s.includes('cavern') || s.includes('lair')) {
        bg = 'res://assets/backgrounds/ancient_catacombs_2560.png';
      } else if (s.includes('forest') || s.includes('wilderness') || s.includes('candlekeep')) {
        bg = 'res://assets/backgrounds/forest_wilderness_2560.png';
      } else if (s.includes('village') || s.includes('town') || s.includes('square') || s.includes('castle') || s.includes('homestead') || s.includes('overworld')) {
        bg = 'res://assets/backgrounds/village_open_world_2560.png';
      } else if (s.includes('garrison')) {
        bg = 'res://assets/backgrounds/garrison_dungeon_2560.png';
      }
    }
    if (bg) {
      mapData['robos:backgroundImage'] = bg;
    }
    return mapData;
  }

  _resolveCharacter3DModel(slug, charData, isEnemy = false) {
    if (!charData) return charData;
    const s = (slug || '').toLowerCase();
    const name = String(charData['dcterms:title'] || charData.name || s).toLowerCase();
    const ctype = String(charData['robos:characterType'] || charData.characterType || '').toLowerCase();
    const isBoss = isEnemy || ctype === 'boss' || ctype === 'enemy' || s.includes('boss') || s.includes('dragonlord') || s.includes('malakor');

    let modelRef = charData['robos:modelAssetRef'] || charData.modelAssetRef || '';
    let modelType = charData['robos:modelType'] || charData.modelType || '';
    const hasExplicitScale = charData['robos:modelScale'] !== undefined || charData.modelScale !== undefined;
    let modelScale = charData['robos:modelScale'] ?? charData.modelScale ?? 1.0;
    let modelTint = charData['robos:modelTint'] || charData.modelTint || '#ffffff';
    let animStance = charData['robos:animationStance'] || charData.animationStance || 'tabletop_hop';
    let renderMode = charData['robos:renderMode'] || charData.renderMode || '3d_model';

    // Auto-resolve archetype 3D models if not explicitly set to a .glb
    if (!modelRef || !modelRef.includes('.glb')) {
      if (s.includes('dragonlord') || s.includes('dragon') || name.includes('dragonlord') || s.includes('malakor')) {
        modelRef = 'res://assets/models/monster_dragon_pawn.glb';
        modelType = modelType || 'dragon';
        if (!hasExplicitScale) modelScale = 1.45;
      } else if (s.includes('king') || s.includes('lorik') || s.includes('loric') || s.includes('alden') || name.includes('king')) {
        modelRef = 'res://assets/models/character_king_pawn.glb';
        modelType = modelType || 'king';
        if (!hasExplicitScale) modelScale = 1.05;
      } else if (s.includes('princess') || s.includes('gwaelin') || s.includes('jennifer') || name.includes('princess')) {
        modelRef = 'res://assets/models/character_princess_pawn.glb';
        modelType = modelType || 'princess';
        if (!hasExplicitScale) modelScale = 0.95;
      } else if (s.includes('goblin') || name.includes('goblin') || s.includes('skulker')) {
        modelRef = 'res://assets/models/monster_goblin_pawn.glb';
        modelType = modelType || 'goblin';
        if (!hasExplicitScale) modelScale = 0.9;
      } else if (s.includes('skeleton') || name.includes('skeleton') || s.includes('undead')) {
        modelRef = 'res://assets/models/monster_skeleton_pawn.glb';
        modelType = modelType || 'skeleton';
        if (!hasExplicitScale) modelScale = 1.0;
      } else if (s.includes('minotaur') || name.includes('minotaur') || s.includes('marauder')) {
        modelRef = 'res://assets/models/monster_minotaur_pawn.glb';
        modelType = modelType || 'minotaur';
        if (!hasExplicitScale) modelScale = 1.35;
      } else if (s.includes('hound') || name.includes('hound') || s.includes('wolf')) {
        modelRef = 'res://assets/models/monster_hound_pawn.glb';
        modelType = modelType || 'hound';
        if (!hasExplicitScale) modelScale = 1.0;
      } else if (s.includes('skirmisher') || name.includes('skirmisher') || s.includes('guard')) {
        modelRef = 'res://assets/models/monster_skirmisher_pawn.glb';
        modelType = modelType || 'skirmisher';
        if (!hasExplicitScale) modelScale = 1.05;
      } else if (s.includes('wizard') || s.includes('mage') || s.includes('sorcerer') || s.includes('ignis') || s.includes('elora')) {
        modelRef = 'res://assets/models/character_wizard_pawn.glb';
        modelType = modelType || 'wizard';
      } else if (s.includes('rogue') || s.includes('thief') || s.includes('assassin') || s.includes('imoen')) {
        modelRef = 'res://assets/models/character_rogue_pawn.glb';
        modelType = modelType || 'rogue';
      } else {
        modelRef = 'res://assets/models/character_knight_pawn.glb';
        modelType = modelType || 'knight';
      }
    }

    charData['robos:renderMode'] = renderMode;
    charData.renderMode = renderMode;
    charData['robos:modelAssetRef'] = modelRef;
    charData.modelAssetRef = modelRef;
    charData['robos:modelType'] = modelType;
    charData.modelType = modelType;
    charData['robos:modelScale'] = Number(modelScale);
    charData.modelScale = Number(modelScale);
    charData['robos:modelTint'] = modelTint;
    charData.modelTint = modelTint;
    charData['robos:animationStance'] = animStance;
    charData.animationStance = animStance;

    return charData;
  }

  _resolveItem3DModel(slug, itemData) {
    if (!itemData) return itemData;
    const s = (slug || '').toLowerCase();
    const title = String(itemData['dcterms:title'] || itemData.name || s).toLowerCase();
    const cat = String(itemData['robos:itemCategory'] || itemData.itemCategory || itemData.category || '').toLowerCase();
    const slot = String(itemData['robos:equipSlot'] || itemData.equipSlot || '').toLowerCase();

    let modelRef = itemData['robos:modelAssetRef'] || itemData.modelAssetRef || itemData.model3dAsset || '';
    let socket = itemData['robos:modelSocket'] || itemData.modelSocket || itemData.model3dSocket || slot || 'main_hand';
    let scale = itemData['robos:modelScale'] ?? itemData.modelScale ?? itemData.model3dScale ?? 1.0;
    let tint = itemData['robos:modelTint'] || itemData.modelTint || itemData.model3dTint || '';

    if (!modelRef || !modelRef.includes('.glb')) {
      if (s.includes('hero') || title.includes('hero') || title.includes('excalibur')) {
        modelRef = 'res://assets/models/weapon_sword_hero.glb';
        socket = 'main_hand';
      } else if (s.includes('copper-sword') || s.includes('iron-sword') || title.includes('sword') || title.includes('blade')) {
        modelRef = 'res://assets/models/weapon_sword_iron.glb';
        socket = 'main_hand';
      } else if (s.includes('club') || title.includes('club') || title.includes('cudgel')) {
        modelRef = 'res://assets/models/weapon_club_wood.glb';
        socket = 'main_hand';
      } else if (s.includes('staff') || title.includes('staff') || title.includes('wand')) {
        modelRef = 'res://assets/models/weapon_staff_wizard.glb';
        socket = 'main_hand';
      } else if (s.includes('bow') || title.includes('bow')) {
        modelRef = 'res://assets/models/weapon_bow_recurve.glb';
        socket = 'main_hand';
      } else if (s.includes('dagger') || title.includes('dagger') || title.includes('knife')) {
        modelRef = 'res://assets/models/weapon_dagger_rogue.glb';
        socket = 'main_hand';
      } else if (s.includes('bamboo') || title.includes('bamboo') || title.includes('pole')) {
        modelRef = 'res://assets/models/weapon_bamboo_pole.glb';
        socket = 'main_hand';
      } else if (s.includes('round-shield') || title.includes('round shield')) {
        modelRef = 'res://assets/models/armor_shield_round.glb';
        socket = 'off_hand';
      } else if (s.includes('shield') || title.includes('shield')) {
        modelRef = 'res://assets/models/armor_shield_heater.glb';
        socket = 'off_hand';
      } else if (s.includes('helm') || title.includes('helm') || title.includes('helmet')) {
        modelRef = 'res://assets/models/armor_helm_knight.glb';
        socket = 'head';
      } else if (s.includes('plate') || title.includes('plate')) {
        modelRef = 'res://assets/models/armor_suit_plate.glb';
        socket = 'armor';
      } else if (s.includes('leather') || title.includes('leather')) {
        modelRef = 'res://assets/models/armor_suit_leather.glb';
        socket = 'armor';
      }
    }

    if (modelRef) {
      itemData['robos:modelAssetRef'] = modelRef;
      itemData.modelAssetRef = modelRef;
      itemData.model3dAsset = modelRef;
      itemData['robos:modelSocket'] = socket;
      itemData.modelSocket = socket;
      itemData.model3dSocket = socket;
      itemData['robos:modelScale'] = Number(scale);
      itemData.modelScale = Number(scale);
      itemData.model3dScale = Number(scale);
      if (tint) {
        itemData['robos:modelTint'] = tint;
        itemData.modelTint = tint;
        itemData.model3dTint = tint;
      }
    }
    return itemData;
  }

  _resolveSpell3DModel(slug, spellData) {
    if (!spellData) return spellData;
    const s = (slug || '').toLowerCase();
    const title = String(spellData['dcterms:title'] || spellData.name || s).toLowerCase();

    let modelRef = spellData['robos:modelAssetRef'] || spellData.modelAssetRef || spellData.model3dAsset || '';
    let vfxType = spellData['robos:vfxType'] || spellData.vfxType || spellData.model3dVfxType || 'projectile';
    let scale = spellData['robos:modelScale'] ?? spellData.modelScale ?? spellData.model3dScale ?? 1.0;
    let tint = spellData['robos:modelTint'] || spellData.modelTint || spellData.model3dTint || '';

    if (!modelRef || !modelRef.includes('.glb')) {
      if (s.includes('fireball') || s.includes('fire-bolt') || s.includes('burning-hands') || title.includes('fire')) {
        modelRef = 'res://assets/models/spell_fireball_projectile.glb';
        vfxType = 'projectile';
      } else if (s.includes('magic-missile') || title.includes('magic missile') || s.includes('dispel') || s.includes('counterspell')) {
        modelRef = 'res://assets/models/spell_magic_missile_orb.glb';
        vfxType = 'projectile';
      } else if (s.includes('cure-wounds') || s.includes('healing') || s.includes('bless') || s.includes('sanctuary') || title.includes('heal')) {
        modelRef = 'res://assets/models/spell_healing_glyph.glb';
        vfxType = 'aura';
      } else if (s.includes('lightning') || s.includes('thunderwave') || title.includes('lightning')) {
        modelRef = 'res://assets/models/spell_lightning_spark.glb';
        vfxType = 'projectile';
      } else if (s.includes('frost') || s.includes('blizzard') || s.includes('ray-of-frost') || title.includes('frost')) {
        modelRef = 'res://assets/models/spell_frost_shard.glb';
        vfxType = 'projectile';
      } else if (s.includes('stinking-cloud') || s.includes('cloud') || s.includes('poison') || s.includes('sleep')) {
        modelRef = 'res://assets/models/spell_stinking_cloud_ring.glb';
        vfxType = 'aura';
      } else {
        modelRef = 'res://assets/models/spell_magic_missile_orb.glb';
        vfxType = 'projectile';
      }
    }

    spellData['robos:modelAssetRef'] = modelRef;
    spellData.modelAssetRef = modelRef;
    spellData.model3dAsset = modelRef;
    spellData['robos:vfxType'] = vfxType;
    spellData.vfxType = vfxType;
    spellData.model3dVfxType = vfxType;
    spellData['robos:modelScale'] = Number(scale);
    spellData.modelScale = Number(scale);
    spellData.model3dScale = Number(scale);
    if (tint) {
      spellData['robos:modelTint'] = tint;
      spellData.modelTint = tint;
      spellData.model3dTint = tint;
    }
    return spellData;
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
        maps[mapSlug] = this._resolvePrettyBackground(mapSlug, mapData);
      }
    }

    // If starting map wasn't in robos:maps, ensure it's loaded
    if (!maps[startingMap]) {
      const mapPath = path.join(this.baseDir, 'maps', `${startingMap}.jsonld`);
      const mapData = this._readJsonSafe(mapPath);
      if (mapData) maps[startingMap] = this._resolvePrettyBackground(startingMap, mapData);
    }

    // Also include any maps from mapConnections
    const connections = campaign['robos:mapConnections'] || [];
    for (const conn of connections) {
      for (const mKey of ['fromMap', 'toMap']) {
        const mSlug = conn[mKey];
        if (mSlug && !maps[mSlug]) {
          const mData = this._readJsonSafe(path.join(this.baseDir, 'maps', `${mSlug}.jsonld`));
          if (mData) maps[mSlug] = this._resolvePrettyBackground(mSlug, mData);
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
        characters[charSlug] = this._resolveCharacter3DModel(charSlug, charData, false);
      }
    }

    // Also inspect activeParty in gameState
    const activeParty = campaign['robos:gameState']?.['robos:activeParty'] || [];
    for (const ref of activeParty) {
      const charSlug = this._cleanSlug(ref);
      if (charSlug && !characters[charSlug]) {
        const charPath = path.join(this.baseDir, 'characters', `${charSlug}.jsonld`);
        const charData = this._readJsonSafe(charPath) || this._readJsonSafe(path.join(this.baseDir, 'characters', `${charSlug}.json`));
        if (charData) characters[charSlug] = this._resolveCharacter3DModel(charSlug, charData, false);
      }
    }

    // Also inspect heroes array
    const heroes = campaign['robos:heroes'] || campaign.heroes || [];
    for (let i = 0; i < heroes.length; i++) {
      const hero = heroes[i];
      const heroSlug = hero.slug || this._cleanSlug(hero.id);
      heroes[i] = this._resolveCharacter3DModel(heroSlug, hero, false);
      if (heroSlug && !characters[heroSlug]) {
        characters[heroSlug] = heroes[i];
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
            if (eData) enemies[eSlug] = this._resolveCharacter3DModel(eSlug, eData, true);
          }
        }
      }
    }

    // Also include any monsters defined in characters directory with robos:CRPGMonster
    for (const [cSlug, cData] of Object.entries(characters)) {
      const types = Array.isArray(cData['@type']) ? cData['@type'] : [cData['@type']];
      if (types.includes('robos:CRPGMonster') || cData.characterType === 'boss' || cData.characterType === 'creature') {
        if (!enemies[cSlug]) {
          enemies[cSlug] = this._resolveCharacter3DModel(cSlug, cData, true);
        }
      }
    }

    // 3c. Bundle Spells & Spell 3D Models
    const spells = {};
    const spellsDir = path.join(this.baseDir, 'spells');
    if (fs.existsSync(spellsDir)) {
      const files = fs.readdirSync(spellsDir);
      for (const file of files) {
        if (file.endsWith('.jsonld') || file.endsWith('.json')) {
          const spSlug = file.replace(/\.jsonld$/, '').replace(/\.json$/, '');
          if (!spells[spSlug]) {
            const spData = this._readJsonSafe(path.join(spellsDir, file));
            if (spData) spells[spSlug] = this._resolveSpell3DModel(spSlug, spData);
          }
        }
      }
    }

    // Process all items with 3D model metadata
    for (const [itKey, itVal] of Object.entries(items)) {
      items[itKey] = this._resolveItem3DModel(itKey, itVal);
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
        spellCount: Object.keys(spells).length,
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
      spells,
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
