'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Extract walkStore logic from pass-manager/main.js ────────────────────────

function walkStore(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const items = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const children = walkStore(full, prefix ? prefix + '/' + name : name);
      items.push({ type: 'dir', name, path: prefix ? prefix + '/' + name : name, children });
    } else if (name.endsWith('.gpg')) {
      const entryName = name.slice(0, -4);
      const entryPath = prefix ? prefix + '/' + entryName : entryName;
      items.push({ type: 'entry', name: entryName, path: entryPath });
    }
  }
  return items;
}

function flattenTree(nodes, result = []) {
  for (const n of nodes) {
    if (n.type === 'entry') result.push(n);
    if (n.children) flattenTree(n.children, result);
  }
  return result;
}

function isCacheActiveFromOutput(output) {
  return output.split('\n').some(l => {
    const parts = l.trim().split(/\s+/);
    return parts[0] === 'S' && parts[1] === 'KEYINFO' && parts[6] === '1';
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('pass-manager unit tests', () => {
  it('walkStore: returns entries from a populated store', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
    fs.writeFileSync(path.join(tmp, '.gpg-id'), 'test@example.com');
    fs.writeFileSync(path.join(tmp, 'github.gpg'), 'encrypted');
    fs.writeFileSync(path.join(tmp, 'email.gpg'), 'encrypted');
    fs.mkdirSync(path.join(tmp, 'work'));
    fs.writeFileSync(path.join(tmp, 'work', 'jira.gpg'), 'encrypted');

    const tree = walkStore(tmp);
    assert.strictEqual(tree.length, 3); // email.gpg, github.gpg, work/
    assert.deepStrictEqual(tree[0], { type: 'entry', name: 'email', path: 'email' });
    assert.deepStrictEqual(tree[1], { type: 'entry', name: 'github', path: 'github' });
    assert.strictEqual(tree[2].type, 'dir');
    assert.strictEqual(tree[2].name, 'work');
    assert.strictEqual(tree[2].children.length, 1);
    assert.deepStrictEqual(tree[2].children[0], { type: 'entry', name: 'jira', path: 'work/jira' });

    fs.rmSync(tmp, { recursive: true });
  });

  it('walkStore: skips dotfiles', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
    fs.writeFileSync(path.join(tmp, '.gpg-id'), 'test@example.com');
    fs.writeFileSync(path.join(tmp, '.hidden.gpg'), 'encrypted');
    fs.writeFileSync(path.join(tmp, 'visible.gpg'), 'encrypted');

    const tree = walkStore(tmp);
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].name, 'visible');

    fs.rmSync(tmp, { recursive: true });
  });

  it('walkStore: skips non-.gpg files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'text');
    fs.writeFileSync(path.join(tmp, 'secret.gpg'), 'encrypted');

    const tree = walkStore(tmp);
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].name, 'secret');

    fs.rmSync(tmp, { recursive: true });
  });

  it('walkStore: returns empty for nonexistent directory', () => {
    const tree = walkStore('/tmp/nonexistent-' + Date.now());
    assert.deepStrictEqual(tree, []);
  });

  it('flattenTree: flattens nested tree to flat entries', () => {
    const tree = [
      { type: 'entry', name: 'a', path: 'a' },
      { type: 'dir', name: 'b', path: 'b', children: [
        { type: 'entry', name: 'c', path: 'b/c' },
      ]},
    ];
    const flat = flattenTree(tree);
    assert.strictEqual(flat.length, 2);
    assert.strictEqual(flat[0].path, 'a');
    assert.strictEqual(flat[1].path, 'b/c');
  });

  it('isCacheActive: detects active cache', () => {
    // Real gpg-connect-agent output: S KEYINFO <grip> D - - - <cached:1/-> - -
    // parts[0]=S parts[1]=KEYINFO parts[2]=grip parts[3]=D parts[4]=- parts[5]=- parts[6]=1
    const output = 'S KEYINFO AAAA1111BBBB2222CCCC3333DDDD4444EEEE5555 D - - 1 - -\nOK\n';
    assert.strictEqual(isCacheActiveFromOutput(output), true);
  });

  it('isCacheActive: detects inactive cache', () => {
    const output = 'S KEYINFO AAAA1111BBBB2222CCCC3333DDDD4444EEEE5555 D - - - - -\nOK\n';
    assert.strictEqual(isCacheActiveFromOutput(output), false);
  });
});
