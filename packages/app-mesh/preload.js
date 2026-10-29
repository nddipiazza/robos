'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getMeshState: () => ipcRenderer.invoke('get-mesh-state'),
  toggleGateway: (enable) => ipcRenderer.invoke('toggle-gateway', enable),
  updatePolicy: (patch) => ipcRenderer.invoke('update-policy', patch),
  enrollPeer: (peerInput) => ipcRenderer.invoke('enroll-peer', peerInput),
  removePeer: (peerId) => ipcRenderer.invoke('remove-peer', peerId),
  pingPeer: (peerId) => ipcRenderer.invoke('ping-peer', peerId),
  queryPeerCatalog: (peerId) => ipcRenderer.invoke('query-peer-catalog', peerId),
  createBridgeTunnel: (opts) => ipcRenderer.invoke('create-bridge-tunnel', opts),
  stopBridgeTunnel: (tunnelId) => ipcRenderer.invoke('stop-bridge-tunnel', tunnelId),
  runZtProof: () => ipcRenderer.invoke('run-zt-proof'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
});
