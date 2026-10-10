'use strict';

const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f";

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

async function run() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    show: true,
    backgroundColor: "#0a0f1d",
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

// IPC handlers needed by renderer
const KGRAPH_TABLETOP = path.join(REPO_ROOT, ".robos/kgraphs/tabletop-game/package.jsonld");
const KGRAPH_GAME = path.join(REPO_ROOT, ".robos/kgraphs/game/package.jsonld");

const { ipcMain } = require("electron");

ipcMain.handle("tabletop:get-map-configs", async () => {
  return { success: true, configs: [] };
});

ipcMain.handle("tabletop:list-cartridges", async () => {
  return { success: true, cartridges: [] };
});

ipcMain.handle("tabletop:load-kgraph", async () => {
  try {
    const tabletopData = fs.existsSync(KGRAPH_TABLETOP)
      ? JSON.parse(fs.readFileSync(KGRAPH_TABLETOP, "utf8"))
      : { "robos:nodes": [] };
    const gameData = fs.existsSync(KGRAPH_GAME)
      ? JSON.parse(fs.readFileSync(KGRAPH_GAME, "utf8"))
      : { "robos:nodes": [] };

    return {
      success: true,
      tabletopNodes: tabletopData["robos:nodes"] || [],
      gameNodes: gameData["robos:nodes"] || []
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
  console.log(`[RENDERER ${level}]: ${message} (${sourceId}:${line})`);
});

mainWindow.webContents.once("did-finish-load", async () => {
    // Wait for KGraph nodes to load and populate state
    await new Promise(r => setTimeout(r, 2000));

    // Open Between-Quests Trade Modal via DOM execution and ensure Rogar & Dorgan are selected
    const res = await mainWindow.webContents.executeJavaScript(`
      (() => {
        try {
          console.log("Checking _tabletopHeroTrade:", typeof window._tabletopHeroTrade);
          if (window._tabletopHeroTrade) {
            window._tabletopHeroTrade.openBetweenQuestsTradeModal();
            const modal = document.getElementById("modal-between-quests-trade");
            console.log("Modal display style after open:", modal ? modal.style.display : "no modal");
            return { ok: true, modalStyle: modal ? modal.style.display : null };
          }
          return { ok: false, reason: "no _tabletopHeroTrade" };
        } catch (e) {
          console.error("Execute JS error:", e.stack || e.message);
          return { ok: false, error: e.message };
        }
      })()
    `);
    console.log("executeJavaScript result:", res);

    // Wait 1000ms for modal rendering
    await new Promise(r => setTimeout(r, 1000));

    const image = await mainWindow.webContents.capturePage();
    const dest = path.join(BRAIN_DIR, "tabletop_editor_between_quests_trade_modal.png");
    fs.writeFileSync(dest, image.toPNG());
    console.log("Saved screenshot to " + dest);

    app.quit();
  });
}

app.whenReady().then(run);
