'use strict';
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/;
const ORIGIN = 'https://github.com/nddipiazza/robos/releases/download/';
function assetURL(value, version) {
  const url = new URL(value);
  if (!url.href.startsWith(`${ORIGIN}v${version}/`) || url.search || url.hash || url.username || url.password)
    throw new Error('Catalog contains an untrusted download URL');
  return url.href;
}
function validateCatalog(doc, platform = process.platform, arch = process.arch) {
  if (doc.schema !== 1 || !VERSION.test(doc.version) || doc.platform !== platform || doc.arch !== arch || !Array.isArray(doc.components))
    throw new Error('This catalog is not compatible with this RobOS installation');
  const ids = new Set();
  for (const item of doc.components) {
    if (!ID.test(item.id) || ids.has(item.id) || !['app', 'library', 'data'].includes(item.kind) ||
        !VERSION.test(item.version) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 1 ||
        item.bytes > 1024 ** 3 || !Number.isSafeInteger(item.unpackedBytes) || item.unpackedBytes < 1 || item.unpackedBytes > 2 * 1024 ** 3 ||
        typeof item.label !== 'string' || !item.label.length || /[\r\n]/.test(item.label) ||
        typeof item.group !== 'string' || !Array.isArray(item.dependencies) || !item.dependencies.every(id => ID.test(id)))
      throw new Error('Invalid catalog component');
    assetURL(item.url, doc.version); ids.add(item.id);
  }
  const byId = new Map(doc.components.map(item => [item.id, item]));
  for (const item of doc.components) for (const dep of item.dependencies) if (!byId.has(dep)) throw new Error(`Missing dependency: ${dep}`);
  plan(doc, doc.components.map(item => item.id), {}); // Detect cycles even in unselected components.
  return doc;
}
function plan(doc, selected, installed) {
  if (!Array.isArray(selected) || !selected.every(id => typeof id === 'string')) throw new Error('Select apps to install');
  const byId = new Map(doc.components.map(item => [item.id, item]));
  const done = new Set(), visiting = new Set(), result = [];
  function visit(id) {
    const item = byId.get(id);
    if (!item) throw new Error(`Unknown app: ${id}`);
    if (visiting.has(id)) throw new Error(`Dependency cycle: ${id}`);
    if (done.has(id)) return;
    visiting.add(id); item.dependencies.forEach(visit); visiting.delete(id); done.add(id);
    if (installed[id]?.sha256 !== item.sha256) result.push(item);
  }
  selected.forEach(visit); return result;
}
module.exports = { ID, VERSION, ORIGIN, assetURL, validateCatalog, plan };
