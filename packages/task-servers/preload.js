const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadPassEntries:       ()         => ipcRenderer.invoke('list-pass-entries'),
  loadTaskServers:       ()         => ipcRenderer.invoke('load-task-servers'),
  saveTaskServers:       (servers)  => ipcRenderer.invoke('save-task-servers', servers),
  loadPassSecret:        (passPath) => ipcRenderer.invoke('load-pass-secret', passPath),
  testJiraConnection:    (opts)     => ipcRenderer.invoke('test-jira-connection', opts),
  testGithubConnection:  (opts)     => ipcRenderer.invoke('test-github-connection', opts),
});
