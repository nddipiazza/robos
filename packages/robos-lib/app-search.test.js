'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSearchIndex, ALIASES } = require('./app-search');
const { catalog } = require('../../scripts/windows/setup.cjs');
const path = require('node:path');
const apps = catalog(path.resolve(__dirname, '../..'));
const search = createSearchIndex(apps);

test('every Windows app has intent vocabulary, with ordinary language ranked appropriately', () => {
  assert.deepEqual(apps.filter(app => !ALIASES[app.id]).map(app => app.id), []);
  for (const [query, id] of Object.entries({ music: 'audio-player', songs: 'audio-player', 'listen to my music': 'audio-player',
    'car repair': 'auto-center', 'cash register': 'point-of-sale', budget: 'household', sql: 'db-manager',
    password: 'pass-manager', 'install apps': 'software-center', 'new app': 'app-wizard', docs: 'robos-documentation',
    'pull requests': 'pr-review', 'k8s': 'kube-studio', 'café': 'point-of-sale' })) {
    assert.equal(search(query)[0]?.id, id, query);
  }
});
test('names outrank weaker fields; prefixes, plurals and small typos work without unrelated results', () => {
  assert.equal(search('Audio Player')[0].id, 'audio-player');
  assert.equal(search('auto cen')[0].id, 'auto-center');
  assert.equal(search('musci')[0].id, 'audio-player');
  assert.equal(search('playlists')[0].id, 'audio-player');
  assert.deepEqual(search('music sql'), []);
  assert.deepEqual(search('zzzzzzzzzz'), []);
  assert.deepEqual(search('  '), apps);
  const custom = createSearchIndex([{ id: 'other', label: 'Other', description: 'Find widgets here' }, { id: 'widgets', label: 'Widgets', keywords: 'gizmos;gadgets' }]);
  assert.equal(custom('widgets')[0].id, 'widgets');
  assert.equal(custom('gadgets')[0].id, 'widgets');
});
