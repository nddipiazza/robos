'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const config=path.join(os.homedir(),'.config/robos');
const read=(file,fallback={})=>{try{return JSON.parse(fs.readFileSync(file));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
function endpoint(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw Error('Remote MCP endpoints must be HTTPS URLs without credentials, query strings or fragments.');return u.href.replace(/\/$/,'');}
function fromNode(n){const url=n['robos:endpoint']||n['robos:url'];if(!url)return null;return {id:n['@id'],kgraphId:n['@id'],name:n['dcterms:title']||n['@id'],endpoint:endpoint(url),type:'http',kind:[].concat(n['@type']||[]).includes('robos:MCPGateway')?'gateway':'server',environment:n['robos:environment']||'',authType:['oauth2','oidc','auth0'].includes(n['robos:authType'])?'oauth':n['robos:authType']||'oauth',description:n['dcterms:description']||'',evidence:n['robos:evidence']||[]};}
function list(){return read(path.join(config,'settings.json')).mcp_servers||[];}
function canonical(provider){return provider==='agy'?'antigravity':provider;}
function preferences(provider){const saved=read(path.join(config,'agent-mcp-selection.json'))[canonical(provider)]||[];return list().filter(s=>saved.some(p=>p.id===s.id&&p.endpoint===s.endpoint)).map(s=>s.id);}
function options(provider){const enabled=preferences(provider);return list().map(s=>({...s,imported:true,enabled:enabled.includes(s.id)}));}
function select(provider,id,enabled){if(!list().some(s=>s.id===id))throw Error('MCP connection is no longer imported.');const file=path.join(config,'agent-mcp-selection.json'),data=read(file),key=canonical(provider),selected=(data[key]||[]).filter(p=>p.id!==id);if(enabled)selected.push({id,endpoint:list().find(s=>s.id===id).endpoint});data[key]=selected;fs.mkdirSync(config,{recursive:true});const tmp=file+'.'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(tmp,file);return options(provider);}
const key=server=>crypto.createHash('sha256').update(endpoint(server.endpoint)).digest('hex').slice(0,24);
module.exports={config,read,endpoint,fromNode,list,options,select,key,preferences};
