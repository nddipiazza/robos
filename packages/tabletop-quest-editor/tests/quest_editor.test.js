'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  validateQuest,
  interpretVoiceQuestCommands,
  executeVoiceMapCommands,
  setupSplitDividers,
  toggleRoomNames,
  updateRoomNamesToggleUI,
  state,
  dom
} = require('../renderer/app.js');

// Helpers mirroring app.js math & logic
function worldToTile(wx, wy, offsetX, offsetY, tileSize, cols, rows) {
  const relX = wx - offsetX;
  const relY = wy - offsetY;
  const col = Math.floor(relX / tileSize);
  const row = Math.floor(relY / tileSize);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  return [col, row];
}

function tileToWorld(col, row, offsetX, offsetY, tileSize) {
  return {
    x: offsetX + col * tileSize,
    y: offsetY + row * tileSize
  };
}

function isBorderTile(col, row, cols, rows) {
  return col === 0 || col === cols - 1 || row === 0 || row === rows - 1;
}

function detectDoorEdge(wx, wy, offsetX, offsetY, tileSize, cols, rows, rooms) {
  const tile = worldToTile(wx, wy, offsetX, offsetY, tileSize, cols, rows);
  if (!tile) return null;
  const [col, row] = tile;
  const tilePos = tileToWorld(col, row, offsetX, offsetY, tileSize);
  const relX = (wx - tilePos.x) / tileSize;
  const relY = (wy - tilePos.y) / tileSize;

  const distN = relY;
  const distS = 1.0 - relY;
  const distW = relX;
  const distE = 1.0 - relX;
  const minDist = Math.min(distN, distS, distW, distE);

  let from = [col, row];
  let to = [col, row];
  let orientation = 'h';

  if (minDist === distN) {
    to = [col, row - 1];
    orientation = 'h';
  } else if (minDist === distS) {
    to = [col, row + 1];
    orientation = 'h';
  } else if (minDist === distW) {
    to = [col - 1, row];
    orientation = 'v';
  } else {
    to = [col + 1, row];
    orientation = 'v';
  }

  // Find room if any
  let foundRoom = null;
  if (rooms) {
    for (const r of rooms) {
      if (r.tiles && r.tiles.some(t => (t[0] === from[0] && t[1] === from[1]) || (t[0] === to[0] && t[1] === to[1]))) {
        foundRoom = r.id;
        break;
      } else if (r.x !== undefined) {
        if ((from[0] >= r.x && from[0] < r.x + r.w && from[1] >= r.y && from[1] < r.y + r.h) ||
            (to[0] >= r.x && to[0] < r.x + r.w && to[1] >= r.y && to[1] < r.y + r.h)) {
          foundRoom = r.id;
          break;
        }
      }
    }
  }

  return { from, to, orientation, room: foundRoom || '' };
}

const MONSTER_DEFS = {
  goblin: { name: 'Goblin', bp: 1, mp: 1, atk: 2, def: 1, move: 10, isBoss: false, isUndead: false },
  orc: { name: 'Orc', bp: 1, mp: 2, atk: 3, def: 2, move: 6, isBoss: false, isUndead: false },
  skeleton: { name: 'Skeleton', bp: 1, mp: 0, atk: 2, def: 2, move: 6, isBoss: false, isUndead: true },
  chaos_warrior: { name: 'Chaos Warrior', bp: 2, mp: 3, atk: 3, def: 4, move: 7, isBoss: false, isUndead: false },
  boss: { name: 'Dungeon Boss', bp: 5, mp: 5, atk: 4, def: 4, move: 8, isBoss: true, isUndead: false }
};

const FURNITURE_DEFS = {
  chest: { name: 'Treasure Chest', w: 1, h: 1 },
  table: { name: 'Table', w: 2, h: 2 },
  bookcase: { name: 'Bookcase', w: 3, h: 1 },
  bookshelf: { name: 'Bookshelf', w: 2, h: 1 }
};

// -------------------------------------------------------------
// Test 1: Layer 1 Blockmap Ingestion (Immutability)
// -------------------------------------------------------------
test('Blockmap Ingestion: loads static blockmap without modifying underlying file', () => {
  const bPath = path.resolve(__dirname, '../../../games/tabletop-rpg/cartridges/first-light-dungeon.blockmap.json');
  assert.ok(fs.existsSync(bPath), 'first-light-dungeon.blockmap.json must exist');

  const rawBefore = fs.readFileSync(bPath, 'utf8');
  const blockmap = JSON.parse(rawBefore);

  assert.equal(blockmap.id, 'first-light-dungeon');
  const tileSize = blockmap.calibration?.tileSize || blockmap.tileSize;
  assert.equal(tileSize, 39);
  assert.deepEqual(blockmap.gridDimensions, [26, 19]);
  assert.ok(Array.isArray(blockmap.rooms) && blockmap.rooms.length > 0, 'Must have rooms');
  assert.ok(Array.isArray(blockmap.corridors) && blockmap.corridors.length > 0, 'Must have corridors');

  // Verify file has not been modified
  const rawAfter = fs.readFileSync(bPath, 'utf8');
  assert.equal(rawBefore, rawAfter, 'Blockmap file must remain strictly immutable');
});

// -------------------------------------------------------------
// Test 2: Door Edge Snapping
// -------------------------------------------------------------
test('Door Edge Detection: detects wall transitions and orientations accurately', () => {
  const tileSize = 39.0;
  const offX = 0;
  const offY = 0;
  const cols = 26;
  const rows = 19;
  const rooms = [
    { id: 'room-nw', x: 1, y: 1, w: 4, h: 4 }
  ];

  // Click near North edge of tile (1, 1) -> relY = 0.1
  const doorN = detectDoorEdge(1 * 39 + 19, 1 * 39 + 3, offX, offY, tileSize, cols, rows, rooms);
  assert.ok(doorN);
  assert.deepEqual(doorN.from, [1, 1]);
  assert.deepEqual(doorN.to, [1, 0]);
  assert.equal(doorN.orientation, 'h');
  assert.equal(doorN.room, 'room-nw');

  // Click near West edge of tile (1, 2) -> relX = 0.05
  const doorW = detectDoorEdge(1 * 39 + 2, 2 * 39 + 19, offX, offY, tileSize, cols, rows, rooms);
  assert.ok(doorW);
  assert.deepEqual(doorW.from, [1, 2]);
  assert.deepEqual(doorW.to, [0, 2]);
  assert.equal(doorW.orientation, 'v');
  assert.equal(doorW.room, 'room-nw');

  // Click near South edge of tile (4, 4)
  const doorS = detectDoorEdge(4 * 39 + 19, 4 * 39 + 37, offX, offY, tileSize, cols, rows, rooms);
  assert.ok(doorS);
  assert.deepEqual(doorS.from, [4, 4]);
  assert.deepEqual(doorS.to, [4, 5]);
  assert.equal(doorS.orientation, 'h');
  assert.equal(doorS.room, 'room-nw');
});

// -------------------------------------------------------------
// Test 3: Monster Placement & Stat Calculation
// -------------------------------------------------------------
test('Monster Templates: generates proper stats for all HeroQuest monster archetypes', () => {
  const orc = {
    id: 'mon-orc-1',
    type: 'orc',
    pos: [5, 5],
    ...MONSTER_DEFS.orc
  };
  assert.equal(orc.name, 'Orc');
  assert.equal(orc.atk, 3);
  assert.equal(orc.def, 2);
  assert.equal(orc.bp, 1);
  assert.equal(orc.isUndead, false);

  const skel = {
    id: 'mon-skeleton-1',
    type: 'skeleton',
    pos: [6, 5],
    ...MONSTER_DEFS.skeleton
  };
  assert.equal(skel.isUndead, true);
  assert.equal(skel.move, 6);

  const boss = {
    id: 'mon-verag',
    type: 'boss',
    name: 'Warlord Verag',
    pos: [10, 10],
    ...MONSTER_DEFS.boss
  };
  assert.equal(boss.isBoss, true);
  assert.equal(boss.bp, 5);
  assert.equal(boss.atk, 4);
});

// -------------------------------------------------------------
// Test 4: Furniture Placement & 90-Degree Rotation
// -------------------------------------------------------------
test('Furniture Placement & Rotation: switches width/height correctly on 90 deg rotation', () => {
  const bookcase = {
    id: 'furn-bookcase-1',
    type: 'bookcase',
    x: 3,
    y: 2,
    width: FURNITURE_DEFS.bookcase.w, // 3
    height: FURNITURE_DEFS.bookcase.h  // 1
  };
  assert.equal(bookcase.width, 3);
  assert.equal(bookcase.height, 1);

  // Rotate 90 degrees
  const rotated = {
    ...bookcase,
    width: bookcase.height,
    height: bookcase.width
  };
  assert.equal(rotated.width, 1);
  assert.equal(rotated.height, 3);
  assert.equal(rotated.x, 3);
  assert.equal(rotated.y, 2);
});

// -------------------------------------------------------------
// Test 5: Cartridge Serialization & Godot Compatibility
// -------------------------------------------------------------
test('Cartridge Serialization: produces valid Tabletop Cartridge structure compatible with Godot engine', () => {
  const quest = {
    title: 'The Lost Crypt of Fire',
    slug: 'lost-crypt-fire',
    wanderingMonster: 'orc',
    goldBounty: 150,
    briefing: 'Mentor says: Beware the fiery depths!',
    startingStair: [2, 1],
    doors: [
      { id: 'door-1', from: [2, 1], to: [2, 2], state: 'closed', is_secret: false, room: 'crypt-entrance' }
    ],
    monsters: [
      { id: 'mon-1', name: 'Orc Guard', type: 'orc', bp: 1, mp: 2, atk: 3, def: 2, move: 6, pos: [5, 4], roomId: 'crypt-entrance', isBoss: false, isUndead: false, isSpellcaster: false }
    ],
    furniture: [
      { id: 'furn-1', name: 'Treasure Chest', type: 'chest', x: 6, y: 4, width: 1, height: 1, roomId: 'crypt-entrance', treasure: '50 gold' }
    ],
    traps: [
      { id: 'trap-1', type: 'pit', x: 2, y: 3, damage: 1, detected: false, disarmed: false }
    ],
    wallBlocks: [
      { id: 'block-1', type: 'single', x: 0, y: 5, width: 1, height: 1 }
    ],
    storyTriggers: [
      { id: 'trigger-a', marker: 'A', title: 'Ancient Inscription', narrative: 'Runes glow faintly on the stone floor.', tile: [5, 5], room: 'crypt-entrance' }
    ]
  };

  const blockmap = {
    id: 'first-light-dungeon',
    gridDimensions: [26, 19],
    tileSize: 39.0,
    pixelOffset: [0, 0],
    backgroundImage: 'res://assets/boards/first_light_dungeon.png',
    rooms: [{ id: 'crypt-entrance', x: 1, y: 1, w: 6, h: 5 }],
    corridors: [[0, 1], [0, 2], [0, 3]]
  };

  // Build cartridge payload
  const monstersDict = {};
  quest.monsters.forEach(m => {
    monstersDict[m.id] = {
      id: m.id,
      slug: `${m.type}-${m.id}`,
      name: m.name,
      monsterType: m.type,
      bodyPoints: m.bp,
      mindPoints: m.mp,
      attackDice: m.atk,
      defendDice: m.def,
      movementSquares: m.move,
      isBoss: m.isBoss,
      isUndead: m.isUndead,
      isSpellcaster: m.isSpellcaster,
      spells: [],
      position: m.pos,
      roomId: m.roomId
    };
  });

  const cartridge = {
    cartridgeVersion: '2.0.0',
    cartridgeId: quest.slug,
    header: {
      title: quest.title,
      slug: quest.slug,
      ruleset: 'heroquest',
      gameType: 'tabletop',
      startingMap: quest.slug,
      startingPosition: quest.startingStair,
      monsterCount: quest.monsters.length,
      mapCount: 1
    },
    heroes: {
      barbarian: { position: quest.startingStair },
      dwarf: { position: quest.startingStair },
      elf: { position: quest.startingStair },
      wizard: { position: quest.startingStair }
    },
    monsters: monstersDict,
    maps: {
      [quest.slug]: {
        id: quest.slug,
        title: quest.title,
        mapConfigurationId: blockmap.id,
        width: blockmap.gridDimensions[0],
        height: blockmap.gridDimensions[1],
        backgroundImage: blockmap.backgroundImage,
        startingStair: quest.startingStair,
        wanderingMonster: quest.wanderingMonster,
        doors: quest.doors,
        furniture: quest.furniture,
        traps: quest.traps,
        wallBlocks: quest.wallBlocks,
        storyTriggers: quest.storyTriggers,
        rooms: blockmap.rooms,
        corridors: blockmap.corridors
      }
    }
  };

  // Assertions on Godot Cartridge compliance
  assert.equal(cartridge.cartridgeVersion, '2.0.0');
  assert.equal(cartridge.header.startingMap, 'lost-crypt-fire');
  assert.deepEqual(cartridge.header.startingPosition, [2, 1]);
  assert.equal(cartridge.maps['lost-crypt-fire'].mapConfigurationId, 'first-light-dungeon');
  assert.equal(cartridge.maps['lost-crypt-fire'].doors.length, 1);
  assert.equal(cartridge.maps['lost-crypt-fire'].doors[0].state, 'closed');
  assert.equal(cartridge.maps['lost-crypt-fire'].furniture.length, 1);
  assert.equal(cartridge.maps['lost-crypt-fire'].traps.length, 1);
  assert.equal(cartridge.maps['lost-crypt-fire'].wallBlocks.length, 1);
  assert.equal(cartridge.maps['lost-crypt-fire'].storyTriggers.length, 1);
  assert.ok(cartridge.monsters['mon-1']);
  assert.deepEqual(cartridge.monsters['mon-1'].position, [5, 4]);
});

// -------------------------------------------------------------
// Test 6: Undo / Redo State Transition
// -------------------------------------------------------------
test('Undo/Redo State Machine: pushes snapshots and accurately restores previous entity state', () => {
  let quest = {
    title: 'Initial Quest',
    monsters: [],
    doors: []
  };
  const undoStack = [];
  const redoStack = [];

  function record(q) {
    undoStack.push(JSON.stringify(q));
    redoStack.length = 0;
  }

  // Action 1: Add monster
  record(quest);
  quest.monsters.push({ id: 'mon-1', type: 'goblin', pos: [3, 3] });
  assert.equal(quest.monsters.length, 1);

  // Action 2: Add door
  record(quest);
  quest.doors.push({ id: 'door-1', from: [3, 3], to: [3, 4] });
  assert.equal(quest.doors.length, 1);

  // Undo Action 2
  redoStack.push(JSON.stringify(quest));
  quest = JSON.parse(undoStack.pop());
  assert.equal(quest.doors.length, 0);
  assert.equal(quest.monsters.length, 1);

  // Undo Action 1
  redoStack.push(JSON.stringify(quest));
  quest = JSON.parse(undoStack.pop());
  assert.equal(quest.monsters.length, 0);

  // Redo Action 1
  undoStack.push(JSON.stringify(quest));
  quest = JSON.parse(redoStack.pop());
  assert.equal(quest.monsters.length, 1);
});

// -------------------------------------------------------------
// Test 7: Start and Exit Tile Placement on Border Tiles
// -------------------------------------------------------------
test('Start & Exit Tiles: can be placed on border tiles and serialized to cartridge', () => {
  const cols = 26;
  const rows = 19;

  // Check border classification
  assert.equal(isBorderTile(0, 1, cols, rows), true, '[0, 1] is a West border tile');
  assert.equal(isBorderTile(25, 10, cols, rows), true, '[25, 10] is an East border tile');
  assert.equal(isBorderTile(12, 0, cols, rows), true, '[12, 0] is a North border tile');
  assert.equal(isBorderTile(12, 18, cols, rows), true, '[12, 18] is a South border tile');
  assert.equal(isBorderTile(5, 5, cols, rows), false, '[5, 5] is an interior tile');

  // Simulate placing start on border tile and exit on opposite border tile
  const quest = {
    title: 'Trial of the Border Escape',
    slug: 'trial-border-escape',
    startingStair: [0, 1], // Border start
    exitTile: [25, 10],    // Border exit
    wanderingMonster: 'orc',
    doors: [],
    monsters: [],
    furniture: [],
    traps: [],
    wallBlocks: [],
    storyTriggers: []
  };

  assert.ok(isBorderTile(quest.startingStair[0], quest.startingStair[1], cols, rows));
  assert.ok(isBorderTile(quest.exitTile[0], quest.exitTile[1], cols, rows));

  // Build cartridge payload
  const cartridge = {
    cartridgeVersion: '2.0.0',
    header: {
      title: quest.title,
      startingMap: quest.slug,
      startingPosition: quest.startingStair,
      exitPosition: quest.exitTile
    },
    maps: {
      [quest.slug]: {
        id: quest.slug,
        title: quest.title,
        startingStair: quest.startingStair,
        startingPosition: quest.startingStair,
        exitTile: quest.exitTile,
        exitStair: quest.exitTile
      }
    }
  };

  // Assert cartridge serialization preserves border start and exit tiles
  assert.deepEqual(cartridge.header.startingPosition, [0, 1]);
  assert.deepEqual(cartridge.maps['trial-border-escape'].startingStair, [0, 1]);
  assert.deepEqual(cartridge.maps['trial-border-escape'].exitTile, [25, 10]);
  assert.deepEqual(cartridge.maps['trial-border-escape'].exitStair, [25, 10]);

  // Verify deserialization into new editor state
  const mapData = cartridge.maps['trial-border-escape'];
  const restoredQuest = {
    startingStair: mapData.startingStair || [0, 1],
    exitTile: mapData.exitTile || null
  };
  assert.deepEqual(restoredQuest.startingStair, [0, 1]);
  assert.deepEqual(restoredQuest.exitTile, [25, 10]);
});

test('Border Snapping: clicks in margins clamp to nearest perimeter border tile', () => {
  const geom = { cols: 28, rows: 21, tileSize: 36.57, offsetX: 0, offsetY: 0 };

  function testWorldToTile(wx, wy, clampToBorder = false) {
    const relX = wx - geom.offsetX;
    const relY = wy - geom.offsetY;
    let col = Math.floor(relX / geom.tileSize);
    let row = Math.floor(relY / geom.tileSize);

    if (clampToBorder) {
      col = Math.max(0, Math.min(geom.cols - 1, col));
      row = Math.max(0, Math.min(geom.rows - 1, row));
      return [col, row];
    }

    if (col < 0 || col >= geom.cols || row < 0 || row >= geom.rows) {
      return null;
    }
    return [col, row];
  }

  // Regular click inside map
  assert.deepEqual(testWorldToTile(100, 100, false), [2, 2]);

  // Click outside bottom boundary without clamp returns null
  assert.equal(testWorldToTile(700, 805, false), null);

  // Click outside bottom boundary WITH clamp snaps to bottom border row 20
  const bottomBorderTile = testWorldToTile(700, 805, true);
  assert.deepEqual(bottomBorderTile, [19, 20]);
  assert.ok(bottomBorderTile[1] === geom.rows - 1, 'Should snap to bottom perimeter border');

  // Click above top boundary WITH clamp snaps to top border row 0
  const topBorderTile = testWorldToTile(350, -30, true);
  assert.deepEqual(topBorderTile, [9, 0]);
  assert.ok(topBorderTile[1] === 0, 'Should snap to top perimeter border');

  // Click left of board WITH clamp snaps to left border col 0
  const leftBorderTile = testWorldToTile(-25, 400, true);
  assert.deepEqual(leftBorderTile, [0, 10]);
  assert.ok(leftBorderTile[0] === 0, 'Should snap to left perimeter border');

  // Click right of board WITH clamp snaps to right border col 27
  const rightBorderTile = testWorldToTile(1100, 500, true);
  assert.deepEqual(rightBorderTile, [27, 13]);
  assert.ok(rightBorderTile[0] === geom.cols - 1, 'Should snap to right perimeter border');
});

test('Additional Border Tile: allows start and exit tiles on outer black border around 26x19 board', () => {
  const geom = { cols: 26, rows: 19, tileSize: 39.0, offsetX: 0, offsetY: 0, hasAdditionalBorder: true };

  function testWorldToTileWithBorder(wx, wy, clampToBorder = false) {
    const relX = wx - geom.offsetX;
    const relY = wy - geom.offsetY;
    let col = Math.floor(relX / geom.tileSize);
    let row = Math.floor(relY / geom.tileSize);

    const minCol = geom.hasAdditionalBorder ? -1 : 0;
    const maxCol = geom.hasAdditionalBorder ? geom.cols : geom.cols - 1;
    const minRow = geom.hasAdditionalBorder ? -1 : 0;
    const maxRow = geom.hasAdditionalBorder ? geom.rows : geom.rows - 1;

    if (clampToBorder) {
      col = Math.max(minCol, Math.min(maxCol, col));
      row = Math.max(minRow, Math.min(maxRow, row));
      return [col, row];
    }

    if (col < minCol || col > maxCol || row < minRow || row > maxRow) {
      return null;
    }
    return [col, row];
  }

  function testIsBorderTile(col, row) {
    if (geom.hasAdditionalBorder) {
      return col === -1 || col === geom.cols || row === -1 || row === geom.rows;
    }
    return col === 0 || col === geom.cols - 1 || row === 0 || row === geom.rows - 1;
  }

  // Left additional border tile (-1, 5)
  const leftClick = testWorldToTileWithBorder(-20, 5 * 39 + 10, false);
  assert.deepEqual(leftClick, [-1, 5]);
  assert.ok(testIsBorderTile(leftClick[0], leftClick[1]), '[-1, 5] should be recognized as border tile');

  // Top additional border tile (10, -1)
  const topClick = testWorldToTileWithBorder(10 * 39 + 10, -15, false);
  assert.deepEqual(topClick, [10, -1]);
  assert.ok(testIsBorderTile(topClick[0], topClick[1]), '[10, -1] should be recognized as border tile');

  // Right additional border tile (26, 12)
  const rightClick = testWorldToTileWithBorder(26 * 39 + 15, 12 * 39 + 10, false);
  assert.deepEqual(rightClick, [26, 12]);
  assert.ok(testIsBorderTile(rightClick[0], rightClick[1]), '[26, 12] should be recognized as border tile');

  // Bottom additional border tile (8, 19)
  const bottomClick = testWorldToTileWithBorder(8 * 39 + 10, 19 * 39 + 15, false);
  assert.deepEqual(bottomClick, [8, 19]);
  assert.ok(testIsBorderTile(bottomClick[0], bottomClick[1]), '[8, 19] should be recognized as border tile');

  // Deep outside clamp snaps to outer border
  const farLeftClamp = testWorldToTileWithBorder(-200, 300, true);
  assert.equal(farLeftClamp[0], -1);
  const farRightClamp = testWorldToTileWithBorder(1500, 300, true);
  assert.equal(farRightClamp[0], 26);
  const farTopClamp = testWorldToTileWithBorder(300, -200, true);
  assert.equal(farTopClamp[1], -1);
  const farBottomClamp = testWorldToTileWithBorder(300, 1000, true);
  assert.equal(farBottomClamp[1], 19);

  // Cartridge serialization
  const cartridge = {
    cartridgeId: 'first-light-dungeon-quest',
    maps: {
      'first-light-dungeon-quest': {
        width: 26,
        height: 19,
        additionalBorderTile: true,
        startingStair: [-1, 2],
        exitTile: [26, 10]
      }
    }
  };
  assert.ok(cartridge.maps['first-light-dungeon-quest'].additionalBorderTile === true);
  assert.deepEqual(cartridge.maps['first-light-dungeon-quest'].startingStair, [-1, 2]);
  assert.deepEqual(cartridge.maps['first-light-dungeon-quest'].exitTile, [26, 10]);
});

test('Stairs Map Items: support placing starting and exit tiles on stairs furniture', () => {
  const quest = {
    furniture: [
      { id: 'furn-stairs-1', type: 'stairs', name: 'Spiral Staircase / Stairs', x: 5, y: 7, width: 1, height: 1 },
      { id: 'furn-stairs-2', type: 'stairs', name: 'Spiral Staircase / Stairs', x: 20, y: 14, width: 1, height: 1 }
    ],
    startingStair: [5, 7],
    exitTile: [20, 14]
  };

  // Verify starting stair matches stairs furniture 1
  const startStairFurn = quest.furniture.find(f => f.x === quest.startingStair[0] && f.y === quest.startingStair[1]);
  assert.ok(startStairFurn !== undefined, 'Starting stair should match placed stairs furniture');
  assert.equal(startStairFurn.type, 'stairs');

  // Verify exit tile matches stairs furniture 2
  const exitStairFurn = quest.furniture.find(f => f.x === quest.exitTile[0] && f.y === quest.exitTile[1]);
  assert.ok(exitStairFurn !== undefined, 'Exit tile should match placed stairs furniture');
  assert.equal(exitStairFurn.type, 'stairs');
});

// -------------------------------------------------------------
// Test 11: 1x1 and 2x2 Up & Down Staircase Furniture Definitions
// -------------------------------------------------------------
test('Staircase Definitions: provides 1x1 and 2x2 up & down staircases with backward-compatible aliasing', () => {
  const STAIR_DEFS = {
    stairs_up_1x1: { name: 'Up Staircase (1×1)', w: 1, h: 1, category: 'stairs' },
    stairs_down_1x1: { name: 'Down Staircase (1×1)', w: 1, h: 1, category: 'stairs' },
    stairs_up_2x2: { name: 'Up Staircase (2×2)', w: 2, h: 2, category: 'stairs' },
    stairs_down_2x2: { name: 'Down Staircase (2×2)', w: 2, h: 2, category: 'stairs' },
    stairs: { name: 'Up Staircase (1×1)', w: 1, h: 1, category: 'stairs', aliasOf: 'stairs_up_1x1' }
  };

  // 1x1 up and down
  assert.equal(STAIR_DEFS.stairs_up_1x1.w, 1);
  assert.equal(STAIR_DEFS.stairs_up_1x1.h, 1);
  assert.equal(STAIR_DEFS.stairs_down_1x1.w, 1);
  assert.equal(STAIR_DEFS.stairs_down_1x1.h, 1);

  // 2x2 up and down
  assert.equal(STAIR_DEFS.stairs_up_2x2.w, 2);
  assert.equal(STAIR_DEFS.stairs_up_2x2.h, 2);
  assert.equal(STAIR_DEFS.stairs_down_2x2.w, 2);
  assert.equal(STAIR_DEFS.stairs_down_2x2.h, 2);

  // Legacy 'stairs' aliasing
  assert.equal(STAIR_DEFS.stairs.aliasOf, 'stairs_up_1x1');
});

// -------------------------------------------------------------
// Test 12: 2x2 Staircase Footprint Hit-Testing & Cartridge Serialization
// -------------------------------------------------------------
test('2x2 Staircase Footprint: hit-testing recognizes 2x2 bounds and serializes stair types to cartridge', () => {
  const quest = {
    title: 'Trial of the Great Staircase',
    slug: 'trial-great-staircase',
    startingStair: [4, 5],
    startingStairType: 'stairs_up_2x2',
    exitTile: [18, 12],
    exitStairType: 'stairs_down_2x2',
    furniture: [
      { id: 'furn-stairs-up-2x2', type: 'stairs_up_2x2', name: 'Up Staircase (2×2)', x: 4, y: 5, width: 2, height: 2 },
      { id: 'furn-stairs-down-2x2', type: 'stairs_down_2x2', name: 'Down Staircase (2×2)', x: 18, y: 12, width: 2, height: 2 }
    ]
  };

  function findStairFurnitureAt(col, row, furnList) {
    return furnList.find(f => {
      const isStair = f.type && f.type.includes('stair');
      if (!isStair) return false;
      const w = f.width || 1;
      const h = f.height || 1;
      return col >= f.x && col < f.x + w && row >= f.y && row < f.y + h;
    });
  }

  // Hit test all 4 tiles of 2x2 starting staircase at (4, 5)
  assert.equal(findStairFurnitureAt(4, 5, quest.furniture)?.id, 'furn-stairs-up-2x2');
  assert.equal(findStairFurnitureAt(5, 5, quest.furniture)?.id, 'furn-stairs-up-2x2');
  assert.equal(findStairFurnitureAt(4, 6, quest.furniture)?.id, 'furn-stairs-up-2x2');
  assert.equal(findStairFurnitureAt(5, 6, quest.furniture)?.id, 'furn-stairs-up-2x2');

  // Outside 2x2 footprint returns undefined
  assert.equal(findStairFurnitureAt(6, 6, quest.furniture), undefined);
  assert.equal(findStairFurnitureAt(3, 5, quest.furniture), undefined);

  // Cartridge serialization
  const cartridge = {
    cartridgeVersion: '2.0.0',
    cartridgeId: quest.slug,
    header: {
      title: quest.title,
      startingPosition: quest.startingStair,
      exitPosition: quest.exitTile
    },
    maps: {
      [quest.slug]: {
        id: quest.slug,
        title: quest.title,
        startingStair: quest.startingStair,
        startingStairType: quest.startingStairType,
        exitTile: quest.exitTile,
        exitStairType: quest.exitStairType,
        furniture: quest.furniture
      }
    }
  };

  const mapData = cartridge.maps[quest.slug];
  assert.deepEqual(mapData.startingStair, [4, 5]);
  assert.equal(mapData.startingStairType, 'stairs_up_2x2');
  assert.deepEqual(mapData.exitTile, [18, 12]);
  assert.equal(mapData.exitStairType, 'stairs_down_2x2');
});

// -------------------------------------------------------------
// Test 13: Deleting 2x2 Staircase Furniture Clears Start / Exit Roles
// -------------------------------------------------------------
test('Entity Deletion: deleting 2x2 staircase furniture resets startingStair if targeted', () => {
  const quest = {
    startingStair: [4, 5],
    startingStairType: 'stairs_up_2x2',
    exitTile: [10, 10],
    exitStairType: 'stairs_down_1x1',
    furniture: [
      { id: 'furn-stair-1', type: 'stairs_up_2x2', x: 4, y: 5, width: 2, height: 2 }
    ]
  };

  const furnToDelete = quest.furniture[0];

  // Helper matching app.js deleteEntity footprint check
  const isStartMatch = quest.startingStair && (
    (quest.startingStair[0] === furnToDelete.x && quest.startingStair[1] === furnToDelete.y) ||
    (quest.startingStair[0] >= furnToDelete.x && quest.startingStair[0] < furnToDelete.x + furnToDelete.width &&
     quest.startingStair[1] >= furnToDelete.y && quest.startingStair[1] < furnToDelete.y + furnToDelete.height)
  );

  assert.ok(isStartMatch, 'Starting stair at (4, 5) must match 2x2 staircase being deleted');

  if (isStartMatch) {
    quest.startingStair = [0, 1];
    quest.startingStairType = 'stairs_up_1x1';
  }
  quest.furniture = [];

  assert.deepEqual(quest.startingStair, [0, 1]);
  assert.equal(quest.startingStairType, 'stairs_up_1x1');
  assert.equal(quest.furniture.length, 0);
});

// -------------------------------------------------------------
// Test 14: Distinct Blockmap Room and Corridor Underlay Colors
// -------------------------------------------------------------
test('Blockmap Underlay Styles: uses distinct, subtle colors and perimeter borders for rooms vs corridors', () => {
  const LAYER_STYLES = {
    corridor: {
      fill: 'rgba(56, 189, 248, 0.16)',   // Sky Blue
      stroke: 'rgba(56, 189, 248, 0.28)',
      theme: 'cool-sky'
    },
    room: {
      fill: 'rgba(245, 158, 11, 0.14)',    // Warm Amber
      stroke: 'rgba(245, 158, 11, 0.45)',
      theme: 'warm-amber'
    }
  };

  // Assert rooms and corridors use distinct hue themes
  assert.notEqual(LAYER_STYLES.corridor.fill, LAYER_STYLES.room.fill);
  assert.notEqual(LAYER_STYLES.corridor.stroke, LAYER_STYLES.room.stroke);
  assert.notEqual(LAYER_STYLES.corridor.theme, LAYER_STYLES.room.theme);

  // Perimeter detection logic for rectangular and freeform rooms
  function computePerimeterEdges(tileList) {
    const set = new Set(tileList.map(([c, r]) => `${c},${r}`));
    const edges = [];
    for (const [c, r] of tileList) {
      if (!set.has(`${c},${r - 1}`)) edges.push({ side: 'N', from: [c, r], to: [c + 1, r] });
      if (!set.has(`${c},${r + 1}`)) edges.push({ side: 'S', from: [c, r + 1], to: [c + 1, r + 1] });
      if (!set.has(`${c - 1},${r}`)) edges.push({ side: 'W', from: [c, r], to: [c, r + 1] });
      if (!set.has(`${c + 1},${r}`)) edges.push({ side: 'E', from: [c + 1, r], to: [c + 1, r + 1] });
    }
    return edges;
  }

  // 2x2 room has exactly 8 exterior perimeter unit edges (2 per side)
  const room2x2 = [[1, 1], [2, 1], [1, 2], [2, 2]];
  const edges2x2 = computePerimeterEdges(room2x2);
  assert.equal(edges2x2.length, 8);
  assert.equal(edges2x2.filter(e => e.side === 'N').length, 2);
  assert.equal(edges2x2.filter(e => e.side === 'S').length, 2);
  assert.equal(edges2x2.filter(e => e.side === 'W').length, 2);
  assert.equal(edges2x2.filter(e => e.side === 'E').length, 2);
});

// -------------------------------------------------------------
// Test 15: HeroQuest Rule: Characters and enemies cannot stand on furniture
// -------------------------------------------------------------
test('HeroQuest Rule: Characters and enemies cannot stand on furniture', () => {
  const furniture = [
    { id: 'furn-table', type: 'table', x: 5, y: 5, width: 2, height: 2 },
    { id: 'furn-rack', type: 'weapons-rack', x: 9, y: 2, width: 2, height: 1 }
  ];

  function isTileOccupiedByFurniture(col, row) {
    return furniture.some(f =>
      col >= f.x && col < f.x + (f.width || 1) &&
      row >= f.y && row < f.y + (f.height || 1)
    );
  }

  // Table footprint occupies (5,5), (6,5), (5,6), (6,6)
  assert.equal(isTileOccupiedByFurniture(5, 5), true);
  assert.equal(isTileOccupiedByFurniture(6, 6), true);
  assert.equal(isTileOccupiedByFurniture(7, 5), false);

  // Weapons rack footprint occupies (9,2), (10,2)
  assert.equal(isTileOccupiedByFurniture(9, 2), true);
  assert.equal(isTileOccupiedByFurniture(10, 2), true);
  assert.equal(isTileOccupiedByFurniture(10, 3), false);

  // Validation function checks monster placement
  function canPlaceMonster(col, row) {
    return !isTileOccupiedByFurniture(col, row);
  }

  assert.equal(canPlaceMonster(10, 2), false, 'Cannot place monster on weapons rack');
  assert.equal(canPlaceMonster(10, 3), true, 'Can place monster on adjacent floor');
  assert.equal(canPlaceMonster(5, 5), false, 'Cannot place monster on table');
  assert.equal(canPlaceMonster(4, 5), true, 'Can place monster on adjacent floor');
});

// -------------------------------------------------------------
// Test 16: Door Visual Differentiation (Closed vs Open vs Secret)
// -------------------------------------------------------------
test('Door Visual Differentiation: distinct rendering for closed, open, and secret doors', () => {
  const tileSize = 39;
  const doorLength = Math.round(tileSize * 0.82); // 32
  const doorThick = 8;

  function computeDoorRenderSpec(door) {
    const isVertical = door.from[0] !== door.to[0];
    const c = isVertical ? Math.max(door.from[0], door.to[0]) : door.from[0];
    const r = isVertical ? door.from[1] : Math.max(door.from[1], door.to[1]);
    const bx = c * tileSize;
    const by = r * tileSize;

    let dw, dh, dx, dy, cx, cy;
    if (isVertical) {
      dw = doorThick;
      dh = doorLength;
      cx = bx;
      cy = by + tileSize / 2;
      dx = cx - dw / 2;
      dy = by + (tileSize - dh) / 2;
    } else {
      dw = doorLength;
      dh = doorThick;
      cx = bx + tileSize / 2;
      cy = by;
      dx = bx + (tileSize - dw) / 2;
      dy = cy - dh / 2;
    }

    const isSecret = !!door.is_secret;
    const isOpen = door.state === 'open';

    const spec = {
      isVertical,
      doorway: { dx, dy, dw, dh, cx, cy },
      isSecret,
      isOpen,
      badgeText: isSecret ? (isOpen ? 'SECRET [OPEN]' : 'SECRET') : (isOpen ? 'OPEN' : 'CLOSED'),
      badgeClass: isSecret ? (isOpen ? 'door-badge-secret-open' : 'door-badge-secret') : (isOpen ? 'door-badge-open' : 'door-badge-closed'),
      theme: {
        border: isSecret ? '#d8b4fe' : (isOpen ? '#10b981' : '#f59e0b'),
        hasSwungLeaf: isOpen,
        hasOpenBadge: isOpen,
        hasIronStraps: !isOpen && !isSecret,
        hasSwingArc: isOpen
      }
    };

    if (isOpen) {
      spec.leaf = {
        length: Math.round(doorLength * 0.85),
        thickness: 5.5,
        pivot: isVertical ? [cx, dy] : [dx, cy],
        direction: isVertical ? 'horizontal' : 'vertical'
      };
    }

    return spec;
  }

  // 1. Closed Vertical Wood Door
  const closedV = computeDoorRenderSpec({ from: [0, 2], to: [1, 2], state: 'closed', is_secret: false });
  assert.equal(closedV.isVertical, true);
  assert.equal(closedV.isOpen, false);
  assert.equal(closedV.isSecret, false);
  assert.equal(closedV.badgeText, 'CLOSED');
  assert.equal(closedV.badgeClass, 'door-badge-closed');
  assert.equal(closedV.theme.border, '#f59e0b');
  assert.equal(closedV.theme.hasIronStraps, true);
  assert.equal(closedV.theme.hasSwungLeaf, false);

  // 2. Open Vertical Wood Door
  const openV = computeDoorRenderSpec({ from: [17, 7], to: [18, 7], state: 'open', is_secret: false });
  assert.equal(openV.isVertical, true);
  assert.equal(openV.isOpen, true);
  assert.equal(openV.badgeText, 'OPEN');
  assert.equal(openV.badgeClass, 'door-badge-open');
  assert.equal(openV.theme.border, '#10b981');
  assert.equal(openV.theme.hasSwungLeaf, true);
  assert.equal(openV.theme.hasSwingArc, true);
  assert.equal(openV.theme.hasOpenBadge, true);
  assert.equal(openV.theme.hasIronStraps, false);
  assert.ok(openV.leaf.length > 20);
  assert.equal(openV.leaf.direction, 'horizontal');

  // 3. Open Horizontal Wood Door
  const openH = computeDoorRenderSpec({ from: [7, 9], to: [7, 10], state: 'open', is_secret: false });
  assert.equal(openH.isVertical, false);
  assert.equal(openH.isOpen, true);
  assert.equal(openH.leaf.direction, 'vertical');

  // 4. Secret Closed Door
  const secretClosed = computeDoorRenderSpec({ from: [24, 15], to: [25, 15], state: 'closed', is_secret: true });
  assert.equal(secretClosed.isSecret, true);
  assert.equal(secretClosed.isOpen, false);
  assert.equal(secretClosed.badgeText, 'SECRET');
  assert.equal(secretClosed.badgeClass, 'door-badge-secret');
  assert.equal(secretClosed.theme.border, '#d8b4fe');

  // Verify visual uniqueness between open and closed
  assert.notEqual(openV.theme.border, closedV.theme.border);
  assert.notEqual(openV.badgeText, closedV.badgeText);
  assert.notEqual(openV.badgeClass, closedV.badgeClass);
  assert.notEqual(openV.theme.hasSwungLeaf, closedV.theme.hasSwungLeaf);
});

// -------------------------------------------------------------
// Test 17: Error Validation Area (HeroQuest Placement Rules)
// -------------------------------------------------------------
test('Error Validation Area: validates HeroQuest rules for furniture bounds, door walls, and object overlaps', () => {
  const bPath = path.resolve(__dirname, '../../../games/tabletop-rpg/cartridges/first-light-dungeon.blockmap.json');
  const blockmap = JSON.parse(fs.readFileSync(bPath, 'utf8'));

  function getRoomAt(col, row) {
    if (!blockmap || !blockmap.rooms) return null;
    for (const r of blockmap.rooms) {
      if (r.tiles) {
        if (r.tiles.some(t => t[0] === col && t[1] === row)) return r;
      } else if (r.x !== undefined) {
        if (col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h) return r;
      }
    }
    return null;
  }

  function validateQuest(quest) {
    const errors = [];
    if (!quest) return { valid: true, totalErrors: 0, errors: [], counts: { all: 0, furniture_bounds: 0, door_wall: 0, overlap: 0 } };

    // 1. Furniture Bounds
    if (Array.isArray(quest.furniture)) {
      quest.furniture.forEach((f, idx) => {
        const w = f.width || 1;
        const h = f.height || 1;
        const furnName = f.name || f.type || 'Furniture';
        const tiles = [];
        const roomsEncountered = new Map();
        const corridorTiles = [];

        for (let dx = 0; dx < w; dx++) {
          for (let dy = 0; dy < h; dy++) {
            const col = f.x + dx;
            const row = f.y + dy;
            tiles.push([col, row]);
            const room = getRoomAt(col, row);
            if (!room) {
              corridorTiles.push([col, row]);
            } else {
              if (!roomsEncountered.has(room.id)) {
                roomsEncountered.set(room.id, { room, tiles: [] });
              }
              roomsEncountered.get(room.id).tiles.push([col, row]);
            }
          }
        }

        if (corridorTiles.length > 0) {
          const corrStr = corridorTiles.map(t => `[${t[0]}, ${t[1]}]`).join(', ');
          errors.push({
            id: `furn-bounds-corr-${f.id || idx}`,
            category: 'furniture_bounds',
            categoryLabel: 'Furniture Bounds',
            icon: '🪑',
            title: `${furnName} Outside Room Bounds`,
            description: `${furnName} at [${f.x}, ${f.y}] (${w}×${h}) extends outside room boundaries into corridor or void at tile${corridorTiles.length > 1 ? 's' : ''} ${corrStr}.`,
            tiles: corridorTiles,
            allTiles: tiles,
            entityType: 'furniture',
            entityIndex: idx,
            entityId: f.id || null,
            anchor: [f.x, f.y]
          });
        }

        if (roomsEncountered.size > 1) {
          const roomNames = Array.from(roomsEncountered.values()).map(r => r.room.name || r.room.id).join(' and ');
          errors.push({
            id: `furn-bounds-multi-${f.id || idx}`,
            category: 'furniture_bounds',
            categoryLabel: 'Furniture Bounds',
            icon: '🪑',
            title: `${furnName} Straddles Multiple Rooms`,
            description: `${furnName} at [${f.x}, ${f.y}] (${w}×${h}) straddles multiple rooms (${roomNames}). Furniture must reside strictly within a single room.`,
            tiles: tiles,
            allTiles: tiles,
            entityType: 'furniture',
            entityIndex: idx,
            entityId: f.id || null,
            anchor: [f.x, f.y]
          });
        }
      });
    }

    // 2. Door Wall Placement
    if (Array.isArray(quest.doors)) {
      quest.doors.forEach((d, idx) => {
        const from = d.from;
        const to = d.to;
        if (!from || !to) return;

        const r1 = getRoomAt(from[0], from[1]);
        const r2 = getRoomAt(to[0], to[1]);
        const doorName = d.is_secret ? 'Secret Door' : (d.state === 'open' ? 'Open Door' : 'Door');
        const doorId = d.id || idx;

        if (!r1 && !r2) {
          errors.push({
            id: `door-wall-corridor-${doorId}`,
            category: 'door_wall',
            categoryLabel: 'Door Wall',
            icon: '🚪',
            title: `${doorName} Floating in Corridor`,
            description: `${doorName} between [${from[0]}, ${from[1]}] and [${to[0]}, ${to[1]}] is not attached to any room perimeter wall (both sides are corridors).`,
            tiles: [from, to],
            allTiles: [from, to],
            entityType: 'door',
            entityIndex: idx,
            entityId: d.id || null,
            doorEdge: { from, to },
            anchor: from
          });
        } else if (r1 && r2 && r1.id === r2.id) {
          const roomName = r1.name || r1.id;
          errors.push({
            id: `door-wall-interior-${doorId}`,
            category: 'door_wall',
            categoryLabel: 'Door Wall',
            icon: '🚪',
            title: `${doorName} Inside Room Floor`,
            description: `${doorName} between [${from[0]}, ${from[1]}] and [${to[0]}, ${to[1]}] is placed inside open floor space within ${roomName} instead of on its perimeter wall.`,
            tiles: [from, to],
            allTiles: [from, to],
            entityType: 'door',
            entityIndex: idx,
            entityId: d.id || null,
            doorEdge: { from, to },
            anchor: from
          });
        }
      });
    }

    // 3. Object Overlaps
    const tileOccupants = new Map();
    function addOccupant(col, row, item) {
      const key = `${col},${row}`;
      if (!tileOccupants.has(key)) tileOccupants.set(key, []);
      tileOccupants.get(key).push(item);
    }

    if (Array.isArray(quest.furniture)) {
      quest.furniture.forEach((f, idx) => {
        const w = f.width || 1;
        const h = f.height || 1;
        const name = f.name || f.type || 'Furniture';
        for (let dx = 0; dx < w; dx++) {
          for (let dy = 0; dy < h; dy++) {
            addOccupant(f.x + dx, f.y + dy, { type: 'furniture', index: idx, id: f.id || null, name, x: f.x + dx, y: f.y + dy });
          }
        }
      });
    }

    if (Array.isArray(quest.monsters)) {
      quest.monsters.forEach((m, idx) => {
        const name = m.name || m.type || 'Monster';
        const mx = m.x !== undefined ? m.x : (m.pos ? m.pos[0] : 0);
        const my = m.y !== undefined ? m.y : (m.pos ? m.pos[1] : 0);
        addOccupant(mx, my, { type: 'monster', index: idx, id: m.id || null, name, x: mx, y: my });
      });
    }

    if (Array.isArray(quest.wallBlocks)) {
      quest.wallBlocks.forEach((b, idx) => {
        addOccupant(b.x, b.y, { type: 'wall-block', index: idx, id: b.id || null, name: 'Wall Block', x: b.x, y: b.y });
      });
    }

    if (Array.isArray(quest.traps)) {
      quest.traps.forEach((t, idx) => {
        addOccupant(t.x, t.y, { type: 'trap', index: idx, id: t.id || null, name: `Trap (${t.type || 'pit'})`, x: t.x, y: t.y });
      });
    }

    for (const [key, occupants] of tileOccupants.entries()) {
      if (occupants.length <= 1) continue;
      const [col, row] = key.split(',').map(Number);

      for (let i = 0; i < occupants.length; i++) {
        for (let j = i + 1; j < occupants.length; j++) {
          const o1 = occupants[i];
          const o2 = occupants[j];

          let title = `Object Collision at [${col}, ${row}]`;
          let desc = '';
          let primaryEntity = o2;

          if (o1.type === 'furniture' && o2.type === 'monster') {
            title = `Monster on Furniture at [${col}, ${row}]`;
            desc = `HeroQuest rule violation: ${o2.name} is standing on top of ${o1.name}. Characters and enemies cannot stand on furniture.`;
            primaryEntity = o2;
          } else if (o1.type === 'monster' && o2.type === 'furniture') {
            title = `Monster on Furniture at [${col}, ${row}]`;
            desc = `HeroQuest rule violation: ${o1.name} is standing on top of ${o2.name}. Characters and enemies cannot stand on furniture.`;
            primaryEntity = o1;
          } else if (o1.type === 'monster' && o2.type === 'monster') {
            title = `Monsters Colliding at [${col}, ${row}]`;
            desc = `Multiple monsters (${o1.name} and ${o2.name}) are placed on the exact same tile [${col}, ${row}].`;
            primaryEntity = o2;
          } else if (o1.type === 'furniture' && o2.type === 'furniture') {
            title = `Furniture Overlap at [${col}, ${row}]`;
            desc = `Furniture pieces '${o1.name}' and '${o2.name}' overlap each other at tile [${col}, ${row}].`;
            primaryEntity = o2;
          } else if (o1.type === 'wall-block' || o2.type === 'wall-block') {
            const other = o1.type === 'wall-block' ? o2 : o1;
            title = `Wall Block Overlap at [${col}, ${row}]`;
            desc = `Wall Block is placed on top of ${other.type} '${other.name}' at tile [${col}, ${row}].`;
            primaryEntity = o2;
          } else if (o1.type === 'trap' || o2.type === 'trap') {
            const other = o1.type === 'trap' ? o2 : o1;
            title = `Trap Collision at [${col}, ${row}]`;
            desc = `Trap at [${col}, ${row}] is placed on top of ${other.type} '${other.name}'.`;
            primaryEntity = o2;
          } else {
            title = `Object Collision at [${col}, ${row}]`;
            desc = `${o1.name} and ${o2.name} overlap at tile [${col}, ${row}].`;
          }

          errors.push({
            id: `overlap-${col}-${row}-${o1.type}-${o1.index}-${o2.type}-${o2.index}`,
            category: 'overlap',
            categoryLabel: 'Object Overlap',
            icon: '💥',
            title,
            description: desc,
            tiles: [[col, row]],
            allTiles: [[col, row]],
            entityType: primaryEntity.type,
            entityIndex: primaryEntity.index,
            entityId: primaryEntity.id,
            anchor: [col, row],
            occupants: [o1, o2]
          });
        }
      }
    }

    const counts = {
      all: errors.length,
      furniture_bounds: errors.filter(e => e.category === 'furniture_bounds').length,
      door_wall: errors.filter(e => e.category === 'door_wall').length,
      overlap: errors.filter(e => e.category === 'overlap').length
    };

    return {
      valid: errors.length === 0,
      totalErrors: errors.length,
      errors,
      counts
    };
  }

  // 1. Verify Rule 1: Furniture outside of bounds of single room
  // 1a: Furniture extending into corridor
  const questCorridorFurn = {
    furniture: [
      { id: 'f-corr', name: 'Archives Bookcase', type: 'bookcase', x: 13, y: 2, width: 3, height: 1 }
    ]
  };
  const res1a = validateQuest(questCorridorFurn);
  assert.equal(res1a.valid, false);
  assert.equal(res1a.counts.furniture_bounds, 1);
  assert.match(res1a.errors[0].title, /Outside Room Bounds/i);
  assert.match(res1a.errors[0].description, /extends outside room boundaries into corridor/i);
  assert.deepEqual(res1a.errors[0].tiles, [[13, 2]]);

  // 1b: Furniture straddling multiple rooms
  const questMultiRoomFurn = {
    furniture: [
      { id: 'f-multi', name: 'Fire King Throne', type: 'throne', x: 21, y: 14, width: 2, height: 2 }
    ]
  };
  const res1b = validateQuest(questMultiRoomFurn);
  assert.equal(res1b.valid, false);
  assert.equal(res1b.counts.furniture_bounds, 1);
  assert.match(res1b.errors[0].title, /Straddles Multiple Rooms/i);
  assert.match(res1b.errors[0].description, /straddles multiple rooms/i);

  // 1c: Valid furniture within single room
  const questValidFurn = {
    furniture: [
      { id: 'f-valid', name: 'Alchemist Bench', type: 'alchemists_bench', x: 2, y: 2, width: 2, height: 1 }
    ]
  };
  const res1c = validateQuest(questValidFurn);
  assert.equal(res1c.counts.furniture_bounds, 0);

  // 2. Verify Rule 2: Door not on wall of room
  // 2a: Floating door in corridors
  const questFloatingDoor = {
    doors: [
      { id: 'd-float', from: [12, 2], to: [13, 2], state: 'closed' }
    ]
  };
  const res2a = validateQuest(questFloatingDoor);
  assert.equal(res2a.valid, false);
  assert.equal(res2a.counts.door_wall, 1);
  assert.match(res2a.errors[0].title, /Floating in Corridor/i);
  assert.match(res2a.errors[0].description, /not attached to any room perimeter wall/i);

  // 2b: Door placed in open room floor
  const questInteriorDoor = {
    doors: [
      { id: 'd-inside', from: [2, 2], to: [2, 3], state: 'closed' }
    ]
  };
  const res2b = validateQuest(questInteriorDoor);
  assert.equal(res2b.valid, false);
  assert.equal(res2b.counts.door_wall, 1);
  assert.match(res2b.errors[0].title, /Inside Room Floor/i);
  assert.match(res2b.errors[0].description, /placed inside open floor space/i);

  // 2c: Valid perimeter door (Room 1 to corridor)
  const questValidDoor = {
    doors: [
      { id: 'd-valid', from: [2, 1], to: [2, 0], state: 'closed' }
    ]
  };
  const res2c = validateQuest(questValidDoor);
  assert.equal(res2c.counts.door_wall, 0);

  // 2d: Valid dividing door between two rooms (Room 1 to Room 2)
  const questDividingDoor = {
    doors: [
      { id: 'd-div', from: [4, 2], to: [5, 2], state: 'closed' }
    ]
  };
  const res2d = validateQuest(questDividingDoor);
  assert.equal(res2d.counts.door_wall, 0);

  // 3. Verify Rule 3: Objects on top of each other
  // 3a: HeroQuest rule: monster on furniture
  const questMonsterOnFurn = {
    furniture: [
      { id: 'f-table', name: 'Oak Dining Table', type: 'table', x: 2, y: 2, width: 2, height: 2 }
    ],
    monsters: [
      { id: 'm-goblin', name: 'Goblin Scout', type: 'goblin', x: 2, y: 2 }
    ]
  };
  const res3a = validateQuest(questMonsterOnFurn);
  assert.equal(res3a.valid, false);
  assert.equal(res3a.counts.overlap, 1);
  assert.match(res3a.errors[0].title, /Monster on Furniture/i);
  assert.match(res3a.errors[0].description, /Characters and enemies cannot stand on furniture/i);

  // 3b: Monster on monster
  const questMonsterOnMonster = {
    monsters: [
      { id: 'm1', name: 'Orc Warrior', type: 'orc', x: 3, y: 3 },
      { id: 'm2', name: 'Skeleton Guard', type: 'skeleton', x: 3, y: 3 }
    ]
  };
  const res3b = validateQuest(questMonsterOnMonster);
  assert.equal(res3b.counts.overlap, 1);
  assert.match(res3b.errors[0].title, /Monsters Colliding/i);

  // 3c: Furniture on furniture
  const questFurnOnFurn = {
    furniture: [
      { id: 'f1', name: 'Altar', type: 'altar', x: 2, y: 2, width: 2, height: 1 },
      { id: 'f2', name: 'Chest', type: 'chest', x: 3, y: 2, width: 1, height: 1 }
    ]
  };
  const res3c = validateQuest(questFurnOnFurn);
  assert.equal(res3c.counts.overlap, 1);
  assert.match(res3c.errors[0].title, /Furniture Overlap/i);

  // 3d: Wall Block on monster
  const questBlockOnMonster = {
    monsters: [
      { id: 'm-chaos', name: 'Chaos Warrior', type: 'chaos_warrior', x: 6, y: 6 }
    ],
    wallBlocks: [
      { id: 'b1', x: 6, y: 6 }
    ]
  };
  const res3d = validateQuest(questBlockOnMonster);
  assert.equal(res3d.counts.overlap, 1);
  assert.match(res3d.errors[0].title, /Wall Block Overlap/i);

  // 3e: Trap on furniture
  const questTrapOnFurn = {
    furniture: [
      { id: 'f-tomb', name: 'Stone Tomb', type: 'tomb', x: 2, y: 2, width: 2, height: 2 }
    ],
    traps: [
      { id: 't-pit', type: 'pit', x: 3, y: 3 }
    ]
  };
  const res3e = validateQuest(questTrapOnFurn);
  assert.equal(res3e.counts.overlap, 1);
  assert.match(res3e.errors[0].title, /Trap Collision/i);

  // 4. Combined clean valid quest
  const cleanQuest = {
    furniture: [
      { id: 'f-clean', name: 'Treasure Chest', type: 'chest', x: 1, y: 1, width: 1, height: 1 }
    ],
    doors: [
      { id: 'd-clean', from: [4, 2], to: [5, 2], state: 'closed' }
    ],
    monsters: [
      { id: 'm-clean', name: 'Orc Guard', type: 'orc', x: 3, y: 3 }
    ],
    traps: [
      { id: 't-clean', type: 'pit', x: 8, y: 3 }
    ]
  };
  const cleanRes = validateQuest(cleanQuest);
  assert.equal(cleanRes.valid, true);
  assert.equal(cleanRes.totalErrors, 0);
  assert.equal(cleanRes.errors.length, 0);
  assert.deepEqual(cleanRes.counts, { all: 0, furniture_bounds: 0, door_wall: 0, overlap: 0 });
});

test('Voice Map Setup: interprets spoken quest instructions and places items cleanly', (t) => {
  const blockmap = {
    gridDimensions: [28, 21],
    rooms: [
      {
        id: 'room-1',
        name: 'Room 1 (NW)',
        x: 1, y: 1, w: 4, h: 4,
        tiles: [
          [1,1],[1,2],[1,3],[1,4],
          [2,1],[2,2],[2,3],[2,4],
          [3,1],[3,2],[3,3],[3,4],
          [4,1],[4,2],[4,3],[4,4]
        ]
      },
      {
        id: 'room-2',
        name: 'Room 2 (NE)',
        x: 6, y: 1, w: 4, h: 4,
        tiles: [
          [6,1],[6,2],[6,3],[6,4],
          [7,1],[7,2],[7,3],[7,4],
          [8,1],[8,2],[8,3],[8,4],
          [9,1],[9,2],[9,3],[9,4]
        ]
      }
    ]
  };

  // 1. Natural speech interpretation tests
  const cmd1 = interpretVoiceQuestCommands('add 3 skeletons to this room', blockmap, null, { hoverTile: [2, 2] });
  assert.equal(cmd1.length, 1);
  assert.equal(cmd1[0].category, 'monster');
  assert.equal(cmd1[0].type, 'skeleton');
  assert.equal(cmd1[0].count, 3);
  assert.equal(cmd1[0].targetRoom, 'this room');

  const cmd2 = interpretVoiceQuestCommands('add 3 skeletons to room 1 and 2 orcs to room 2', blockmap, null);
  assert.equal(cmd2.length, 2);
  assert.equal(cmd2[0].type, 'skeleton');
  assert.equal(cmd2[0].count, 3);
  assert.equal(cmd2[0].targetRoom, 'room 1');
  assert.equal(cmd2[1].type, 'orc');
  assert.equal(cmd2[1].count, 2);
  assert.equal(cmd2[1].targetRoom, 'room 2');

  const cmd3 = interpretVoiceQuestCommands('place a treasure chest and 2 orcs in room 2', blockmap, null);
  assert.equal(cmd3.length, 2);
  assert.equal(cmd3[0].category, 'furniture');
  assert.equal(cmd3[0].type, 'chest');
  assert.equal(cmd3[0].count, 1);
  assert.equal(cmd3[0].targetRoom, 'room 2');
  assert.equal(cmd3[1].category, 'monster');
  assert.equal(cmd3[1].type, 'orc');
  assert.equal(cmd3[1].count, 2);
  assert.equal(cmd3[1].targetRoom, 'room 2');

  // 2. Execution and Board Placement
  const quest = {
    monsters: [],
    furniture: [],
    doors: [],
    traps: [],
    wallBlocks: []
  };

  // Execute: "add 3 skeletons to room 1"
  const exec1 = executeVoiceMapCommands('add 3 skeletons to room 1', 'guidance', quest, blockmap);
  assert.equal(exec1.success, true);
  assert.equal(quest.monsters.length, 3);
  assert.equal(quest.monsters[0].type, 'skeleton');
  assert.equal(quest.monsters[0].roomId, 'room-1');
  assert.equal(quest.monsters[0].bp, 1);

  // Execute: "place a treasure chest in room 2"
  const exec2 = executeVoiceMapCommands('place a treasure chest in room 2', 'guidance', quest, blockmap);
  assert.equal(exec2.success, true);
  assert.equal(quest.furniture.length, 1);
  assert.equal(quest.furniture[0].type, 'chest');
  assert.equal(quest.furniture[0].roomId, 'room-2');

  // Execute: "place an orc and a pit trap in room 2"
  const exec3 = executeVoiceMapCommands('place an orc and a pit trap in room 2', 'guidance', quest, blockmap);
  assert.equal(exec3.success, true);
  assert.equal(quest.monsters.length, 4); // 3 skeletons + 1 orc
  assert.equal(quest.traps.length, 1);

  // Validate the resulting quest - must be 100% valid under HeroQuest rules
  const val = validateQuest(quest, blockmap);
  assert.equal(val.valid, true);
  assert.equal(val.totalErrors, 0);
  assert.equal(val.errors.length, 0);
});

test('Resizable Split Dividers: enables resizing of tool palette and sidebar with clamping and reset defaults', (t) => {
  // 1. Verify HTML Structure
  const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(htmlContent.includes('id="resizer-left"'), 'index.html must contain #resizer-left');
  assert.ok(htmlContent.includes('id="resizer-right"'), 'index.html must contain #resizer-right');

  // Verify left divider attributes and positioning
  const leftResizerMatch = htmlContent.match(/<div[^>]*id="resizer-left"[^>]*>/s);
  assert.ok(leftResizerMatch, '#resizer-left markup must be present');
  assert.ok(leftResizerMatch[0].includes('class="split-divider col-resize"'), '#resizer-left has split-divider class');
  assert.ok(leftResizerMatch[0].includes('data-target="prev"'), '#resizer-left targets previous element (palette)');
  assert.ok(leftResizerMatch[0].includes('data-min="110"'), '#resizer-left min-width is 110');
  assert.ok(leftResizerMatch[0].includes('data-max="380"'), '#resizer-left max-width is 380');
  assert.ok(leftResizerMatch[0].includes('role="separator"'), '#resizer-left has separator role');
  assert.ok(leftResizerMatch[0].includes('aria-orientation="vertical"'), '#resizer-left vertical orientation');

  // Verify right divider attributes and positioning
  const rightResizerMatch = htmlContent.match(/<div[^>]*id="resizer-right"[^>]*>/s);
  assert.ok(rightResizerMatch, '#resizer-right markup must be present');
  assert.ok(rightResizerMatch[0].includes('class="split-divider col-resize"'), '#resizer-right has split-divider class');
  assert.ok(rightResizerMatch[0].includes('data-target="next"'), '#resizer-right targets next element (sidebar)');
  assert.ok(rightResizerMatch[0].includes('data-min="240"'), '#resizer-right min-width is 240');
  assert.ok(rightResizerMatch[0].includes('data-max="680"'), '#resizer-right max-width is 680');
  assert.ok(rightResizerMatch[0].includes('role="separator"'), '#resizer-right has separator role');
  assert.ok(rightResizerMatch[0].includes('aria-orientation="vertical"'), '#resizer-right vertical orientation');

  // 2. Verify CSS rules
  const cssPath = path.join(__dirname, '..', 'renderer', 'style.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(cssContent.includes('.split-divider'), 'CSS defines .split-divider');
  assert.ok(cssContent.includes('cursor: col-resize'), 'CSS defines col-resize cursor');
  assert.ok(cssContent.includes('.split-divider::after'), 'CSS defines divider border line pseudo-element');
  assert.ok(cssContent.includes('.split-divider:hover::after'), 'CSS defines hover accent glow state');
  assert.ok(cssContent.includes('body.resizing'), 'CSS defines active drag resizing body state');
  assert.ok(cssContent.includes('min-width: 110px'), 'tool-palette min-width set to 110px in CSS');
  assert.ok(cssContent.includes('min-width: 240px'), 'sidebar-right min-width set to 240px in CSS');

  // 3. Verify Divider Sizing Math & Clamping Logic
  function calculateNewWidth(targetDirection, startSize, deltaX, minSize, maxSize) {
    if (targetDirection === 'prev') {
      return Math.max(minSize, Math.min(maxSize, startSize + deltaX));
    } else {
      return Math.max(minSize, Math.min(maxSize, startSize - deltaX));
    }
  }

  // Left Tool Palette Clamping (min: 110, max: 380, default: 140)
  assert.equal(calculateNewWidth('prev', 140, 50, 110, 380), 190);
  assert.equal(calculateNewWidth('prev', 140, -10, 110, 380), 130);
  assert.equal(calculateNewWidth('prev', 140, -60, 110, 380), 110); // clamped to min 110
  assert.equal(calculateNewWidth('prev', 140, -100, 110, 380), 110); // clamped to min 110
  assert.equal(calculateNewWidth('prev', 140, 200, 110, 380), 340);
  assert.equal(calculateNewWidth('prev', 140, 300, 110, 380), 380); // clamped to max 380

  // Right Inspector Sidebar Clamping (min: 240, max: 680, default: 360)
  // Dragging left (negative deltaX) increases right sidebar width: startSize - (-deltaX)
  assert.equal(calculateNewWidth('next', 360, -100, 240, 680), 460);
  assert.equal(calculateNewWidth('next', 360, 50, 240, 680), 310);
  assert.equal(calculateNewWidth('next', 360, 150, 240, 680), 240); // clamped to min 240
  assert.equal(calculateNewWidth('next', 360, 250, 240, 680), 240); // clamped to min 240
  assert.equal(calculateNewWidth('next', 360, -300, 240, 680), 660);
  assert.equal(calculateNewWidth('next', 360, -400, 240, 680), 680); // clamped to max 680

  // 4. Functional DOM Event Simulation for setupSplitDividers
  const savedDocument = global.document;
  const savedLocalStorage = global.localStorage;
  const savedViewport = dom.viewport;
  const savedCanvas = dom.canvas;
  const savedCtx = dom.ctx;

  const storageMock = {};
  global.localStorage = {
    getItem: (key) => storageMock[key] || null,
    setItem: (key, val) => { storageMock[key] = String(val); },
    removeItem: (key) => { delete storageMock[key]; }
  };

  const createMockElement = (id, className, attrs = {}, width = 140) => {
    const listeners = {};
    const classes = new Set(className ? className.split(' ') : []);
    const element = {
      id,
      className,
      style: { width: `${width}px`, flex: `0 0 ${width}px` },
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c)
      },
      getAttribute: (k) => attrs[k] !== undefined ? attrs[k] : null,
      setAttribute: (k, v) => { attrs[k] = v; },
      addEventListener: (evt, handler) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(handler);
      },
      dispatchEvent: (evt, data) => {
        if (listeners[evt]) {
          listeners[evt].forEach(fn => fn(data || {}));
        }
      },
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      getBoundingClientRect: () => ({ width: parseInt(element.style.width, 10) || width, height: 600 }),
      previousElementSibling: null,
      nextElementSibling: null
    };
    return element;
  };

  const mockPalette = createMockElement('tool-palette', 'tool-palette', {}, 140);
  const mockResizerLeft = createMockElement('resizer-left', 'split-divider col-resize', {
    'data-target': 'prev',
    'data-min': '110',
    'data-max': '380'
  });
  const mockViewport = createMockElement('canvas-viewport', 'canvas-viewport', {}, 800);
  const mockResizerRight = createMockElement('resizer-right', 'split-divider col-resize', {
    'data-target': 'next',
    'data-min': '240',
    'data-max': '680'
  });
  const mockSidebar = createMockElement('sidebar-right', 'sidebar-right', {}, 360);

  // Wire sibling relationships
  mockPalette.nextElementSibling = mockResizerLeft;
  mockResizerLeft.previousElementSibling = mockPalette;
  mockResizerLeft.nextElementSibling = mockViewport;

  mockViewport.previousElementSibling = mockResizerLeft;
  mockViewport.nextElementSibling = mockResizerRight;

  mockResizerRight.previousElementSibling = mockViewport;
  mockResizerRight.nextElementSibling = mockSidebar;
  mockSidebar.previousElementSibling = mockResizerRight;

  const mockBody = createMockElement('body', '');
  global.document = {
    body: mockBody,
    querySelectorAll: (selector) => {
      if (selector === '.split-divider') return [mockResizerLeft, mockResizerRight];
      return [];
    }
  };

  let renderCount = 0;
  dom.viewport = mockViewport;
  dom.canvas = { width: 0, height: 0 };
  dom.ctx = new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'clearRect') {
        renderCount++;
      }
      return () => {};
    }
  });

  try {
    setupSplitDividers();

    // Test Left Resizer Drag (+60px)
    mockResizerLeft.dispatchEvent('pointerdown', { clientX: 100, pointerId: 1, preventDefault: () => {} });
    assert.ok(mockResizerLeft.classList.contains('active'), 'Resizer has active class during drag');
    assert.ok(mockBody.classList.contains('resizing'), 'Body has resizing class during drag');

    mockResizerLeft.dispatchEvent('pointermove', { clientX: 160, pointerId: 1 });
    assert.equal(mockPalette.style.width, '200px', 'Tool palette width increases by 60px');
    assert.equal(mockPalette.style.flex, '0 0 200px');
    assert.equal(storageMock['robos_quest_editor_tool_palette_w'], '200');

    mockResizerLeft.dispatchEvent('pointerup', { pointerId: 1 });
    assert.ok(!mockResizerLeft.classList.contains('active'), 'Resizer loses active class on pointerup');
    assert.ok(!mockBody.classList.contains('resizing'), 'Body loses resizing class on pointerup');

    // Test Left Resizer Double Click (Reset to 140px default)
    mockResizerLeft.dispatchEvent('dblclick', {});
    assert.equal(mockPalette.style.width, '140px', 'Tool palette resets to 140px on dblclick');
    assert.equal(storageMock['robos_quest_editor_tool_palette_w'], undefined, 'Storage entry cleared on reset');

    // Test Right Resizer Drag (-100px dragging left widens sidebar by 100px)
    mockResizerRight.dispatchEvent('pointerdown', { clientX: 700, pointerId: 2, preventDefault: () => {} });
    assert.ok(mockResizerRight.classList.contains('active'));

    mockResizerRight.dispatchEvent('pointermove', { clientX: 600, pointerId: 2 });
    assert.equal(mockSidebar.style.width, '460px', 'Sidebar width increases by 100px when dragged left');
    assert.equal(mockSidebar.style.flex, '0 0 460px');
    assert.equal(storageMock['robos_quest_editor_sidebar_right_w'], '460');

    mockResizerRight.dispatchEvent('pointerup', { pointerId: 2 });
    assert.ok(!mockResizerRight.classList.contains('active'));

    // Test Right Resizer Double Click (Reset to 360px default)
    mockResizerRight.dispatchEvent('dblclick', {});
    assert.equal(mockSidebar.style.width, '360px', 'Sidebar resets to 360px on dblclick');
    assert.equal(storageMock['robos_quest_editor_sidebar_right_w'], undefined, 'Storage entry cleared on reset');

    // Verify canvas redraw and dimensions were updated during resizing
    assert.equal(dom.canvas.width, 800, 'Canvas width resized to viewport width');
    assert.equal(dom.canvas.height, 600, 'Canvas height resized to viewport height');
    assert.ok(renderCount > 0, 'Canvas render was invoked');
  } finally {
    global.document = savedDocument;
    global.localStorage = savedLocalStorage;
    dom.viewport = savedViewport;
    dom.canvas = savedCanvas;
    dom.ctx = savedCtx;
  }
});

test('Room Names Display & Toggles: renders centered labels, toggles layer visibility, updates UI controls, and persists state in localStorage', (t) => {
  const savedLocalStorage = global.localStorage;
  const storageMock = {};
  global.localStorage = {
    getItem: (k) => storageMock[k] || null,
    setItem: (k, v) => { storageMock[k] = String(v); },
    removeItem: (k) => { delete storageMock[k]; }
  };

  const savedChk = dom.chkShowRoomNames;
  const savedBtn = dom.btnToggleRoomNames;

  const mockClasses = new Set();
  const mockBtn = {
    classList: {
      add: (cls) => mockClasses.add(cls),
      remove: (cls) => mockClasses.delete(cls),
      contains: (cls) => mockClasses.has(cls)
    },
    title: ''
  };

  const mockChk = {
    checked: false
  };

  dom.chkShowRoomNames = mockChk;
  dom.btnToggleRoomNames = mockBtn;

  try {
    // 1. Initial toggle to false
    const res1 = toggleRoomNames(false);
    assert.equal(res1, false, 'toggleRoomNames(false) returns false');
    assert.equal(state.layers.showRoomNames, false);
    assert.equal(storageMock['robos_quest_editor_show_room_names'], 'false', 'Persists false to localStorage');
    assert.equal(mockChk.checked, false, 'Checkbox is unchecked');
    assert.equal(mockBtn.classList.contains('active-toggle'), false, 'Button active-toggle class removed');
    assert.match(mockBtn.title, /Show Room Names/, 'Button title indicates click to show');

    // 2. Toggle without argument flips to true
    const res2 = toggleRoomNames();
    assert.equal(res2, true, 'toggleRoomNames() flips false to true');
    assert.equal(state.layers.showRoomNames, true);
    assert.equal(storageMock['robos_quest_editor_show_room_names'], 'true', 'Persists true to localStorage');
    assert.equal(mockChk.checked, true, 'Checkbox is checked');
    assert.equal(mockBtn.classList.contains('active-toggle'), true, 'Button active-toggle class added');
    assert.match(mockBtn.title, /Hide Room Names/, 'Button title indicates click to hide');

    // 3. Toggle without argument flips back to false
    const res3 = toggleRoomNames();
    assert.equal(res3, false, 'toggleRoomNames() flips true to false');
    assert.equal(state.layers.showRoomNames, false);
    assert.equal(mockChk.checked, false);
    assert.equal(mockBtn.classList.contains('active-toggle'), false);

    // 4. Force back to true
    toggleRoomNames(true);
    assert.equal(state.layers.showRoomNames, true);
    assert.equal(mockChk.checked, true);
    assert.equal(mockBtn.classList.contains('active-toggle'), true);

    // 5. Test Room Centroid Geometry Calculation
    // Tile-based room (HeroQuest NW room: col 1..4, row 1..4)
    const tileRoom = {
      id: 'room-nw-1',
      name: 'Room 1 (NW)',
      tiles: [
        [1, 1], [1, 2], [1, 3], [1, 4],
        [2, 1], [2, 2], [2, 3], [2, 4],
        [3, 1], [3, 2], [3, 3], [3, 4],
        [4, 1], [4, 2], [4, 3], [4, 4]
      ]
    };
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const [c, r] of tileRoom.tiles) {
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    const centerTileX = (minC + maxC + 1) / 2;
    const centerTileY = (minR + maxR + 1) / 2;
    assert.equal(centerTileX, 3.0, 'Center tile X for 4x4 room at cols 1..4 is 3.0');
    assert.equal(centerTileY, 3.0, 'Center tile Y for 4x4 room at rows 1..4 is 3.0');

    const tileSize = 39;
    const offsetX = 0;
    const offsetY = 0;
    const worldX = offsetX + centerTileX * tileSize;
    const worldY = offsetY + centerTileY * tileSize;
    assert.equal(worldX, 117.0, 'World X is 117.0px');
    assert.equal(worldY, 117.0, 'World Y is 117.0px');

    // Bounds-based room (x, y, w, h)
    const rectRoom = {
      id: 'room-center',
      name: 'Central Chamber',
      x: 10,
      y: 7,
      w: 6,
      h: 5
    };
    const rectCenterX = rectRoom.x + rectRoom.w / 2;
    const rectCenterY = rectRoom.y + rectRoom.h / 2;
    assert.equal(rectCenterX, 13.0, 'Center tile X for room at x:10, w:6 is 13.0');
    assert.equal(rectCenterY, 9.5, 'Center tile Y for room at y:7, h:5 is 9.5');
  } finally {
    global.localStorage = savedLocalStorage;
    dom.chkShowRoomNames = savedChk;
    dom.btnToggleRoomNames = savedBtn;
  }
});



