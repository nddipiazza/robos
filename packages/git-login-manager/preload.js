const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('git', {
  getResults:          ()      => ipcRenderer.invoke('get-results'),
  forceCheck:          ()      => ipcRenderer.invoke('force-check'),
  startGhLogin:        ()      => ipcRenderer.invoke('start-gh-login'),
  cancelLogin:         ()      => ipcRenderer.invoke('cancel-login'),
  setGitConfig:        (opts)  => ipcRenderer.invoke('set-git-config', opts),
  openUrl:             (url)   => ipcRenderer.invoke('open-url', url),
  hideWindow:          ()      => ipcRenderer.invoke('hide-window'),
  generateSshKey:      (opts)  => ipcRenderer.invoke('generate-ssh-key', opts),
  addSshKeyToGithub:   (opts)  => ipcRenderer.invoke('add-ssh-key-to-github', opts),
  getPubkey:           ()      => ipcRenderer.invoke('get-pubkey'),
  refreshGhScope:      ()      => ipcRenderer.invoke('refresh-gh-scope'),

  onCheckResults: (fn) => ipcRenderer.on('check-results', (_, d) => fn(d)),
  onLoginOutput:  (fn) => ipcRenderer.on('login-output',  (_, d) => fn(d)),
  onLoginDone:    (fn) => ipcRenderer.on('login-done',    (_, d) => fn(d)),
});
