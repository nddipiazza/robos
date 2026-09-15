'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { combineFeatures, assignFeature } = require('./feature-workflow');
const url = 'https://github.com/Hermetiq/task-and-issue-tracking/issues/53';
const server = { type: 'github', repos: [{ org: 'Hermetiq', repo: 'task-and-issue-tracking' }] };
const issue = { url, number: 53, title: 'Real repository issue', body: 'Actual description', state: 'OPEN', assignees: [] };
test('unlabeled real issues become choices, without automatically selecting one', () => {
  const choices = combineFeatures([issue], []);
  assert.equal(choices[0].id, url);
  assert.equal(choices[0].active, false);
});
test('assigns additively and preserves existing feature assignments', async () => {
  const calls = []; let assigned = false;
  const run = async args => {
    calls.push(args);
    if (args[0] === 'api') return 'me';
    if (args[1] === 'edit') { assigned = true; return ''; }
    return JSON.stringify({ ...issue, assignees: [{ login: 'teammate' }, ...(assigned ? [{ login: 'me' }] : [])] });
  };
  const result = await assignFeature(url, server, [{ id: 'previous', active: true }], run);
  assert(calls.some(args => args.includes('--add-assignee')));
  assert.equal(result.activeFeature.assignee, 'me');
  assert.equal(result.activeFeature.issueUrl, url);
  assert.equal(result.features[0].active, true);
  assert.equal(result.activeFeature.assigned,true);
  assert.equal(result.activeFeature.status,'TODO');
  assert.equal(calls.filter(args => args[1] === 'view').length, 2);
});
test('rerunning does not duplicate an existing assignment or local feature', async () => {
  const run = async args => {
    assert.notEqual(args[1], 'edit');
    return args[0] === 'api' ? 'me' : JSON.stringify({ ...issue, assignees: [{ login: 'me' }] });
  };
  const first = await assignFeature(url, server, [], run);
  const second = await assignFeature(url, server, first.features, run);
  assert.equal(second.features.length, 1);
});
test('failed assignment leaves caller state unchanged', async () => {
  const saved = [{ id: 'previous', active: true }];
  await assert.rejects(assignFeature(url, server, saved, async args => {
    if (args[0] === 'api') return 'me';
    if (args[1] === 'edit') throw Error('Permission denied');
    return JSON.stringify(issue);
  }), /Permission denied/);
  assert.deepEqual(saved, [{ id: 'previous', active: true }]);
});
test('refuses issues outside the configured repositories', async () => {
  await assert.rejects(assignFeature('https://github.com/other/repo/issues/53', server, [], async () => { throw Error('Must not call GitHub'); }), /configured/);
});
