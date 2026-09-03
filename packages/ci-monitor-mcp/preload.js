'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ciMcp', {
  listRuns: (filters) => ipcRenderer.invoke('ci-list-runs', filters),
  getFailures: (runId) => ipcRenderer.invoke('ci-get-failures', runId),
  getLogs: (runId) => ipcRenderer.invoke('ci-get-logs', runId),
  retryRun: (runId) => ipcRenderer.invoke('ci-retry-run', runId),
  getDeployments: () => ipcRenderer.invoke('ci-get-deployments'),
  rpc: (request) => ipcRenderer.invoke('ci-mcp-rpc', request),
});
