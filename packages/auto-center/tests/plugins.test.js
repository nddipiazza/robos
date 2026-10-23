'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { AutoCenter } = require('../lib/service');
const plugins = require('../lib/plugins');
function shop() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-plugins-')); const s = new AutoCenter({ root: path.join(dir, 'c'), privateRoot: path.join(dir, 'p') }); s.setMode('shop');
  return { s, W: (a, i) => s.workshop(a, i) };
}
const nodes = s => s.workspace.read()['robos:nodes'];
test('every plugin manifest is valid, and each status is used', () => {
  const list = plugins.discover();
  assert.ok(list.length >= 15);
  for (const id of ['repair', 'tow', 'parts-sales', 'body', 'tires', 'alignment', 'fleet']) assert.ok(list.some(p => p.id === id), id);
  assert.deepEqual([...new Set(list.map(p => p.status))].sort(), ['planned', 'ready', 'starter']);
  for (const p of list.filter(p => p.status === 'starter')) { assert.deepEqual(p.requires, ['repair']); assert.ok(p.intake && p.labor, p.id); }
  const views = list.flatMap(p => (p.menus || []).map(m => m.view)); assert.equal(new Set(views).size, views.length, 'menu views are unique');
  require('../../robos-graph/lib/auto-shapes').AUTO_TYPES.some(([name]) => name === 'TowJob') || assert.fail('tow types are registered');
});
test('a new shop does auto repair only; turning services on and off is saved in the shop graph and Git', () => {
  const { s, W } = shop();
  assert.deepEqual(W('services').filter(p => p.enabled).map(p => p.id), ['repair']);
  assert.throws(() => W('towBoard'), /Turn on "We do towing" in Admin → Services/);
  W('setService', { plugin: 'tow', enabled: true }); assert.equal(W('towBoard').tows.length, 0);
  assert.throws(() => W('setService', { plugin: 'fleet', enabled: true }), /planned but not built yet/);
  W('setService', { plugin: 'tires', enabled: true });
  assert.throws(() => W('setService', { plugin: 'repair', enabled: false }), /Turn off Tires first; it needs Auto repair/);
  W('setService', { plugin: 'tires', enabled: false }); W('setService', { plugin: 'repair', enabled: false });
  assert.throws(() => W('setService', { plugin: 'tires', enabled: true }), /Turn on Auto repair first/);
  assert.throws(() => W('intakeForm'), /We do auto repair/);
  assert.deepEqual(nodes(s).filter(n => n['@type'] === 'robos:ShopService').map(n => [n['robos:pluginId'], n['robos:enabled']]).sort(), [['repair', false], ['tires', false], ['tow', true]]);
  const log = require('node:child_process').execFileSync('git', ['log', '--format=%s'], { cwd: path.join(s.privateRoot, 'shop'), encoding: 'utf8' });
  assert.match(log, /auto: We do towing/); assert.match(log, /auto: no longer doing auto repair/);
  assert.equal(s.status().plugins.find(p => p.id === 'tow').scripts[0], '../../robos-auto-plugins/tow/renderer/tow.js');
  s.setMode('owner'); assert.deepEqual(s.status().plugins, []);
});
test('a starter plugin adds its intake category and labor to the repair desk', () => {
  const { W } = shop();
  assert.ok(!W('intakeForm').categories.some(c => c.id === 'tires'));
  W('setService', { plugin: 'tires', enabled: true });
  const cats = W('intakeForm').categories; assert.equal(cats[cats.length - 1].id, 'other', 'Something else stays last');
  assert.deepEqual(cats.find(c => c.id === 'tires').questions.map(q => q.key), ['need', 'size', 'count', 'storage']);
  const c = W('registerCustomer', { name: 'Ana Ruiz', phone: '555-010-0177' }), v = W('addCustomerVehicle', { customer: c['@id'], year: '2019', make: 'Honda', model: 'Civic' });
  const { job } = W('intakeRepair', { vehicle: v['@id'], channel: 'walk-in', category: 'tires', answers: { need: ['New tires', 'Balance'], size: '215/55R16', count: 'Four' } });
  assert.equal(job['dcterms:title'], 'Tires — What do they need: New tires, Balance; Tire size from the sidewall, such as 225/45R17: 215/55R16; How many tires: Four');
});
test('plugin labor joins the type-ahead labor suggestions', () => {
  const { s, W } = shop();
  assert.equal(s.catalog('labor', 'seasonal tire').length, 0);
  W('setService', { plugin: 'tires', enabled: true });
  assert.equal(s.catalog('labor', 'seasonal tire')[0].source, 'tires');
});
