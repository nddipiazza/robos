'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
// Pin the local remote-tracking revision in a separate checkout. Never switch,
// reset, stash, or clean the feature workspace or any existing comparison tree.
function prepareBaseline(workspace, ref = 'origin/main') {
  if (!/^[-\w./]+$/.test(ref) || ref.startsWith('-')) throw new Error('Invalid baseline ref.');
  const git = args => execFileSync('git', ['-C', workspace, ...args], { encoding: 'utf8' });
  const revision = git(['rev-parse', '--verify', ref + '^{commit}']).trim();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-before-'));
  const checkout = path.join(parent, 'workspace');
  git(['worktree', 'add', '--detach', checkout, revision]);
  return { workspace: checkout, ref, revision };
}
module.exports = { prepareBaseline };
