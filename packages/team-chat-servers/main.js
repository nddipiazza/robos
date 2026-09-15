'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron'),path=require('node:path'),os=require('node:os');
const service=require('./lib/servers');let win;
app.setName('robos-team-chat-servers');app.setPath('userData',path.join(os.homedir(),'.config/robos/electron/team-chat-servers'));
if(!app.requestSingleInstanceLock()){app.quit();process.exit(0);}app.on('second-instance',()=>{win?.show();win?.focus();});
require('../robos-lib/kgraph-selector-main').register({ipcMain,dialog});
app.whenReady().then(()=>{win=new BrowserWindow({width:1160,height:800,minWidth:760,minHeight:580,title:'RobOS Team Chat Servers',backgroundColor:'#0d1117',icon:path.join(__dirname,'icon.svg'),webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,'preload.js')}});win.setMenuBarVisibility(false);win.loadFile(path.join(__dirname,'renderer/index.html'));require('../robos-lib/dom-snapshot').startDebugServer(win,19191);});app.on('window-all-closed',()=>app.quit());
const wrap=fn=>async(_,input)=>{try{return {ok:true,data:await fn(input)};}catch(e){return {ok:false,error:e.message};}};
ipcMain.handle('chat-list',wrap(({root})=>service.list(root)));
ipcMain.handle('chat-save',wrap(({root,...input})=>service.save(root,input)));
ipcMain.handle('chat-remove',wrap(async({root,id,revision})=>{const data=service.list(root);const n=[...data.servers,...data.channels].find(n=>n['@id']===id);if(!n)throw Error('Entry not found.');const result=await dialog.showMessageBox(win,{type:'question',message:'Remove '+n['dcterms:title']+'?',detail:'Removes its RobOS configuration only. The remote workspace or channel is unchanged.',buttons:['Cancel','Remove'],defaultId:0,cancelId:0});return result.response===1?service.remove(root,{id,revision}):{canceled:true};}));
ipcMain.handle('chat-open',wrap(async({root,id})=>{const data=service.list(root),n=[...data.servers,...data.channels].find(n=>n['@id']===id);if(!n?.['robos:url'])throw Error('This entry has no URL.');await shell.openExternal(service.endpoint(n['robos:url']));}));

ipcMain.handle('chat-test',wrap(({root,...input})=>service.testConnection(root,input)));
