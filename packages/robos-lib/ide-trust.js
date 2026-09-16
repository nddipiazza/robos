'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const xml=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
// JetBrains' supported trusted-locations setting. Preserve every existing entry.
function addTrustedLocation(source,location){
 const entry='<option value="'+xml(location)+'" />';
 const component=/<component name="Trusted\.Paths\.Settings">[\s\S]*?<\/component>/;
 let block=source.match(component)?.[0];
 if(block){if(block.includes(entry))return source;if(!/<option name="TRUSTED_PATHS">\s*<list>/.test(block))throw Error('Unrecognized JetBrains trusted-location settings; existing settings were kept.');const changed=block.replace('</list>',entry+'\n      </list>');return source.replace(component,()=>changed);}
 const addition='<component name="Trusted.Paths.Settings"><option name="TRUSTED_PATHS"><list>'+entry+'</list></option></component>';
 if(!source.trim())return '<application>'+addition+'</application>';
 if(!source.includes('</application>'))throw Error('Unrecognized JetBrains settings file.');
 return source.replace('</application>',addition+'\n</application>');
}
function trustReviewWorkspace(target,reviewRoot,ide){
 if(ide.family!=='jetbrains')return [];
 const managed=path.join(os.homedir(),'.config/robos/work-tasks'),relative=path.relative(managed,reviewRoot);
 if(!/^[a-f0-9]{24}[\\/]sessions[\\/]robos-task-[\w-]+[\\/]review[\\/][a-f0-9]{20}$/.test(relative))throw Error('Automatic IDE trust is limited to RobOS sandbox review workspaces.');
 const root=fs.realpathSync(reviewRoot),realTarget=fs.realpathSync(target);if(root!==path.resolve(reviewRoot)||!realTarget.startsWith(root+path.sep))throw Error('Review workspace escaped its managed session.');
 const snap=ide.id==='idea'?'intellij-idea':ide.id;let metadata;
 for(const file of ['/snap/'+snap+'/current/product-info.json',path.resolve(require('./project-ides').executable(ide)||'/missing','../../product-info.json')]){try{metadata=JSON.parse(fs.readFileSync(file,'utf8'));break;}catch{}}
 const prefixes={idea:'IntelliJIdea',webstorm:'WebStorm',pycharm:'PyCharm',goland:'GoLand',clion:'CLion',rider:'Rider',rustrover:'RustRover',datagrip:'DataGrip',phpstorm:'PhpStorm',rubymine:'RubyMine'};
 const base=process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support/JetBrains'):path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'JetBrains');
 const names=new Set(metadata?.dataDirectoryName?[metadata.dataDirectoryName]:[]);
 if(fs.existsSync(base))for(const name of fs.readdirSync(base))if(name.startsWith(prefixes[ide.id])&&/\d{4}\.\d/.test(name))names.add(name);
 if(!names.size)throw Error('Could not locate this IDE’s settings to trust the RobOS workspace. Launch the IDE once, then retry.');
 const updated=[];for(const name of names){const file=path.join(base,name,'options/trusted-paths.xml');let source='';try{source=fs.readFileSync(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}const next=addTrustedLocation(source,root);if(next===source)continue;fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.robos-'+process.pid;fs.writeFileSync(temp,next,{mode:0o600});fs.renameSync(temp,file);updated.push(file);}return updated;
}
module.exports={addTrustedLocation,trustReviewWorkspace};
