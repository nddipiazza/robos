'use strict';
// Stores for RobOS Orders and Inventory. A store is two functions:
//   nodes()                 -> the current records (JSON-LD nodes with '@id' and '@type')
//   commit(edits, message)  -> apply [{ op: 'add', node } | { op: 'update', id, set }] as one change
// The edit format is the one GraphWorkspace.propose() takes, so a KGraph app passes its own workspace
// commit. Apps without a graph can use jsonStore(), and tests use memoryStore().
const fs = require('node:fs'), path = require('node:path');
function applyEdits(list, edits) {
  const next = list.map(n => ({ ...n }));
  for (const e of edits) {
    if (e.op === 'add') { if (next.some(n => n['@id'] === e.node['@id'])) throw new Error('Duplicate record ' + e.node['@id']); next.push(structuredClone(e.node)); }
    else if (e.op === 'update') { const n = next.find(x => x['@id'] === e.id); if (!n) throw new Error('Unknown record ' + e.id); Object.assign(n, structuredClone(e.set)); }
    else throw new Error('Unsupported edit ' + e.op);
  }
  return next;
}
function memoryStore(initial = []) {
  let list = structuredClone(initial); const log = [];
  return { nodes: () => list, commit(edits, message) { list = applyEdits(list, edits); log.push(message); }, log };
}
// One JSON file, replaced atomically on every commit, readable only by the owner.
function jsonStore(file) {
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).nodes || [] : [];
  return {
    nodes: read,
    commit(edits) {
      const next = applyEdits(read(), edits); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file + '.tmp', JSON.stringify({ nodes: next }, null, 1), { mode: 0o600 }); fs.renameSync(file + '.tmp', file);
    },
  };
}
module.exports = { memoryStore, jsonStore, applyEdits };
