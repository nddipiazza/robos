'use strict';
// Shop owner administration: team members, shop settings.
const crypto = require('node:crypto');
const w = require('./workshop');
const { node } = require('./importer');
const { shop, commit } = require('./shop-operations');
const { amountMinor, CURRENCIES } = require('./reports');
function updateTeammate(service, input) {
  shop(service); const t = w.find(service, 'Teammate', input.id, 'Select a teammate'), set = {};
  if (input.role !== undefined) set['robos:role'] = w.text(input.role, 100, 'Role');
  if (input.hourlyCost !== undefined && input.hourlyCost !== '') set['robos:hourlyCostMinor'] = amountMinor(String(input.hourlyCost));
  if (input.active !== undefined) {
    set['robos:active'] = !!input.active;
    if (!input.active && t['robos:activeTimer']) throw new Error('Stop their running timer before deactivating them');
    if (!input.active) { const open = w.nodes(service).filter(n => n['@type'] === 'robos:RepairOrder' && n['robos:technician'] === t['schema:name'] && n['robos:jobStatus'] !== 'closed'); if (open.length && !input.reassignOk) throw new Error(`${t['schema:name']} is assigned to ${open.length} open ticket(s); finish or reassign them first`); }
  }
  if (!Object.keys(set).length) throw new Error('Nothing to change');
  commit(service, [{ op: 'update', id: t['@id'], set }], 'auto: update teammate'); return { id: t['@id'] };
}
function saveSettings(service, input) {
  shop(service); const name = w.text(input.name, 200, 'Shop name'), phone = w.text(input.phone, 50, 'Shop phone', false);
  if (!CURRENCIES.includes(input.currency || 'USD')) throw new Error('Choose a currency');
  const rate = input.defaultRate === undefined || input.defaultRate === '' ? null : amountMinor(String(input.defaultRate));
  const existing = w.nodes(service).find(n => n['@type'] === 'robos:AutoShop');
  const props = { 'schema:name': name, 'schema:telephone': phone, 'robos:defaultLaborRateMinor': rate, 'robos:currency': input.currency || 'USD' };
  if (existing) commit(service, [{ op: 'update', id: existing['@id'], set: { ...props, 'dcterms:title': name } }], 'auto: update shop settings');
  else commit(service, [{ op: 'add', node: node('AutoShop', crypto.randomUUID(), name, props) }], 'auto: save shop settings');
  return props;
}
module.exports = { updateTeammate, saveSettings };
