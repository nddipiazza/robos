const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('idm', {
  getIdeCatalogue:      ()       => ipcRenderer.invoke('get-ide-catalogue'),
  launchIde:            (opts)   => ipcRenderer.invoke('launch-ide', opts),
  installIde:           (opts)   => ipcRenderer.invoke('install-ide', opts),
  launchInstallScript:  (ideId)  => ipcRenderer.invoke('launch-install-script', ideId),
  openUrl:              (opts)   => ipcRenderer.invoke('open-url', opts),
  getRobosPluginConfig: ()       => ipcRenderer.invoke('get-robos-plugin-config'),
  setRobosPluginSource: (p)      => ipcRenderer.invoke('set-robos-plugin-source', p),
  buildRobosPlugin:     ()       => ipcRenderer.invoke('build-robos-plugin'),
  installRobosPlugin:   (opts)   => ipcRenderer.invoke('install-robos-plugin', opts),
  uninstallIde:         (opts)   => ipcRenderer.invoke('uninstall-ide', opts),
  killIde:              (opts)   => ipcRenderer.invoke('kill-ide', opts),
});
