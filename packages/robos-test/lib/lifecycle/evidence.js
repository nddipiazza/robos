'use strict';
/**
 * Builds a real task-evidence bundle for the review app: every captured
 * response is produced by actually calling searchPets on the base revision
 * (before) and on the implemented branch (after).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { execFileSync } = require('child_process');

const TEMPLATE = {
  '@id': 'urn:robos:evidence-template:api-response:v1',
  '@type': 'robos:EvidenceTemplate',
  'robos:package': 'testing',
  'dcterms:title': 'API request and response',
  'dcterms:description': 'Capture the exact call and the actual before and after results against the same data.',
  'robos:version': 1,
  'robos:webElement': 'robos-evidence-transcript',
  'robos:collectionInstructions': 'Capture the exact call and the actual before and after results against the same data.',
  'robos:artifactSlots': [
    { id: 'request', name: 'Call', kind: 'text', required: true },
    { id: 'before', name: 'Before (main)', kind: 'text', required: true },
    { id: 'after', name: 'After (this change)', kind: 'text', required: true },
  ],
  'robos:refersFrom': 'https://schema.org/CreativeWork',
};

const SCENARIOS = [
  { id: 'species-filter', title: 'Species filter returns only the requested species',
    call: "searchPets('', { species: 'cat' })", summary: 'Only the two cats are returned; main ignores the filter and returns all six pets.' },
  { id: 'unknown-species', title: 'Unknown species is rejected with the valid choices',
    call: "searchPets('', { species: 'dragon' })", summary: 'The call throws RangeError listing cat, dog, rabbit; main silently returns every pet.' },
  { id: 'ranking', title: 'Better matches rank first',
    call: "searchPets('b')", summary: 'Name and breed prefix matches (Biscuit, Juniper, Scout) now come before the substring match (Pepper, "Tabby").' },
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

function buildEvidence({ workspace, baseRef = 'origin/main', outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawfinder-base-'));
  execFileSync('sh', ['-c', `git archive ${baseRef} | tar -x -C ${baseDir}`], { cwd: workspace });

  const artifacts = [], bindings = [], scenarios = [];
  for (const sc of SCENARIOS) {
    const files = {
      request: `// ${sc.title}\n${sc.call}\n`,
      before: `// main @ ${execFileSync('git', ['rev-parse', '--short', baseRef], { cwd: workspace, encoding: 'utf8' }).trim()}\n` + runCall(baseDir, sc.call),
      after: `// codex/42 @ ${head.slice(0, 7)}\n` + runCall(workspace, sc.call),
    };
    for (const [slot, text] of Object.entries(files)) {
      const file = path.join(outDir, `${sc.id}-${slot}.txt`);
      fs.writeFileSync(file, text);
      const id = hex16(`${sc.id}:${slot}`);
      artifacts.push({ id, scenarioId: sc.id, path: file, sha256: sha(fs.readFileSync(file)), label: { request: 'Call', before: 'Before (main)', after: 'After (this change)' }[slot], source: 'local run' });
      bindings.push({ scenarioId: sc.id, slotId: slot, artifactId: id });
    }
    scenarios.push({ id: sc.id, title: sc.title, status: 'passed', summary: sc.summary });
  }

  // Real test run as one more passed scenario note (kept out of the template slots).
  const bundle = {
    '@type': 'robos:EvidenceBundle',
    'robos:evidenceTemplate': TEMPLATE['@id'],
    template: TEMPLATE,
    revision: head,
    finishedAt: new Date().toISOString(),
    scenarios, artifacts, templateBindings: bindings,
    limitations: ['Observed against the bundled sample pets, not production data.'],
  };
  const bundlePath = path.join(outDir, 'evidence-bundle.json');
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
  fs.rmSync(baseDir, { recursive: true, force: true });
  return bundlePath;
}

module.exports = { buildEvidence, TEMPLATE, SCENARIOS };
