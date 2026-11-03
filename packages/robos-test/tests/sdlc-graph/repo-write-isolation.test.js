'use strict';
/**
 * Suites must not change the repository's canonical graph or docs: a change left
 * behind by a local run can get committed and reintroduce graph drift or dangling
 * references. These suites have all done that before, so each one runs here from
 * both directories people run tests from. Only the files on disk are compared; the
 * suites report their own pass/fail results when they run on their own.
 *
 * Suites that launch Electron are too slow to rerun here, so the source scan below
 * covers the patterns they used.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { REPO_ROOT } = require('../../lib/repo-fixture');

const PACKAGE_DIR = path.resolve(__dirname, '../..');
const TESTS_DIR = path.resolve(__dirname, '..');

const WATCHED = [
  '.robos',
  'docs/schemas',
  'docs/schemas.md',
  'docs/projects',
  'docs/applications',
  'packages/robos-test/.robos',
  'packages/robos-test/docs',
];

const SUITES = [
  'elearning/crpg-elearning.test.js',
  'elearning/elearning-web-generator.test.js',
  'remote-execution/remote-execution-kgraph.test.js',
  'sdlc-graph/app-elearning-doc-generator.test.js',
  'sdlc-graph/documentation-kgraph.test.js',
  'sdlc-graph/resource-importer.test.js',
  'sdlc-graph/schema-doc-generator.test.js',
  'voice-prompt/skills-voice.test.js',
];

function walk(target, visit) {
  if (!fs.existsSync(target)) return;
  if (!fs.statSync(target).isDirectory()) return visit(target);
  for (const entry of fs.readdirSync(target)) walk(path.join(target, entry), visit);
}

function fingerprint() {
  const hashes = new Map();
  for (const rel of WATCHED) {
    walk(path.join(REPO_ROOT, rel), (file) => {
      hashes.set(path.relative(REPO_ROOT, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
    });
  }
  return hashes;
}

function changedFiles(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((p) => before.get(p) !== after.get(p)).sort();
}

function runSuite(suite, cwd, home) {
  // NODE_TEST_CONTEXT would make the nested runner report to this one instead of running normally.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', path.join(TESTS_DIR, suite)], {
      cwd,
      env: { ...env, HOME: home },
      stdio: 'ignore',
      timeout: 120000,
    });
    child.on('close', resolve);
  });
}

describe('Suites leave the repository graph and docs unchanged', () => {
  for (const [label, cwd] of [['the robos-test package', PACKAGE_DIR], ['the repo root', REPO_ROOT]]) {
    it(`runs the graph and docs suites from ${label} without changing tracked files`, async (t) => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-repo-isolation-'));
      t.after(() => fs.rmSync(home, { recursive: true, force: true }));

      const before = fingerprint();
      await Promise.all(SUITES.map((suite) => runSuite(suite, cwd, home)));
      const changed = changedFiles(before, fingerprint());

      assert.deepStrictEqual(changed, [], `Suites changed repository files. Use lib/repo-fixture.js, then restore them:\n${changed.join('\n')}`);
    });
  }

  it('no suite points a graph store or screenshot output at the repository', () => {
    const forbidden = [
      /docs\/assets\/images\/screenshots/,
      /baseDir: '\.robos'/,
      /rootDir: path\.join\(\w+, '\.robos'\)/,
      /new SDLCKnowledgeGraphStore\(\{\s*filePath: path\.(join|resolve)\(__dirname/,
    ];
    const offenders = [];
    walk(TESTS_DIR, (file) => {
      if (!file.endsWith('.js') || file === __filename) return;
      const source = fs.readFileSync(file, 'utf8');
      if (forbidden.some((pattern) => pattern.test(source))) offenders.push(path.relative(TESTS_DIR, file));
    });
    assert.deepStrictEqual(offenders, [], 'Use createRepoFixture or docScreenshotDir from lib/repo-fixture.js');
  });
});
