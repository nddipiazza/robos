'use strict';
const path=require('node:path');const {AgentQuestions}=require('./agent-questions');
const windows=new Map();
function open(id){const {BrowserWindow}=require('electron');const store=new AgentQuestions();store.read(id);if(windows.has(id)){windows.get(id).show();windows.get(id).focus();return;}
 const win=new BrowserWindow({width:650,height:680,minWidth:460,minHeight:420,title:'RobOS · Agent questionnaire',backgroundColor:'#101923',autoHideMenuBar:true,webPreferences:{contextIsolation:true,preload:path.join(__dirname,'agent-question-preload.js')}});windows.set(id,win);win.on('closed',()=>windows.delete(id));win.loadFile(path.join(__dirname,'agent-question.html'),{query:{id}});
}
function register(){const {ipcMain}=require('electron');const store=new AgentQuestions();ipcMain.handle('agent-question-read',(_,id)=>store.read(id));ipcMain.handle('agent-question-answer',(_,id,answers)=>{try{store.answer(id,answers);return {ok:true};}catch(e){return {ok:false,error:e.message};}});ipcMain.handle('agent-question-open',(_,id)=>{try{open(id);return {ok:true};}catch(e){return {ok:false,error:e.message};}});}
function notify(item){
 if(process.platform==='linux'){
  const {EventEmitter}=require('node:events'),{spawn}=require('node:child_process');const event=new EventEmitter();let id;let buffer='';
  const child=spawn('stdbuf',['-oL','notify-send','--app-name=RobOS','--icon=dialog-question','--urgency=normal','--expire-time=0','--print-id','--wait','--action=default=Answer questions',(item.agentName||'RobOS agent')+' needs your input','Answer the agent questionnaire to continue this job.'],{stdio:['ignore','pipe','ignore']});
  child.stdout.on('data',chunk=>{buffer+=chunk;let pos;while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos).trim();buffer=buffer.slice(pos+1);if(/^\d+$/.test(line)){id=line;event.emit('show');}else if(line==='default')open(item.id);}});
  child.on('error',()=>event.emit('close'));child.on('close',()=>event.emit('close'));event.close=()=>{if(id){const close=spawn('gdbus',['call','--session','--dest','org.freedesktop.Notifications','--object-path','/org/freedesktop/Notifications','--method','org.freedesktop.Notifications.CloseNotification',id],{stdio:'ignore'});close.on('error',()=>{});}};return event;
 }
 const {Notification}=require('electron');const n=new Notification({title:(item.agentName||'RobOS agent')+' needs your input',body:'Answer the agent questionnaire to continue this job.',timeoutType:'never'});n.on('click',()=>open(item.id));n.show();return n;
}
module.exports={open,register,notify};
