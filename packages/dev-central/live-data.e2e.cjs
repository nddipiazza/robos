// Read-only integration check against a running, non-demo Dev Central and GitHub.
// Run: node packages/dev-central/live-data.e2e.cjs
'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
async function evaluate(js) {
  const response = await fetch('http://127.0.0.1:19133/eval', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ js }), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(await response.text());
  return (await response.json()).result;
}
(async () => {
  const settings = await evaluate('window.robos.readSettings()');
  const server = settings.task_servers.find(s => s.id === settings.active_task_server) || settings.task_servers[0];
  const expected = server.repos.flatMap(r => JSON.parse(execFileSync('gh', ['issue', 'list', '--repo', `${r.org}/${r.repo}`, '--state', 'open', '--limit', '1000', '--json', 'url'], { encoding: 'utf8' })));
  const issues = await evaluate("window.robos.getMyIssues('all')");
  assert(issues.ok, issues.error);
  assert.deepEqual(issues.data.map(i => i.url).sort(), expected.map(i => i.url).sort());
  const empty = await evaluate("window.robos.getMyIssues('assigned')");
  assert(empty.ok, empty.error);
  for (const method of ["getTaskProof('TASK-201')", "signOffAndMerge('TASK-201')", 'simulateTraffic({})']) {
    assert.equal((await evaluate(`window.robos.${method}`)).ok, false);
  }
  await evaluate("window.robos.getMyIssues('all')");
  await evaluate('window.robos.syncNow()');
  const snapshot = await (await fetch('http://127.0.0.1:19133/text-snapshot')).text();
  for (const sample of ['FEAT-201', 'Sprint 42', 'Shipped architectural contracts and automated PR audits']) assert(!snapshot.includes(sample), `Demo text visible: ${sample}`);
  console.log(`Live Electron/GitHub check passed: ${issues.data.length} real open issues, ${empty.data.length} assigned issues, simulated proof/merge/traffic disabled.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
