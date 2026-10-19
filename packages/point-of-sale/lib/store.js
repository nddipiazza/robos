'use strict';
const fs = require('node:fs');
const path = require('node:path');

// A tiny JSON document store: the whole shop lives in memory and is written atomically.
class Store {
  constructor(dir) {
    this.dir = dir || null;
    this.file = dir ? path.join(dir, 'store.json') : null;
  }

  load() {
    if (!this.file || !fs.existsSync(this.file)) return null;
    return JSON.parse(fs.readFileSync(this.file, 'utf8'));
  }

  save(state) {
    if (!this.file) return;
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
