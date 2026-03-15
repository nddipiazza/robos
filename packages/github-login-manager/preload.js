const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gh', {
  getStatus:   ()      => ipcRenderer.invoke('get-status'),
  startLogin:  ()      => ipcRenderer.invoke('start-login'),
  cancelLogin: ()      => ipcRenderer.invoke('cancel-login'),
  forceCheck:  ()      => ipcRenderer.invoke('force-check'),
  openUrl:     (url)   => ipcRenderer.invoke('open-url', url),
  hideWindow:  ()      => ipcRenderer.invoke('hide-window'),

  onAuthStatus:  (fn) => ipcRenderer.on('auth-status',   (_, d) => fn(d)),
  onLoginOutput: (fn) => ipcRenderer.on('login-output',  (_, d) => fn(d)),
  onLoginDone:   (fn) => ipcRenderer.on('login-done',    (_, d) => fn(d)),
});
