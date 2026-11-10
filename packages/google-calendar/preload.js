'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getState: () => ipcRenderer.invoke('gcal:get-state'),
  previewConfig: (payload) => ipcRenderer.invoke('gcal:preview-config', payload),
  configureOnly: (payload) => ipcRenderer.invoke('gcal:configure-only', payload),
  installAndConfigure: (payload) => ipcRenderer.invoke('gcal:install-and-configure', payload),
  fetchOverview: (accountId) => ipcRenderer.invoke('gcal:fetch-overview', accountId),
  launchThunderbird: (mode) => ipcRenderer.invoke('gcal:launch-thunderbird', mode),
  startGoogleOAuth: (params) => ipcRenderer.invoke('gcal:oauth-google', params),
  launchApp: (appId) => ipcRenderer.invoke('gcal:launch-app', appId),
  getNamedCalendars: (accountId) => ipcRenderer.invoke('gcal:get-named-calendars', accountId),
  saveNamedCalendar: (payload) => ipcRenderer.invoke('gcal:save-named-calendar', payload),
  syncNamedCalendars: (accountId) => ipcRenderer.invoke('gcal:sync-named-calendars', accountId),
  syncAccessDoc: (payload) => ipcRenderer.invoke('gcal:sync-access-doc', payload),
  createEvent: (payload) => ipcRenderer.invoke('gcal:create-event', payload),
  deleteEvent: (payload) => ipcRenderer.invoke('gcal:delete-event', payload),
  parseNaturalEvent: (payload) => ipcRenderer.invoke('gcal:parse-natural-event', payload),
  openUrl: (url) => ipcRenderer.invoke('gcal:open-url', url),
  onInstallLog: (cb) => ipcRenderer.on('gcal:install-log', (_, line) => cb(line)),
});
