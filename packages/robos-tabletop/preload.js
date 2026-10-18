const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("robosTabletop", {
  loadKGraph: () => ipcRenderer.invoke("tabletop:load-kgraph"),
  saveKGraphEntity: (payload) => ipcRenderer.invoke("tabletop:save-kgraph-entity", payload),
  deleteKGraphEntity: (payload) => ipcRenderer.invoke("tabletop:delete-kgraph-entity", payload),
  loadCartridge: (slug) => ipcRenderer.invoke("tabletop:load-cartridge", slug),
  syncCartridgeHeroes: (payload) => ipcRenderer.invoke("tabletop:sync-cartridge-heroes", payload),
  bundleCartridge: (payload) => ipcRenderer.invoke("tabletop:bundle-cartridge", payload),
  listCartridges: () => ipcRenderer.invoke("tabletop:list-cartridges"),
  launchQuestEditor: (payload) => ipcRenderer.invoke("tabletop:launch-quest-editor", payload),
  getQuestSaveState: (slug) => ipcRenderer.invoke("tabletop:get-quest-save-state", slug),
  saveQuestStateNow: (payload) => ipcRenderer.invoke("tabletop:save-quest-state-now", payload),
  saveQuestScreenshot: (payload) => ipcRenderer.invoke("tabletop:save-quest-screenshot", payload),
  clearQuestSaveState: (payload) => ipcRenderer.invoke("tabletop:clear-quest-save-state", payload),
  deleteQuest: (payload) => ipcRenderer.invoke("tabletop:delete-quest", payload),
  launchGame: (payload) => ipcRenderer.invoke("tabletop:launch-game", payload),
  getMapConfigs: () => ipcRenderer.invoke("tabletop:get-map-configs"),
  getBoardImage: (relPath) => ipcRenderer.invoke("tabletop:get-board-image", relPath),
  saveBoardSnapshot: (payload) => ipcRenderer.invoke("tabletop:save-board-snapshot", payload),
  checkCartridgeQuestStatus: (slug) => ipcRenderer.invoke("tabletop:check-cartridge-quest-status", slug),
  onGameExited: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("tabletop:game-exited", handler);
    return () => ipcRenderer.removeListener("tabletop:game-exited", handler);
  },
  onQuestEditorExited: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("tabletop:quest-editor-exited", handler);
    return () => ipcRenderer.removeListener("tabletop:quest-editor-exited", handler);
  }
});
