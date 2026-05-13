'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  readSettings:    ()        => ipcRenderer.invoke('read-settings'),
  getServerInfo:   ()        => ipcRenderer.invoke('get-server-info'),
  generateTasks:   (p)       => ipcRenderer.invoke('generate-tasks', p),
  createTasks:     (p)       => ipcRenderer.invoke('create-tasks', p),
  syncTask:        (p)       => ipcRenderer.invoke('sync-task', p),
  fetchJiraEpics:  (p)       => ipcRenderer.invoke('fetch-jira-epics', p),
  openUrl:         (url)     => ipcRenderer.invoke('open-url', url),
  openTaskServers: ()        => ipcRenderer.invoke('open-task-servers'),
  logsSearch:      (opts)    => ipcRenderer.invoke('logs-search', opts),
  logsListApps:    ()        => ipcRenderer.invoke('logs-list-apps'),
  searchIndex:     (prefix)  => ipcRenderer.invoke('tp-list-path', prefix),
  // Projects
  listProjects:    ()        => ipcRenderer.invoke('list-projects'),
  loadProject:     (id)      => ipcRenderer.invoke('load-project', id),
  saveProject:     (p)       => ipcRenderer.invoke('save-project', p),
  deleteProject:   (id)      => ipcRenderer.invoke('delete-project', id),
  dialogConfirm:   (p)       => ipcRenderer.invoke('dialog-confirm', p),
});
