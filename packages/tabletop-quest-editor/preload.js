'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosQuestEditor', {
  getStartupArgs: () => ipcRenderer.invoke('quest:get-startup-args'),
  listBlockmaps: () => ipcRenderer.invoke('quest:list-blockmaps'),
  loadBlockmap: (slugOrPath) => ipcRenderer.invoke('quest:load-blockmap', slugOrPath),
  openBlockmapDialog: () => ipcRenderer.invoke('quest:open-blockmap-dialog'),
  listCartridges: () => ipcRenderer.invoke('quest:list-cartridges'),
  loadCartridge: (slugOrPath) => ipcRenderer.invoke('quest:load-cartridge', slugOrPath),
  openCartridgeDialog: () => ipcRenderer.invoke('quest:open-cartridge-dialog'),
  saveCartridge: (payload) => ipcRenderer.invoke('quest:save-cartridge', payload),
  saveFileDialog: (payload) => ipcRenderer.invoke('quest:save-file-dialog', payload),
  savePng: (payload) => ipcRenderer.invoke('quest:save-png', payload),
  exportPdf: (payload) => ipcRenderer.invoke('quest:export-pdf', payload),
  copyToClipboard: (text) => ipcRenderer.invoke('quest:copy-to-clipboard', text),
  copyImageToClipboard: (base64Data) => ipcRenderer.invoke('quest:copy-image-to-clipboard', base64Data),
  loadAssetImage: (relPath) => ipcRenderer.invoke('quest:load-asset-image', relPath),
  launchGame: (slug) => ipcRenderer.invoke('quest:launch-game', slug),
  ensureVoiceApp: () => ipcRenderer.invoke('voice:ensure-running')
});
