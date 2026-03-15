const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('journal', {
  readSettings:      ()        => ipcRenderer.invoke('read-settings'),
  writeSettings:     (d)       => ipcRenderer.invoke('write-settings', d),
  journalInit:       (args)    => ipcRenderer.invoke('journal-init', args),
  journalStatus:     ()        => ipcRenderer.invoke('journal-status'),
  journalReadToday:  ()        => ipcRenderer.invoke('journal-read-today'),
  journalWriteToday: (args)    => ipcRenderer.invoke('journal-write-today', args),
  journalAppend:     (args)    => ipcRenderer.invoke('journal-append', args),
  journalListEntries:()        => ipcRenderer.invoke('journal-list-entries'),
  journalReadEntry:  (args)    => ipcRenderer.invoke('journal-read-entry', args),
  journalReadEvents:  (args)    => ipcRenderer.invoke('journal-read-events', args),
  journalLogEvent:    (evt)     => ipcRenderer.invoke('journal-log-event', evt),
  openApp:           (name)    => ipcRenderer.invoke('open-app', name),
  openUrl:           (url)     => ipcRenderer.invoke('open-url', url),
  openFilePath:      (p)       => ipcRenderer.invoke('open-file-path', p),
});
