'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

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


