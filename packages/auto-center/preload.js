const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('auto',Object.fromEntries(['openInvoice','revealRecallSource','setMode','gitops','updateJob','completeSchedule','scanInvoice','importRecalls','detail','sourceRow','vehicleRecalls','openSource','status','search','collect','apply','save','decode'].map(name=>[name,data=>ipcRenderer.invoke('auto:'+name,data)])));
