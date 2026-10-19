'use strict';

/**
 * RobOS Gaming Knowledge Graph Ontology & W3C SHACL Shapes
 * Universal vocabulary and shape definitions for video games, cRPGs, and tabletop RPGs.
 */

const NS_GAME = 'https://robos.dev/ns/game#';
const NS_CRPG = 'https://robos.dev/ns/crpg#';
const NS_TABLETOP = 'https://robos.dev/ns/tabletop#';
const NS_SDLC = 'https://robos.dev/ns/sdlc#';

const GAMING_SHACL_SHAPES = [
  {
    shapeId: 'urn:robos:shape:GameShape',
    targetClass: 'robos:Game',
    refersFrom: 'https://schema.org/Game',
    domainStandard: 'https://schema.org/Game',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Game must declare a title.' },
      { path: 'robos:ruleset', minCount: 1, message: 'Game must declare an underlying ruleset (e.g. dnd5e, heroquest, d20).' },
      { path: 'robos:gameType', minCount: 1, message: 'Game must declare gameType (e.g. crpg, tabletop, action, roguelike).' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameCharacterShape',
    targetClass: 'robos:GameCharacter',
    refersFrom: 'https://schema.org/Person',
    domainStandard: 'https://schema.org/Person',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Character must have a name/title.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameClassShape',
    targetClass: 'robos:GameClass',
    refersFrom: 'https://schema.org/Role',
    domainStandard: 'https://schema.org/Role',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Game class must have a title (e.g. Barbarian, Fighter, Wizard).' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameMonsterShape',
    targetClass: 'robos:GameMonster',
    refersFrom: 'https://schema.org/Person',
    domainStandard: 'https://robos.dev/ns/game#Monster',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Monster must have a name.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameItemShape',
    targetClass: 'robos:GameItem',
    refersFrom: 'https://schema.org/Product',
    domainStandard: 'https://robos.dev/ns/game#Item',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Item must have a name.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameSpellShape',
    targetClass: 'robos:GameSpell',
    refersFrom: 'https://schema.org/Action',
    domainStandard: 'https://robos.dev/ns/game#Spell',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Spell must have a name.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:GameMapShape',
    targetClass: 'robos:GameMap',
    refersFrom: 'https://schema.org/Place',
    domainStandard: 'https://schema.org/Place',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Map must have a title.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopGameShape',
    targetClass: 'robos:TabletopGame',
    refersFrom: 'https://schema.org/Game',
    domainStandard: 'https://robos.dev/ns/tabletop#Game',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Tabletop game must declare a title.' },
      { path: 'robos:ruleset', minCount: 1, message: 'Tabletop game must declare a ruleset (e.g. heroquest).' },
      { path: 'robos:gridDimensions', minCount: 1, message: 'Tabletop game must declare grid dimensions [width, height].' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopHeroShape',
    targetClass: 'robos:TabletopHero',
    refersFrom: 'https://schema.org/Person',
    domainStandard: 'https://robos.dev/ns/tabletop#Hero',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Tabletop hero must have a name.' },
      { path: 'robos:bodyPoints', minCount: 1, message: 'Tabletop hero must declare Body Points (HP).' },
      { path: 'robos:mindPoints', minCount: 1, message: 'Tabletop hero must declare Mind Points (MP).' },
      { path: 'robos:attackDice', minCount: 1, message: 'Tabletop hero must declare initial attack dice count.' },
      { path: 'robos:defendDice', minCount: 1, message: 'Tabletop hero must declare initial defend dice count.' },
      { path: 'robos:audioLines', minCount: 0, message: 'Tabletop hero may declare situational audio voice lines (turnStart, attacking, attacked, defended, castingMagic).' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopMonsterShape',
    targetClass: 'robos:TabletopMonster',
    refersFrom: 'https://schema.org/Person',
    domainStandard: 'https://robos.dev/ns/tabletop#Monster',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Tabletop monster must have a name.' },
      { path: 'robos:bodyPoints', minCount: 1, message: 'Tabletop monster must declare Body Points.' },
      { path: 'robos:attackDice', minCount: 1, message: 'Tabletop monster must declare attack dice.' },
      { path: 'robos:defendDice', minCount: 1, message: 'Tabletop monster must declare defend dice.' },
      { path: 'robos:movementSquares', minCount: 1, message: 'Tabletop monster must declare movement speed in squares.' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopQuestMapShape',
    targetClass: 'robos:TabletopQuestMap',
    refersFrom: 'https://schema.org/Place',
    domainStandard: 'https://robos.dev/ns/tabletop#QuestMap',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Quest map must declare a title.' },
      { path: 'robos:startingSpawn', minCount: 1, message: 'Quest map must declare starting stair/spawn coordinate [x, y].' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopMapConfigurationShape',
    targetClass: 'robos:TabletopMapConfiguration',
    refersFrom: 'https://schema.org/Place',
    domainStandard: 'https://robos.dev/ns/tabletop#MapConfiguration',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Tabletop map configuration must declare a title.' },
      { path: 'robos:gridDimensions', minCount: 1, message: 'Tabletop map configuration must declare grid dimensions [width, height].' }
    ]
  },
  {
    shapeId: 'urn:robos:shape:TabletopQuestSaveStateShape',
    targetClass: 'robos:TabletopQuestSaveState',
    refersFrom: 'https://schema.org/Action',
    domainStandard: 'https://robos.dev/ns/tabletop#QuestSaveState',
    properties: [
      { path: 'dcterms:title', minCount: 1, message: 'Quest save state must declare a title/label.' },
      { path: 'robos:questSlug', minCount: 1, message: 'Quest save state must declare its quest cartridge slug.' },
      { path: 'robos:currentRound', minCount: 1, message: 'Quest save state must declare currentRound.' },
      { path: 'robos:currentPhase', minCount: 1, message: 'Quest save state must declare currentPhase.' },
      { path: 'robos:activeTurnActor', minCount: 1, message: 'Quest save state must declare whose turn it is (activeTurnActor).' },
      { path: 'robos:playTimeSeconds', minCount: 1, message: 'Quest save state must declare playTimeSeconds.' },
      { path: 'robos:heroStates', minCount: 1, message: 'Quest save state must include party heroStates with health and inventory.' }
    ]
  }
];

/**
 * Schema-driven property definitions for `robos:TabletopQuestSaveState`.
 * Used by Tabletop Studio UI and KGraph synchronizer so telemetry cards and fields
 * are driven by the Knowledge Graph schema rather than hardcoded UI logic.
 */
const TABLETOP_SAVE_STATE_SCHEMA = {
  targetClass: 'robos:TabletopQuestSaveState',
  shapeId: 'urn:robos:shape:TabletopQuestSaveStateShape',
  telemetryMetrics: [
    {
      property: 'robos:currentRound',
      label: 'Current Round',
      icon: '⏳',
      category: 'turn',
      format: 'round'
    },
    {
      property: 'robos:activeTurnActor',
      label: "Whose Turn",
      icon: '🎯',
      category: 'turn',
      format: 'actor'
    },
    {
      property: 'robos:turnState',
      label: 'Turn Action State',
      icon: '🎲',
      category: 'turn',
      format: 'turn_state'
    },
    {
      property: 'robos:playTimeSeconds',
      label: 'Time Played',
      icon: '⏱️',
      category: 'session',
      format: 'duration'
    },
    {
      property: 'robos:visibleMonstersCount',
      label: 'Monsters Visible',
      icon: '👁️',
      category: 'combat',
      format: 'visible_monsters'
    },
    {
      property: 'robos:itemsFoundCount',
      label: 'Items Found So Far',
      icon: '🎒',
      category: 'loot',
      format: 'items_found'
    },
    {
      property: 'robos:totalPartyGold',
      label: 'Party Gold',
      icon: '🪙',
      category: 'loot',
      format: 'gold'
    },
    {
      property: 'robos:exploredTilesCount',
      label: 'Dungeon Explored',
      icon: '🗺️',
      category: 'exploration',
      format: 'exploration'
    },
    {
      property: 'robos:doorsOpenCount',
      label: 'Doors Opened',
      icon: '🚪',
      category: 'exploration',
      format: 'doors'
    },
    {
      property: 'robos:triggersFiredCount',
      label: 'Story Events Fired',
      icon: '📜',
      category: 'narrative',
      format: 'triggers'
    }
  ],
  collections: [
    {
      property: 'robos:heroStates',
      label: 'Party Health & Vitals',
      icon: '🛡️',
      itemType: 'robos:TabletopSaveHeroState'
    },
    {
      property: 'robos:visibleMonsters',
      label: 'Monsters Visible to Party',
      icon: '👹',
      itemType: 'robos:TabletopSaveMonsterState'
    },
    {
      property: 'robos:itemsFound',
      label: 'Items & Treasure Found So Far',
      icon: '💎',
      itemType: 'robos:GameItem'
    }
  ]
};

function formatDurationSeconds(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${remSec}s`;
  if (mins > 0) return `${mins}m ${remSec}s`;
  return `${remSec}s`;
}

/**
 * Normalizes a raw Godot autosave JSON or Studio save payload into a canonical
 * `robos:TabletopQuestSaveState` JSON-LD Knowledge Graph node.
 */
function normalizeQuestSaveStateToKGraphNode(rawSave, options = {}) {
  if (!rawSave || typeof rawSave !== 'object') return null;

  const slug = String(
    options.slug ||
    rawSave['robos:questSlug'] ||
    rawSave.cartridge_slug ||
    rawSave.cartridge_id ||
    rawSave.map_id ||
    'custom-quest'
  ).replace(/\.cartridge(\.json)?$/, '');

  const rawHeroes = Array.isArray(rawSave['robos:heroStates'])
    ? rawSave['robos:heroStates']
    : (Array.isArray(rawSave.heroes) ? rawSave.heroes : []);
  if (rawHeroes.length === 0) return null;

  const roundNum = Number(rawSave['robos:currentRound'] ?? rawSave.current_round ?? rawSave.round_num ?? 1) || 1;
  const rawPhase = String(rawSave['robos:currentPhase'] ?? rawSave.current_phase ?? rawSave.phase ?? 'hero_phase');
  const currentRole = String(rawSave['robos:currentRole'] ?? rawSave.current_role ?? 'player');
  const activeHeroIdx = Number(rawSave['robos:activeHeroIndex'] ?? rawSave.active_hero_idx ?? 0) || 0;
  const turnStateRaw = String(rawSave['robos:turnState'] ?? rawSave.turn_state ?? 'awaiting_roll');
  const moveRemaining = Number(rawSave['robos:movementRemaining'] ?? rawSave.movement_remaining ?? 0) || 0;
  const moveRolled = Boolean(rawSave['robos:movementRolled'] ?? rawSave.movement_rolled ?? false);
  const hasMoved = Boolean(rawSave['robos:hasMovedThisTurn'] ?? rawSave.has_moved_this_turn ?? false);
  const hasActed = Boolean(rawSave['robos:hasActedThisTurn'] ?? rawSave.has_acted_this_turn ?? false);

  // Normalize Heroes
  const heroStates = rawHeroes.map((h, idx) => {
    const heroId = String(h.id || h.slug || `hero-${idx + 1}`).toLowerCase();
    const heroClass = String(h.heroClass || h.hero_class || h.class || h.name || 'Hero');
    const charName = String(h.characterName || h.character_name || '').trim();
    const displayName = charName ? `${charName} (${heroClass})` : String(h.name || heroClass);
    const maxBp = Number(h.max_bp ?? h.max_hp ?? h.bodyPoints ?? h.bp ?? 8) || 8;
    const curBp = Number(h.current_bp ?? h.bp ?? h.hp ?? maxBp);
    const maxMp = Number(h.max_mp ?? h.mindPoints ?? h.mp ?? 2) || 2;
    const curMp = Number(h.current_mp ?? h.mp ?? maxMp);
    const atk = Number(h.attackDice ?? h.atk ?? 3) || 3;
    const def = Number(h.defendDice ?? h.def ?? 2) || 2;
    const gold = Number(h.gold ?? 0) || 0;
    const pos = Array.isArray(h.grid_pos) && h.grid_pos.length >= 2
      ? [Number(h.grid_pos[0]), Number(h.grid_pos[1])]
      : (Array.isArray(h.pos) && h.pos.length >= 2
        ? [Number(h.pos[0]), Number(h.pos[1])]
        : (Array.isArray(h.position) && h.position.length >= 2 ? [Number(h.position[0]), Number(h.position[1])] : [7, 14]));
    const weapon = String(h.equipped_weapon || h.weapon || 'unarmed');
    const armor = Array.isArray(h.equipped_armor)
      ? (h.equipped_armor.length > 0 ? h.equipped_armor.join(', ') : 'none')
      : String(h.armor || 'none');
    const inventory = Array.isArray(h.inventory) ? h.inventory : [];
    const spells = Array.isArray(h.spells) ? h.spells : [];
    const usedSpells = Array.isArray(h.used_spells) ? h.used_spells : (Array.isArray(h.cast_spells) ? h.cast_spells : []);
    const isActiveTurn = (rawPhase === 'hero_phase' || rawPhase === 'PLAYER_TURN') && idx === activeHeroIdx;

    return {
      '@type': 'robos:TabletopSaveHeroState',
      id: heroId,
      name: displayName,
      heroClass,
      currentBP: curBp,
      maxBP: maxBp,
      currentMP: curMp,
      maxMP: maxMp,
      attackDice: atk,
      defendDice: def,
      gold,
      gridPos: pos,
      weapon,
      armor,
      inventory,
      spells,
      usedSpells,
      spellsRemaining: Math.max(0, spells.length - usedSpells.length),
      hasDepartedStart: Boolean(h.has_departed_start ?? true),
      isOnBoard: Boolean(h.is_on_board ?? true),
      alive: curBp > 0 && h.alive !== false,
      escaped: Boolean(h.escaped ?? false),
      isActiveTurn
    };
  });

  // Determine whose turn it is
  let activeTurnActor = String(rawSave['robos:activeTurnActor'] || '');
  if (!activeTurnActor) {
    const upperPhase = rawPhase.toUpperCase();
    if (rawPhase === 'hero_phase' || upperPhase === 'PLAYER_TURN' || upperPhase === 'HERO_TURN') {
      const actHero = heroStates[activeHeroIdx] || heroStates[0];
      activeTurnActor = actHero
        ? `${actHero.name} (Hero ${activeHeroIdx + 1} of ${heroStates.length})`
        : 'Hero Party';
    } else {
      activeTurnActor = 'Zargon / Dread Master (Enemy Turn)';
    }
  }

  // Normalize Exploration Set first so only seen/discovered entities are exposed (Zero Spoilers)
  const rawExploredTiles = Array.isArray(rawSave.explored_tiles) ? rawSave.explored_tiles : [];
  const exploredTiles = rawExploredTiles.map(pt => {
    if (Array.isArray(pt) && pt.length >= 2) return [Number(pt[0]), Number(pt[1])];
    if (typeof pt === 'string' && pt.includes(',')) {
      const parts = pt.split(',');
      return [Number(parts[0]), Number(parts[1])];
    }
    return null;
  }).filter(Boolean);
  const exploredSet = new Set(exploredTiles.map(pt => `${pt[0]},${pt[1]}`));
  heroStates.forEach(h => {
    if (Array.isArray(h.gridPos) && h.gridPos.length >= 2) {
      exploredSet.add(`${h.gridPos[0]},${h.gridPos[1]}`);
    }
  });
  const exploredTilesCount = Number(rawSave['robos:exploredTilesCount'] ?? exploredSet.size) || 0;

  const revealedRooms = Array.isArray(rawSave['robos:revealedRooms'])
    ? rawSave['robos:revealedRooms']
    : (Array.isArray(rawSave.revealed_rooms)
      ? rawSave.revealed_rooms
      : (rawSave.revealed_rooms && typeof rawSave.revealed_rooms === 'object' ? Object.keys(rawSave.revealed_rooms) : []));
  const revealedSet = new Set(revealedRooms.map(String));

  // Normalize Monsters: ONLY expose visible/discovered monsters and already-defeated count (never unseen monsters!)
  const rawMonsters = Array.isArray(rawSave.monsters) ? rawSave.monsters : [];
  const discoveredRaw = rawSave.discovered_monster_ids;
  const discoveredSet = new Set(
    Array.isArray(discoveredRaw)
      ? discoveredRaw.map(String)
      : (discoveredRaw && typeof discoveredRaw === 'object' ? Object.keys(discoveredRaw).filter(k => discoveredRaw[k]) : [])
  );

  let monstersDefeated = Number(rawSave['robos:monstersDefeated'] ?? rawSave.monsters_defeated ?? 0) || 0;
  const visibleMonsters = [];

  rawMonsters.forEach(m => {
    const mId = String(m.id || m.slug || 'monster');
    const maxBp = Number(m.max_bp ?? m.bodyPoints ?? m.bp ?? 1) || 1;
    const curBp = Number(m.current_bp ?? m.bp ?? maxBp);
    const isAlive = m.is_alive !== false && m.dead !== true && curBp > 0;
    const isHidden = Boolean(m.hidden);
    const roomId = String(m.roomId || m.room_id || '');
    const pos = Array.isArray(m.grid_pos) && m.grid_pos.length >= 2
      ? [Number(m.grid_pos[0]), Number(m.grid_pos[1])]
      : (Array.isArray(m.pos) && m.pos.length >= 2
        ? [Number(m.pos[0]), Number(m.pos[1])]
        : (Array.isArray(m.position) && m.position.length >= 2 ? [Number(m.position[0]), Number(m.position[1])] : [0, 0]));
    const isDiscovered = discoveredSet.has(mId) || exploredSet.has(`${pos[0]},${pos[1]}`) || (roomId !== '' && revealedSet.has(roomId) && !isHidden);

    if (!isAlive) {
      monstersDefeated += 1;
      return;
    }
    if (!isDiscovered) {
      // Never include unseen monsters in the save state view (no spoilers)
      return;
    }

    visibleMonsters.push({
      '@type': 'robos:TabletopSaveMonsterState',
      id: mId,
      name: String(m.name || m.monsterType || m.type || 'Monster'),
      monsterType: String(m.monsterType || m.type || 'goblin'),
      currentBP: curBp,
      maxBP: maxBp,
      mindPoints: Number(m.mindPoints ?? m.mp ?? 1),
      attackDice: Number(m.attackDice ?? m.atk ?? 2),
      defendDice: Number(m.defendDice ?? m.def ?? 2),
      movementSquares: Number(m.movementSquares ?? m.move ?? 6),
      gridPos: pos,
      roomId,
      isBoss: Boolean(m.isBoss ?? m.is_boss),
      isUndead: Boolean(m.isUndead ?? m.is_undead),
      isSpellcaster: Boolean(m.isSpellcaster ?? m.is_spellcaster),
      spells: Array.isArray(m.spells) ? m.spells : [],
      isAlive: true,
      isVisible: true
    });
  });

  // If rawSave already had robos:visibleMonsters and rawMonsters was empty
  if (visibleMonsters.length === 0 && Array.isArray(rawSave['robos:visibleMonsters'])) {
    visibleMonsters.push(...rawSave['robos:visibleMonsters']);
  }

  // Normalize Items Found So Far (only items actually collected or in party inventory — zero uncollected treasure spoilers)
  const itemsFound = [];
  const seenItemKeys = new Set();
  const pushFoundItem = (itemObj) => {
    const key = `${itemObj.holder || 'party'}:${itemObj.id || itemObj.name}:${itemsFound.length}`;
    if (!seenItemKeys.has(key)) {
      seenItemKeys.add(key);
      itemsFound.push(itemObj);
    }
  };

  if (Array.isArray(rawSave.items_found)) {
    rawSave.items_found.forEach(it => {
      if (it && typeof it === 'object') {
        pushFoundItem({
          id: String(it.id || it.item || it.name || 'item'),
          name: String(it.name || it.title || it.item || 'Treasure'),
          type: String(it.type || 'treasure'),
          holder: String(it.holder || it.hero || 'Party'),
          source: String(it.source || 'Dungeon Search'),
          icon: String(it.icon || '💎')
        });
      }
    });
  }

  if (Array.isArray(rawSave.treasure_discard)) {
    rawSave.treasure_discard.forEach(td => {
      if (td && typeof td === 'object' && td.type !== 'wandering_monster' && td.type !== 'hazard') {
        pushFoundItem({
          id: String(td.id || td.item || td.title || 'treasure'),
          name: String(td.title || td.name || 'Treasure Card'),
          type: String(td.type || 'treasure'),
          holder: 'Treasure Deck Draw',
          source: 'Room Search',
          icon: String(td.icon || '💰'),
          gold: Number(td.gold || 0)
        });
      }
    });
  }

  // Also include hero inventory items (potions, weapons, artifacts carried)
  heroStates.forEach(h => {
    (h.inventory || []).forEach((invItem, iIdx) => {
      const itemName = typeof invItem === 'string'
        ? invItem.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : String(invItem?.name || invItem?.id || 'Item');
      const itemType = typeof invItem === 'object' && invItem?.type
        ? String(invItem.type)
        : (itemName.toLowerCase().includes('potion') || itemName.toLowerCase().includes('water') ? 'potion' : 'equipment');
      const icon = itemType === 'potion' ? '🧪' : (itemType === 'relic' ? '✨' : '🗡️');
      pushFoundItem({
        id: typeof invItem === 'object' ? String(invItem.id || `inv-${h.id}-${iIdx}`) : `${h.id}-${invItem}-${iIdx}`,
        name: itemName,
        type: itemType,
        holder: h.name,
        source: 'Hero Inventory',
        icon
      });
    });
  });

  // Searched Rooms, Seen Doors, Seen Furniture, Detected Traps & Fired Triggers (Zero Unseen Spoilers)
  const searchedRoomsObj = (rawSave.searched_rooms && typeof rawSave.searched_rooms === 'object') ? rawSave.searched_rooms : {};
  const searchedSecretRoomsObj = (rawSave.searched_secret_rooms && typeof rawSave.searched_secret_rooms === 'object') ? rawSave.searched_secret_rooms : {};
  const searchedRoomsList = Array.from(new Set([
    ...(Array.isArray(rawSave.searched_treasure_rooms) ? rawSave.searched_treasure_rooms : []),
    ...Object.keys(searchedRoomsObj).filter(k => searchedRoomsObj[k]),
    ...Object.keys(searchedSecretRoomsObj).filter(k => searchedSecretRoomsObj[k])
  ]));

  const rawDoors = Array.isArray(rawSave.doors) ? rawSave.doors : [];
  const seenDoors = rawDoors.filter(d => {
    if (!d) return false;
    if (d.is_secret && !d.is_revealed) return false;
    const isOpen = d.is_open === true || d.open === true || d.state === 'open';
    if (isOpen) return true;
    const from = Array.isArray(d.from) ? `${d.from[0]},${d.from[1]}` : '';
    const to = Array.isArray(d.to) ? `${d.to[0]},${d.to[1]}` : '';
    return exploredSet.has(from) || exploredSet.has(to);
  });
  const doorsOpenCount = rawDoors.filter(d => d && (d.is_open === true || d.open === true || d.state === 'open')).length;
  const doorsSecretRevealed = rawDoors.filter(d => d && d.is_secret && d.is_revealed).length;

  const rawFurniture = Array.isArray(rawSave.furniture) ? rawSave.furniture : [];
  const seenFurniture = rawFurniture.filter(f => {
    if (!f || f.hidden) return false;
    if (f.type && String(f.type).includes('stairs')) return true;
    const rId = String(f.roomId || f.room_id || '');
    if (rId && revealedSet.has(rId)) return true;
    const fx = Number(f.x ?? 0);
    const fy = Number(f.y ?? 0);
    const fw = Number(f.width || 1);
    const fh = Number(f.height || 1);
    for (let dx = 0; dx < fw; dx++) {
      for (let dy = 0; dy < fh; dy++) {
        if (exploredSet.has(`${fx + dx},${fy + dy}`)) return true;
      }
    }
    return false;
  });

  const rawTraps = Array.isArray(rawSave.traps) ? rawSave.traps : [];
  const trapsDetectedCount = rawTraps.filter(t => t && (t.detected || t.disarmed || t.sprung)).length;

  const rawTriggers = Array.isArray(rawSave.story_triggers) ? rawSave.story_triggers : [];
  const triggersFired = Array.isArray(rawSave.triggers_fired)
    ? rawSave.triggers_fired
    : rawTriggers
        .filter(t => t && t.triggered)
        .map(t => ({
          id: String(t.id || 'trigger'),
          title: String(t.title || t.name || t.marker || 'Story Event'),
          event: String(t.event || ''),
          tile: Array.isArray(t.tile) ? t.tile : [0, 0]
        }));

  // Time played estimation if not explicitly recorded in older save files
  let playTimeSeconds = Number(rawSave['robos:playTimeSeconds'] ?? rawSave.play_time_seconds ?? 0) || 0;
  if (playTimeSeconds <= 0) {
    playTimeSeconds = Math.max(
      45,
      (roundNum - 1) * 180 +
      exploredTilesCount * 8 +
      doorsOpenCount * 25 +
      triggersFired.length * 40 +
      activeHeroIdx * 35
    );
  }

  // Timestamp normalization
  const rawTs = Number(rawSave.timestamp ?? rawSave.saved_at ?? 0);
  const nowSec = Math.floor(Date.now() / 1000);
  const effectiveEpochSec = options.fileMtimeMs
    ? Math.floor(options.fileMtimeMs / 1000)
    : (rawTs > 0 ? Math.floor(rawTs) : nowSec);
  const savedAtIso = rawSave['robos:savedAt'] || rawSave.saved_at_iso || new Date(effectiveEpochSec * 1000).toISOString();

  const totalPartyGold = heroStates.reduce((acc, h) => acc + (Number(h.gold) || 0), 0);
  const label = String(
    rawSave['dcterms:title'] ||
    rawSave.snapshot_label ||
    rawSave.label ||
    `Quest State — Round ${roundNum} (${activeTurnActor})`
  );

  return {
    '@id': `urn:robos:tabletop:savestate:${slug}`,
    '@type': [
      'oslc_am:Resource',
      'robos:TabletopQuestSaveState',
      'schema:Action'
    ],
    'dcterms:title': label,
    'robos:package': 'tabletop-game',
    'robos:namespace': 'robos.tabletop',
    'robos:questSlug': slug,
    'robos:mapId': String(rawSave.map_id || slug),
    'robos:gridDimensions': [
      Number(rawSave.grid_cols || 26),
      Number(rawSave.grid_rows || 19)
    ],
    'robos:savedAt': savedAtIso,
    'robos:savedAtUnix': effectiveEpochSec,
    'robos:playTimeSeconds': playTimeSeconds,
    'robos:playTimeFormatted': formatDurationSeconds(playTimeSeconds),
    'robos:currentRound': roundNum,
    'robos:currentPhase': rawPhase,
    'robos:currentRole': currentRole,
    'robos:activeHeroIndex': activeHeroIdx,
    'robos:activeTurnActor': activeTurnActor,
    'robos:turnState': turnStateRaw,
    'robos:movementRemaining': moveRemaining,
    'robos:movementRolled': moveRolled,
    'robos:hasMovedThisTurn': hasMoved,
    'robos:hasActedThisTurn': hasActed,
    'robos:movementTrail': Array.isArray(rawSave.movement_trail) ? rawSave.movement_trail : [],
    'robos:heroStates': heroStates,
    'robos:visibleMonsters': visibleMonsters,
    'robos:visibleMonstersCount': visibleMonsters.length,
    'robos:monstersDefeated': monstersDefeated,
    'robos:itemsFound': itemsFound,
    'robos:itemsFoundCount': itemsFound.length,
    'robos:totalPartyGold': totalPartyGold,
    'robos:exploredTilesCount': exploredTilesCount,
    'robos:exploredTiles': exploredTiles,
    'robos:revealedRooms': revealedRooms,
    'robos:searchedRooms': searchedRoomsList,
    'robos:doorsOpenCount': doorsOpenCount,
    'robos:doorsSecretRevealedCount': doorsSecretRevealed,
    'robos:doors': seenDoors,
    'robos:furniture': seenFurniture,
    'robos:trapsDetectedCount': trapsDetectedCount,
    'robos:triggersFired': triggersFired,
    'robos:triggersFiredCount': triggersFired.length,
    'robos:currentElfElement': String(rawSave.current_elf_element || ''),
    'robos:screenshotPath': String(options.screenshotPath || rawSave['robos:screenshotPath'] || rawSave.screenshot_path || ''),
    'robos:screenshotDataUrl': String(options.screenshotDataUrl || rawSave['robos:screenshotDataUrl'] || ''),
    'robos:saveFilePath': String(options.saveFilePath || rawSave['robos:saveFilePath'] || ''),
    // Backwards-compatible aliases used by existing callers/tests
    label,
    saved_at: effectiveEpochSec,
    saved_at_iso: savedAtIso,
    cartridge_id: slug,
    cartridge_slug: slug,
    map_id: String(rawSave.map_id || rawSave["robos:mapId"] || slug),
    round_num: roundNum,
    current_round: roundNum,
    phase: rawPhase,
    current_phase: rawPhase,
    active_hero_idx: activeHeroIdx,
    active_turn_actor: activeTurnActor,
    turn_state: turnStateRaw,
    play_time_seconds: playTimeSeconds,
    play_time_formatted: formatDurationSeconds(playTimeSeconds),
    heroes: heroStates.map(h => ({
      ...h,
      hp: h.currentBP,
      max_hp: h.maxBP,
      bp: h.currentBP,
      max_bp: h.maxBP,
      mp: h.currentMP,
      max_mp: h.maxMP,
      grid_pos: h.gridPos
    })),
    visible_monsters: visibleMonsters,
    items_found: itemsFound,
    revealed_rooms: revealedRooms,
    searched_treasure_rooms: searchedRoomsList
  };
}

module.exports = {
  NS_GAME,
  NS_CRPG,
  NS_TABLETOP,
  NS_SDLC,
  GAMING_SHACL_SHAPES,
  TABLETOP_SAVE_STATE_SCHEMA,
  formatDurationSeconds,
  normalizeQuestSaveStateToKGraphNode
};
