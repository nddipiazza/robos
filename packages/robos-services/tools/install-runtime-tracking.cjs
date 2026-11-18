'use strict';
// Optional upgrade of an existing desktop's shared snapshot library. Preserve
// unrelated code and keep a content-addressed original outside its source tree.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { root } = require('../lib/store.cjs');
const dir = process.argv[2] || '/usr/local/share/robos/robos-lib';
const file = path.join(dir, 'dom-snapshot.js');
if (!fs.existsSync(file)) { console.log('No shared desktop library; source inventory remains available'); process.exit(0); }
const before = fs.readFileSync(file, 'utf8'); let after = before;
const marker = "require('./service-registry.cjs').instrumentListeners()";
if (!after.includes(marker)) {
  if (!after.includes('function startDebugServer(win, port, appId) {')) throw new Error('Unrecognized shared library version; no files changed');
  after = after.replace('function startDebugServer(win, port, appId) {', `try { ${marker}; } catch {}\n\nfunction startDebugServer(win, port, appId) {`);
}
if (!after.includes('startDebugServer.supportsHostBinding = true;')) {
  if (!after.includes("server.listen(port, '0.0.0.0', () => {") || !after.includes('module.exports = {')) throw new Error('Unrecognized listener binding; no files changed');
  after = after.replace('function startDebugServer(win, port, appId) {', 'function startDebugServer(win, port, appId, options = {}) {')
    .replace("server.listen(port, '0.0.0.0', () => {", "server.listen(port, options.host || '0.0.0.0', () => {")
    .replace('http://0.0.0.0:${port}', "http://${options.host || '0.0.0.0'}:${port}")
    .replace('module.exports = {', 'startDebugServer.supportsHostBinding = true;\n\nmodule.exports = {');
}
const backup = path.join(root(), 'integration-backup'); fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
const hash = crypto.createHash('sha256').update(before).digest('hex');
fs.writeFileSync(path.join(backup, `dom-snapshot-${hash}.js`), before, { mode: 0o600 });
const source = path.join(__dirname, '../runtime-tracker.cjs');
fs.copyFileSync(source, path.join(dir, 'service-registry.cjs'));
if (after !== before) fs.writeFileSync(file, after);
console.log('Installed runtime listener tracking and optional loopback debug binding');
