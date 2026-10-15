'use strict';
const {app,BrowserWindow,ipcMain,shell}=require('electron');
const path=require('node:path');
const {AutoCenter}=require('./lib/service');
app.setName('robos-auto-center');
for(const flag of ['no-sandbox','disable-gpu','disable-dev-shm-usage']) app.commandLine.appendSwitch(flag);
app.commandLine.appendSwitch('js-flags','--max-old-space-size=8192');
let win;
app.whenReady().then(()=>{
 const service=new AutoCenter();
 const sourceUrls=new Set(require('./sources.json').map(s=>s.url));
 ipcMain.handle('auto:openSource',(_event,url)=>{if(!sourceUrls.has(url))throw new Error('Unknown source link');return shell.openExternal(url);});
 for(const [name,fn] of Object.entries({status:()=>service.status(),search:q=>service.search(q),collect:v=>service.collect(v),apply:id=>service.apply(id),save:n=>service.save(n),decode:({vin,year})=>service.decode(vin,year)})) ipcMain.handle('auto:'+name,(_event,data)=>fn(data));
 win=new BrowserWindow({width:1440,height:960,backgroundColor:'#0d1117',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile(path.join(__dirname,'renderer/index.html'));
 try {const debug=require('../robos-lib/dom-snapshot');debug.registerSnapshotIPC(win);debug.startDebugServer(win,19231,'auto-center');} catch {}
});
app.on('window-all-closed',()=>app.quit());
