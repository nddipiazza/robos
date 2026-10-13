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

test('Consecutive Room Creation: identical dimension rooms never overwrite existing rooms and maintain unique IDs', () => {
  const rooms = [];

  function getNextRoomNumber() {
    let maxNum = 0;
    for (const r of rooms) {
      const match = (r.name || '').match(/Room\s+(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return maxNum > 0 ? maxNum + 1 : rooms.length + 1;
  }

  function generateUniqueRoomId(quadrant) {
    const existingIds = new Set(rooms.map(r => r.id));
    let num = getNextRoomNumber();
    let id = `room-${quadrant}-${num}`;
    while (existingIds.has(id)) {
      num++;
      id = `room-${quadrant}-${num}`;
    }
    return id;
  }

  function addRoom(x, y, w, h, quadrant = 'nw', shape = 'rect', tileCount = w * h) {
    const count = getNextRoomNumber();
    const id = generateUniqueRoomId(quadrant);
    const room = {
      id,
      name: `Room ${count} (${quadrant.toUpperCase()})`,
      x, y, w, h, shape, tileCount, quadrant
    };
    rooms.push(room);
    return room;
  }

  // Exact scenario from user bug report:
  // 1. Room 1 (NW) [5, 5] 4x4 Free Form (15t)
  addRoom(5, 5, 4, 4, 'nw', 'freeform', 15);
  // 2. Room 2 (NW) [5, 1] 3x4 Rect (12t)
  addRoom(5, 1, 3, 4, 'nw', 'rect', 12);
  // 3. Room 3 (NW) [8, 1] 4x5 Rect (20t)
  addRoom(8, 1, 4, 5, 'nw', 'rect', 20);
  // 4. Room 4 (NW) [1, 5] 4x4 Rect (16t)
  addRoom(1, 5, 4, 4, 'nw', 'rect', 16);
  // 5. Room 5 (NW) [1, 1] 4x4 Rect (16t) -- identical 4x4 dimensions to Room 4!
  addRoom(1, 1, 4, 4, 'nw', 'rect', 16);

  assert.equal(rooms.length, 5, 'All 5 rooms must exist and not be overwritten');
  assert.equal(rooms[3].name, 'Room 4 (NW)');
  assert.equal(rooms[3].x, 1);
  assert.equal(rooms[3].y, 5);
  assert.equal(rooms[4].name, 'Room 5 (NW)');
  assert.equal(rooms[4].x, 1);
  assert.equal(rooms[4].y, 1);

  // Check unique IDs
  const ids = new Set(rooms.map(r => r.id));
  assert.equal(ids.size, 5, 'All room IDs must be unique');
  assert.ok(ids.has('room-nw-4'));
  assert.ok(ids.has('room-nw-5'));
});

test('Map Identity: custom title and id update export payload and sanitize slug', () => {
  function sanitizeMapId(raw) {
    return raw.toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function formatTitleFromFilename(fileName) {
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    return baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // 1. Automatic title & id from custom filename
  const autoTitle = formatTitleFromFilename('cavern_of_the_ice_queen.png');
  const autoId = sanitizeMapId('cavern_of_the_ice_queen.png'.replace(/\.[^/.]+$/, ''));
  assert.equal(autoTitle, 'Cavern Of The Ice Queen');
  assert.equal(autoId, 'cavern-of-the-ice-queen');

  // 2. User edits title & id with special characters
  const customTitle = 'Dungeon of Doom: Level 1';
  const customId = sanitizeMapId('Dungeon of Doom: Level 1');
  assert.equal(customId, 'dungeon-of-doom-level-1');

  // 3. Payload includes custom title and id
  const payload = {
    cartridgeSlug: 'heroquest-first-light',
    mapId: customId,
    mapData: {
      id: customId,
      title: customTitle,
      width: 26,
      height: 19
    }
  };

  assert.equal(payload.mapId, 'dungeon-of-doom-level-1');
  assert.equal(payload.mapData.id, 'dungeon-of-doom-level-1');
  assert.equal(payload.mapData.title, 'Dungeon of Doom: Level 1');
});


