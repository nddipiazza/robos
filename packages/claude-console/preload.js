const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('claude', {
  listSessions:  ()              => ipcRenderer.invoke('list-sessions'),
  sendMessage:   (prompt, opts)  => ipcRenderer.invoke('send-message', prompt, opts),
  stopClaude:    ()              => ipcRenderer.invoke('stop-claude'),
  getSessionId:  ()              => ipcRenderer.invoke('get-session-id'),
  listPath:      (query)         => ipcRenderer.invoke('list-path', query),
  getHomeDir:    ()              => ipcRenderer.invoke('get-home-dir'),
  getCwdChoices: ()              => ipcRenderer.invoke('get-cwd-choices'),
  minimize:      ()              => ipcRenderer.invoke('minimize'),
  maximize:      ()              => ipcRenderer.invoke('maximize'),
  close:         ()              => ipcRenderer.invoke('close'),
  onEvent:       (cb)            => ipcRenderer.on('claude-event', (_, ev) => cb(ev)),
  onStderr:      (cb)            => ipcRenderer.on('claude-stderr', (_, t) => cb(t)),
  onDone:        (cb)            => ipcRenderer.on('claude-done', (_, code) => cb(code)),
});
