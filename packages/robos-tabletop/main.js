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
    if (Array.isArray(pkg["@graph"])) {
      pkg["@graph"] = nodes;
    }

    fs.writeFileSync(targetFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    return { success: true, entityId };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Delete KGraph Entity
ipcMain.handle("tabletop:delete-kgraph-entity", async (_event, payload) => {
  try {
    const entityId = payload?.entityId || payload?.id;
    if (!entityId) throw new Error("entityId is required.");
    const targetFile = KGRAPH_TABLETOP;
    const pkg = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    const nodes = (pkg["robos:nodes"] || []).filter(n => n["@id"] !== entityId);
    pkg["robos:nodes"] = nodes;
    if (Array.isArray(pkg["@graph"])) {
      pkg["@graph"] = nodes;
    }
    fs.writeFileSync(targetFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    return { success: true, entityId };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

const os = require("os");
const {
  TABLETOP_SAVE_STATE_SCHEMA,
  normalizeQuestSaveStateToKGraphNode
} = require(path.join(REPO_ROOT, "packages/robos-gaming"));

function resolveSlugArg(arg, fallback = "custom-quest") {
  if (!arg) return fallback;
  const raw = typeof arg === "string"
    ? arg
    : String(arg.cartridgeSlug || arg.slug || arg.cartridgeId || fallback);
  return raw.replace(/\.cartridge(\.json)?$/, "");
}

function getGodotUserSaveDir() {
  const home = process.env.HOME || os.homedir();
  const candidates = [
    path.join(home, ".local/share/godot/app_userdata/RobOS Tabletop RPG- HeroQuest"),
    path.join(home, ".local/share/godot/app_userdata/RobOS Tabletop RPG: HeroQuest")
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  const defaultDir = candidates[0];
  fs.mkdirSync(defaultDir, { recursive: true });
  return defaultDir;
}

function getGodotAutosavePath(slug = "custom-quest", mapId = null) {
  const effectiveSlug = resolveSlugArg(slug, "custom-quest").replace(/[\/\\]/g, "_");
  const effectiveMap = (mapId ? resolveSlugArg(mapId, effectiveSlug) : effectiveSlug).replace(/[\/\\]/g, "_");
  return path.join(getGodotUserSaveDir(), `tabletop_autosave_${effectiveSlug}_${effectiveMap}.json`);
}

function getGodotAutosaveScreenshotPath(slug = "custom-quest", mapId = null) {
  return getGodotAutosavePath(slug, mapId).replace(/\.json$/, ".png");
}

function getRobosSaveSnapshotsDir(slug = "custom-quest") {
  const home = process.env.HOME || os.homedir();
  const cleanSlug = resolveSlugArg(slug, "custom-quest");
  const dir = path.join(home, ".config/robos/tabletop-saves", cleanSlug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readImageFileAsDataUrl(imgPath) {
  try {
    if (!imgPath || !fs.existsSync(imgPath)) return "";
    const buf = fs.readFileSync(imgPath);
    if (!buf || buf.length === 0) return "";
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function writeDataUrlToPngFile(dataUrl, targetPngPath) {
  try {
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return false;
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length === 0) return false;
    fs.mkdirSync(path.dirname(targetPngPath), { recursive: true });
    fs.writeFileSync(targetPngPath, buf);
    return true;
  } catch {
    return false;
  }
}

function syncSaveStateNodeToKGraph(kgraphSaveNode, removeSlug = null) {
  try {
    if (!fs.existsSync(KGRAPH_TABLETOP)) return;
    const pkg = JSON.parse(fs.readFileSync(KGRAPH_TABLETOP, "utf8"));
    let nodes = Array.isArray(pkg["robos:nodes"]) ? pkg["robos:nodes"] : [];

    if (removeSlug) {
      const targetId = `urn:robos:tabletop:savestate:${removeSlug}`;
      const nextNodes = nodes.filter(n => n["@id"] !== targetId);
      if (nextNodes.length !== nodes.length) {
        pkg["robos:nodes"] = nextNodes;
        if (Array.isArray(pkg["@graph"])) pkg["@graph"] = nextNodes;
        fs.writeFileSync(KGRAPH_TABLETOP, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      }
      return;
    }

    if (!kgraphSaveNode || !kgraphSaveNode["@id"]) return;
    // Strip transient base64 dataUrl and legacy aliases before persisting to KGraph package.jsonld
    const persistedNode = {
      "@id": kgraphSaveNode["@id"],
      "@type": kgraphSaveNode["@type"],
      "dcterms:title": kgraphSaveNode["dcterms:title"],
      "robos:package": "tabletop-game",
      "robos:namespace": "robos.tabletop",
      "robos:questSlug": kgraphSaveNode["robos:questSlug"],
      "robos:mapId": kgraphSaveNode["robos:mapId"],
      "robos:gridDimensions": kgraphSaveNode["robos:gridDimensions"],
      "robos:savedAt": kgraphSaveNode["robos:savedAt"],
      "robos:playTimeSeconds": kgraphSaveNode["robos:playTimeSeconds"],
      "robos:playTimeFormatted": kgraphSaveNode["robos:playTimeFormatted"],
      "robos:currentRound": kgraphSaveNode["robos:currentRound"],
      "robos:currentPhase": kgraphSaveNode["robos:currentPhase"],
      "robos:currentRole": kgraphSaveNode["robos:currentRole"],
      "robos:activeHeroIndex": kgraphSaveNode["robos:activeHeroIndex"],
      "robos:activeTurnActor": kgraphSaveNode["robos:activeTurnActor"],
      "robos:turnState": kgraphSaveNode["robos:turnState"],
      "robos:movementRemaining": kgraphSaveNode["robos:movementRemaining"],
      "robos:hasMovedThisTurn": kgraphSaveNode["robos:hasMovedThisTurn"],
      "robos:hasActedThisTurn": kgraphSaveNode["robos:hasActedThisTurn"],
      "robos:heroStates": kgraphSaveNode["robos:heroStates"],
      "robos:visibleMonsters": kgraphSaveNode["robos:visibleMonsters"],
      "robos:visibleMonstersCount": kgraphSaveNode["robos:visibleMonstersCount"],
      "robos:monstersDefeated": kgraphSaveNode["robos:monstersDefeated"],
      "robos:itemsFound": kgraphSaveNode["robos:itemsFound"],
      "robos:itemsFoundCount": kgraphSaveNode["robos:itemsFoundCount"],
      "robos:totalPartyGold": kgraphSaveNode["robos:totalPartyGold"],
      "robos:exploredTilesCount": kgraphSaveNode["robos:exploredTilesCount"],
      "robos:revealedRooms": kgraphSaveNode["robos:revealedRooms"],
      "robos:searchedRooms": kgraphSaveNode["robos:searchedRooms"],
      "robos:doorsOpenCount": kgraphSaveNode["robos:doorsOpenCount"],
      "robos:trapsDetectedCount": kgraphSaveNode["robos:trapsDetectedCount"],
      "robos:triggersFired": kgraphSaveNode["robos:triggersFired"],
      "robos:triggersFiredCount": kgraphSaveNode["robos:triggersFiredCount"],
      "robos:screenshotPath": kgraphSaveNode["robos:screenshotPath"] || "",
      "robos:saveFilePath": kgraphSaveNode["robos:saveFilePath"] || ""
    };

    const idx = nodes.findIndex(n => n["@id"] === persistedNode["@id"]);
    if (idx >= 0) {
      nodes[idx] = persistedNode;
    } else {
      nodes.push(persistedNode);
    }
    pkg["robos:nodes"] = nodes;
    if (Array.isArray(pkg["@graph"])) {
      pkg["@graph"] = nodes;
    }
    fs.writeFileSync(KGRAPH_TABLETOP, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  } catch (err) {
    console.warn("[robos-tabletop] Failed to sync save state node to KGraph:", err.message);
  }
}

// IPC: Load Cartridge directly from games/tabletop-rpg/cartridges/<slug>.cartridge.json
ipcMain.handle("tabletop:load-cartridge", async (_event, slug = "custom-quest") => {
  try {
    const cleanSlug = resolveSlugArg(slug, "custom-quest");
    const cartPath = path.join(TABLETOP_GAME_DIR, "cartridges", `${cleanSlug}.cartridge.json`);
    if (!fs.existsSync(cartPath)) {
      return { success: false, error: `Cartridge not found: ${cartPath}` };
    }
    const cartridge = JSON.parse(fs.readFileSync(cartPath, "utf8"));
    return {
      success: true,
      slug: cleanSlug,
      cartridgePath: cartPath,
      cartridge
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Non-destructively sync campaign heroes & metadata into existing cartridge file
ipcMain.handle("tabletop:sync-cartridge-heroes", async (_event, payload) => {
  try {
    const cleanSlug = (payload?.cartridgeSlug || payload?.cartridgeId || "custom-quest").replace(/\.cartridge\.json$/, "");
    const cartPath = path.join(TABLETOP_GAME_DIR, "cartridges", `${cleanSlug}.cartridge.json`);
    if (!fs.existsSync(cartPath)) {
      return { success: false, error: `Cartridge not found: ${cartPath}` };
    }
    const cartridge = JSON.parse(fs.readFileSync(cartPath, "utf8"));
    if (Array.isArray(payload?.heroes) && payload.heroes.length > 0) {
      const heroesObj = {};
      const startPos = cartridge.header?.startingPosition || [7, 14];
      payload.heroes.forEach(h => {
        const key = (h.slug || h.id || "hero").toLowerCase();
        heroesObj[key] = {
          ...(cartridge.heroes?.[key] || {}),
          id: key,
          slug: key,
          name: h.name || h.heroClass || key,
          heroClass: h.heroClass || "Barbarian",
          bodyPoints: Number(h.bodyPoints) || 8,
          mindPoints: Number(h.mindPoints) || 2,
          attackDice: Number(h.attackDice) || 3,
          defendDice: Number(h.defendDice) || 2,
          gold: h.gold !== undefined ? Number(h.gold) : 100,
          weapon: h.weapon,
          armor: h.armor,
          inventory: h.inventory || [],
          spells: h.spells || [],
          tokenColor: h.tokenColor || "#b91c1c",
          position: Array.isArray(h.position) && h.position.length === 2 ? h.position : startPos
        };
      });
      cartridge.heroes = heroesObj;
      if (cartridge.header) {
        cartridge.header.heroCount = Object.keys(heroesObj).length;
      }
    }
    if (payload?.spellAllocation) {
      cartridge.spellAllocation = payload.spellAllocation;
    }
    if (payload?.questTitle && cartridge.header) {
      cartridge.header.title = payload.questTitle;
    }
    if (payload?.questBriefing && cartridge.header) {
      cartridge.header.description = payload.questBriefing;
    }
    fs.writeFileSync(cartPath, JSON.stringify(cartridge, null, 2) + "\n", "utf8");
    return { success: true, cartridgePath: cartPath, cartridgeId: cleanSlug };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Bundle Cartridge (Preserves existing rich custom-quest.cartridge.json maps/monsters/triggers if file exists)
ipcMain.handle("tabletop:bundle-cartridge", async (_event, payload) => {
  try {
    const cartSlug = (payload?.cartridgeId || "custom-quest").replace(/\.cartridge\.json$/, "");
    const cartPath = path.join(TABLETOP_GAME_DIR, "cartridges", `${cartSlug}.cartridge.json`);

    if (fs.existsSync(cartPath)) {
      const existing = JSON.parse(fs.readFileSync(cartPath, "utf8"));
      if (Array.isArray(payload?.heroes) && payload.heroes.length > 0) {
        const heroesObj = {};
        const startPos = existing.header?.startingPosition || [7, 14];
        payload.heroes.forEach(h => {
          const key = (h.slug || h.id || "hero").toLowerCase();
          heroesObj[key] = {
            ...(existing.heroes?.[key] || {}),
            id: key,
            slug: key,
            name: h.name || h.heroClass || key,
            heroClass: h.heroClass || "Barbarian",
            bodyPoints: Number(h.bodyPoints) || 8,
            mindPoints: Number(h.mindPoints) || 2,
            attackDice: Number(h.attackDice) || 3,
            defendDice: Number(h.defendDice) || 2,
            gold: h.gold !== undefined ? Number(h.gold) : 100,
            weapon: h.weapon,
            armor: h.armor,
            inventory: h.inventory || [],
            spells: h.spells || [],
            tokenColor: h.tokenColor || "#b91c1c",
            position: Array.isArray(h.position) && h.position.length === 2 ? h.position : startPos
          };
        });
        existing.heroes = heroesObj;
      }
      if (payload?.spellAllocation) {
        existing.spellAllocation = payload.spellAllocation;
      }
      fs.writeFileSync(cartPath, JSON.stringify(existing, null, 2) + "\n", "utf8");
      return {
        success: true,
        cartridgePath: cartPath,
        cartridgeId: cartSlug,
        header: existing.header
      };
    }

    const { GameCartridgeBundler } = require(path.join(REPO_ROOT, "packages/robos-gaming"));
    const bundler = new GameCartridgeBundler({ baseDir: TABLETOP_GAME_DIR });

    const cartridge = bundler.bundleTabletop(payload);
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

// IPC: Launch Tabletop Quest Map Editor (packages/tabletop-quest-editor)
ipcMain.handle("tabletop:launch-quest-editor", async (_event, payload) => {
  try {
    const slug = (payload?.cartridgeSlug || payload?.slug || "custom-quest").replace(/\.cartridge\.json$/, "");
    const questEditorDir = path.join(REPO_ROOT, "packages/tabletop-quest-editor");
    const electronBin = process.execPath;
    const display = process.env.DISPLAY || ":0";
    const cmd = `"${electronBin}" "${questEditorDir}" "--cartridge=${slug}" --no-sandbox --disable-gpu --disable-dev-shm-usage`;

    console.log(`[robos-tabletop] Launching Quest Map Editor: ${cmd}`);
    const child = exec(cmd, {
      cwd: questEditorDir,
      env: { ...process.env, DISPLAY: display }
    });

    child.on("exit", (code, signal) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("tabletop:quest-editor-exited", {
          code,
          signal,
          cartridgeSlug: slug
        });
      }
    });

    return {
      success: true,
      pid: child.pid,
      cartridgeSlug: slug
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Get Current Quest Save State (from Godot user:// autosave + Studio snapshots + KGraph schema)
ipcMain.handle("tabletop:get-quest-save-state", async (_event, slugArg = "custom-quest") => {
  try {
    const cleanSlug = resolveSlugArg(slugArg, "custom-quest");
    const savePath = getGodotAutosavePath(cleanSlug, cleanSlug);
    const defaultScreenshotPath = getGodotAutosaveScreenshotPath(cleanSlug, cleanSlug);
    const snapshotsDir = getRobosSaveSnapshotsDir(cleanSlug);

    let hasSavedState = false;
    let saveData = null;
    let kgraphSaveNode = null;
    let lastModified = null;
    let screenshotPath = "";
    let screenshotDataUrl = "";

    if (fs.existsSync(savePath)) {
      const stat = fs.statSync(savePath);
      const raw = fs.readFileSync(savePath, "utf8").trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.heroes) && parsed.heroes.length > 0) {
          hasSavedState = true;
          saveData = parsed;
          lastModified = stat.mtime.toISOString();

          const candidatePngs = [
            parsed.screenshot_path,
            parsed["robos:screenshotPath"],
            defaultScreenshotPath
          ].filter(Boolean);
          for (const cp of candidatePngs) {
            if (fs.existsSync(cp)) {
              screenshotPath = cp;
              screenshotDataUrl = readImageFileAsDataUrl(cp);
              if (screenshotDataUrl) break;
            }
          }

          kgraphSaveNode = normalizeQuestSaveStateToKGraphNode(parsed, {
            slug: cleanSlug,
            fileMtimeMs: stat.mtimeMs,
            saveFilePath: savePath,
            screenshotPath: screenshotPath || defaultScreenshotPath,
            screenshotDataUrl
          });

          if (kgraphSaveNode) {
            syncSaveStateNodeToKGraph(kgraphSaveNode);
          }
        }
      }
    }

    const snapshots = [];
    if (fs.existsSync(snapshotsDir)) {
      const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith(".save.json")).sort().reverse();
      for (const f of files) {
        try {
          const full = path.join(snapshotsDir, f);
          const st = fs.statSync(full);
          const d = JSON.parse(fs.readFileSync(full, "utf8"));
          const snapPngPath = full.replace(/\.save\.json$/, ".png");
          const snapScreenshotUrl = fs.existsSync(snapPngPath) ? readImageFileAsDataUrl(snapPngPath) : "";
          const normSnap = normalizeQuestSaveStateToKGraphNode(d, {
            slug: cleanSlug,
            fileMtimeMs: st.mtimeMs,
            saveFilePath: full,
            screenshotPath: fs.existsSync(snapPngPath) ? snapPngPath : "",
            screenshotDataUrl: snapScreenshotUrl
          });
          const isoTime = normSnap?.["robos:savedAt"] || st.mtime.toISOString();
          const roundVal = normSnap?.["robos:currentRound"] || d.current_round || d.round_num || 1;
          const phaseVal = normSnap?.["robos:currentPhase"] || d.current_phase || d.phase || "hero_phase";
          const hCount = Array.isArray(d.heroes) ? d.heroes.length : 0;
          snapshots.push({
            id: f.replace(/\.save\.json$/, ""),
            file: f,
            fileName: f,
            path: full,
            label: d.snapshot_label || d.label || normSnap?.["dcterms:title"] || f.replace(/\.save\.json$/, ""),
            timestamp: isoTime,
            savedAtIso: isoTime,
            round: roundVal,
            roundNum: roundVal,
            phase: phaseVal,
            activeTurnActor: normSnap?.["robos:activeTurnActor"] || "Hero Party",
            playTimeFormatted: normSnap?.["robos:playTimeFormatted"] || "1m 0s",
            heroCount: hCount,
            heroesCount: hCount,
            monsterCount: normSnap?.["robos:visibleMonstersCount"] || 0,
            visibleMonstersCount: normSnap?.["robos:visibleMonstersCount"] || 0,
            screenshotPath: fs.existsSync(snapPngPath) ? snapPngPath : "",
            screenshotDataUrl: snapScreenshotUrl
          });
        } catch {}
      }
    }

    return {
      success: true,
      slug: cleanSlug,
      hasSavedState,
      saveFilePath: savePath,
      screenshotPath: screenshotPath || defaultScreenshotPath,
      screenshotDataUrl,
      lastModified,
      saveStateSchema: TABLETOP_SAVE_STATE_SCHEMA,
      activeSave: kgraphSaveNode,
      saveData: kgraphSaveNode,
      rawSaveData: saveData,
      snapshots
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Save Quest State From Now (creates/updates active Godot save state + saves a named snapshot + captures screenshot + syncs KGraph)
ipcMain.handle("tabletop:save-quest-state-now", async (_event, payload) => {
  try {
    const cleanSlug = resolveSlugArg(payload, "custom-quest");
    const savePath = getGodotAutosavePath(cleanSlug, cleanSlug);
    const screenshotPath = getGodotAutosaveScreenshotPath(cleanSlug, cleanSlug);
    const snapshotsDir = getRobosSaveSnapshotsDir(cleanSlug);
    const cartPath = path.join(TABLETOP_GAME_DIR, "cartridges", `${cleanSlug}.cartridge.json`);
    const cartridge = fs.existsSync(cartPath) ? JSON.parse(fs.readFileSync(cartPath, "utf8")) : {};
    const mapObj = cartridge.maps?.[cleanSlug] || Object.values(cartridge.maps || {})[0] || {};
    const startPos = cartridge.header?.startingPosition || mapObj.startingStair || [7, 14];

    let baseSave = null;
    if (fs.existsSync(savePath)) {
      try {
        baseSave = JSON.parse(fs.readFileSync(savePath, "utf8"));
      } catch {}
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const label = payload?.label || payload?.statePayload?.label || `Studio Save State (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`;

    // Determine source heroes from payload.heroes, payload.statePayload.heroes, baseSave.heroes, or cartridge.heroes
    const incomingHeroes = Array.isArray(payload?.heroes) && payload.heroes.length > 0
      ? payload.heroes
      : (Array.isArray(payload?.statePayload?.heroes) && payload.statePayload.heroes.length > 0 && !Array.isArray(baseSave?.heroes)
        ? payload.statePayload.heroes
        : null);

    let heroesSave = [];
    if (Array.isArray(baseSave?.heroes) && baseSave.heroes.length > 0 && !Array.isArray(payload?.heroes)) {
      // Preserve live Godot hero state (positions, current_bp, spells, inventory) while syncing any updated names/gold
      heroesSave = baseSave.heroes;
    } else if (incomingHeroes && incomingHeroes.length > 0) {
      heroesSave = incomingHeroes.map((h, idx) => {
        const hKey = String(h.slug || h.id || `hero-${idx + 1}`).toLowerCase();
        const existingHero = Array.isArray(baseSave?.heroes)
          ? baseSave.heroes.find(bh => String(bh.id || bh.slug || "").toLowerCase() === hKey || bh.heroClass === h.heroClass || bh.class === h.heroClass)
          : null;
        const maxBp = Number(h.max_hp ?? h.max_bp ?? h.bodyPoints ?? existingHero?.bodyPoints ?? existingHero?.max_bp ?? 8) || 8;
        const curBp = Number(h.currentBP ?? h.current_bp ?? h.hp ?? h.bp ?? existingHero?.current_bp ?? existingHero?.bp ?? maxBp);
        const maxMp = Number(h.max_mp ?? h.mindPoints ?? existingHero?.mindPoints ?? existingHero?.max_mp ?? 2) || 2;
        const curMp = Number(h.currentMP ?? h.current_mp ?? h.mp ?? existingHero?.current_mp ?? existingHero?.mp ?? maxMp);
        const atk = Number(h.attackDice ?? h.atk ?? existingHero?.attackDice ?? existingHero?.atk ?? 3) || 3;
        const def = Number(h.defendDice ?? h.def ?? existingHero?.defendDice ?? existingHero?.def ?? 2) || 2;
        const gold = h.gold !== undefined ? Number(h.gold) : (existingHero?.gold !== undefined ? Number(existingHero.gold) : 100);
        const gridPos = existingHero?.grid_pos || (Array.isArray(h.grid_pos) && h.grid_pos.length === 2 ? h.grid_pos : (Array.isArray(h.position) && h.position.length === 2 ? h.position : startPos));
        const heroClass = String(h.heroClass || h.class || existingHero?.heroClass || existingHero?.class || "Barbarian");
        return {
          ...(existingHero || {}),
          id: hKey,
          slug: hKey,
          name: h.name || existingHero?.name || heroClass,
          heroClass,
          hero_class: heroClass,
          class: heroClass,
          bodyPoints: maxBp,
          current_bp: curBp,
          bp: curBp,
          max_bp: maxBp,
          mindPoints: maxMp,
          current_mp: curMp,
          mp: curMp,
          max_mp: maxMp,
          attackDice: atk,
          atk,
          defendDice: def,
          def,
          gold,
          grid_pos: gridPos,
          position: existingHero?.position || startPos,
          equipped_weapon: h.equipped_weapon || h.weapon || existingHero?.equipped_weapon || "broadsword",
          equipped_armor: Array.isArray(existingHero?.equipped_armor) ? existingHero.equipped_armor : [],
          inventory: Array.isArray(existingHero?.inventory) && existingHero.inventory.length > 0
            ? existingHero.inventory
            : (Array.isArray(h.inventory) ? h.inventory : []),
          spells: Array.isArray(existingHero?.spells) && existingHero.spells.length > 0
            ? existingHero.spells
            : (Array.isArray(h.spells) ? h.spells : []),
          used_spells: Array.isArray(existingHero?.used_spells) ? existingHero.used_spells : [],
          is_on_board: existingHero?.is_on_board !== undefined ? existingHero.is_on_board : true,
          has_departed_start: existingHero?.has_departed_start !== undefined ? existingHero.has_departed_start : false,
          escaped: false
        };
      });
    } else {
      const cartHeroes = Object.values(cartridge.heroes || {});
      heroesSave = cartHeroes.map(ch => {
        const maxBp = Number(ch.bodyPoints) || 8;
        const maxMp = Number(ch.mindPoints) || 2;
        return {
          id: ch.id || ch.slug,
          slug: ch.slug || ch.id,
          name: ch.name || ch.heroClass,
          heroClass: ch.heroClass || ch.name,
          hero_class: ch.heroClass || ch.name,
          class: ch.heroClass || ch.name,
          bodyPoints: maxBp,
          current_bp: maxBp,
          bp: maxBp,
          max_bp: maxBp,
          mindPoints: maxMp,
          current_mp: maxMp,
          mp: maxMp,
          max_mp: maxMp,
          attackDice: Number(ch.attackDice) || 3,
          atk: Number(ch.attackDice) || 3,
          defendDice: Number(ch.defendDice) || 2,
          def: Number(ch.defendDice) || 2,
          gold: ch.gold !== undefined ? Number(ch.gold) : 100,
          grid_pos: ch.position || startPos,
          position: ch.position || startPos,
          inventory: Array.isArray(ch.inventory) ? ch.inventory : [],
          spells: Array.isArray(ch.spells) ? ch.spells : [],
          used_spells: [],
          is_on_board: true,
          has_departed_start: false,
          escaped: false
        };
      });
    }

    // Build monsters array if creating fresh save state
    let monstersSave = Array.isArray(baseSave?.monsters) ? baseSave.monsters : [];
    if (monstersSave.length === 0 && (Array.isArray(mapObj.monsters) || cartridge.monsters)) {
      const srcMonsters = Array.isArray(mapObj.monsters) ? mapObj.monsters : Object.values(cartridge.monsters || {});
      monstersSave = srcMonsters.map(m => {
        const maxBp = Number(m.bodyPoints) || 1;
        return {
          id: m.id,
          slug: m.slug || m.id,
          name: m.name || m.monsterType || "Monster",
          monsterType: m.monsterType || m.type || "goblin",
          type: m.monsterType || m.type || "goblin",
          bodyPoints: maxBp,
          current_bp: maxBp,
          bp: maxBp,
          max_bp: maxBp,
          mindPoints: Number(m.mindPoints) || 1,
          mp: Number(m.mindPoints) || 1,
          attackDice: Number(m.attackDice) || 2,
          atk: Number(m.attackDice) || 2,
          defendDice: Number(m.defendDice) || 2,
          def: Number(m.defendDice) || 2,
          movementSquares: Number(m.movementSquares) || 6,
          move: Number(m.movementSquares) || 6,
          isBoss: !!m.isBoss,
          is_boss: !!m.isBoss,
          isUndead: !!m.isUndead,
          is_undead: !!m.isUndead,
          isSpellcaster: !!m.isSpellcaster,
          is_spellcaster: !!m.isSpellcaster,
          is_alive: true,
          spells: m.spells || [],
          grid_pos: m.position || [0, 0],
          position: m.position || [0, 0],
          roomId: m.roomId || m.room || "",
          room_id: m.roomId || m.room || "",
          hidden: !!m.hidden
        };
      });
    }

    const snapFile = `state-${nowUnix}.save.json`;
    const snapPath = path.join(snapshotsDir, snapFile);
    const snapPngPath = path.join(snapshotsDir, `state-${nowUnix}.png`);

    let screenshotDataUrl = payload?.screenshotDataUrl || "";
    if (screenshotDataUrl) {
      writeDataUrlToPngFile(screenshotDataUrl, screenshotPath);
      writeDataUrlToPngFile(screenshotDataUrl, snapPngPath);
    } else if (fs.existsSync(screenshotPath)) {
      fs.copyFileSync(screenshotPath, snapPngPath);
      screenshotDataUrl = readImageFileAsDataUrl(screenshotPath);
    }

    const finalSaveState = {
      version: 1,
      ...(baseSave || {}),
      snapshot_label: label,
      timestamp: nowUnix,
      screenshot_path: screenshotPath,
      cartridge_slug: cleanSlug,
      map_id: cleanSlug,
      grid_cols: baseSave?.grid_cols || mapObj.width || 26,
      grid_rows: baseSave?.grid_rows || mapObj.height || 19,
      current_role: baseSave?.current_role || "player",
      active_hero_idx: baseSave?.active_hero_idx ?? 0,
      current_round: baseSave?.current_round || 1,
      current_phase: baseSave?.current_phase || "hero_phase",
      turn_state: baseSave?.turn_state || "awaiting_roll",
      heroes: heroesSave,
      monsters: monstersSave,
      doors: Array.isArray(baseSave?.doors) ? baseSave.doors : (mapObj.doors || []),
      traps: Array.isArray(baseSave?.traps) ? baseSave.traps : (mapObj.traps || []),
      furniture: Array.isArray(baseSave?.furniture) ? baseSave.furniture : (mapObj.furniture || []),
      story_triggers: Array.isArray(baseSave?.story_triggers) ? baseSave.story_triggers : (mapObj.storyTriggers || []),
      explored_tiles: Array.isArray(baseSave?.explored_tiles) ? baseSave.explored_tiles : [startPos],
      revealed_rooms: baseSave?.revealed_rooms || ["room-sw-8"],
      discovered_monster_ids: baseSave?.discovered_monster_ids || {},
      searched_rooms: baseSave?.searched_rooms || {},
      quest_begun: true,
      game_state: "in_progress"
    };

    fs.writeFileSync(savePath, JSON.stringify(finalSaveState, null, "\t") + "\n", "utf8");
    fs.writeFileSync(snapPath, JSON.stringify(finalSaveState, null, 2) + "\n", "utf8");

    const kgraphSaveNode = normalizeQuestSaveStateToKGraphNode(finalSaveState, {
      slug: cleanSlug,
      fileMtimeMs: nowUnix * 1000,
      saveFilePath: savePath,
      screenshotPath,
      screenshotDataUrl
    });

    if (kgraphSaveNode) {
      syncSaveStateNodeToKGraph(kgraphSaveNode);
    }

    return {
      success: true,
      saveFilePath: savePath,
      snapshotPath: snapPath,
      screenshotPath,
      screenshotDataUrl,
      label,
      saveStateSchema: TABLETOP_SAVE_STATE_SCHEMA,
      savedState: kgraphSaveNode,
      activeSave: kgraphSaveNode,
      saveData: kgraphSaveNode
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Persist / Update Quest State Screenshot PNG
ipcMain.handle("tabletop:save-quest-screenshot", async (_event, payload) => {
  try {
    const cleanSlug = resolveSlugArg(payload, "custom-quest");
    const dataUrl = payload?.dataUrl || payload?.screenshotDataUrl || "";
    if (!dataUrl) {
      return { success: false, error: "screenshot dataUrl is required." };
    }
    const screenshotPath = getGodotAutosaveScreenshotPath(cleanSlug, cleanSlug);
    const ok = writeDataUrlToPngFile(dataUrl, screenshotPath);
    if (payload?.snapshotFile) {
      const snapshotsDir = getRobosSaveSnapshotsDir(cleanSlug);
      const snapPngPath = path.join(snapshotsDir, String(payload.snapshotFile).replace(/(\.save)?\.json$/, "") + ".png");
      writeDataUrlToPngFile(dataUrl, snapPngPath);
    }
    return {
      success: ok,
      slug: cleanSlug,
      screenshotPath
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Clear or Restore Quest Save State
ipcMain.handle("tabletop:clear-quest-save-state", async (_event, payload) => {
  try {
    const cleanSlug = resolveSlugArg(payload, "custom-quest");
    const savePath = getGodotAutosavePath(cleanSlug, cleanSlug);
    const screenshotPath = getGodotAutosaveScreenshotPath(cleanSlug, cleanSlug);
    const snapshotsDir = getRobosSaveSnapshotsDir(cleanSlug);

    let restorePath = payload?.restoreSnapshotPath || "";
    if (!restorePath && payload?.restoreSnapshotFile) {
      restorePath = path.join(snapshotsDir, path.basename(String(payload.restoreSnapshotFile)));
    }

    if (restorePath && fs.existsSync(restorePath)) {
      const content = fs.readFileSync(restorePath, "utf8");
      fs.writeFileSync(savePath, content, "utf8");
      const snapPng = restorePath.replace(/\.save\.json$/, ".png");
      if (fs.existsSync(snapPng)) {
        fs.copyFileSync(snapPng, screenshotPath);
      }
      const parsed = JSON.parse(content);
      const kgraphSaveNode = normalizeQuestSaveStateToKGraphNode(parsed, {
        slug: cleanSlug,
        saveFilePath: savePath,
        screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : ""
      });
      if (kgraphSaveNode) syncSaveStateNodeToKGraph(kgraphSaveNode);
      return { success: true, restored: true, saveFilePath: savePath };
    }

    if (fs.existsSync(savePath)) {
      fs.unlinkSync(savePath);
    }
    if (fs.existsSync(screenshotPath)) {
      fs.unlinkSync(screenshotPath);
    }
    syncSaveStateNodeToKGraph(null, cleanSlug);
    return { success: true, cleared: true, saveFilePath: savePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Launch Godot 4 Player in Player or Game Master role (Supports Saved State or New Quest State)
ipcMain.handle("tabletop:launch-game", async (_event, payload) => {
  try {
    const slug = ((payload && payload.cartridgeSlug) ? payload.cartridgeSlug : "custom-quest").replace(/\.cartridge\.json$/, "");
    const role = (payload && payload.role) ? payload.role : "player";
    const launchMode = (payload && payload.launchMode) ? payload.launchMode : "saved"; // "saved" | "new"

    // If a specific snapshot was requested to launch from, copy it to active autosave path
    if (launchMode === "saved" && payload?.saveSnapshotPath && fs.existsSync(payload.saveSnapshotPath)) {
      const activeSavePath = getGodotAutosavePath(slug, slug);
      fs.copyFileSync(payload.saveSnapshotPath, activeSavePath);
    }

    const playScript = path.join(TABLETOP_GAME_DIR, "play.sh");
    let godotBin = null;
    if (fs.existsSync(playScript)) {
      godotBin = playScript;
    } else {
      const candidateBins = [
        process.env.GODOT_BIN,
        path.join(process.env.HOME || "", ".local/bin/godot4"),
        path.join(process.env.HOME || "", ".local/bin/godot"),
        path.join(process.env.HOME || "", "apps/godot4"),
        "/usr/bin/godot4",
        "/usr/bin/godot"
      ].filter(Boolean);
      for (const bin of candidateBins) {
        if (fs.existsSync(bin)) {
          godotBin = bin;
          break;
        }
      }
    }

    if (!godotBin) {
      throw new Error("Godot 4 binary or play.sh not found.");
    }

    const spawnArgs = [];
    if (godotBin !== playScript) {
      spawnArgs.push("--path", `"${TABLETOP_GAME_DIR}"`);
    }
    if (launchMode === "new" || launchMode === "fresh") {
      spawnArgs.push("--reset");
    }
    spawnArgs.push("--cartridge", `"${slug}"`);
    if (role === "gm" || role === "dm") {
      spawnArgs.push("--gm");
    } else {
      spawnArgs.push("--player");
    }

    const display = process.env.DISPLAY || ":0";
    const childEnv = {
      ...process.env,
      DISPLAY: display,
      CRPG_CARTRIDGE: slug,
      TABLETOP_CARTRIDGE: slug,
      TABLETOP_ROLE: role,
      TABLETOP_RESET: (launchMode === "new" || launchMode === "fresh") ? "1" : "0"
    };

    const cmd = `"${godotBin}" ${spawnArgs.join(" ")}`;
    console.log(`[robos-tabletop] Launching: ${cmd} on ${display} (Role: ${role}, Mode: ${launchMode})`);

    const child = exec(cmd, { cwd: TABLETOP_GAME_DIR, env: childEnv });
    child.stdout?.on("data", (data) => console.log(`[tabletop-game] ${data}`));
    child.stderr?.on("data", (data) => console.error(`[tabletop-game:err] ${data}`));
    child.on("error", (err) => console.error(`[tabletop-game:proc-err] ${err}`));
    child.on("exit", (code, signal) => {
      console.log(`[tabletop-game:exit] code=${code} signal=${signal}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("tabletop:game-exited", {
          code,
          signal,
          cartridgeSlug: slug,
          role: role,
          launchMode: launchMode
        });
      }
    });

    return {
      success: true,
      pid: child.pid,
      cartridge: slug,
      role: role,
      launchMode: launchMode
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Check Cartridge Quest Status
ipcMain.handle("tabletop:check-cartridge-quest-status", async (_event, slug) => {
  try {
    const cartSlug = (slug || "custom-quest").replace(/\.cartridge\.json$/, "");
    const cartPath = path.join(TABLETOP_GAME_DIR, "cartridges", `${cartSlug}.cartridge.json`);
    if (!fs.existsSync(cartPath)) {
      return { success: false, error: `Cartridge file not found: ${cartPath}` };
    }
    const data = JSON.parse(fs.readFileSync(cartPath, "utf8"));
    return {
      success: true,
      cartridgeSlug: cartSlug,
      quests: data.quests || [],
      header: data.header || {}
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

