'use strict';
/**
 * Minimal stateful GitHub for the lifecycle demo: issues, labels, pull requests,
 * reviews, CI check runs and merges. `handle()` implements just the `gh`
 * invocations RobOS makes; unknown commands exit non-zero so gaps are loud.
 */
const fs = require('fs');

const REPO = 'acme-corp/pawfinder-api';
const ME = 'dana-whitfield';       // the task owner / PR author
const REVIEWER = 'priya-raman';    // the PR reviewer

function load(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return { issues: [], labels: [], prs: [], user: ME, nextNumber: 41 }; }
}
function save(file, state) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}
const now = () => new Date().toISOString();
const issueUrl = (n) => `https://github.com/${REPO}/issues/${n}`;
const prUrl = (n) => `https://github.com/${REPO}/pull/${n}`;

function takeNumber(state) { return ++state.nextNumber; }

// ---- issues -----------------------------------------------------------------
function issueJson(i) {
  return { number: i.number, title: i.title, body: i.body, state: i.state, url: issueUrl(i.number),
    labels: i.labels.map(name => ({ name })), assignees: i.assignees.map(login => ({ login })),
    createdAt: i.createdAt, updatedAt: i.updatedAt };
}

function handle(ctx) {
  const { args, flag, flags, out, fail, stateFile } = ctx;
  if (!stateFile) fail('FAKE_FORGE_STATE is not set');
  const state = load(stateFile);
  const [a, b] = args;
  const commit = () => save(stateFile, state);

  // auth / identity -----------------------------------------------------------
  if (a === '--version') return out('gh version 2.60.0 (demo forge)\n');
  if (a === 'auth' && b === 'status') {
    const logins = [ME, REVIEWER];
    if (args.includes('--json')) return out({ hosts: { 'github.com': logins.map(login => ({ login, active: login === state.user, state: 'success', tokenSource: 'keyring' })) } });
    return out(`github.com\n  ✓ Logged in to github.com account ${state.user}\n`);
  }
  if (a === 'auth' && b === 'token') return out('token-' + (flag('--user') || state.user) + '\n');
  if (a === 'api' && b === 'user') {
    const login = require('./pulls').whoami(state, ctx.env);
    const jq = flag('--jq');
    return out(jq ? login + '\n' : { login });
  }

  // labels --------------------------------------------------------------------
  if (a === 'label' && b === 'create') {
    const name = args[2];
    if (!state.labels.includes(name)) state.labels.push(name);
    commit();
    return out('label created\n');
  }

  // AI generation used by Task Planner: scripted, deterministic ----------------
  if (a === 'copilot') {
    const tasks = require('./plan').tasksFor(args.join(' '));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1800);   // visible "generating" state
    return out(JSON.stringify(tasks) + '\n');
  }

  // issues --------------------------------------------------------------------
  if (a === 'issue' && b === 'create') {
    const n = takeNumber(state);
    const issue = { number: n, title: flag('--title'), body: flag('--body') || '', state: 'OPEN',
      labels: flags('--label').flatMap(l => String(l).split(',')).filter(Boolean), assignees: [], createdAt: now(), updatedAt: now() };
    state.issues.push(issue);
    commit();
    return out(issueUrl(n) + '\n');
  }
  if (a === 'issue' && b === 'list') {
    const wantState = (flag('--state') || 'open').toUpperCase();
    const rows = state.issues.filter(i => wantState === 'ALL' || i.state === wantState).sort((x, y) => y.number - x.number);
    return out(rows.map(issueJson));
  }
  if (a === 'issue' && b === 'view') {
    const n = Number(args[2].toString().replace(/\D/g, '').split('/').pop() || args[2]);
    const issue = state.issues.find(i => i.number === n || args[2].endsWith('/' + i.number));
    if (!issue) fail('issue not found');
    return out(issueJson(issue));
  }
  if (a === 'issue' && (b === 'edit' || b === 'comment' || b === 'close' || b === 'reopen')) {
    const ref = args[2];
    const issue = state.issues.find(i => ref === String(i.number) || ref.endsWith('/' + i.number));
    if (!issue) fail('issue not found');
    for (const l of flags('--add-label')) for (const x of String(l).split(',')) if (!issue.labels.includes(x)) issue.labels.push(x);
    for (const l of flags('--remove-label')) issue.labels = issue.labels.filter(x => !String(l).split(',').includes(x));
    for (const l of flags('--add-assignee')) for (const x of String(l).split(',')) if (!issue.assignees.includes(x)) issue.assignees.push(x);
    if (b === 'close') issue.state = 'CLOSED';
    if (b === 'reopen') issue.state = 'OPEN';
    issue.updatedAt = now();
    commit();
    return out(issueUrl(issue.number) + '\n');
  }

  // pull requests / checks: see pulls.js ---------------------------------------
  const pulls = require('./pulls');
  const handled = pulls.handle({ ...ctx, state, commit, prUrl, REPO, ME, REVIEWER });
  if (handled !== undefined) return handled;

  return fail(`gh (demo forge): unsupported command: ${args.join(' ')}`);
}

module.exports = { handle, load, save, REPO, ME, REVIEWER, prUrl, issueUrl };
