'use strict';
const fs=require('node:fs'),path=require('node:path');
const escapeXml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function writeWorkspace(root,repositories,ide,{name}={}){
 fs.mkdirSync(root,{recursive:true});
 if(ide.family==='vscode'){const file=path.join(root,'session.code-workspace');fs.writeFileSync(file,JSON.stringify({folders:repositories.map(p=>({name:p.name,path:p.path})),settings:{}},null,2));return file;}
 if(ide.family==='jetbrains'){const idea=path.join(root,'.idea');fs.mkdirSync(idea,{recursive:true});if(name)fs.writeFileSync(path.join(idea,'.name'),name);const modules=[];for(const [i,repo] of repositories.entries()){const file=path.join(idea,repo.name.replace(/[^a-zA-Z0-9_.-]/g,'-').slice(0,100)+'-'+i+'.iml');fs.writeFileSync(file,`<?xml version="1.0" encoding="UTF-8"?><module type="GENERAL_MODULE" version="4"><component name="NewModuleRootManager"><content url="file://${escapeXml(repo.path)}">${repositories.filter(r=>r.path!==repo.path&&r.path.startsWith(repo.path+path.sep)).map(r=>`<excludeFolder url="file://${escapeXml(r.path)}"/>`).join('')}</content><orderEntry type="sourceFolder" forTests="false"/></component></module>`);modules.push(`<module fileurl="file://${escapeXml(file)}" filepath="${escapeXml(file)}"/>`);}fs.writeFileSync(path.join(idea,'modules.xml'),`<project version="4"><component name="ProjectModuleManager"><modules>${modules.join('')}</modules></component></project>`);fs.writeFileSync(path.join(idea,'vcs.xml'),`<project version="4"><component name="VcsDirectoryMappings">${repositories.map(r=>`<mapping directory="${escapeXml(r.path)}" vcs="Git"/>`).join('')}</component></project>`);return root;}
 // Folder-oriented IDEs see all session repositories in one directory.
 for(const repo of repositories){const link=path.join(root,repo.name.replace(/[\\/]/g,'--'));if(!fs.existsSync(link))fs.symlinkSync(repo.path,link,'dir');}return root;
}
module.exports={writeWorkspace};
