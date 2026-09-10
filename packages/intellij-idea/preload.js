'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ideBridge', {
  onOpenFile: (cb) => ipcRenderer.on('ide-open-file', (_, data) => cb(data)),
  onSetBreakpoint: (cb) => ipcRenderer.on('ide-set-breakpoint', (_, data) => cb(data)),
  onRun: (cb) => ipcRenderer.on('ide-run', (_, data) => cb(data)),
  onStop: (cb) => ipcRenderer.on('ide-stop', (_, data) => cb(data)),
  onRunConfigCreated: (cb) => ipcRenderer.on('ide-run-config-created', (_, data) => cb(data)),
  onEphemeralWorkspace: (cb) => ipcRenderer.on('ide-ephemeral-workspace', (_, data) => cb(data)),
});
