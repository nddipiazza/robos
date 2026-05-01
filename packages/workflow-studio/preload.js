'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  readSettings:    ()      => ipcRenderer.invoke('read-settings'),
  writeSettings:   (data)  => ipcRenderer.invoke('write-settings', data),
  fetchIssue:      (args)  => ipcRenderer.invoke('fetch-issue', args),
  listIssues:      (args)  => ipcRenderer.invoke('list-issues', args),
  transitionIssue: (args)  => ipcRenderer.invoke('transition-issue', args),
  setupWorkspace:  (args)  => ipcRenderer.invoke('setup-workspace', args),
  openVscode:      (args)  => ipcRenderer.invoke('open-vscode', args),
  openUrl:         (url)   => ipcRenderer.invoke('open-url', url),
  runScript:       (args)  => ipcRenderer.invoke('run-script', args),
  runAiPrompt:     (args)  => ipcRenderer.invoke('run-ai-prompt', args),
  generateWithAi:  (args)  => ipcRenderer.invoke('generate-with-ai', args),
  listPath:        (prefix)=> ipcRenderer.invoke('ws-list-path', prefix),
  onStream:        (cb)    => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('stream', handler);
    return () => ipcRenderer.off('stream', handler);
  },
});
