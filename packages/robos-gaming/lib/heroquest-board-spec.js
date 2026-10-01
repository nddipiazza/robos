'use strict';

/**
 * RobOS Gaming Subsystem: HeroQuest Board Blueprint Specification
 * Exact 26x19 tile layout modeled after classic HeroQuest board dimensions.
 * Includes outer corridors, central 4x5 chamber, 4 quadrants of interconnected rooms,
 * standard wall partitions, and door socket references.
 */

const HEROQUEST_BOARD_WIDTH = 26;
const HEROQUEST_BOARD_HEIGHT = 19;

const HEROQUEST_ROOMS = [
  // Central Room
  { id: 'room-center', name: 'Central Chamber', x: 11, y: 7, w: 4, h: 5, quadrant: 'center' },

  // Northwest Quadrant
  { id: 'room-nw-1', name: 'Northwest Corner Chamber', x: 1, y: 1, w: 4, h: 4, quadrant: 'nw' },
  { id: 'room-nw-2', name: 'Upper North Hall', x: 6, y: 1, w: 4, h: 4, quadrant: 'nw' },
  { id: 'room-nw-3', name: 'West Upper Barracks', x: 1, y: 6, w: 5, h: 3, quadrant: 'nw' },
  { id: 'room-nw-4', name: 'Northwest Inner Sanctum', x: 7, y: 6, w: 3, h: 3, quadrant: 'nw' },

  // Southwest Quadrant
  { id: 'room-sw-1', name: 'West Lower Armory', x: 1, y: 10, w: 5, h: 3, quadrant: 'sw' },
  { id: 'room-sw-2', name: 'Southwest Guardpost', x: 7, y: 10, w: 3, h: 3, quadrant: 'sw' },
  { id: 'room-sw-3', name: 'Southwest Crypt', x: 1, y: 14, w: 4, h: 4, quadrant: 'sw' },
  { id: 'room-sw-4', name: 'Lower South Vault', x: 6, y: 14, w: 4, h: 4, quadrant: 'sw' },

  // Northeast Quadrant
  { id: 'room-ne-1', name: 'Northeast Inner Library', x: 16, y: 1, w: 4, h: 4, quadrant: 'ne' },
  { id: 'room-ne-2', name: 'Northeast Corner Tomb', x: 21, y: 1, w: 4, h: 4, quadrant: 'ne' },
  { id: 'room-ne-3', name: 'East Upper Crypt', x: 16, y: 6, w: 3, h: 3, quadrant: 'ne' },
  { id: 'room-ne-4', name: 'East Grand Parlor', x: 20, y: 6, w: 5, h: 3, quadrant: 'ne' },

  // Southeast Quadrant
  { id: 'room-se-1', name: 'East Lower Torture Chamber', x: 16, y: 10, w: 3, h: 3, quadrant: 'se' },
  { id: 'room-se-2', name: 'East Lower Forge', x: 20, y: 10, w: 5, h: 3, quadrant: 'se' },
  { id: 'room-se-3', name: 'Lower Southeast Laboratory', x: 16, y: 14, w: 4, h: 4, quadrant: 'se' },
  { id: 'room-se-4', name: 'Southeast Corner Lair', x: 21, y: 14, w: 4, h: 4, quadrant: 'se' }
];

const HEROQUEST_STANDARD_DOORS = [
  // Doors leading from corridors into rooms
  { id: 'door-center-n', from: [12, 6], to: [12, 7], room: 'room-center' },
  { id: 'door-center-s', from: [13, 12], to: [13, 11], room: 'room-center' },
  { id: 'door-nw-1', from: [2, 0], to: [2, 1], room: 'room-nw-1' },
  { id: 'door-nw-2', from: [8, 0], to: [8, 1], room: 'room-nw-2' },
  { id: 'door-nw-3', from: [0, 7], to: [1, 7], room: 'room-nw-3' },
  { id: 'door-sw-1', from: [0, 11], to: [1, 11], room: 'room-sw-1' },
  { id: 'door-sw-3', from: [2, 18], to: [2, 17], room: 'room-sw-3' },
  { id: 'door-ne-1', from: [18, 0], to: [18, 1], room: 'room-ne-1' },
  { id: 'door-ne-2', from: [23, 0], to: [23, 1], room: 'room-ne-2' },
  { id: 'door-ne-4', from: [25, 7], to: [24, 7], room: 'room-ne-4' },
  { id: 'door-se-2', from: [25, 11], to: [24, 11], room: 'room-se-2' },
  { id: 'door-se-4', from: [23, 18], to: [23, 17], room: 'room-se-4' }
];

function buildHeroQuestGrid(BoardGridClass) {
  const grid = new BoardGridClass(HEROQUEST_BOARD_WIDTH, HEROQUEST_BOARD_HEIGHT);

  // Add perimeter walls around entire board boundary
  // Top and bottom borders
  for (let x = 0; x < HEROQUEST_BOARD_WIDTH; x++) {
    grid.addWall(x, 0, x, -1);
    grid.addWall(x, HEROQUEST_BOARD_HEIGHT - 1, x, HEROQUEST_BOARD_HEIGHT);
  }
  // Left and right borders
  for (let y = 0; y < HEROQUEST_BOARD_HEIGHT; y++) {
    grid.addWall(0, y, -1, y);
    grid.addWall(HEROQUEST_BOARD_WIDTH - 1, y, HEROQUEST_BOARD_WIDTH, y);
  }

  // Add room bounding walls
  for (const r of HEROQUEST_ROOMS) {
    const rx2 = r.x + r.w;
    const ry2 = r.y + r.h;

    // Top and bottom walls of room
    for (let x = r.x; x < rx2; x++) {
      grid.addWall(x, r.y - 1, x, r.y);
      grid.addWall(x, ry2 - 1, x, ry2);
    }
    // Left and right walls of room
    for (let y = r.y; y < ry2; y++) {
      grid.addWall(r.x - 1, y, r.x, y);
      grid.addWall(rx2 - 1, y, rx2, y);
    }
  }

  // Register doors
  for (const d of HEROQUEST_STANDARD_DOORS) {
    grid.addDoor(d.from[0], d.from[1], d.to[0], d.to[1], { isOpen: false });
  }

  return grid;
}

module.exports = {
  HEROQUEST_BOARD_WIDTH,
  HEROQUEST_BOARD_HEIGHT,
  HEROQUEST_ROOMS,
  HEROQUEST_STANDARD_DOORS,
  buildHeroQuestGrid
};
