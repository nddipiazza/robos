'use strict';
const { execFile } = require('node:child_process');
function gh(args) {
  return new Promise((resolve, reject) => execFile('gh', args, { timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(Error((stderr || error.message).trim()));
    else resolve(stdout.trim());
  }));
}
function issueFeature(issue) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(issue.url || '');
  if (!match) throw Error('Expected a GitHub issue URL');
  return { id: issue.url, code: `#${issue.number}`, name: issue.title, repository: match[1],
    description: issue.body || '', status: issue.state === 'CLOSED' ? 'DONE' : 'TODO',
    active: false, issueUrl: issue.url, tasks: [] };
}
function combineFeatures(issues, saved) {
  const result = issues.map(issueFeature);
  for (const feature of saved) {
    const index = result.findIndex(f => f.id === feature.id);
    if (index < 0) result.push(feature);
    else result[index] = { ...result[index], ...feature };
  }
  return result;
}
async function assignFeature(url, server, saved, run = gh) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(url || '');
  const allowed = (server.repos || []).map(r => typeof r === 'string' ? r : `${r.org}/${r.repo}`);
  if (server.type !== 'github' || !match || !allowed.some(r => r.toLowerCase() === match[1].toLowerCase())) throw Error('Select an issue from the configured GitHub task server.');
  const [, repo, number] = match;
  const login = await run(['api', 'user', '--jq', '.login']);
  if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(login)) throw Error('Could not identify the signed-in GitHub user.');
  const args = ['issue', 'view', number, '--repo', repo, '--json', 'number,title,body,state,assignees,url'];
  let issue = JSON.parse(await run(args));
  if (issue.state !== 'OPEN') throw Error('This issue is closed. Select an open issue.');
  if (!issue.assignees.some(a => a.login.toLowerCase() === login.toLowerCase())) {
    await run(['issue', 'edit', number, '--repo', repo, '--add-assignee', login]);
    issue = JSON.parse(await run(args));
    if (!issue.assignees.some(a => a.login.toLowerCase() === login.toLowerCase())) throw Error('GitHub did not confirm the assignment; current feature was not changed.');
  }
  const existing = saved.find(f => f.id === url);
  const feature = { ...issueFeature(issue), active: existing?.active || false, assigned:true,
    status:existing?.status || 'TODO', assignee:login,
    createdAt:existing?.createdAt || new Date().toISOString(), tasks:existing?.tasks || [] };
  const features = saved.filter(f => f.id !== url);
  features.push(feature);
  return { features, activeFeature: feature, assignee: login };
}
module.exports = { issueFeature, combineFeatures, assignFeature };
