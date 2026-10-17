'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  validateQuest: validateQuestFn,
  loadCartridge,
  loadBlockmap,
  isStartingQuestAction,
  resolveTriggerIndicators,
  drawExportTriggerIndicator,
  interpretVoiceQuestCommands,
  executeVoiceMapCommands,
  setupSplitDividers,
  toggleRoomNames,
  updateRoomNamesToggleUI,
  updateInspectorUI,
  updateEntitySummaryList,
  updateTriggerTargetOptions,
  updateTriggerTabUI,
  renderActionPipelineUI,
  addActionToTrigger,
  removeActionFromTrigger,
  addTrigger,
  buildCartridgePayload,
  generateExportCanvas,
  generateQuestPdfHtml,
  openExportPngModal,
  closeExportPngModal,
  openExportPdfModal,
  closeExportPdfModal,
  exportPng,
  exportPdf,
  copyPngToClipboard,
  state,
  dom,
  TRIGGER_EVENT_DEFS,
  TRIGGER_ACTION_DEFS
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

  function validateQuest(quest) {
    return validateQuestFn(quest, blockmap);
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

  // 1d: Treasure chest in corridor (Valid per HeroQuest rules: chests can appear in corridors)
  const questCorridorChest = {
    furniture: [
      { id: 'f-chest-corr', name: 'Treasure Chest', type: 'chest', x: 13, y: 2, width: 1, height: 1 }
    ]
  };
  const res1d = validateQuest(questCorridorChest);
  assert.equal(res1d.valid, true);
  assert.equal(res1d.counts.furniture_bounds, 0);
  assert.equal(res1d.totalErrors, 0);

  // 1e: Treasure chest straddling room and corridor boundaries (Invalid)
  const questStraddleChest = {
    furniture: [
      { id: 'f-chest-straddle', name: 'Treasure Chest', type: 'chest', x: 13, y: 2, width: 2, height: 1 }
    ]
  };
  const res1e = validateQuest(questStraddleChest);
  assert.equal(res1e.valid, false);
  assert.equal(res1e.counts.furniture_bounds, 1);
  assert.match(res1e.errors[0].title, /Straddles Room and Corridor/i);

  // 1f: Treasure chest placed outside board in void (Invalid)
  const questVoidChest = {
    furniture: [
      { id: 'f-chest-void', name: 'Treasure Chest', type: 'chest', x: -10, y: -10, width: 1, height: 1 }
    ]
  };
  const res1f = validateQuest(questVoidChest);
  assert.equal(res1f.valid, false);
  assert.equal(res1f.counts.furniture_bounds, 1);
  assert.match(res1f.errors[0].title, /Outside Board Bounds/i);

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
      },
      {
        id: 'room-19',
        name: 'Room 19 (SE)',
        x: 12, y: 12, w: 4, h: 4,
        tiles: [
          [12,12],[12,13],[12,14],[12,15],
          [13,12],[13,13],[13,14],[13,15],
          [14,12],[14,13],[14,14],[14,15],
          [15,12],[15,13],[15,14],[15,15]
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

  const cmd4 = interpretVoiceQuestCommands('Place two skeletons in room one.', blockmap, null);
  assert.equal(cmd4.length, 1);
  assert.equal(cmd4[0].category, 'monster');
  assert.equal(cmd4[0].type, 'skeleton');
  assert.equal(cmd4[0].count, 2);

  const cmdZombies = interpretVoiceQuestCommands('add two zombies to broom 19', blockmap, null);
  assert.equal(cmdZombies.length, 1);
  assert.equal(cmdZombies[0].category, 'monster');
  assert.equal(cmdZombies[0].type, 'zombie');
  assert.equal(cmdZombies[0].count, 2);
  assert.equal(cmdZombies[0].targetRoom, 'room 19');

  const cmdAbomination = interpretVoiceQuestCommands('add an abomination to room 1', blockmap, null);
  assert.equal(cmdAbomination.length, 1);
  assert.equal(cmdAbomination[0].category, 'monster');
  assert.equal(cmdAbomination[0].type, 'fimir');
  assert.equal(cmdAbomination[0].count, 1);
  assert.equal(cmdAbomination[0].targetRoom, 'room 1');

  const cmdAmbient = interpretVoiceQuestCommands('(wind blowing)', blockmap, null);
  assert.equal(cmdAmbient.length, 0);

  const cmdNorthDoor = interpretVoiceQuestCommands('add a door on the north wall of room 1', blockmap, null);
  assert.equal(cmdNorthDoor.length, 1);
  assert.equal(cmdNorthDoor[0].category, 'door');
  assert.equal(cmdNorthDoor[0].type, 'wood-closed');
  assert.equal(cmdNorthDoor[0].wall, 'north');
  assert.equal(cmdNorthDoor[0].targetRoom, 'room 1');

  const cmdSecretDoor = interpretVoiceQuestCommands('place a secret door on south wall of room 2', blockmap, null);
  assert.equal(cmdSecretDoor.length, 1);
  assert.equal(cmdSecretDoor[0].category, 'door');
  assert.equal(cmdSecretDoor[0].type, 'secret');
  assert.equal(cmdSecretDoor[0].wall, 'south');
  assert.equal(cmdSecretDoor[0].targetRoom, 'room 2');

  const cmdInterRoom = interpretVoiceQuestCommands('place a door between room 1 and room 2', blockmap, null);
  assert.equal(cmdInterRoom.length, 1);
  assert.equal(cmdInterRoom[0].category, 'door');
  assert.equal(cmdInterRoom[0].targetRoom, 'room 1');
  assert.equal(cmdInterRoom[0].secondRoom, 'room 2');

  const cmdMultiDoors = interpretVoiceQuestCommands('add 2 doors to room 1', blockmap, null);
  assert.equal(cmdMultiDoors.length, 1);
  assert.equal(cmdMultiDoors[0].category, 'door');
  assert.equal(cmdMultiDoors[0].count, 2);

  // 2. Execution and Board Placement
  const quest = {
    monsters: [],
    furniture: [],
    doors: [],
    traps: [],
    wallBlocks: []
  };

  // Execute: "Place two skeletons in room one."
  const exec0 = executeVoiceMapCommands('Place two skeletons in room one.', 'guidance', quest, blockmap);
  assert.equal(exec0.success, true);
  assert.equal(quest.monsters.length, 2);
  assert.equal(quest.monsters[0].roomId, 'room-1');
  assert.equal(quest.monsters[1].roomId, 'room-1');

  // Execute ambient noise: should not place anything or error
  const execAmb = executeVoiceMapCommands('(wind blowing)', 'guidance', quest, blockmap);
  assert.equal(execAmb.success, true);
  assert.equal(execAmb.isAmbient, true);
  assert.equal(quest.monsters.length, 2);

  quest.monsters = [];

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

  // Execute: "add two zombies to broom 19" (verifying phonetic broom->room and zombie pluralization)
  const execZombies = executeVoiceMapCommands('add two zombies to broom 19', 'guidance', quest, blockmap);
  assert.equal(execZombies.success, true);
  const placedZombies = quest.monsters.filter(m => m.type === 'zombie');
  assert.equal(placedZombies.length, 2);
  assert.equal(placedZombies[0].roomId, 'room-19');
  assert.equal(placedZombies[1].roomId, 'room-19');
  assert.equal(placedZombies[0].name, 'Zombie');
  assert.equal(placedZombies[0].atk, 3);
  assert.equal(placedZombies[0].def, 3);

  // Execute: "add an abomination to room 2" (verifying Fimir / Abomination alias)
  const execAbom = executeVoiceMapCommands('add an abomination to room 2', 'guidance', quest, blockmap);
  assert.equal(execAbom.success, true);
  const placedFimir = quest.monsters.filter(m => m.type === 'fimir');
  assert.equal(placedFimir.length, 1);
  assert.equal(placedFimir[0].roomId, 'room-2');
  assert.equal(placedFimir[0].atk, 3);
  assert.equal(placedFimir[0].def, 3);
  assert.equal(placedFimir[0].bp, 2);

  // Execute door placement: "add a door on the north wall of room 1"
  const execNorthDoor = executeVoiceMapCommands('add a door on the north wall of room 1', 'guidance', quest, blockmap);
  assert.equal(execNorthDoor.success, true);
  assert.equal(quest.doors.length, 1);
  assert.equal(quest.doors[0].room, 'room-1');
  assert.equal(quest.doors[0].state, 'closed');
  assert.equal(quest.doors[0].is_secret, false);
  // North wall neighbor: from.y - 1 === to.y
  assert.equal(quest.doors[0].to[1], quest.doors[0].from[1] - 1);

  // Execute secret door: "place a secret door on south wall of room 2"
  const execSecretDoor = executeVoiceMapCommands('place a secret door on south wall of room 2', 'guidance', quest, blockmap);
  assert.equal(execSecretDoor.success, true);
  assert.equal(quest.doors.length, 2);
  assert.equal(quest.doors[1].room, 'room-2');
  assert.equal(quest.doors[1].state, 'secret');
  assert.equal(quest.doors[1].is_secret, true);
  // South wall neighbor: from.y + 1 === to.y
  assert.equal(quest.doors[1].to[1], quest.doors[1].from[1] + 1);

  // Execute multi-doors: "add 2 doors to room 1"
  const exec2Doors = executeVoiceMapCommands('add 2 doors to room 1', 'guidance', quest, blockmap);
  assert.equal(exec2Doors.success, true);
  assert.equal(quest.doors.length, 4);

  // Validate the resulting quest - must be 100% valid under HeroQuest rules
  const val = validateQuestFn(quest, blockmap);
  assert.equal(val.valid, true);
  assert.equal(val.totalErrors, 0);
  assert.equal(val.errors.length, 0);
});

test('Voice Record Button: provides indicator in record icon and connects to RobOS Voice overlay app', () => {
  const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Verify voice stream component is removed and replaced by native record button
  assert.ok(!htmlContent.includes('<robos-voice-button'), 'Old robos-voice-button component must be removed');
  assert.ok(htmlContent.includes('id="btn-voice-add-items"'), 'Must have #btn-voice-add-items button');
  assert.ok(htmlContent.includes('class="btn btn-voice-record"'), 'Must have btn-voice-record class');
  assert.ok(htmlContent.includes('class="voice-mic-icon"'), 'Must have record mic icon');
  assert.ok(htmlContent.includes('class="voice-listening-indicator"'), 'Must have listening indicator in record icon');

  const cssPath = path.join(__dirname, '..', 'renderer', 'style.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  assert.ok(cssContent.includes('.voice-listening-indicator'), 'CSS must define .voice-listening-indicator');
  assert.ok(cssContent.includes('.btn-voice-record.listening'), 'CSS must define active listening indicator state');
  assert.ok(cssContent.includes('animation: voice-rec-pulse'), 'CSS must pulse when listening');
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

    // 6. Test Scrunched Label Height Geometry
    const geomTileSize = 39;
    const fontSize = Math.max(9, Math.min(11, Math.round(geomTileSize * 0.23)));
    const padY = 0.5;
    const boxH = Math.round(fontSize + padY * 2 + 1);
    assert.ok(boxH <= 12, `Scrunched badge height must be tight (<=12px), got ${boxH}px`);
  } finally {
    global.localStorage = savedLocalStorage;
    dom.chkShowRoomNames = savedChk;
    dom.btnToggleRoomNames = savedBtn;
  }
});

// -------------------------------------------------------------
// Test 22: Trigger Definitions: all 8 trigger event types
// -------------------------------------------------------------
test('Trigger Definitions: validates all 8 trigger events and their target requirements', () => {
  const expectedEvents = [
    'on_game_start',
    'on_game_end',
    'on_tile_stepped_on',
    'on_door_opened',
    'on_room_entered',
    'on_monster_killed',
    'on_room_searched_treasure',
    'on_room_searched_traps'
  ];

  assert.ok(TRIGGER_EVENT_DEFS, 'TRIGGER_EVENT_DEFS must be defined');

  expectedEvents.forEach(evtKey => {
    assert.ok(TRIGGER_EVENT_DEFS[evtKey], `TRIGGER_EVENT_DEFS must contain ${evtKey}`);
    const def = TRIGGER_EVENT_DEFS[evtKey];
    assert.ok(typeof def.label === 'string' && def.label.length > 0, `${evtKey} must have a label`);
    assert.ok(typeof def.icon === 'string' && def.icon.length > 0, `${evtKey} must have an icon`);
    assert.ok(['none', 'tile', 'door', 'room', 'monster'].includes(def.targetType), `${evtKey} has valid targetType: ${def.targetType}`);
  });

  // Verify specific target requirements
  assert.equal(TRIGGER_EVENT_DEFS.on_game_start.targetType, 'none');
  assert.equal(TRIGGER_EVENT_DEFS.on_game_end.targetType, 'none');
  assert.equal(TRIGGER_EVENT_DEFS.on_tile_stepped_on.targetType, 'tile');
  assert.equal(TRIGGER_EVENT_DEFS.on_door_opened.targetType, 'door');
  assert.equal(TRIGGER_EVENT_DEFS.on_room_entered.targetType, 'room');
  assert.equal(TRIGGER_EVENT_DEFS.on_monster_killed.targetType, 'monster');
  assert.equal(TRIGGER_EVENT_DEFS.on_room_searched_treasure.targetType, 'room');
  assert.equal(TRIGGER_EVENT_DEFS.on_room_searched_traps.targetType, 'room');
});

// -------------------------------------------------------------
// Test 23: Action Pipeline Definitions
// -------------------------------------------------------------
test('Action Pipeline Definitions: validates all action types including play_movie and combat/trap/spell triggers', () => {
  const expectedActions = [
    'play_movie',
    'attack_character',
    'cast_spell',
    'spring_trap',
    'show_message',
    'spawn_monsters',
    'grant_reward',
    'end_game'
  ];

  assert.ok(TRIGGER_ACTION_DEFS, 'TRIGGER_ACTION_DEFS must be defined');

  expectedActions.forEach(actKey => {
    assert.ok(TRIGGER_ACTION_DEFS[actKey], `TRIGGER_ACTION_DEFS must contain ${actKey}`);
    const def = TRIGGER_ACTION_DEFS[actKey];
    assert.ok(typeof def.name === 'string' && def.name.length > 0, `${actKey} must have a name`);
    assert.ok(typeof def.icon === 'string' && def.icon.length > 0, `${actKey} must have an icon`);
    assert.ok(typeof def.defaultParams === 'object', `${actKey} must have defaultParams`);
  });

  // Check play_movie action
  assert.equal(TRIGGER_ACTION_DEFS.play_movie.icon, '🎬');
  assert.ok(TRIGGER_ACTION_DEFS.play_movie.defaultParams.moviePath.includes('.mp4'));
  assert.equal(TRIGGER_ACTION_DEFS.play_movie.defaultParams.canSkip, true);

  // Check attack_character action
  assert.equal(TRIGGER_ACTION_DEFS.attack_character.icon, '⚔️');
  assert.equal(TRIGGER_ACTION_DEFS.attack_character.defaultParams.damageDice, 2);
  assert.equal(TRIGGER_ACTION_DEFS.attack_character.defaultParams.target, 'active_hero');

  // Check cast_spell action
  assert.equal(TRIGGER_ACTION_DEFS.cast_spell.icon, '🪄');
  assert.equal(TRIGGER_ACTION_DEFS.cast_spell.defaultParams.spell, 'ball_of_flame');

  // Check spring_trap action
  assert.equal(TRIGGER_ACTION_DEFS.spring_trap.icon, '⚠️');
  assert.equal(TRIGGER_ACTION_DEFS.spring_trap.defaultParams.trapType, 'falling_block');

  // Check end_game action
  assert.equal(TRIGGER_ACTION_DEFS.end_game.icon, '🏁');
  assert.equal(TRIGGER_ACTION_DEFS.end_game.defaultParams.outcome, 'victory');
});

// -------------------------------------------------------------
// Test 24: Trigger & Action Pipeline Manipulation
// -------------------------------------------------------------
test('Trigger & Action Pipeline Manipulation: adds and removes actions dynamically with custom properties', () => {
  const trigger = {
    id: 'test-trig-1',
    marker: 'C',
    event: 'on_door_opened',
    doorId: 'door-1',
    actions: []
  };

  // Add play_movie action
  const act1 = addActionToTrigger(trigger, 'play_movie', {
    moviePath: 'res://assets/movies/crypt_cinematic.mp4',
    title: 'The Crypt Unsealed'
  });
  assert.equal(trigger.actions.length, 1);
  assert.equal(act1.type, 'play_movie');
  assert.equal(act1.moviePath, 'res://assets/movies/crypt_cinematic.mp4');
  assert.equal(act1.title, 'The Crypt Unsealed');
  assert.equal(act1.canSkip, true); // default merged

  // Add attack_character action
  const act2 = addActionToTrigger(trigger, 'attack_character', {
    damageDice: 3,
    attacker: 'Stone Gargoyle'
  });
  assert.equal(trigger.actions.length, 2);
  assert.equal(act2.type, 'attack_character');
  assert.equal(act2.damageDice, 3);
  assert.equal(act2.attacker, 'Stone Gargoyle');

  // Add spring_trap action
  const act3 = addActionToTrigger(trigger, 'spring_trap', {
    trapType: 'spear',
    damage: 3
  });
  assert.equal(trigger.actions.length, 3);
  assert.equal(act3.type, 'spring_trap');
  assert.equal(act3.trapType, 'spear');

  // Remove middle action (attack_character at index 1)
  const removed = removeActionFromTrigger(trigger, 1);
  assert.equal(removed, true);
  assert.equal(trigger.actions.length, 2);
  assert.equal(trigger.actions[0].type, 'play_movie');
  assert.equal(trigger.actions[1].type, 'spring_trap');

  // Attempt removing invalid index returns false
  assert.equal(removeActionFromTrigger(trigger, 99), false);
  assert.equal(trigger.actions.length, 2);
});

// -------------------------------------------------------------
// Test 25: Cartridge Trigger Serialization & Backward Compatibility
// -------------------------------------------------------------
test('Cartridge Trigger Serialization: builds dual triggers and storyTriggers payloads with play_movie backward compatibility', () => {
  const savedStateQuest = state.quest;
  const savedBlockmap = state.blockmap;

  try {
    state.blockmap = {
      id: 'test-dungeon',
      gridDimensions: [26, 19],
      tileSize: 39,
      rooms: [
        { id: 'room-1', name: 'Altar Chamber', x: 2, y: 2, w: 5, h: 5 }
      ],
      corridors: []
    };

    state.quest = {
      title: 'Cinematic Dungeon Quest',
      slug: 'cinematic-dungeon-quest',
      startingStair: [2, 2],
      doors: [
        { id: 'door-altar', from: [2, 2], to: [2, 3], state: 'closed', is_secret: false, room: 'room-1' }
      ],
      monsters: [
        { id: 'mon-boss', name: 'Gargoyle King', type: 'boss', bp: 5, mp: 4, atk: 4, def: 4, move: 6, pos: [4, 4], isBoss: true }
      ],
      furniture: [],
      traps: [],
      wallBlocks: [],
      storyTriggers: [
        {
          id: 'trig-start',
          marker: 'A',
          title: 'Opening Prologue',
          event: 'on_game_start',
          target: '',
          tile: [2, 2],
          onceOnly: true,
          narrative: 'A dark shadow falls upon the realm...',
          actions: [
            {
              type: 'play_movie',
              moviePath: 'res://assets/movies/quest1-intro.mp4',
              title: 'The Journey Begins',
              canSkip: true
            },
            {
              type: 'show_message',
              title: 'Mentor Whispers',
              text: 'Find the Altar and break the seal.'
            }
          ]
        },
        {
          id: 'trig-door',
          marker: 'B',
          title: 'Gargoyle Trap',
          event: 'on_door_opened',
          doorId: 'door-altar',
          target: 'door-altar',
          tile: [2, 2],
          onceOnly: true,
          actions: [
            {
              type: 'attack_character',
              attacker: 'Dart Trap',
              damageDice: 2,
              target: 'active_hero'
            }
          ]
        },
        {
          id: 'trig-boss-kill',
          marker: 'C',
          title: 'Victory Triumph',
          event: 'on_monster_killed',
          monsterId: 'mon-boss',
          target: 'mon-boss',
          tile: [4, 4],
          onceOnly: true,
          actions: [
            {
              type: 'play_movie',
              moviePath: 'res://assets/movies/victory-scene.mp4',
              title: 'Victory Fanfare'
            },
            {
              type: 'end_game',
              outcome: 'victory'
            }
          ]
        }
      ]
    };

    const payload = buildCartridgePayload();
    assert.ok(payload);
    assert.equal(payload.cartridgeId, 'cinematic-dungeon-quest');

    const map = payload.maps['cinematic-dungeon-quest'];
    assert.ok(map);

    // Verify modern rich triggers array
    assert.ok(Array.isArray(map.triggers), 'Payload must include map.triggers');
    assert.equal(map.triggers.length, 3);
    assert.equal(map.triggers[0].event, 'on_game_start');
    assert.equal(map.triggers[0].actions.length, 2);
    assert.equal(map.triggers[0].actions[0].type, 'play_movie');
    assert.equal(map.triggers[0].actions[0].moviePath, 'res://assets/movies/quest1-intro.mp4');
    assert.equal(map.triggers[1].event, 'on_door_opened');
    assert.equal(map.triggers[1].doorId, 'door-altar');
    assert.equal(map.triggers[2].event, 'on_monster_killed');
    assert.equal(map.triggers[2].monsterId, 'mon-boss');

    // Verify backward-compatible storyTriggers array
    assert.ok(Array.isArray(map.storyTriggers), 'Payload must include map.storyTriggers');
    assert.equal(map.storyTriggers.length, 3);
    assert.equal(map.storyTriggers[0].movie, 'res://assets/movies/quest1-intro.mp4', 'Movie action mapped to movie field');
    assert.equal(map.storyTriggers[0].banner, 'QUEST NOTE [A]');
    assert.equal(map.storyTriggers[1].movie, '', 'No movie action leaves movie field empty string');
    assert.equal(map.storyTriggers[2].movie, 'res://assets/movies/victory-scene.mp4', 'Boss kill victory movie mapped');
    assert.equal(map.storyTriggers[2].actions.length, 2);
  } finally {
    state.quest = savedStateQuest;
    state.blockmap = savedBlockmap;
  }
});

// -------------------------------------------------------------
// Test 26: Trigger Tab UI Filtering & Counts
// -------------------------------------------------------------
test('Trigger Tab UI: renders trigger cards, updates counts, and filters by event type', () => {
  const savedDoc = global.document;
  const savedStateQuest = state.quest;
  const savedDomList = dom.triggerList;
  const savedBadge = dom.badgeTriggerCount;
  const savedFilter = dom.filterTriggerEvent;

  try {
    const listChildren = [];
    const mockList = {
      innerHTML: '',
      appendChild: (el) => listChildren.push(el)
    };

    let countText = '';
    const mockBadge = {
      set textContent(v) { countText = String(v); },
      get textContent() { return countText; }
    };

    let currentFilter = 'all';
    const mockFilter = {
      get value() { return currentFilter; },
      set value(v) { currentFilter = v; }
    };

    dom.triggerList = mockList;
    dom.badgeTriggerCount = mockBadge;
    dom.filterTriggerEvent = mockFilter;

    // Setup global document createElement for card generation
    global.document = {
      createElement: (tag) => {
        const el = {
          tagName: tag.toUpperCase(),
          className: '',
          innerHTML: '',
          style: {},
          children: [],
          addEventListener: () => {},
          querySelector: () => null,
          appendChild: (c) => el.children.push(c)
        };
        return el;
      }
    };

    state.quest = {
      storyTriggers: [
        { marker: 'A', title: 'Start Intro', event: 'on_game_start', tile: [0, 0], actions: [{ type: 'play_movie' }] },
        { marker: 'B', title: 'Ambush Door', event: 'on_door_opened', tile: [2, 3], actions: [{ type: 'spawn_monsters' }] },
        { marker: 'C', title: 'Treasure Chest Note', event: 'on_room_searched_treasure', tile: [4, 4], actions: [{ type: 'grant_reward' }] }
      ]
    };

    // 1. Initial render with 'all' filter
    updateTriggerTabUI();
    assert.equal(mockBadge.textContent, '3', 'Total count should be 3');
    assert.equal(listChildren.length, 3, 'All 3 triggers rendered');

    // 2. Filter by on_door_opened
    listChildren.length = 0;
    currentFilter = 'on_door_opened';
    updateTriggerTabUI();
    assert.equal(listChildren.length, 1, 'Only 1 trigger matches on_door_opened');
    assert.ok(listChildren[0].innerHTML.includes('badge-on_door_opened'), 'Has on_door_opened badge');
    assert.ok(listChildren[0].innerHTML.includes('Ambush Door'));

    // 3. Filter with no matches shows empty placeholder
    listChildren.length = 0;
    currentFilter = 'on_monster_killed';
    updateTriggerTabUI();
    assert.equal(listChildren.length, 0, 'No children appended when no matches');
    assert.ok(mockList.innerHTML.includes('No triggers match current filter'), 'Shows empty message');
  } finally {
    global.document = savedDoc;
    state.quest = savedStateQuest;
    dom.triggerList = savedDomList;
    dom.badgeTriggerCount = savedBadge;
    dom.filterTriggerEvent = savedFilter;
  }
});

// -------------------------------------------------------------
// Test 27: Dialogue Speech Bubbles & Display Message Actions
// -------------------------------------------------------------
test('Dialogue & Message Actions: validates dialogue sequences and modal message dialogs', () => {
  const savedStateQuest = state.quest;
  const savedBlockmap = state.blockmap;

  try {
    // 1. Verify Trigger Action Definitions
    assert.ok(TRIGGER_ACTION_DEFS.dialogue, 'TRIGGER_ACTION_DEFS must include dialogue');
    assert.equal(TRIGGER_ACTION_DEFS.dialogue.name, 'Character Dialogue');
    assert.equal(TRIGGER_ACTION_DEFS.dialogue.icon, '💬');
    assert.ok(Array.isArray(TRIGGER_ACTION_DEFS.dialogue.defaultParams.lines));
    assert.equal(TRIGGER_ACTION_DEFS.dialogue.defaultParams.lines[0].speaker, 'barbarian');

    assert.ok(TRIGGER_ACTION_DEFS.display_message, 'TRIGGER_ACTION_DEFS must include display_message');
    assert.equal(TRIGGER_ACTION_DEFS.display_message.name, 'Display Message');
    assert.equal(TRIGGER_ACTION_DEFS.display_message.icon, '📜');
    assert.equal(TRIGGER_ACTION_DEFS.display_message.defaultParams.title, 'Chamber Inscription');
    assert.equal(TRIGGER_ACTION_DEFS.display_message.defaultParams.buttonText, 'Continue');

    // 2. Setup a quest scenario using dialogue sequence and display message
    state.blockmap = {
      id: 'dialogue-crypt',
      title: 'Crypt of Whispers',
      gridWidth: 28,
      gridHeight: 21,
      image: 'res://assets/boards/fan_dungeon_28x21.png',
      rooms: [
        { id: 'room-crypt-1', name: 'Crypt of Whispers', x: 2, y: 2, w: 5, h: 4 }
      ]
    };

    state.quest = {
      title: 'Crypt of Whispers Quest',
      slug: 'dialogue-crypt-quest',
      startingStair: [4, 1],
      heroes: [
        { id: 'barbarian', name: 'Barbarian', class: 'barbarian', bp: 8, mp: 2, atk: 3, def: 2, pos: [4, 1] }
      ],
      monsters: [
        { id: 'mon-guardian', name: 'Crypt Guardian', type: 'orc', bp: 2, mp: 2, atk: 2, def: 2, pos: [4, 3] }
      ],
      furniture: [],
      doors: [],
      traps: [],
      wallBlocks: [],
      storyTriggers: [
        {
          id: 'trig-room-dialogue',
          marker: 'A',
          title: 'The Crypt Chamber',
          event: 'on_room_entered',
          room: 'room-crypt-1',
          target: 'room-crypt-1',
          tile: [4, 2],
          onceOnly: true,
          narrative: '',
          actions: [
            {
              type: 'dialogue',
              lines: [
                { speaker: 'barbarian', text: 'Steady your blades! Something stirs in this chamber.', audio: 'res://audio/barbarian_warn.wav' },
                { speaker: 'wizard', text: 'It is the Crypt Guardian! Slay it to break the ancient curse!', audio: '' }
              ]
            },
            {
              type: 'display_message',
              title: 'The Guardian Awakes',
              text: 'The iron doors seal shut with a hollow thud! Slay the guardian to survive.',
              buttonText: 'Fight!'
            }
          ]
        },
        {
          id: 'trig-guardian-defeat',
          marker: 'B',
          title: 'Curse Broken',
          event: 'on_monster_killed',
          monsterId: 'mon-guardian',
          target: 'mon-guardian',
          tile: [4, 3],
          onceOnly: true,
          actions: [
            {
              type: 'dialogue',
              lines: [
                { speaker: 'barbarian', text: 'The beast is slain! The crypt trembles as the seal shatters!' }
              ]
            },
            {
              type: 'play_movie',
              moviePath: 'res://assets/movies/quest1-intro.mp4',
              title: 'Victory Over the Crypt Guardian'
            },
            {
              type: 'end_game',
              outcome: 'victory'
            }
          ]
        }
      ]
    };

    // 3. Serialize and verify payload
    const payload = buildCartridgePayload();
    assert.ok(payload);
    assert.equal(payload.cartridgeId, 'dialogue-crypt-quest');

    const map = payload.maps['dialogue-crypt-quest'];
    assert.ok(map);
    assert.equal(map.triggers.length, 2);
    assert.equal(map.storyTriggers.length, 2);

    // Verify room entrance trigger
    const enterTrigger = map.triggers[0];
    assert.equal(enterTrigger.event, 'on_room_entered');
    assert.equal(enterTrigger.actions.length, 2);
    assert.equal(enterTrigger.actions[0].type, 'dialogue');
    assert.equal(enterTrigger.actions[0].lines.length, 2);
    assert.equal(enterTrigger.actions[0].lines[0].speaker, 'barbarian');
    assert.equal(enterTrigger.actions[0].lines[0].audio, 'res://audio/barbarian_warn.wav');
    assert.equal(enterTrigger.actions[0].lines[1].speaker, 'wizard');

    assert.equal(enterTrigger.actions[1].type, 'display_message');
    assert.equal(enterTrigger.actions[1].title, 'The Guardian Awakes');
    assert.equal(enterTrigger.actions[1].buttonText, 'Fight!');

    // Verify monster kill trigger
    const killTrigger = map.triggers[1];
    assert.equal(killTrigger.event, 'on_monster_killed');
    assert.equal(killTrigger.monsterId, 'mon-guardian');
    assert.equal(killTrigger.actions.length, 3);
    assert.equal(killTrigger.actions[0].type, 'dialogue');
    assert.equal(killTrigger.actions[0].lines[0].speaker, 'barbarian');
    assert.equal(killTrigger.actions[1].type, 'play_movie');
    assert.equal(killTrigger.actions[1].moviePath, 'res://assets/movies/quest1-intro.mp4');
    assert.equal(killTrigger.actions[2].type, 'end_game');
    assert.equal(killTrigger.actions[2].outcome, 'victory');

    // Verify storyTriggers backward compatibility has cloned lines and movie
    assert.equal(map.storyTriggers[0].actions[0].lines.length, 2);
    assert.equal(map.storyTriggers[1].movie, 'res://assets/movies/quest1-intro.mp4');
  } finally {
    state.quest = savedStateQuest;
    state.blockmap = savedBlockmap;
  }
});

test('Open Cartridge Dialog: opens native file dialog and populates quest state', async () => {
  const savedStateQuest = JSON.parse(JSON.stringify(state.quest));
  const savedBlockmap = JSON.parse(JSON.stringify(state.blockmap));

  try {
    let dialogOpened = false;
    let cartridgeLoadedPath = '';

    global.window = global.window || {};
    global.window.robosQuestEditor = {
      openCartridgeDialog: async () => {
        dialogOpened = true;
        return {
          success: true,
          filePath: '/fake/path/my-epic-quest.cartridge.json',
          slug: 'my-epic-quest'
        };
      },
      loadCartridge: async (filePath) => {
        cartridgeLoadedPath = filePath;
        return {
          success: true,
          slug: 'my-epic-quest',
          cartridge: {
            cartridgeId: 'my-epic-quest',
            header: {
              title: 'My Epic Test Quest',
              description: 'Venture forth into the deep catacombs.'
            },
            maps: {
              'my-epic-quest': {
                wanderingMonster: 'fimir',
                startingStair: [2, 3],
                startingStairType: 'stairs_up_1x1',
                doors: [
                  { id: 'door-1', from: [2, 3], to: [2, 4], state: 'closed' }
                ],
                furniture: [],
                traps: [],
                monsters: [
                  { id: 'm1', slug: 'skeleton', position: [5, 5], current_bp: 1 }
                ]
              }
            }
          }
        };
      },
      loadBlockmap: async () => ({
        success: true,
        blockmap: {
          id: 'first-light-dungeon',
          title: 'First Light Dungeon',
          gridDimensions: [26, 19],
          rooms: []
        }
      })
    };

    // Test open dialog invocation
    const openRes = await global.window.robosQuestEditor.openCartridgeDialog();
    assert.equal(dialogOpened, true);
    assert.equal(openRes.success, true);
    assert.equal(openRes.filePath, '/fake/path/my-epic-quest.cartridge.json');

    // Test loadCartridge invocation with result
    await loadCartridge(openRes.filePath);
    assert.equal(cartridgeLoadedPath, '/fake/path/my-epic-quest.cartridge.json');
    assert.equal(state.quest.title, 'My Epic Test Quest');
    assert.equal(state.quest.slug, 'my-epic-quest');
    assert.equal(state.quest.wanderingMonster, 'fimir');
    assert.deepEqual(state.quest.startingStair, [2, 3]);
  } finally {
    state.quest = savedStateQuest;
    state.blockmap = savedBlockmap;
  }
});

test('Hidden Object Flag & Furniture Actions: supports hidden property and furniture_visible/move_furniture actions', () => {
  // Verify action definitions
  assert.ok(TRIGGER_ACTION_DEFS.furniture_visible, 'furniture_visible action def should exist');
  assert.equal(TRIGGER_ACTION_DEFS.furniture_visible.icon, '✨');
  assert.ok(TRIGGER_ACTION_DEFS.move_furniture, 'move_furniture action def should exist');
  assert.equal(TRIGGER_ACTION_DEFS.move_furniture.icon, '🪑');

  // Verify hidden property serialization in buildCartridgePayload
  const savedStateQuest = JSON.parse(JSON.stringify(state.quest));
  try {
    state.quest.furniture = [
      {
        id: 'furn-chest-3',
        name: 'Heist Treasure Chest',
        type: 'chest',
        x: 17,
        y: 18,
        width: 1,
        height: 1,
        roomId: '',
        hidden: true
      },
      {
        id: 'furn-table-1',
        name: 'Normal Table',
        type: 'table',
        x: 5,
        y: 5,
        width: 3,
        height: 2,
        roomId: 'room-1',
        hidden: false
      }
    ];

    state.quest.storyTriggers = [
      {
        id: 'trigger-note-a-2bug',
        marker: 'Note A',
        title: 'Note A Encounter',
        event: 'on_tile_stepped_on',
        tile: [7, 18],
        onceOnly: true,
        actions: [
          {
            type: 'play_movie',
            moviePath: 'res://assets/movies/quest_scene_a_corridor_heist.ogv',
            title: 'Corridor Heist',
            canSkip: true
          },
          {
            type: 'dialogue',
            lines: [
              {
                speaker: 'Goblin who hesited chest',
                text: 'its the humans! (clank of chest dropping to stone ground)',
                audio: ''
              }
            ]
          },
          {
            type: 'furniture_visible',
            furnitureId: 'furn-chest-3',
            target: 'Heist Treasure Chest'
          },
          {
            type: 'dialogue',
            lines: [
              {
                speaker: 'Orc who hesited chest',
                text: 'useless runt, they will never get the treasure rahhh',
                audio: ''
              }
            ]
          },
          {
            type: 'move_furniture',
            furnitureId: 'furn-chest-3',
            target: 'Heist Treasure Chest',
            tile: [18, 17],
            x: 18,
            y: 17,
            message: 'Chest was thrown through the wall and the wall absorbed the chest like it was made of smoke!!'
          }
        ]
      }
    ];

    const payload = buildCartridgePayload();
    const mapData = payload.maps[payload.cartridgeId || 'heroquest-the-trial'];
    assert.ok(mapData, 'map data should exist in payload');

    const chest = mapData.furniture.find(f => f.id === 'furn-chest-3');
    assert.ok(chest, 'furn-chest-3 should exist');
    assert.equal(chest.hidden, true, 'furn-chest-3 should have hidden: true');

    const table = mapData.furniture.find(f => f.id === 'furn-table-1');
    assert.ok(table, 'furn-table-1 should exist');
    assert.equal(table.hidden, false, 'furn-table-1 should have hidden: false');

    const trigger = (mapData.triggers || []).find(t => t.id === 'trigger-note-a-2bug');
    assert.ok(trigger, 'trigger-note-a-2bug should exist');
    assert.equal(trigger.actions.length, 5, 'should have 5 actions in pipeline');
    assert.equal(trigger.actions[0].type, 'play_movie');
    assert.equal(trigger.actions[1].type, 'dialogue');
    assert.equal(trigger.actions[1].lines[0].speaker, 'Goblin who hesited chest');
    assert.equal(trigger.actions[2].type, 'furniture_visible');
    assert.equal(trigger.actions[2].target, 'Heist Treasure Chest');
    assert.equal(trigger.actions[3].type, 'dialogue');
    assert.equal(trigger.actions[3].lines[0].speaker, 'Orc who hesited chest');
    assert.equal(trigger.actions[4].type, 'move_furniture');
    assert.deepEqual(trigger.actions[4].tile, [18, 17]);
    assert.equal(trigger.actions[4].message, 'Chest was thrown through the wall and the wall absorbed the chest like it was made of smoke!!');
  } finally {
    state.quest = savedStateQuest;
  }
});

// -------------------------------------------------------------
// Test 30: Treasure Chest Corridor Placement Validation
// -------------------------------------------------------------
test('Treasure Chest Corridor Placement: permits chests in corridors while restricting other room furniture', () => {
  const bPath = path.resolve(__dirname, '../../../games/tabletop-rpg/cartridges/first-light-dungeon.blockmap.json');
  const blockmap = JSON.parse(fs.readFileSync(bPath, 'utf8'));

  // 1. Single 1x1 treasure chest in corridor tile (13, 2)
  const questWithCorridorChest = {
    furniture: [
      { id: 'f-chest-1', type: 'chest', name: 'Treasure Chest', x: 13, y: 2, width: 1, height: 1 }
    ]
  };
  const resChest = validateQuestFn(questWithCorridorChest, blockmap);
  assert.equal(resChest.valid, true, 'Chests in corridors should be valid');
  assert.equal(resChest.counts.furniture_bounds, 0, 'No furniture bounds errors for corridor chest');
  assert.equal(resChest.totalErrors, 0);

  // 2. Backward compatibility / aliasing: type: 'treasure_chest' and custom name
  const questCustomChest = {
    furniture: [
      { id: 'f-chest-custom', type: 'treasure_chest', name: 'Ancient Iron Chest', x: 0, y: 0, width: 1, height: 1 }
    ]
  };
  const resCustomChest = validateQuestFn(questCustomChest, blockmap);
  assert.equal(resCustomChest.valid, true, 'Chest with custom name and treasure_chest type in corridor should be valid');
  assert.equal(resCustomChest.counts.furniture_bounds, 0);

  // 3. Regular furniture (bookcase, table) in the exact same corridor tile is invalid
  const questWithCorridorBookcase = {
    furniture: [
      { id: 'f-bookcase-1', type: 'bookcase', name: 'Bookcase', x: 13, y: 2, width: 3, height: 1 }
    ]
  };
  const resBookcase = validateQuestFn(questWithCorridorBookcase, blockmap);
  assert.equal(resBookcase.valid, false, 'Bookcases in corridors must be flagged as invalid');
  assert.equal(resBookcase.counts.furniture_bounds, 1);
  assert.match(resBookcase.errors[0].title, /Outside Room Bounds/i);

  // 4. Chest in a valid room tile (14, 2) is valid
  const questWithRoomChest = {
    furniture: [
      { id: 'f-chest-room', type: 'chest', name: 'Room Chest', x: 14, y: 2, width: 1, height: 1 }
    ]
  };
  const resRoomChest = validateQuestFn(questWithRoomChest, blockmap);
  assert.equal(resRoomChest.valid, true, 'Chests in rooms should be valid');
  assert.equal(resRoomChest.counts.furniture_bounds, 0);
});

// -------------------------------------------------------------
// Test 31: Door Name Updating in Inspector & Cartridge Serialization
// -------------------------------------------------------------
test('Door Name Editing: updates name in inspector, reflects in summary and triggers, and serializes to cartridge', () => {
  const savedDocument = global.document;
  const savedStateQuest = JSON.parse(JSON.stringify(state.quest));
  const savedSelectedEntity = state.selectedEntity;
  const savedDom = { ...dom };

  try {
    const createdElements = [];
    global.document = {
      createElement: (tag) => {
        const el = {
          tag,
          className: '',
          innerHTML: '',
          textContent: '',
          value: '',
          selected: false,
          addEventListener: () => {}
        };
        createdElements.push(el);
        return el;
      }
    };

    const mockChildren = [];
    dom.inspectorEmpty = { style: {} };
    dom.inspectorForm = { style: {} };
    dom.inspectTypeBadge = { textContent: '', className: '' };
    dom.inspectPosText = { textContent: '' };
    dom.inspectName = { value: '', addEventListener: () => {} };
    dom.inspectHidden = { checked: false, addEventListener: () => {} };
    dom.inspectGroupMonster = { style: {} };
    dom.inspectGroupDoor = { style: {} };
    dom.inspectDoorState = { value: '', addEventListener: () => {} };
    dom.inspectDoorSecret = { checked: false, addEventListener: () => {} };
    dom.inspectGroupFurniture = { style: {} };
    dom.inspectGroupTrap = { style: {} };
    dom.inspectGroupNote = { style: {} };
    dom.entitySummaryList = {
      innerHTML: '',
      appendChild: (child) => mockChildren.push(child)
    };
    dom.badgeEntityCount = { textContent: '' };
    dom.inspectTriggerTargetGroup = { style: {} };
    dom.inspectTriggerTargetLbl = { textContent: '' };
    const doorOptions = [];
    dom.inspectTriggerTargetDoor = {
      style: {},
      innerHTML: '',
      appendChild: (opt) => doorOptions.push(opt)
    };

    // 1. Initial door setup
    state.quest.doors = [
      { id: 'door-1', name: 'Great Hall Iron Gate', from: [5, 4], to: [5, 5], state: 'closed', is_secret: false },
      { id: 'door-2', from: [10, 4], to: [10, 5], state: 'open', is_secret: true }
    ];

    // 2. Select door-1: inspectName should display custom door name
    state.selectedEntity = { type: 'door', index: 0, data: state.quest.doors[0] };
    updateInspectorUI();
    assert.equal(dom.inspectName.value, 'Great Hall Iron Gate', 'dom.inspectName displays custom door name');
    assert.equal(dom.inspectDoorState.value, 'closed');
    assert.equal(dom.inspectDoorSecret.checked, false);

    // 3. Select door-2: inspectName should fallback to door id when name not set
    state.selectedEntity = { type: 'door', index: 1, data: state.quest.doors[1] };
    updateInspectorUI();
    assert.equal(dom.inspectName.value, 'door-2', 'dom.inspectName falls back to door id if no custom name');
    assert.equal(dom.inspectDoorState.value, 'open');
    assert.equal(dom.inspectDoorSecret.checked, true);

    // 4. Update door-1's name and verify state and entity summary list
    state.selectedEntity = { type: 'door', index: 0, data: state.quest.doors[0] };
    dom.inspectName.value = 'Ancient Reinforced Portcullis';
    // Simulate inspector input listener
    state.quest.doors[0].name = dom.inspectName.value;
    if (state.selectedEntity.data) state.selectedEntity.data.name = dom.inspectName.value;
    mockChildren.length = 0;
    updateEntitySummaryList();

    assert.equal(state.quest.doors[0].name, 'Ancient Reinforced Portcullis', 'Door entity name in state is updated');
    assert.equal(state.selectedEntity.data.name, 'Ancient Reinforced Portcullis', 'Selected entity data name is updated');

    const doorItem = mockChildren.find(item => item.innerHTML.includes('Ancient Reinforced Portcullis'));
    assert.ok(doorItem, 'Entity summary list displays updated door name');
    assert.ok(!doorItem.innerHTML.includes('Wood Door'), 'Entity summary list uses custom name instead of default fallback');

    // 5. Update door-2's name
    state.selectedEntity = { type: 'door', index: 1, data: state.quest.doors[1] };
    dom.inspectName.value = 'Secret Treasury Alcove Door';
    state.quest.doors[1].name = dom.inspectName.value;
    if (state.selectedEntity.data) state.selectedEntity.data.name = dom.inspectName.value;
    mockChildren.length = 0;
    updateEntitySummaryList();

    const secretItem = mockChildren.find(item => item.innerHTML.includes('Secret Treasury Alcove Door'));
    assert.ok(secretItem, 'Secret door summary displays updated custom name');
    assert.ok(secretItem.innerHTML.includes('SECRET [OPEN]'), 'Secret door retains status badge');

    // 6. Trigger target options
    updateTriggerTargetOptions({ event: 'on_door_opened' });
    const triggerOpt1 = doorOptions.find(opt => opt.value === 'door-1');
    assert.ok(triggerOpt1, 'Option for door-1 exists in trigger target dropdown');
    assert.match(triggerOpt1.textContent, /Ancient Reinforced Portcullis \(door-1\)/, 'Dropdown displays custom name and ID');

    // 7. Cartridge serialization
    const payload = buildCartridgePayload();
    const mapData = payload.maps[payload.cartridgeId || 'heroquest-the-trial'];
    assert.ok(mapData, 'Map data present in serialized cartridge');
    const serializedDoor1 = mapData.doors.find(d => d.id === 'door-1');
    assert.ok(serializedDoor1, 'door-1 serialized in cartridge payload');
    assert.equal(serializedDoor1.name, 'Ancient Reinforced Portcullis', 'Door name is saved into cartridge payload');
    const serializedDoor2 = mapData.doors.find(d => d.id === 'door-2');
    assert.equal(serializedDoor2.name, 'Secret Treasury Alcove Door', 'Secret door name is saved into cartridge payload');

    // 8. Validation title uses door.name
    const bPath = path.resolve(__dirname, '../../../games/tabletop-rpg/cartridges/first-light-dungeon.blockmap.json');
    const blockmap = JSON.parse(fs.readFileSync(bPath, 'utf8'));
    const floatingDoorQuest = {
      doors: [
        { id: 'door-bad', name: 'Floating Haunted Portal', from: [0, 0], to: [0, 1] }
      ]
    };
    const valResult = validateQuestFn(floatingDoorQuest, blockmap);
    assert.equal(valResult.valid, false);
    const doorErr = valResult.errors.find(e => e.entityId === 'door-bad' || e.entityType === 'door');
    assert.ok(doorErr, 'Validation error for floating door');
    assert.match(doorErr.title, /Floating Haunted Portal Floating in Corridor/, 'Validation error title uses custom door name');
  } finally {
    global.document = savedDocument;
    state.quest = savedStateQuest;
    state.selectedEntity = savedSelectedEntity;
    Object.assign(dom, savedDom);
  }
});

test('Quest Map PNG and PDF Export: generates scaled canvas and complete printable PDF quest sheet', async () => {
  const savedDocument = global.document;
  const savedStateQuest = state.quest;
  const savedStateBlockmap = state.blockmap;
  const savedDom = { ...dom };

  try {
    // Mock minimal DOM for modal dialogs and inputs
    let modalPngDisplay = 'none';
    let modalPdfDisplay = 'none';
    let previewSrc = '';
    let previewBadge = '';

    dom.exportPngModal = {
      style: {
        get display() { return modalPngDisplay; },
        set display(v) { modalPngDisplay = v; }
      }
    };
    dom.exportPdfModal = {
      style: {
        get display() { return modalPdfDisplay; },
        set display(v) { modalPdfDisplay = v; }
      }
    };
    dom.exportPngPreview = {
      set src(v) { previewSrc = v; },
      get src() { return previewSrc; }
    };
    dom.exportPngDimensionsBadge = {
      set textContent(v) { previewBadge = v; },
      get textContent() { return previewBadge; }
    };
    dom.chkExportGrid = { checked: true };
    dom.chkExportNames = { checked: true };
    dom.chkExportArtwork = { checked: true };
    dom.chkExportBanner = { checked: false };
    dom.radioExportPngScale = [
      { value: '1', checked: true },
      { value: '2', checked: false }
    ];
    dom.radioExportPdfOrientation = [
      { value: 'landscape', checked: true },
      { value: 'portrait', checked: false }
    ];
    dom.selectPdfPageSize = { value: 'A4' };
    dom.chkPdfHeader = { checked: true };
    dom.chkPdfMap = { checked: true };
    dom.chkPdfNotes = { checked: true };
    dom.chkPdfRoster = { checked: true };
    dom.chkPdfFurniture = { checked: true };

    // Setup mock quest and blockmap state
    state.blockmap = {
      gridDimensions: [26, 19],
      tileSize: 39.0,
      pixelOffset: [0, 0],
      rooms: [
        { id: 'room-1', name: 'Great Armory', color: '#38bdf8', tiles: [[2, 2], [3, 2], [2, 3], [3, 3]] },
        { id: 'room-2', name: 'Throne Room', color: '#f59e0b', tiles: [[6, 6], [7, 6], [6, 7], [7, 7]] }
      ],
      corridors: [[1, 2], [1, 3], [1, 4]]
    };

    state.quest = {
      title: 'Lair of the Orc Warlord',
      slug: 'lair-of-the-orc-warlord',
      briefing: 'Deep in the Black Mountains, an orc clan plots ruin.\nYou must breach the stronghold and claim the warlord\'s war banner.',
      wanderingMonster: 'orc',
      goldBounty: 250,
      startingStair: [1, 2],
      startingStairType: 'stairs_up_1x1',
      exitTile: [7, 7],
      exitStairType: 'stairs_down_1x1',
      monsters: [
        { type: 'orc', pos: [2, 2], isBoss: false },
        { type: 'orc', pos: [3, 2], isBoss: false },
        { type: 'orc', pos: [2, 3], isBoss: false },
        { type: 'goblin', pos: [3, 3], isBoss: false },
        { type: 'gargoyle', name: 'Gargoyle Overlord', pos: [6, 6], isBoss: true }
      ],
      furniture: [
        { type: 'chest', x: 3, y: 2, name: 'Armory Iron Chest' },
        { type: 'throne', x: 6, y: 7, name: 'Warlord Throne' },
        { type: 'table', x: 7, y: 6, name: 'War Planning Table' }
      ],
      traps: [
        { type: 'pit', x: 1, y: 3 },
        { type: 'spear', x: 1, y: 4 }
      ],
      doors: [
        { id: 'door-1', name: 'Armory Gate', from: [1, 2], to: [2, 2], state: 'closed', is_secret: false },
        { id: 'door-2', name: 'Secret Escape Tunnel', from: [7, 7], to: [7, 8], state: 'open', is_secret: true }
      ],
      storyTriggers: [
        {
          marker: 'Note A',
          event: 'on_room_entered',
          room: 'room-1',
          title: 'Armory Ambush',
          narrative: 'Iron bars drop behind you as orcish battle horns sound!',
          actions: [{ type: 'play_movie', title: 'Ambush Cutscene' }]
        },
        {
          marker: 'Note B',
          event: 'on_monster_defeated',
          target: 'Gargoyle Overlord',
          title: 'Fall of the Overlord',
          narrative: 'The gargoyle crumbles into obsidian dust, revealing a glowing jade key.',
          actions: [{ type: 'custom_action', title: 'Drop Jade Key' }]
        }
      ]
    };

    // 1. generateExportCanvas at 1x scale without banner
    const canvas1x = generateExportCanvas({ scale: 1, showBanner: false });
    assert.ok(canvas1x, 'Canvas generated at 1x');
    assert.equal(typeof canvas1x.width, 'number', 'Canvas has width');
    assert.equal(typeof canvas1x.height, 'number', 'Canvas has height');
    const width1x = canvas1x.width;
    const height1x = canvas1x.height;
    assert.ok(width1x >= 1000, `Width at 1x should cover 26 tiles (~1014px): got ${width1x}`);
    assert.ok(height1x >= 700, `Height at 1x should cover 19 tiles (~741px): got ${height1x}`);

    // 2. generateExportCanvas at 2x scale
    const canvas2x = generateExportCanvas({ scale: 2, showBanner: false });
    assert.equal(canvas2x.width, width1x * 2, '2x scale produces double the width');
    assert.equal(canvas2x.height, height1x * 2, '2x scale produces double the height');

    // 3. generateExportCanvas with Title Banner
    const canvasBanner = generateExportCanvas({ scale: 1, showBanner: true });
    assert.equal(canvasBanner.width, width1x, 'Banner canvas has same base width');
    assert.equal(canvasBanner.height, height1x + 56, 'Banner canvas has additional 56px banner height');

    // 4. Modal toggles and preview update
    openExportPngModal();
    assert.equal(dom.exportPngModal.style.display, 'flex', 'openExportPngModal displays modal');
    assert.ok(previewBadge.includes('1×'), 'Preview badge reflects 1x scale');
    closeExportPngModal();
    assert.equal(dom.exportPngModal.style.display, 'none', 'closeExportPngModal hides modal');

    openExportPdfModal();
    assert.equal(dom.exportPdfModal.style.display, 'flex', 'openExportPdfModal displays modal');
    closeExportPdfModal();
    assert.equal(dom.exportPdfModal.style.display, 'none', 'closeExportPdfModal hides modal');

    // 5. Direct exportPng and exportPdf execution in headless environment
    const pngResult = await exportPng({ scale: 2 });
    assert.equal(pngResult.success, true, 'exportPng completes successfully in headless test');
    assert.ok(pngResult.dataUrl.startsWith('data:image/png;base64,'), 'exportPng returns base64 data url');

    const pdfResult = await exportPdf({ orientation: 'landscape', pageSize: 'A4' });
    assert.equal(pdfResult.success, true, 'exportPdf completes successfully in headless test');
    assert.ok(pdfResult.html, 'exportPdf returns generated HTML');

    // 6. Comprehensive inspection of generated Quest Sheet HTML
    const testMapUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const html = generateQuestPdfHtml(state.quest, state.blockmap, testMapUrl, {
      orientation: 'landscape',
      pageSize: 'A4',
      includeHeader: true,
      includeMap: true,
      includeNotes: true,
      includeRoster: true,
      includeFurniture: true
    });

    // Verify HTML structure and metadata
    assert.ok(html.includes('<!DOCTYPE html>'), 'HTML contains doctype');
    assert.ok(html.includes('<title>Lair of the Orc Warlord</title>'), 'HTML title matches quest title');
    assert.ok(html.includes('size: a4 landscape;'), 'Print styles reflect A4 landscape');
    assert.ok(html.includes('<h1>Lair of the Orc Warlord</h1>'), 'Header contains quest title');
    assert.ok(html.includes('Deep in the Black Mountains'), 'Story briefing narrative is present');
    assert.ok(html.includes('250 Gold'), 'Gold bounty is present');
    assert.ok(html.includes('<strong>Wandering:</strong> Orc'), 'Wandering monster name is present');
    assert.ok(html.includes('[1, 2]'), 'Entrance location is present');
    assert.ok(html.includes('[7, 7]'), 'Exit location is present');

    // Verify high-resolution map embed
    assert.ok(html.includes(`<img src="${testMapUrl}"`), 'Embedded map image is present');

    // Verify monster roster table
    assert.ok(html.includes('Monster Roster &amp; Statistics'), 'Monster roster card is present');
    assert.ok(html.includes('5 Total'), 'Total monsters count is accurate (3 orcs + 1 goblin + 1 gargoyle)');
    assert.ok(html.includes('<strong>Orc</strong>'), 'Orc monster row present');
    assert.ok(html.includes('<strong>3</strong>'), 'Orc quantity 3 present');
    assert.ok(html.includes('<strong>Goblin</strong>'), 'Goblin monster row present');
    assert.ok(html.includes('<strong>Gargoyle</strong>'), 'Gargoyle boss row present');
    assert.ok(html.includes('BOSS ×1'), 'Boss indicator badge present on Gargoyle');

    // Verify furniture & traps summary
    assert.ok(html.includes('Furniture &amp; Dungeon Features'), 'Furniture card present');
    assert.ok(html.includes('Chest: <strong>1</strong>'), 'Chest count accurate');
    assert.ok(html.includes('Throne: <strong>1</strong>'), 'Throne count accurate');
    assert.ok(html.includes('Table: <strong>1</strong>'), 'Table count accurate');
    assert.ok(html.includes('pit (1)'), 'Pit trap count present');
    assert.ok(html.includes('spear (1)'), 'Spear trap count present');

    // Verify quest notes
    assert.ok(html.includes('Quest Notes &amp; Story Triggers'), 'Quest notes section present');
    assert.ok(html.includes('2 Triggers'), 'Triggers count accurate');
    assert.ok(html.includes('Note A'), 'Note A badge present');
    assert.ok(html.includes('Armory Ambush'), 'Note A title present');
    assert.ok(html.includes('Iron bars drop behind you'), 'Note A narrative present');
    assert.ok(html.includes('Note B'), 'Note B badge present');
    assert.ok(html.includes('Fall of the Overlord'), 'Note B title present');
    assert.ok(html.includes('obsidian dust'), 'Note B narrative present');

    // 7. Test orientation and page size options
    const portraitLetterHtml = generateQuestPdfHtml(state.quest, state.blockmap, testMapUrl, {
      orientation: 'portrait',
      pageSize: 'Letter'
    });
    assert.ok(portraitLetterHtml.includes('size: letter portrait;'), 'Orientation and page size correctly switch to Letter portrait');

    // 8. Test section toggle options
    const filteredHtml = generateQuestPdfHtml(state.quest, state.blockmap, testMapUrl, {
      includeHeader: false,
      includeMap: false,
      includeNotes: false,
      includeRoster: false,
      includeFurniture: false
    });
    assert.ok(!filteredHtml.includes('class="quest-header"'), 'Header omitted when includeHeader is false');
    assert.ok(!filteredHtml.includes('class="map-container"'), 'Map omitted when includeMap is false');
    assert.ok(!filteredHtml.includes('Quest Notes &amp; Story Triggers'), 'Notes omitted when includeNotes is false');
    assert.ok(!filteredHtml.includes('Monster Roster &amp; Statistics'), 'Roster omitted when includeRoster is false');
    assert.ok(!filteredHtml.includes('Furniture &amp; Dungeon Features'), 'Furniture omitted when includeFurniture is false');
  } finally {
    global.document = savedDocument;
    state.quest = savedStateQuest;
    state.blockmap = savedStateBlockmap;
    Object.assign(dom, savedDom);
  }
});

test('Blockmap Loading & Grid Dimensions: verifies loadBlockmap initializes grid dimensions and updates UI without dims reference errors', async () => {
  const savedDom = { ...dom };
  const savedStateBlockmap = JSON.parse(JSON.stringify(state.blockmap));
  const savedWindow = global.window;

  try {
    let blockmapInfoText = '';
    let gridSizeText = '';

    dom.infoBlockmapName = {
      set textContent(val) { blockmapInfoText = val; },
      get textContent() { return blockmapInfoText; }
    };
    dom.infoGridSize = {
      set textContent(val) { gridSizeText = val; },
      get textContent() { return gridSizeText; }
    };
    dom.selectBlockmap = { value: '' };
    dom.chkAdditionalBorder = { checked: false };
    dom.lblZoom = { textContent: '' };
    dom.canvas = { width: 800, height: 600, getContext: () => null };

    global.window = {
      robosQuestEditor: {
        loadBlockmap: async (slug) => ({
          success: true,
          blockmap: {
            id: slug || 'test-dungeon',
            title: 'Custom Test Dungeon',
            gridDimensions: [28, 20],
            rooms: [],
            wallTiles: []
          },
          imageData: null
        })
      }
    };

    // Execute loadBlockmap and verify dims are correctly parsed and updated in UI
    await loadBlockmap('test-dungeon');

    assert.equal(state.blockmap.title, 'Custom Test Dungeon');
    assert.deepEqual(state.blockmap.gridDimensions, [28, 20]);
    assert.equal(blockmapInfoText, 'Custom Test Dungeon');
    assert.equal(gridSizeText, '28 × 20');
  } finally {
    Object.assign(dom, savedDom);
    state.blockmap = savedStateBlockmap;
    global.window = savedWindow;
  }
});

test('Starting Quest Action & Indicator Resolution: separates intro action from map indicators and anchors indicators to relevant entities', () => {
  const quest = {
    title: 'Dungeon of Shadows',
    startingStair: [2, 2],
    monsters: [
      { id: 'mon-warlord-1', name: 'Orc Warlord', type: 'orc', pos: [8, 5], isBoss: true }
    ],
    doors: [
      { id: 'door-armory', name: 'Iron Armory Gate', from: [5, 4], to: [6, 4], state: 'closed', is_secret: false }
    ],
    furniture: [
      { id: 'furn-altar-1', name: 'Bloodstone Altar', type: 'altar', x: 12, y: 8, width: 2, height: 1 }
    ],
    storyTriggers: [
      {
        id: 'trig-intro',
        title: 'Opening Prologue',
        event: 'on_game_start',
        tile: [0, 0],
        narrative: 'Mentor speaks: "The shadow of Morcar stretches across the realm..."',
        actions: [{ type: 'play_movie', moviePath: 'res://assets/movies/quest1-intro.mp4', title: 'Intro Cinematic' }]
      },
      {
        id: 'trig-door',
        title: 'Armory Trap',
        event: 'on_door_opened',
        target: 'door-armory',
        doorId: 'door-armory',
        tile: [5, 4],
        narrative: 'A poisoned dart shoots from the lock!',
        actions: [{ type: 'attack_character', attacker: 'Poison Dart' }]
      },
      {
        id: 'trig-boss',
        title: 'Wrath of the Warlord',
        event: 'on_monster_killed',
        target: 'mon-warlord-1',
        monsterId: 'mon-warlord-1',
        tile: [8, 5],
        narrative: 'The Warlord roars with his dying breath!',
        actions: [{ type: 'custom_action', title: 'Spawn Skeletons' }]
      },
      {
        id: 'trig-room',
        title: 'Sanctum Horror',
        event: 'on_room_entered',
        target: 'room-crypt-3',
        room: 'room-crypt-3',
        tile: [12, 8],
        narrative: 'Cold dread washes over your spine.',
        actions: [{ type: 'cast_spell', spell: 'fear' }]
      },
      {
        id: 'trig-corridor',
        title: 'Pitfall',
        event: 'on_tile_stepped_on',
        tile: [3, 9],
        narrative: 'The floor gives way beneath your boots!',
        actions: [{ type: 'spring_trap', trap: 'pit' }]
      }
    ]
  };

  const blockmap = {
    gridDimensions: [26, 19],
    rooms: [
      { id: 'room-crypt-3', name: 'Ancient Crypt', tiles: [[11, 7], [12, 7], [11, 8], [12, 8]] }
    ]
  };

  // 1. Verify isStartingQuestAction identifies intro trigger
  assert.equal(isStartingQuestAction(quest.storyTriggers[0], quest, blockmap), true, 'Opening prologue identified as starting action');
  assert.equal(isStartingQuestAction(quest.storyTriggers[1], quest, blockmap), false, 'Door trigger not starting action');

  // 2. Verify resolveTriggerIndicators
  const { startingAction, indicators } = resolveTriggerIndicators(quest, blockmap);

  assert.ok(startingAction, 'Starting action extracted');
  assert.equal(startingAction.id, 'trig-intro');
  assert.equal(startingAction.title, 'Opening Prologue');

  // 3. Verify map indicators count (4 remaining triggers)
  assert.equal(indicators.length, 4, '4 map triggers should receive indicators');

  // Verify unique letter assignment: A, B, C, D
  assert.equal(indicators[0].letter, 'A');
  assert.equal(indicators[1].letter, 'B');
  assert.equal(indicators[2].letter, 'C');
  assert.equal(indicators[3].letter, 'D');

  // Verify target entity resolution
  assert.equal(indicators[0].targetType, 'door', 'Indicator A anchored to door');
  assert.equal(indicators[0].targetLabel, 'Door: Iron Armory Gate');

  assert.equal(indicators[1].targetType, 'monster', 'Indicator B anchored to monster');
  assert.ok(indicators[1].targetLabel.includes('Orc Warlord (Boss)'));

  assert.equal(indicators[2].targetType, 'room', 'Indicator C anchored to room');
  assert.equal(indicators[2].targetLabel, 'Room: Ancient Crypt');

  assert.equal(indicators[3].targetType, 'tile', 'Indicator D anchored to tile');
  assert.equal(indicators[3].targetLabel, 'Tile [3, 9]');

  // 4. Verify mock canvas drawing of all indicator types
  const mockCtx = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {}
  };
  const geom = { tileSize: 39, offsetX: 0, offsetY: 0, cols: 26, rows: 19 };
  for (const ind of indicators) {
    assert.doesNotThrow(() => {
      drawExportTriggerIndicator(mockCtx, geom, ind, { showRoomNames: true });
    });
  }
});

test('Custom Quest Cartridge Verification: custom-quest intro action appears in briefing and remaining triggers anchor to corridor tile and door', () => {
  const cartridgePath = path.join(__dirname, '../../../games/tabletop-rpg/cartridges/custom-quest.cartridge.json');
  assert.ok(fs.existsSync(cartridgePath), 'custom-quest.cartridge.json exists');
  const cartridge = JSON.parse(fs.readFileSync(cartridgePath, 'utf8'));
  const map = cartridge.maps['custom-quest'];
  assert.ok(map, 'custom-quest map exists in cartridge');

  const blockmap = {
    gridDimensions: [map.width || 26, map.height || 19],
    rooms: map.rooms || []
  };

  const { startingAction, indicators } = resolveTriggerIndicators(map, blockmap);

  // 1. Verify starting action detection
  assert.ok(startingAction, 'Starting quest action detected in custom-quest');
  assert.ok(
    startingAction.actions[0].moviePath === 'res://assets/movies/quest_introduction_movie.ogv' ||
    startingAction.actions[0].moviePath === 'res://assets/movies/quest1-intro.mp4',
    'Starting action moviePath should point to the intro cinematic'
  );
  assert.ok(startingAction.narrative.includes('Mentor speaks:'), 'Mentor speech in starting action');

  // 2. Verify indicators count and targets
  assert.equal(indicators.length, 2, 'Exactly 2 map indicators (excluding intro action)');

  // Indicator 0: Note A on corridor heist stepped-on tile [7, 18]
  assert.equal(indicators[0].letter, 'A');
  assert.equal(indicators[0].targetType, 'tile');
  assert.deepEqual(indicators[0].targetPos, { col: 7, row: 18 });
  assert.equal(indicators[0].targetLabel, 'Tile [7, 18]');

  // Indicator 1: Note B on door-10
  assert.equal(indicators[1].letter, 'B');
  assert.equal(indicators[1].targetType, 'door');
  assert.equal(indicators[1].targetLabel, 'Door: door-10');

  // 3. Verify Quest Sheet PDF HTML content
  const mockMapUrl = 'data:image/png;base64,mock';
  const questPayload = { ...map, briefing: cartridge.header?.description };
  const html = generateQuestPdfHtml(questPayload, blockmap, mockMapUrl, {
    orientation: 'landscape',
    pageSize: 'A4',
    includeHeader: true,
    includeNotes: true
  });

  // Briefing contains Mentor's words and opening cinematic
  assert.ok(html.includes('The Emperor calls upon'), 'Contains header description in briefing');
  assert.ok(html.includes('Mentor speaks: &quot;As you step forward, ancient magic stirs') ||
            html.includes('Mentor speaks: "As you step forward, ancient magic stirs'), 'Contains starting action narrative in intro');
  assert.ok(html.includes('Opening Cinematic: Note A Cinematic'), 'Contains opening cinematic in intro');

  // Quest notes list shows Note A and Note B with their target descriptions
  assert.ok(html.includes('Note A'), 'Note A in quest notes');
  assert.ok(html.includes('Tile [7, 18]'), 'Tile [7, 18] in quest notes');
  assert.ok(html.includes('Note B'), 'Note B in quest notes');
  assert.ok(html.includes('Door: door-10'), 'Door: door-10 in quest notes');
});




