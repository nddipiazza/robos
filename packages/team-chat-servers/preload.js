const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('chat',Object.fromEntries(['list','save','remove','open','test'].map(name=>[name,input=>ipcRenderer.invoke('chat-'+name,input)])));
contextBridge.exposeInMainWorld('robosKGraphs',{list:()=>ipcRenderer.invoke('robos-kgraphs-list'),add:()=>ipcRenderer.invoke('robos-kgraphs-add')});
