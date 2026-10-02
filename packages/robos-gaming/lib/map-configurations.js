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
const MAP_CONFIGURATIONS = new Map();
MAP_CONFIGURATIONS.set(HEROQUEST_CLASSIC_CONFIG.id, HEROQUEST_CLASSIC_CONFIG);
MAP_CONFIGURATIONS.set(HEROQUEST_FIRST_LIGHT_CONFIG.id, HEROQUEST_FIRST_LIGHT_CONFIG);

function getMapConfiguration(id) {
  if (!id) return HEROQUEST_CLASSIC_CONFIG;
  return MAP_CONFIGURATIONS.get(id) || HEROQUEST_CLASSIC_CONFIG;
}

function listMapConfigurations() {
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
  HEROQUEST_CLASSIC_CONFIG,
  HEROQUEST_FIRST_LIGHT_CONFIG,
  getMapConfiguration,
  listMapConfigurations,
  registerMapConfiguration
};
