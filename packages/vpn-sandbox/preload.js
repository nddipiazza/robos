'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
  discoverExecutables: query => ipcRenderer.invoke('discover-executables', query),
  browseExecutable: () => ipcRenderer.invoke('browse-executable'),
  saveAppProfile: profileInput => ipcRenderer.invoke('save-app-profile', profileInput),
  deleteAppProfile: profileId => ipcRenderer.invoke('delete-app-profile', profileId),
  launchSandboxedApp: launchInput => ipcRenderer.invoke('launch-sandboxed-app', launchInput),
  verifyVpnTraffic: opts => ipcRenderer.invoke('verify-vpn-traffic', opts),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  stopSession: sessionId => ipcRenderer.invoke('stop-session', sessionId),
  emergencyKillAll: () => ipcRenderer.invoke('emergency-kill-all'),
  openVpnServers: () => ipcRenderer.invoke('open-vpn-servers'),
});
