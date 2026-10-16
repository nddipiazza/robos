'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { searchPets } = require('../src/pets');

test('empty query returns every pet', () => {
  assert.equal(searchPets('').length, 6);
});

test('matches on name or breed', () => {
  assert.deepEqual(searchPets('beagle').map(p => p.name), ['Biscuit', 'Scout']);
});
