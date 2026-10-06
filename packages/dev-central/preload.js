'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const notificationApi = {
  getNotifications:    ()    => ipcRenderer.invoke('get-notifications'),
  markRead:            (id)  => ipcRenderer.invoke('mark-read', id),
  markAllRead:         ()    => ipcRenderer.invoke('mark-read', null),
  markReadByCategory:  (cat) => ipcRenderer.invoke('mark-read-by-category', cat),
  deleteNotification:  (id)  => ipcRenderer.invoke('delete-notification', id),
  clearRead:           ()    => ipcRenderer.invoke('clear-read'),
  clearAll:            ()    => ipcRenderer.invoke('clear-all'),
  getUnreadCount:      ()    => ipcRenderer.invoke('get-unread-count'),
  getUnreadByCategory: ()    => ipcRenderer.invoke('get-unread-by-category'),
  getPrefs:            ()    => ipcRenderer.invoke('get-prefs'),
  savePrefs:           (p)   => ipcRenderer.invoke('save-prefs', p),
  openAppContext:      (act) => ipcRenderer.invoke('open-app-context', act),
};

contextBridge.exposeInMainWorld('robos', {
  savedReviews:()=>ipcRenderer.invoke('dc-saved-reviews'),
  openCodeReview:id=>ipcRenderer.invoke('dc-open-code-review',id),
  readSettings:           ()       => ipcRenderer.invoke('dc-read-settings'),
  getMyIssues:            ()       => ipcRenderer.invoke('dc-get-my-issues'),
  readyPR: (url,head) => ipcRenderer.invoke('dc-ready-pr',{url,head}),
  openReview: url => ipcRenderer.invoke('dc-open-review',url),
  getMyPRs:               ()       => ipcRenderer.invoke('dc-get-my-prs'),
  getReviewRequests:      ()       => ipcRenderer.invoke('dc-get-review-requests'),
  getRecentActivity:      ()       => ipcRenderer.invoke('dc-get-recent-activity'),
  openUrl:                (u)      => ipcRenderer.invoke('dc-open-url', u),
  getTaskProof:           (id)     => ipcRenderer.invoke('dc-review-get-task-proof', id),
  signOffAndMerge:        (id)     => ipcRenderer.invoke('dc-review-signoff-merge', id),

  // Feature In-Progress API
  getFeatures:            ()       => ipcRenderer.invoke('dc-get-features'),
  setActiveFeature:       (id)     => ipcRenderer.invoke('dc-set-active-feature', id),
  updateFeatureStatus:    (id, st) => ipcRenderer.invoke('dc-update-feature-status', id, st),
  getTaskLifetimeHistory: (tid)    => ipcRenderer.invoke('dc-get-task-lifetime-history', tid),

  // Dev Central v2 — task tree, search & assign
  v2GetTree:              ()       => ipcRenderer.invoke('dc-v2-get-tree'),
  v2Assign:               (p)      => ipcRenderer.invoke('dc-v2-assign', p),
  v2SetStatus:            (p)      => ipcRenderer.invoke('dc-v2-set-status', p),
  v2Sync:                 ()       => ipcRenderer.invoke('dc-v2-sync'),
  v2CancelJob:            (id)     => ipcRenderer.invoke('dc-v2-job-cancel', id),
  onV2Job:                (cb)     => ipcRenderer.on('dc-v2-job', (_, j) => cb(j)),
  v2TouchRecent:          (id)     => ipcRenderer.invoke('dc-v2-touch-recent', id),

  // Background Sync & Traffic Simulator
  syncNow:                ()       => ipcRenderer.invoke('dc-sync-now'),
  simulateTraffic:        (p)      => ipcRenderer.invoke('dc-simulate-traffic', p),
  onDataUpdated:          (cb)     => ipcRenderer.on('dc-data-updated', (_, data) => cb(data)),
  onSwitchTab:            (cb)     => ipcRenderer.on('dc-switch-tab', (_, tab) => cb(tab)),
  onTrafficNotification:  (cb)     => ipcRenderer.on('dc-traffic-notification', (_, n) => cb(n)),

  // Absorbed Notifications API
  notifications:          notificationApi,
});

// Alias window.notifs for standalone notification callers and tests
contextBridge.exposeInMainWorld('notifs', notificationApi);
