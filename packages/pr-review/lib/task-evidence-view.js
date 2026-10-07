'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readBundle } = require('../../robos-lib/evidence-bundle');
const displayedBundles = new WeakMap();
function load(review) {
  if (!review?.evidenceBundlePath) return null;
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:review.workspace, encoding:'utf8'}).trim();
  const bundle = readBundle(review.evidenceBundlePath, head);
  displayedBundles.set(review, bundle);
  return bundle;
}
function read(review, id) {
  const bundle = displayedBundles.get(review) || load(review);
  const artifact = bundle?.artifacts.find(a => a.id === id);
  if (!artifact) throw Error('Unknown evidence artifact.');
  const data = fs.readFileSync(artifact.path);
  if (createHash('sha256').update(data).digest('hex') !== artifact.sha256) throw Error('This capture changed since collection. Regenerate evidence.');
  return {text:data.subarray(0, 128 * 1024).toString('utf8'), truncated:data.length > 128 * 1024};
}
module.exports = { load, read };
