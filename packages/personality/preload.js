'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function on(channel) {
  return (cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload));
}

contextBridge.exposeInMainWorld('personality', {
  getState: () => ipcRenderer.invoke('personality:getState'),
  update: (patch) => ipcRenderer.invoke('personality:update', patch),
  select: (id) => ipcRenderer.invoke('personality:select', id),
  create: (name) => ipcRenderer.invoke('personality:create', name),
  remove: (id) => ipcRenderer.invoke('personality:remove', id),
  talk: (text) => ipcRenderer.invoke('personality:talk', text),
  say: (text) => ipcRenderer.invoke('personality:say', text),
  clearHistory: () => ipcRenderer.invoke('personality:clearHistory'),
  hear: (payload) => ipcRenderer.invoke('personality:hear', payload),
  ears: (status) => ipcRenderer.send('personality:ears', status),
  hearing: (on) => ipcRenderer.send('personality:hearing', on),
  speechProgress: (msg) => ipcRenderer.send('personality:speechProgress', msg),
  speechDone: (msg) => ipcRenderer.send('personality:speechDone', msg),
  refreshCameras: () => ipcRenderer.invoke('personality:refreshCameras'),
  openFaceWindow: (opts) => ipcRenderer.invoke('personality:openFaceWindow', opts),
  closeFaceWindow: () => ipcRenderer.invoke('personality:closeFaceWindow'),
  listTvs: () => ipcRenderer.invoke('personality:listTvs'),
  castTv: (tvId) => ipcRenderer.invoke('personality:castTv', tvId),
  stopTv: (tvId) => ipcRenderer.invoke('personality:stopTv', tvId),
  testHeard: (payload) => ipcRenderer.invoke('personality:testHeard', payload),
  testSight: (payload) => ipcRenderer.invoke('personality:testSight', payload),
  onTurn: on('personality:turn'),
  onSpeak: on('personality:speak'),
  onActivity: on('personality:activity'),
  onEyes: on('personality:eyes'),
  onSight: on('personality:sight'),
});

// Used by the shared <robos-agent-selector>.
contextBridge.exposeInMainWorld('robosProviders', {
  list: (options) => ipcRenderer.invoke('personality:agentProviders', options),
});
