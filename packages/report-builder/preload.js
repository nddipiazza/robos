'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  readSettings: ()     => ipcRenderer.invoke('rb-read-settings'),
  runQuery:     (args) => ipcRenderer.invoke('rb-run-query', args),
  saveReport:   (args) => ipcRenderer.invoke('rb-save-report', args),
  listReports:  ()     => ipcRenderer.invoke('rb-list-reports'),
  openUrl:      (url)  => ipcRenderer.invoke('rb-open-url', url),
  onStream:     (cb)   => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('rb-stream', handler);
    return () => ipcRenderer.off('rb-stream', handler);
  },
});
