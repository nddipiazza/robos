'use strict';
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {createHash}=require('node:crypto');const {GraphWorkspace}=require('./graph-workspace');
function organization(input){const value=String(input||'').trim().replace(/^https:\/\/github\.com\//i,'').replace(/\/$/,'');if(!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(value))throw Error('Enter a GitHub organization name or organization URL.');return value;}
async function discover(input,run=promisify(execFile)){
 const org=organization(input),endpoint=`orgs/${org}/repos?type=all&per_page=100`;
 let rows;try{const result=await run('gh',['api',endpoint,'--paginate','--jq','.[] | tojson'],{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});rows=result.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{throw Error('GitHub organization discovery failed. Check gh authentication and organization access.');}
 if(!rows.length)throw Error('GitHub returned no repositories. Refusing to replace an existing catalog with an empty result.');
 if(rows.some(r=>r.owner?.login?.toLowerCase()!==org.toLowerCase()||!Number.isSafeInteger(r.id)||!r.default_branch||!/^https:\/\/github.com\/[\w.-]+\/[\w.-]+$/.test(r.html_url)))throw Error('GitHub returned incomplete or unexpected repository metadata.');
 const repos=[...new Map(rows.map(r=>[r.id,{id:r.id,name:r.name,fullName:r.full_name,url:r.html_url,description:r.description||'',defaultBranch:r.default_branch,private:r.private,archived:r.archived,fork:r.fork,language:r.language||'',updatedAt:r.updated_at}])).values()].sort((a,b)=>a.fullName.localeCompare(b.fullName));
 return {org:rows[0].owner.login,url:rows[0].owner.html_url||'https://github.com/'+org,endpoint:'https://api.github.com/'+endpoint,fetchedAt:new Date().toISOString(),repos};
}
const canonical=url=>String(url||'').replace(/^git@github.com:/,'https://github.com/').replace(/\.git$/,'').replace(/\/$/,'').toLowerCase();
function propose(root,catalog,{namespace=catalog.org.toLowerCase(),removeOthers=false}={}){
 if(!Array.isArray(catalog.repos)||!catalog.repos.length)throw Error('Refusing an empty repository catalog.');
 if(!/^[a-z0-9][a-z0-9-]*$/.test(namespace))throw Error('Use a stable lowercase graph namespace.');
 const ws=new GraphWorkspace(root),doc=ws.read(),nodes=doc['robos:nodes'];
 const old=nodes.filter(n=>[].concat(n['@type']).some(t=>['robos:GitRepository','robos:Repository'].includes(t)));
 const orgId=`urn:${namespace}:github-org:${catalog.org.toLowerCase()}`;
 const evidence=repo=>[{repository:catalog.org,path:`github-api/repos/${repo?.fullName||catalog.org}.json`,line:1,revision:catalog.fetchedAt,sha256:createHash('sha256').update(JSON.stringify(repo||catalog)).digest('hex')}];
 const orgNode={'@id':orgId,'@type':['robos:GitProjectOrganization'],'dcterms:title':catalog.org,'robos:package':'organization','robos:url':catalog.url,'robos:orgName':catalog.org,'robos:forgeType':'github','robos:evidence':evidence()};
 const incoming=catalog.repos.map(r=>{
  const previous=old.find(n=>canonical(n['robos:url'])===canonical(r.url));
  return {'@id':previous?.['@id']||`urn:${namespace}:github-repo:${r.id}`,'@type':['robos:GitRepository','schema:SoftwareSourceCode'],'dcterms:title':r.name,'dcterms:description':r.description,'robos:package':'organization','robos:url':r.url,'robos:defaultBranch':r.defaultBranch,'robos:inOrganization':{'@id':orgId},'robos:status':r.archived?'archived':'active','robos:evidenceStatus':'declared','robos:sourceKind':'github-api-repository','robos:provenance':{extractor:'github-org-api',repository:r.fullName,path:`repos/${r.fullName}`},'robos:evidence':evidence(r),'robos:githubRepositoryId':r.id,'robos:isPrivate':r.private,'robos:isFork':r.fork,'robos:updatedAt':r.updatedAt,'robos:discoveredAt':catalog.fetchedAt};
 });
 const desired=new Set(incoming.map(n=>n['@id']));
 const removed=removeOthers?old.filter(n=>n['@id'].startsWith(`urn:${namespace}:`)&&!desired.has(n['@id'])):[];
 const edits=[orgNode,...incoming].map(node=>{const previous=nodes.find(n=>n['@id']===node['@id']);if(!previous)return {op:'add',node};const {'@id':id,...set}=node;return {op:'update',id,set,unset:['robos:localPath','robos:clonePath','robos:currentBranch','robos:branchMetadataStatus','robos:revision','robos:sourcePath','robos:inRepository']};});
 edits.push(...removed.map(n=>({op:'remove',id:n['@id']})));
 // Dangling references block apply rather than cascading into unrelated architecture.
 const proposal=ws.propose({mode:'refine',edits,prompt:`Use the authenticated GitHub organization API as the repository catalog for ${catalog.org}. Replace local checkout metadata; preserve existing identities for matching URLs.`,requireEvidence:true});
 return {proposal,removed:removed.map(n=>({id:n['@id'],url:n['robos:url']})),repositories:catalog.repos.length};
}
function projectCatalog(data,catalog){
 if(!Array.isArray(catalog.repos)||!catalog.repos.length)throw Error('Refusing an empty repository catalog.');
 const matches=p=>p.org?.toLowerCase()===catalog.org.toLowerCase()||canonical(p.url).startsWith('https://github.com/'+catalog.org.toLowerCase()+'/');
 const old=(data.projects||[]).filter(matches),others=(data.projects||[]).filter(p=>!matches(p));
 const projects=catalog.repos.map(r=>{const previous=old.find(p=>canonical(p.url)===canonical(r.url));return {...previous,id:previous?.id||'github-'+r.id,host:'github.com',org:catalog.org,repo:r.name,name:r.name,url:r.url,sshUrl:`git@github.com:${r.fullName}.git`,localPath:'',description:r.description,defaultBranch:r.defaultBranch,isPrivate:r.private,isFork:r.fork,archived:r.archived,source:'github-org-api',sourceUrl:catalog.url,githubRepositoryId:r.id,updatedAt:r.updatedAt};});
 return {...data,projects:[...others,...projects]};
}
module.exports={organization,discover,propose,projectCatalog};
