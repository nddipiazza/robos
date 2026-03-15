const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('agentMonitor', {
  listProcesses:    ()           => ipcRenderer.invoke('list-agent-processes'),
  listSessions:     ()           => ipcRenderer.invoke('list-agent-sessions'),
  getSessionPrompt: (id, prov)   => ipcRenderer.invoke('get-session-prompt', id, prov),
  getSessionLog:    (id, prov)   => ipcRenderer.invoke('get-session-log', id, prov),
  killAgent:        (pid)        => ipcRenderer.invoke('kill-agent', pid),
  openTerminal:     (id, prov)   => ipcRenderer.invoke('open-terminal', id, prov),
  minimize:         ()           => ipcRenderer.invoke('minimize'),
  close:            ()           => ipcRenderer.invoke('close'),
});
