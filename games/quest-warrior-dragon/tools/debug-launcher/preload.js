const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dw', {
  launch: preset => ipcRenderer.invoke('launch-preset', preset),
  killGame: () => ipcRenderer.invoke('kill-game'),
  loadMonsters: () => ipcRenderer.invoke('load-monsters'),
  loadSpells: () => ipcRenderer.invoke('load-spells'),
  loadWeapons: () => ipcRenderer.invoke('load-weapons'),
  loadArmor: () => ipcRenderer.invoke('load-armor'),
  loadItems: () => ipcRenderer.invoke('load-items'),
  loadChestRegistry: () => ipcRenderer.invoke('load-chest-registry'),
  loadDoorRegistry: () => ipcRenderer.invoke('load-door-registry'),
  loadMapGridsKeys: () => ipcRenderer.invoke('load-map-grids-keys'),
  loadMapSpawns: () => ipcRenderer.invoke('load-map-spawns'),
  listSaveStates: () => ipcRenderer.invoke('list-save-states'),
  loadSaveState: name => ipcRenderer.invoke('load-save-state', name),
  saveSaveState: (name, data) => ipcRenderer.invoke('save-save-state', name, data),
  deleteSaveState: name => ipcRenderer.invoke('delete-save-state', name),
  launchSaveState: data => ipcRenderer.invoke('launch-save-state', data),
  onLog: cb => ipcRenderer.on('log', (_event, msg) => cb(msg)),
});
