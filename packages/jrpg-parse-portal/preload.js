'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jrpgPortal', {
  profiles: () => ipcRenderer.invoke('jrpg:profiles'),
  plan: id => ipcRenderer.invoke('jrpg:plan', id),
  chooseFolder: current => ipcRenderer.invoke('jrpg:choose-folder', current),
  discover: input => ipcRenderer.invoke('jrpg:discover', input),
  acquire: input => ipcRenderer.invoke('jrpg:acquire', input),
  coverage: dir => ipcRenderer.invoke('jrpg:coverage', dir),
  buildSite: input => ipcRenderer.invoke('jrpg:build-site', input),
  agentRenderers: input => ipcRenderer.invoke('jrpg:agent-renderers', input),
  previewSite: input => ipcRenderer.invoke('jrpg:preview-site', input),
  openFolder: dir => ipcRenderer.invoke('jrpg:open-folder', dir),
  onLog: callback => {
    const listener = (_, line) => callback(line);
    ipcRenderer.on('jrpg:log', listener);
    return () => ipcRenderer.removeListener('jrpg:log', listener);
  },
});
