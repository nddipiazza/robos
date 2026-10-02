const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  githubAccounts: () => ipcRenderer.invoke('github-accounts-list'),
  saveGithubAccounts: selection => ipcRenderer.invoke('github-accounts-save', selection),
  addGithubAccount: () => ipcRenderer.invoke('github-accounts-add'),
  onShowGithubAccounts: callback => ipcRenderer.on('show-github-accounts', callback),
  getSchema:     ()        => ipcRenderer.invoke('get-schema'),
  loadSettings:  ()        => ipcRenderer.invoke('load-settings'),
  saveSettings:  (data)    => ipcRenderer.invoke('save-settings', data),
  getSetting:    (key)     => ipcRenderer.invoke('get-setting', key),
  setSetting:    (key, v)  => ipcRenderer.invoke('set-setting', key, v),
});
