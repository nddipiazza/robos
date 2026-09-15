const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const api=require('./github-org-import'),{GraphWorkspace}=require('./graph-workspace');
const row={id:123,name:'api',full_name:'Example/api',html_url:'https://github.com/Example/api',default_branch:'main',owner:{login:'Example',html_url:'https://github.com/Example'},private:true,archived:false,fork:false,updated_at:'2026-09-15T00:00:00Z'};
async function catalog(){return api.discover('https://github.com/Example',async(bin,args)=>{assert.equal(bin,'gh');assert.equal(args[1],'orgs/Example/repos?type=all&per_page=100');assert.ok(args.includes('--paginate'));return {stdout:JSON.stringify(row)+'\n'};});}
test('organization discovery uses paginated gh api and fails closed on errors/empty catalogs',async()=>{
 assert.equal((await catalog()).repos[0].private,true);
 await assert.rejects(api.discover('Example',async()=>({stdout:''})),/Refusing/);
 await assert.rejects(api.discover('Example',async()=>{throw Error('secret')}),e=>!e.message.includes('secret'));
 await assert.rejects(api.discover('Example/api'),/organization/);
});
test('catalog replacement preserves matching identities, clears checkout metadata and retains other organizations',async()=>{
 const c=await catalog(),data={projects:[{id:'retained',org:'Example',url:row.html_url+'.git',localPath:'/old/checkout'},{id:'gone',org:'Example',url:'https://github.com/Example/old'},{id:'other',org:'Other',url:'https://github.com/Other/api'}]};
 const next=api.projectCatalog(data,c);assert.equal(next.projects.length,2);assert.equal(next.projects[1].id,'retained');assert.equal(next.projects[1].localPath,'');assert.equal(next.projects[0].id,'other');assert.equal(next.projects[1].source,'github-org-api');
});
test('graph import updates existing repository identities and removes explicitly scoped unmatched entries',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'org-import-test-')),ws=new GraphWorkspace(root);
 const mk=(id,url)=>({'@id':id,'@type':['robos:GitRepository'],'dcterms:title':'Old','robos:url':url,'robos:defaultBranch':'old','robos:package':'organization','robos:localPath':'/local/path'});
 const p=ws.propose({mode:'refine',edits:[{op:'add',node:mk('urn:example:repo:api',row.html_url)},{op:'add',node:mk('urn:example:repo:old','https://github.com/Other/old')}]});ws.apply(p,{expectedProposalId:p.id});
 const result=api.propose(root,await catalog(),{namespace:'example',removeOthers:true});assert.equal(result.proposal.validation.conforms,true);assert.equal(result.removed.length,1);ws.apply(result.proposal,{expectedProposalId:result.proposal.id});
 const node=ws.read()['robos:nodes'].find(n=>n['@id']==='urn:example:repo:api');assert.equal(node['robos:localPath'],undefined);assert.equal(node['robos:defaultBranch'],'main');assert.equal(node['robos:sourceKind'],'github-api-repository');
});
