'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchList } = require('./live-data');
const server = { type: 'github', repos: [{ org: 'Hermetiq', repo: 'task-and-issue-tracking' }] };
test('empty GitHub results stay empty for every list', async () => {
  for (const kind of ['issues', 'prs', 'reviews']) assert.deepEqual(await fetchList(server, kind, async () => ({ ok: true, data: [] })), { ok: true, data: [] });
});
test('GitHub errors remain errors without invented data', async () => {
  const result = await fetchList(server, 'issues', async () => ({ ok: false, error: 'authentication required' }));
  assert.deepEqual(result, { ok: false, data: [], error: 'authentication required' });
});
test('no task server does not generate sample data', async () => {
  assert.equal((await fetchList({}, 'issues')).ok, false);
});
test('all configured repositories supply actual results', async () => {
  const result = await fetchList({ ...server, repos: [...server.repos, { org: 'Hermetiq', repo: 'MVP' }] }, 'issues', async args => ({ ok: true, data: [{ url: args[args.indexOf('--repo') + 1] }] }));
  assert.deepEqual(result.data.map(r => r.url), ['Hermetiq/task-and-issue-tracking', 'Hermetiq/MVP']);
});
test('repository scope includes unassigned issues; personal scope filters explicitly', async () => {
  let command;
  const run = async args => { command = args; return { ok: true, data: [] }; };
  await fetchList(server, 'issues', run, 'all');
  assert(!command.includes('--assignee'));
  await fetchList(server, 'issues', run, 'assigned');
  assert.equal(command[command.indexOf('--assignee') + 1], '@me');
});
