'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateRoomContiguity,
  computeRoomBoundsFromTiles,
  generateRectTiles,
  getRoomPerimeterEdges,
  normalizeTileSet
} = require('../lib/room-shape');

test('Room Shape & Contiguity Validation', async (t) => {
  await t.test('validates single-tile rooms as contiguous', () => {
    const res = validateRoomContiguity(['2,3']);
    assert.equal(res.valid, true);
    assert.equal(res.componentCount, 1);
    assert.deepEqual(res.bounds, { x: 2, y: 3, w: 1, h: 1 });
  });

  await t.test('validates L-shaped connected non-rectangular room', () => {
    // L-shape:
    // [1,1] [2,1]
    //       [2,2]
    //       [2,3]
    const tiles = ['1,1', '2,1', '2,2', '2,3'];
    const res = validateRoomContiguity(tiles);
    assert.equal(res.valid, true);
    assert.equal(res.componentCount, 1);
    assert.equal(res.tiles.length, 4);
    assert.deepEqual(res.bounds, { x: 1, y: 1, w: 2, h: 3 });
  });

  await t.test('validates T-shaped and irregular cavern rooms', () => {
    // T-shape
    const tiles = [
      [3, 2], [4, 2], [5, 2], // top bar
      [4, 3], [4, 4]          // vertical stem
    ];
    const res = validateRoomContiguity(tiles);
    assert.equal(res.valid, true);
    assert.equal(res.componentCount, 1);
    assert.equal(res.tiles.length, 5);
    assert.deepEqual(res.bounds, { x: 3, y: 2, w: 3, h: 3 });
  });

  await t.test('REJECTS non-connecting disconnected room shapes', () => {
    // Disconnected islands: [1,1] and [5,5]
    const disjoint = ['1,1', '5,5'];
    const res = validateRoomContiguity(disjoint);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'disconnected');
    assert.equal(res.componentCount, 2);
    assert.ok(res.error.includes('must be a single connected area'));
  });

  await t.test('REJECTS diagonal-only touching tiles (must be 4-connected)', () => {
    // Diagonal tiles: [2,2] and [3,3] touch only at a point corner, no shared edge
    const diagonal = ['2,2', '3,3'];
    const res = validateRoomContiguity(diagonal);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'disconnected');
    assert.equal(res.componentCount, 2);
  });

  await t.test('REJECTS empty tile selection', () => {
    const res = validateRoomContiguity([]);
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'empty');
  });

  await t.test('computes perimeter wall edges for non-rectangular L-shape', () => {
    // 3 tiles in L-shape: [0,0], [1,0], [1,1]
    const tiles = ['0,0', '1,0', '1,1'];
    const edges = getRoomPerimeterEdges(tiles);

    // [0,0]: North, West, South
    // [1,0]: North, East
    // [1,1]: East, South, West
    // Total perimeter edges = 8
    assert.equal(edges.length, 8);

    // Interior seam [0,0] <-> [1,0] should NOT be an edge
    const interiorV = edges.find(e => e.orientation === 'v' && e.x1 === 1 && e.y1 === 0 && e.side === 'east' && e.x2 === 1);
    // There shouldn't be a seam between (0,0) and (1,0)
    assert.ok(!edges.some(e => e.orientation === 'v' && e.x1 === 1 && e.y1 === 0 && e.side === 'east'));
  });

  await t.test('generates rect tiles matching bounds', () => {
    const rectTiles = generateRectTiles(2, 4, 3, 2);
    assert.equal(rectTiles.length, 6);
    const bounds = computeRoomBoundsFromTiles(rectTiles);
    assert.deepEqual(bounds, { x: 2, y: 4, w: 3, h: 2 });
  });
});
