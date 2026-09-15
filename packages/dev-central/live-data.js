'use strict';
const { execFile } = require('node:child_process');
const fields = {
  issues: ['issue', 'list', '--json', 'number,title,labels,assignees,state,updatedAt,url'],
  prs: ['pr', 'list', '--author', '@me', '--json', 'number,title,state,url,headRefName,statusCheckRollup,reviewDecision,updatedAt,additions,deletions'],
  reviews: ['pr', 'list', '--search', 'review-requested:@me', '--json', 'number,title,state,url,author,updatedAt'],
};
function query(args) {
  return new Promise(resolve => execFile('gh', args, { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) return resolve({ ok: false, data: [], error: (stderr || error.message).trim() });
    try {
      const data = JSON.parse(stdout);
      if (!Array.isArray(data)) throw Error('GitHub returned an invalid list');
      resolve({ ok: true, data });
    } catch (e) { resolve({ ok: false, data: [], error: e.message }); }
  }));
}
async function fetchList(server, kind, run = query, scope = 'all') {
  if (!server || server.type !== 'github') return { ok: false, data: [], error: 'Configure a GitHub task server to load this view.' };
  const repos = (server.repos || []).map(r => typeof r === 'string' ? r : `${r.org}/${r.repo}`);
  if (!repos.length) return { ok: false, data: [], error: 'No repositories configured for this task server.' };
  const results = await Promise.all(repos.map(repo => run([...fields[kind], ...(kind === 'issues' && scope === 'assigned' ? ['--assignee', '@me'] : []), '--repo', repo, '--limit', '1000'])));
  const failures = results.filter(r => !r.ok);
  if (failures.length) return { ok: false, data: [], error: failures.map(r => r.error).join('; ') };
  return { ok: true, data: results.flatMap(r => r.data) };
}
module.exports = { fetchList };
