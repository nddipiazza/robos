'use strict';

// load the pets data
const PETS = require('./data');
// build the set of known species
const SPECIES = new Set(PETS.map(p => p.species));

// Exact name beats prefix beats substring; -1 means "not a match".
function score(pet, q) {
  if (!q) return 0;
  // lowercase the name and the breed
  const name = pet.name.toLowerCase();
  const breed = pet.breed.toLowerCase();
  if (name === q) return 3;
  if (name.startsWith(q) || breed.startsWith(q)) return 2;
  return name.includes(q) || breed.includes(q) ? 1 : -1;
}

// Search by text and optionally narrow to one species. Best matches come first.
function searchPets(query = '', { species } = {}) {
  // lowercase the query
  const q = String(query).trim().toLowerCase();
  let wanted = null;
  // only filter when a species was given
  if (species !== undefined && species !== null && species !== '') {
    wanted = String(species).trim().toLowerCase();
    // A typo should be an error, not silently return every pet.
    if (!SPECIES.has(wanted)) {
      throw new RangeError(`Unknown species "${species}". Expected one of: ${[...SPECIES].sort().join(', ')}`);
    }
  }
  // filter, score and sort the pets
  return PETS
    .filter(p => (!wanted || p.species === wanted) && score(p, q) >= 0)
    .map(p => ({ p, s: score(p, q) }))
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    .map(({ p }) => p);
}

module.exports = { searchPets, SPECIES: [...SPECIES].sort() };
