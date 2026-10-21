'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { vehicleLabel } = require('../lib/vehicle-label');

test('vehicles read make, model, year, optional nickname, then the customer', () => {
  const jim = { 'schema:name': 'Jim Parker' };
  const accord = { 'dcterms:title': "Jim's Honda", 'schema:brand': 'Honda', 'schema:model': 'Accord', 'schema:modelDate': '2005' };
  assert.equal(vehicleLabel(accord, jim), 'Honda Accord 2005 — Jim Parker');
  assert.equal(vehicleLabel({ ...accord, 'robos:nickname': 'Old Blue' }, jim), 'Honda Accord 2005 (Old Blue) — Jim Parker');
  assert.equal(vehicleLabel({ ...accord, 'schema:modelDate': '' }, null), 'Honda Accord');
  // Older records with only a free-text name still show something.
  assert.equal(vehicleLabel({ 'dcterms:title': 'Shop loaner' }, jim), 'Shop loaner — Jim Parker');
  assert.equal(vehicleLabel(null, jim), '');
});
