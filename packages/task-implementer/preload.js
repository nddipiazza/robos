'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  taskActivity: urls => ipcRenderer.invoke('ti-task-activity',urls),
  stopTask: url => ipcRenderer.invoke('ti-stop-task',url),
  showTaskMenu: task => ipcRenderer.invoke('task-context-menu',task),
  onTaskMenuAction: cb => ipcRenderer.on('task-menu-action',(_,data)=>cb(data)),
  readSettings:    ()    => ipcRenderer.invoke('read-settings'),
  getServerInfo:   ()    => ipcRenderer.invoke('get-server-info'),
  listTasks:       (f)   => ipcRenderer.invoke('list-tasks', f),
  startAgent:      (p)   => ipcRenderer.invoke('start-agent', p),
  stopAgent:       (p)   => ipcRenderer.invoke('stop-agent', p),
  openUrl:         (url) => ipcRenderer.invoke('open-url', url),
  openTaskServers: ()    => ipcRenderer.invoke('open-task-servers'),
  searchIndex:     (prefix) => ipcRenderer.invoke('ti-list-path', prefix),

  onAgentStream: (cb) => ipcRenderer.on('agent-stream', (_, data) => cb(data)),
  onAgentDone:   (cb) => ipcRenderer.on('agent-done',   (_, data) => cb(data)),
  removeAgentListeners: () => {
    ipcRenderer.removeAllListeners('agent-stream');
    ipcRenderer.removeAllListeners('agent-done');
  },
});

(()=>{'use strict';
const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workTask',Object.fromEntries(['mcp-status','mcp-login','launch-options','open-runner','select','open-implementer','open-planner','stop','state','folder','save','approve-plan','agent','route','review','quiz','merge'].map(name=>[name,input=>ipcRenderer.invoke('work-task-'+name,input)])));
})();

contextBridge.exposeInMainWorld('robosProviders',{list:options=>ipcRenderer.invoke('robos-provider-catalog',options)});
