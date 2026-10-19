'use strict';

/**
 * RobOS Gaming Subsystem: Multi-Map Configuration Registry
 * Supports classic HeroQuest Board (Side A), HeroQuest First Light Caverns (Side B),
 * and arbitrary custom board layouts with independent dimensions, insets, room geometries,
 * and door positions.
 */

const {
  HEROQUEST_BOARD_WIDTH,
  HEROQUEST_BOARD_HEIGHT,
  HEROQUEST_ROOMS,
  HEROQUEST_STANDARD_DOORS
} = require('./heroquest-board-spec');

// 1. Classic HeroQuest Stone Dungeon Board (Side A)
const HEROQUEST_CLASSIC_CONFIG = {
  id: 'heroquest-classic',
  title: 'HeroQuest Classic Stone Dungeon (Side A)',
  description: 'The standard 26x19 stone dungeon board featuring 22 rooms, 4 quadrants, an outer perimeter corridor, and a 4x5 central chamber.',
  boardSide: 'A',
  theme: 'stone-dungeon',
  gridDimensions: [26, 19],
  backgroundImage: 'res://assets/boards/heroquest_board.png',
  localImageFile: 'assets/boards/heroquest_board.png',
  calibration: {
    insetLeft: 82,
    insetTop: 65,
    insetRight: 78,
    insetBottom: 43,
    cellWidth: 40.0,
    cellHeight: 41.47
  },
  rooms: HEROQUEST_ROOMS,
  doors: HEROQUEST_STANDARD_DOORS,
  defaultStartingStair: [1, 0],
  outerCorridor: {
    top: { y: 0, fromX: 0, toX: 25 },
    bottom: { y: 18, fromX: 0, toX: 25 },
    left: { x: 0, fromY: 0, toY: 18 },
    right: { x: 25, fromY: 0, toY: 18 }
  }
};

// 2. HeroQuest First Light: Subterranean Caverns (Side B)
const HEROQUEST_FIRST_LIGHT_CAVERNS_ROOMS = [
  // Central Cavern Lair
  { id: 'cavern-center', name: 'Central Stalactite Great Cavern', x: 10, y: 6, w: 6, h: 6, quadrant: 'center' },

  // Northwest Cavern Cluster
  { id: 'cavern-nw-1', name: 'Sunken Fungal Grotto', x: 1, y: 1, w: 4, h: 4, quadrant: 'nw' },
  { id: 'cavern-nw-2', name: 'Upper North Echoing Vault', x: 6, y: 1, w: 4, h: 4, quadrant: 'nw' },
  { id: 'cavern-nw-3', name: 'Western Crystal Crevasse', x: 1, y: 6, w: 5, h: 3, quadrant: 'nw' },
  { id: 'cavern-nw-4', name: 'Spiders Web Alcove', x: 7, y: 6, w: 2, h: 3, quadrant: 'nw' },

  // Southwest Cavern Cluster
  { id: 'cavern-sw-1', name: 'Subterranean Riverbank', x: 1, y: 10, w: 5, h: 3, quadrant: 'sw' },
  { id: 'cavern-sw-2', name: 'Bat Hollow', x: 7, y: 10, w: 2, h: 3, quadrant: 'sw' },
  { id: 'cavern-sw-3', name: 'Lower Magma Chimney', x: 1, y: 14, w: 4, h: 4, quadrant: 'sw' },
  { id: 'cavern-sw-4', name: 'South Chasm Chamber', x: 6, y: 14, w: 4, h: 4, quadrant: 'sw' },

  // Northeast Cavern Cluster
  { id: 'cavern-ne-1', name: 'Phosphorescent Moss Den', x: 16, y: 1, w: 4, h: 4, quadrant: 'ne' },
  { id: 'cavern-ne-2', name: 'Northeast Boulder Ridge', x: 21, y: 1, w: 4, h: 4, quadrant: 'ne' },
  { id: 'cavern-ne-3', name: 'East Stalagmite Warren', x: 17, y: 6, w: 2, h: 3, quadrant: 'ne' },
  { id: 'cavern-ne-4', name: 'Upper East Geode Sanctuary', x: 20, y: 6, w: 5, h: 3, quadrant: 'ne' },

  // Southeast Cavern Cluster
  { id: 'cavern-se-1', name: 'Deep Abyss Overlook', x: 17, y: 10, w: 2, h: 3, quadrant: 'se' },
  { id: 'cavern-se-2', name: 'Lower East Dragon Nest', x: 20, y: 10, w: 5, h: 3, quadrant: 'se' },
  { id: 'cavern-se-3', name: 'Underground Lake Outcrop', x: 16, y: 14, w: 4, h: 4, quadrant: 'se' },
  { id: 'cavern-se-4', name: 'Southeast Subterranean Catacomb', x: 21, y: 14, w: 4, h: 4, quadrant: 'se' }
];

const HEROQUEST_FIRST_LIGHT_CAVERNS_DOORS = [
  { id: 'cdoor-center-n', from: [13, 5], to: [13, 6], room: 'cavern-center' },
  { id: 'cdoor-center-s', from: [13, 13], to: [13, 12], room: 'cavern-center' },
  { id: 'cdoor-nw-1', from: [2, 0], to: [2, 1], room: 'cavern-nw-1' },
  { id: 'cdoor-nw-2', from: [8, 0], to: [8, 1], room: 'cavern-nw-2' },
  { id: 'cdoor-nw-3', from: [0, 7], to: [1, 7], room: 'cavern-nw-3' },
  { id: 'cdoor-sw-1', from: [0, 11], to: [1, 11], room: 'cavern-sw-1' },
  { id: 'cdoor-sw-3', from: [2, 18], to: [2, 17], room: 'cavern-sw-3' },
  { id: 'cdoor-ne-1', from: [18, 0], to: [18, 1], room: 'cavern-ne-1' },
  { id: 'cdoor-ne-2', from: [23, 0], to: [23, 1], room: 'cavern-ne-2' },
  { id: 'cdoor-ne-4', from: [25, 7], to: [24, 7], room: 'cavern-ne-4' },
  { id: 'cdoor-se-2', from: [25, 11], to: [24, 11], room: 'cavern-se-2' },
  { id: 'cdoor-se-4', from: [23, 18], to: [23, 17], room: 'cavern-se-4' }
];

const HEROQUEST_FIRST_LIGHT_CONFIG = {
  id: 'first-light-caverns',
  title: 'HeroQuest: First Light Subterranean Caverns (Side B)',
  description: 'The First Light double-sided cavern board layout featuring natural rock formations, fungal grottos, subterranean chasms, and irregular cave chambers.',
  boardSide: 'B',
  theme: 'cavern-depths',
  gridDimensions: [26, 19],
  backgroundImage: 'res://assets/boards/first_light_caverns.png',
  localImageFile: 'assets/boards/first_light_caverns.png',
  calibration: {
    insetLeft: 80,
    insetTop: 65,
    insetRight: 80,
    insetBottom: 45,
    cellWidth: 40.0,
    cellHeight: 41.3
  },
  rooms: HEROQUEST_FIRST_LIGHT_CAVERNS_ROOMS,
  doors: HEROQUEST_FIRST_LIGHT_CAVERNS_DOORS,
  defaultStartingStair: [1, 0],
  outerCorridor: {
    top: { y: 0, fromX: 0, toX: 25 },
    bottom: { y: 18, fromX: 0, toX: 25 },
    left: { x: 0, fromY: 0, toY: 18 },
    right: { x: 25, fromY: 0, toY: 18 }
  }
};

// Map Configuration Registry
// 3. HeroQuest Fan Dungeon & Cavern Citadel (28×21)
const FAN_DUNGEON_28x21_ROOMS = [
  // West Cluster:
  { id: 'room-grand-fossil', name: 'Grand Fossil Hall', x: 1, y: 6, w: 7, h: 9, quadrant: 'w' },
  { id: 'room-nw-crypt', name: 'Northwest Crypt', x: 2, y: 2, w: 5, h: 4, quadrant: 'nw' },
  { id: 'room-sw-cellar', name: 'Southwest Cellar', x: 2, y: 15, w: 5, h: 4, quadrant: 'sw' },

  // Inner West Column:
  { id: 'room-n-armory', name: 'North Armory', x: 8, y: 1, w: 4, h: 4, quadrant: 'nw' },
  { id: 'room-upper-cell', name: 'Upper Guard Room', x: 9, y: 6, w: 3, h: 3, quadrant: 'nw' },
  { id: 'room-lower-cell', name: 'Lower Guard Room', x: 9, y: 12, w: 3, h: 3, quadrant: 'sw' },
  { id: 'room-s-barracks', name: 'South Barracks', x: 8, y: 16, w: 4, h: 4, quadrant: 'sw' },

  // Central Column:
  { id: 'room-center-n', name: 'North Central Chamber', x: 13, y: 2, w: 4, h: 5, quadrant: 'center' },
  { id: 'room-center-mid', name: 'Great Center Chamber', x: 13, y: 8, w: 4, h: 5, quadrant: 'center' },
  { id: 'room-center-s', name: 'South Central Chamber', x: 13, y: 14, w: 4, h: 5, quadrant: 'center' },

  // Inner East Column:
  { id: 'room-ne-inner', name: 'Northeast Antechamber', x: 18, y: 2, w: 3, h: 4, quadrant: 'ne' },
  { id: 'room-e-upper-cell', name: 'East Upper Alcove', x: 18, y: 7, w: 3, h: 3, quadrant: 'ne' },
  { id: 'room-e-lower-cell', name: 'East Lower Alcove', x: 18, y: 11, w: 3, h: 3, quadrant: 'se' },
  { id: 'room-se-inner', name: 'Southeast Antechamber', x: 18, y: 15, w: 3, h: 4, quadrant: 'se' },

  // Far East Column:
  { id: 'room-ne-vault', name: 'Northeast Vault', x: 22, y: 1, w: 4, h: 3, quadrant: 'ne' },
  { id: 'room-e-parlor', name: 'East Grand Parlor', x: 22, y: 5, w: 5, h: 3, quadrant: 'ne' },
  { id: 'room-e-forge', name: 'East Forge', x: 22, y: 9, w: 4, h: 3, quadrant: 'se' },
  { id: 'room-se-sanctum', name: 'Southeast Sanctum', x: 22, y: 13, w: 5, h: 3, quadrant: 'se' },
  { id: 'room-se-tomb', name: 'Southeast Tomb', x: 22, y: 17, w: 4, h: 3, quadrant: 'se' }
];

const FAN_DUNGEON_28x21_DOORS = [
  { id: 'fdoor-fossil-n', from: [4, 5], to: [4, 6], room: 'room-grand-fossil' },
  { id: 'fdoor-fossil-s', from: [4, 15], to: [4, 14], room: 'room-grand-fossil' },
  { id: 'fdoor-fossil-e', from: [8, 10], to: [7, 10], room: 'room-grand-fossil' },
  { id: 'fdoor-nw-crypt', from: [4, 1], to: [4, 2], room: 'room-nw-crypt' },
  { id: 'fdoor-sw-cellar', from: [4, 19], to: [4, 18], room: 'room-sw-cellar' },
  { id: 'fdoor-center-n', from: [12, 4], to: [13, 4], room: 'room-center-n' },
  { id: 'fdoor-center-mid-w', from: [12, 10], to: [13, 10], room: 'room-center-mid' },
  { id: 'fdoor-center-mid-e', from: [17, 10], to: [16, 10], room: 'room-center-mid' },
  { id: 'fdoor-center-s', from: [12, 16], to: [13, 16], room: 'room-center-s' },
  { id: 'fdoor-e-parlor', from: [21, 6], to: [22, 6], room: 'room-e-parlor' },
  { id: 'fdoor-se-sanctum', from: [21, 14], to: [22, 14], room: 'room-se-sanctum' }
];

const FAN_DUNGEON_28x21_CONFIG = {
  id: 'fan-dungeon-28x21',
  title: 'HeroQuest Fan Dungeon & Cavern Citadel (28×21)',
  description: 'Fan-generated 28x21 tactical dungeon board featuring 19 rooms including the Grand Fossil Hall, 3 central chambers, torches, and seamless 0-margin square grid.',
  boardSide: 'Custom',
  theme: 'cavern-citadel',
  gridDimensions: [28, 21],
  backgroundImage: 'res://assets/boards/fan_dungeon_28x21.png',
  localImageFile: 'assets/boards/fan_dungeon_28x21.png',
  calibration: {
    insetLeft: 0,
    insetTop: 0,
    insetRight: 0,
    insetBottom: 0,
    cellWidth: 36.5714,
    cellHeight: 36.5714
  },
  rooms: FAN_DUNGEON_28x21_ROOMS,
  doors: FAN_DUNGEON_28x21_DOORS,
  defaultStartingStair: [0, 1],
  outerCorridor: {
    top: { y: 0, fromX: 0, toX: 27 },
    bottom: { y: 20, fromX: 0, toX: 27 },
    left: { x: 0, fromY: 0, toY: 20 },
    right: { x: 27, fromY: 0, toY: 20 }
  }
};

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CARTRIDGES_DIR = path.join(REPO_ROOT, 'games/tabletop-rpg/cartridges');
const KGRAPH_TABLETOP_PATH = path.join(REPO_ROOT, '.robos/kgraphs/tabletop-game/package.jsonld');

// 4. Midterm Elections 2026: Battle for the Hill (26×19)
const MIDTERM_ELECTION_CAPITOL_CONFIG = {
  id: 'midterm-election-capitol',
  title: 'Midterm Elections: Battle for the Hill',
  description: '26x19 Capitol Hill dungeon board featuring Legislative Committee Chambers, Rotunda Chamber, Speaker Chambers, and subterranean corridors.',
  boardSide: 'Custom',
  theme: 'midterm-election-capitol',
  category: 'Midterms 2026',
  gridDimensions: [26, 19],
  additionalBorderTile: true,
  backgroundImage: 'res://assets/boards/midterm_election_capitol.png',
  localImageFile: 'assets/boards/midterm_election_capitol.png',
  blockmapFile: 'midterm-election-capitol.blockmap.json',
  calibration: {
    insetLeft: 0,
    insetTop: 0,
    insetRight: 0,
    insetBottom: 0,
    cellWidth: 39.0,
    cellHeight: 39.0,
    tileSize: 39.0,
    offsetX: 0,
    offsetY: 0,
    additionalBorderTile: true,
    hasBorder: true
  },
  rooms: HEROQUEST_ROOMS,
  doors: HEROQUEST_STANDARD_DOORS,
  defaultStartingStair: [-1, 11],
  outerCorridor: {
    top: { y: 0, fromX: 0, toX: 25 },
    bottom: { y: 18, fromX: 0, toX: 25 },
    left: { x: 0, fromY: 0, toY: 18 },
    right: { x: 25, fromY: 0, toY: 18 }
  }
};

// 5. HeroQuest: First Light Side A Stone Dungeon (26×19)
const FIRST_LIGHT_DUNGEON_CONFIG = {
  id: 'first-light-dungeon',
  title: 'HeroQuest: First Light Side A',
  description: 'First Light 26x19 stone dungeon board with 39px calibrated grid and outer border.',
  boardSide: 'A',
  theme: 'stone-dungeon',
  gridDimensions: [26, 19],
  additionalBorderTile: true,
  backgroundImage: 'res://assets/boards/first_light_dungeon.png',
  localImageFile: 'assets/boards/first_light_dungeon.png',
  blockmapFile: 'first-light-dungeon.blockmap.json',
  calibration: {
    insetLeft: 0,
    insetTop: 0,
    insetRight: 0,
    insetBottom: 0,
    cellWidth: 39.0,
    cellHeight: 39.0,
    tileSize: 39.0,
    offsetX: 0,
    offsetY: 0,
    additionalBorderTile: true,
    hasBorder: true
  },
  rooms: HEROQUEST_ROOMS,
  doors: HEROQUEST_STANDARD_DOORS,
  defaultStartingStair: [1, 0],
  outerCorridor: {
    top: { y: 0, fromX: 0, toX: 25 },
    bottom: { y: 18, fromX: 0, toX: 25 },
    left: { x: 0, fromY: 0, toY: 18 },
    right: { x: 25, fromY: 0, toY: 18 }
  }
};

// Map Configuration Registry
const MAP_CONFIGURATIONS = new Map();
MAP_CONFIGURATIONS.set(FAN_DUNGEON_28x21_CONFIG.id, FAN_DUNGEON_28x21_CONFIG);
MAP_CONFIGURATIONS.set(HEROQUEST_CLASSIC_CONFIG.id, HEROQUEST_CLASSIC_CONFIG);
MAP_CONFIGURATIONS.set(HEROQUEST_FIRST_LIGHT_CONFIG.id, HEROQUEST_FIRST_LIGHT_CONFIG);
MAP_CONFIGURATIONS.set(FIRST_LIGHT_DUNGEON_CONFIG.id, FIRST_LIGHT_DUNGEON_CONFIG);
MAP_CONFIGURATIONS.set(MIDTERM_ELECTION_CAPITOL_CONFIG.id, MIDTERM_ELECTION_CAPITOL_CONFIG);

const PRESET_IMMUTABLE_IDS = new Set([
  FAN_DUNGEON_28x21_CONFIG.id,
  HEROQUEST_CLASSIC_CONFIG.id,
  HEROQUEST_FIRST_LIGHT_CONFIG.id
]);

function syncDynamicMapConfigurations() {
  // 1. Load any .blockmap.json files in games/tabletop-rpg/cartridges/
  try {
    if (fs.existsSync(CARTRIDGES_DIR)) {
      const files = fs.readdirSync(CARTRIDGES_DIR).filter(f => f.endsWith('.blockmap.json'));
      for (const f of files) {
        try {
          const fullPath = path.join(CARTRIDGES_DIR, f);
          const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          const slug = data.id || path.basename(f, '.blockmap.json');
          if (PRESET_IMMUTABLE_IDS.has(slug)) continue;

          const existing = MAP_CONFIGURATIONS.get(slug) || {};
          const dims = Array.isArray(data.gridDimensions) && data.gridDimensions.length === 2
            ? data.gridDimensions
            : (existing.gridDimensions || [26, 19]);
          const bgImg = data.backgroundImage || existing.backgroundImage || 'res://assets/boards/heroquest_board.png';
          const tileSize = data.calibration?.tileSize || existing.calibration?.tileSize || 39.0;

          MAP_CONFIGURATIONS.set(slug, {
            ...existing,
            id: slug,
            title: data.title || existing.title || slug,
            description: data.description || existing.description || `${data.title || slug} (${dims[0]}x${dims[1]})`,
            boardSide: data.boardSide || existing.boardSide || 'Custom',
            theme: data.theme || existing.theme || slug,
            gridDimensions: dims,
            additionalBorderTile: Boolean(data.additionalBorderTile ?? data.calibration?.additionalBorderTile ?? existing.additionalBorderTile),
            backgroundImage: bgImg,
            localImageFile: bgImg.replace(/^res:\/\//, ''),
            blockmapFile: f,
            calibration: {
              insetLeft: data.calibration?.insetLeft ?? data.calibration?.offsetX ?? existing.calibration?.insetLeft ?? 0,
              insetTop: data.calibration?.insetTop ?? data.calibration?.offsetY ?? existing.calibration?.insetTop ?? 0,
              insetRight: data.calibration?.insetRight ?? existing.calibration?.insetRight ?? 0,
              insetBottom: data.calibration?.insetBottom ?? existing.calibration?.insetBottom ?? 0,
              cellWidth: data.calibration?.cellWidth ?? tileSize,
              cellHeight: data.calibration?.cellHeight ?? tileSize,
              tileSize,
              offsetX: data.calibration?.offsetX ?? 0,
              offsetY: data.calibration?.offsetY ?? 0,
              additionalBorderTile: Boolean(data.additionalBorderTile ?? data.calibration?.additionalBorderTile)
            },
            rooms: Array.isArray(data.rooms) && data.rooms.length > 0 ? data.rooms : (existing.rooms || HEROQUEST_ROOMS),
            corridorTiles: Array.isArray(data.corridorTiles) ? data.corridorTiles : (existing.corridorTiles || []),
            doors: Array.isArray(data.doors) && data.doors.length > 0 ? data.doors : (existing.doors || HEROQUEST_STANDARD_DOORS),
            defaultStartingStair: Array.isArray(data.defaultStartingStair) ? data.defaultStartingStair : (existing.defaultStartingStair || [1, 0]),
            outerCorridor: data.outerCorridor || existing.outerCorridor || {
              top: { y: 0, fromX: 0, toX: dims[0] - 1 },
              bottom: { y: dims[1] - 1, fromX: 0, toX: dims[0] - 1 },
              left: { x: 0, fromY: 0, toY: dims[1] - 1 },
              right: { x: dims[0] - 1, fromY: 0, toY: dims[1] - 1 }
            }
          });
        } catch {}
      }
    }
  } catch {}

  // 2. Load any robos:TabletopMapConfiguration nodes from KGraph that aren't registered yet
  try {
    if (fs.existsSync(KGRAPH_TABLETOP_PATH)) {
      const kgraph = JSON.parse(fs.readFileSync(KGRAPH_TABLETOP_PATH, 'utf8'));
      const nodes = Array.isArray(kgraph['robos:nodes']) ? kgraph['robos:nodes'] : [];
      for (const n of nodes) {
        const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
        if (!types.includes('robos:TabletopMapConfiguration')) continue;
        const id = String(n['@id'] || '').split(':').pop();
        if (!id || MAP_CONFIGURATIONS.has(id)) continue;
        const dims = Array.isArray(n['robos:gridDimensions']) ? n['robos:gridDimensions'] : [26, 19];
        const bgImg = n['robos:backgroundImage'] || 'res://assets/boards/heroquest_board.png';
        MAP_CONFIGURATIONS.set(id, {
          id,
          title: n['dcterms:title'] || id,
          description: n['dcterms:description'] || `${n['dcterms:title'] || id} (${dims[0]}x${dims[1]})`,
          boardSide: n['robos:boardSide'] || 'Custom',
          theme: n['robos:theme'] || id,
          gridDimensions: dims,
          backgroundImage: bgImg,
          localImageFile: bgImg.replace(/^res:\/\//, ''),
          blockmapFile: n['robos:blockmapFile'] || `${id}.blockmap.json`,
          calibration: {
            insetLeft: 0,
            insetTop: 0,
            insetRight: 0,
            insetBottom: 0,
            cellWidth: 39.0,
            cellHeight: 39.0
          },
          rooms: HEROQUEST_ROOMS,
          doors: HEROQUEST_STANDARD_DOORS,
          defaultStartingStair: [1, 0]
        });
      }
    }
  } catch {}
}

syncDynamicMapConfigurations();

function getMapConfiguration(id) {
  syncDynamicMapConfigurations();
  if (!id) return FAN_DUNGEON_28x21_CONFIG;
  return MAP_CONFIGURATIONS.get(id) || FAN_DUNGEON_28x21_CONFIG;
}

function listMapConfigurations() {
  syncDynamicMapConfigurations();
  return Array.from(MAP_CONFIGURATIONS.values());
}

function registerMapConfiguration(config) {
  if (!config || !config.id) {
    throw new Error('Map configuration must specify an id.');
  }
  MAP_CONFIGURATIONS.set(config.id, config);
  return config;
}

module.exports = {
  FAN_DUNGEON_28x21_CONFIG,
  HEROQUEST_CLASSIC_CONFIG,
  HEROQUEST_FIRST_LIGHT_CONFIG,
  FIRST_LIGHT_DUNGEON_CONFIG,
  MIDTERM_ELECTION_CAPITOL_CONFIG,
  getMapConfiguration,
  listMapConfigurations,
  registerMapConfiguration
};


