'use strict';

/**
 * D&D 5e System Reference Document (SRD) Data
 * 
 * Source: 5e-bits/5e-database & Open5e (OGL 1.0a / CC-BY-4.0)
 * 
 * Contains machine-readable classes, monsters, spells, and equipment
 * bound to Flare RPG isometric asset references.
 */

function calcModifier(score) {
  return Math.floor((score - 10) / 2);
}

const SRD_CLASSES = [
  {
    id: 'fighter',
    title: 'Fighter',
    hitDie: 'd10',
    primaryAbility: 'STR',
    savingThrows: ['STR', 'CON'],
    proficiencies: ['all_armor', 'shields', 'simple_weapons', 'martial_weapons'],
    spellcasting: null,
    baseHpAtLevel1: 10
  },
  {
    id: 'wizard',
    title: 'Wizard',
    hitDie: 'd6',
    primaryAbility: 'INT',
    savingThrows: ['INT', 'WIS'],
    proficiencies: ['daggers', 'darts', 'slings', 'quarterstaffs', 'light_crossbows'],
    spellcasting: 'INT',
    baseHpAtLevel1: 6,
    spellSlotsPerLevel: {
      1: [2],
      2: [3],
      3: [4, 2],
      4: [4, 3],
      5: [4, 3, 2]
    }
  },
  {
    id: 'rogue',
    title: 'Rogue',
    hitDie: 'd8',
    primaryAbility: 'DEX',
    savingThrows: ['DEX', 'INT'],
    proficiencies: ['light_armor', 'simple_weapons', 'hand_crossbows', 'longswords', 'rapiers', 'shortswords'],
    spellcasting: null,
    baseHpAtLevel1: 8
  },
  {
    id: 'cleric',
    title: 'Cleric',
    hitDie: 'd8',
    primaryAbility: 'WIS',
    savingThrows: ['WIS', 'CHA'],
    proficiencies: ['light_armor', 'medium_armor', 'shields', 'simple_weapons'],
    spellcasting: 'WIS',
    baseHpAtLevel1: 8,
    spellSlotsPerLevel: {
      1: [2],
      2: [3],
      3: [4, 2],
      4: [4, 3],
      5: [4, 3, 2]
    }
  }
];

const SRD_SPELLS = [
  {
    id: 'magic_missile',
    title: 'Magic Missile',
    level: 1,
    school: 'Evocation',
    castingTime: '1 action',
    range: '120 feet',
    components: ['V', 'S'],
    duration: 'Instantaneous',
    damageFormula: '3d4+3',
    damageType: 'force',
    autoHit: true,
    savingThrow: null,
    icon: 'assets/icons/spells/magic_missile.png',
    description: 'You create three glowing darts of magical force. Each dart hits a creature of your choice.'
  },
  {
    id: 'cure_wounds',
    title: 'Cure Wounds',
    level: 1,
    school: 'Evocation',
    castingTime: '1 action',
    range: 'Touch',
    components: ['V', 'S'],
    duration: 'Instantaneous',
    healFormula: '1d8+WIS',
    icon: 'assets/icons/spells/cure_wounds.png',
    description: 'A creature you touch regains hit points equal to 1d8 + your spellcasting ability modifier.'
  },
  {
    id: 'shield',
    title: 'Shield',
    level: 1,
    school: 'Abjuration',
    castingTime: '1 reaction',
    range: 'Self',
    components: ['V', 'S'],
    duration: '1 round',
    acBonus: 5,
    icon: 'assets/icons/spells/shield.png',
    description: 'An invisible barrier of magical force appears and protects you, adding +5 to your AC.'
  },
  {
    id: 'sleep',
    title: 'Sleep',
    level: 1,
    school: 'Enchantment',
    castingTime: '1 action',
    range: '90 feet',
    components: ['V', 'S', 'M'],
    duration: '1 minute',
    effectDice: '5d8',
    icon: 'assets/icons/spells/sleep.png',
    description: 'This spell sends creatures into a magical slumber. Roll 5d8; the total is how many hit points of creatures this spell can affect.'
  },
  {
    id: 'fireball',
    title: 'Fireball',
    level: 3,
    school: 'Evocation',
    castingTime: '1 action',
    range: '150 feet',
    components: ['V', 'S', 'M'],
    duration: 'Instantaneous',
    damageFormula: '8d6',
    damageType: 'fire',
    savingThrow: 'DEX',
    halfOnSave: true,
    icon: 'assets/icons/spells/fireball.png',
    description: 'A bright streak flashes to a point and blossoms into an enormous explosion of flame. Each creature in a 20-foot radius takes 8d6 fire damage.'
  }
];

const SRD_MONSTERS = [
  {
    id: 'skeleton',
    title: 'Skeleton',
    challengeRating: '1/4',
    xp: 50,
    armorClass: 13,
    hitPoints: 13,
    hitDice: '2d8+4',
    speed: 30,
    abilities: { STR: 10, DEX: 14, CON: 15, INT: 6, WIS: 8, CHA: 5 },
    vulnerabilities: ['bludgeoning'],
    immunities: ['poison'],
    attacks: [
      { name: 'Shortsword', attackBonus: 4, damage: '1d6+2', damageType: 'piercing', range: 5 },
      { name: 'Shortbow', attackBonus: 4, damage: '1d6+2', damageType: 'piercing', range: 80 }
    ],
    spriteAssetRef: 'flare:creature:skeleton'
  },
  {
    id: 'goblin',
    title: 'Goblin',
    challengeRating: '1/4',
    xp: 50,
    armorClass: 15,
    hitPoints: 7,
    hitDice: '2d6',
    speed: 30,
    abilities: { STR: 8, DEX: 14, CON: 10, INT: 10, WIS: 8, CHA: 8 },
    attacks: [
      { name: 'Scimitar', attackBonus: 4, damage: '1d6+2', damageType: 'slashing', range: 5 },
      { name: 'Shortbow', attackBonus: 4, damage: '1d6+2', damageType: 'piercing', range: 80 }
    ],
    spriteAssetRef: 'flare:creature:goblin'
  },
  {
    id: 'orc',
    title: 'Orc',
    challengeRating: '1/2',
    xp: 100,
    armorClass: 13,
    hitPoints: 15,
    hitDice: '2d8+6',
    speed: 30,
    abilities: { STR: 16, DEX: 12, CON: 16, INT: 7, WIS: 11, CHA: 10 },
    attacks: [
      { name: 'Greataxe', attackBonus: 5, damage: '1d12+3', damageType: 'slashing', range: 5 },
      { name: 'Javelin', attackBonus: 5, damage: '1d6+3', damageType: 'piercing', range: 30 }
    ],
    spriteAssetRef: 'flare:creature:orc'
  },
  {
    id: 'zombie',
    title: 'Zombie',
    challengeRating: '1/4',
    xp: 50,
    armorClass: 8,
    hitPoints: 22,
    hitDice: '3d8+9',
    speed: 20,
    abilities: { STR: 13, DEX: 6, CON: 16, INT: 3, WIS: 6, CHA: 5 },
    immunities: ['poison'],
    attacks: [
      { name: 'Slam', attackBonus: 3, damage: '1d6+1', damageType: 'bludgeoning', range: 5 }
    ],
    spriteAssetRef: 'flare:creature:zombie'
  },
  {
    id: 'minotaur',
    title: 'Minotaur',
    challengeRating: '3',
    xp: 700,
    armorClass: 14,
    hitPoints: 76,
    hitDice: '9d10+27',
    speed: 40,
    abilities: { STR: 18, DEX: 11, CON: 16, INT: 6, WIS: 16, CHA: 9 },
    attacks: [
      { name: 'Greataxe', attackBonus: 6, damage: '2d12+4', damageType: 'slashing', range: 5 },
      { name: 'Gore', attackBonus: 6, damage: '2d8+4', damageType: 'piercing', range: 5 }
    ],
    spriteAssetRef: 'flare:creature:minotaur'
  },
  {
    id: 'corrupted-hound',
    title: 'Corrupted Shadow Hound',
    challengeRating: '1/4',
    xp: 50,
    armorClass: 12,
    hitPoints: 11,
    hitDice: '2d8+2',
    speed: 40,
    abilities: { STR: 12, DEX: 15, CON: 12, INT: 3, WIS: 12, CHA: 6 },
    attacks: [
      { name: 'Bite', attackBonus: 4, damage: '1d6+2', damageType: 'piercing', range: 5 }
    ],
    spriteAssetRef: 'flare:creature:wolf'
  },
  {
    id: 'corrupted-guard',
    title: 'Feral Guard Skirmisher',
    challengeRating: '1/2',
    xp: 100,
    armorClass: 14,
    hitPoints: 16,
    hitDice: '2d8+4',
    speed: 30,
    abilities: { STR: 14, DEX: 12, CON: 14, INT: 8, WIS: 10, CHA: 8 },
    attacks: [
      { name: 'Spear', attackBonus: 4, damage: '1d6+2', damageType: 'piercing', range: 5 }
    ],
    spriteAssetRef: 'flare:creature:skeleton'
  },
  {
    id: 'captain-malakor-boss',
    title: 'Captain Malakor (Corrupted Commander)',
    challengeRating: '3',
    xp: 700,
    armorClass: 16,
    hitPoints: 58,
    hitDice: '8d8+24',
    speed: 30,
    abilities: { STR: 18, DEX: 12, CON: 16, INT: 12, WIS: 14, CHA: 14 },
    attacks: [
      { name: 'Void Halberd', attackBonus: 6, damage: '1d10+4', damageType: 'slashing', range: 5 },
      { name: 'Void Blast', attackBonus: 5, damage: '2d6+2', damageType: 'necrotic', range: 30 }
    ],
    spriteAssetRef: 'flare:creature:minotaur'
  }
];

const SRD_EQUIPMENT = [
  {
    id: 'longsword',
    title: 'Longsword',
    itemCategory: 'weapon',
    equipSlot: 'main_hand',
    damageDice: '1d8',
    versatileDamageDice: '1d10',
    damageType: 'slashing',
    cost: 15,
    weight: 3,
    icon: 'assets/icons/weapons/longsword.png'
  },
  {
    id: 'shortbow',
    title: 'Shortbow',
    itemCategory: 'weapon',
    equipSlot: 'two_handed',
    damageDice: '1d6',
    damageType: 'piercing',
    range: 80,
    cost: 25,
    weight: 2,
    icon: 'assets/icons/weapons/shortbow.png'
  },
  {
    id: 'dagger',
    title: 'Dagger',
    itemCategory: 'weapon',
    equipSlot: 'main_hand',
    damageDice: '1d4',
    damageType: 'piercing',
    finesse: true,
    cost: 2,
    weight: 1,
    icon: 'assets/icons/weapons/dagger.png'
  },
  {
    id: 'chain_mail',
    title: 'Chain Mail',
    itemCategory: 'armor',
    equipSlot: 'chest',
    acBonus: 16,
    stealthDisadvantage: true,
    cost: 75,
    weight: 55,
    icon: 'assets/icons/armor/chain_mail.png'
  },
  {
    id: 'leather_armor',
    title: 'Leather Armor',
    itemCategory: 'armor',
    equipSlot: 'chest',
    acBonus: 11,
    addDexModifier: true,
    cost: 10,
    weight: 10,
    icon: 'assets/icons/armor/leather_armor.png'
  },
  {
    id: 'shield',
    title: 'Shield',
    itemCategory: 'shield',
    equipSlot: 'off_hand',
    acBonus: 2,
    cost: 10,
    weight: 6,
    icon: 'assets/icons/armor/shield.png'
  },
  {
    id: 'potion_of_healing',
    title: 'Potion of Healing',
    itemCategory: 'consumable',
    equipSlot: null,
    healFormula: '2d4+2',
    cost: 50,
    weight: 0.5,
    icon: 'assets/icons/potions/potion_healing.png'
  },
  {
    id: 'service-sword',
    title: 'Royal Guard Service Sword',
    itemCategory: 'weapon',
    equipSlot: 'main_hand',
    damageDice: '1d8',
    damageType: 'slashing',
    cost: 20,
    weight: 3,
    icon: 'assets/icons/weapons/longsword.png'
  },
  {
    id: 'garrison-key',
    title: 'Garrison Side-Gate Key',
    itemCategory: 'quest',
    equipSlot: null,
    cost: 0,
    weight: 0.1,
    icon: 'assets/icons/tools/torch.png'
  },
  {
    id: 'guard-journal',
    title: 'Blood-Stained Watch Journal',
    itemCategory: 'quest',
    equipSlot: null,
    cost: 0,
    weight: 1,
    icon: 'assets/icons/scrolls/scroll_magic_missile.png'
  },
  {
    id: 'malakor-signet',
    title: "Commander's Void Signet",
    itemCategory: 'accessory',
    equipSlot: 'ring',
    acBonus: 1,
    cost: 250,
    weight: 0.1,
    icon: 'assets/icons/armor/shield.png'
  }
];

module.exports = {
  calcModifier,
  SRD_CLASSES,
  SRD_SPELLS,
  SRD_MONSTERS,
  SRD_EQUIPMENT
};
