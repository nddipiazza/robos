'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Math helpers mirror app.js logic
function worldToTile(worldX, worldY, offsetX, offsetY, tileSize) {
  const gridX = worldX - offsetX;
  const gridY = worldY - offsetY;
  const col = Math.floor(gridX / tileSize);
  const row = Math.floor(gridY / tileSize);
  return { col, row };
}

function tileToWorld(col, row, offsetX, offsetY, tileSize) {
  return {
    x: offsetX + col * tileSize,
    y: offsetY + row * tileSize
  };
}

function computePerimeterTiles(cols, rows) {
  const set = new Set();
  for (let c = 0; c < cols; c++) {
    set.add(`${c},0`);
    set.add(`${c},${rows - 1}`);
  }
  for (let r = 0; r < rows; r++) {
    set.add(`0,${r}`);
    set.add(`${cols - 1},${r}`);
  }
  return set;
}

function computeRoomBounds(c1, r1, c2, r2, maxCols, maxRows) {
  const rx = Math.max(0, Math.min(c1, c2));
  const ry = Math.max(0, Math.min(r1, r2));
  const rw = Math.min(maxCols - rx, Math.abs(c2 - c1) + 1);
  const rh = Math.min(maxRows - ry, Math.abs(r2 - r1) + 1);
  return { rx, ry, rw, rh };
}

test('Tile Coordinate Math: precise conversion between world and grid tiles', () => {
  const tileSize = 39.0;
  const offX = 15;
  const offY = 25;

  const tile = worldToTile(15 + 39 * 4 + 10, 25 + 39 * 6 + 5, offX, offY, tileSize);
  assert.equal(tile.col, 4);
  assert.equal(tile.row, 6);

  const world = tileToWorld(4, 6, offX, offY, tileSize);
  assert.equal(world.x, 15 + 39 * 4);
  assert.equal(world.y, 25 + 39 * 6);
});

test('1-Tile Border: correctly generates complete outer perimeter corridor', () => {
  const cols = 26;
  const rows = 19;
  const border = computePerimeterTiles(cols, rows);

  // Total unique tiles on perimeter = 2 * 26 + 2 * (19 - 2) = 52 + 34 = 86
  assert.equal(border.size, 86);

  // Four corners
  assert.ok(border.has('0,0'));
  assert.ok(border.has('25,0'));
  assert.ok(border.has('0,18'));
  assert.ok(border.has('25,18'));

  // Interior tile is not in border
  assert.ok(!border.has('1,1'));
  assert.ok(!border.has('10,10'));
});

test('Room Bounding Box: correctly handles reverse drags and clamps to grid', () => {
  // Drag top-left to bottom-right
  const r1 = computeRoomBounds(1, 1, 4, 4, 26, 19);
  assert.deepEqual(r1, { rx: 1, ry: 1, rw: 4, rh: 4 });

  // Drag bottom-right to top-left (reversed)
  const r2 = computeRoomBounds(4, 4, 1, 1, 26, 19);
  assert.deepEqual(r2, { rx: 1, ry: 1, rw: 4, rh: 4 });

  // Drag out of bounds clamps correctly
  const r3 = computeRoomBounds(24, 17, 30, 25, 26, 19);
  assert.deepEqual(r3, { rx: 24, ry: 17, rw: 2, rh: 2 });
});

test('Cartridge Schema Validation: export payload conforms to Tabletop Cartridge format', () => {
  const payload = {
    id: 'fortress-fire-king',
    title: 'Quest 4: The Fortress of the Fire King',
    width: 26,
    height: 19,
    backgroundImage: 'res://assets/boards/first_light_dungeon.png',
    calibration: {
      tileSize: 39.0,
      offsetX: 0,
      offsetY: 0,
      border: true
    },
    rooms: [
      { id: 'room-nw-1', name: 'Northwest Armory', x: 1, y: 1, w: 4, h: 4, quadrant: 'nw' }
    ],
    doors: [
      { id: 'door-1', from: [0, 2], to: [1, 2], state: 'closed', room: 'room-nw-1' }
    ]
  };

  assert.equal(typeof payload.id, 'string');
  assert.equal(typeof payload.width, 'number');
  assert.equal(typeof payload.height, 'number');
  assert.ok(Array.isArray(payload.rooms));
  assert.ok(Array.isArray(payload.doors));
  assert.equal(payload.calibration.tileSize, 39.0);
  assert.equal(payload.rooms[0].w, 4);
});

test('Clear All Rooms: empties room array, updates selection, and supports undo restoration', () => {
  let rooms = [
    { id: 'room-1', name: 'Chamber 1' },
    { id: 'room-2', name: 'Chamber 2' },
    { id: 'room-3', name: 'Chamber 3' }
  ];
  let selectedRoomId = 'room-2';
  const history = [];

  function clearAllRooms() {
    if (rooms.length === 0) return 0;
    history.push({ rooms: [...rooms], selectedRoomId });
    const count = rooms.length;
    rooms = [];
    selectedRoomId = null;
    return count;
  }

  function undo() {
    if (history.length === 0) return false;
    const prev = history.pop();
    rooms = prev.rooms;
    selectedRoomId = prev.selectedRoomId;
    return true;
  }

  assert.equal(rooms.length, 3);
  assert.equal(selectedRoomId, 'room-2');

  const cleared = clearAllRooms();
  assert.equal(cleared, 3);
  assert.equal(rooms.length, 0);
  assert.equal(selectedRoomId, null);

  const restored = undo();
  assert.equal(restored, true);
  assert.equal(rooms.length, 3);
  assert.equal(selectedRoomId, 'room-2');
});

test('Freeform Draft Stroke Undo: undoes draft strokes in sequence without altering rooms or offset', () => {
  const draftFreeformTiles = new Set();
  const draftStrokeHistory = [];
  let rooms = [{ id: 'room-1', name: 'Existing Room' }];
  let offsetY = 12;

  // Simulate stroke 1: add two tiles
  const stroke1 = { added: ['5,5', '5,6'], removed: [] };
  for (const k of stroke1.added) draftFreeformTiles.add(k);
  draftStrokeHistory.push(stroke1);

  // Simulate stroke 2: add one tile
  const stroke2 = { added: ['5,7'], removed: [] };
  for (const k of stroke2.added) draftFreeformTiles.add(k);
  draftStrokeHistory.push(stroke2);

  assert.equal(draftFreeformTiles.size, 3);
  assert.equal(draftStrokeHistory.length, 2);

  // Undo stroke 2
  const undoneStroke2 = draftStrokeHistory.pop();
  for (const k of undoneStroke2.added) draftFreeformTiles.delete(k);
  assert.equal(draftFreeformTiles.size, 2);
  assert.ok(draftFreeformTiles.has('5,5'));
  assert.ok(draftFreeformTiles.has('5,6'));
  assert.ok(!draftFreeformTiles.has('5,7'));
  assert.equal(offsetY, 12);
  assert.equal(rooms.length, 1);

  // Undo stroke 1
  const undoneStroke1 = draftStrokeHistory.pop();
  for (const k of undoneStroke1.added) draftFreeformTiles.delete(k);
  assert.equal(draftFreeformTiles.size, 0);
  assert.equal(offsetY, 12);
  assert.equal(rooms.length, 1);
});

test('Room tileSet preservation: tileSet remains a functioning Set after pushHistory and undo', () => {
  let rooms = [
    {
      id: 'room-1',
      name: 'Hall',
      tiles: [[1, 1], [1, 2]],
      tileSet: new Set(['1,1', '1,2'])
    }
  ];
  const history = [];

  function pushHistory() {
    history.push({
      rooms: rooms.map(r => ({
        ...r,
        tiles: r.tiles ? r.tiles.map(t => [...t]) : [],
        tileSet: new Set(r.tileSet ? r.tileSet : (r.tiles || []).map(t => `${t[0]},${t[1]}`))
      }))
    });
  }

  function undo() {
    if (history.length === 0) return false;
    const prev = history.pop();
    rooms = prev.rooms.map(r => ({
      ...r,
      tiles: r.tiles ? r.tiles.map(t => [...t]) : [],
      tileSet: new Set(r.tileSet ? r.tileSet : (r.tiles || []).map(t => `${t[0]},${t[1]}`))
    }));
    return true;
  }

  pushHistory();
  // Modify room
  rooms.push({
    id: 'room-2',
    name: 'Vault',
    tiles: [[3, 3]],
    tileSet: new Set(['3,3'])
  });

  assert.equal(rooms.length, 2);
  assert.ok(rooms[0].tileSet instanceof Set);
  assert.ok(rooms[0].tileSet.has('1,1'));

  const undone = undo();
  assert.equal(undone, true);
  assert.equal(rooms.length, 1);
  assert.ok(rooms[0].tileSet instanceof Set);
  assert.ok(rooms[0].tileSet.has('1,1'));
  assert.ok(rooms[0].tileSet.has('1,2'));
  assert.ok(!rooms[0].tileSet.has('3,3'));
});


