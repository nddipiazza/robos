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

const PROJECT = path.join(__dirname, 'project');

/** Comments the reviewer asks the agent to drop: they only restate the next line of code. */
const USELESS_COMMENTS = [
  'load the pets data',
  'build the set of known species',
  'lowercase the name and the breed',
  'lowercase the query',
  'only filter when a species was given',
  'filter, score and sort the pets',
];

/** Copy a project layer (base | feature | chips) over the workspace. */
function applyLayer(workspace, layer) {
  const root = path.join(PROJECT, layer);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const files = walk(root).map(f => path.relative(root, f));
  for (const rel of files) {
    const target = path.join(workspace, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, rel), target);
  }
  return files;
}

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
  applyLayer(workspace, 'base');
  git(workspace, 'add', 'package.json', 'README.md', 'src', 'test', 'public');
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
  const files = applyLayer(workspace, 'feature');
  git(workspace, 'add', ...files);
  git(workspace, 'commit', '-q', '-m', 'feat(search): add species filter and relevance ranking (#42)',
    '-m', 'Adds an optional species filter to searchPets and the search page, ranks exact and prefix matches above substring matches, and rejects unknown species with the list of valid choices.');
  git(workspace, 'push', '-q', '-u', 'origin', branch);
  return git(workspace, 'rev-parse', 'HEAD');
}

/** Real edit + commit: remove the comments that only restate the code. */
function removeUselessComments(workspace) {
  const file = path.join(workspace, 'src', 'pets.js');
  const before = fs.readFileSync(file, 'utf8');
  const drop = new Set(USELESS_COMMENTS.map(c => '// ' + c));
  const kept = before.split('\n').filter(line => !drop.has(line.trim()));
  fs.writeFileSync(file, kept.join('\n'));
  const removed = before.split('\n').length - kept.length;
  git(workspace, 'add', 'src/pets.js');
  git(workspace, 'commit', '-q', '-m', 'chore(search): drop comments that restate the code');
  return { removed, sha: git(workspace, 'rev-parse', 'HEAD') };
}

/** Real edit + commit: species dropdown becomes clickable chips on the search page. */
function useSpeciesChips(workspace) {
  applyLayer(workspace, 'chips');
  git(workspace, 'add', 'public/index.html');
  git(workspace, 'commit', '-q', '-m', 'feat(ui): show species as clickable chips');
  return git(workspace, 'rev-parse', 'HEAD');
}

module.exports = { REPO, TASK, USELESS_COMMENTS, createWorld, implementFeature, removeUselessComments, useSpeciesChips, applyLayer, git };
