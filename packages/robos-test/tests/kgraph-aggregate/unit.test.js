'use strict';
// Guards the repository's own graph. Workspace tests use temporary fixtures, and the default
// store reads only the package files, so hand-edited packages used to drift unnoticed until a
// strict GraphWorkspace.read() crashed the managed apps.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GraphWorkspace, diffNodes } = require('../../../robos-graph/lib/graph-workspace');

const root = path.resolve(__dirname, '../../../../.robos');
const regenerate = 'Regenerate with: node packages/crpg-builder/scripts/sync-aggregate.js';
const aggregate = JSON.parse(fs.readFileSync(path.join(root, 'knowledge-graph.jsonld'), 'utf8'));
const packageNodes = fs.readdirSync(path.join(root, 'kgraphs'), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, 'kgraphs', entry.name, 'package.jsonld')))
  .flatMap(entry => JSON.parse(fs.readFileSync(path.join(root, 'kgraphs', entry.name, 'package.jsonld'), 'utf8'))['robos:nodes']);

test('the compatibility aggregate holds exactly the package nodes', () => {
  const { added, changed, removed } = diffNodes(aggregate['robos:nodes'], packageNodes);
  assert.deepEqual({
    missingFromAggregate: added.map(node => node['@id']),
    staleInAggregate: changed.map(({ id, properties }) => `${id} (${properties.map(p => p.property).join(', ')})`),
    missingFromPackages: removed.map(node => node['@id']),
  }, { missingFromAggregate: [], staleInAggregate: [], missingFromPackages: [] }, regenerate);
});

test('the aggregate @graph mirror matches robos:nodes', () => {
  const { added, changed, removed } = diffNodes(aggregate['@graph'], aggregate['robos:nodes']);
  assert.equal(added.length + changed.length + removed.length, 0, regenerate);
});

test('a strict workspace read of the repository graph succeeds', () => {
  assert.equal(new GraphWorkspace(root).read()['robos:nodes'].length, packageNodes.length);
});
