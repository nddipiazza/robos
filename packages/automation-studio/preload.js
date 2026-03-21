const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('studio', {
  loadRules:    ()       => ipcRenderer.invoke('load-rules'),
  saveRules:    (rules)  => ipcRenderer.invoke('save-rules', rules),
  loadJobs:     ()       => ipcRenderer.invoke('load-jobs'),
  saveJobs:     (jobs)   => ipcRenderer.invoke('save-jobs', jobs),
  loadEventLog: (date)   => ipcRenderer.invoke('load-event-log', date),
  getToday:     ()       => ipcRenderer.invoke('get-today'),
  cronToHuman:  (expr)   => ipcRenderer.invoke('cron-to-human', expr),
});
