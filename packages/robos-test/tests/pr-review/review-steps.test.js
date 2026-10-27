'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const settings = require('../../../robos-lib/project-review-settings');
const steps = require('../../../pr-review/lib/review-steps');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-steps-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'T');
  fs.writeFileSync(path.join(dir, 'a.js'), '1\n'); git('add', '.'); git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  git('checkout', '-q', '-b', 'feature');
  fs.writeFileSync(path.join(dir, 'a.js'), '2\n'); fs.writeFileSync(path.join(dir, 'b.js'), '3\n'); git('add', '.'); git('commit', '-q', '-m', 'change');
  return { workspace: dir, base, repo: 'Local workspace' };
}

test('review steps default to optional, save strictly and read leniently', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-step-settings-'));
  assert.deepEqual(settings.read('org/repo', root).reviewSteps, { changes: 'optional', evidence: 'optional', walkthrough: 'optional' });
  settings.save('org/repo', { reviewSteps: { evidence: 'required', walkthrough: 'hidden' } }, root);
  assert.deepEqual(settings.read('org/repo', root).reviewSteps, { changes: 'optional', evidence: 'required', walkthrough: 'hidden' });
  settings.save('org/repo', { prTemplate: 'Edited' }, root);   // other edits keep the steps
  assert.equal(settings.read('org/repo', root).reviewSteps.evidence, 'required');
  assert.throws(() => settings.save('org/repo', { reviewSteps: { evidence: 'sometimes' } }, root), /required, optional or hidden/);
  fs.writeFileSync(path.join(root, fs.readdirSync(root)[0]), JSON.stringify({ reviewSteps: { changes: 'bogus', evidence: 'hidden' } }));
  assert.deepEqual(settings.read('org/repo', root).reviewSteps, { changes: 'optional', evidence: 'hidden', walkthrough: 'optional' });
});

test('the stepper policy hides, requires and keeps optional the local tabs', () => {
  const cfg = steps.theaterConfig({ changes: 'required', evidence: 'hidden', walkthrough: 'optional' });
  assert.deepEqual(cfg.stage3_fileDiffs, { enabled: true, required: true });
  assert.deepEqual(cfg.stage5_proofCanvas, { enabled: false, required: false });
  assert.deepEqual(cfg.stage6_showTheFix, { enabled: true, required: false });
  assert.equal(cfg.stage1_elearning.enabled, false);
});

test('required steps block until every file is viewed, evidence is fresh and the walkthrough is finished', () => {
  const review = { ...repo(), reviewSteps: { changes: 'required', evidence: 'required', walkthrough: 'required' } };
  const fresh = { status: 'completed', scenarios: [{ status: 'passed' }, { status: 'passed' }] };
  const stale = { status: 'needs-attention', scenarios: [{ status: 'blocked' }, { status: 'passed' }] };
  let result = steps.status(review, { viewedFiles: ['a.js'], demo: { mode: 'feature', status: 'paused', index: 0, total: 2 }, loadEvidence: () => stale });
  assert.deepEqual(result.missing.map(m => m.step), ['changes', 'evidence', 'walkthrough']);
  assert.equal(result.items[0].detail, '1 of 2 files viewed');
  assert.equal(result.items[2].detail, 'Step 1 of 2');
  assert.throws(() => steps.assertComplete(review, { viewedFiles: ['a.js'], loadEvidence: () => stale }), e => e.code === 'REVIEW_STEPS' && /files viewed/.test(e.message));
  result = steps.status(review, { viewedFiles: ['a.js', 'b.js', 'gone.js'], demo: { mode: 'feature', status: 'paused', index: 1, total: 2 }, loadEvidence: () => fresh });
  assert.deepEqual(result.missing, []);
  assert.doesNotThrow(() => steps.assertComplete(review, { viewedFiles: ['a.js', 'b.js'], demo: { mode: 'feature', status: 'paused', index: 1, total: 2 }, loadEvidence: () => fresh }));
  // The "how it used to work" checkpoints do not count as finishing the walkthrough.
  assert.equal(steps.walkthroughDone({ mode: 'before', status: 'paused', index: 1, total: 2 }), false);
});

test('optional and hidden steps never block, even when unfinished', () => {
  const review = { ...repo(), reviewSteps: { changes: 'optional', evidence: 'hidden' } };
  const result = steps.status(review, { loadEvidence: () => null });
  assert.deepEqual(result.missing, []);
  assert.equal(result.items.find(i => i.step === 'evidence').detail, 'No evidence bundle is linked to this task.');
});
