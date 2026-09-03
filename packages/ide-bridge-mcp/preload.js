'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ideMcp', {
  getStatus: () => ipcRenderer.invoke('ide-get-status'),
  getOpenFiles: () => ipcRenderer.invoke('ide-get-open-files'),
  openFile: (file, line, col) => ipcRenderer.invoke('ide-open-file', { file, line, col }),
  setBreakpoint: (file, line) => ipcRenderer.invoke('ide-set-breakpoint', { file, line }),
  runConfig: (name, mode) => ipcRenderer.invoke('ide-run-config', { name, mode }),
  rpc: (request) => ipcRenderer.invoke('ide-mcp-rpc', request),
});
