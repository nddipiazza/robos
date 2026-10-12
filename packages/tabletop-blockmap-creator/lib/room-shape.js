'use strict';

/**
 * RobOS Tabletop Blockmap Creator: Room Shape & Contiguity Validation Library
 *
 * Supports non-rectangular rooms (L-shapes, T-shapes, irregular caverns):
 * - Validates that room tiles form a single 4-connected (orthogonally contiguous) shape
 * - Rejects disconnected, disjoint, or empty tile shapes
 * - Calculates bounding boxes and perimeter edge segments for arbitrary room shapes
 */

(function(root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (root) {
    root.RobOSRoomShape = lib;
    if (typeof Object.assign === 'function') {
      Object.assign(root, lib);
    }
  }
})(typeof self !== 'undefined' ? self : this, function() {

  /**
   * Convert various tile representations into a normalized Set of "col,row" strings
   */
  function normalizeTileSet(input) {
    if (input instanceof Set) {
      return new Set(input);
    }
    const set = new Set();
    if (Array.isArray(input)) {
      for (const item of input) {
        if (typeof item === 'string') {
          set.add(item);
        } else if (Array.isArray(item) && item.length >= 2) {
          set.add(`${item[0]},${item[1]}`);
        } else if (item && typeof item === 'object') {
          if (item.col !== undefined && item.row !== undefined) {
            set.add(`${item.col},${item.row}`);
          } else if (item.x !== undefined && item.y !== undefined) {
            set.add(`${item.x},${item.y}`);
          }
        }
      }
    }
    return set;
  }

  /**
   * Convert tile set into an array of [col, row] coordinate pairs sorted by row then col
   */
  function tileSetToArray(tileSet) {
    const arr = [];
    for (const key of tileSet) {
      const [c, r] = key.split(',').map(Number);
      arr.push([c, r]);
    }
    arr.sort((a, b) => a[1] === b[1] ? a[0] - b[0] : a[1] - b[1]);
    return arr;
  }

  /**
   * Compute bounding box [x, y, w, h] from a collection of tiles
   */
  function computeRoomBoundsFromTiles(tiles) {
    const list = Array.isArray(tiles) ? tiles : tileSetToArray(tiles);
    if (!list || list.length === 0) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const t of list) {
      const c = Array.isArray(t) ? t[0] : (t.col !== undefined ? t.col : t.x);
      const r = Array.isArray(t) ? t[1] : (t.row !== undefined ? t.row : t.y);

      if (c < minX) minX = c;
      if (c > maxX) maxX = c;
      if (r < minY) minY = r;
      if (r > maxY) maxY = r;
    }

    return {
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1
    };
  }

  /**
   * Generate an array of [col, row] pairs for a rectangle
   */
  function generateRectTiles(x, y, w, h) {
    const tiles = [];
    for (let c = x; c < x + w; c++) {
      for (let r = y; r < y + h; r++) {
        tiles.push([c, r]);
      }
    }
    return tiles;
  }

  /**
   * Validate that a room shape is 4-connected (orthogonally contiguous)
   *
   * @param {Set|Array} tileInput - Collection of tiles
   * @returns {Object} Validation result { valid: boolean, error?: string, componentCount: number, tiles?: Array, bounds?: Object }
   */
  function validateRoomContiguity(tileInput) {
    const set = normalizeTileSet(tileInput);

    if (set.size === 0) {
      return {
        valid: false,
        reason: 'empty',
        error: 'Please select at least 1 tile for the room.',
        componentCount: 0,
        components: []
      };
    }

    if (set.size === 1) {
      const tiles = tileSetToArray(set);
      return {
        valid: true,
        componentCount: 1,
        components: [tiles],
        tiles,
        bounds: computeRoomBoundsFromTiles(tiles)
      };
    }

    // BFS / Flood-fill to find connected components
    const unvisited = new Set(set);
    const components = [];

    while (unvisited.size > 0) {
      const start = unvisited.values().next().value;
      unvisited.delete(start);

      const component = [start];
      const queue = [start];

      while (queue.length > 0) {
        const curr = queue.shift();
        const [c, r] = curr.split(',').map(Number);
        const neighbors = [
          `${c + 1},${r}`, // East
          `${c - 1},${r}`, // West
          `${c},${r + 1}`, // South
          `${c},${r - 1}`  // North
        ];

        for (const n of neighbors) {
          if (unvisited.has(n)) {
            unvisited.delete(n);
            component.push(n);
            queue.push(n);
          }
        }
      }

      components.push(component);
    }

    if (components.length === 1) {
      const tiles = tileSetToArray(set);
      return {
        valid: true,
        componentCount: 1,
        components,
        tiles,
        bounds: computeRoomBoundsFromTiles(tiles)
      };
    }

    return {
      valid: false,
      reason: 'disconnected',
      error: `Room shape must be a single connected area! Found ${components.length} disconnected shapes.`,
      componentCount: components.length,
      components: components.map(c => c.map(k => k.split(',').map(Number)))
    };
  }

  /**
   * Extract perimeter wall segments for any arbitrary room shape
   *
   * @param {Set|Array} tileInput
   * @returns {Array<Object>} List of perimeter edges { orientation, x1, y1, x2, y2 }
   */
  function getRoomPerimeterEdges(tileInput) {
    const set = normalizeTileSet(tileInput);
    const edges = [];

    for (const key of set) {
      const [c, r] = key.split(',').map(Number);

      // North edge
      if (!set.has(`${c},${r - 1}`)) {
        edges.push({ orientation: 'h', x1: c, y1: r, x2: c + 1, y2: r, side: 'north' });
      }
      // South edge
      if (!set.has(`${c},${r + 1}`)) {
        edges.push({ orientation: 'h', x1: c, y1: r + 1, x2: c + 1, y2: r + 1, side: 'south' });
      }
      // West edge
      if (!set.has(`${c - 1},${r}`)) {
        edges.push({ orientation: 'v', x1: c, y1: r, x2: c, y2: r + 1, side: 'west' });
      }
      // East edge
      if (!set.has(`${c + 1},${r}`)) {
        edges.push({ orientation: 'v', x1: c + 1, y1: r, x2: c + 1, y2: r + 1, side: 'east' });
      }
    }

    return edges;
  }

  return {
    normalizeTileSet,
    tileSetToArray,
    computeRoomBoundsFromTiles,
    generateRectTiles,
    validateRoomContiguity,
    getRoomPerimeterEdges
  };
});
