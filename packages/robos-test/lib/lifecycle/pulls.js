'use strict';
/** Pull request, review and CI handlers for the demo forge (see forge.js). */
const fs = require('fs');
const { execFileSync } = require('child_process');

const git = (cwd, ...a) => execFileSync('/usr/bin/git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const now = () => new Date().toISOString();

function remoteDir(env) { return git(env.FAKE_WORKSPACE, 'config', 'remote.origin.url'); }
function headOid(env, branch) {
  try { return execFileSync('/usr/bin/git', ['--git-dir', remoteDir(env), 'rev-parse', `refs/heads/${branch}`], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}
function whoami(state, env) {
  const t = env.GH_TOKEN || '';
  return t.startsWith('token-') ? t.slice(6) : state.user;
}

/** CI check rows for a PR head. state.ci.byHead[sha] overrides; default is "queued". */
function checksFor(state, pr, oid, repo) {
  const base = 'https://github.com/' + repo + '/actions/runs/';
  const forced = (pr.state === 'MERGED' && state.ci && state.ci.postMerge) || (state.ci && state.ci.byHead && state.ci.byHead[oid]);
  const names = ['build', 'unit-tests', 'lint', 'contract-check'];
  const rows = forced || names.map(name => ({ name, status: 'QUEUED', conclusion: '' }));
  return rows.map((r, i) => ({ __typename: 'CheckRun', name: r.name, status: r.status, conclusion: r.conclusion || '', detailsUrl: base + (9100 + i) }));
}

function prJson(state, pr, env, repo) {
  const oid = headOid(env, pr.headRefName);
  let additions = 0, deletions = 0;
  try {
    for (const line of git(env.FAKE_WORKSPACE, 'diff', '--numstat', `origin/${pr.baseRefName}`, oid).split('\n').filter(Boolean)) {
      const [a, d] = line.split('\t'); additions += Number(a) || 0; deletions += Number(d) || 0;
    }
  } catch { /* leave zeros */ }
  return {
    number: pr.number, url: `https://github.com/${repo}/pull/${pr.number}`, title: pr.title, body: pr.body,
    state: pr.state, isDraft: pr.isDraft, author: { login: pr.author }, headRefName: pr.headRefName,
    headRefOid: pr.mergedOid || oid, baseRefName: pr.baseRefName, statusCheckRollup: checksFor(state, pr, pr.mergedOid || oid, repo),
    reviewDecision: pr.reviewDecision || '', updatedAt: pr.updatedAt, additions, deletions,
    reviewRequests: (pr.reviewers || []).map(login => ({ login })), mergedAt: pr.mergedAt || null,
  };
}

const VALUE_FLAGS = new Set(['--repo', '--json', '--head', '--base', '--title', '--body-file', '--body', '--add-reviewer', '--jq', '--state', '--limit', '--label', '--search']);
function positional(args) {
  for (let i = 2; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i])) { i++; continue; }
    if (!args[i].startsWith('--')) return args[i];
  }
  return undefined;
}
const pick = (obj, fields) => fields ? Object.fromEntries(fields.split(',').map(f => [f, obj[f]])) : obj;
const findPr = (state, ref) => {
  const n = Number(String(ref).split('/').pop());
  return state.prs.find(p => p.number === n);
};

function handle(ctx) {
  const { args, flag, flags, out, fail, state, commit, REPO, env } = ctx;
  const [a, b] = args;
  const repo = flag('--repo') || REPO;
  const me = whoami(state, env);

  if (a === 'pr' && b === 'list') {
    const head = flag('--head');
    const rows = state.prs.filter(p => p.state === 'OPEN' && (!head || p.headRefName === head)).map(p => prJson(state, p, env, repo));
    return out(rows.map(r => pick(r, flag('--json'))));
  }
  if (a === 'pr' && b === 'create') {
    const head = flag('--head'), base = flag('--base') || 'main';
    if (state.prs.some(p => p.state === 'OPEN' && p.headRefName === head)) fail('a pull request for branch "' + head + '" already exists');
    const body = fs.readFileSync(flag('--body-file'), 'utf8');
    const number = ++state.nextNumber;
    state.prs.push({ number, title: flag('--title'), body, state: 'OPEN', isDraft: args.includes('--draft'), author: me,
      headRefName: head, baseRefName: base, reviewDecision: '', reviewers: [], reviews: [], createdAt: now(), updatedAt: now() });
    commit();
    return out(`https://github.com/${repo}/pull/${number}\n`);
  }
  if (a === 'pr' && (b === 'view' || b === 'edit' || b === 'ready' || b === 'diff' || b === 'review' || b === 'merge' || b === 'close' || b === 'comment')) {
    const ref = positional(args);
    const pr = ref && findPr(state, ref);
    if (!pr) fail('no pull request found for ' + ref);
    if (b === 'view') return out(pick(prJson(state, pr, env, repo), flag('--json')));
    if (b === 'diff') {
      const oid = headOid(env, pr.headRefName);
      return out(git(env.FAKE_WORKSPACE, 'diff', '--no-color', `origin/${pr.baseRefName}`, oid) + '\n');
    }
    if (b === 'edit') {
      if (flag('--title')) pr.title = flag('--title');
      if (flag('--body-file')) pr.body = fs.readFileSync(flag('--body-file'), 'utf8');
      for (const r of flags('--add-reviewer')) for (const x of String(r).split(',')) if (x && !pr.reviewers.includes(x)) pr.reviewers.push(x);
      pr.updatedAt = now(); commit(); return out(prJson(state, pr, env, repo).url + '\n');
    }
    if (b === 'ready') { pr.isDraft = false; pr.updatedAt = now(); commit(); return out('✓ Pull request marked as ready for review\n'); }
    if (b === 'review') {
      if (pr.author === me) fail('Review Can not approve your own pull request');
      const kind = args.includes('--approve') ? 'APPROVED' : args.includes('--request-changes') ? 'CHANGES_REQUESTED' : 'COMMENTED';
      pr.reviews.push({ author: me, state: kind, body: flag('--body') || '', at: now() });
      if (kind !== 'COMMENTED') pr.reviewDecision = kind;
      pr.updatedAt = now(); commit(); return out('');
    }
    if (b === 'merge') {
      if (pr.isDraft) fail('Pull request is still a draft');
      const oid = headOid(env, pr.headRefName);
      const gd = remoteDir(env);
      execFileSync('/usr/bin/git', ['--git-dir', gd, 'update-ref', `refs/heads/${pr.baseRefName}`, oid]);
      pr.state = 'MERGED'; pr.mergedOid = oid; pr.mergedAt = now(); pr.updatedAt = now(); commit();
      return out(`✓ Merged pull request #${pr.number}\n`);
    }
  }

  // Plumbing RobOS calls when a task URL is linked to the review.
  if (a === 'label' && b === 'list') return out('[]\n');
  if (a === 'api' && /issues\/\d+\/parent/.test(args[1] || '')) { process.stderr.write('gh: Not Found (HTTP 404)\n'); return 1; }
  return undefined;
}

module.exports = { handle, whoami, headOid };
