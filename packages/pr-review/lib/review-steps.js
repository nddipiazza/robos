'use strict';
// The review steps a local review shows, and whether each required one is finished.
// Teams set them per repository in Git Projects (PR review tab); a launch manifest can
// override them for one review with "reviewSteps".
const { execFileSync } = require('node:child_process');
const settings = require('../../robos-lib/project-review-settings');

function resolve(review) {
  let steps = settings.reviewSteps();
  try { steps = settings.read(review.repo).reviewSteps; } catch { /* no GitHub repository: defaults */ }
  return review.reviewSteps ? settings.reviewSteps({ ...steps, ...review.reviewSteps }) : steps;
}

// The stepper policy for the review window: hidden steps get no tab, required ones are marked.
function theaterConfig(steps) {
  const stage = mode => ({ enabled: mode !== 'hidden', required: mode === 'required' });
  return {
    stage1_elearning: { enabled: false, required: false, lockDiffsUntilPassed: false }, stage2_livingDocs: { enabled: false }, stage4_ideBridge: { enabled: false }, stage7_signOff: { enabled: false },
    stage3_fileDiffs: stage(steps.changes), stage5_proofCanvas: stage(steps.evidence), stage6_showTheFix: stage(steps.walkthrough),
  };
}

function walkthroughDone(demo) {
  return !!demo && demo.mode === 'feature' && demo.status === 'paused' && demo.total > 0 && demo.index === demo.total - 1;
}

/** Each step's progress. `viewedFiles` comes from the Changes tab; evidence and the walkthrough are read here. */
function status(review, { viewedFiles = [], demo = null, loadEvidence = () => require('./task-evidence-view').load(review) } = {}) {
  const steps = resolve(review);
  const files = execFileSync('git', ['diff', '--name-only', review.base, 'HEAD', '--'], { cwd: review.workspace, encoding: 'utf8' }).split('\n').filter(Boolean);
  const viewed = new Set(Array.isArray(viewedFiles) ? viewedFiles.filter(f => typeof f === 'string') : []);
  const seen = files.filter(f => viewed.has(f)).length;
  let bundle = null, evidenceError = '';
  try { bundle = loadEvidence(); } catch (error) { evidenceError = error.message; }
  const captured = bundle ? bundle.scenarios.filter(s => s.status === 'passed').length : 0;
  const items = [
    { step: 'changes', label: 'Mark every changed file as viewed', done: files.length > 0 && seen === files.length, detail: `${seen} of ${files.length} files viewed` },
    { step: 'evidence', label: 'Evidence captured for the latest commit', done: bundle?.status === 'completed',
      detail: evidenceError || (!bundle ? 'No evidence bundle is linked to this task.' : bundle.status === 'completed' ? `${captured} of ${bundle.scenarios.length} scenarios captured` : `${captured} of ${bundle.scenarios.length} scenarios captured for this commit`) },
    { step: 'walkthrough', label: 'Finish the walkthrough', done: walkthroughDone(demo),
      detail: !demo ? 'No walkthrough is configured for this review.' : walkthroughDone(demo) ? 'Walkthrough complete' : demo.index < 0 ? `Not started · ${demo.total} steps` : `Step ${demo.index + 1} of ${demo.total}` },
  ].map(item => ({ ...item, mode: steps[item.step] }));
  return { steps, items, missing: items.filter(item => item.mode === 'required' && !item.done) };
}

function assertComplete(review, options) {
  const { missing } = status(review, options);
  if (missing.length) throw Object.assign(new Error('Finish the required review steps first: ' + missing.map(m => `${m.label.toLowerCase()} (${m.detail})`).join('; ') + '.'), { code: 'REVIEW_STEPS' });
}

module.exports = { resolve, theaterConfig, status, assertComplete, walkthroughDone };
