'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  readSettings:    ()    => ipcRenderer.invoke('read-settings'),
  getServerInfo:   ()    => ipcRenderer.invoke('get-server-info'),
  listTasks:       (f)   => ipcRenderer.invoke('list-tasks', f),
  openLocalReview: task => ipcRenderer.invoke('open-local-review', task),
  startAgent:      (p)   => ipcRenderer.invoke('start-agent', p),
  stopAgent:       (p)   => ipcRenderer.invoke('stop-agent', p),
  openUrl:         (url) => ipcRenderer.invoke('open-url', url),
  openTaskServers: ()    => ipcRenderer.invoke('open-task-servers'),
  searchIndex:     (prefix) => ipcRenderer.invoke('ti-list-path', prefix),

  listAgentPersonas:  ()  => ipcRenderer.invoke('list-agent-personas'),
  saveAgentPersona:   (p) => ipcRenderer.invoke('save-agent-persona', p),
  resetAgentPersonas: ()  => ipcRenderer.invoke('reset-agent-personas'),
  generatePlan:    (p)   => ipcRenderer.invoke('generate-plan', p),
  stopPlan:        (p)   => ipcRenderer.invoke('stop-plan', p),
  savePlan:        (p)   => ipcRenderer.invoke('save-plan', p),
  loadPlan:        (p)   => ipcRenderer.invoke('load-plan', p),

  onAgentStream: (cb) => ipcRenderer.on('agent-stream', (_, data) => cb(data)),
  onAgentDone:   (cb) => ipcRenderer.on('agent-done',   (_, data) => cb(data)),
  onPlanStream:  (cb) => ipcRenderer.on('plan-stream',  (_, data) => cb(data)),
  onPlanDone:    (cb) => ipcRenderer.on('plan-done',    (_, data) => cb(data)),
  removeAgentListeners: () => {
    ipcRenderer.removeAllListeners('agent-stream');
    ipcRenderer.removeAllListeners('agent-done');
  },
  removePlanListeners: () => {
    ipcRenderer.removeAllListeners('plan-stream');
    ipcRenderer.removeAllListeners('plan-done');
  },
});
