const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('auto',Object.fromEntries(['openSource','status','search','collect','apply','save','decode'].map(name=>[name,data=>ipcRenderer.invoke('auto:'+name,data)])));
