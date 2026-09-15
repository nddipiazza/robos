const {test}=require('node:test'),assert=require('node:assert/strict');
const {githubContext}=require('./github-context');
test('task and paginated comments use the credential supplied to the sandbox',()=>{
 const calls=[];
 const context=JSON.parse(githubContext('https://github.com/Hermetiq/task-and-issue-tracking/issues/50','test-credential',(bin,args,opts)=>{
  calls.push({bin,args});assert.equal(opts.env.GH_TOKEN,'test-credential');
  return args.includes('--paginate') ? '{"id":1}\n{"id":2}\n' : JSON.stringify({number:50});
 }));
 assert.equal(context.issue.number,50);assert.deepEqual(context.comments,[{id:1},{id:2}]);assert.equal(calls.length,2);
 assert.equal(calls[1].args[1],'repos/Hermetiq/task-and-issue-tracking/issues/50/comments');
});
test('access failures stop launch without leaking the underlying credential-bearing error',()=>{
 assert.throws(()=>githubContext('https://github.com/Hermetiq/task-and-issue-tracking/issues/50','secret',()=>{throw Error('secret command');}),e=>e.message.includes('No agent was started')&&!e.message.includes('secret'));
});
test('an issue with no comments is valid; unavailable comments stop launch',()=>{
 const url='https://github.com/Hermetiq/task-and-issue-tracking/issues/50';
 assert.deepEqual(JSON.parse(githubContext(url,'test',(bin,args)=>args.includes('--paginate')?'':JSON.stringify({number:50}))).comments,[]);
 assert.throws(()=>githubContext(url,'test',(bin,args)=>{if(args.includes('--paginate'))throw Error('forbidden');return '{"number":50}';}),/No agent was started/);
});
