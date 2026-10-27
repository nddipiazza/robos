'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ID } = require('./catalog.cjs');
function activeApps(root) {
  const directory = path.join(root, 'running');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith('.json')).flatMap(name => {
    const file = path.join(directory, name);
    try {
      const value = JSON.parse(fs.readFileSync(file));
      if (!ID.test(value.id) || !Number.isSafeInteger(value.pid) || value.pid < 1) throw new Error('Invalid lease');
      process.kill(value.pid, 0); return [value.id];
    } catch { fs.rmSync(file, { force: true }); return []; }
  });
}
function acquire(root, id) {
  activeApps(root);
  const directory = path.join(root, 'running'); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${id}.json`);
  const descriptor = fs.openSync(file, 'wx'); fs.writeFileSync(descriptor, JSON.stringify({ id, pid: process.pid })); fs.closeSync(descriptor);
  return () => fs.rmSync(file, { force: true });
}
module.exports = { activeApps, acquire };
