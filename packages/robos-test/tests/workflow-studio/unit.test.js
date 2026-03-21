'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// ── Workflow data model tests ────────────────────────────────────────────────

function validateWorkflow(wf) {
  const errors = [];
  if (!wf.id) errors.push('workflow missing id');
  if (!wf.name) errors.push('workflow missing name');
  if (!wf.states || !wf.states.length) errors.push('workflow has no states');
  if (wf.states) {
    const initials = wf.states.filter(s => s.is_initial);
    if (initials.length === 0) errors.push('no initial state');
    if (initials.length > 1) errors.push('multiple initial states');
    const ids = wf.states.map(s => s.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) errors.push(`duplicate state ids: ${dupes.join(', ')}`);
  }
  if (wf.transitions) {
    const stateIds = new Set((wf.states || []).map(s => s.id));
    for (const t of wf.transitions) {
      if (!stateIds.has(t.from)) errors.push(`transition from unknown state: ${t.from}`);
      if (!stateIds.has(t.to)) errors.push(`transition to unknown state: ${t.to}`);
    }
  }
  return errors;
}

function findReachableStates(workflow) {
  const stateIds = new Set((workflow.states || []).map(s => s.id));
  const initial = (workflow.states || []).find(s => s.is_initial);
  if (!initial) return new Set();
  const reachable = new Set([initial.id]);
  const transitions = workflow.transitions || [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of transitions) {
      if (reachable.has(t.from) && !reachable.has(t.to)) {
        reachable.add(t.to);
        changed = true;
      }
    }
  }
  return reachable;
}

describe('workflow-studio unit tests', () => {
  it('validateWorkflow: accepts a valid workflow', () => {
    const errors = validateWorkflow({
      id: 'wf-1', name: 'Bug Workflow',
      states: [
        { id: 'triage', label: 'Triage', is_initial: true },
        { id: 'in-progress', label: 'In Progress' },
        { id: 'done', label: 'Done' },
      ],
      transitions: [
        { from: 'triage', to: 'in-progress' },
        { from: 'in-progress', to: 'done' },
      ],
    });
    assert.deepStrictEqual(errors, []);
  });

  it('validateWorkflow: rejects missing id', () => {
    const errors = validateWorkflow({ name: 'test', states: [{ id: 's1', is_initial: true }] });
    assert.ok(errors.some(e => e.includes('missing id')));
  });

  it('validateWorkflow: rejects no states', () => {
    const errors = validateWorkflow({ id: 'wf', name: 'test', states: [] });
    assert.ok(errors.some(e => e.includes('no states')));
  });

  it('validateWorkflow: rejects no initial state', () => {
    const errors = validateWorkflow({
      id: 'wf', name: 'test',
      states: [{ id: 's1', label: 'S1' }],
    });
    assert.ok(errors.some(e => e.includes('no initial')));
  });

  it('validateWorkflow: rejects multiple initial states', () => {
    const errors = validateWorkflow({
      id: 'wf', name: 'test',
      states: [{ id: 's1', is_initial: true }, { id: 's2', is_initial: true }],
    });
    assert.ok(errors.some(e => e.includes('multiple initial')));
  });

  it('validateWorkflow: rejects duplicate state ids', () => {
    const errors = validateWorkflow({
      id: 'wf', name: 'test',
      states: [{ id: 's1', is_initial: true }, { id: 's1' }],
    });
    assert.ok(errors.some(e => e.includes('duplicate')));
  });

  it('validateWorkflow: rejects transitions referencing unknown states', () => {
    const errors = validateWorkflow({
      id: 'wf', name: 'test',
      states: [{ id: 's1', is_initial: true }],
      transitions: [{ from: 's1', to: 'nonexistent' }],
    });
    assert.ok(errors.some(e => e.includes('unknown state')));
  });

  it('findReachableStates: finds all reachable states', () => {
    const reachable = findReachableStates({
      states: [
        { id: 'a', is_initial: true },
        { id: 'b' },
        { id: 'c' },
        { id: 'orphan' },
      ],
      transitions: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    });
    assert.ok(reachable.has('a'));
    assert.ok(reachable.has('b'));
    assert.ok(reachable.has('c'));
    assert.ok(!reachable.has('orphan'), 'orphan should not be reachable');
  });

  it('findReachableStates: returns empty set when no initial state', () => {
    const reachable = findReachableStates({ states: [{ id: 'a' }], transitions: [] });
    assert.strictEqual(reachable.size, 0);
  });
});
