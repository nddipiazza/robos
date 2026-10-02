const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  ciConnections:()=>ipcRenderer.invoke('ci-connections'),
  saveBuildkite:input=>ipcRenderer.invoke('save-buildkite',input),
  getConfig:          ()     => ipcRenderer.invoke('get-config'),
  fetchRuns:          (opts) => ipcRenderer.invoke('fetch-runs', opts),
  fetchRunDetail:     (opts) => ipcRenderer.invoke('fetch-run-detail', opts),
  aiDiagnoseFailure:  (opts) => ipcRenderer.invoke('ai-diagnose-failure', opts),
  rerunWorkflow:      (opts) => ipcRenderer.invoke('rerun-workflow', opts),
  openUrl:            (url)  => ipcRenderer.invoke('open-url', url),
});
