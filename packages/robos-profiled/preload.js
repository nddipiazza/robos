const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('profiled', {
  listProfiles:     ()                 => ipcRenderer.invoke('list-profiles'),
  createProfile:    (name, options)   => ipcRenderer.invoke('create-profile', { name, options }),
  inspectProfile:   (name)             => ipcRenderer.invoke('inspect-profile', name),
  terminateProfile: (name)             => ipcRenderer.invoke('terminate-profile', name),
  runCommand:       (name, command, options) => ipcRenderer.invoke('run-command', { name, command, options }),
  wipeAll:          ()                 => ipcRenderer.invoke('wipe-all'),
  spawnSwarm:       (count, prefix, options) => ipcRenderer.invoke('spawn-swarm', { count, prefix, options }),
});
