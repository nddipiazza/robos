'use strict';
const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workTask',Object.fromEntries(['open-implementer','open-planner','stop','state','folder','save','approve-plan','agent','route','review','quiz','merge'].map(name=>[name,input=>ipcRenderer.invoke('work-task-'+name,input)])));
