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
  proveKillSwitch: opts => ipcRenderer.invoke('prove-kill-switch', opts),
  proveAutoFailover: opts => ipcRenderer.invoke('prove-auto-failover', opts),
  failoverSession: (sessionId, opts) => ipcRenderer.invoke('failover-session', sessionId, opts),
  setSessionAutoFailover: (sessionId, enabled) => ipcRenderer.invoke('set-session-autofailover', sessionId, enabled),
  onFailover: callback => {
    const listener = (_, event) => callback(event);
    ipcRenderer.on('vpn-failover', listener);
    return () => ipcRenderer.removeListener('vpn-failover', listener);
  },
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  stopSession: sessionId => ipcRenderer.invoke('stop-session', sessionId),
  deleteSession: sessionId => ipcRenderer.invoke('delete-session', sessionId),
  clearStoppedSessions: () => ipcRenderer.invoke('clear-stopped-sessions'),
  emergencyKillAll: () => ipcRenderer.invoke('emergency-kill-all'),
  openVpnServers: () => ipcRenderer.invoke('open-vpn-servers'),
});
