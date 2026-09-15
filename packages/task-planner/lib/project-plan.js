'use strict';
const { execFileSync } = require('node:child_process');
const { GraphWorkspace } = require('../../robos-graph/lib/graph-workspace');

function issueIdentity(url) {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/([1-9]\d*)$/.exec(url || '');
  if (!match) throw new Error('Expected an exact GitHub issue URL');
  return { repo: `${match[1]}/${match[2]}`, number: Number(match[3]), url };
}
function readIssue(url) {
  const { repo, number } = issueIdentity(url);
  const data = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/issues/${number}`], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }));
  if (data.pull_request || data.html_url !== url) throw new Error('Issue identity did not match');
  return { url, number, title: data.title, body: data.body || '', state: data.state, stateReason: data.state_reason, type: data.type?.name || 'Task', updatedAt: data.updated_at };
}
function validatePlan(plan) {
  if (plan.version !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plan.id || '')) throw new Error('Plan requires version 1 and a stable slug id');
  if (plan.namespace && !/^[a-z][a-z0-9-]*$/.test(plan.namespace)) throw new Error('Invalid graph namespace');
  for (const key of ['name', 'summary', 'design', 'verification']) if (typeof plan[key] !== 'string' || !plan[key].trim()) throw new Error(`Plan requires ${key}`);
  if (!['draft', 'review-required', 'approved'].includes(plan.status)) throw new Error('Explicit plan review status is required');
  if (plan.status === 'approved' && !plan.approvalUrl) throw new Error('Approved plans require an approval record URL');
  if (!plan.source?.repository || !plan.source?.path) throw new Error('Plan requires a source repository and relative source path');
  if (!Array.isArray(plan.owners) || !plan.owners.length || !Array.isArray(plan.items) || !plan.items.length) throw new Error('Plan requires owners and linked work items');
  const urls = new Set();
  for (const item of plan.items) {
    const identity = issueIdentity(item.url);
    if (identity.repo !== plan.repository || urls.has(item.url)) throw new Error('Duplicate issue or issue outside the plan repository');
    urls.add(item.url);
    if (!['Feature', 'Task', 'Bug'].includes(item.type)) throw new Error('Unsupported issue type');
    if (typeof item.delivery !== 'string' || !item.delivery.trim()) throw new Error('Every work item requires a delivery plan');
  }
  const byUrl = new Map(plan.items.map(item => [item.url, item]));
  const visit = (url, visiting = new Set()) => {
    if (visiting.has(url)) throw new Error('Cyclic plan dependencies or parent relationships');
    const item = byUrl.get(url);
    if (!item) throw new Error(`Unknown plan relationship: ${url}`);
    for (const next of [...(item.dependsOn || []), ...(item.parent ? [item.parent] : [])]) visit(next, new Set([...visiting, url]));
  };
  for (const url of urls) visit(url);
  return plan;
}
function plans(root) {
  return new GraphWorkspace(root).read()['robos:nodes'].filter(n => n['robos:planJson']).map(n => validatePlan(JSON.parse(n['robos:planJson'])));
}
function proposePlan(root, input, fetchIssue = readIssue) {
  const plan = structuredClone(validatePlan(input));
  for (const item of plan.items) item.issue = fetchIssue(item.url);
  const ws = new GraphWorkspace(root), doc = ws.read();
  const namespace=plan.namespace||'robos';
  const projectId = `urn:${namespace}:project:${plan.id}`;
  plan.graphId=projectId;
  const issueId=url=>`urn:${namespace}:issue:${issueIdentity(url).repo.toLowerCase().replace('/','-')}:${issueIdentity(url).number}`;
  const serverId = `urn:${namespace}:taskserver:github-${plan.repository.toLowerCase().replace('/', '-')}`;
  const evidence = [{ repository: plan.source.repository, path: plan.source.path, line: 1, revision: 'working-tree', workingTreeStatus: 'modified' }];
  const base = { 'robos:package': 'organization', 'robos:evidence': evidence };
  const nodes = [
    { ...base, '@id': serverId, '@type': ['robos:TaskServer'], 'dcterms:title': plan.repository, 'robos:serverType': 'github', 'robos:url': `https://github.com/${plan.repository}`, 'robos:projectKey': plan.repository },
    { ...base, '@id': projectId, '@type': ['robos:Project'], 'dcterms:title': plan.name, 'dcterms:description': plan.summary, 'robos:status': plan.status, 'robos:taskServer': { '@id': serverId }, 'robos:planJson': JSON.stringify(plan), 'robos:documentation': plan.design }
  ];
  for (const item of plan.items) {
    nodes.push({ ...base, '@id': issueId(item.url), '@type': [`robos:${item.type==='Feature'?'Epic':item.type}`], 'robos:hierarchyVersion':2, 'dcterms:title': `#${item.issue.number} ${item.issue.title}`, 'dcterms:description': item.issue.body, 'robos:status': item.issue.state, 'robos:url': item.url, 'robos:inProject': { '@id': projectId }, ...(item.type==='Bug'?{'robos:severity':'unknown'}:{}), ...(item.parent ? { 'robos:inEpic': { '@id': issueId(item.parent) } } : {}), ...(item.dependsOn?.length ? { 'robos:dependsOn': item.dependsOn.map(url => ({ '@id': issueId(url) })), 'robos:relationshipEvidence':item.dependsOn.map(url=>({predicate:'robos:dependsOn',target:issueId(url),evidence,note:'Ordered delivery dependency recorded in the project plan.'})) } : {}) });
  }
  const current = new Map(doc['robos:nodes'].map(n => [n['@id'], n]));
  const edits = nodes.map(node => {
    if (node['robos:inProject']) node['robos:inProject']=[].concat(node['robos:inProject']);
    const existing = current.get(node['@id']);
    if (!existing) return { op: 'add', node };
    // One issue may be shared across plans; do not steal its project membership.
    if (node['robos:inProject'] && existing['robos:inProject']) node['robos:inProject'] = [...new Map([existing['robos:inProject'], node['robos:inProject']].flat().map(ref => [ref['@id'], ref])).values()];
    const { '@id': id, ...set } = node;
    return { op: 'update', id, set, ...(node['robos:inProject']?{unset:['robos:inFeature','robos:inEpic','robos:dependsOn','robos:relationshipEvidence'].filter(key=>!(key in set))}:{}) };
  });
  return ws.propose({ mode: 'refine', edits, prompt: `Create/update reviewed project plan: ${plan.name}`, requireEvidence: true });
}
function viewPlan(root, selector, repository, fetchIssue = readIssue) {
  const all = plans(root);
  if (/^[1-9]\d*$/.test(String(selector))) {
    const repos = [...new Set(all.map(p => p.repository))];
    repository ||= repos.length === 1 ? repos[0] : null;
    if (!repository) throw new Error('Task number is ambiguous; specify --repo');
    selector = `https://github.com/${repository}/issues/${selector}`;
  }
  const isIssue = String(selector).startsWith('https:');
  const issue = isIssue ? fetchIssue(selector) : null;
  const matches = all.filter(p => p.id === selector || p.graphId === selector || p.items.some(t => t.url === selector));
  if (!matches.length) throw new Error('No saved project plan contains this task; create a plan first');
  return { plans: matches, issue, snapshotNotice: 'Plan issue snapshots are recorded at plan creation. The selected task was read live from GitHub when requested.' };
}
function exportPlan(root, selector) {
  const matches = plans(root).filter(p => p.id === selector || p.graphId === selector);
  if (matches.length !== 1) throw new Error('Specify one exact saved plan id or graphId; task selectors are not accepted for mutations');
  return structuredClone(matches[0]);
}
function proposeRemovePlan(root, selector) {
  const plan = exportPlan(root, selector);
  const ws = new GraphWorkspace(root);
  return ws.propose({ mode: 'refine', edits: [{ op: 'update', id: plan.graphId, set: {}, unset: ['robos:planJson'] }],
    prompt: `Remove saved plan only: ${plan.name}. Preserve project, work items, relationships and GitHub issues.`, requireEvidence: true });
}
function registerPlanIPC(ipcMain, root, refresh = () => {}) {
  let pending;
  const run = fn => async (_, input) => { try { return { ok: true, ...await fn(input) }; } catch (error) { return { ok: false, error: error.message }; } };
  ipcMain.handle('project-plan-list', run(() => ({ plans: plans(root()) })));
  ipcMain.handle('project-plan-view', run(input => viewPlan(root(), input.selector, input.repository)));
  ipcMain.handle('project-plan-propose', run(input => {
    pending = proposePlan(root(), input);
    return { id: pending.id, delta: pending.delta, validation: pending.validation };
  }));
  ipcMain.handle('project-plan-apply', run(async id => {
    if (!pending || pending.id !== id) throw new Error('Preview this plan again before saving');
    const result = new GraphWorkspace(root()).apply(pending, { expectedProposalId: id });
    pending = null; await refresh(); return result;
  }));
}
module.exports = { issueIdentity, readIssue, validatePlan, plans, proposePlan, viewPlan, exportPlan, proposeRemovePlan, registerPlanIPC };
