'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { searchPets, SPECIES } = require('../src/pets');

test('empty query returns every pet', () => {
  assert.equal(searchPets('').length, 6);
});

test('matches on name or breed', () => {
  assert.deepEqual(searchPets('beagle').map(p => p.name), ['Biscuit', 'Scout']);
});

test('species filter narrows results (happy path)', () => {
  assert.deepEqual(searchPets('', { species: 'cat' }).map(p => p.name), ['Mochi', 'Pepper']);
});

test('species filter is case-insensitive and combines with text', () => {
  assert.deepEqual(searchPets('beagle', { species: 'DOG' }).map(p => p.name), ['Biscuit', 'Scout']);
});

test('exact and prefix matches rank above substring matches', () => {
  assert.equal(searchPets('scout')[0].name, 'Scout');
  assert.equal(searchPets('bea')[0].breed.startsWith('Beagle'), true);
});

test('unknown species is rejected with the valid choices (negative case)', () => {
  assert.throws(() => searchPets('', { species: 'dragon' }), /Unknown species "dragon".*cat, dog, rabbit/);
});

test('no match returns an empty list (edge case)', () => {
  assert.deepEqual(searchPets('zzz', { species: 'dog' }), []);
});

test('exposes the supported species', () => {
  assert.deepEqual(SPECIES, ['cat', 'dog', 'rabbit']);
});
