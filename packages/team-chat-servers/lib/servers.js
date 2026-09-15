'use strict';
const {randomUUID}=require('node:crypto');
const {GraphWorkspace,hash}=require('../../robos-graph/lib/graph-workspace');
const PROVIDERS={slack:'Slack',teams:'Microsoft Teams',zulip:'Zulip',mattermost:'Mattermost','rocket-chat':'Rocket.Chat',discord:'Discord',matrix:'Matrix','google-chat':'Google Chat'};
const workspace=root=>{if(typeof root!=='string'||!root.trim())throw Error('Select a KGraph.');return new GraphWorkspace(root);};
const is=(n,t)=>[].concat(n['@type']||[]).includes('robos:'+t);
function endpoint(value){const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Use an HTTP(S) workspace URL without embedded credentials.');if([...u.searchParams.keys()].some(k=>/token|secret|password|signature|api.?key/i.test(k)))throw Error('Do not include credentials in the URL.');return u.href;}
function list(root){const ws=workspace(root),doc=ws.read();return {revision:hash(doc),providers:PROVIDERS,servers:doc['robos:nodes'].filter(n=>is(n,'TeamChatServer')),channels:doc['robos:nodes'].filter(n=>is(n,'TeamChatChannel'))};}
function save(root,input){
 const ws=workspace(root),doc=ws.read();if(hash(doc)!==input.revision)throw Error('The KGraph changed. Refresh before saving.');
 const type=input.kind==='channel'?'TeamChatChannel':'TeamChatServer';
 const previous=input.id&&doc['robos:nodes'].find(n=>n['@id']===input.id);
 if(input.id&&(!previous||!is(previous,type)))throw Error('This chat entry no longer exists. Refresh the list.');
 if(!input.name?.trim())throw Error('Enter a name.');
 const node={'@id':input.id||'urn:robos:team-chat:'+randomUUID(),'@type':['robos:'+type],'dcterms:title':input.name.trim(),'dcterms:description':input.description?.trim()||'','robos:package':'organization','robos:updatedAt':new Date().toISOString()};
 if(type==='TeamChatServer'){
  if(!Object.hasOwn(PROVIDERS,input.provider))throw Error('Choose a supported provider.');
  const credential=input.credentialRef?.trim()||'';
  if(credential&&!/^pass:[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(credential))throw Error('Use a password-store reference such as pass:team-chat/slack/token. Do not paste a token.');
  Object.assign(node,{'robos:provider':input.provider,'robos:url':endpoint(input.url),'robos:workspaceId':input.workspaceId?.trim()||'','robos:credentialRef':credential});
 }else{
  if(!doc['robos:nodes'].some(n=>n['@id']===input.serverId&&is(n,'TeamChatServer')))throw Error('Choose an existing chat server.');
  if(!input.channelId?.trim())throw Error('Enter the channel, stream or room ID.');
  Object.assign(node,{'robos:chatServer':{'@id':input.serverId},'robos:channelId':input.channelId.trim(),'robos:url':input.url?.trim()?endpoint(input.url):''});
 }
 node['robos:evidence']=[{repository:'robos-team-chat-servers:user-declaration',path:'entries/'+node['@id'].split(':').pop()+'.json',line:1,revision:node['robos:updatedAt']}];
 const {'@id':id,...set}=node;
 const proposal=ws.propose({mode:'refine',edits:[previous?{op:'update',id,set}:{op:'add',node}],prompt:'Save the user-selected team chat configuration. No chat messages are read or sent.'});
 ws.apply(proposal,{expectedProposalId:proposal.id});return node;
}
function remove(root,{id,revision}){
 const ws=workspace(root),doc=ws.read();if(hash(doc)!==revision)throw Error('The KGraph changed. Refresh before removing.');
 const n=doc['robos:nodes'].find(n=>n['@id']===id);if(!n||!['TeamChatServer','TeamChatChannel'].some(t=>is(n,t)))throw Error('Choose an existing chat entry.');
 if(doc['robos:nodes'].some(n=>n['robos:chatServer']?.['@id']===id))throw Error('Remove this server’s channel entries first.');
 const proposal=ws.propose({mode:'refine',edits:[{op:'remove',id}],prompt:'Remove only the selected chat configuration entry from this KGraph.'});ws.apply(proposal,{expectedProposalId:proposal.id});return {removed:id};
}
module.exports={PROVIDERS,list,save,remove,endpoint};
async function testConnection(root,{id},readSecret=ref=>require('node:child_process').execFileSync('pass',['show',ref],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}),request=fetch){
 const server=list(root).servers.find(n=>n['@id']===id);
 if(!server||server['robos:provider']!=='slack')throw Error('Connection testing currently supports Slack.');
 const ref=server['robos:credentialRef']||'';
 if(!/^pass:[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(ref))throw Error('Add a pass: credential reference first.');
 let token;try{token=readSecret(ref.slice(5)).split('\n')[0].trim();if(!token)throw Error();}catch{throw Error('Unable to unlock the referenced password-store entry.');}
 let data;try{const response=await request('https://slack.com/api/auth.test',{method:'POST',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();data=await response.json();}catch{throw Error('Slack authentication check could not reach the API.');}finally{token='';}
 if(!data.ok)throw Error('Slack rejected the credential. Check its validity and workspace access.');
 if(new URL(data.url).hostname!==new URL(server['robos:url']).hostname)throw Error('This credential belongs to a different Slack workspace.');
 return {workspace:data.team,workspaceId:data.team_id,user:data.user};
}
module.exports.testConnection=testConnection;
