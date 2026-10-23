const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dash', {
  config: () => ipcRenderer.invoke('dash:config'),
  live: () => ipcRenderer.invoke('dash:live'),
  registry: () => ipcRenderer.invoke('dash:registry'),
  readJson: (rel) => ipcRenderer.invoke('dash:read-json', rel),
  report: () => ipcRenderer.invoke('dash:report'),
  fileUrl: (rel) => ipcRenderer.invoke('dash:file-url', rel),
  state: () => ipcRenderer.invoke('dash:state'),
  command: (command, args) => ipcRenderer.invoke('dash:command', command, args),
  screenshot: () => ipcRenderer.invoke('dash:screenshot'),
  open: (rel) => ipcRenderer.invoke('dash:open', rel),
  reveal: (rel) => ipcRenderer.invoke('dash:reveal', rel),
  setTray: (dataUrl, sig) => ipcRenderer.invoke('dash:set-tray', dataUrl, sig),
  // Run control: start / stop the e2e driver, browse earlier runs.
  runStatus: () => ipcRenderer.invoke('run:status'),
  startRun: (opts) => ipcRenderer.invoke('run:start', opts),
  stopRun: () => ipcRenderer.invoke('run:stop'),
  runs: () => ipcRenderer.invoke('run:list'),
  checkpoints: () => ipcRenderer.invoke('run:checkpoints'),
  viewRun: (dir) => ipcRenderer.invoke('run:view', dir),
  chooseGameDir: () => ipcRenderer.invoke('run:choose-game-dir'),
  // Export to MP4 (runs in the background in the main process).
  exportPlan: () => ipcRenderer.invoke('export:plan'),
  exportStart: (opts) => ipcRenderer.invoke('export:start', opts),
  exportStatus: () => ipcRenderer.invoke('export:status'),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  exportShow: (file) => ipcRenderer.invoke('export:show', file),
  exportPlay: (file) => ipcRenderer.invoke('export:play', file),
});
