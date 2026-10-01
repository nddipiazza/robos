const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("robosTabletop", {
  loadKGraph: () => ipcRenderer.invoke("tabletop:load-kgraph"),
  saveKGraphEntity: (payload) => ipcRenderer.invoke("tabletop:save-kgraph-entity", payload),
  bundleCartridge: (payload) => ipcRenderer.invoke("tabletop:bundle-cartridge", payload),
  listCartridges: () => ipcRenderer.invoke("tabletop:list-cartridges"),
  launchGame: (payload) => ipcRenderer.invoke("tabletop:launch-game", payload)
});
