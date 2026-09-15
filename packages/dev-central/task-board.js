'use strict';
const core = require('../robos-agent-client/work-task/core');
function references(body, label, repo) {
  const lines = (body || '').split('\n').filter(l => new RegExp('^\\s*(?:-\\s*)?' + label + '\\s*:', 'i').test(l));
  return [...new Set(lines.flatMap(l => [...l.matchAll(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+|(?<!\w)#\d+/g)].map(m => m[0].startsWith('#') ? `https://github.com/${repo}/issues/${m[0].slice(1)}` : m[0])))];
}
function buildBoard(issues, login, state = () => ({})) {
  const map = new Map(issues.map(i => [i.url, i]));
  const tasks = issues.map(i => {
    const repo = core.identity(i.url).repo, session = state(i.url);
    const dependencies = references(i.body, 'Depends on', repo);
    const blockedBy = dependencies.filter(url => map.get(url)?.state !== 'CLOSED');
    return { id:i.url, issueUrl:i.url, code:`#${i.number}`, number:i.number, name:i.title, title:i.title, description:i.body || '',
      assigned:i.assignees.some(a => a.login.toLowerCase() === login.toLowerCase()), assignees:i.assignees.map(a => a.login),
      parents:references(i.body, 'Parent Feature', repo), dependencies, blockedBy,
      status:i.state === 'CLOSED' ? 'Done' : session.phase && session.phase !== 'new' ? session.phase.replaceAll('-', ' ') : blockedBy.length ? 'Blocked' : 'Ready',
      workable:i.state !== 'CLOSED' && !blockedBy.length, closed:i.state === 'CLOSED', session };
  });
  function depth(t, seen = new Set()) {
    if(seen.has(t.id)) return tasks.length;
    return t.dependencies.length ? 1 + Math.max(...t.dependencies.map(url => { const d=tasks.find(x=>x.id===url); return d ? depth(d,new Set([...seen,t.id])) : 0; })) : 0;
  }
  return tasks.filter(t => !t.parents.length || t.parents.every(url=>!map.has(url))).map(f => {
    const children=tasks.filter(t=>t.parents.includes(f.id)).sort((a,b)=>Number(a.closed)-Number(b.closed)||depth(a)-depth(b)||a.number-b.number);
    const status=f.closed?'Done':children.length ? children.every(t=>t.closed)?'Tasks complete':children.some(t=>t.session.phase&&t.session.phase!=='new')?'In progress':'Ready' : f.status;
    return {...f,status,tasks:children};
  });
}
async function fetchBoard(server) {
  const login = (await core.command('gh',['api','user','--jq','.login'])).trim();
  const repos = (server.repos || []).map(r=> typeof r === 'string' ? r : `${r.org}/${r.repo}`);
  const issues=(await Promise.all(repos.map(repo=>core.gh(['issue','list','--repo',repo,'--state','all','--limit','1000','--json','number,title,body,state,assignees,url'])))).flat();
  return buildBoard(issues,login,core.read);
}
module.exports={references,buildBoard,fetchBoard};
