'use strict';

/**
 * RobOS Gaming Subsystem: 2D Board & Tile Grid Mathematics
 * Provides tile coordinate operations, distance calculation, movement budgeting,
 * pathfinding, line-of-sight raycasting, and room visibility calculations for
 * tabletop dungeon crawlers and grid-based RPGs.
 */

class BoardGrid {
  constructor(width = 26, height = 19) {
    this.width = width;
    this.height = height;
    this.blockedTiles = new Set();
    this.walls = new Set(); // e.g. "x,y->x2,y2"
    this.doors = new Map(); // "x,y->x2,y2" -> { isOpen: false, isLocked: false, keyRequired: null }
    this.traps = new Map(); // "x,y" -> { id, trapType, damageDice, detected, disarmed }
    this.wallBlocks = new Map(); // "x,y" -> { id, type }
  }

  key(x, y) {
    return `${x},${y}`;
  }

  parseKey(k) {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  }

  wallKey(x1, y1, x2, y2) {
    if (x1 > x2 || (x1 === x2 && y1 > y2)) {
      return `${x2},${y2}<->${x1},${y1}`;
    }
    return `${x1},${y1}<->${x2},${y2}`;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  setBlocked(x, y, blocked = true) {
    const k = this.key(x, y);
    if (blocked) {
      this.blockedTiles.add(k);
    } else {
      this.blockedTiles.delete(k);
    }
  }

  isBlocked(x, y) {
    return this.blockedTiles.has(this.key(x, y));
  }

  addWall(x1, y1, x2, y2) {
    this.walls.add(this.wallKey(x1, y1, x2, y2));
  }

  hasWall(x1, y1, x2, y2) {
    return this.walls.has(this.wallKey(x1, y1, x2, y2));
  }

  addDoor(x1, y1, x2, y2, options = {}) {
    const wk = this.wallKey(x1, y1, x2, y2);
    this.doors.set(wk, {
      isOpen: options.isOpen || false,
      isLocked: options.isLocked || false,
      keyRequired: options.keyRequired || null
    });
  }

  getDoor(x1, y1, x2, y2) {
    return this.doors.get(this.wallKey(x1, y1, x2, y2)) || null;
  }

  openDoor(x1, y1, x2, y2) {
    const d = this.getDoor(x1, y1, x2, y2);
    if (d) {
      d.isOpen = true;
      return true;
    }
    return false;
  }

  canTraverse(x1, y1, x2, y2) {
    if (!this.inBounds(x2, y2) || this.isBlocked(x2, y2)) return false;
    const wk = this.wallKey(x1, y1, x2, y2);
    if (this.walls.has(wk)) {
      const door = this.doors.get(wk);
      if (!door || !door.isOpen) return false;
    }
    return true;
  }

  manhattanDistance(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  chebyshevDistance(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
  }

  getOrthogonalNeighbors(x, y) {
    const dirs = [
      { x: x, y: y - 1, dir: 'N' },
      { x: x + 1, y: y, dir: 'E' },
      { x: x, y: y + 1, dir: 'S' },
      { x: x - 1, y: y, dir: 'W' }
    ];
    return dirs.filter(d => this.inBounds(d.x, d.y));
  }

  /**
   * Find reachable coordinates within a given movement budget (e.g. 2d6 movement roll).
   */
  getReachableTiles(startX, startY, maxSteps) {
    const visited = new Map(); // key -> distance
    const startKey = this.key(startX, startY);
    visited.set(startKey, 0);

    const queue = [{ x: startX, y: startY, dist: 0 }];

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.dist >= maxSteps) continue;

      const neighbors = this.getOrthogonalNeighbors(curr.x, curr.y);
      for (const n of neighbors) {
        if (!this.canTraverse(curr.x, curr.y, n.x, n.y)) continue;
        const nk = this.key(n.x, n.y);
        const nextDist = curr.dist + 1;
        if (!visited.has(nk) || visited.get(nk) > nextDist) {
          visited.set(nk, nextDist);
          queue.push({ x: n.x, y: n.y, dist: nextDist });
        }
      }
    }

    const result = [];
    for (const [k, dist] of visited.entries()) {
      const { x, y } = this.parseKey(k);
      result.push({ x, y, dist });
    }
    return result;
  }

  /**
   * Bresenham Line of Sight between two coordinates.
   */
  hasLineOfSight(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (true) {
      if (cx === x1 && cy === y1) return true;
      if ((cx !== x0 || cy !== y0) && (this.isBlocked(cx, cy))) {
        return false;
      }

      let e2 = 2 * err;
      let prevX = cx;
      let prevY = cy;

      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }

      if (this.hasWall(prevX, prevY, cx, cy)) {
        const door = this.getDoor(prevX, prevY, cx, cy);
        if (!door || !door.isOpen) return false;
      }
    }
  }

  addTrap(x, y, data = {}) {
    const k = this.key(x, y);
    const trap = {
      id: data.id || `trap-${x}-${y}`,
      trapType: data.trapType || 'pit',
      damageDice: data.damageDice || 1,
      detected: data.detected || false,
      disarmed: data.disarmed || false,
      ...data
    };
    this.traps.set(k, trap);
    return trap;
  }

  getTrap(x, y) {
    return this.traps.get(this.key(x, y)) || null;
  }

  hasTrap(x, y) {
    return this.traps.has(this.key(x, y));
  }

  removeTrap(x, y) {
    return this.traps.delete(this.key(x, y));
  }

  listTraps() {
    return Array.from(this.traps.values());
  }

  addWallBlock(x, y, data = {}) {
    const k = this.key(x, y);
    const type = data.type || 'single';
    const width = data.width || (type === 'double-h' ? 2 : 1);
    const height = data.height || (type === 'double-v' ? 2 : 1);
    const block = {
      id: data.id || `block-${x}-${y}`,
      x,
      y,
      type,
      width,
      height,
      ...data
    };
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const subKey = this.key(x + dx, y + dy);
        this.wallBlocks.set(subKey, {
          ...block,
          isOrigin: dx === 0 && dy === 0,
          originKey: k
        });
        this.setBlocked(x + dx, y + dy, true);
      }
    }
    return block;
  }

  hasWallBlock(x, y) {
    return this.wallBlocks.has(this.key(x, y));
  }

  removeWallBlock(x, y) {
    const existing = this.wallBlocks.get(this.key(x, y));
    if (!existing) return false;
    const originKey = existing.originKey || this.key(existing.x, existing.y);
    const origin = this.wallBlocks.get(originKey) || existing;
    const ox = origin.x;
    const oy = origin.y;
    const width = origin.width || 1;
    const height = origin.height || 1;
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const subKey = this.key(ox + dx, oy + dy);
        this.wallBlocks.delete(subKey);
        this.setBlocked(ox + dx, oy + dy, false);
      }
    }
    return true;
  }

  listWallBlocks() {
    const seen = new Set();
    const result = [];
    for (const block of this.wallBlocks.values()) {
      const origKey = block.originKey || this.key(block.x, block.y);
      if (!seen.has(origKey)) {
        seen.add(origKey);
        result.push(block);
      }
    }
    return result;
  }

  static fromMapConfiguration(config, quest = {}) {
    const [w, h] = config.gridDimensions || [26, 19];
    const grid = new BoardGrid(w, h);

    // Perimeter walls
    for (let x = 0; x < w; x++) {
      grid.addWall(x, 0, x, -1);
      grid.addWall(x, h - 1, x, h);
    }
    for (let y = 0; y < h; y++) {
      grid.addWall(0, y, -1, y);
      grid.addWall(w - 1, y, w, y);
    }

    // Room bounding walls
    for (const r of (config.rooms || [])) {
      const rx2 = r.x + r.w;
      const ry2 = r.y + r.h;
      for (let x = r.x; x < rx2; x++) {
        grid.addWall(x, r.y - 1, x, r.y);
        grid.addWall(x, ry2 - 1, x, ry2);
      }
      for (let y = r.y; y < ry2; y++) {
        grid.addWall(r.x - 1, y, r.x, y);
        grid.addWall(rx2 - 1, y, rx2, y);
      }
    }

    // Doors
    const doors = quest.doors || config.doors || [];
    for (const d of doors) {
      if (d.from && d.to) {
        grid.addDoor(d.from[0], d.from[1], d.to[0], d.to[1], {
          isOpen: d.isOpen || d.is_open || false,
          isLocked: d.isLocked || false
        });
      }
    }

    // Stone wall blocks
    for (const b of (quest.wallBlocks || [])) {
      if (Array.isArray(b.position)) {
        grid.addWallBlock(b.position[0], b.position[1], b);
      } else if (b.x !== undefined && b.y !== undefined) {
        grid.addWallBlock(b.x, b.y, b);
      }
    }

    // Traps
    for (const t of (quest.traps || [])) {
      if (Array.isArray(t.position)) {
        grid.addTrap(t.position[0], t.position[1], t);
      } else if (t.x !== undefined && t.y !== undefined) {
        grid.addTrap(t.x, t.y, t);
      }
    }

    return grid;
  }
}

module.exports = {
  BoardGrid
};
