/**
 * DOM Snapshot client — fetches and queries snapshots from app debug servers.
 */
'use strict';

const http = require('http');

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getSnapshot(port) {
  const res = await httpGet(`http://localhost:${port}/snapshot`);
  return JSON.parse(res.data);
}

async function getTextSnapshot(port) {
  const res = await httpGet(`http://localhost:${port}/text-snapshot`);
  return res.data;
}

// ── Tree search helpers ──────────────────────────────────────────────────────

function findNode(tree, predicate) {
  if (predicate(tree)) return tree;
  for (const child of (tree.children || [])) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function findAllNodes(tree, predicate) {
  const results = [];
  if (predicate(tree)) results.push(tree);
  for (const child of (tree.children || [])) {
    results.push(...findAllNodes(child, predicate));
  }
  return results;
}

function findById(tree, id) {
  return findNode(tree, n => n.id === id);
}

function findByText(tree, text) {
  return findNode(tree, n => n.text && n.text.includes(text));
}

function findByClass(tree, cls) {
  return findNode(tree, n => n.class && n.class.includes(cls));
}

function getAllText(tree) {
  const texts = [];
  if (tree.text) texts.push(tree.text);
  for (const child of (tree.children || [])) {
    texts.push(...getAllText(child));
  }
  return texts;
}

function flatText(tree) {
  return getAllText(tree).join(' ');
}

// ── Assertion helpers ────────────────────────────────────────────────────────

function assertNodeExists(tree, id, message) {
  const node = findById(tree, id);
  if (!node) throw new Error(message || `Expected node with id="${id}" to exist`);
  return node;
}

function assertTextContains(tree, text, message) {
  const allText = flatText(tree);
  if (!allText.includes(text)) {
    throw new Error(message || `Expected DOM to contain "${text}" but got: ${allText.substring(0, 200)}...`);
  }
}

function assertTextNotContains(tree, text, message) {
  const allText = flatText(tree);
  if (allText.includes(text)) {
    throw new Error(message || `Expected DOM NOT to contain "${text}"`);
  }
}

function assertNodeHasClass(tree, id, cls) {
  const node = assertNodeExists(tree, id);
  if (!node.class || !node.class.includes(cls)) {
    throw new Error(`Expected #${id} to have class "${cls}" but has "${node.class || ''}"`);
  }
}

function assertNodeVisible(tree, id) {
  const node = assertNodeExists(tree, id);
  if (node.hidden) {
    throw new Error(`Expected #${id} to be visible but it is hidden`);
  }
  return node;
}

module.exports = {
  getSnapshot,
  getTextSnapshot,
  findNode,
  findAllNodes,
  findById,
  findByText,
  findByClass,
  getAllText,
  flatText,
  assertNodeExists,
  assertTextContains,
  assertTextNotContains,
  assertNodeHasClass,
  assertNodeVisible,
};
