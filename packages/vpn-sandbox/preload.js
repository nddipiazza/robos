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
  getGuardState: () => ipcRenderer.invoke('get-guard-state'),
  addGuardedApp: input => ipcRenderer.invoke('add-guarded-app', input),
  removeGuardedApp: idOrExecutable => ipcRenderer.invoke('remove-guarded-app', idOrExecutable),
  setGuardedAppEnabled: (idOrExecutable, enabled) =>
    ipcRenderer.invoke('set-guarded-app-enabled', idOrExecutable, enabled),
  setAppVpnOnly: payload => ipcRenderer.invoke('set-app-vpn-only', payload),
  enforceGuardNow: () => ipcRenderer.invoke('enforce-guard-now'),
  clearGuardEvents: () => ipcRenderer.invoke('clear-guard-events'),
  proveVpnOnlyGuard: () => ipcRenderer.invoke('prove-vpn-only-guard'),
  onGuardEvent: callback => {
    const listener = (_, event) => callback(event);
    ipcRenderer.on('vpn-guard-event', listener);
    return () => ipcRenderer.removeListener('vpn-guard-event', listener);
  },
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  stopSession: sessionId => ipcRenderer.invoke('stop-session', sessionId),
  deleteSession: sessionId => ipcRenderer.invoke('delete-session', sessionId),
  clearStoppedSessions: () => ipcRenderer.invoke('clear-stopped-sessions'),
  emergencyKillAll: () => ipcRenderer.invoke('emergency-kill-all'),
  openVpnServers: () => ipcRenderer.invoke('open-vpn-servers'),
});
