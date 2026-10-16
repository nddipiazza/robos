'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosBlockmap', {
  getStartupArgs: () => ipcRenderer.invoke('blockmap:get-startup-args'),
  listBoardPresets: () => ipcRenderer.invoke('blockmap:list-presets'),
  loadImage: (filePath) => ipcRenderer.invoke('blockmap:load-image', filePath),
  openFileDialog: () => ipcRenderer.invoke('blockmap:open-file-dialog'),
  loadBoardMap: (boardId) => ipcRenderer.invoke('blockmap:load-board-map', boardId),
  saveBoardMap: (payload) => ipcRenderer.invoke('blockmap:save-board-map', payload),
  loadCartridgeMap: (slugOrPath, mapId) => ipcRenderer.invoke('blockmap:load-cartridge-map', slugOrPath, mapId),
  saveCartridgeMap: (payload) => ipcRenderer.invoke('blockmap:save-cartridge-map', payload),
  exportMapJson: (payload) => ipcRenderer.invoke('blockmap:export-map-json', payload),
  saveMapToFile: (payload) => ipcRenderer.invoke('blockmap:save-map-to-file', payload),
  copyToClipboard: (text) => ipcRenderer.invoke('blockmap:copy-to-clipboard', text)
});
