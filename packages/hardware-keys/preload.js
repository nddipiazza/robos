'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getState: () => ipcRenderer.invoke('hk:get-state'),
  scanKeys: () => ipcRenderer.invoke('hk:scan-keys'),
  runTouchChallenge: (opts) => ipcRenderer.invoke('hk:touch-challenge', opts),
  generateSshKey: (opts) => ipcRenderer.invoke('hk:generate-ssh-key', opts),
  testSshSign: (opts) => ipcRenderer.invoke('hk:test-ssh-sign', opts),
  uploadGithubSsh: (opts) => ipcRenderer.invoke('hk:upload-github-ssh', opts),
  setFidoPin: (opts) => ipcRenderer.invoke('hk:set-fido-pin', opts),
  listResidentCreds: (opts) => ipcRenderer.invoke('hk:list-resident-creds', opts),
  deleteResidentCred: (opts) => ipcRenderer.invoke('hk:delete-resident-cred', opts),
  enrollPamU2f: () => ipcRenderer.invoke('hk:enroll-pam-u2f'),
  configureGitSigning: (opts) => ipcRenderer.invoke('hk:configure-git-signing', opts),
  savePolicies: (policies) => ipcRenderer.invoke('hk:save-policies', policies),
  copyText: (text) => ipcRenderer.invoke('hk:copy-text', text),
  unlockKeystore: (opts) => ipcRenderer.invoke('hk:unlock-keystore', opts),
  lockKeystore: () => ipcRenderer.invoke('hk:lock-keystore'),
  openPassManager: () => ipcRenderer.invoke('hk:open-pass-manager'),
  onTouchStatus: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('hk:touch-status', handler);
    return () => ipcRenderer.removeListener('hk:touch-status', handler);
  },
  onHotplugChanged: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('hk:hotplug-changed', handler);
    return () => ipcRenderer.removeListener('hk:hotplug-changed', handler);
  },
});
