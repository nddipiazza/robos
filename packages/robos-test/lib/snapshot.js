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

// ── Interaction helpers (wrap POST /eval) ────────────────────────────────────

function httpPost(url, body, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

/** Execute arbitrary JS in the renderer via POST /eval */
async function evalJS(port, js) {
  const res = await httpPost(`http://localhost:${port}/eval`, js);
  try { return JSON.parse(res.data).result; }
  catch { return res.data; }
}

/** Click an element by CSS selector */
async function evalClick(port, selector) {
  return evalJS(port, `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
      el.click();
      return true;
    })()
  `);
}

/** Type text into an input (sets value + dispatches input/change events) */
async function evalType(port, selector, text) {
  return evalJS(port, `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
      el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      return true;
    })()
  `);
}

/** Change a select element's value */
async function evalSelect(port, selector, value) {
  return evalJS(port, `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('change', {bubbles: true}));
      return el.value;
    })()
  `);
}

/** Poll snapshot until predicate returns true, or timeout */
async function evalWaitFor(port, predicateFn, timeoutMs = 10000, pollMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await getSnapshot(port);
    try {
      if (predicateFn(snap)) return snap;
    } catch {}
    await new Promise(r => setTimeout(r, pollMs));
  }
  throw new Error(`evalWaitFor timed out after ${timeoutMs}ms`);
}

/** Convenience: wait for text to appear in the DOM */
async function waitForText(port, text, timeoutMs = 10000) {
  return evalWaitFor(port, (snap) => flatText(snap).includes(text), timeoutMs);
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
  evalJS,
  evalClick,
  evalType,
  evalSelect,
  evalWaitFor,
  waitForText,
  assertNodeExists,
  assertTextContains,
  assertTextNotContains,
  assertNodeHasClass,
  assertNodeVisible,
};
