'use strict';

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "../..");
const KGRAPH_TABLETOP = path.join(REPO_ROOT, ".robos/kgraphs/tabletop-game/package.jsonld");
const KGRAPH_GAME = path.join(REPO_ROOT, ".robos/kgraphs/game/package.jsonld");
const TABLETOP_GAME_DIR = path.join(REPO_ROOT, "games/tabletop-rpg");

// Standard RobOS flags for VM / container stability
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: "RobOS Tabletop Studio — HeroQuest Form Editor",
    backgroundColor: "#0a0f1d",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));

  // Wire up snapshot debug server for DOM snapshots and test harness
  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(mainWindow);
    startDebugServer(mainWindow, 19198, 'robos-tabletop');
  } catch (err) {
    try {
      const localDom = require('../robos-lib/dom-snapshot');
      localDom.registerSnapshotIPC(mainWindow);
      localDom.startDebugServer(mainWindow, 19198, 'robos-tabletop');
    } catch {}
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.setName("RobOS Tabletop Studio");

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC: Load KGraph
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

// IPC: Save KGraph Entity
ipcMain.handle("tabletop:save-kgraph-entity", async (_event, payload) => {
  try {
    if (!payload || !payload.entity || !payload.entity["@id"]) {
      throw new Error("Entity with @id is required.");
    }
    const targetFile = KGRAPH_TABLETOP;
    const pkg = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    const nodes = pkg["robos:nodes"] || [];
    const entityId = payload.entity["@id"];

    const idx = nodes.findIndex(n => n["@id"] === entityId);
    if (idx >= 0) {
      nodes[idx] = { ...nodes[idx], ...payload.entity };
    } else {
      nodes.push(payload.entity);
    }
    pkg["robos:nodes"] = nodes;

    fs.writeFileSync(targetFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    return { success: true, entityId };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Bundle Cartridge
ipcMain.handle("tabletop:bundle-cartridge", async (_event, payload) => {
  try {
    const { GameCartridgeBundler } = require(path.join(REPO_ROOT, "packages/robos-gaming"));
    const bundler = new GameCartridgeBundler({ baseDir: TABLETOP_GAME_DIR });

    const cartridge = bundler.bundleTabletop(payload);
    const cartSlug = cartridge.cartridgeId || "heroquest-custom";
    const cartPath = path.join(TABLETOP_GAME_DIR, "cartridges", `${cartSlug}.cartridge.json`);

    bundler.saveCartridge(cartridge, cartPath);
    return {
      success: true,
      cartridgePath: cartPath,
      cartridgeId: cartSlug,
      header: cartridge.header
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: List Cartridges
ipcMain.handle("tabletop:list-cartridges", async () => {
  try {
    const cartDir = path.join(TABLETOP_GAME_DIR, "cartridges");
    if (!fs.existsSync(cartDir)) return { success: true, cartridges: [] };

    const files = fs.readdirSync(cartDir).filter(f => f.endsWith(".cartridge.json"));
    const cartridges = [];
    for (const f of files) {
      try {
        const full = path.join(cartDir, f);
        const data = JSON.parse(fs.readFileSync(full, "utf8"));
        cartridges.push({
          file: f,
          slug: f.replace(".cartridge.json", ""),
          title: data.header?.title || f,
          header: data.header || {}
        });
      } catch (e) {
        // ignore corrupted file
      }
    }
    return { success: true, cartridges };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Launch Godot 4 Player in Player or DunMaster role
ipcMain.handle("tabletop:launch-game", async (_event, payload) => {
  try {
    const slug = (payload && payload.cartridgeSlug) ? payload.cartridgeSlug : "heroquest-the-trial";
    const role = (payload && payload.role) ? payload.role : "player";

    // Candidate binaries
    const candidateBins = [
      process.env.GODOT_BIN,
      path.join(process.env.HOME || "", ".local/bin/godot"),
      path.join(process.env.HOME || "", "apps/godot4"),
      "/usr/bin/godot4",
      "/usr/bin/godot"
    ].filter(Boolean);

    let godotBin = null;
    for (const bin of candidateBins) {
      if (fs.existsSync(bin)) {
        godotBin = bin;
        break;
      }
    }

    if (!godotBin) {
      const playScript = path.join(TABLETOP_GAME_DIR, "play.sh");
      if (fs.existsSync(playScript)) {
        godotBin = playScript;
      } else {
        throw new Error("Godot 4 binary not found.");
      }
    }

    const spawnArgs = [
      "--path", `"${TABLETOP_GAME_DIR}"`,
      "--cartridge", `"${slug}"`,
      "--role", `"${role}"`
    ];

    const display = process.env.DISPLAY || ":0";
    const childEnv = {
      ...process.env,
      DISPLAY: display,
      CRPG_CARTRIDGE: slug,
      TABLETOP_CARTRIDGE: slug,
      TABLETOP_ROLE: role
    };

    const cmd = `"${godotBin}" ${spawnArgs.join(" ")}`;
    console.log(`[robos-tabletop] Launching: ${cmd} on ${display} (Role: ${role})`);

    const child = exec(cmd, { cwd: TABLETOP_GAME_DIR, env: childEnv });
    return {
      success: true,
      pid: child.pid,
      cartridge: slug,
      role: role
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Get Map Configurations
ipcMain.handle("tabletop:get-map-configs", async () => {
  try {
    const { listMapConfigurations } = require(path.join(REPO_ROOT, "packages/robos-gaming"));
    const configs = listMapConfigurations();
    return { success: true, configs };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Get Board Image as Data URL
ipcMain.handle("tabletop:get-board-image", async (_event, relPath) => {
  try {
    const cleanPath = (relPath || "").replace(/^res:\/\//, "");
    let fullPath = path.resolve(TABLETOP_GAME_DIR, cleanPath);
    if (!fs.existsSync(fullPath)) {
      fullPath = path.resolve(REPO_ROOT, cleanPath);
    }
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Image not found: ${relPath}` };
    }
    const ext = path.extname(fullPath).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    const data = fs.readFileSync(fullPath).toString("base64");
    return {
      success: true,
      dataUrl: `data:${mime};base64,${data}`,
      filePath: fullPath
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Save Board Snapshot
ipcMain.handle("tabletop:save-board-snapshot", async (_event, payload) => {
  try {
    const { dataUrl, filename } = payload || {};
    if (!dataUrl) throw new Error("Data URL is required.");
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const outName = filename || `tabletop-snapshot-${Date.now()}.png`;
    const outPath = path.join("/tmp", outName);
    fs.writeFileSync(outPath, buffer);
    return { success: true, filePath: outPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

