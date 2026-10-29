'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('privateNetworksAPI', {
  getState: () => ipcRenderer.invoke('get-network-state'),
  startWanRelay: (opts) => ipcRenderer.invoke('start-wan-relay', opts),
  stopWanRelay: () => ipcRenderer.invoke('stop-wan-relay'),
  joinPrivateNetwork: (opts) => ipcRenderer.invoke('join-private-network', opts),
  bridgePeerVideo: (opts) => ipcRenderer.invoke('bridge-peer-video', opts),
  probeVideoBridge: (localPort) => ipcRenderer.invoke('probe-video-bridge', localPort),
  launchMoviePlayer: (peerEndpoint) => ipcRenderer.invoke('launch-movie-player', peerEndpoint),
  createBridgeTunnel: (opts) => ipcRenderer.invoke('create-bridge-tunnel', opts),
  stopBridgeTunnel: (tunnelId) => ipcRenderer.invoke('stop-bridge-tunnel', tunnelId),
  pingPeer: (peerId) => ipcRenderer.invoke('ping-peer', peerId),
  removePeer: (peerId) => ipcRenderer.invoke('remove-peer', peerId),
  runZeroTrustProof: () => ipcRenderer.invoke('run-zt-proof'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
});
