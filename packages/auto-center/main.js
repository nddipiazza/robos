'use strict';
const {app,BrowserWindow,ipcMain,shell,dialog}=require('electron');
const path=require('node:path');
const {AutoCenter}=require('./lib/service');
app.setName('robos-auto-center');
for(const flag of ['no-sandbox','disable-gpu','disable-dev-shm-usage']) app.commandLine.appendSwitch(flag);
app.commandLine.appendSwitch('js-flags','--max-old-space-size=8192');
let win;
app.whenReady().then(()=>{
 const service=new AutoCenter();
 const sourceUrls=new Set(require('./sources.json').map(s=>s.url));
 ipcMain.handle('auto:openSource',(_event,url)=>{const official=typeof url==='string'&&(/^https:\/\/static\.nhtsa\.gov\/odi\/ffdd\/rcl\/(?:FLAT_RCL_POST_2010\.zip|RCL\.txt)$/.test(url)||/^https:\/\/api\.nhtsa\.gov\/recalls\/recallsByCampaignNumber\?campaignNumber=[A-Za-z0-9]+$/.test(url));if(!sourceUrls.has(url)&&!official)throw new Error('Unknown source link');return shell.openExternal(url);});
 ipcMain.handle('auto:openInvoice',async(_event,id)=>{const error=await shell.openPath(service.invoicePath(id));if(error)throw new Error(error);});
 ipcMain.handle('auto:revealRecallSource',()=>shell.showItemInFolder(service.recallArchivePath()));
 ipcMain.handle('auto:scanInvoice',async()=>{const selection=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Repair invoices',extensions:['pdf','png','jpg','jpeg']}]});return selection.canceled?null:service.scanInvoice(selection.filePaths[0]);});
 for(const [name,fn] of Object.entries({status:()=>service.status(),setMode:m=>service.setMode(m),gitops:r=>service.gitops(r),updateJob:r=>service.updateJob(r),completeSchedule:id=>service.completeSchedule(id),importRecalls:()=>service.importRecalls(),detail:id=>service.detail(id),sourceRow:id=>service.sourceRow(id),vehicleRecalls:id=>service.vehicleRecalls(id),search:q=>service.search(q),collect:v=>service.collect(v),apply:id=>service.apply(id),save:n=>service.save(n),decode:({vin,year})=>service.decode(vin,year)})) ipcMain.handle('auto:'+name,(_event,data)=>fn(data));
 win=new BrowserWindow({width:1440,height:960,backgroundColor:'#0d1117',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile(path.join(__dirname,'renderer/index.html'));
 try {const debug=require('../robos-lib/dom-snapshot');debug.registerSnapshotIPC(win);debug.startDebugServer(win,19231,'auto-center');} catch {}
});
app.on('window-all-closed',()=>app.quit());
