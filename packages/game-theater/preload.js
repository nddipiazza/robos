'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  getState: () => ipcRenderer.invoke('theater:get-state'),
  syncDocs: (opts) => ipcRenderer.invoke('theater:sync-docs', opts),
  addPlayer: (player) => ipcRenderer.invoke('theater:add-player', player),
  invitePlayer: (payload) => ipcRenderer.invoke('theater:invite-player', payload),
  generateGame: (payload) => ipcRenderer.invoke('theater:generate-game', payload),
  modifyGame: (payload) => ipcRenderer.invoke('theater:modify-game', payload),
  selectGame: (gameId) => ipcRenderer.invoke('theater:select-game', gameId),
  getGame: (gameId) => ipcRenderer.invoke('theater:get-game', gameId),
  saveGameSource: (payload) => ipcRenderer.invoke('theater:save-game-source', payload),
  openExternal: (url) => ipcRenderer.invoke('theater:open-external', url),
  copyText: (text) => ipcRenderer.invoke('theater:copy-text', text),
  openPlayerWindow: (info) => ipcRenderer.invoke('theater:open-player-window', info),
  capturePlayerWindow: (payload) => ipcRenderer.invoke('theater:capture-player-window', payload),
});
