const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getConfig:             ()     => ipcRenderer.invoke('get-config'),
  fetchPRs:              (opts) => ipcRenderer.invoke('fetch-prs', opts),
  fetchPRDetail:         (opts) => ipcRenderer.invoke('fetch-pr-detail', opts),
  submitReview:          (opts) => ipcRenderer.invoke('submit-review', opts),
  aiReviewSummary:       (opts) => ipcRenderer.invoke('ai-review-summary', opts),
  aiReviewChat:          (opts) => ipcRenderer.invoke('ai-review-chat', opts),
  fetchKGraphBranchDiff: (opts) => ipcRenderer.invoke('fetch-kgraph-branch-diff', opts),
  interactiveReview:     (opts) => ipcRenderer.invoke('interactive-review', opts),
  openInIntelliJ:        (opts) => ipcRenderer.invoke('open-in-intellij', opts),
  openInVSCode:          (opts) => ipcRenderer.invoke('open-in-vscode', opts),
  getIDEStatus:          ()     => ipcRenderer.invoke('get-ide-status'),
  openUrl:               (url)  => ipcRenderer.invoke('open-url', url),
  // PR Review Theater
  fetchPRTheaterContext: (opts) => ipcRenderer.invoke('fetch-pr-theater-context', opts),
  fetchPRDiffContent:    (opts) => ipcRenderer.invoke('fetch-pr-diff-content', opts),
  verifyPRTheaterQuiz:   (opts) => ipcRenderer.invoke('verify-pr-theater-quiz', opts),
  launchIDEBranchDiff:   (opts) => ipcRenderer.invoke('launch-ide-branch-diff', opts),
  submitPRTheaterReview: (opts) => ipcRenderer.invoke('submit-pr-theater-review', opts),
});

