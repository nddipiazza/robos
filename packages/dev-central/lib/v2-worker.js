'use strict';
/**
 * Dev Central v2 — task-server worker thread.
 *
 * The robos-task-client GitHub adapter shells out to `gh` synchronously (execSync). Running it on the Electron
 * main thread freezes the whole app (bulk-assigning an epic takes ~30 s). Every task-server call therefore runs
 * here, in a pool of worker threads, and the main process only schedules jobs and relays progress.
 */
const { parentPort } = require('node:worker_threads');
const cp = require('node:child_process');

let taskClient = null;
for (const p of ['../../robos-task-client', '/usr/local/share/robos/robos-task-client']) {
  try { taskClient = require(p); break; } catch {}
}
const ALLOWED = new Set(['updateIssue', 'unassignIssue', 'closeIssue', 'reopenIssue', 'transitionIssueTo']);
const adapters = new Map();

function passSecret(p) {
  try { return cp.execFileSync('pass', ['show', p], { encoding: 'utf8', timeout: 8000 }).split('\n')[0].trim(); } catch { return ''; }
}
function adapterFor(ts) {
  if (!taskClient) throw new Error('robos-task-client is not available');
  const key = JSON.stringify(ts);
  let a = adapters.get(key);
  if (!a) {
    const cfg = { ...ts };
    if (ts.type === 'jira' && !cfg.token && (ts.passPath || ts.token_pass_path)) cfg.token = passSecret(ts.passPath || ts.token_pass_path);
    if (ts.type === 'jira' && !cfg.projects && ts.projectKey) cfg.projects = [ts.projectKey];
    a = taskClient.createAdapter(cfg);
    adapters.set(key, a);
  }
  return a;
}
async function run({ ts, op, method, args }) {
  const a = adapterFor(ts);
  if (op === 'fetch') {
    if (ts.type === 'github') {
      const items = await a.listHierarchy();
      let prs = []; try { prs = a.listPullRequests ? await a.listPullRequests() : []; } catch {}   // PRs are best-effort
      return { items, prs };
    }
    const projects = a.projects && a.projects.length ? a.projects : null;
    if (!projects) throw new Error('No Jira project configured on this task server');
    const jql = `project IN (${projects.join(',')}) AND (statusCategory != Done OR updated >= -14d) ORDER BY updated DESC`;
    return { items: (await a.searchIssues({ jql, maxResults: 200 })).issues, prs: [] };
  }
  if (op === 'call') {
    if (!ALLOWED.has(method)) throw new Error('Operation not allowed: ' + method);
    return a[method](...(args || []));
  }
  throw new Error('Unknown op ' + op);
}
parentPort.on('message', async msg => {
  try { parentPort.postMessage({ ok: true, result: await run(msg) }); }
  catch (e) { parentPort.postMessage({ ok: false, error: String((e && e.message) || e) }); }
});
