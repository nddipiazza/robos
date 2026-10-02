'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const IDEs=[['idea','IntelliJ IDEA',['idea','intellij-idea-ultimate','intellij-idea-community']],['code','Visual Studio Code',['code']],['cursor','Cursor',['cursor']],['webstorm','WebStorm',['webstorm']],['pycharm','PyCharm',['pycharm','pycharm-professional','pycharm-community']],['goland','GoLand',['goland']],['clion','CLion',['clion']],['rider','Rider',['rider']],['rustrover','RustRover',['rustrover']],['codium','VSCodium',['codium']],['zed','Zed',['zed','zeditor']],['windsurf','Windsurf',['windsurf']],['sublime','Sublime Text',['subl']]];
function available(dirs=[...(process.env.PATH||'').split(path.delimiter),'/snap/bin',path.join(os.homedir(),'.local/bin'),path.join(os.homedir(),'.local/share/JetBrains/Toolbox/scripts')]){
 return IDEs.flatMap(([id,name,commands])=>{for(const command of commands)for(const dir of dirs.filter(Boolean)){const file=path.join(dir,command);try{fs.accessSync(file,fs.constants.X_OK);if(fs.statSync(file).isFile())return [{id,name,executable:file}];}catch{}}
  // JetBrains desktop installations may not install a PATH launcher.
  if(id==='idea')for(const filename of ['jetbrains-idea.desktop','jetbrains-idea-ce.desktop'])try{const text=fs.readFileSync(path.join(os.homedir(),'.local/share/applications',filename),'utf8');const exec=text.match(/^Exec=(.+)$/m)?.[1];const file=exec?.match(/^(?:"([^"]+)"|([^\s]+))(?:\s+%[fFuU])?\s*$/)?.slice(1).find(Boolean);if(file&&path.isAbsolute(file)){fs.accessSync(file,fs.constants.X_OK);return [{id,name,executable:file}];}}catch{}
  return [];});
}
async function open(workspace,id,{catalog=available,launch=spawn}={}){
 if(!workspace||!fs.statSync(workspace).isDirectory())throw Error('This review has no local workspace to open.');
 const ide=catalog().find(i=>i.id===id);if(!ide)throw Error('That IDE is no longer available. Refresh the list and try again.');
 return new Promise((resolve,reject)=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=launch(ide.executable,[workspace],{env,detached:true,stdio:'ignore',shell:false});let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else{child.unref();resolve({ok:true,name:ide.name});}};const timer=setTimeout(()=>finish(),1200);child.once('error',()=>finish(Error('Could not launch '+ide.name+'.')));child.once('exit',code=>finish(code?Error(ide.name+' exited before opening the workspace.'):null));});
}
module.exports={available,open};
