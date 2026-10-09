const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("robosTabletop", {
  loadKGraph: () => ipcRenderer.invoke("tabletop:load-kgraph"),
  saveKGraphEntity: (payload) => ipcRenderer.invoke("tabletop:save-kgraph-entity", payload),
  bundleCartridge: (payload) => ipcRenderer.invoke("tabletop:bundle-cartridge", payload),
  listCartridges: () => ipcRenderer.invoke("tabletop:list-cartridges"),
  launchGame: (payload) => ipcRenderer.invoke("tabletop:launch-game", payload),
  getMapConfigs: () => ipcRenderer.invoke("tabletop:get-map-configs"),
  getBoardImage: (relPath) => ipcRenderer.invoke("tabletop:get-board-image", relPath),
  saveBoardSnapshot: (payload) => ipcRenderer.invoke("tabletop:save-board-snapshot", payload),
  checkCartridgeQuestStatus: (slug) => ipcRenderer.invoke("tabletop:check-cartridge-quest-status", slug),
  onGameExited: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("tabletop:game-exited", handler);
    return () => ipcRenderer.removeListener("tabletop:game-exited", handler);
  }
});
