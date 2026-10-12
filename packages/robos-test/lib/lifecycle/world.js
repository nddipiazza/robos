'use strict';
/**
 * Fixture "world" for the end-to-end review-lifecycle demo.
 *
 * Builds a small but real git project (acme-corp/pawfinder-api), a local bare
 * remote standing in for GitHub, and the real feature commit that the scripted
 * agent makes. Everything here is plain git and plain files; only the forge
 * (see fake-gh.js) and the agent binary are stand-ins.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = 'acme-corp/pawfinder-api';
const TASK = {
  number: 42,
  key: '#42',
  title: 'Add species filter and ranking to pet search',
  branch: 'codex/42',
};

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const BASE_FILES = {
  'package.json': JSON.stringify({ name: 'pawfinder-api', version: '1.4.0', private: true, scripts: { test: 'node --test' } }, null, 2) + '\n',
  'README.md': '# pawfinder-api\n\nSearch service behind the Pawfinder adoption site.\n',
  'src/pets.js': `'use strict';

const PETS = require('./data');

// Returns pets whose name or breed contains the query (case-insensitive).
function searchPets(query = '') {
  const q = String(query).trim().toLowerCase();
  if (!q) return PETS.slice();
  return PETS.filter(p => p.name.toLowerCase().includes(q) || p.breed.toLowerCase().includes(q));
}

module.exports = { searchPets };
`,
  'src/data.js': `'use strict';

module.exports = [
  { id: 1, name: 'Biscuit', species: 'dog', breed: 'Beagle', ageYears: 3, shelter: 'Eastside' },
  { id: 2, name: 'Mochi', species: 'cat', breed: 'Siamese', ageYears: 2, shelter: 'Eastside' },
  { id: 3, name: 'Juniper', species: 'dog', breed: 'Border Collie', ageYears: 5, shelter: 'Harbor' },
  { id: 4, name: 'Pepper', species: 'cat', breed: 'Tabby', ageYears: 1, shelter: 'Harbor' },
  { id: 5, name: 'Waffles', species: 'rabbit', breed: 'Holland Lop', ageYears: 2, shelter: 'Eastside' },
  { id: 6, name: 'Scout', species: 'dog', breed: 'Beagle Mix', ageYears: 7, shelter: 'Harbor' },
];
`,
  'test/pets.test.js': `'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { searchPets } = require('../src/pets');

test('empty query returns every pet', () => {
  assert.equal(searchPets('').length, 6);
});

test('matches on name or breed', () => {
  assert.deepEqual(searchPets('beagle').map(p => p.name), ['Biscuit', 'Scout']);
});
`,
};

const FEATURE_FILES = {
  'src/pets.js': `'use strict';

const PETS = require('./data');
const SPECIES = new Set(PETS.map(p => p.species));

function score(pet, q) {
  if (!q) return 0;
  const name = pet.name.toLowerCase();
  const breed = pet.breed.toLowerCase();
  if (name === q) return 3;
  if (name.startsWith(q) || breed.startsWith(q)) return 2;
  return name.includes(q) || breed.includes(q) ? 1 : -1;
}

// Search by text and optionally narrow to one species. Best matches come first.
function searchPets(query = '', { species } = {}) {
  const q = String(query).trim().toLowerCase();
  let wanted = null;
  if (species !== undefined && species !== null && species !== '') {
    wanted = String(species).trim().toLowerCase();
    if (!SPECIES.has(wanted)) {
      throw new RangeError(\`Unknown species "\${species}". Expected one of: \${[...SPECIES].sort().join(', ')}\`);
    }
  }
  return PETS
    .filter(p => (!wanted || p.species === wanted) && score(p, q) >= 0)
    .map(p => ({ p, s: score(p, q) }))
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    .map(({ p }) => p);
}

module.exports = { searchPets, SPECIES: [...SPECIES].sort() };
`,
  'test/pets.test.js': `'use strict';
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
`,
};

function write(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

/** Create remote.git + a workspace on main whose origin looks like GitHub. */
function createWorld(root) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  const remote = path.join(root, 'remote.git');
  const workspace = path.join(root, 'pawfinder-api');
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  fs.mkdirSync(workspace);
  git(workspace, 'init', '-q', '-b', 'main');
  git(workspace, 'config', 'user.name', 'Dana Whitfield');
  git(workspace, 'config', 'user.email', 'dana@acme-corp.example');
  write(workspace, BASE_FILES);
  git(workspace, 'add', 'package.json', 'README.md', 'src', 'test');
  git(workspace, 'commit', '-q', '-m', 'Initial pet search');
  // origin is the local bare repo; bin/git reports it as the GitHub URL when
  // RobOS asks `git remote get-url origin` (it requires a github.com origin).
  git(workspace, 'remote', 'add', 'origin', remote);
  git(workspace, 'push', '-q', 'origin', 'main');
  git(workspace, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(workspace, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  return { root, remote, workspace };
}

/** What the scripted agent commits: a real, tested feature change on its own branch. */
function implementFeature(workspace, branch = TASK.branch) {
  git(workspace, 'checkout', '-q', '-b', branch);
  write(workspace, FEATURE_FILES);
  git(workspace, 'add', 'src/pets.js', 'test/pets.test.js');
  git(workspace, 'commit', '-q', '-m', 'feat(search): add species filter and relevance ranking (#42)',
    '-m', 'Adds an optional species filter to searchPets, ranks exact and prefix matches above substring matches, and rejects unknown species with the list of valid choices.');
  git(workspace, 'push', '-q', '-u', 'origin', branch);
  return git(workspace, 'rev-parse', 'HEAD');
}

module.exports = { REPO, TASK, createWorld, implementFeature, git };
