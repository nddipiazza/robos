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
}

module.exports = {
  BoardGrid
};
