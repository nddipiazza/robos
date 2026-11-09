'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getState: () => ipcRenderer.invoke('shopping-lists:getState'),
  selectList: (listId) => ipcRenderer.invoke('shopping-lists:selectList', listId),
  createList: (payload) => ipcRenderer.invoke('shopping-lists:createList', payload),
  addItem: (listId, payload) => ipcRenderer.invoke('shopping-lists:addItem', listId, payload),
  toggleItem: (listId, itemId, checked) => ipcRenderer.invoke('shopping-lists:toggleItem', listId, itemId, checked),
  adjustItemQty: (listId, itemId, delta) => ipcRenderer.invoke('shopping-lists:adjustItemQty', listId, itemId, delta),
  updateItem: (listId, itemId, patch) => ipcRenderer.invoke('shopping-lists:updateItem', listId, itemId, patch),
  removeItem: (listId, itemId) => ipcRenderer.invoke('shopping-lists:removeItem', listId, itemId),
  clearChecked: (listId) => ipcRenderer.invoke('shopping-lists:clearChecked', listId),
  checkAll: (listId, checked) => ipcRenderer.invoke('shopping-lists:checkAll', listId, checked),
  undo: () => ipcRenderer.invoke('shopping-lists:undo'),
  smartAdd: (text, listId, useAi) => ipcRenderer.invoke('shopping-lists:smartAdd', text, listId, useAi),
  resetStarterLists: () => ipcRenderer.invoke('shopping-lists:resetStarterLists'),
  exportHouseholdCsv: (listId, opts) => ipcRenderer.invoke('shopping-lists:exportHouseholdCsv', listId, opts),
  previewGoogleDoc: (listId) => ipcRenderer.invoke('shopping-lists:previewGoogleDoc', listId),
  getQrSvg: (text, sizePx) => ipcRenderer.invoke('shopping-lists:getQrSvg', text, sizePx),
  listGoogleAccounts: () => ipcRenderer.invoke('shopping-lists:listGoogleAccounts'),
  signInGoogle: () => ipcRenderer.invoke('shopping-lists:signInGoogle'),
  updateSyncConfig: (patch) => ipcRenderer.invoke('shopping-lists:updateSyncConfig', patch),
  syncGoogleDrive: (opts) => ipcRenderer.invoke('shopping-lists:syncGoogleDrive', opts),
  shareGoogleFolder: (opts) => ipcRenderer.invoke('shopping-lists:shareGoogleFolder', opts),
  getAppsScriptBundle: () => ipcRenderer.invoke('shopping-lists:getAppsScriptBundle'),
  copyText: (text) => ipcRenderer.invoke('shopping-lists:copyText', text),
  openExternal: (url) => ipcRenderer.invoke('shopping-lists:openExternal', url),
  onState: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('shopping-lists:state', handler);
    return () => ipcRenderer.removeListener('shopping-lists:state', handler);
  },
};

contextBridge.exposeInMainWorld('shoppingLists', api);
contextBridge.exposeInMainWorld('robos', api);
