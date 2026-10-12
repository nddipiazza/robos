'use strict';
// Covers the building blocks of the review-lifecycle hero recording (lib/lifecycle):
// the sample repo and the edits the scripted agents make, the stand-in GitHub, the
// evidence bundle (valid, then stale after a new commit), and the recording composer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const L = path.resolve(__dirname, '../../lib/lifecycle');
const world = require(L + '/world');
const forge = require(L + '/forge');
const { buildEvidence, SCENARIOS, EXTRA_SCENARIOS } = require(L + '/evidence');
const { readBundle } = require('../../../robos-lib/evidence-bundle');
const { parse, STEPS } = require(L + '/compose');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-test-'));
// The sample project's own `node --test`; drop the parent runner's marker so it prints normally.
const runTests = (cwd) => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return execFileSync('node', ['--test'], { cwd, env, encoding: 'utf8' }); };

test('the feature commit passes the sample project tests', () => {
  const w = world.createWorld(path.join(tmp(), 'w'));
  world.implementFeature(w.workspace);
  assert.match(runTests(w.workspace), /# pass 8\b/);
  assert.equal(world.git(w.workspace, 'branch', '--show-current'), 'codex/42');
});

test('removing useless comments is a real, scoped edit and commit', () => {
  const w = world.createWorld(path.join(tmp(), 'w'));
  world.implementFeature(w.workspace);
  const before = fs.readFileSync(path.join(w.workspace, 'src/pets.js'), 'utf8');
  const { removed } = world.removeUselessComments(w.workspace);
  const after = fs.readFileSync(path.join(w.workspace, 'src/pets.js'), 'utf8');
  assert.equal(removed, world.USELESS_COMMENTS.length);
  for (const c of world.USELESS_COMMENTS) { assert.ok(before.includes('// ' + c)); assert.ok(!after.includes('// ' + c)); }
  assert.ok(after.includes('// Exact name beats prefix beats substring'), 'comments that explain why are kept');
  assert.equal(world.git(w.workspace, 'status', '--porcelain'), '');
  assert.match(runTests(w.workspace), /# fail 0\b/);
});

test('switching to species chips changes only the page', () => {
  const w = world.createWorld(path.join(tmp(), 'w'));
  world.implementFeature(w.workspace);
  world.useSpeciesChips(w.workspace);
  const files = world.git(w.workspace, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean);
  assert.deepEqual(files, ['public/index.html']);
  assert.match(fs.readFileSync(path.join(w.workspace, 'public/index.html'), 'utf8'), /id="chips"/);
});

test('evidence bundle is valid for HEAD and goes stale after a new commit', () => {
  const root = tmp();
  const w = world.createWorld(path.join(root, 'w'));
  world.implementFeature(w.workspace);
  const bundlePath = buildEvidence({ workspace: w.workspace, baseRef: 'origin/main', outDir: path.join(root, 'ev'), scenarios: [...SCENARIOS, ...EXTRA_SCENARIOS] });
  const head = world.git(w.workspace, 'rev-parse', 'HEAD');
  const fresh = readBundle(bundlePath, head);
  assert.equal(fresh.status, 'completed');
  assert.equal(fresh.scenarios.length, 4);
  assert.ok(fresh.artifacts.every(a => a.verified !== false));
  world.removeUselessComments(w.workspace);
  const stale = readBundle(bundlePath, world.git(w.workspace, 'rev-parse', 'HEAD'));
  assert.equal(stale.status, 'needs-attention');
  assert.match(stale.scenarios[0].summary, /earlier revision/);
});

test('the stand-in forge walks a PR from draft to merged and enforces review rules', () => {
  const root = tmp();
  const w = world.createWorld(path.join(root, 'w'));
  world.implementFeature(w.workspace);
  const state = path.join(root, 'state.json');
  forge.save(state, { issues: [], labels: [], prs: [], user: forge.ME, nextNumber: 40, ci: {} });
  const body = path.join(root, 'body.md'); fs.writeFileSync(body, '## Changes\n\nx\n');
  const gh = (args, token) => execFileSync(path.join(L, 'bin/gh'), args, { encoding: 'utf8', env: { ...process.env, FAKE_FORGE_STATE: state, FAKE_WORKSPACE: w.workspace, ...(token ? { GH_TOKEN: 'token-' + token } : {}) } });
  const url = gh(['pr', 'create', '--repo', forge.REPO, '--head', 'codex/42', '--base', 'main', '--title', 't', '--body-file', body, '--draft']).trim();
  assert.match(url, /\/pull\/41$/);
  const view = () => JSON.parse(gh(['pr', 'view', '41', '--json', 'state,isDraft,reviewDecision,author']));
  assert.deepEqual([view().isDraft, view().state], [true, 'OPEN']);
  assert.throws(() => gh(['pr', 'review', '--repo', forge.REPO, '41', '--approve']), /own pull request/);   // authors cannot approve themselves
  assert.throws(() => gh(['pr', 'merge', '41', '--squash']), /still a draft/);
  gh(['pr', 'ready', url]);
  gh(['pr', 'review', '--repo', forge.REPO, '41', '--approve'], forge.REVIEWER);
  assert.equal(view().reviewDecision, 'APPROVED');
  gh(['pr', 'merge', '41', '--squash']);
  assert.equal(view().state, 'MERGED');
  assert.equal(world.git(w.workspace, '--git-dir', path.join(w.root, 'remote.git'), 'rev-parse', 'main'), world.git(w.workspace, 'rev-parse', 'HEAD'));
});

test('the composer splits a recording into captioned segments and slides, skipping cuts', () => {
  const { segs, slides } = parse([
    { t: 0, type: 'cut-start' }, { t: 2, type: 'cut-end' },
    { t: 2, type: 'step', id: STEPS[0].id },
    { t: 3, type: 'caption', text: 'hi' },
    { t: 5, type: 'slide', id: 'a', file: '01-a.png', dwell: 5000 },
    { t: 7, type: 'step', id: STEPS[1].id },
    { t: 9, type: 'end' },
  ]);
  assert.deepEqual(segs.map(s => [s.a, s.b, s.step, s.cap]), [[2, 3, 0, null], [3, 7, 0, 'hi'], [7, 9, 1, null]]);
  assert.deepEqual(slides.map(s => [s.id, s.step, s.cap, s.dwell]), [['a', 0, 'hi', 5000]]);
});
