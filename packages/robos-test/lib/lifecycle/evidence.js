'use strict';
/**
 * Builds a real task-evidence bundle for the review app: each scenario does the
 * same action in a real browser on the base revision (before) and on the
 * implemented branch (after), and keeps both screenshots and what the page showed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { execFileSync } = require('child_process');

// The built-in "Product UI before and after" template: real screens of the same action on
// main and on the branch, plus what the browser saw.
const TEMPLATE = require('../../../robos-lib/evidence-templates/builtin.json').find(t => t['@id'] === 'urn:robos:evidence-template:product-ui:v1');

const SCENARIOS = [
  { id: 'species-filter', title: 'Species filter returns only the requested species', action: 'Open the search page and choose Cats.', steps: { species: 'cat' },
    call: "searchPets('', { species: 'cat' })", summary: 'Choosing Cats shows Mochi and Pepper only. Main has no species control and keeps showing all six pets.' },
  { id: 'unknown-species', title: 'Unknown species is rejected with the valid choices', action: 'Request /api/pets?species=dragon.', steps: { url: '/api/pets?species=dragon' },
    call: "searchPets('', { species: 'dragon' })", summary: 'The API answers with an error that lists cat, dog and rabbit. Main ignores the parameter and returns every pet.' },
  { id: 'ranking', title: 'Better matches rank first', action: 'Type "b" in the search box.', steps: { q: 'b' },
    call: "searchPets('b')", summary: 'Name and breed prefix matches (Biscuit, Juniper, Scout) now come before the substring match (Pepper, "Tabby").' },
];

/** Added later at the reviewer's request (see bin/codex). */
const EXTRA_SCENARIOS = [
  { id: 'combine', title: 'Text search and species filter combine', action: 'Type "a" and choose Rabbits.', steps: { q: 'a', species: 'rabbit' },
    call: "searchPets('a', { species: 'rabbit' })", summary: 'Only Waffles, the one rabbit matching "a". Main ignores the species and shows five pets.' },
];

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const hex16 = (s) => sha(s).slice(0, 16);

function runCall(srcRoot, call) {
  const code = `
    const { searchPets } = require(${JSON.stringify(path.join(srcRoot, 'src/pets.js'))});
    try {
      const r = ${call};
      console.log(r.length ? r.map(p => p.name.padEnd(8) + p.species.padEnd(7) + p.breed).join('\\n') : '(no pets)');
    } catch (e) { console.log(e.name + ': ' + e.message); }`;
  return execFileSync('node', ['-e', code], { encoding: 'utf8' }).trim() + '\n';
}

const pause = (ms) => ms && Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Builds the evidence bundle. The bundle file is rewritten after every scenario,
 * so a review window can show evidence filling in while it is being made.
 */
function buildEvidence({ workspace, baseRef = 'origin/main', outDir, scenarios: list = SCENARIOS, progress = () => {}, pauseMs = 0 }) {
  fs.mkdirSync(outDir, { recursive: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
  const baseShort = execFileSync('git', ['rev-parse', '--short', baseRef], { cwd: workspace, encoding: 'utf8' }).trim();
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawfinder-base-'));
  execFileSync('sh', ['-c', `git archive ${baseRef} | tar -x -C ${baseDir}`], { cwd: workspace });

  const artifacts = [], bindings = [], scenarios = [];
  const bundlePath = path.join(outDir, 'evidence-bundle.json');
  const write = () => {
    const bundle = {
      '@type': 'robos:EvidenceBundle', 'robos:evidenceTemplate': TEMPLATE['@id'], template: TEMPLATE,
      revision: head, finishedAt: new Date().toISOString(),
      scenarios, artifacts, templateBindings: bindings,
      limitations: ['Observed against the bundled sample pets, not production data.'],
    };
    fs.writeFileSync(bundlePath + '.tmp', JSON.stringify(bundle, null, 2));
    fs.renameSync(bundlePath + '.tmp', bundlePath);
  };
  for (const sc of list) {
    progress(`${sc.action} Doing it on main and on this branch…`);
    pause(pauseMs);
    const shots = JSON.parse(execFileSync('node', [path.join(__dirname, 'capture-web.js'), JSON.stringify({ baseDir, headDir: workspace, outDir, scenario: sc })], { encoding: 'utf8' }));
    const checks = path.join(outDir, `${sc.id}-checks.txt`);
    fs.writeFileSync(checks, [`// ${sc.action}`, `Before (main @ ${baseShort}): ${shots.before.shown}`, `After (codex/42 @ ${head.slice(0, 7)}): ${shots.after.shown}`, '',
      `// The same check in code: ${sc.call}`, runCall(workspace, sc.call)].join('\n'));
    const files = { before: shots.before.file, after: shots.after.file, checks };
    const labels = { before: 'Before (main @ ' + baseShort + ')', after: 'After (codex/42 @ ' + head.slice(0, 7) + ')', checks: 'What the browser saw' };
    for (const [slot, file] of Object.entries(files)) {
      const id = hex16(`${sc.id}:${slot}`);
      artifacts.push({ id, scenarioId: sc.id, path: file, sha256: sha(fs.readFileSync(file)), label: labels[slot], source: slot === 'checks' ? 'Chromium, local dev server' : 'Chromium 1040×600, ' + (sc.steps.url || '/') });
      bindings.push({ scenarioId: sc.id, slotId: slot, artifactId: id });
    }
    scenarios.push({ id: sc.id, title: sc.title, status: 'passed', summary: sc.summary });
    write();
    progress(`Captured “${sc.title}”.`);
  }
  if (!list.length) write();
  fs.rmSync(baseDir, { recursive: true, force: true });
  return bundlePath;
}

module.exports = { buildEvidence, TEMPLATE, SCENARIOS, EXTRA_SCENARIOS };
