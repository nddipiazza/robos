'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
  listAccounts: () => ipcRenderer.invoke('ovpn-list-accounts'),
  saveAccount: input => ipcRenderer.invoke('ovpn-save-account', input),
  deleteAccount: accountId => ipcRenderer.invoke('ovpn-delete-account', accountId),
  setDefaultAccount: accountId => ipcRenderer.invoke('ovpn-set-default-account', accountId),
  addProvider: providerInput => ipcRenderer.invoke('ovpn-add-provider', providerInput),
  syncProfiles: providerId => ipcRenderer.invoke('ovpn-sync-profiles', providerId),
  importProfile: payload => ipcRenderer.invoke('ovpn-import-profile', payload),
  discoverExecutables: query => ipcRenderer.invoke('discover-executables', query),
  browseExecutable: () => ipcRenderer.invoke('browse-executable'),
  saveAppProfile: profileInput => ipcRenderer.invoke('save-app-profile', profileInput),
  deleteAppProfile: profileId => ipcRenderer.invoke('delete-app-profile', profileId),
  launchSandboxedApp: launchInput => ipcRenderer.invoke('launch-sandboxed-app', launchInput),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  stopSession: sessionId => ipcRenderer.invoke('stop-session', sessionId),
  emergencyKillAll: () => ipcRenderer.invoke('emergency-kill-all'),
  runLeakAudit: opts => ipcRenderer.invoke('run-leak-audit', opts),
  openPreferences: () => ipcRenderer.invoke('open-preferences'),
});
