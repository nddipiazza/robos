const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosScheduler', {
  getSchedules:           ()            => ipcRenderer.invoke('get-schedules'),
  saveSchedule:           (s)           => ipcRenderer.invoke('save-schedule', s),
  deleteSchedule:         (id)          => ipcRenderer.invoke('delete-schedule', id),
  toggleSchedule:         (id)          => ipcRenderer.invoke('toggle-schedule', id),
  runNow:                 (id)          => ipcRenderer.invoke('run-now', id),
  getRunLog:              (id)          => ipcRenderer.invoke('get-run-log', id),
  aiCreateSchedule:       (request)     => ipcRenderer.invoke('ai-create-schedule', request),
  humanizeCron:           (schedule)    => ipcRenderer.invoke('humanize-cron', schedule),
  getSystemJobs:          ()            => ipcRenderer.invoke('get-system-jobs'),
  saveSystemJobSettings:  (id, patch)   => ipcRenderer.invoke('save-system-job-settings', id, patch),
  runSystemJob:           (id)          => ipcRenderer.invoke('run-system-job', id),
});
