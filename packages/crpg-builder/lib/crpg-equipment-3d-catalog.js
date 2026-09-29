'use strict';

/**
 * RobOS cRPG Open-Source 3D Equipment Catalog
 * 
 * Maps open-source 3D models (.glb binary glTF 2.0) to D&D 5e / cRPG equipment,
 * defining visual asset paths, character rig sockets (main_hand, off_hand, chest, head),
 * scaling multipliers, combat mechanics, and open-source provenance.
 * 
 * Provenance:
 * - CC0 / Public Domain (Quaternius, KayKit, Kenney, RobOS procedural GLTF)
 * - CC-BY-SA 3.0 / Free Art License (Flare RPG, Ryzom Core)
 */

const EQUIPMENT_3D_CATALOG = {
  // --- MELEE WEAPONS ---
  'service-sword': {
    id: 'service-sword',
    title: 'Royal Guard Service Sword',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_sword_iron.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d8',
    damageType: 'slashing',
    properties: ['versatile'],
    weight: 3,
    cost: 15,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'longsword': {
    id: 'longsword',
    title: 'Longsword',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_sword_iron.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d8',
    damageType: 'slashing',
    properties: ['versatile'],
    weight: 3,
    cost: 15,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'shortsword': {
    id: 'shortsword',
    title: 'Shortsword',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_sword_iron.glb',
    model3dSocket: 'main_hand',
    model3dScale: 0.82,
    model3dTint: '',
    damageDice: '1d6',
    damageType: 'piercing',
    properties: ['finesse', 'light'],
    weight: 2,
    cost: 10,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'greatsword': {
    id: 'greatsword',
    title: 'Greatsword',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_greatsword.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.15,
    model3dTint: '',
    damageDice: '2d6',
    damageType: 'slashing',
    properties: ['heavy', 'two-handed'],
    weight: 6,
    cost: 50,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'sword-hero': {
    id: 'sword-hero',
    title: 'Mythril Hero Sword (Excalibur)',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_sword_hero.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.05,
    model3dTint: '',
    damageDice: '1d10+2',
    damageType: 'slashing',
    properties: ['versatile', 'magical'],
    weight: 4,
    cost: 2500,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'dagger': {
    id: 'dagger',
    title: 'Dagger',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_dagger_rogue.glb',
    model3dSocket: 'main_hand',
    model3dScale: 0.95,
    model3dTint: '',
    damageDice: '1d4',
    damageType: 'piercing',
    properties: ['finesse', 'light', 'thrown'],
    weight: 1,
    cost: 2,
    rangeFeet: 20,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'rapier': {
    id: 'rapier',
    title: 'Rapier',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_rapier.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d8',
    damageType: 'piercing',
    properties: ['finesse'],
    weight: 2,
    cost: 25,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'mace': {
    id: 'mace',
    title: 'Flanged Mace',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_mace_flanged.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d6',
    damageType: 'bludgeoning',
    properties: [],
    weight: 4,
    cost: 5,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'warhammer': {
    id: 'warhammer',
    title: 'Warhammer',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_warhammer.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d8',
    damageType: 'bludgeoning',
    properties: ['versatile'],
    weight: 2,
    cost: 15,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'morningstar': {
    id: 'morningstar',
    title: 'Morningstar',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_mace_flanged.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.05,
    model3dTint: '',
    damageDice: '1d8',
    damageType: 'piercing',
    properties: [],
    weight: 4,
    cost: 15,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'battleaxe': {
    id: 'battleaxe',
    title: 'Battleaxe',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_battleaxe.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d8',
    damageType: 'slashing',
    properties: ['versatile'],
    weight: 4,
    cost: 10,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'spear': {
    id: 'spear',
    title: 'Spear',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_spear.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d6',
    damageType: 'piercing',
    properties: ['thrown', 'versatile'],
    weight: 3,
    cost: 1,
    rangeFeet: 20,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'quarterstaff': {
    id: 'quarterstaff',
    title: 'Quarterstaff',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_staff_wizard.glb',
    model3dSocket: 'main_hand',
    model3dScale: 0.95,
    model3dTint: '',
    damageDice: '1d6',
    damageType: 'bludgeoning',
    properties: ['versatile'],
    weight: 4,
    cost: 1,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'club': {
    id: 'club',
    title: 'Hardwood Club',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_club_wood.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d4',
    damageType: 'bludgeoning',
    properties: ['light'],
    weight: 2,
    cost: 1,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'bamboo-pole': {
    id: 'bamboo-pole',
    title: 'Bamboo Pole',
    category: 'weapon',
    weaponType: 'melee',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_bamboo_pole.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d4',
    damageType: 'bludgeoning',
    properties: ['versatile'],
    weight: 2,
    cost: 1,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },

  // --- RANGED WEAPONS ---
  'shortbow': {
    id: 'shortbow',
    title: 'Shortbow',
    category: 'weapon',
    weaponType: 'ranged',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_bow_recurve.glb',
    model3dSocket: 'main_hand',
    model3dScale: 0.90,
    model3dTint: '',
    damageDice: '1d6',
    damageType: 'piercing',
    properties: ['ammunition', 'two-handed'],
    weight: 2,
    cost: 25,
    rangeFeet: 80,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'hunting-bow': {
    id: 'hunting-bow',
    title: 'Oak Hunting Bow',
    category: 'weapon',
    weaponType: 'ranged',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_bow_recurve.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.0,
    model3dTint: '',
    damageDice: '1d8',
    damageType: 'piercing',
    properties: ['ammunition', 'two-handed'],
    weight: 2,
    cost: 25,
    rangeFeet: 80,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'longbow': {
    id: 'longbow',
    title: 'Longbow',
    category: 'weapon',
    weaponType: 'ranged',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_bow_recurve.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.20,
    model3dTint: '',
    damageDice: '1d8',
    damageType: 'piercing',
    properties: ['ammunition', 'heavy', 'two-handed'],
    weight: 2,
    cost: 50,
    rangeFeet: 150,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'light-crossbow': {
    id: 'light-crossbow',
    title: 'Light Crossbow',
    category: 'weapon',
    weaponType: 'ranged',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_crossbow.glb',
    model3dSocket: 'main_hand',
    model3dScale: 0.95,
    model3dTint: '',
    damageDice: '1d8',
    damageType: 'piercing',
    properties: ['ammunition', 'loading', 'two-handed'],
    weight: 5,
    cost: 25,
    rangeFeet: 80,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'heavy-crossbow': {
    id: 'heavy-crossbow',
    title: 'Heavy Crossbow',
    category: 'weapon',
    weaponType: 'ranged',
    equipSlot: 'main_hand',
    model3dAsset: 'res://assets/models/weapon_crossbow.glb',
    model3dSocket: 'main_hand',
    model3dScale: 1.15,
    model3dTint: '',
    damageDice: '1d10',
    damageType: 'piercing',
    properties: ['ammunition', 'heavy', 'loading', 'two-handed'],
    weight: 9,
    cost: 50,
    rangeFeet: 100,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },

  // --- SHIELDS ---
  'shield': {
    id: 'shield',
    title: 'Knightly Shield',
    category: 'armor',
    armorType: 'shield',
    equipSlot: 'off_hand',
    model3dAsset: 'res://assets/models/armor_shield_heater.glb',
    model3dSocket: 'off_hand',
    model3dScale: 1.0,
    model3dTint: '',
    acBonus: 2,
    weight: 6,
    cost: 10,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'shield-round': {
    id: 'shield-round',
    title: 'Norse Round Shield',
    category: 'armor',
    armorType: 'shield',
    equipSlot: 'off_hand',
    model3dAsset: 'res://assets/models/armor_shield_round.glb',
    model3dSocket: 'off_hand',
    model3dScale: 1.0,
    model3dTint: '',
    acBonus: 2,
    weight: 5,
    cost: 8,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'shield-tower': {
    id: 'shield-tower',
    title: 'Pavise Tower Shield',
    category: 'armor',
    armorType: 'shield',
    equipSlot: 'off_hand',
    model3dAsset: 'res://assets/models/armor_shield_tower.glb',
    model3dSocket: 'off_hand',
    model3dScale: 1.05,
    model3dTint: '',
    acBonus: 3,
    weight: 15,
    cost: 35,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },

  // --- HELMETS ---
  'helm-knight': {
    id: 'helm-knight',
    title: 'Knight Greathelm',
    category: 'armor',
    armorType: 'heavy',
    equipSlot: 'head',
    model3dAsset: 'res://assets/models/armor_helm_knight.glb',
    model3dSocket: 'head',
    model3dScale: 1.0,
    model3dTint: '',
    acBonus: 1,
    weight: 6,
    cost: 40,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'helm-iron': {
    id: 'helm-iron',
    title: 'Iron Nasal Helm',
    category: 'armor',
    armorType: 'medium',
    equipSlot: 'head',
    model3dAsset: 'res://assets/models/armor_helm_iron.glb',
    model3dSocket: 'head',
    model3dScale: 1.0,
    model3dTint: '',
    acBonus: 1,
    weight: 4,
    cost: 20,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },

  // --- ARMOR SUITS (CHEST) ---
  'plate-armor': {
    id: 'plate-armor',
    title: 'Full Plate Armor',
    category: 'armor',
    armorType: 'heavy',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_plate.glb',
    model3dSocket: 'armor',
    model3dScale: 1.0,
    model3dTint: '',
    acBonus: 18,
    weight: 65,
    cost: 1500,
    stealthDisadvantage: true,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'half-plate': {
    id: 'half-plate',
    title: 'Half Plate Armor',
    category: 'armor',
    armorType: 'medium',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_plate.glb',
    model3dSocket: 'armor',
    model3dScale: 0.95,
    model3dTint: '',
    acBonus: 15,
    weight: 40,
    cost: 750,
    stealthDisadvantage: true,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'breastplate': {
    id: 'breastplate',
    title: 'Steel Breastplate',
    category: 'armor',
    armorType: 'medium',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_plate.glb',
    model3dSocket: 'armor',
    model3dScale: 0.90,
    model3dTint: '',
    acBonus: 14,
    weight: 20,
    cost: 400,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'splint-armor': {
    id: 'splint-armor',
    title: 'Splint Armor',
    category: 'armor',
    armorType: 'heavy',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_plate.glb',
    model3dSocket: 'armor',
    model3dScale: 0.98,
    model3dTint: '',
    acBonus: 17,
    weight: 60,
    cost: 200,
    stealthDisadvantage: true,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'chain-mail': {
    id: 'chain-mail',
    title: 'Guard Chain Mail',
    category: 'armor',
    armorType: 'heavy',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_chainmail.glb',
    model3dSocket: 'armor',
    model3dScale: 1.0,
    model3dTint: '',
    acBonus: 16,
    weight: 55,
    cost: 75,
    stealthDisadvantage: true,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'chain-shirt': {
    id: 'chain-shirt',
    title: 'Chain Shirt',
    category: 'armor',
    armorType: 'medium',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_chainmail.glb',
    model3dSocket: 'armor',
    model3dScale: 0.90,
    model3dTint: '',
    acBonus: 13,
    weight: 20,
    cost: 50,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'ring-mail': {
    id: 'ring-mail',
    title: 'Ring Mail',
    category: 'armor',
    armorType: 'heavy',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_chainmail.glb',
    model3dSocket: 'armor',
    model3dScale: 0.95,
    model3dTint: '',
    acBonus: 14,
    weight: 40,
    cost: 30,
    stealthDisadvantage: true,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'scale-mail': {
    id: 'scale-mail',
    title: 'Scale Mail',
    category: 'armor',
    armorType: 'medium',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_chainmail.glb',
    model3dSocket: 'armor',
    model3dScale: 0.95,
    model3dTint: '',
    acBonus: 14,
    weight: 45,
    cost: 50,
    stealthDisadvantage: true,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'leather-armor': {
    id: 'leather-armor',
    title: 'Cured Leather Armor',
    category: 'armor',
    armorType: 'light',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_leather.glb',
    model3dSocket: 'armor',
    model3dScale: 1.0,
    model3dTint: '',
    acBonus: 11,
    weight: 10,
    cost: 10,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'studded-leather': {
    id: 'studded-leather',
    title: 'Studded Leather Armor',
    category: 'armor',
    armorType: 'light',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_leather.glb',
    model3dSocket: 'armor',
    model3dScale: 1.02,
    model3dTint: '',
    acBonus: 12,
    weight: 13,
    cost: 45,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'padded': {
    id: 'padded',
    title: 'Padded Armor',
    category: 'armor',
    armorType: 'light',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_leather.glb',
    model3dSocket: 'armor',
    model3dScale: 0.95,
    model3dTint: '',
    acBonus: 11,
    weight: 8,
    cost: 5,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  },
  'hide-armor': {
    id: 'hide-armor',
    title: 'Hide Armor',
    category: 'armor',
    armorType: 'medium',
    equipSlot: 'chest',
    model3dAsset: 'res://assets/models/armor_suit_leather.glb',
    model3dSocket: 'armor',
    model3dScale: 1.05,
    model3dTint: '',
    acBonus: 12,
    weight: 12,
    cost: 10,
    provenance: {
      source: 'RobOS / CC0 Open-Source',
      license: 'CC0',
      polyType: 'low-poly'
    }
  }
};

const ALIASES = {
  'heros-sword': 'sword-hero',
  'hero-sword': 'sword-hero',
  'copper-sword': 'shortsword',
  'iron-sword': 'longsword',
  'tower-shield': 'shield-tower',
  'round-shield': 'shield-round',
  'knight-helm': 'helm-knight',
  'iron-helm': 'helm-iron',
  'nasal-helm': 'helm-iron'
};

/**
 * Get 3D equipment item by ID or slug
 */
function getEquipment3D(idOrSlug) {
  if (!idOrSlug) return null;
  const key = String(idOrSlug).toLowerCase().trim();
  if (EQUIPMENT_3D_CATALOG[key]) {
    return EQUIPMENT_3D_CATALOG[key];
  }
  if (ALIASES[key] && EQUIPMENT_3D_CATALOG[ALIASES[key]]) {
    return EQUIPMENT_3D_CATALOG[ALIASES[key]];
  }
  // Try exact title match
  for (const item of Object.values(EQUIPMENT_3D_CATALOG)) {
    if (item.title.toLowerCase() === key) {
      return item;
    }
  }
  return null;
}

/**
 * Get all 3D equipment records as an array
 */
function getAllEquipment3D() {
  return Object.values(EQUIPMENT_3D_CATALOG);
}

/**
 * Filter 3D equipment by category (weapon, armor, shield, helmet)
 */
function getEquipmentByCategory(category) {
  const cat = String(category).toLowerCase();
  return Object.values(EQUIPMENT_3D_CATALOG).filter(item => {
    if (cat === 'shield') return item.armorType === 'shield';
    if (cat === 'helmet') return item.equipSlot === 'head';
    return item.category === cat;
  });
}

/**
 * Resolve 3D model metadata for any item dictionary/node
 */
function resolveModelForItem(itemData) {
  if (!itemData) return null;
  const slug = String(itemData.id || itemData['@id'] || '').toLowerCase();
  const title = String(itemData.title || itemData['dcterms:title'] || '').toLowerCase();

  // Direct lookup
  let found = getEquipment3D(slug);
  if (!found) {
    found = getEquipment3D(title);
  }

  if (found) {
    return {
      model3dAsset: found.model3dAsset,
      model3dSocket: found.model3dSocket,
      model3dScale: found.model3dScale,
      model3dTint: found.model3dTint
    };
  }

  // Keyword heuristic fallback (order matters: specialized/longer prefixes first!)
  const text = `${slug} ${title}`;
  if (text.includes('hero') || text.includes('excalibur') || text.includes('erdrick')) {
    return { model3dAsset: 'res://assets/models/weapon_sword_hero.glb', model3dSocket: 'main_hand', model3dScale: 1.05, model3dTint: '' };
  } else if (text.includes('greatsword') || text.includes('claymore')) {
    return { model3dAsset: 'res://assets/models/weapon_greatsword.glb', model3dSocket: 'main_hand', model3dScale: 1.15, model3dTint: '' };
  } else if (text.includes('warhammer') || text.includes('maul')) {
    return { model3dAsset: 'res://assets/models/weapon_warhammer.glb', model3dSocket: 'main_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('rapier') || text.includes('estoc')) {
    return { model3dAsset: 'res://assets/models/weapon_rapier.glb', model3dSocket: 'main_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('battleaxe') || text.includes('axe')) {
    return { model3dAsset: 'res://assets/models/weapon_battleaxe.glb', model3dSocket: 'main_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('spear') || text.includes('pike')) {
    return { model3dAsset: 'res://assets/models/weapon_spear.glb', model3dSocket: 'main_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('crossbow')) {
    return { model3dAsset: 'res://assets/models/weapon_crossbow.glb', model3dSocket: 'main_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('bow')) {
    return { model3dAsset: 'res://assets/models/weapon_bow_recurve.glb', model3dSocket: 'main_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('staff') || text.includes('wand')) {
    return { model3dAsset: 'res://assets/models/weapon_staff_wizard.glb', model3dSocket: 'main_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('mace') || text.includes('morningstar')) {
    return { model3dAsset: 'res://assets/models/weapon_mace_flanged.glb', model3dSocket: 'main_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('dagger') || text.includes('knife')) {
    return { model3dAsset: 'res://assets/models/weapon_dagger_rogue.glb', model3dSocket: 'main_hand', model3dScale: 0.95, model3dTint: '' };
  } else if (text.includes('tower') || text.includes('pavise')) {
    return { model3dAsset: 'res://assets/models/armor_shield_tower.glb', model3dSocket: 'off_hand', model3dScale: 1.05, model3dTint: '' };
  } else if (text.includes('round') || text.includes('buckler')) {
    return { model3dAsset: 'res://assets/models/armor_shield_round.glb', model3dSocket: 'off_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('shield')) {
    return { model3dAsset: 'res://assets/models/armor_shield_heater.glb', model3dSocket: 'off_hand', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('nasal') || (text.includes('iron') && text.includes('helm'))) {
    return { model3dAsset: 'res://assets/models/armor_helm_iron.glb', model3dSocket: 'head', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('helm') || text.includes('helmet')) {
    return { model3dAsset: 'res://assets/models/armor_helm_knight.glb', model3dSocket: 'head', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('chain') || text.includes('ring-mail') || text.includes('scale-mail')) {
    return { model3dAsset: 'res://assets/models/armor_suit_chainmail.glb', model3dSocket: 'armor', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('plate') || text.includes('breastplate')) {
    return { model3dAsset: 'res://assets/models/armor_suit_plate.glb', model3dSocket: 'armor', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('leather') || text.includes('hide') || text.includes('padded')) {
    return { model3dAsset: 'res://assets/models/armor_suit_leather.glb', model3dSocket: 'armor', model3dScale: 1.0, model3dTint: '' };
  } else if (text.includes('sword') || text.includes('blade')) {
    return { model3dAsset: 'res://assets/models/weapon_sword_iron.glb', model3dSocket: 'main_hand', model3dScale: 1.0, model3dTint: '' };
  }

  return null;
}

module.exports = {
  EQUIPMENT_3D_CATALOG,
  getEquipment3D,
  getAllEquipment3D,
  getEquipmentByCategory,
  resolveModelForItem
};
