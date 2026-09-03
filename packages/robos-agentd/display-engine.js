'use strict';
const path = require('path');
const fs   = require('fs');

class VirtualDisplayEngine {
  constructor(options = {}) {
    this.baseDisplay = options.baseDisplay || 10;
    this.maxDisplays = options.maxDisplays || 20;
    this.allocations = new Map(); // taskId -> displayNum
  }

  allocateDisplay(taskId) {
    const cleanId = String(taskId).toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (this.allocations.has(cleanId)) {
      const num = this.allocations.get(cleanId);
      return {
        ok: true,
        display: `:${num}`,
        displayNum: num,
        streamUrl: `http://localhost:${19150 + num}/stream`,
        resolution: '1280x720x24',
        existing: true,
      };
    }

    const used = new Set(this.allocations.values());
    let chosen = null;
    for (let d = this.baseDisplay; d < this.baseDisplay + this.maxDisplays; d++) {
      if (!used.has(d)) {
        chosen = d;
        break;
      }
    }

    if (chosen === null) {
      chosen = this.baseDisplay;
    }

    this.allocations.set(cleanId, chosen);

    return {
      ok: true,
      display: `:${chosen}`,
      displayNum: chosen,
      streamUrl: `http://localhost:${19150 + chosen}/stream`,
      resolution: '1280x720x24',
      framerate: 60,
    };
  }

  releaseDisplay(taskId) {
    const cleanId = String(taskId).toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (this.allocations.has(cleanId)) {
      const num = this.allocations.get(cleanId);
      this.allocations.delete(cleanId);
      return { ok: true, releasedDisplay: `:${num}` };
    }
    return { ok: true };
  }

  listDisplays() {
    const list = [];
    for (const [taskId, num] of this.allocations.entries()) {
      list.push({ taskId, display: `:${num}`, streamUrl: `http://localhost:${19150 + num}/stream` });
    }
    return list;
  }
}

module.exports = { VirtualDisplayEngine };
