'use strict';
// RobOS Auto plugins. Every service line a shop offers ("We do towing", "We do tires") is a plugin in
// packages/robos-auto-plugins/<id>/ with a plugin.json manifest. The shop turns plugins on in Admin → Services;
// the choice is a robos:ShopService node in the shop KGraph, so it is backed up with everything else.
// An enabled plugin adds its menus and screens, its backend actions, its intake questions and labor operations,
// its KGraph types, its billable records (payments and reports count them) and its report cards.
// See packages/robos-auto-plugins/README.md for the manifest and the backend contract.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = process.env.ROBOS_AUTO_PLUGINS || path.join(__dirname, '../../robos-auto-plugins');
const RENDERER = path.join(__dirname, '../renderer');
const STATUSES = { ready: 'Ready', starter: 'Starter', planned: 'Planned' };
let found = null;
const backends = new Map();
function inside(dir, rel) { const file = path.resolve(dir, rel); if (!file.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(file)) throw new Error(`Plugin file ${rel} is missing`); return file; }
function validate(m, folder, dir) {
  const fail = msg => { throw new Error(`Plugin ${folder}: ${msg}`); };
  if (m.id !== folder || !/^[a-z][a-z0-9-]*$/.test(m.id)) fail('id must match its folder name');
  for (const k of ['name', 'offer', 'summary']) if (typeof m[k] !== 'string' || !m[k].trim()) fail(k + ' is required');
  if (!STATUSES[m.status]) fail('status must be ready, starter or planned');
  for (const menu of m.menus || []) if (!/^[a-z][a-z0-9-]*$/.test(menu.view || '') || !menu.label || !menu.icon || !Number.isFinite(menu.order)) fail('each menu needs view, label, icon and order');
  for (const f of [m.backend, m.intake, m.labor, ...(m.renderer?.scripts || []), ...(m.renderer?.styles || [])].filter(Boolean)) inside(dir, f);
  return m;
}
// Every plugin on disk. Their KGraph types are registered once, whether or not a shop has them turned on,
// so records a plugin wrote stay valid after it is turned off.
function discover() {
  if (found) return found;
  const list = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(ROOT, d.name, 'plugin.json')))
    .map(d => { const dir = path.join(ROOT, d.name); return { ...validate(JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')), d.name, dir), dir }; })
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name));
  for (const p of list) for (const r of p.requires || []) if (!list.some(x => x.id === r)) throw new Error(`Plugin ${p.id} requires ${r}, which is not installed`);
  const types = list.flatMap(p => p.types || []); if (types.length) require('../../robos-graph/lib/auto-shapes').registerAutoTypes(types);
  return (found = list);
}
const core = () => ({ workshop: require('./workshop'), shop: require('./shop-operations'), importer: require('./importer'), reports: require('./reports'), host: module.exports });
function backend(p) {
  if (!p.backend) return null;
  if (!backends.has(p.id)) backends.set(p.id, require(path.join(p.dir, p.backend))(core()));
  return backends.get(p.id);
}
const records = service => service.workspace.read()['robos:nodes'];
function choices(service) { return new Map(records(service).filter(n => n['@type'] === 'robos:ShopService').map(n => [n['robos:pluginId'], n])); }
function isEnabled(p, chosen) { if (p.status === 'planned') return false; const c = chosen.get(p.id); return c ? c['robos:enabled'] === true : !!p.defaultEnabled; }
function enabled(service) { if (service.mode !== 'shop') return []; const chosen = choices(service); return discover().filter(p => isEnabled(p, chosen)); }
const enabledIds = service => new Set(enabled(service).map(p => p.id));
const url = file => path.relative(RENDERER, file).split(path.sep).join('/');
function list(service) {
  const on = enabledIds(service);
  return discover().map(p => ({ id: p.id, name: p.name, offer: p.offer, summary: p.summary, status: p.status, statusLabel: STATUSES[p.status], enabled: on.has(p.id), requires: p.requires || [], roadmap: p.roadmap || [], guide: p.guide || null,
    menus: p.menus || [], scripts: (p.renderer?.scripts || []).map(f => url(path.join(p.dir, f))), styles: (p.renderer?.styles || []).map(f => url(path.join(p.dir, f))) }));
}
function setService(service, input) {
  require('./shop-operations').shop(service);
  const p = discover().find(x => x.id === input.plugin); if (!p) throw new Error('Unknown service');
  const on = input.enabled === true, ids = enabledIds(service);
  if (on && p.status === 'planned') throw new Error(`${p.name} is planned but not built yet`);
  if (on) { const missing = (p.requires || []).filter(r => !ids.has(r)).map(r => discover().find(x => x.id === r).name); if (missing.length) throw new Error(`Turn on ${missing.join(' and ')} first`); }
  else { const users = discover().filter(x => ids.has(x.id) && (x.requires || []).includes(p.id)).map(x => x.name); if (users.length) throw new Error(`Turn off ${users.join(' and ')} first; ${users.length > 1 ? 'they need' : 'it needs'} ${p.name}`); }
  const existing = choices(service).get(p.id), { node } = require('./importer');
  const edits = existing ? [{ op: 'update', id: existing['@id'], set: { 'robos:enabled': on } }] : [{ op: 'add', node: node('ShopService', crypto.randomUUID(), p.name, { 'schema:name': p.name, 'robos:pluginId': p.id, 'robos:enabled': on }) }];
  require('./shop-operations').commit(service, edits, `auto: ${on ? p.offer : 'no longer ' + p.offer.replace(/^We do /i, 'doing ')}`);
  return list(service);
}
// The backend action `name` from an enabled plugin. A turned-off plugin's actions are refused with a hint.
function action(service, name) {
  for (const p of discover()) {
    const b = backend(p); if (!b?.actions?.[name]) continue;
    if (!enabledIds(service).has(p.id)) throw new Error(`Turn on "${p.offer}" in Admin → Services to use this`);
    return b.actions[name];
  }
  return null;
}
// Hooks a plugin backend can offer the core (see README): billable record types, report cards, links shown on
// a repair job, front-desk intake add-ons, intake questions and labor operations.
const hooks = (service, key, { all = false } = {}) => (all ? discover() : enabled(service)).map(p => ({ p, h: backend(p)?.[key] })).filter(x => x.h);
function billableTypes(service) { return ['robos:RepairOrder', ...hooks(service, 'billableTypes', { all: true }).flatMap(x => x.h)]; }
function reportCards(service, nodes, ctx) { return hooks(service, 'reportCards').flatMap(({ p, h }) => h(nodes, { ...ctx, service }).map(c => ({ plugin: p.id, ...c }))); }
function jobLinks(service, nodes, job) { return Object.fromEntries(hooks(service, 'jobLinks').map(({ p, h }) => [p.id, h(nodes, job)]).filter(([, v]) => v)); }
function intakeAddon(service, key) { const hit = hooks(service, 'intakeAddons').find(x => x.h[key]); if (!hit) throw new Error(`Turn on the service for "${key}" in Admin → Services first`); return hit.h[key]; }
function intakeFragments(service) { return enabled(service).filter(p => p.intake).map(p => ({ plugin: p.id, graph: JSON.parse(fs.readFileSync(path.join(p.dir, p.intake), 'utf8'))['@graph'] })); }
function labor(service) { return enabled(service).filter(p => p.labor).flatMap(p => JSON.parse(fs.readFileSync(path.join(p.dir, p.labor), 'utf8')).map(l => ({ ...l, plugin: p.id }))); }
// A private folder for a plugin's own files (such as the parts counter's register data), backed up with the shop.
function dataDir(service, id) { const dir = path.join(service.dataRoot, 'plugins', id); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); return dir; }
// The shop KGraph as a store for shared RobOS components (RobOS Inventory, RobOS Orders): commits are validated,
// saved and snapshotted in the shop's private Git history.
function shopStore(service) { const { nodes } = require('./workshop'), { commit } = require('./shop-operations'); return { nodes: () => nodes(service), commit: (edits, message) => commit(service, edits, message) }; }
function plugin(id) { return discover().find(p => p.id === id) || null; }
module.exports = { ROOT, STATUSES, discover, list, enabled, enabledIds, setService, action, backend, billableTypes, reportCards, jobLinks, intakeAddon, intakeFragments, labor, dataDir, shopStore, plugin, reset: () => { found = null; backends.clear(); } };
