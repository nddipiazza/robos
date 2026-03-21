const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getConfig:         ()     => ipcRenderer.invoke('get-config'),
  fetchPRs:          (opts) => ipcRenderer.invoke('fetch-prs', opts),
  fetchPRDetail:     (opts) => ipcRenderer.invoke('fetch-pr-detail', opts),
  submitReview:      (opts) => ipcRenderer.invoke('submit-review', opts),
  aiReviewSummary:   (opts) => ipcRenderer.invoke('ai-review-summary', opts),
  interactiveReview: (opts) => ipcRenderer.invoke('interactive-review', opts),
  openUrl:           (url)  => ipcRenderer.invoke('open-url', url),
});
