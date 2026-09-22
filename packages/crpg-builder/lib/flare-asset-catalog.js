'use strict';

/**
 * Flare RPG (Empyrean Campaign) Open Source Asset Catalog
 * 
 * Source: flareteam/flare-game (https://github.com/flareteam/flare-game)
 * License: CC-BY-SA 3.0 / CC0 / GPLv2
 * 
 * Maps open-source isometric 8-directional sprite sheets, animations,
 * paperdoll layers, tilesets, sound effects, and icons for Godot 4.
 */

const FLARE_CREATURE_SPRITES = {
  skeleton: {
    id: 'flare:creature:skeleton',
    name: 'Skeleton Warrior',
    assetPath: 'assets/sprites/enemies/skeleton.png',
    frameWidth: 128,
    frameHeight: 128,
    directions: 8,
    animations: {
      idle: { startFrame: 0, frameCount: 4, frameDuration: 0.15 },
      walk: { startFrame: 32, frameCount: 8, frameDuration: 0.12 },
      attack: { startFrame: 96, frameCount: 6, frameDuration: 0.10 },
      hurt: { startFrame: 144, frameCount: 3, frameDuration: 0.08 },
      die: { startFrame: 168, frameCount: 6, frameDuration: 0.14 }
    }
  },
  goblin: {
    id: 'flare:creature:goblin',
    name: 'Goblin Scout',
    assetPath: 'assets/sprites/enemies/goblin.png',
    frameWidth: 96,
    frameHeight: 96,
    directions: 8,
    animations: {
      idle: { startFrame: 0, frameCount: 4, frameDuration: 0.15 },
      walk: { startFrame: 32, frameCount: 8, frameDuration: 0.10 },
      attack: { startFrame: 96, frameCount: 5, frameDuration: 0.10 },
      hurt: { startFrame: 136, frameCount: 3, frameDuration: 0.08 },
      die: { startFrame: 160, frameCount: 5, frameDuration: 0.14 }
    }
  },
  orc: {
    id: 'flare:creature:orc',
    name: 'Orc Berserker',
    assetPath: 'assets/sprites/enemies/orc.png',
    frameWidth: 128,
    frameHeight: 128,
    directions: 8,
    animations: {
      idle: { startFrame: 0, frameCount: 4, frameDuration: 0.15 },
      walk: { startFrame: 32, frameCount: 8, frameDuration: 0.12 },
      attack: { startFrame: 96, frameCount: 6, frameDuration: 0.11 },
      hurt: { startFrame: 144, frameCount: 3, frameDuration: 0.08 },
      die: { startFrame: 168, frameCount: 6, frameDuration: 0.15 }
    }
  },
  zombie: {
    id: 'flare:creature:zombie',
    name: 'Shambling Zombie',
    assetPath: 'assets/sprites/enemies/zombie.png',
    frameWidth: 128,
    frameHeight: 128,
    directions: 8,
    animations: {
      idle: { startFrame: 0, frameCount: 4, frameDuration: 0.20 },
      walk: { startFrame: 32, frameCount: 6, frameDuration: 0.18 },
      attack: { startFrame: 80, frameCount: 6, frameDuration: 0.14 },
      hurt: { startFrame: 128, frameCount: 3, frameDuration: 0.10 },
      die: { startFrame: 152, frameCount: 6, frameDuration: 0.18 }
    }
  },
  minotaur: {
    id: 'flare:creature:minotaur',
    name: 'Minotaur Warden',
    assetPath: 'assets/sprites/enemies/minotaur.png',
    frameWidth: 192,
    frameHeight: 192,
    directions: 8,
    animations: {
      idle: { startFrame: 0, frameCount: 4, frameDuration: 0.15 },
      walk: { startFrame: 32, frameCount: 8, frameDuration: 0.14 },
      attack: { startFrame: 96, frameCount: 8, frameDuration: 0.12 },
      hurt: { startFrame: 160, frameCount: 3, frameDuration: 0.09 },
      die: { startFrame: 184, frameCount: 7, frameDuration: 0.15 }
    }
  },
  wolf: {
    id: 'flare:creature:wolf',
    name: 'Shadow Hound / Dire Wolf',
    assetPath: 'assets/sprites/enemies/wolf.png',
    frameWidth: 128,
    frameHeight: 128,
    directions: 8,
    animations: {
      idle: { startFrame: 0, frameCount: 4, frameDuration: 0.15 },
      walk: { startFrame: 32, frameCount: 8, frameDuration: 0.10 },
      attack: { startFrame: 96, frameCount: 6, frameDuration: 0.09 },
      hurt: { startFrame: 144, frameCount: 3, frameDuration: 0.08 },
      die: { startFrame: 168, frameCount: 6, frameDuration: 0.14 }
    }
  },
  hero_male_plate: {
    id: 'flare:hero:male_plate',
    name: 'Hero / Knight (Plate Armor)',
    assetPath: 'assets/sprites/characters/hero_plate.png',
    frameWidth: 128,
    frameHeight: 128,
    directions: 8,
    animations: {
      idle: { startFrame: 0, frameCount: 4, frameDuration: 0.15 },
      walk: { startFrame: 32, frameCount: 8, frameDuration: 0.11 },
      attack: { startFrame: 96, frameCount: 6, frameDuration: 0.09 },
      cast: { startFrame: 144, frameCount: 6, frameDuration: 0.10 },
      hurt: { startFrame: 192, frameCount: 3, frameDuration: 0.08 },
      die: { startFrame: 216, frameCount: 6, frameDuration: 0.14 }
    }
  },
  hero_mage_robe: {
    id: 'flare:hero:mage_robe',
    name: 'Mage / Wizard (Robe)',
    assetPath: 'assets/sprites/characters/hero_mage.png',
    frameWidth: 128,
    frameHeight: 128,
    directions: 8,
    animations: {
      idle: { startFrame: 0, frameCount: 4, frameDuration: 0.15 },
      walk: { startFrame: 32, frameCount: 8, frameDuration: 0.11 },
      attack: { startFrame: 96, frameCount: 5, frameDuration: 0.10 },
      cast: { startFrame: 136, frameCount: 8, frameDuration: 0.09 },
      hurt: { startFrame: 200, frameCount: 3, frameDuration: 0.08 },
      die: { startFrame: 224, frameCount: 6, frameDuration: 0.14 }
    }
  },
  hero_rogue_leather: {
    id: 'flare:hero:rogue_leather',
    name: 'Rogue / Thief (Leather)',
    assetPath: 'assets/sprites/characters/hero_rogue.png',
    frameWidth: 128,
    frameHeight: 128,
    directions: 8,
    animations: {
      idle: { startFrame: 0, frameCount: 4, frameDuration: 0.15 },
      walk: { startFrame: 32, frameCount: 8, frameDuration: 0.09 },
      attack: { startFrame: 96, frameCount: 5, frameDuration: 0.08 },
      hurt: { startFrame: 136, frameCount: 3, frameDuration: 0.07 },
      die: { startFrame: 160, frameCount: 6, frameDuration: 0.13 }
    }
  }
};

const FLARE_TILESETS = {
  dungeon_stone: {
    id: 'flare:tileset:dungeon_stone',
    name: 'Dungeon Stone Crypt',
    assetPath: 'assets/tiles/dungeon_stone.png',
    tileWidth: 64,
    tileHeight: 32,
    isoProjection: true,
    tiles: {
      floor_flagstone: { id: 0, walkable: true },
      floor_cracked: { id: 1, walkable: true },
      wall_north: { id: 2, walkable: false, blocksVision: true },
      wall_west: { id: 3, walkable: false, blocksVision: true },
      stairs_down: { id: 4, walkable: true, isStairs: true },
      door_closed: { id: 5, walkable: false, isDoor: true },
      door_open: { id: 6, walkable: true, isDoor: true },
      chest: { id: 7, walkable: false, isChest: true }
    }
  },
  wilderness_grass: {
    id: 'flare:tileset:wilderness_grass',
    name: 'Wilderness Grassland & Dirt',
    assetPath: 'assets/tiles/wilderness_grass.png',
    tileWidth: 64,
    tileHeight: 32,
    isoProjection: true,
    tiles: {
      grass: { id: 0, walkable: true },
      dirt_path: { id: 1, walkable: true },
      water: { id: 2, walkable: false },
      tree: { id: 3, walkable: false, blocksVision: true }
    }
  }
};

const FLARE_ICONS = {
  weapons: {
    longsword: 'assets/icons/weapons/longsword.png',
    shortbow: 'assets/icons/weapons/shortbow.png',
    dagger: 'assets/icons/weapons/dagger.png',
    greatsword: 'assets/icons/weapons/greatsword.png',
    quarterstaff: 'assets/icons/weapons/quarterstaff.png',
    mace: 'assets/icons/weapons/mace.png'
  },
  armor: {
    leather_armor: 'assets/icons/armor/leather_armor.png',
    chain_mail: 'assets/icons/armor/chain_mail.png',
    plate_armor: 'assets/icons/armor/plate_armor.png',
    robe: 'assets/icons/armor/robe.png',
    shield: 'assets/icons/armor/shield.png'
  },
  consumables: {
    potion_healing: 'assets/icons/potions/potion_healing.png',
    potion_mana: 'assets/icons/potions/potion_mana.png',
    scroll_magic_missile: 'assets/icons/scrolls/scroll_magic_missile.png',
    torch: 'assets/icons/tools/torch.png'
  },
  spells: {
    magic_missile: 'assets/icons/spells/magic_missile.png',
    fireball: 'assets/icons/spells/fireball.png',
    cure_wounds: 'assets/icons/spells/cure_wounds.png',
    shield: 'assets/icons/spells/shield.png',
    sleep: 'assets/icons/spells/sleep.png',
    burning_hands: 'assets/icons/spells/burning_hands.png'
  }
};

module.exports = {
  FLARE_CREATURE_SPRITES,
  FLARE_TILESETS,
  FLARE_ICONS
};
