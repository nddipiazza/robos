'use strict';

const PETS = require('./data');

// Returns pets whose name or breed contains the query (case-insensitive).
function searchPets(query = '') {
  const q = String(query).trim().toLowerCase();
  if (!q) return PETS.slice();
  return PETS.filter(p => p.name.toLowerCase().includes(q) || p.breed.toLowerCase().includes(q));
}

module.exports = { searchPets };
