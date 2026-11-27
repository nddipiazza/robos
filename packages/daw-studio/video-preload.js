'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, cb) {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('robosVideoOut', {
  onSyncState: (cb) => subscribe('daw:video-sync-state', cb),
  onLiveFrame: (cb) => subscribe('daw:video-live-frame', cb),
  requestInitialState: () => ipcRenderer.invoke('daw:video-window-get-state'),
  selectVideoTrack: (trackId) => ipcRenderer.invoke('daw:video-window-select-track', { trackId }),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('daw:video-window-toggle-aot'),
  dockBackToDaw: () => ipcRenderer.invoke('daw:video-window-dock'),
});
