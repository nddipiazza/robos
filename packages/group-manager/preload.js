'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listGroups:      ()       => ipcRenderer.invoke('gds-list-groups'),
  saveGroup:       (group)  => ipcRenderer.invoke('gds-save-group', group),
  deleteGroup:     (gid)    => ipcRenderer.invoke('gds-delete-group', gid),
  listPeople:      ()       => ipcRenderer.invoke('gds-list-people'),
  listGhRepos:     ()       => ipcRenderer.invoke('gds-list-gh-repos'),
  listWorkspaces:  ()       => ipcRenderer.invoke('gds-list-workspaces'),
  getConfigDir:    ()       => ipcRenderer.invoke('gds-get-config-dir'),
  openFolder:      (dir)    => ipcRenderer.invoke('gds-open-folder', dir),
  openDevConsole:  ()                  => ipcRenderer.invoke('gds-open-dev-console'),
  listAIProviders: ()                  => ipcRenderer.invoke('gm-list-ai-providers'),
  aiCreateGroup:   (prompt, provider)  => ipcRenderer.invoke('gm-ai-create-group', { prompt, providerId: provider || null }),
  listPath:        (prefix)            => ipcRenderer.invoke('gm-list-path', prefix),
  logsSearch:      (opts)              => ipcRenderer.invoke('logs-search', opts),
  logsListApps:    ()                  => ipcRenderer.invoke('logs-list-apps'),
  directorySync:   (opts)              => ipcRenderer.invoke('gm-directory-sync', opts),
  bootstrapCompany:(spec)              => ipcRenderer.invoke('gm-bootstrap-company', spec),
  getActiveIdentity: ()                => ipcRenderer.invoke('gm-get-active-identity'),
});
