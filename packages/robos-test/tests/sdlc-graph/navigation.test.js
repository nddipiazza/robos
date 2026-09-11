'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../../robos-graph/renderer/navigation.js'), 'utf8');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const visit = (node, tab = 'visual') => ({ node, tab, search: '', type: 'all' });

// Browser traversal is queued separately from restore completion so races can
// be exercised deterministically. No timers, renderer or repository writes.
function harness({ saved = null, states = [null], position = states.length - 1 } = {}) {
  const listeners = new Map(), queue = [], traversals = [], restored = [];
  const storage = new Map(saved === null ? [] : [['robos.graph.navigation', saved]]);
  const buttons = Object.fromEntries(['btn-nav-back', 'btn-nav-forward'].map(id => [id, { disabled: true, addEventListener() {} }]));
  const stack = clone(states);
  let cursor = position, token = 0;
  const history = {
    get state() { return clone(stack[cursor]); },
    replaceState(state) { stack[cursor] = clone(state); },
    pushState(state) { stack.splice(cursor + 1); stack.push(clone(state)); cursor++; },
    go(delta) {
      traversals.push(delta);
      queue.push(async () => {
        const next = cursor + delta;
        if (next < 0 || next >= stack.length) return;
        cursor = next;
        for (const fn of listeners.get('popstate') || []) await fn({ state: history.state });
      });
    },
  };
  const window = {
    sdlcGraph: {},
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
  };
  vm.runInNewContext(source, {
    window, history, document: { getElementById: id => buttons[id] },
    crypto: { randomUUID: () => `test-token-${++token}` },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  const nav = window.RobosGraphNavigation;
  return {
    nav, history, stack, buttons, traversals, restored,
    ledger: () => JSON.parse(storage.get('robos.graph.navigation')),
    initialize(scope = 'graph#main', ids = ['A', 'B', 'C'], afterRecord = async () => {}) {
      return nav.initialize(scope, ids, async entry => {
        restored.push(clone(entry));
        nav.record(entry); // app render records the restored node as same-node replace.
        await afterRecord(entry);
      });
    },
    async flushOne() { const next = queue.shift(); assert.ok(next, 'Expected queued browser traversal'); await next(); },
    async flush() {
      let limit = 20;
      while (queue.length) { assert.ok(limit-- > 0, 'History bounce loop'); await queue.shift()(); }
    },
  };
}

test('slow Back restoration retains a user click and truncates the old forward branch', async () => {
  let complete;
  const delay = new Promise(resolve => { complete = resolve; });
  const h = harness();
  h.initialize('graph#main', ['A', 'B', 'C'], () => delay);
  h.nav.record(visit('A', 'impact')); h.nav.record(visit('B'));
  h.nav.back();
  const restoring = h.flushOne();
  assert.equal(h.restored[0].node, 'A');
  h.nav.record(visit('C', 'rdf')); // New selection while the Impact response is pending.
  complete(); await restoring;
  assert.deepEqual(h.ledger().entries.map(entry => entry.node), ['A', 'C']);
  assert.equal(h.ledger().index, 1);
  assert.equal(h.ledger().entries[1].tab, 'rdf');
  assert.equal(h.history.state.index, 1);
  assert.equal(h.buttons['btn-nav-back'].disabled, false);
  assert.equal(h.buttons['btn-nav-forward'].disabled, true);
});

test('Back and Forward skip deleted visits using matching browser-history offsets', async () => {
  const h = harness(); h.initialize();
  for (const id of ['A', 'B', 'C']) h.nav.record(visit(id));
  h.nav.updateNodes(['A', 'C']); h.nav.back(); await h.flush();
  assert.equal(h.restored.at(-1).node, 'A'); assert.deepEqual(h.traversals, [-2]);
  h.nav.forward(); await h.flush();
  assert.equal(h.restored.at(-1).node, 'C'); assert.deepEqual(h.traversals, [-2, 2]);
  assert.equal(h.stack.length, 3, 'Restoration must not append browser entries');
});

test('native Back across a deleted boundary bounces to the nearest surviving visit', async () => {
  const h = harness(); h.initialize();
  h.nav.record(visit('A')); h.nav.record(visit('B'));
  h.nav.updateNodes(['B']);
  h.history.go(-1); await h.flush();
  assert.deepEqual(h.traversals, [-1, 1]);
  assert.equal(h.restored.at(-1).node, 'B'); assert.equal(h.ledger().index, 1);
  assert.equal(h.buttons['btn-nav-back'].disabled, true);
  assert.equal(h.buttons['btn-nav-forward'].disabled, true);
});

test('empty history and a graph with no valid nodes keep navigation disabled', async () => {
  const h = harness(); assert.equal(h.initialize('empty', []), null);
  h.nav.record(visit('unknown')); h.nav.back(); h.nav.forward();
  assert.deepEqual(h.ledger().entries, []); assert.deepEqual(h.traversals, []);
  assert.equal(h.buttons['btn-nav-back'].disabled, true);
  assert.equal(h.buttons['btn-nav-forward'].disabled, true);
  h.initialize('empty', ['A']); h.nav.record(visit('A'));
  assert.equal(h.ledger().index, 0); assert.equal(h.stack.length, 1);
});

test('malformed persisted ledgers are discarded without breaking initialization', () => {
  const invalid = ['{broken', 'null', '{}', '[]', JSON.stringify({ entries: 'bad', index: 0 }),
    JSON.stringify({ scope: 'graph#main', token: 'saved', entries: [null], index: 0 }),
    JSON.stringify({ scope: 'graph#main', token: 'saved', entries: [{ node: 42 }], index: 0 }),
    JSON.stringify({ scope: 'graph#main', token: 'saved', entries: [visit('A')], index: '0' })];
  for (const saved of invalid) {
    const h = harness({ saved, states: [{ robosGraphNavigation: 'saved', index: 0 }] });
    assert.equal(h.initialize(), null, saved);
    assert.deepEqual(h.ledger().entries, [], saved);
    h.nav.record(visit('A')); assert.equal(h.ledger().index, 0, saved);
  }
});

test('reload uses the browser cursor instead of a stale saved ledger cursor', () => {
  const saved = JSON.stringify({ scope: 'graph#main', token: 'saved', entries: [visit('A', 'rdf'), visit('B')], index: 1 });
  const h = harness({ saved, states: [{ robosGraphNavigation: 'saved', index: 0 }, { robosGraphNavigation: 'saved', index: 1 }], position: 0 });
  assert.deepEqual(clone(h.initialize()), visit('A', 'rdf'));
  assert.equal(h.ledger().index, 0);
  assert.equal(h.buttons['btn-nav-back'].disabled, true);
  assert.equal(h.buttons['btn-nav-forward'].disabled, false);
});

test('workspace and branch scope changes discard old visits even when node IDs overlap', () => {
  const h = harness(); h.initialize(); h.nav.record(visit('A')); h.nav.record(visit('B', 'query'));
  const oldToken = h.ledger().token;
  assert.equal(h.initialize('other-graph#main'), null);
  assert.notEqual(h.ledger().token, oldToken); assert.deepEqual(h.ledger().entries, []);
  h.nav.record(visit('B')); assert.equal(h.ledger().index, 0);
  assert.equal(h.buttons['btn-nav-back'].disabled, true);
  assert.equal(h.initialize('other-graph#feature'), null);
  assert.deepEqual(h.ledger().entries, []);
  h.nav.record(visit('C')); assert.equal(h.history.state.index, 0);
});

test('same-node tab and filter updates replace the visit without growing history', () => {
  const h = harness(); h.initialize(); h.nav.record(visit('A'));
  h.nav.record(visit('A', 'query')); h.nav.updateView({ ...visit('A', 'query'), search: 'needle' });
  assert.equal(h.ledger().entries.length, 1); assert.equal(h.stack.length, 1);
  assert.equal(h.ledger().entries[0].tab, 'query'); assert.equal(h.ledger().entries[0].search, 'needle');
  h.nav.updateView(visit('B')); assert.equal(h.ledger().entries[0].node, 'A');
});
