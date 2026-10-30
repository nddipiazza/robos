'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getVaultStatus:     (opts) => ipcRenderer.invoke('get-vault-status', opts),
  listEntries:        (opts) => ipcRenderer.invoke('list-entries', opts),
  initStore:          (opts) => ipcRenderer.invoke('init-store', opts),
  unlockWithPassword: (opts) => ipcRenderer.invoke('unlock-password', opts),
  unlockWithHardwareKey: (opts) => ipcRenderer.invoke('unlock-hardware-key', opts),
  enrollHardwareKey:  (opts) => ipcRenderer.invoke('enroll-hardware-key', opts),
  getEntry:           (p)    => ipcRenderer.invoke('get-entry', p),
  copyEntry:          (p)    => ipcRenderer.invoke('copy-entry', p),
  copyText:           (txt)  => ipcRenderer.invoke('copy-text', txt),
  saveEntry:          (opts) => ipcRenderer.invoke('save-entry', opts),
  addEntry:           (opts) => ipcRenderer.invoke('add-entry', opts),
  addMultiline:       (opts) => ipcRenderer.invoke('add-multiline', opts),
  deleteEntry:        (p)    => ipcRenderer.invoke('delete-entry', p),
  renameEntry:        (opts) => ipcRenderer.invoke('rename-entry', opts),
  generatePassword:   (opts) => ipcRenderer.invoke('generate-password', opts),
  generateEntry:      (opts) => ipcRenderer.invoke('generate-entry', opts),
  getDbInfo:          ()     => ipcRenderer.invoke('get-db-info'),
  openUnlockDialog:   ()     => ipcRenderer.invoke('open-unlock-dialog'),
  lockStore:          ()     => ipcRenderer.invoke('lock-store'),
  getLockStatus:      ()     => ipcRenderer.invoke('get-lock-status'),
  chooseKdbxFile:     (opts) => ipcRenderer.invoke('choose-kdbx-file', opts),
  onTouchStatus:      (cb)   => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('kdbx:touch-status', handler);
    return () => ipcRenderer.removeListener('kdbx:touch-status', handler);
  },
});
