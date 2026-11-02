'use strict';
/**
 * Keeps suites from writing to the repository. Opening an SDLCKnowledgeGraphStore
 * rewrites its package files and aggregate, and several graph and docs generators
 * write relative to the current directory, so a suite that points them at the repo
 * leaves changes that can get committed. These helpers give such suites a
 * throwaway copy of the real files instead.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const RUN_DIR = path.resolve(__dirname, '../run');

/**
 * Copy repo paths into a temp dir laid out like the repo root.
 * `copy` paths are real copies the suite may write to. `link` paths are symlinks
 * back to the repo for code that only reads them, such as `packages`.
 */
function createRepoFixture({ copy = ['.robos'], link = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-repo-fixture-'));
  for (const rel of copy) {
    fs.cpSync(path.join(REPO_ROOT, rel), path.join(root, rel), { recursive: true });
  }
  for (const rel of link) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.symlinkSync(path.join(REPO_ROOT, rel), path.join(root, rel));
  }
  return {
    root,
    robosDir: path.join(root, '.robos'),
    graphFile: path.join(root, '.robos', 'knowledge-graph.jsonld'),
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** chdir into `dir` and return a function that restores the previous directory. */
function enterCwd(dir) {
  const previous = process.cwd();
  process.chdir(dir);
  return () => process.chdir(previous);
}

/**
 * Where a suite saves documentation screenshots. Frames go to the gitignored run/
 * dir unless ROBOS_UPDATE_DOC_SCREENSHOTS=1 asks to refresh the tracked images.
 */
function docScreenshotDir(slug) {
  const dir = process.env.ROBOS_UPDATE_DOC_SCREENSHOTS === '1'
    ? path.join(REPO_ROOT, 'docs', 'assets', 'images', 'screenshots')
    : path.join(RUN_DIR, 'doc-screenshots', slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { REPO_ROOT, createRepoFixture, enterCwd, docScreenshotDir };
