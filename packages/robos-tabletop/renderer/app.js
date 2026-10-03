'use strict';

const doorClosedImg = typeof Image !== "undefined" ? new Image() : null;
if (doorClosedImg) doorClosedImg.src = "../assets/door_closed.png";

const doorOpenImg = typeof Image !== "undefined" ? new Image() : null;
if (doorOpenImg) doorOpenImg.src = "../assets/door_open.png";

// AI Generated Furniture & Tile Textures
const FURNITURE_TEXTURES = {};
const TILE_TEXTURES = {};

const FURNITURE_ASSET_MAP = {
  altar: "../assets/furniture/altar.png",
  table: "../assets/furniture/table.png",
  bookcase: "../assets/furniture/bookcase.png",
  bookshelf: "../assets/furniture/bookshelf.png",
  tomb: "../assets/furniture/tomb.png",
  chest: "../assets/furniture/chest.png",
  cupboard: "../assets/furniture/cupboard.png",
  weapons_rack: "../assets/furniture/weapons_rack.png",
  fireplace: "../assets/furniture/fireplace.png",
  throne: "../assets/furniture/throne.png",
  torture_rack: "../assets/furniture/torture_rack.png",
  alchemists_bench: "../assets/furniture/alchemists_bench.png"
};

const TILE_ASSET_MAP = {
  wall_block: "../assets/tiles/wall_block.png",
  stairs: "../assets/tiles/stairs.png",
  pit: "../assets/tiles/trap_pit.png",
  spear: "../assets/tiles/trap_spear.png",
  "falling-block": "../assets/tiles/trap_falling_block.png",
  boulder: "../assets/tiles/boulder.png"
};

if (typeof Image !== "undefined") {
  for (const [k, src] of Object.entries(FURNITURE_ASSET_MAP)) {
    const img = new Image();
    img.src = src;
    FURNITURE_TEXTURES[k] = img;
  }
  for (const [k, src] of Object.entries(TILE_ASSET_MAP)) {
    const img = new Image();
    img.src = src;
    TILE_TEXTURES[k] = img;
  }
}

function getFurnitureImage(type) {
  const clean = (type || '').toLowerCase();
  for (const [k, img] of Object.entries(FURNITURE_TEXTURES)) {
    if (clean.includes(k) || k.includes(clean)) {
      if (img && img.complete && img.naturalWidth > 0) return img;
    }
  }
  return getTileImage(clean);
}

function getTileImage(type) {
  const clean = (type || '').toLowerCase();
  for (const [k, img] of Object.entries(TILE_TEXTURES)) {
    if (clean.includes(k) || k.includes(clean)) {
      if (img && img.complete && img.naturalWidth > 0) return img;
    }
  }
  return null;
}

// RobOS Tabletop Studio Client Application
let currentData = {
  tabletopNodes: [],
  gameNodes: [],
  mapConfigs: [],
  activeMapConfig: null,
  heroes: [],
  monsters: [],
  spells: [],
  spellAllocation: {
    elfElement: 'water',
    wizardElements: ['earth', 'fire', 'air'],
    confirmed: false
  },
  furniture: [],
  doors: [],
  activeHeroId: null,
  activeMonsterId: null,
  campaign: {
    id: 'campaign-heroquest-gathering-storm',
    title: 'HeroQuest: The Gathering Storm',
    description: "The Emperor calls upon the kingdom's greatest champions to defeat the armies of Morcar and the Witch Lord.",
    quests: [
      {
        id: 'quest-1',
        slug: 'heroquest-the-trial',
        title: 'Quest 1: The Trial',
        briefing: 'You have learned well, my apprentices. Now comes your final test. Seek out the foul Orc Warlord Verag in his hidden catacombs, slay him, and return to the stairwell alive.',
        mapConfigId: 'fan-dungeon-28x21',
        ruleset: 'heroquest',
        goldReward: 100,
        bossTarget: 'verag-boss',
        completed: false,
        startingStairs: [0, 1],
        activeRooms: new Set(),
        wallBlocks: [
          { id: 'block-1', x: 12, y: 0, type: 'single', width: 1, height: 1 },
          { id: 'block-2', x: 12, y: 20, type: 'single', width: 1, height: 1 },
          { id: 'block-double-v', x: 0, y: 10, type: 'double-v', width: 1, height: 2 },
          { id: 'block-double-h', x: 26, y: 10, type: 'double-h', width: 2, height: 1 }
        ],
        doors: [],
        furniture: [
          { id: 'furn-altar-1', name: "Sorcerer's Altar / Desk", type: 'altar', x: 14, y: 8, width: 2, height: 2, roomId: 'room-center-mid' },
          { id: 'furn-bookcase-1', name: 'Grand Bookcase', type: 'bookcase', x: 13, y: 3, width: 3, height: 1, roomId: 'room-center-n' },
          { id: 'furn-bookshelf-1', name: 'Study Bookshelf', type: 'bookshelf', x: 23, y: 5, width: 2, height: 1, roomId: 'room-e-parlor' },
          { id: 'furn-boulder-1', name: 'Fossil Boulder Tile', type: 'boulder', x: 2, y: 7, width: 1, height: 1, roomId: 'room-grand-fossil' },
          { id: 'furn-tomb-1', name: 'Ancient Stone Tomb', type: 'tomb', x: 5, y: 2, width: 2, height: 2, roomId: 'room-nw-crypt' },
          { id: 'furn-chest-1', name: 'Vault Chest of Gold', type: 'chest', x: 23, y: 2, width: 1, height: 1, roomId: 'room-ne-vault' },
          { id: 'furn-table-1', name: 'Council Table', type: 'table', x: 14, y: 14, width: 2, height: 2, roomId: 'room-center-s' },
          { id: 'furn-rack-1', name: 'Weapons Rack', type: 'weapons-rack', x: 8, y: 2, width: 3, height: 1, roomId: 'room-n-armory' }
        ],
        monsters: [
          { id: 'mon-verag', name: 'Verag the Orc Warlord', monsterType: 'verag-boss', x: 4, y: 10, bp: 4, atk: 4, def: 4, isBoss: true, roomId: 'room-grand-fossil' },
          { id: 'mon-skel-1', name: 'Crypt Skeleton', monsterType: 'skeleton-1', x: 3, y: 4, bp: 1, atk: 2, def: 2, isBoss: false, roomId: 'room-nw-crypt' },
          { id: 'mon-skel-2', name: 'Crypt Skeleton', monsterType: 'skeleton-2', x: 5, y: 4, bp: 1, atk: 2, def: 2, isBoss: false, roomId: 'room-nw-crypt' },
          { id: 'mon-zombie-1', name: 'Cellar Zombie', monsterType: 'zombie-1', x: 4, y: 16, bp: 2, atk: 3, def: 3, isBoss: false, roomId: 'room-sw-cellar' },
          { id: 'mon-orc-1', name: 'Orc Guard', monsterType: 'orc-warrior-1', x: 14, y: 11, bp: 1, atk: 3, def: 2, isBoss: false, roomId: 'room-center-mid' },
          { id: 'mon-goblin-1', name: 'Goblin Scout', monsterType: 'goblin-scout-1', x: 15, y: 11, bp: 1, atk: 2, def: 1, isBoss: false, roomId: 'room-center-mid' }
        ],
        traps: [
          { id: 'trap-pit-1', trapType: 'pit', x: 0, y: 5, damageDice: 1, detected: false, disarmed: false },
          { id: 'trap-boulder-1', trapType: 'boulder', x: 7, y: 5, damageDice: 3, detected: false, disarmed: false },
          { id: 'trap-falling-1', trapType: 'falling-block', x: 21, y: 10, damageDice: 3, detected: false, disarmed: false }
        ]
      },
      {
        id: 'quest-2',
        slug: 'heroquest-rescue-sir-ragnar',
        title: 'Quest 2: The Rescue of Sir Ragnar',
        briefing: "Sir Ragnar, one of the Emperor's most trusted knights, has been captured by the Greenskins. Infiltrate the fortress prison, locate his cell, and escort him safely to the surface.",
        mapConfigId: 'heroquest-classic',
        ruleset: 'heroquest',
        goldReward: 200,
        bossTarget: 'orc-jailer-boss',
        completed: false,
        startingStairs: [1, 1],
        activeRooms: new Set(),
        wallBlocks: [
          { id: 'block-r-1', x: 12, y: 0, type: 'single', width: 1, height: 1 },
          { id: 'block-r-2', x: 12, y: 18, type: 'single', width: 1, height: 1 }
        ],
        doors: [],
        furniture: [
          { id: 'furn-torture-1', name: 'Iron Torture Rack', type: 'weapons-rack', x: 13, y: 9, width: 3, height: 1, roomId: 'room-center' },
          { id: 'furn-chest-ragnar', name: "Jailer's Iron Strongbox", type: 'chest', x: 20, y: 3, width: 1, height: 1, roomId: 'room-ne-armory' }
        ],
        monsters: [
          { id: 'mon-jailer', name: 'Gorg the Orc Jailer', monsterType: 'orc-warrior-1', x: 13, y: 8, bp: 3, atk: 3, def: 3, isBoss: true, roomId: 'room-center' },
          { id: 'mon-guard-1', name: 'Goblin Warden', monsterType: 'goblin-scout-1', x: 14, y: 8, bp: 1, atk: 2, def: 1, isBoss: false, roomId: 'room-center' },
          { id: 'mon-guard-2', name: 'Goblin Warden', monsterType: 'goblin-scout-1', x: 12, y: 8, bp: 1, atk: 2, def: 1, isBoss: false, roomId: 'room-center' }
        ],
        traps: [
          { id: 'trap-pit-r-1', trapType: 'pit', x: 10, y: 5, damageDice: 1, detected: false, disarmed: false }
        ]
      },
      {
        id: 'quest-3',
        slug: 'heroquest-lair-orc-warlord',
        title: 'Quest 3: Lair of the Orc Warlord',
        briefing: 'Deep within the sunken caverns lies the seat of the Orc Chieftain Ulag. Purge his foul guards, shatter his command throne, and reclaim the stolen royal treasure.',
        mapConfigId: 'first-light-caverns',
        ruleset: 'heroquest',
        goldReward: 250,
        bossTarget: 'ulag-warlord',
        completed: false,
        startingStairs: [1, 1],
        activeRooms: new Set(),
        wallBlocks: [
          { id: 'block-u-1', x: 12, y: 0, type: 'single', width: 1, height: 1 }
        ],
        doors: [],
        furniture: [
          { id: 'furn-throne-1', name: 'Warlord Throne', type: 'altar', x: 13, y: 9, width: 3, height: 2, roomId: 'room-center' },
          { id: 'furn-cavern-boulder', name: 'Massive Stalagmite', type: 'boulder', x: 5, y: 5, width: 1, height: 1, roomId: 'room-cavern' }
        ],
        monsters: [
          { id: 'mon-ulag', name: 'Ulag the Orc Chieftain', monsterType: 'verag-boss', x: 13, y: 10, bp: 5, atk: 4, def: 5, isBoss: true, roomId: 'room-center' },
          { id: 'mon-fimir-1', name: 'Swamp Fimir Mystic', monsterType: 'zombie-1', x: 15, y: 9, bp: 2, atk: 3, def: 3, isBoss: false, roomId: 'room-center' }
        ],
        traps: [
          { id: 'trap-cave-in', trapType: 'falling-block', x: 12, y: 7, damageDice: 3, detected: false, disarmed: false }
        ]
      }
    ]
  },
  currentQuestIndex: 0,
  currentQuest: null,
  activeTool: 'inspect',
  selectedSquare: null,
  selectedEntity: null,
  hoverSquare: null,
  zoom: 1.0,
  boardImage: null,
  calibration: {
    insetLeft: 0,
    insetTop: 0,
    insetRight: 0,
    insetBottom: 0,
    gridOpacity: 0.85,
    artOpacity: 1.0,
    showCoords: true,
    showRooms: true,
    showWalls: true
  }
};
currentData.currentQuest = currentData.campaign.quests[0];

// DOM references
const statusBar = document.getElementById("status-text");

function setStatus(msg) {
  if (statusBar) statusBar.textContent = msg;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Setup Main Navigation Tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

    btn.classList.add("active");
    const target = btn.dataset.tab;
    const pane = document.getElementById(target);
    if (pane) pane.classList.add("active");

    if (target === "tab-board") {
      drawBoard();
    }
  });
});

// Setup Tool Palette buttons
document.querySelectorAll("#tool-palette .btn-tool").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#tool-palette .btn-tool").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentData.activeTool = btn.dataset.tool;

    // Show/hide relevant subtool dropdowns
    document.getElementById("select-door-type").style.display = currentData.activeTool === "door" ? "inline-block" : "none";
    document.getElementById("select-block-type").style.display = currentData.activeTool === "wall-block" ? "inline-block" : "none";
    document.getElementById("select-furniture-type").style.display = currentData.activeTool === "furniture" ? "inline-block" : "none";
    document.getElementById("select-monster-type").style.display = currentData.activeTool === "monster" ? "inline-block" : "none";
    document.getElementById("select-trap-type").style.display = currentData.activeTool === "trap" ? "inline-block" : "none";

    setStatus(`Selected Tool: ${currentData.activeTool.toUpperCase()}`);
    drawBoard();
  });
});

// Setup Mini-Tabs in Right Panel
document.querySelectorAll(".mini-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".mini-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    renderMiniList(tab.dataset.mini);
  });
});

// Calibration Drawer Toggle
document.getElementById("btn-toggle-calibration")?.addEventListener("click", () => {
  const drawer = document.getElementById("calibration-drawer");
  if (!drawer) return;
  drawer.style.display = drawer.style.display === "none" ? "block" : "none";
});

// Calibration Controls Bindings
function setupCalibrationControls() {
  const bindSlider = (id, prop, valId, isPercent = false) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (!el) return;
    el.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (isPercent) {
        currentData.calibration[prop] = v / 100.0;
        if (valEl) valEl.textContent = `${v}%`;
      } else {
        currentData.calibration[prop] = v;
        if (valEl) valEl.textContent = `${v}`;
      }
      drawBoard();
    });
  };

  bindSlider("cal-inset-left", "insetLeft", "val-inset-left");
  bindSlider("cal-inset-top", "insetTop", "val-inset-top");
  bindSlider("cal-inset-right", "insetRight", "val-inset-right");
  bindSlider("cal-inset-bottom", "insetBottom", "val-inset-bottom");
  bindSlider("cal-grid-opacity", "gridOpacity", "val-grid-opacity", true);
  bindSlider("cal-art-opacity", "artOpacity", "val-art-opacity", true);

  document.getElementById("cal-show-coords")?.addEventListener("change", (e) => {
    currentData.calibration.showCoords = e.target.checked;
    drawBoard();
  });
  document.getElementById("cal-show-room-outlines")?.addEventListener("change", (e) => {
    currentData.calibration.showRooms = e.target.checked;
    drawBoard();
  });
  document.getElementById("cal-show-wall-outlines")?.addEventListener("change", (e) => {
    currentData.calibration.showWalls = e.target.checked;
    drawBoard();
  });

  document.getElementById("btn-reset-calibration")?.addEventListener("click", () => {
    if (!currentData.activeMapConfig) return;
    const def = currentData.activeMapConfig.calibration || {};
    currentData.calibration.insetLeft = def.insetLeft || 82;
    currentData.calibration.insetTop = def.insetTop || 65;
    currentData.calibration.insetRight = def.insetRight || 78;
    currentData.calibration.insetBottom = def.insetBottom || 43;
    currentData.calibration.gridOpacity = 0.85;
    currentData.calibration.artOpacity = 1.0;

    document.getElementById("cal-inset-left").value = currentData.calibration.insetLeft;
    document.getElementById("val-inset-left").textContent = currentData.calibration.insetLeft;
    document.getElementById("cal-inset-top").value = currentData.calibration.insetTop;
    document.getElementById("val-inset-top").textContent = currentData.calibration.insetTop;
    document.getElementById("cal-inset-right").value = currentData.calibration.insetRight;
    document.getElementById("val-inset-right").textContent = currentData.calibration.insetRight;
    document.getElementById("cal-inset-bottom").value = currentData.calibration.insetBottom;
    document.getElementById("val-inset-bottom").textContent = currentData.calibration.insetBottom;
    document.getElementById("cal-grid-opacity").value = 85;
    document.getElementById("val-grid-opacity").textContent = "85%";
    document.getElementById("cal-art-opacity").value = 100;
    document.getElementById("val-art-opacity").textContent = "100%";

    drawBoard();
    setStatus("Reset calibration to map configuration defaults.");
  });

  document.getElementById("btn-export-snapshot")?.addEventListener("click", exportCanvasSnapshot);
}

// Zoom controls
document.getElementById("btn-zoom-in")?.addEventListener("click", () => {
  currentData.zoom = Math.min(2.5, currentData.zoom + 0.15);
  updateZoomDisplay();
});
document.getElementById("btn-zoom-out")?.addEventListener("click", () => {
  currentData.zoom = Math.max(0.5, currentData.zoom - 0.15);
  updateZoomDisplay();
});
document.getElementById("btn-zoom-reset")?.addEventListener("click", () => {
  currentData.zoom = 1.0;
  updateZoomDisplay();
});

function updateZoomDisplay() {
  const canvas = document.getElementById("board-canvas");
  const badge = document.getElementById("zoom-text");
  if (badge) badge.textContent = `${Math.round(currentData.zoom * 100)}%`;
  if (canvas) {
    canvas.style.transform = `scale(${currentData.zoom})`;
    canvas.style.transformOrigin = "top center";
  }
}

// Map Configuration Switcher (Board & Map Studio)
document.getElementById("map-config-select")?.addEventListener("change", async (e) => {
  const configId = e.target.value;
  await switchMapConfiguration(configId);
});

// Map Theme Switcher (Campaign Editor)
document.getElementById("quest-bg-ref")?.addEventListener("change", async (e) => {
  const configId = e.target.value;
  await switchMapConfiguration(configId, false);
  if (typeof renderCampaignQuestsList === "function") {
    renderCampaignQuestsList();
  }
});

async function switchMapConfiguration(configId, preserveQuestEntities = false) {
  const config = currentData.mapConfigs?.find(c => c.id === configId);
  if (!config) return;

  currentData.activeMapConfig = config;
  if (currentData.currentQuest) {
    currentData.currentQuest.mapConfigId = config.id;
  }

  // Synchronize dropdowns across Campaign Editor and Board Studio
  const mapSelect = document.getElementById("map-config-select");
  const questBgSelect = document.getElementById("quest-bg-ref");
  if (mapSelect && mapSelect.value !== config.id) mapSelect.value = config.id;
  if (questBgSelect && questBgSelect.value !== config.id) questBgSelect.value = config.id;

  // Update Campaign Editor Theme Metadata Badges
  const dimsEl = document.getElementById("quest-bg-dims");
  const roomsEl = document.getElementById("quest-bg-rooms");
  const calibEl = document.getElementById("quest-bg-calib");
  if (dimsEl && config.gridDimensions) dimsEl.textContent = `${config.gridDimensions[0]} × ${config.gridDimensions[1]} squares`;
  if (roomsEl) roomsEl.textContent = `${(config.rooms || []).length} active rooms`;
  if (calibEl) calibEl.textContent = `Inset: ${config.calibration?.insetLeft || 0}px`;

  // Apply default calibration for this map
  if (config.calibration) {
    currentData.calibration.insetLeft = Number.isFinite(config.calibration.insetLeft) ? config.calibration.insetLeft : 0;
    currentData.calibration.insetTop = Number.isFinite(config.calibration.insetTop) ? config.calibration.insetTop : 0;
    currentData.calibration.insetRight = Number.isFinite(config.calibration.insetRight) ? config.calibration.insetRight : 0;
    currentData.calibration.insetBottom = Number.isFinite(config.calibration.insetBottom) ? config.calibration.insetBottom : 0;

    const inL = document.getElementById("cal-inset-left");
    const valL = document.getElementById("val-inset-left");
    if (inL) inL.value = currentData.calibration.insetLeft;
    if (valL) valL.textContent = currentData.calibration.insetLeft;

    const inT = document.getElementById("cal-inset-top");
    const valT = document.getElementById("val-inset-top");
    if (inT) inT.value = currentData.calibration.insetTop;
    if (valT) valT.textContent = currentData.calibration.insetTop;

    const inR = document.getElementById("cal-inset-right");
    const valR = document.getElementById("val-inset-right");
    if (inR) inR.value = currentData.calibration.insetRight;
    if (valR) valR.textContent = currentData.calibration.insetRight;

    const inB = document.getElementById("cal-inset-bottom");
    const valB = document.getElementById("val-inset-bottom");
    if (inB) inB.value = currentData.calibration.insetBottom;
    if (valB) valB.textContent = currentData.calibration.insetBottom;
  }

  if (currentData.currentQuest) {
    if (!preserveQuestEntities) {
      // Populate active rooms
      currentData.currentQuest.activeRooms = new Set((config.rooms || []).map(r => r.id));

      // Initialize doors
      currentData.currentQuest.doors = (config.doors || []).map(d => ({
        id: d.id,
        from: [...d.from],
        to: [...d.to],
        state: 'closed',
        room: d.room
      }));

      // Update starting stair
      if (config.defaultStartingStair) {
        currentData.currentQuest.startingStairs = [...config.defaultStartingStair];
      }
    } else {
      if (!currentData.currentQuest.activeRooms || !(currentData.currentQuest.activeRooms instanceof Set) || currentData.currentQuest.activeRooms.size === 0) {
        currentData.currentQuest.activeRooms = new Set((config.rooms || []).map(r => r.id));
      }
      if (!currentData.currentQuest.doors || currentData.currentQuest.doors.length === 0) {
        currentData.currentQuest.doors = (config.doors || []).map(d => ({
          id: d.id,
          from: [...d.from],
          to: [...d.to],
          state: 'closed',
          room: d.room
        }));
      }
      if (!currentData.currentQuest.startingStairs && config.defaultStartingStair) {
        currentData.currentQuest.startingStairs = [...config.defaultStartingStair];
      }
    }
  }

  setStatus(`Loading artwork for ${config.title}...`);
  await loadBoardArtwork(config.localImageFile || config.backgroundImage);
  updateSummaryStats();
  drawBoard();
  setStatus(`Active Map Configuration: ${config.title}`);
}

async function loadBoardArtwork(relPath) {
  currentData.boardImage = null;
  currentData.boardImageLoading = true;
  try {
    const res = await window.robosTabletop.getBoardImage(relPath);
    if (res.success && res.dataUrl) {
      const img = new Image();
      img.onload = () => {
        currentData.boardImage = img;
        currentData.boardImageLoading = false;
        const canvas = document.getElementById("board-canvas");
        if (canvas && img.naturalWidth && img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        drawBoard();
      };
      img.src = res.dataUrl;
    } else {
      console.warn("Could not load board image:", res.error);
      currentData.boardImageLoading = false;
      drawBoard();
    }
  } catch (err) {
    console.error("Failed to fetch board image:", err);
    currentData.boardImageLoading = false;
    drawBoard();
  }
}

// Calculate Inner Playable Grid Bounds
function getGridMetrics() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return null;
  const w = canvas.width;
  const h = canvas.height;

  const [cols, rows] = currentData.activeMapConfig?.gridDimensions || [26, 19];
  const insetL = currentData.calibration.insetLeft;
  const insetT = currentData.calibration.insetTop;
  const insetR = currentData.calibration.insetRight;
  const insetB = currentData.calibration.insetBottom;

  const innerW = w - insetL - insetR;
  const innerH = h - insetT - insetB;

  const cellW = innerW / cols;
  const cellH = innerH / rows;

  return {
    w, h,
    cols, rows,
    insetL, insetT, insetR, insetB,
    innerW, innerH,
    cellW, cellH
  };
}

// Export high-resolution PNG snapshot
async function exportCanvasSnapshot() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return;
  const dataUrl = canvas.toDataURL("image/png");
  const filename = `tabletop-quest-${currentData.activeMapConfig?.id || 'grid'}-${Date.now()}.png`;

  setStatus("Exporting canvas snapshot...");
  const res = await window.robosTabletop.saveBoardSnapshot({ dataUrl, filename });
  if (res.success) {
    setStatus(`Saved snapshot: ${res.filePath}`);
  } else {
    setStatus("Snapshot export error: " + res.error);
  }
}

// Initialize Board Events
function initBoard() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return;

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const m = getGridMetrics();
    if (!m) return;

    if (mouseX >= m.insetL && mouseX <= m.w - m.insetR &&
        mouseY >= m.insetT && mouseY <= m.h - m.insetB) {
      const col = Math.floor((mouseX - m.insetL) / m.cellW);
      const row = Math.floor((mouseY - m.insetT) / m.cellH);

      if (col >= 0 && col < m.cols && row >= 0 && row < m.rows) {
        currentData.hoverSquare = { col, row };
        const room = findRoomAt(col, row);
        const colLetter = String.fromCharCode(65 + (col % 26));
        const squareId = `${colLetter}-${row + 1}`;
        const roomName = room ? room.name : "Outer Corridor";
        const isActive = room ? currentData.currentQuest.activeRooms.has(room.id) : true;

        const hoverBadge = document.getElementById("board-hover-coords");
        if (hoverBadge) {
          hoverBadge.textContent = `Square: ${squareId} [${col}, ${row}] | ${roomName} ${isActive ? '' : '(Inactive)'}`;
        }
        drawBoard();
        return;
      }
    }
    currentData.hoverSquare = null;
    drawBoard();
  });

  canvas.addEventListener("mouseleave", () => {
    currentData.hoverSquare = null;
    drawBoard();
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const m = getGridMetrics();
    if (!m) return;

    if (mouseX >= m.insetL && mouseX <= m.w - m.insetR &&
        mouseY >= m.insetT && mouseY <= m.h - m.insetB) {
      const col = Math.floor((mouseX - m.insetL) / m.cellW);
      const row = Math.floor((mouseY - m.insetT) / m.cellH);
      handleSquareClick(col, row);
    }
  });

  setupCalibrationControls();
}

function findRoomAt(col, row) {
  if (!currentData.activeMapConfig) return null;
  return (currentData.activeMapConfig.rooms || []).find(r => {
    return col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h;
  }) || null;
}

// Helper dimensions & coverage checks for multi-tile items
function getBlockDimensions(b) {
  const type = b.type || 'single';
  const w = b.width || (type === 'double-h' ? 2 : 1);
  const h = b.height || (type === 'double-v' ? 2 : 1);
  return { w, h };
}

function isBlockCovering(b, col, row) {
  const { w, h } = getBlockDimensions(b);
  return col >= b.x && col < b.x + w && row >= b.y && row < b.y + h;
}

function getFurnitureDimensions(f) {
  if (f.width && f.height) return { w: f.width, h: f.height };
  const type = f.type || '';
  if (type === 'bookcase' || type === 'bookcase-3x1' || type === 'weapons-rack' || type === 'weapons-rack-3x1' || type === 'fireplace') return { w: 3, h: 1 };
  if (type === 'bookcase-1x3' || type === 'weapons-rack-1x3') return { w: 1, h: 3 };
  if (type === 'bookshelf' || type === 'bookshelf-2x1' || type === 'cupboard' || type === 'cupboard-2x1') return { w: 2, h: 1 };
  if (type === 'bookshelf-1x2' || type === 'cupboard-1x2') return { w: 1, h: 2 };
  if (type === 'altar' || type === 'altar-3x2' || type === 'table' || type === 'table-3x2' || type === 'alchemists-bench' || type === 'torture-rack') return { w: 3, h: 2 };
  if (type === 'altar-2x3' || type === 'table-2x3' || type === 'tomb') return { w: 2, h: 3 };
  if (type === 'boulder-2x2') return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}

function isFurnitureCovering(f, col, row) {
  const { w, h } = getFurnitureDimensions(f);
  return col >= f.x && col < f.x + w && row >= f.y && row < f.y + h;
}

function getTrapDimensions(t) {
  const type = typeof t === 'string' ? t : (t.trapType || '');
  if (type === 'boulder-2x2') return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}

function isTrapCovering(t, col, row) {
  const { w, h } = getTrapDimensions(t);
  return col >= t.x && col < t.x + w && row >= t.y && row < t.y + h;
}

// ========================================================
// MAP HISTORY & UNDO / REDO CONTROLLER
// ========================================================
const MAX_MAP_HISTORY = 50;
const mapUndoStack = [];
const mapRedoStack = [];

function getQuestSnapshot() {
  const q = currentData.currentQuest;
  return {
    activeRooms: Array.from(q.activeRooms),
    doors: JSON.parse(JSON.stringify(q.doors || [])),
    wallBlocks: JSON.parse(JSON.stringify(q.wallBlocks || [])),
    furniture: JSON.parse(JSON.stringify(q.furniture || [])),
    monsters: JSON.parse(JSON.stringify(q.monsters || [])),
    traps: JSON.parse(JSON.stringify(q.traps || [])),
    startingStairs: [...(q.startingStairs || [0, 1])]
  };
}

function updateUndoRedoUI() {
  const btnUndo = document.getElementById("btn-map-undo");
  const btnRedo = document.getElementById("btn-map-redo");
  if (btnUndo) btnUndo.disabled = mapUndoStack.length === 0;
  if (btnRedo) btnRedo.disabled = mapRedoStack.length === 0;
}

function pushUndoState() {
  mapUndoStack.push(getQuestSnapshot());
  if (mapUndoStack.length > MAX_MAP_HISTORY) {
    mapUndoStack.shift();
  }
  mapRedoStack.length = 0;
  updateUndoRedoUI();
}

function applySnapshot(snapshot) {
  const q = currentData.currentQuest;
  q.activeRooms = new Set(snapshot.activeRooms || []);
  q.doors = JSON.parse(JSON.stringify(snapshot.doors || []));
  q.wallBlocks = JSON.parse(JSON.stringify(snapshot.wallBlocks || []));
  q.furniture = JSON.parse(JSON.stringify(snapshot.furniture || []));
  q.monsters = JSON.parse(JSON.stringify(snapshot.monsters || []));
  q.traps = JSON.parse(JSON.stringify(snapshot.traps || []));
  q.startingStairs = [...(snapshot.startingStairs || [0, 1])];

  updateSummaryStats();
  renderMiniList();
  drawBoard();
  if (currentData.selectedSquare) {
    inspectSquare(currentData.selectedSquare.col, currentData.selectedSquare.row);
  }
}

function undoMapAction() {
  if (mapUndoStack.length === 0) return;
  const currentSnapshot = getQuestSnapshot();
  mapRedoStack.push(currentSnapshot);
  const prevSnapshot = mapUndoStack.pop();
  applySnapshot(prevSnapshot);
  updateUndoRedoUI();
  setStatus("Undid last map action. (Ctrl+Z)");
}

function redoMapAction() {
  if (mapRedoStack.length === 0) return;
  const currentSnapshot = getQuestSnapshot();
  mapUndoStack.push(currentSnapshot);
  const nextSnapshot = mapRedoStack.pop();
  applySnapshot(nextSnapshot);
  updateUndoRedoUI();
  setStatus("Redid last map action. (Ctrl+Y)");
}

// Handle Editor Tool Clicks
function handleSquareClick(col, row) {
  const tool = currentData.activeTool;
  const room = findRoomAt(col, row);
  const roomId = room ? room.id : 'corridor';

  currentData.selectedSquare = { col, row };

  if (tool === 'inspect') {
    inspectSquare(col, row);
    drawBoard();
    return;
  }

  // Record undo snapshot before applying any modification
  pushUndoState();

  if (tool === 'room-toggle') {
    if (room) {
      if (currentData.currentQuest.activeRooms.has(room.id)) {
        currentData.currentQuest.activeRooms.delete(room.id);
        setStatus(`Deactivated room: ${room.name}`);
      } else {
        currentData.currentQuest.activeRooms.add(room.id);
        setStatus(`Activated room: ${room.name}`);
      }
    } else {
      setStatus(`Clicked outer corridor at [${col}, ${row}]`);
    }
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'stairs') {
    currentData.currentQuest.startingStairs = [col, row];
    setStatus(`Placed player starting stairs at [${col}, ${row}]`);
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'erase') {
    eraseAt(col, row, true);
    return;
  }

  if (tool === 'wall-block') {
    const blockType = document.getElementById("select-block-type")?.value || '1-tile-wall';
    const isDoubleH = blockType === '2-tile-wall-h';
    const isDoubleV = blockType === '2-tile-wall-v';
    const width = isDoubleH ? 2 : 1;
    const height = isDoubleV ? 2 : 1;
    const type = isDoubleH ? 'double-h' : (isDoubleV ? 'double-v' : 'single');

    const existingIdx = currentData.currentQuest.wallBlocks.findIndex(b => isBlockCovering(b, col, row));
    if (existingIdx >= 0) {
      currentData.currentQuest.wallBlocks.splice(existingIdx, 1);
      setStatus(`Removed wall block covering [${col}, ${row}]`);
    } else {
      currentData.currentQuest.wallBlocks.push({
        id: `block-${col}-${row}`,
        x: col,
        y: row,
        type,
        width,
        height
      });
      setStatus(`Placed ${width}×${height} ${type === 'single' ? '1-Tile Wall Block' : '2-Tile Wall Block'} at [${col}, ${row}]`);
    }
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'furniture') {
    const furnType = document.getElementById("select-furniture-type").value || 'chest';
    const furnName = document.getElementById("select-furniture-type").selectedOptions[0]?.text || furnType;
    const dims = getFurnitureDimensions({ type: furnType });

    // Remove any existing furniture covering this square
    currentData.currentQuest.furniture = currentData.currentQuest.furniture.filter(f => !isFurnitureCovering(f, col, row));
    currentData.currentQuest.furniture.push({
      id: `furn-${furnType}-${col}-${row}`,
      name: furnName.split('(')[0].trim(),
      type: furnType,
      x: col,
      y: row,
      width: dims.w,
      height: dims.h,
      roomId
    });
    setStatus(`Placed ${furnName} at [${col}, ${row}] (${dims.w}×${dims.h} tiles)`);
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'monster') {
    const monId = document.getElementById("select-monster-type").value || 'goblin-scout-1';
    const monName = document.getElementById("select-monster-type").selectedOptions[0]?.text || monId;
    const isBoss = monId.includes('boss');
    currentData.currentQuest.monsters = currentData.currentQuest.monsters.filter(m => !(m.x === col && m.y === row));
    currentData.currentQuest.monsters.push({
      id: `mon-${monId}-${col}-${row}`,
      name: monName.split('(')[0].trim(),
      monsterType: monId,
      x: col,
      y: row,
      bp: isBoss ? 3 : (monId.includes('fimir') || monId.includes('mummy') ? 2 : 1),
      atk: isBoss ? 4 : (monId.includes('orc') || monId.includes('chaos') ? 3 : 2),
      def: isBoss ? 3 : 2,
      isBoss,
      roomId
    });
    setStatus(`Placed ${monName} at [${col}, ${row}]`);
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'trap') {
    const trapType = document.getElementById("select-trap-type").value || 'pit';
    const trapName = document.getElementById("select-trap-type").selectedOptions[0]?.text || trapType;
    const dims = getTrapDimensions(trapType);
    currentData.currentQuest.traps = currentData.currentQuest.traps.filter(t => !isTrapCovering(t, col, row));
    currentData.currentQuest.traps.push({
      id: `trap-${trapType}-${col}-${row}`,
      name: trapName.split('(')[0].trim(),
      trapType,
      x: col,
      y: row,
      width: dims.w,
      height: dims.h,
      damageDice: (trapType === 'falling-block' || trapType.startsWith('boulder')) ? 3 : (trapType === 'spear' ? 2 : 1),
      detected: false,
      disarmed: false
    });
    setStatus(`Placed ${trapName} at [${col}, ${row}]`);
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'door') {
    const doorState = document.getElementById("select-door-type").value || 'closed';
    // Toggle door or cycle door state
    const existingDoor = currentData.currentQuest.doors.find(d => {
      return (d.from[0] === col && d.from[1] === row) || (d.to[0] === col && d.to[1] === row);
    });

    if (existingDoor) {
      if (existingDoor.state === 'closed') existingDoor.state = 'open';
      else if (existingDoor.state === 'open') existingDoor.state = 'secret';
      else currentData.currentQuest.doors = currentData.currentQuest.doors.filter(d => d !== existingDoor);
      setStatus(`Toggled door state`);
    } else {
      currentData.currentQuest.doors.push({
        id: `door-${col}-${row}`,
        from: [col, row],
        to: [col, row + 1],
        state: doorState,
        room: roomId
      });
      setStatus(`Placed ${doorState} door at [${col}, ${row}]`);
    }
    updateSummaryStats();
    drawBoard();
  }
}

function eraseAt(col, row, skipPushUndo = false) {
  if (!skipPushUndo) {
    pushUndoState();
  }
  currentData.currentQuest.wallBlocks = currentData.currentQuest.wallBlocks.filter(b => !isBlockCovering(b, col, row));
  currentData.currentQuest.furniture = currentData.currentQuest.furniture.filter(f => !isFurnitureCovering(f, col, row));
  currentData.currentQuest.monsters = currentData.currentQuest.monsters.filter(m => !(m.x === col && m.y === row));
  currentData.currentQuest.traps = currentData.currentQuest.traps.filter(t => !isTrapCovering(t, col, row));
  currentData.currentQuest.doors = currentData.currentQuest.doors.filter(d => {
    return !(d.from[0] === col && d.from[1] === row) && !(d.to[0] === col && d.to[1] === row);
  });
  setStatus(`Erased items covering [${col}, ${row}]`);
  updateSummaryStats();
  renderMiniList();
  drawBoard();
  if (currentData.selectedSquare && currentData.selectedSquare.col === col && currentData.selectedSquare.row === row) {
    inspectSquare(col, row);
  }
}

function inspectSquare(col, row) {
  const room = findRoomAt(col, row);
  const colLetter = String.fromCharCode(65 + (col % 26));
  const squareId = `${colLetter}-${row + 1}`;

  const block = currentData.currentQuest.wallBlocks.find(b => isBlockCovering(b, col, row));
  const furn = currentData.currentQuest.furniture.find(f => isFurnitureCovering(f, col, row));
  const mon = currentData.currentQuest.monsters.find(m => m.x === col && m.y === row);
  const trap = currentData.currentQuest.traps.find(t => isTrapCovering(t, col, row));
  const door = currentData.currentQuest.doors.find(d => (d.from[0] === col && d.from[1] === row) || (d.to[0] === col && d.to[1] === row));
  const isStairs = currentData.currentQuest.startingStairs[0] === col && currentData.currentQuest.startingStairs[1] === row;

  const inspector = document.getElementById("inspector-body");
  if (!inspector) return;

  let html = `
    <div class="entity-badge-large">
      <span class="badge">${squareId} [${col}, ${row}]</span>
      <span>${room ? room.name : 'Corridor'}</span>
    </div>
    <p><strong>Room Status:</strong> ${room ? (currentData.currentQuest.activeRooms.has(room.id) ? '<span style="color:#22c55e">Active</span>' : '<span style="color:#ef4444">Inactive</span>') : 'Corridor'}</p>
  `;

  if (isStairs) {
    html += `<div class="stat-pill" style="margin-top:6px;"><span>🏁 <strong>Player Starting Stairs</strong></span></div>`;
  }
  if (block) {
    const bDims = getBlockDimensions(block);
    const blockLabel = bDims.w === 1 && bDims.h === 1 ? '1-Tile Wall Block' : (bDims.w === 2 ? '2-Tile Wall Block (Horizontal)' : '2-Tile Wall Block (Vertical)');
    html += `<div class="stat-pill" style="margin-top:6px;"><span>🧱 <strong>${blockLabel}</strong> (${bDims.w}×${bDims.h})</span><button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button></div>`;
  }
  if (furn) {
    const fDims = getFurnitureDimensions(furn);
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span>📦 <strong>${furn.name}</strong> (${fDims.w}×${fDims.h} ${furn.type})</span>
        <button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button>
      </div>`;
  }
  if (mon) {
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span>👹 <strong>${mon.name}</strong> ${mon.isBoss ? '[BOSS]' : ''} | BP: ${mon.bp}, Atk: ${mon.atk}</span>
        <button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button>
      </div>`;
  }
  if (trap) {
    const tDims = getTrapDimensions(trap);
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span>⚠️ <strong>${(trap.name || trap.trapType).toUpperCase()}</strong> (${tDims.w}×${tDims.h} | ${trap.damageDice} dice)</span>
        <button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button>
      </div>`;
  }
  if (door) {
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span>🚪 <strong>Door (${door.state.toUpperCase()})</strong></span>
        <button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button>
      </div>`;
  }

  if (!block && !furn && !mon && !trap && !door && !isStairs) {
    html += `<p class="text-muted" style="margin-top:8px;">Empty playable tile.</p>`;
  }

  inspector.innerHTML = html;
}

// Update summary stats
function updateSummaryStats() {
  const q = currentData.currentQuest;
  const totalRooms = currentData.activeMapConfig?.rooms?.length || 17;
  const activeCount = q.activeRooms.size;

  const elRooms = document.getElementById("summary-active-rooms");
  if (elRooms) elRooms.textContent = `${activeCount} / ${totalRooms}`;

  const elBlocks = document.getElementById("summary-wall-blocks");
  if (elBlocks) elBlocks.textContent = `${q.wallBlocks.length}`;

  const elDoors = document.getElementById("summary-doors");
  if (elDoors) elDoors.textContent = `${q.doors.length}`;

  const elFurn = document.getElementById("summary-furniture");
  if (elFurn) elFurn.textContent = `${q.furniture.length}`;

  const elMon = document.getElementById("summary-monsters");
  if (elMon) elMon.textContent = `${q.monsters.length}`;

  const elTraps = document.getElementById("summary-traps");
  if (elTraps) elTraps.textContent = `${q.traps.length}`;

  // Mini counts
  const cDoors = document.getElementById("count-doors");
  if (cDoors) cDoors.textContent = q.doors.length;
  const cBlocks = document.getElementById("count-blocks");
  if (cBlocks) cBlocks.textContent = q.wallBlocks.length;
  const cFurn = document.getElementById("count-furn");
  if (cFurn) cFurn.textContent = q.furniture.length;
  const cMon = document.getElementById("count-monsters");
  if (cMon) cMon.textContent = q.monsters.length;
  const cTraps = document.getElementById("count-traps");
  if (cTraps) cTraps.textContent = q.traps.length;

  const activeTab = document.querySelector(".mini-tab.active")?.dataset.mini || "doors";
  renderMiniList(activeTab);
}

function renderMiniList(type) {
  const container = document.getElementById("placed-entities-list");
  if (!container) return;
  container.innerHTML = "";

  const q = currentData.currentQuest;
  let items = [];
  if (type === "doors") {
    items = q.doors.map(d => ({
      label: `Door (${d.state})`,
      coords: `[${d.from[0]}, ${d.from[1]}]`,
      col: d.from[0],
      row: d.from[1]
    }));
  } else if (type === "blocks") {
    items = q.wallBlocks.map(b => {
      const { w, h } = getBlockDimensions(b);
      const name = (w === 1 && h === 1) ? '1-Tile Wall' : (w === 2 ? '2-Tile Wall (H)' : '2-Tile Wall (V)');
      return {
        label: `${name} (${w}×${h})`,
        coords: `[${b.x}, ${b.y}]`,
        col: b.x,
        row: b.y
      };
    });
  } else if (type === "furniture") {
    items = q.furniture.map(f => {
      const dims = getFurnitureDimensions(f);
      return {
        label: `${f.name} (${dims.w}×${dims.h})`,
        coords: `[${f.x}, ${f.y}]`,
        col: f.x,
        row: f.y
      };
    });
  } else if (type === "monsters") {
    items = q.monsters.map(m => ({
      label: `${m.name} ${m.isBoss ? '👑' : ''}`,
      coords: `[${m.x}, ${m.y}]`,
      col: m.x,
      row: m.y
    }));
  } else if (type === "traps") {
    items = q.traps.map(t => {
      const dims = getTrapDimensions(t);
      return {
        label: `${(t.name || t.trapType).toUpperCase()} (${dims.w}×${dims.h})`,
        coords: `[${t.x}, ${t.y}]`,
        col: t.x,
        row: t.y
      };
    });
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="mini-item text-muted">No ${type} placed.</div>`;
    return;
  }

  items.forEach(it => {
    const div = document.createElement("div");
    div.className = "mini-item";
    div.innerHTML = `<span><strong>${it.label}</strong></span> <span class="badge">${it.coords}</span>`;
    div.onclick = () => {
      inspectSquare(it.col, it.row);
      currentData.selectedSquare = { col: it.col, row: it.row };
      drawBoard();
    };
    container.appendChild(div);
  });
}

// Toggle all rooms active/inactive
document.getElementById("btn-toggle-all-rooms")?.addEventListener("click", () => {
  pushUndoState();
  const rooms = currentData.activeMapConfig?.rooms || [];
  if (currentData.currentQuest.activeRooms.size === rooms.length) {
    currentData.currentQuest.activeRooms.clear();
    setStatus("Deactivated all rooms.");
  } else {
    rooms.forEach(r => currentData.currentQuest.activeRooms.add(r.id));
    setStatus("Activated all rooms.");
  }
  updateSummaryStats();
  drawBoard();
});

// Render the 26x19 Board Canvas
function drawBoard() {
  const canvas = document.getElementById("board-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const m = getGridMetrics();
  if (!m) return;

  // 1. Clear background
  ctx.fillStyle = "#030712";
  ctx.fillRect(0, 0, m.w, m.h);

  // 2. Draw Board Artwork
  if (currentData.boardImage) {
    ctx.save();
    ctx.globalAlpha = currentData.calibration.artOpacity;
    ctx.drawImage(currentData.boardImage, 0, 0, m.w, m.h);
    ctx.restore();
  } else {
    // Fallback dark gradient
    const grad = ctx.createRadialGradient(m.w/2, m.h/2, 100, m.w/2, m.h/2, m.w/2);
    grad.addColorStop(0, "#1e293b");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, m.w, m.h);
  }

  const { insetL, insetT, innerW, innerH, cellW, cellH, cols, rows } = m;

  // 3. Draw Inactive Room Shroud
  const rooms = currentData.activeMapConfig?.rooms || [];
  rooms.forEach(r => {
    const isActive = currentData.currentQuest.activeRooms.has(r.id);
    const rx = insetL + r.x * cellW;
    const ry = insetT + r.y * cellH;
    const rw = r.w * cellW;
    const rh = r.h * cellH;

    if (!isActive) {
      // Dark veil over unactivated room
      ctx.fillStyle = "rgba(10, 15, 29, 0.82)";
      ctx.fillRect(rx, ry, rw, rh);

      ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[INACTIVE ROOM]", rx + rw / 2, ry + rh / 2);
    } else if (currentData.calibration.showRooms) {
      // Subtle room tint
      ctx.fillStyle = r.id === 'room-center' || r.id === 'cavern-center'
        ? "rgba(245, 158, 11, 0.12)"
        : "rgba(56, 189, 248, 0.06)";
      ctx.fillRect(rx, ry, rw, rh);

      // Glowing room border
      ctx.strokeStyle = r.id === 'room-center' || r.id === 'cavern-center'
        ? "rgba(245, 158, 11, 0.7)"
        : "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, rw, rh);
    }
  });

  // 4. Draw Calibrated Grid Lines
  ctx.save();
  ctx.strokeStyle = `rgba(0, 229, 255, ${currentData.calibration.gridOpacity})`;
  ctx.lineWidth = 1.0;

  for (let c = 0; c <= cols; c++) {
    const x = insetL + c * cellW;
    ctx.beginPath();
    ctx.moveTo(x, insetT);
    ctx.lineTo(x, insetT + innerH);
    ctx.stroke();
  }

  for (let r = 0; r <= rows; r++) {
    const y = insetT + r * cellH;
    ctx.beginPath();
    ctx.moveTo(insetL, y);
    ctx.lineTo(insetL + innerW, y);
    ctx.stroke();
  }
  ctx.restore();

  // 5. Draw Coordinate Labels
  if (currentData.calibration.showCoords) {
    ctx.save();
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const topY = insetT >= 16 ? (insetT - 6) : (insetT + 8);
    for (let c = 0; c < cols; c++) {
      const x = insetL + c * cellW + cellW / 2;
      const label = c < 26 ? String.fromCharCode(65 + c) : `A${String.fromCharCode(65 + c - 26)}`;
      ctx.fillText(label, x, topY);
    }

    const leftX = insetL >= 20 ? (insetL - 8) : (insetL + 8);
    for (let r = 0; r < rows; r++) {
      const y = insetT + r * cellH + cellH / 2;
      ctx.fillText(String(r + 1), leftX, y);
    }
    ctx.restore();
  }

  // 6. Draw Wall Blocks (1-Tile & 2-Tile HeroQuest stone blocks)
  const q = currentData.currentQuest;
  q.wallBlocks.forEach(b => {
    const { w, h } = getBlockDimensions(b);
    const bx = insetL + b.x * cellW;
    const by = insetT + b.y * cellH;
    const totalW = w * cellW;
    const totalH = h * cellH;
    const midX = bx + totalW / 2;
    const midY = by + totalH / 2;

    ctx.save();
    // Drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(bx + 3, by + 3, totalW - 4, totalH - 4);

    const wbImg = getTileImage('wall_block');
    if (wbImg) {
      // Draw authentic AI wall block texture per cell
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          const tx = bx + dx * cellW;
          const ty = by + dy * cellH;
          ctx.drawImage(wbImg, tx + 1, ty + 1, cellW - 2, cellH - 2);
        }
      }
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + 1, by + 1, totalW - 2, totalH - 2);

      if (w > 1) {
        ctx.beginPath();
        ctx.moveTo(bx + cellW, by + 2);
        ctx.lineTo(bx + cellW, by + totalH - 2);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      if (h > 1) {
        ctx.beginPath();
        ctx.moveTo(bx + 2, by + cellH);
        ctx.lineTo(bx + totalW - 2, by + cellH);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Center pill label
      const label = (w > 1 || h > 1) ? "🧱 2-TILE WALL" : "🧱 WALL";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(midX - tw / 2 - 4, midY - 6, tw + 8, 12);
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(label, midX, midY);
    } else {
      // Stone block outer casing
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(bx + 1, by + 1, totalW - 2, totalH - 2);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + 1, by + 1, totalW - 2, totalH - 2);

      // Draw individual tiles within the block
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          const tx = bx + dx * cellW;
          const ty = by + dy * cellH;

          // Tile bevel
          ctx.fillStyle = "#334155";
          ctx.fillRect(tx + 3, ty + 3, cellW - 6, cellH - 6);

          // Masonry cross-hatch
          ctx.beginPath();
          ctx.moveTo(tx + 5, ty + 5);
          ctx.lineTo(tx + cellW - 5, ty + cellH - 5);
          ctx.moveTo(tx + cellW - 5, ty + 5);
          ctx.lineTo(tx + 5, ty + cellH - 5);
          ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // Inner border
          ctx.strokeStyle = "rgba(100, 116, 139, 0.8)";
          ctx.lineWidth = 1;
          ctx.strokeRect(tx + 3, ty + 3, cellW - 6, cellH - 6);
        }
      }

      // Seam line between tiles if multi-tile
      if (w > 1) {
        ctx.beginPath();
        ctx.moveTo(bx + cellW, by + 2);
        ctx.lineTo(bx + cellW, by + totalH - 2);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      if (h > 1) {
        ctx.beginPath();
        ctx.moveTo(bx + 2, by + cellH);
        ctx.lineTo(bx + totalW - 2, by + cellH);
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Label in center
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = (w > 1 || h > 1) ? "🧱 2-TILE WALL" : "🧱 WALL";
      ctx.fillText(label, midX, midY);
    }

    ctx.restore();
  });

  // 7. Draw Traps & Boulder Tiles
  q.traps.forEach(t => {
    const { w, h } = getTrapDimensions(t);
    const tx = insetL + t.x * cellW;
    const ty = insetT + t.y * cellH;
    const totalW = w * cellW;
    const totalH = h * cellH;
    const midX = tx + totalW / 2;
    const midY = ty + totalH / 2;

    ctx.save();
    const trapKey = (t.trapType === 'boulder' || t.trapType === 'boulder-2x2') ? 'boulder' : t.trapType;
    const trImg = getTileImage(trapKey);
    if (trImg) {
      // Drop shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(tx + 3, ty + 3, totalW - 4, totalH - 4);
      // AI Image
      ctx.drawImage(trImg, tx + 2, ty + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = t.trapType === 'pit' ? '#dc2626' : (t.trapType === 'falling-block' ? '#ea580c' : '#7c3aed');
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx + 2, ty + 2, totalW - 4, totalH - 4);
      // Label pill
      const lbl = t.trapType === 'boulder-2x2' ? 'MEGA BOULDER' : (t.trapType || 'TRAP').toUpperCase();
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(lbl).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(midX - tw / 2 - 3, midY + totalH * 0.32 - 5, tw + 6, 11);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(lbl, midX, midY + totalH * 0.32);
    } else if (t.trapType === 'boulder' || t.trapType === 'boulder-2x2') {
      // 3D Shaded Stone Boulder Tile
      const radius = Math.min(totalW, totalH) * 0.42;

      // Drop shadow
      ctx.beginPath();
      ctx.ellipse(midX + 2, midY + 4, radius, radius * 0.85, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fill();

      // Spherical radial gradient
      const grad = ctx.createRadialGradient(midX - radius * 0.35, midY - radius * 0.35, radius * 0.08, midX, midY, radius);
      grad.addColorStop(0, "#e2e8f0");
      grad.addColorStop(0.25, "#94a3b8");
      grad.addColorStop(0.65, "#475569");
      grad.addColorStop(1, "#0f172a");

      ctx.beginPath();
      ctx.arc(midX, midY, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Stone fissures
      ctx.beginPath();
      ctx.moveTo(midX - radius * 0.4, midY - radius * 0.2);
      ctx.lineTo(midX - radius * 0.1, midY + radius * 0.1);
      ctx.lineTo(midX + radius * 0.3, midY - radius * 0.05);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t.trapType === 'boulder-2x2' ? "🪨 MEGA BOULDER" : "🪨 BOULDER", midX, midY + radius * 0.55);
    } else {
      // Standard traps
      const radius = cellW * 0.32;
      ctx.fillStyle = t.trapType === 'pit' ? '#dc2626' : (t.trapType === 'falling-block' ? '#ea580c' : '#7c3aed');
      ctx.beginPath();
      ctx.arc(midX, midY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const icon = t.trapType === 'pit' ? '🕳️' : (t.trapType === 'falling-block' ? '🧱' : (t.trapType === 'spear' ? '🗡️' : '☠️'));
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, midX, midY);
    }
    ctx.restore();
  });

  // 8. Draw Furniture (Multi-tile and authentic HeroQuest pieces)
  q.furniture.forEach(f => {
    const dims = getFurnitureDimensions(f);
    const fx = insetL + f.x * cellW;
    const fy = insetT + f.y * cellH;
    const totalW = dims.w * cellW;
    const totalH = dims.h * cellH;
    const midX = fx + totalW / 2;
    const midY = fy + totalH / 2;

    ctx.save();

    // Drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(fx + 3, fy + 3, totalW - 4, totalH - 4);

    const type = f.type || '';
    const furnImg = getFurnitureImage(type);

    if (furnImg) {
      // Authentic AI furniture texture
      ctx.drawImage(furnImg, fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "rgba(217, 119, 6, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      const furnName = (f.name || type.replace(/^furn(iture)?-/, '').replace(/_/g, ' ')).toUpperCase();
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(furnName).width;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(midX - tw / 2 - 3, midY + totalH * 0.35 - 5, tw + 6, 11);
      ctx.fillStyle = "#fef08a";
      ctx.fillText(furnName, midX, midY + totalH * 0.35);
    } else if (type.startsWith('altar')) {
      // 🔮 Sorcerer's Altar / Desk (3x2 or 2x3)
      ctx.fillStyle = "#1e1b4b"; // Deep obsidian / dark purple
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#a855f7"; // Arcane purple border
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      // Arcane pentagram / summoning circle in center
      ctx.beginPath();
      ctx.arc(midX, midY, Math.min(totalW, totalH) * 0.32, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(216, 180, 254, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Candles on the corners
      const cornerOffsets = [
        [fx + 8, fy + 8],
        [fx + totalW - 8, fy + 8],
        [fx + 8, fy + totalH - 8],
        [fx + totalW - 8, fy + totalH - 8]
      ];
      cornerOffsets.forEach(([cx, cy]) => {
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Grimoire & Skull icon in center
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📖 💀", midX, midY - 4);

      ctx.fillStyle = "#e9d5ff";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("SORCERER'S ALTAR", midX, midY + 12);

    } else if (type.startsWith('bookcase')) {
      // 📚 Grand Bookcase (3x1 or 1x3)
      ctx.fillStyle = "#3f1704"; // Dark mahogany
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#d97706"; // Amber / gold frame
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      // Shelf lines and colored book spines
      const bookColors = ["#b91c1c", "#047857", "#1d4ed8", "#d97706", "#7c3aed", "#be123c", "#0284c7"];
      if (dims.w >= dims.h) {
        // Horizontal shelves (3x1)
        const numBooks = 12;
        const bWidth = (totalW - 12) / numBooks;
        for (let i = 0; i < numBooks; i++) {
          ctx.fillStyle = bookColors[i % bookColors.length];
          const bkX = fx + 6 + i * bWidth;
          const bkY = fy + 5;
          const bkH = totalH - 18;
          ctx.fillRect(bkX, bkY, bWidth - 1, bkH);
          // Gold ribbing on spine
          ctx.fillStyle = "rgba(254, 240, 138, 0.6)";
          ctx.fillRect(bkX, bkY + bkH * 0.3, bWidth - 1, 1);
          ctx.fillRect(bkX, bkY + bkH * 0.7, bWidth - 1, 1);
        }
        ctx.fillStyle = "#fef3c7";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📚 BOOKCASE", midX, fy + totalH - 6);
      } else {
        // Vertical shelves (1x3)
        for (let shelf = 0; shelf < 3; shelf++) {
          const sy = fy + shelf * (totalH / 3) + 4;
          for (let b = 0; b < 4; b++) {
            ctx.fillStyle = bookColors[(shelf * 4 + b) % bookColors.length];
            ctx.fillRect(fx + 6 + b * 6, sy, 5, (totalH / 3) - 8);
          }
        }
        ctx.fillStyle = "#fef3c7";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📚 BOOKCASE", midX, fy + totalH - 6);
      }

    } else if (type.startsWith('bookshelf')) {
      // 📖 Study Bookshelf (2x1, 1x2, or 1x1)
      ctx.fillStyle = "#78350f"; // Warm polished oak
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      // Book spines & scroll
      const bookColors = ["#1e40af", "#065f46", "#991b1b", "#b45309", "#581c87"];
      const count = dims.w >= 2 ? 8 : 4;
      const bWidth = (totalW - 10) / count;
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = bookColors[i % bookColors.length];
        ctx.fillRect(fx + 5 + i * bWidth, fy + 5, bWidth - 1, totalH - 16);
      }
      ctx.fillStyle = "#fef3c7";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📖 BOOKSHELF", midX, fy + totalH - 6);

    } else if (type.startsWith('boulder')) {
      // 🪨 Boulder Obstacle
      const radius = Math.min(totalW, totalH) * 0.42;
      const grad = ctx.createRadialGradient(midX - radius * 0.35, midY - radius * 0.35, radius * 0.08, midX, midY, radius);
      grad.addColorStop(0, "#e2e8f0");
      grad.addColorStop(0.3, "#64748b");
      grad.addColorStop(0.7, "#334155");
      grad.addColorStop(1, "#0f172a");

      ctx.beginPath();
      ctx.arc(midX, midY, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Fissures
      ctx.beginPath();
      ctx.moveTo(midX - radius * 0.4, midY - radius * 0.2);
      ctx.lineTo(midX - radius * 0.1, midY + radius * 0.1);
      ctx.lineTo(midX + radius * 0.3, midY - radius * 0.05);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪨 BOULDER", midX, midY + radius * 0.55);

    } else if (type.startsWith('table')) {
      // 🪵 Wooden Table / Council Desk (3x2 or 2x3)
      ctx.fillStyle = "#451a03"; // Dark oak
      ctx.fillRect(fx + 3, fy + 3, totalW - 6, totalH - 6);
      ctx.strokeStyle = "#92400e";
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 3, fy + 3, totalW - 6, totalH - 6);

      // Wood plank lines
      ctx.strokeStyle = "rgba(146, 64, 14, 0.4)";
      ctx.lineWidth = 1;
      const plankStep = (totalH - 8) / 4;
      for (let p = 1; p < 4; p++) {
        ctx.beginPath();
        ctx.moveTo(fx + 4, fy + 4 + p * plankStep);
        ctx.lineTo(fx + totalW - 4, fy + 4 + p * plankStep);
        ctx.stroke();
      }

      ctx.fillStyle = "#fef3c7";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪵 TABLE", midX, midY);

    } else if (type.startsWith('alchemists-bench')) {
      // 🧪 Alchemist's Bench (3x2)
      ctx.fillStyle = "#334155";
      ctx.fillRect(fx + 3, fy + 3, totalW - 6, totalH - 6);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 3, fy + 3, totalW - 6, totalH - 6);

      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🧪 ⚗️ 📜", midX, midY - 4);

      ctx.fillStyle = "#bae6fd";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("ALCHEMIST'S BENCH", midX, midY + 12);

    } else if (type.startsWith('tomb')) {
      // 🪦 Stone Tomb / Sarcophagus (2x3 or 2x1)
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(fx + 3, fy + 3, totalW - 6, totalH - 6);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 3, fy + 3, totalW - 6, totalH - 6);

      // Carved lid effigy
      ctx.strokeStyle = "rgba(203, 213, 225, 0.4)";
      ctx.strokeRect(fx + 7, fy + 7, totalW - 14, totalH - 14);

      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪦", midX, midY - 6);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("STONE TOMB", midX, midY + 12);

    } else if (type.startsWith('weapons-rack')) {
      // ⚔️ Weapons Rack (3x1)
      ctx.fillStyle = "#5c2b0c";
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#ea580c";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚔️ 🛡️ ⚔️", midX, midY - 4);

      ctx.fillStyle = "#ffedd5";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText("WEAPONS RACK", midX, midY + 9);

    } else if (type.startsWith('fireplace')) {
      // 🔥 Stone Fireplace (3x1)
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 2;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🔥 🔥 🔥", midX, midY - 3);

      ctx.fillStyle = "#ffedd5";
      ctx.font = "bold 8px sans-serif";
      ctx.fillText("FIREPLACE", midX, midY + 10);

    } else if (type.startsWith('cupboard')) {
      // 🚪 Cupboard (2x1)
      ctx.fillStyle = "#5c2b0c";
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#ca8a04";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      // Dual doors
      ctx.beginPath();
      ctx.moveTo(midX, fy + 3);
      ctx.lineTo(midX, fy + totalH - 3);
      ctx.strokeStyle = "#291003";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🚪 CUPBOARD", midX, midY);

    } else {
      // Generic (Chest, Throne, Torture Rack, etc.)
      ctx.fillStyle = "rgba(120, 53, 15, 0.9)";
      ctx.fillRect(fx + 2, fy + 2, totalW - 4, totalH - 4);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 2, fy + 2, totalW - 4, totalH - 4);

      let icon = '📦';
      if (type.startsWith('throne')) icon = '👑';
      else if (type.startsWith('chest')) icon = '📦';
      else if (type.startsWith('torture-rack')) icon = '⛓️';

      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, midX, midY);
    }

    ctx.restore();
  });

  // 9. Draw Doors
  q.doors.forEach(d => {
    const d1x = insetL + d.from[0] * cellW + cellW / 2;
    const d1y = insetT + d.from[1] * cellH + cellH / 2;
    const d2x = insetL + d.to[0] * cellW + cellW / 2;
    const d2y = insetT + d.to[1] * cellH + cellH / 2;

    const midX = (d1x + d2x) / 2;
    const midY = (d1y + d2y) / 2;

    const isVert = d.from[1] === d.to[1];
    const img = (d.state === 'open') ? doorOpenImg : doorClosedImg;
    const sz = cellW * 0.85;

    if (img && img.complete && img.naturalWidth > 0 && d.state !== 'secret') {
      ctx.save();
      ctx.translate(midX, midY);
      if (isVert) {
        ctx.rotate(Math.PI / 2);
      }
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    } else {
      ctx.save();
      if (d.state === 'open') {
        ctx.fillStyle = "#22c55e";
        ctx.strokeStyle = "#86efac";
      } else if (d.state === 'secret') {
        ctx.fillStyle = "#a855f7";
        ctx.strokeStyle = "#d8b4fe";
      } else {
        ctx.fillStyle = "#b45309";
        ctx.strokeStyle = "#fde68a";
      }

      ctx.beginPath();
      ctx.arc(midX, midY, cellW * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const doorIcon = d.state === 'secret' ? '👁️' : (d.state === 'open' ? '🪟' : '🚪');
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(doorIcon, midX, midY);
      ctx.restore();
    }
  });

  // 10. Draw Monsters
  q.monsters.forEach(mEntity => {
    const mx = insetL + mEntity.x * cellW + cellW / 2;
    const my = insetT + mEntity.y * cellH + cellH / 2;

    ctx.save();
    ctx.fillStyle = mEntity.isBoss ? "#b91c1c" : "#15803d";
    ctx.beginPath();
    ctx.arc(mx, my, cellW * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = mEntity.isBoss ? "#facc15" : "#ffffff";
    ctx.lineWidth = mEntity.isBoss ? 2.5 : 1.5;
    ctx.stroke();

    let icon = '👹';
    if (mEntity.monsterType.includes('goblin')) icon = '👺';
    else if (mEntity.monsterType.includes('fimir')) icon = '🐊';
    else if (mEntity.monsterType.includes('skeleton')) icon = '💀';
    else if (mEntity.monsterType.includes('zombie')) icon = '🧟';
    else if (mEntity.monsterType.includes('mummy')) icon = '🏺';
    else if (mEntity.monsterType.includes('chaos')) icon = '⚔️';
    else if (mEntity.monsterType.includes('gargoyle')) icon = '🗿';
    else if (mEntity.isBoss) icon = '👑';

    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, mx, my);
    ctx.restore();
  });

  // 11. Draw Starting Stairs
  if (q.startingStairs) {
    const sx = insetL + q.startingStairs[0] * cellW;
    const sy = insetT + q.startingStairs[1] * cellH;
    const midX = sx + cellW / 2;
    const midY = sy + cellH / 2;

    ctx.save();
    const stImg = getTileImage('stairs');
    if (stImg) {
      // Drop shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(sx + 3, sy + 3, cellW - 4, cellH - 4);
      // AI Image
      ctx.drawImage(stImg, sx + 2, sy + 2, cellW - 4, cellH - 4);
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 2, sy + 2, cellW - 4, cellH - 4);
      // Label pill
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(midX - 18, midY - 6, 36, 12);
      ctx.fillStyle = "#93c5fd";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("STAIRS", midX, midY);
    } else {
      ctx.fillStyle = "#1e40af";
      ctx.beginPath();
      ctx.arc(midX, midY, cellW * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪜", midX, midY);
    }
    ctx.restore();
  }

  // 12. Draw Hover Cursor
  if (currentData.hoverSquare) {
    const hx = insetL + currentData.hoverSquare.col * cellW;
    const hy = insetT + currentData.hoverSquare.row * cellH;

    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.strokeRect(hx + 1, hy + 1, cellW - 2, cellH - 2);
    ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
    ctx.fillRect(hx + 1, hy + 1, cellW - 2, cellH - 2);
    ctx.restore();
  }

  // 13. Draw Selected Square
  if (currentData.selectedSquare) {
    const sx = insetL + currentData.selectedSquare.col * cellW;
    const sy = insetT + currentData.selectedSquare.row * cellH;

    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(sx, sy, cellW, cellH);
    ctx.restore();
  }
}

// Load KGraph Data and Map Configurations
async function initKGraphData() {
  setStatus("Initializing Tabletop RPG Studio...");
  try {
    // 1. Load map configurations
    const mapRes = await window.robosTabletop.getMapConfigs();
    if (mapRes.success && mapRes.configs) {
      currentData.mapConfigs = mapRes.configs;
      const select = document.getElementById("map-config-select");
      const questBgSelect = document.getElementById("quest-bg-ref");
      [select, questBgSelect].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = "";
        currentData.mapConfigs.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = `${c.title} (${c.gridDimensions ? c.gridDimensions[0] + '×' + c.gridDimensions[1] : ''})`;
          sel.appendChild(opt);
        });
      });
    }

    // 2. Load KGraph
    const res = await window.robosTabletop.loadKGraph();
    if (res.success) {
      currentData.tabletopNodes = res.tabletopNodes;
      currentData.gameNodes = res.gameNodes;

      currentData.heroes = currentData.tabletopNodes.filter(n => {
        const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        return t.includes("robos:TabletopHero");
      });

      currentData.monsters = currentData.tabletopNodes.filter(n => {
        const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        return t.includes("robos:TabletopMonster");
      });

      currentData.spells = currentData.tabletopNodes.filter(n => {
        const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        return t.includes("robos:TabletopSpellCard");
      });

      currentData.furniture = currentData.tabletopNodes.filter(n => {
        const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
        return t.includes("robos:TabletopFurniture");
      });

      setupHeroEditorControls();
      setupMonsterEditorControls();
      setupSpellDraftControls();
      applySpellAllocationToHeroes();
      renderHeroesList();
      renderMonstersList();
      renderSpellsAndItems();
      renderSpellDraftSummaryBadges();

      // Initialize Campaign & Multi-Quest Blueprint
      setupCampaignQuestControls();
      renderCampaignQuestsList();
      updateCampaignProgress();
    }

    // 3. Switch to default map configuration and select active quest
    await selectQuest(currentData.currentQuestIndex || 0, true);
    initBoard();
    setStatus("Tabletop RPG Quest Editor Ready.");
  } catch (err) {
    setStatus("Failed to initialize: " + err.message);
  }
}

// ==========================================
// 1.5. ELEMENTAL SPELL DRAFT & GRIMOIRE ENGINE
// ==========================================

const ELEMENTAL_DECKS = {
  earth: {
    id: "earth",
    name: "Earth Magic",
    icon: "🪨",
    role: "Defense & Healing",
    badgeClass: "tag-earth",
    color: "#eab308",
    spells: [
      {
        id: "urn:robos:tabletop:spell:heal-body",
        slug: "heal-body",
        name: "Heal Body",
        element: "earth",
        icon: "💖",
        description: "Restores up to 4 lost Body Points to any Hero, including yourself.",
        effect: "heal-bp",
        val: 4
      },
      {
        id: "urn:robos:tabletop:spell:pass-through-rock",
        slug: "pass-through-rock",
        name: "Pass Through Rock",
        element: "earth",
        icon: "🧱",
        description: "Allows the caster or ally to move through solid stone walls on their next turn.",
        effect: "phase-walls",
        val: 1
      },
      {
        id: "urn:robos:tabletop:spell:rock-skin",
        slug: "rock-skin",
        name: "Rock Skin",
        element: "earth",
        icon: "🛡️",
        description: "Hardens the caster's skin, granting +1 extra Combat Defend Die until damaged.",
        effect: "buff-def",
        val: 1
      }
    ]
  },
  fire: {
    id: "fire",
    name: "Fire Magic",
    icon: "🔥",
    role: "Direct Damage & Buffs",
    badgeClass: "tag-fire",
    color: "#ef4444",
    spells: [
      {
        id: "urn:robos:tabletop:spell:ball-of-flame",
        slug: "ball-of-flame",
        name: "Ball of Flame",
        element: "fire",
        icon: "☄️",
        description: "Hurls a blazing sphere dealing 2 BP damage. Target defends with 2 dice.",
        effect: "damage-bp",
        val: 2
      },
      {
        id: "urn:robos:tabletop:spell:courage",
        slug: "courage",
        name: "Courage",
        element: "fire",
        icon: "🦁",
        description: "Fills a hero with magical bravado, granting +2 extra Combat Attack Dice until no monsters remain.",
        effect: "buff-atk",
        val: 2
      },
      {
        id: "urn:robos:tabletop:spell:fire-of-wrath",
        slug: "fire-of-wrath",
        name: "Fire of Wrath",
        element: "fire",
        icon: "🔥",
        description: "Strikes any visible monster with darts of flame, causing 1 BP damage. Target defends with 1 die.",
        effect: "damage-bp",
        val: 1
      }
    ]
  },
  water: {
    id: "water",
    name: "Water Magic",
    icon: "💧",
    role: "Restoration & Stealth",
    badgeClass: "tag-water",
    color: "#06b6d4",
    spells: [
      {
        id: "urn:robos:tabletop:spell:water-of-healing",
        slug: "water-of-healing",
        name: "Water of Healing",
        element: "water",
        icon: "💧",
        description: "Restores up to 4 lost Body Points to any Hero.",
        effect: "heal-bp",
        val: 4
      },
      {
        id: "urn:robos:tabletop:spell:sleep",
        slug: "sleep",
        name: "Sleep",
        element: "water",
        icon: "💤",
        description: "Puts a monster into magical slumber. It cannot move or attack until it rolls a 6 to wake up.",
        effect: "status-sleep",
        val: 1
      },
      {
        id: "urn:robos:tabletop:spell:veil-of-mist",
        slug: "veil-of-mist",
        name: "Veil of Mist",
        element: "water",
        icon: "🌫️",
        description: "Envelops the caster in thick fog, allowing movement unseen past monsters.",
        effect: "status-stealth",
        val: 1
      }
    ]
  },
  air: {
    id: "air",
    name: "Air Magic",
    icon: "🌪️",
    role: "Speed & Summons",
    badgeClass: "tag-air",
    color: "#a855f7",
    spells: [
      {
        id: "urn:robos:tabletop:spell:genie",
        slug: "genie",
        name: "Genie",
        element: "air",
        icon: "🧞",
        description: "Summons an ancient djinn to attack any visible monster with 5 combat dice, or to open any locked door.",
        effect: "summon-attack",
        val: 5
      },
      {
        id: "urn:robos:tabletop:spell:swift-wind",
        slug: "swift-wind",
        name: "Swift Wind",
        element: "air",
        icon: "💨",
        description: "Bestows the speed of the tempest, allowing the hero to roll double movement dice (4d6).",
        effect: "buff-move",
        val: 2
      },
      {
        id: "urn:robos:tabletop:spell:tempest",
        slug: "tempest",
        name: "Tempest",
        element: "air",
        icon: "🌪️",
        description: "Creates a localized vortex trapping a monster for 1 turn. It misses its next turn.",
        effect: "status-freeze",
        val: 1
      }
    ]
  }
};

// Authentic HeroQuest Chaos & Dread Spells (Enemies & Evil Sorcerers)
const DREAD_SPELLS = [
  {
    id: "urn:robos:tabletop:spell:lightning-bolt",
    slug: "lightning-bolt",
    name: "Lightning Bolt",
    element: "dread",
    icon: "⚡",
    description: "Strikes any hero with a bolt of dark lightning causing 2 BP damage. Target rolls 2 combat dice to defend.",
    effect: "damage-bp",
    val: 2
  },
  {
    id: "urn:robos:tabletop:spell:firestorm",
    slug: "firestorm",
    name: "Firestorm",
    element: "dread",
    icon: "🔥",
    description: "Engulfs a hero or entire room in searing hellfire causing 3 BP damage. Target rolls 3 combat dice to defend.",
    effect: "damage-bp",
    val: 3
  },
  {
    id: "urn:robos:tabletop:spell:fear",
    slug: "fear",
    name: "Fear",
    element: "dread",
    icon: "💀",
    description: "Paralyzes a hero with terror, reducing their Attack Strength to 1 combat die on their next turn.",
    effect: "debuff-atk",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:sleep-dread",
    slug: "sleep-dread",
    name: "Sleep of Dread",
    element: "dread",
    icon: "💤",
    description: "Puts a hero into deep magical slumber. They cannot move, attack, or defend until rolling a 6 or taking damage.",
    effect: "status-sleep",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:cloud-of-chaos",
    slug: "cloud-of-chaos",
    name: "Cloud of Chaos",
    element: "dread",
    icon: "🕸️",
    description: "Releases a suffocating cloud of toxic chaos vapors. Target hero is stunned and loses their entire next turn.",
    effect: "status-freeze",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:summon-undead",
    slug: "summon-undead",
    name: "Summon Undead",
    element: "dread",
    icon: "🧟",
    description: "Raises 2 Skeletons or Zombies from the dungeon floor adjacent to the caster to fight alongside them.",
    effect: "summon-monsters",
    val: 2
  },
  {
    id: "urn:robos:tabletop:spell:rust",
    slug: "rust",
    name: "Rust",
    element: "dread",
    icon: "🛡️",
    description: "Corrodes and destroys one metal weapon or helmet equipped by a target hero, reducing their combat stats.",
    effect: "destroy-equipment",
    val: 1
  },
  {
    id: "urn:robos:tabletop:spell:escape",
    slug: "escape",
    name: "Escape",
    element: "dread",
    icon: "💨",
    description: "Dissolves the evil sorcerer into dark mist, teleporting them instantly to another room or safety.",
    effect: "teleport",
    val: 1
  }
];

function getSpellAllocation() {
  return currentData.spellAllocation;
}

function setElfElement(elementKey) {
  if (!ELEMENTAL_DECKS[elementKey]) return;
  const allElements = ["earth", "fire", "water", "air"];
  currentData.spellAllocation.elfElement = elementKey;
  currentData.spellAllocation.wizardElements = allElements.filter(e => e !== elementKey);
  applySpellAllocationToHeroes();
  renderSpellSelectionModalUI();
  renderSpellDraftSummaryBadges();
  renderSpellsAndItems();
}

function getHeroSpells(hero) {
  if (!hero) return [];
  const heroClass = getHeroClass(hero);
  if (heroClass === "Elf") {
    const elem = currentData.spellAllocation?.elfElement || "water";
    return ELEMENTAL_DECKS[elem] ? [...ELEMENTAL_DECKS[elem].spells] : [];
  }
  if (heroClass === "Wizard") {
    const elems = currentData.spellAllocation?.wizardElements || ["earth", "fire", "air"];
    let wizardSpells = [];
    elems.forEach(elem => {
      if (ELEMENTAL_DECKS[elem]) {
        wizardSpells = wizardSpells.concat(ELEMENTAL_DECKS[elem].spells);
      }
    });
    return wizardSpells;
  }
  return [];
}

function applySpellAllocationToHeroes() {
  if (!Array.isArray(currentData.heroes)) return;
  currentData.heroes.forEach(h => {
    const heroClass = getHeroClass(h);
    if (heroClass === "Elf" || heroClass === "Wizard") {
      h["robos:spells"] = getHeroSpells(h);
    } else {
      h["robos:spells"] = [];
    }
  });

  const activeHero = getActiveHero();
  if (activeHero) {
    renderHeroGrimoire(activeHero);
    renderHeroSpellActionModule(activeHero);
  }
}

function renderHeroGrimoire(hero) {
  const spellsSection = document.getElementById("hero-spells-section");
  const spellsList = document.getElementById("hero-spells-list");
  const spellsTitle = document.getElementById("hero-spells-title");
  const spellsSubtitle = document.getElementById("hero-spells-subtitle");
  if (!spellsSection || !spellsList) return;

  const heroClass = getHeroClass(hero);
  if (heroClass !== "Elf" && heroClass !== "Wizard") {
    spellsSection.style.display = "block";
    if (spellsTitle) spellsTitle.textContent = "🛡️ Martial Hero (Non-Spellcaster)";
    if (spellsSubtitle) spellsSubtitle.textContent = `${heroClass} uses no magic`;
    spellsList.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 14px; background: rgba(30, 41, 59, 0.4); border: 1px dashed var(--border-color); border-radius: 6px; color: var(--text-muted); font-size: 0.8rem; text-align: center;">
        The <strong>${heroClass}</strong> fights exclusively with brute martial prowess, steel, and armor.<br>
        <span style="font-size:0.75rem; color:#64748b;">Only the <strong>Elf</strong> (1 elemental deck) and <strong>Wizard</strong> (3 elemental decks) memorize spells.</span>
      </div>
    `;
    return;
  }

  spellsSection.style.display = "block";
  const spells = getHeroSpells(hero);

  if (heroClass === "Elf") {
    const elemKey = currentData.spellAllocation?.elfElement || "water";
    const deck = ELEMENTAL_DECKS[elemKey];
    if (spellsTitle) spellsTitle.textContent = `🧝 Elf Grimoire — ${deck?.name || 'Elemental Magic'}`;
    if (spellsSubtitle) spellsSubtitle.textContent = `1 College Drafted (${spells.length} Spells Memorized)`;
  } else {
    const elemNames = (currentData.spellAllocation?.wizardElements || []).map(e => ELEMENTAL_DECKS[e]?.name?.replace(" Magic", "") || e).join(", ");
    if (spellsTitle) spellsTitle.textContent = `🧙 Wizard Grimoire — Master of Elements`;
    if (spellsSubtitle) spellsSubtitle.textContent = `3 Colleges Drafted: ${elemNames} (${spells.length} Spells Memorized)`;
  }

  spellsList.innerHTML = "";
  spells.forEach(spell => {
    const card = document.createElement("div");
    card.className = `spell-card-mini deck-${spell.element}`;
    card.innerHTML = `
      <div class="spell-card-mini-header">
        <span class="spell-mini-name">${spell.icon} ${spell.name}</span>
        <span class="element-tag tag-${spell.element}">${spell.element.toUpperCase()}</span>
      </div>
      <div class="spell-mini-desc">${spell.description}</div>
    `;
    spellsList.appendChild(card);
  });
}

function renderHeroSpellActionModule(hero) {
  const moduleEl = document.getElementById("act-spell-module");
  const countEl = document.getElementById("act-spell-count");
  const selectEl = document.getElementById("act-spell-select");
  if (!moduleEl) return;

  const heroClass = getHeroClass(hero);
  if (heroClass !== "Elf" && heroClass !== "Wizard") {
    moduleEl.style.display = "none";
    return;
  }

  moduleEl.style.display = "flex";
  const spells = getHeroSpells(hero);
  if (countEl) countEl.textContent = `${spells.length} Spells Ready`;

  if (selectEl) {
    const currentVal = selectEl.value;
    selectEl.innerHTML = "";
    spells.forEach(sp => {
      const opt = document.createElement("option");
      opt.value = sp.id || sp.slug;
      opt.textContent = `${sp.icon} ${sp.name} (${sp.element.toUpperCase()})`;
      selectEl.appendChild(opt);
    });
    if (currentVal && spells.some(s => (s.id || s.slug) === currentVal)) {
      selectEl.value = currentVal;
    }
  }
}

function castHeroSpell(hero, spellId) {
  if (!hero) hero = getActiveHero();
  if (!hero) return null;

  const spells = getHeroSpells(hero);
  const spell = spells.find(s => s.id === spellId || s.slug === spellId) || spells[0];
  if (!spell) return null;

  const resultBox = document.getElementById("act-spell-result");

  let castMessage = "";
  let effectSummary = "";

  if (spell.effect === "heal-bp") {
    const maxBP = parseInt(hero["robos:bodyPoints"], 10) || 8;
    const curBP = hero["robos:currentBP"] !== undefined ? hero["robos:currentBP"] : maxBP;
    const healedBP = Math.min(maxBP, curBP + spell.val);
    const amount = healedBP - curBP;
    hero["robos:currentBP"] = healedBP;
    renderVitalityPips(hero);
    castMessage = `✨ [MAGIC] ${hero["dcterms:title"]} cast ${spell.name}! Restored ${amount} BP (Current BP: ${healedBP}/${maxBP}).`;
    effectSummary = `+${amount} BP Healed!`;
  } else if (spell.effect === "damage-bp") {
    castMessage = `🔥 [MAGIC] ${hero["dcterms:title"]} cast ${spell.name}! Dealt ${spell.val} magical BP damage (target defends with combat dice).`;
    effectSummary = `${spell.val} BP Damage Dealt`;
  } else if (spell.effect === "summon-attack") {
    castMessage = `🌪️ [MAGIC] ${hero["dcterms:title"]} summoned Genie! Attacking target with ${spell.val} combat dice.`;
    effectSummary = `Genie Strikes with ${spell.val} Dice!`;
  } else if (spell.effect === "buff-def" || spell.effect === "buff-atk" || spell.effect === "buff-move") {
    castMessage = `✨ [MAGIC] ${hero["dcterms:title"]} cast ${spell.name}! Applied active enhancement effect: ${spell.description}`;
    effectSummary = `Buff Active!`;
  } else {
    castMessage = `🔮 [MAGIC] ${hero["dcterms:title"]} cast ${spell.name}! ${spell.description}`;
    effectSummary = `Spell Effect Active`;
  }

  if (resultBox) {
    resultBox.innerHTML = `
      <span class="dice-badge dice-shield">${spell.icon} ${spell.name}</span>
      <span style="font-size:0.75rem; color:#a7f3d0; font-weight:600;">${effectSummary}</span>
    `;
  }

  logCombatAction(castMessage, "system");
  triggerHeroAutosave();
  return { spell, effectSummary, castMessage };
}

let pendingSpellDraftCallback = null;

function openSpellSelectionModal(onConfirmCallback = null) {
  pendingSpellDraftCallback = onConfirmCallback;
  const modal = document.getElementById("modal-spell-pick");
  if (!modal) return;
  modal.style.display = "flex";
  const confirmBtn = document.getElementById("btn-confirm-spell-modal");
  if (confirmBtn) {
    confirmBtn.textContent = onConfirmCallback ? "⚔️ Confirm & Launch Quest" : "✨ Confirm Spell Selection";
  }
  renderSpellSelectionModalUI();
}

function closeSpellSelectionModal() {
  const modal = document.getElementById("modal-spell-pick");
  if (modal) modal.style.display = "none";
  pendingSpellDraftCallback = null;
}

function renderSpellDraftSummaryBadges() {
  const badge = document.getElementById("spells-draft-summary-badge");
  if (badge) {
    const elfDeck = ELEMENTAL_DECKS[currentData.spellAllocation.elfElement]?.name || currentData.spellAllocation.elfElement;
    const wizDecks = currentData.spellAllocation.wizardElements
      .map(e => ELEMENTAL_DECKS[e]?.name?.replace(" Magic", "") || e)
      .join(", ");
    badge.textContent = `Elf: ${elfDeck} (3) | Wizard: ${wizDecks} (9)`;
  }
}

function renderSpellSelectionModalUI() {
  const elfElem = currentData.spellAllocation.elfElement;
  const wizElems = currentData.spellAllocation.wizardElements;

  // Highlight active deck card
  document.querySelectorAll(".element-deck-card").forEach(card => {
    const elem = card.dataset.element;
    const selectBtn = card.querySelector(".btn-element-select");
    if (elem === elfElem) {
      card.classList.add("active");
      if (selectBtn) selectBtn.textContent = "✓ Drafted by Elf";
    } else {
      card.classList.remove("active");
      if (selectBtn) selectBtn.textContent = "Draft for Elf";
    }
  });

  // Update summary tags
  const elfSummary = document.getElementById("modal-elf-element-summary");
  if (elfSummary) {
    const deck = ELEMENTAL_DECKS[elfElem];
    elfSummary.className = `element-tag tag-${elfElem}`;
    elfSummary.textContent = `${deck.icon} ${deck.name} (3 Spells)`;
  }

  const wizSummary = document.getElementById("modal-wizard-element-summary");
  if (wizSummary) {
    const deckNames = wizElems.map(e => `${ELEMENTAL_DECKS[e].icon} ${ELEMENTAL_DECKS[e].name.replace(" Magic", "")}`).join(", ");
    wizSummary.className = "element-tag tag-multi";
    wizSummary.textContent = `${deckNames} (9 Spells)`;
  }

  // Preview chips for Elf
  const elfPreview = document.getElementById("modal-elf-spells-preview");
  if (elfPreview) {
    elfPreview.innerHTML = "";
    const elfSpells = ELEMENTAL_DECKS[elfElem]?.spells || [];
    elfSpells.forEach(s => {
      const chip = document.createElement("div");
      chip.className = `spell-preview-chip tag-${elfElem}`;
      chip.innerHTML = `<strong>${s.icon} ${s.name}</strong><span>${s.description}</span>`;
      elfPreview.appendChild(chip);
    });
  }

  // Preview chips for Wizard
  const wizPreview = document.getElementById("modal-wizard-spells-preview");
  if (wizPreview) {
    wizPreview.innerHTML = "";
    wizElems.forEach(elemKey => {
      const deckSpells = ELEMENTAL_DECKS[elemKey]?.spells || [];
      deckSpells.forEach(s => {
        const chip = document.createElement("div");
        chip.className = `spell-preview-chip tag-${elemKey}`;
        chip.innerHTML = `<strong>${s.icon} ${s.name}</strong><span>${s.description}</span>`;
        wizPreview.appendChild(chip);
      });
    });
  }
}

let spellDraftControlsInitialized = false;
function setupSpellDraftControls() {
  if (spellDraftControlsInitialized) return;
  spellDraftControlsInitialized = true;

  document.getElementById("btn-open-spell-pick")?.addEventListener("click", () => openSpellSelectionModal());
  document.getElementById("btn-spells-tab-pick")?.addEventListener("click", () => openSpellSelectionModal());
  document.getElementById("btn-hero-repick-spells")?.addEventListener("click", () => openSpellSelectionModal());
  document.getElementById("btn-close-spell-modal")?.addEventListener("click", closeSpellSelectionModal);
  document.getElementById("btn-cancel-spell-modal")?.addEventListener("click", closeSpellSelectionModal);

  document.querySelectorAll(".element-deck-card").forEach(card => {
    card.addEventListener("click", (e) => {
      const elem = card.dataset.element;
      if (elem) setElfElement(elem);
    });
  });

  document.querySelectorAll(".btn-element-select").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const elem = btn.dataset.selectElement;
      if (elem) setElfElement(elem);
    });
  });

  document.getElementById("btn-confirm-spell-modal")?.addEventListener("click", async () => {
    currentData.spellAllocation.confirmed = true;
    applySpellAllocationToHeroes();
    renderSpellsAndItems();
    renderSpellDraftSummaryBadges();
    const cb = pendingSpellDraftCallback;
    closeSpellSelectionModal();
    const elfDeckName = ELEMENTAL_DECKS[currentData.spellAllocation.elfElement]?.name || currentData.spellAllocation.elfElement;
    setStatus(`Spell Selection Confirmed: Elf memorizes ${elfDeckName}; Wizard takes remaining 3 decks.`);
    logCombatAction(`🔮 Spell Selection Confirmed! Elf memorizes ${elfDeckName}. Wizard takes remaining 3 decks.`, "system");
    if (typeof cb === "function") {
      await cb();
    }
  });

  document.getElementById("btn-cast-hero-spell")?.addEventListener("click", () => {
    const hero = getActiveHero();
    const selectEl = document.getElementById("act-spell-select");
    const spellId = selectEl?.value;
    if (hero && spellId) {
      castHeroSpell(hero, spellId);
    }
  });
}

// ==========================================
// 2. HERO EDITOR & CHARACTER STATE ENGINE
// ==========================================

function getActiveHero() {
  if (!currentData.activeHeroId && currentData.heroes.length > 0) {
    currentData.activeHeroId = currentData.heroes[0]["@id"];
  }
  return currentData.heroes.find(h => h["@id"] === currentData.activeHeroId);
}

function getHeroClass(h) {
  if (h["robos:heroClass"]) return h["robos:heroClass"];
  const title = (h["dcterms:title"] || "").toLowerCase();
  if (title.includes("barbarian")) return "Barbarian";
  if (title.includes("dwarf")) return "Dwarf";
  if (title.includes("elf")) return "Elf";
  if (title.includes("wizard")) return "Wizard";
  return "Warrior";
}

function getHeroName(h) {
  if (!h) return "Hero";
  if (h["robos:characterName"]) return h["robos:characterName"];
  if (h.characterName) return h.characterName;
  const title = h["dcterms:title"] || "";
  const heroClass = getHeroClass(h);
  if (!title || title.toLowerCase() === heroClass.toLowerCase() || title.toLowerCase() === (h["@id"] || "").toLowerCase()) {
    const id = (h["@id"] || "").toLowerCase();
    if (id.includes("barbarian")) return "Rogar";
    if (id.includes("dwarf")) return "Dorgan";
    if (id.includes("elf")) return "Ladril";
    if (id.includes("wizard")) return "Telor";
  }
  return title || heroClass;
}

function getHeroWeapon(h) {
  if (h["robos:equippedWeapon"]) return h["robos:equippedWeapon"];
  if (h["robos:startingWeapon"]) {
    const sw = h["robos:startingWeapon"];
    if (sw.includes("broadsword")) return "Broadsword (3 Combat Dice)";
    if (sw.includes("shortsword")) return "Shortsword (2 Combat Dice)";
    if (sw.includes("dagger")) return "Dagger (1 Combat Die)";
    return sw;
  }
  return "Broadsword (3 Combat Dice)";
}

function getHeroArmor(h) {
  if (h["robos:equippedArmor"]) return h["robos:equippedArmor"];
  const heroClass = getHeroClass(h);
  if (heroClass === "Barbarian") return "Natural Toughness (2 Defend Dice)";
  if (heroClass === "Dwarf") return "Shield & Chainmail (+2 Defend Dice)";
  if (heroClass === "Elf") return "Elven Leather & Cloak (+2 Defend Dice)";
  if (heroClass === "Wizard") return "Wizard Cloak (2 Defend Dice)";
  return "Chainmail & Shield (+2 Defend Dice)";
}

function getHeroInventory(h) {
  if (Array.isArray(h["robos:inventory"])) return h["robos:inventory"];
  const heroClass = getHeroClass(h);
  if (heroClass === "Barbarian") {
    h["robos:inventory"] = [
      { id: "item-pot-heal-1", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 },
      { id: "item-rope-1", name: "Heavy Rope (30 ft)", type: "tool", effect: "Climb pits & gaps", value: 25 }
    ];
  } else if (heroClass === "Dwarf") {
    h["robos:inventory"] = [
      { id: "item-toolkit-1", name: "Trap Disarm Toolkit", type: "tool", effect: "Disarm traps without rolling skull", value: 75 },
      { id: "item-pot-heal-2", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
    ];
  } else if (heroClass === "Elf") {
    h["robos:inventory"] = [
      { id: "item-torch-1", name: "Dungeon Torch", type: "tool", effect: "Detect hidden traps in room", value: 15 },
      { id: "item-strength-1", name: "Potion of Strength", type: "potion", effect: "+2 Attack Dice for 1 turn", value: 150 }
    ];
  } else if (heroClass === "Wizard") {
    h["robos:inventory"] = [
      { id: "item-holy-water-1", name: "Holy Water", type: "relic", effect: "Destroys undead instantly", value: 200 },
      { id: "item-pot-heal-3", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
    ];
  } else {
    h["robos:inventory"] = [
      { id: "item-pot-heal-def", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
    ];
  }
  return h["robos:inventory"];
}

// Render Heroes Sidebar List
function renderHeroesList() {
  const container = document.getElementById("heroes-list");
  if (!container) return;
  container.innerHTML = "";

  currentData.heroes.forEach(h => {
    const div = document.createElement("div");
    div.className = "list-item" + (h["@id"] === currentData.activeHeroId ? " active" : "");
    div.dataset.heroId = h["@id"];

    const heroClass = getHeroClass(h);
    const heroName = getHeroName(h);
    const tokenColor = h["robos:tokenColor"] || "#b91c1c";
    const gold = h["robos:gold"] !== undefined ? h["robos:gold"] : 100;

    div.innerHTML = `
      <span style="font-size:1.1rem; color:${tokenColor};">●</span>
      <div class="hero-item-details">
        <strong class="hero-item-name">${heroName}</strong>
        <span class="hero-class-tag">${heroClass}</span>
      </div>
      <span class="gold-badge hero-item-gold">${gold}gp</span>
    `;

    div.onclick = () => selectHero(h["@id"]);
    container.appendChild(div);
  });

  if (!currentData.activeHeroId && currentData.heroes.length > 0) {
    selectHero(currentData.heroes[0]["@id"]);
  }
}

function selectHero(heroId) {
  currentData.activeHeroId = heroId;
  const hero = currentData.heroes.find(h => h["@id"] === heroId);
  if (!hero) return;

  // Ensure default state properties
  if (hero["robos:heroClass"] === undefined) hero["robos:heroClass"] = getHeroClass(hero);
  if (hero["robos:gold"] === undefined) hero["robos:gold"] = 100;
  if (hero["robos:equippedWeapon"] === undefined) hero["robos:equippedWeapon"] = getHeroWeapon(hero);
  if (hero["robos:equippedArmor"] === undefined) hero["robos:equippedArmor"] = getHeroArmor(hero);
  if (!Array.isArray(hero["robos:inventory"])) hero["robos:inventory"] = getHeroInventory(hero);

  const maxBP = parseInt(hero["robos:bodyPoints"], 10) || 8;
  const maxMP = parseInt(hero["robos:mindPoints"], 10) || 2;
  if (hero["robos:currentBP"] === undefined) hero["robos:currentBP"] = maxBP;
  if (hero["robos:currentMP"] === undefined) hero["robos:currentMP"] = maxMP;

  renderHeroesList();

  // Populate Hero Form
  const heroName = getHeroName(hero);
  document.getElementById("hero-editor-title").textContent = "Edit Hero: " + heroName;
  document.getElementById("hero-id").value = hero["@id"] || "";
  document.getElementById("hero-name").value = heroName;
  document.getElementById("hero-class").value = hero["robos:heroClass"] || "";
  document.getElementById("hero-bp").value = hero["robos:bodyPoints"] || 8;
  document.getElementById("hero-mp").value = hero["robos:mindPoints"] || 2;
  document.getElementById("hero-atk").value = hero["robos:attackDice"] || 3;
  document.getElementById("hero-def").value = hero["robos:defendDice"] || 2;
  document.getElementById("hero-gold").value = hero["robos:gold"] !== undefined ? hero["robos:gold"] : 100;
  document.getElementById("hero-weapon").value = hero["robos:equippedWeapon"] || hero["robos:startingWeapon"] || "";
  document.getElementById("hero-armor").value = hero["robos:equippedArmor"] || "";
  document.getElementById("hero-ability").value = hero["robos:specialAbility"] || "";
  document.getElementById("hero-color").value = hero["robos:tokenColor"] || "#b91c1c";
  document.getElementById("hero-icon").value = hero["robos:icon"] || "🛡️";
  document.getElementById("hero-pos-x").value = (hero["robos:startingPosition"] && hero["robos:startingPosition"][0]) || 1;
  document.getElementById("hero-pos-y").value = (hero["robos:startingPosition"] && hero["robos:startingPosition"][1]) || 1;

  // Render Inventory, Grimoire & Action Screen
  renderHeroInventory(hero);
  renderHeroGrimoire(hero);
  renderHeroActionScreen(hero);
}

// Render Backpack Inventory
function renderHeroInventory(hero) {
  const container = document.getElementById("hero-inventory-list");
  if (!container) return;
  const items = hero["robos:inventory"] || [];
  if (items.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:0.8rem; font-style:italic;">Backpack is empty. Select an item above and click "+ Add Item".</div>`;
    return;
  }
  container.innerHTML = "";
  items.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "inventory-item-row";
    row.innerHTML = `
      <div class="inventory-item-info">
        <span style="font-size:1.1rem;">🎒</span>
        <div>
          <strong>${item.name}</strong>
          <div class="inventory-item-type">${item.type || 'item'} • ${item.effect || ''}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center;">
        <span class="inventory-item-val">${item.value ? item.value + ' GP' : ''}</span>
        <button class="btn btn-xs btn-danger btn-del-item" data-idx="${idx}" title="Remove Item">✕</button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll(".btn-del-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const removed = hero["robos:inventory"].splice(idx, 1)[0];
      renderHeroInventory(hero);
      logCombatAction(`🎒 Removed ${removed?.name || 'item'} from inventory.`, "system");
      triggerHeroAutosave();
    });
  });
}

const PRESET_ITEMS = {
  "potion-healing": { id: "item-pot-heal", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 },
  "holy-water": { id: "item-holy-water", name: "Holy Water", type: "relic", effect: "Dispel/Kill Undead", value: 200 },
  "tool-kit": { id: "item-tool-kit", name: "Trap Disarm Toolkit", type: "tool", effect: "Disarm traps without rolling skull", value: 75 },
  "heavy-rope": { id: "item-rope", name: "Heavy Rope (30 ft)", type: "tool", effect: "Cross pits or climb chasms", value: 25 },
  "torch": { id: "item-torch", name: "Dungeon Torch", type: "tool", effect: "Light darkness for 3 turns", value: 15 },
  "potion-strength": { id: "item-strength", name: "Potion of Strength", type: "potion", effect: "+2 Attack Dice for 1 turn", value: 150 }
};

function addHeroInventoryItem() {
  const hero = getActiveHero();
  if (!hero) return;
  const select = document.getElementById("hero-preset-item");
  const key = select?.value || "potion-healing";
  const preset = PRESET_ITEMS[key] || PRESET_ITEMS["potion-healing"];
  if (!hero["robos:inventory"]) hero["robos:inventory"] = [];
  hero["robos:inventory"].push({ ...preset, id: `${preset.id}-${Date.now().toString(36)}` });
  renderHeroInventory(hero);
  logCombatAction(`🎒 Added ${preset.name} to ${hero["dcterms:title"]}'s backpack.`, "system");
  triggerHeroAutosave();
}

function removeHeroInventoryItem(index) {
  const hero = getActiveHero();
  if (!hero || !hero["robos:inventory"]) return;
  const removed = hero["robos:inventory"].splice(index, 1)[0];
  renderHeroInventory(hero);
  logCombatAction(`🎒 Removed ${removed?.name || 'item'} from inventory.`, "system");
  triggerHeroAutosave();
}

// Render Action Screen & Combat HUD
function renderHeroActionScreen(hero) {
  if (!hero) return;
  const nameEl = document.getElementById("act-hero-name");
  const classEl = document.getElementById("act-hero-class");
  const goldEl = document.getElementById("act-hero-gold");
  const iconEl = document.getElementById("act-hero-icon");
  const atkStat = document.getElementById("act-atk-stat");
  const atkWeapon = document.getElementById("act-atk-weapon");
  const defStat = document.getElementById("act-def-stat");
  const defArmor = document.getElementById("act-def-armor");

  const heroName = getHeroName(hero);
  const heroClass = getHeroClass(hero);
  const heroGold = hero["robos:gold"] !== undefined ? hero["robos:gold"] : 100;

  if (nameEl) nameEl.textContent = heroName;
  if (classEl) classEl.textContent = heroClass;
  if (goldEl) goldEl.textContent = `💰 ${heroGold} GP`;
  if (iconEl) {
    iconEl.textContent = hero["robos:icon"] || "🛡️";
    iconEl.style.borderColor = hero["robos:tokenColor"] || "#b91c1c";
  }

  const atkDice = hero["robos:attackDice"] || 3;
  const defDice = hero["robos:defendDice"] || 2;
  const weapon = getHeroWeapon(hero);
  const armor = getHeroArmor(hero);

  if (atkStat) atkStat.textContent = `${atkDice} Combat Dice`;
  if (atkWeapon) atkWeapon.textContent = weapon;
  if (defStat) defStat.textContent = `${defDice} Combat Dice`;
  if (defArmor) defArmor.textContent = armor;

  renderVitalityPips(hero);
  renderHeroSpellActionModule(hero);
}

function renderVitalityPips(hero) {
  const bpTrack = document.getElementById("act-bp-track");
  const mpTrack = document.getElementById("act-mp-track");
  const maxBP = parseInt(hero["robos:bodyPoints"], 10) || 8;
  const curBP = Math.max(0, Math.min(maxBP, hero["robos:currentBP"] !== undefined ? hero["robos:currentBP"] : maxBP));
  const maxMP = parseInt(hero["robos:mindPoints"], 10) || 2;
  const curMP = Math.max(0, Math.min(maxMP, hero["robos:currentMP"] !== undefined ? hero["robos:currentMP"] : maxMP));

  hero["robos:currentBP"] = curBP;
  hero["robos:currentMP"] = curMP;

  if (bpTrack) {
    bpTrack.innerHTML = "";
    for (let i = 0; i < maxBP; i++) {
      const pip = document.createElement("span");
      pip.className = `pip ${i < curBP ? 'bp-active' : 'bp-lost'}`;
      pip.title = `BP ${i + 1}/${maxBP}`;
      bpTrack.appendChild(pip);
    }
  }

  if (mpTrack) {
    mpTrack.innerHTML = "";
    for (let i = 0; i < maxMP; i++) {
      const pip = document.createElement("span");
      pip.className = `pip ${i < curMP ? 'mp-active' : 'mp-lost'}`;
      pip.title = `MP ${i + 1}/${maxMP}`;
      mpTrack.appendChild(pip);
    }
  }
}

// Combat Roll Actions
function rollHeroCombatDie() {
  const r = Math.floor(Math.random() * 6) + 1;
  if (r <= 3) return { type: "skull", label: "💀 Skull", faceClass: "dice-skull" };
  if (r <= 5) return { type: "white-shield", label: "🛡️ Shield", faceClass: "dice-shield" };
  return { type: "black-shield", label: "⬛ Black Shield", faceClass: "dice-black-shield" };
}

function rollHeroAttack() {
  const hero = getActiveHero();
  if (!hero) return null;
  const numDice = parseInt(hero["robos:attackDice"], 10) || 3;
  const rolls = [];
  let skulls = 0;
  for (let i = 0; i < numDice; i++) {
    const die = rollHeroCombatDie();
    rolls.push(die);
    if (die.type === "skull") skulls++;
  }

  const resultBox = document.getElementById("act-atk-result");
  if (resultBox) {
    resultBox.innerHTML = rolls.map(r => `<span class="dice-badge ${r.faceClass}">${r.label}</span>`).join(" ");
  }

  const weapon = getHeroWeapon(hero);
  logCombatAction(`⚔️ ${hero["dcterms:title"]} rolled Attack (${numDice} dice with ${weapon}): ${rolls.map(r => r.type === "skull" ? "💀" : (r.type === "white-shield" ? "🛡️" : "⬛")).join(" ")} — [${skulls} Skull${skulls !== 1 ? 's' : ''} Hit!]`, "attack");
  return { numDice, rolls, skulls };
}

function rollHeroDefend() {
  const hero = getActiveHero();
  if (!hero) return null;
  const numDice = parseInt(hero["robos:defendDice"], 10) || 2;
  const rolls = [];
  let shields = 0;
  for (let i = 0; i < numDice; i++) {
    const die = rollHeroCombatDie();
    rolls.push(die);
    if (die.type === "white-shield") shields++;
  }

  const resultBox = document.getElementById("act-def-result");
  if (resultBox) {
    resultBox.innerHTML = rolls.map(r => `<span class="dice-badge ${r.faceClass}">${r.label}</span>`).join(" ");
  }

  const armor = getHeroArmor(hero);
  logCombatAction(`🛡️ ${hero["dcterms:title"]} rolled Defend (${numDice} dice with ${armor}): ${rolls.map(r => r.type === "skull" ? "💀" : (r.type === "white-shield" ? "🛡️" : "⬛")).join(" ")} — [${shields} White Shield${shields !== 1 ? 's' : ''} Defended]`, "defend");
  return { numDice, rolls, shields };
}

function rollHeroMove() {
  const hero = getActiveHero();
  if (!hero) return null;
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const total = d1 + d2;

  const resultBox = document.getElementById("act-move-result");
  if (resultBox) {
    resultBox.innerHTML = `<span class="dice-badge dice-d6">🎲 ${d1}</span> + <span class="dice-badge dice-d6">🎲 ${d2}</span> = <strong>${total} Squares</strong>`;
  }

  logCombatAction(`🏃 ${hero["dcterms:title"]} rolled 2d6 Movement: [${d1}] + [${d2}] = ${total} squares available.`, "move");
  return { d1, d2, total };
}

function logCombatAction(msg, type = "system") {
  const logEl = document.getElementById("combat-roll-log");
  if (!logEl) return;
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `[${time}] ${msg}`;
  logEl.prepend(entry);
}

// Auto-save & Manual Save to KGraph
async function saveActiveHeroToKGraph(explicit = false) {
  const hero = getActiveHero();
  if (!hero) return { success: false, error: "No active hero" };

  const indicator = document.getElementById("hero-autosave-indicator");
  if (indicator) {
    indicator.textContent = "● Saving...";
    indicator.classList.add("saving");
  }

  const heroNode = {
    "@id": hero["@id"],
    "@type": [
      "oslc_am:Resource",
      "robos:TabletopHero",
      "robos:GameCharacter",
      "schema:Person"
    ],
    "dcterms:title": hero["dcterms:title"] || "Hero",
    "robos:heroClass": hero["robos:heroClass"] || getHeroClass(hero),
    "robos:bodyPoints": parseInt(hero["robos:bodyPoints"], 10) || 8,
    "robos:mindPoints": parseInt(hero["robos:mindPoints"], 10) || 2,
    "robos:attackDice": parseInt(hero["robos:attackDice"], 10) || 3,
    "robos:defendDice": parseInt(hero["robos:defendDice"], 10) || 2,
    "robos:gold": parseInt(hero["robos:gold"], 10) || 0,
    "robos:startingWeapon": hero["robos:startingWeapon"] || getHeroWeapon(hero),
    "robos:equippedWeapon": hero["robos:equippedWeapon"] || getHeroWeapon(hero),
    "robos:equippedArmor": hero["robos:equippedArmor"] || getHeroArmor(hero),
    "robos:inventory": hero["robos:inventory"] || [],
    "robos:specialAbility": hero["robos:specialAbility"] || "",
    "robos:tokenColor": hero["robos:tokenColor"] || "#b91c1c",
    "robos:icon": hero["robos:icon"] || "🛡️",
    "robos:startingPosition": hero["robos:startingPosition"] || [1, 1],
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  };

  try {
    const res = await window.robosTabletop.saveKGraphEntity({ entity: heroNode });
    if (indicator) {
      setTimeout(() => {
        indicator.textContent = "● Saved";
        indicator.classList.remove("saving");
      }, 250);
    }
    if (explicit) {
      if (res && res.success) {
        setStatus(`Saved hero '${heroNode["dcterms:title"]}' (${heroNode["robos:heroClass"]}) to Knowledge Graph.`);
        logCombatAction(`💾 Hero '${heroNode["dcterms:title"]}' saved to Knowledge Graph package 'tabletop-game'.`, "system");
      } else {
        setStatus(`Error saving hero: ${res ? res.error : "Unknown"}`);
      }
    }
    return res;
  } catch (err) {
    if (indicator) {
      indicator.textContent = "● Error";
      indicator.classList.remove("saving");
    }
    if (explicit) setStatus(`Save failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

let heroAutosaveTimer = null;
function triggerHeroAutosave() {
  const indicator = document.getElementById("hero-autosave-indicator");
  if (indicator) {
    indicator.textContent = "● Editing...";
    indicator.classList.add("saving");
  }
  clearTimeout(heroAutosaveTimer);
  heroAutosaveTimer = setTimeout(() => {
    saveActiveHeroToKGraph(false);
  }, 400);
}

// Setup Event Listeners for Hero Editor
let heroControlsInitialized = false;
function setupHeroEditorControls() {
  if (heroControlsInitialized) return;
  heroControlsInitialized = true;

  // Live Name Updates
  document.getElementById("hero-name")?.addEventListener("input", (e) => {
    const hero = getActiveHero();
    if (!hero) return;
    const newName = e.target.value;
    hero["dcterms:title"] = newName;
    document.getElementById("hero-editor-title").textContent = "Edit Hero: " + newName;

    const listItemName = document.querySelector(`#heroes-list .list-item[data-hero-id="${hero["@id"]}"] .hero-item-name`);
    if (listItemName) listItemName.textContent = newName;

    const actName = document.getElementById("act-hero-name");
    if (actName) actName.textContent = newName;

    triggerHeroAutosave();
  });

  // Live Class Updates
  document.getElementById("hero-class")?.addEventListener("input", (e) => {
    const hero = getActiveHero();
    if (!hero) return;
    const newClass = e.target.value;
    hero["robos:heroClass"] = newClass;

    const listClassTag = document.querySelector(`#heroes-list .list-item[data-hero-id="${hero["@id"]}"] .hero-class-tag`);
    if (listClassTag) listClassTag.textContent = newClass;

    const actClass = document.getElementById("act-hero-class");
    if (actClass) actClass.textContent = newClass;

    triggerHeroAutosave();
  });

  // Numeric Stats & String Inputs Live Auto-save
  const bindStatInput = (id, prop, isInt = true) => {
    document.getElementById(id)?.addEventListener("input", (e) => {
      const hero = getActiveHero();
      if (!hero) return;
      hero[prop] = isInt ? (parseInt(e.target.value, 10) || 0) : e.target.value;
      renderHeroActionScreen(hero);
      triggerHeroAutosave();
    });
  };

  bindStatInput("hero-bp", "robos:bodyPoints", true);
  bindStatInput("hero-mp", "robos:mindPoints", true);
  bindStatInput("hero-atk", "robos:attackDice", true);
  bindStatInput("hero-def", "robos:defendDice", true);
  bindStatInput("hero-gold", "robos:gold", true);
  bindStatInput("hero-weapon", "robos:equippedWeapon", false);
  bindStatInput("hero-armor", "robos:equippedArmor", false);
  bindStatInput("hero-ability", "robos:specialAbility", false);
  bindStatInput("hero-color", "robos:tokenColor", false);
  bindStatInput("hero-icon", "robos:icon", false);

  // Position inputs
  ["hero-pos-x", "hero-pos-y"].forEach(posId => {
    document.getElementById(posId)?.addEventListener("input", () => {
      const hero = getActiveHero();
      if (!hero) return;
      const x = parseInt(document.getElementById("hero-pos-x").value, 10) || 1;
      const y = parseInt(document.getElementById("hero-pos-y").value, 10) || 1;
      hero["robos:startingPosition"] = [x, y];
      triggerHeroAutosave();
    });
  });

  // Quick Gold Buttons
  document.querySelectorAll(".btn-quick-gold").forEach(btn => {
    btn.addEventListener("click", () => {
      const hero = getActiveHero();
      if (!hero) return;
      const amount = parseInt(btn.dataset.amount, 10) || 0;
      const currentGold = parseInt(document.getElementById("hero-gold").value, 10) || 0;
      const nextGold = Math.max(0, currentGold + amount);
      document.getElementById("hero-gold").value = nextGold;
      hero["robos:gold"] = nextGold;

      const actGold = document.getElementById("act-hero-gold");
      if (actGold) actGold.textContent = `💰 ${nextGold} GP`;

      const listGold = document.querySelector(`#heroes-list .list-item[data-hero-id="${hero["@id"]}"] .hero-item-gold`);
      if (listGold) listGold.textContent = `${nextGold}gp`;

      logCombatAction(`💰 ${hero["dcterms:title"]} received +${amount} gold coins (Total: ${nextGold} GP).`, "system");
      triggerHeroAutosave();
    });
  });

  // Add Item to Inventory Button
  document.getElementById("btn-add-inventory-item")?.addEventListener("click", addHeroInventoryItem);

  // Save Hero Button
  document.getElementById("btn-save-hero")?.addEventListener("click", () => {
    saveActiveHeroToKGraph(true);
  });

  // Add Hero Button
  document.getElementById("btn-add-hero")?.addEventListener("click", () => {
    const timestamp = Date.now().toString(36);
    const newHeroId = `urn:robos:tabletop:hero:hero-${timestamp}`;
    const newHero = {
      "@id": newHeroId,
      "@type": [
        "oslc_am:Resource",
        "robos:TabletopHero",
        "robos:GameCharacter",
        "schema:Person"
      ],
      "dcterms:title": "New Hero",
      "robos:heroClass": "Paladin",
      "robos:bodyPoints": 7,
      "robos:mindPoints": 3,
      "robos:attackDice": 3,
      "robos:defendDice": 2,
      "robos:gold": 50,
      "robos:startingWeapon": "Longsword (3 Combat Dice)",
      "robos:equippedWeapon": "Longsword (3 Combat Dice)",
      "robos:equippedArmor": "Chainmail & Shield (+2 Defend Dice)",
      "robos:inventory": [
        { id: `item-pot-${timestamp}`, name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 }
      ],
      "robos:tokenColor": "#8b5cf6",
      "robos:icon": "🛡️",
      "robos:startingPosition": [1, 1],
      "robos:package": "tabletop-game",
      "robos:namespace": "robos.tabletop"
    };

    currentData.heroes.push(newHero);
    renderHeroesList();
    selectHero(newHeroId);
    saveActiveHeroToKGraph(false);
    setStatus(`Created new hero: ${newHero["dcterms:title"]}`);
    logCombatAction(`✨ Created new hero: ${newHero["dcterms:title"]} (${newHero["robos:heroClass"]}).`, "system");
    document.getElementById("hero-name")?.focus();
  });

  // Delete Hero Button
  document.getElementById("btn-delete-hero")?.addEventListener("click", () => {
    if (currentData.heroes.length <= 1) {
      alert("Cannot delete the last remaining hero.");
      return;
    }
    const hero = getActiveHero();
    if (!hero) return;
    const name = hero["dcterms:title"] || "Hero";
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    const idx = currentData.heroes.findIndex(h => h["@id"] === currentData.activeHeroId);
    if (idx >= 0) {
      currentData.heroes.splice(idx, 1);
      currentData.activeHeroId = currentData.heroes[0]["@id"];
      renderHeroesList();
      selectHero(currentData.activeHeroId);
      setStatus(`Deleted hero: ${name}`);
      logCombatAction(`🗑️ Deleted hero: ${name}.`, "system");
    }
  });

  // Vitality Track Damage & Heal Buttons
  document.getElementById("btn-act-dmg-bp")?.addEventListener("click", () => {
    const hero = getActiveHero();
    if (!hero || hero["robos:currentBP"] <= 0) return;
    hero["robos:currentBP"]--;
    renderVitalityPips(hero);
    logCombatAction(`💔 ${hero["dcterms:title"]} took 1 Damage! (BP: ${hero["robos:currentBP"]}/${hero["robos:bodyPoints"]})`, "attack");
    triggerHeroAutosave();
  });

  document.getElementById("btn-act-heal-bp")?.addEventListener("click", () => {
    const hero = getActiveHero();
    const maxBP = parseInt(hero["robos:bodyPoints"], 10) || 8;
    if (!hero || hero["robos:currentBP"] >= maxBP) return;
    hero["robos:currentBP"]++;
    renderVitalityPips(hero);
    logCombatAction(`❤️ ${hero["dcterms:title"]} healed 1 BP! (BP: ${hero["robos:currentBP"]}/${maxBP})`, "defend");
    triggerHeroAutosave();
  });

  document.getElementById("btn-act-dmg-mp")?.addEventListener("click", () => {
    const hero = getActiveHero();
    if (!hero || hero["robos:currentMP"] <= 0) return;
    hero["robos:currentMP"]--;
    renderVitalityPips(hero);
    logCombatAction(`🔮 ${hero["dcterms:title"]} spent 1 Mind Point! (MP: ${hero["robos:currentMP"]}/${hero["robos:mindPoints"]})`, "attack");
    triggerHeroAutosave();
  });

  document.getElementById("btn-act-heal-mp")?.addEventListener("click", () => {
    const hero = getActiveHero();
    const maxMP = parseInt(hero["robos:mindPoints"], 10) || 2;
    if (!hero || hero["robos:currentMP"] >= maxMP) return;
    hero["robos:currentMP"]++;
    renderVitalityPips(hero);
    logCombatAction(`✨ ${hero["dcterms:title"]} restored 1 Mind Point! (MP: ${hero["robos:currentMP"]}/${maxMP})`, "defend");
    triggerHeroAutosave();
  });

  // Action Roll Buttons
  document.getElementById("btn-roll-hero-attack")?.addEventListener("click", rollHeroAttack);
  document.getElementById("btn-roll-hero-defend")?.addEventListener("click", rollHeroDefend);
  document.getElementById("btn-roll-hero-move")?.addEventListener("click", rollHeroMove);
}

// ==========================================
// 2. MONSTERS, BOSSES & DREAD GRIMOIRE ENGINE
// ==========================================

function getActiveMonster() {
  if (!Array.isArray(currentData.monsters)) return null;
  return currentData.monsters.find(m => m["@id"] === currentData.activeMonsterId) || currentData.monsters[0] || null;
}

function getMonsterSpells(monster) {
  if (!monster) return [];
  const assigned = monster["robos:spells"] || [];
  return assigned.map(sp => {
    if (typeof sp === "object" && sp !== null) return sp;
    const slug = String(sp).replace("urn:robos:tabletop:spell:", "");
    return DREAD_SPELLS.find(ds => ds.slug === slug || ds.id === sp) || {
      id: sp,
      slug: slug,
      name: slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      element: "dread",
      icon: "⚡",
      description: "Dread Chaos spell."
    };
  });
}

function addMonsterSpell(monster, spellSlug) {
  if (!monster || !spellSlug) return;
  if (!Array.isArray(monster["robos:spells"])) {
    monster["robos:spells"] = [];
  }
  const fullId = `urn:robos:tabletop:spell:${spellSlug}`;
  if (!monster["robos:spells"].some(s => s === fullId || (typeof s === "object" && s.slug === spellSlug) || s === spellSlug)) {
    monster["robos:spells"].push(fullId);
    monster["robos:isSpellcaster"] = true;
    renderMonsterGrimoire(monster);
    renderMonsterActionScreen(monster);
    triggerMonsterAutosave();
    logMonsterCombatAction(`⚡ Added Dread spell '${spellSlug}' to ${monster["dcterms:title"] || "Monster"} grimoire.`, "chaos");
  }
}

function removeMonsterSpell(monster, spellSlug) {
  if (!monster || !Array.isArray(monster["robos:spells"])) return;
  const fullId = `urn:robos:tabletop:spell:${spellSlug}`;
  monster["robos:spells"] = monster["robos:spells"].filter(s => s !== fullId && s !== spellSlug && (typeof s !== "object" || s.slug !== spellSlug));
  renderMonsterGrimoire(monster);
  renderMonsterActionScreen(monster);
  triggerMonsterAutosave();
  logMonsterCombatAction(`🗑️ Removed Dread spell '${spellSlug}' from ${monster["dcterms:title"] || "Monster"} grimoire.`, "system");
}

function renderMonsterGrimoire(monster) {
  const section = document.getElementById("monster-spells-section");
  const chipsList = document.getElementById("monster-assigned-spells-list");
  const select = document.getElementById("monster-spell-add-select");
  if (!section || !chipsList) return;

  const isSpellcaster = !!monster?.["robos:isSpellcaster"];
  section.style.display = isSpellcaster ? "block" : "none";

  if (!isSpellcaster || !monster) {
    chipsList.innerHTML = "";
    return;
  }

  const assigned = getMonsterSpells(monster);
  const assignedSlugs = assigned.map(s => s.slug);

  chipsList.innerHTML = "";
  if (assigned.length === 0) {
    chipsList.innerHTML = `<span class="text-muted" style="font-size:12px; font-style:italic;">No spells memorized. Select from the dropdown above to add Dread spells.</span>`;
  } else {
    assigned.forEach(s => {
      const chip = document.createElement("div");
      chip.className = "monster-spell-chip";
      chip.innerHTML = `
        <span>${s.icon || "⚡"}</span>
        <strong>${s.name}</strong>
        <button class="btn-remove-chip" title="Remove spell">&times;</button>
      `;
      chip.querySelector(".btn-remove-chip")?.addEventListener("click", () => {
        removeMonsterSpell(monster, s.slug);
      });
      chipsList.appendChild(chip);
    });
  }

  // Populate dropdown with unassigned dread spells
  if (select) {
    select.innerHTML = "";
    const available = DREAD_SPELLS.filter(ds => !assignedSlugs.includes(ds.slug));
    if (available.length === 0) {
      select.innerHTML = `<option value="">All 8 Dread Spells Memorized</option>`;
      select.disabled = true;
      const addBtn = document.getElementById("btn-monster-add-spell");
      if (addBtn) addBtn.disabled = true;
    } else {
      select.disabled = false;
      const addBtn = document.getElementById("btn-monster-add-spell");
      if (addBtn) addBtn.disabled = false;
      available.forEach(ds => {
        const opt = document.createElement("option");
        opt.value = ds.slug;
        opt.textContent = `${ds.icon} ${ds.name}`;
        select.appendChild(opt);
      });
    }
  }
}

function renderMonsterActionScreen(monster) {
  if (!monster) return;
  const nameEl = document.getElementById("act-monster-name");
  const typeTag = document.getElementById("act-monster-type-tag");
  const casterBadge = document.getElementById("act-monster-spellcaster-badge");
  const iconEl = document.getElementById("act-monster-icon");
  const atkStat = document.getElementById("act-monster-atk-stat");
  const defStat = document.getElementById("act-monster-def-stat");
  const moveStat = document.getElementById("act-monster-move-stat");

  if (nameEl) nameEl.textContent = monster["dcterms:title"] || "Monster";
  if (typeTag) {
    if (monster["robos:isBoss"]) {
      typeTag.textContent = "Boss Monster";
      typeTag.style.background = "#581c87";
      typeTag.style.color = "#f3e8ff";
      typeTag.style.borderColor = "#a855f7";
    } else if (monster["robos:isUndead"]) {
      typeTag.textContent = "Undead";
      typeTag.style.background = "#1f2937";
      typeTag.style.color = "#9ca3af";
      typeTag.style.borderColor = "#4b5563";
    } else {
      typeTag.textContent = "Monster";
      typeTag.style.background = "#450a0a";
      typeTag.style.color = "#fca5a5";
      typeTag.style.borderColor = "#991b1b";
    }
  }

  if (iconEl) {
    if (monster["robos:isBoss"]) iconEl.textContent = "👑";
    else if (monster["robos:isUndead"]) iconEl.textContent = "💀";
    else if (monster["robos:isSpellcaster"]) iconEl.textContent = "🧙‍♂️";
    else iconEl.textContent = "👹";
  }

  const isSpellcaster = !!monster["robos:isSpellcaster"];
  if (casterBadge) casterBadge.style.display = isSpellcaster ? "inline-block" : "none";

  if (atkStat) atkStat.textContent = `${monster["robos:attackDice"] || 2} Combat Dice`;
  if (defStat) defStat.textContent = `${monster["robos:defendDice"] || 2} Combat Dice`;
  if (moveStat) moveStat.textContent = `${monster["robos:movementSquares"] || 6} Squares`;

  renderMonsterVitalityPips(monster);

  const spellModule = document.getElementById("act-mon-spell-module");
  const spellCount = document.getElementById("act-mon-spell-count");
  const spellSelect = document.getElementById("act-mon-spell-select");

  if (spellModule) {
    spellModule.style.display = isSpellcaster ? "flex" : "none";
  }

  if (isSpellcaster && spellSelect && spellCount) {
    const spells = getMonsterSpells(monster);
    spellCount.textContent = `${spells.length} Spell${spells.length !== 1 ? 's' : ''}`;
    spellSelect.innerHTML = "";
    if (spells.length === 0) {
      spellSelect.innerHTML = `<option value="">No spells memorized</option>`;
      spellSelect.disabled = true;
      const castBtn = document.getElementById("btn-cast-monster-spell");
      if (castBtn) castBtn.disabled = true;
    } else {
      spellSelect.disabled = false;
      const castBtn = document.getElementById("btn-cast-monster-spell");
      if (castBtn) castBtn.disabled = false;
      spells.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.slug;
        opt.textContent = `${s.icon || "⚡"} ${s.name}`;
        spellSelect.appendChild(opt);
      });
    }
  }
}

function renderMonsterVitalityPips(monster) {
  const bpTrack = document.getElementById("act-monster-bp-track");
  if (!bpTrack || !monster) return;

  const maxBP = parseInt(monster["robos:bodyPoints"], 10) || 1;
  if (monster["robos:currentBP"] === undefined) {
    monster["robos:currentBP"] = maxBP;
  }
  const currentBP = Math.min(maxBP, Math.max(0, monster["robos:currentBP"]));
  monster["robos:currentBP"] = currentBP;

  bpTrack.innerHTML = "";
  for (let i = 1; i <= maxBP; i++) {
    const pip = document.createElement("span");
    pip.className = `pip ${i <= currentBP ? "bp-active" : "bp-lost"}`;
    pip.title = `BP ${i}/${maxBP}`;
    bpTrack.appendChild(pip);
  }
}

function rollMonsterAttack() {
  const monster = getActiveMonster();
  if (!monster) return null;
  const numDice = parseInt(monster["robos:attackDice"], 10) || 2;
  const rolls = [];
  let skulls = 0;
  for (let i = 0; i < numDice; i++) {
    const die = rollHeroCombatDie();
    rolls.push(die);
    if (die.type === "skull") skulls++;
  }

  const resultBox = document.getElementById("act-monster-atk-result");
  if (resultBox) {
    resultBox.innerHTML = rolls.map(r => `<span class="dice-badge ${r.faceClass}">${r.label}</span>`).join(" ");
  }

  logMonsterCombatAction(`⚔️ ${monster["dcterms:title"]} rolled Monster Attack (${numDice} dice): ${rolls.map(r => r.type === "skull" ? "💀" : (r.type === "white-shield" ? "🛡️" : "⬛")).join(" ")} — [${skulls} Skull${skulls !== 1 ? 's' : ''} Hit!]`, "attack");
  return { numDice, rolls, skulls };
}

function rollMonsterDefend() {
  const monster = getActiveMonster();
  if (!monster) return null;
  const numDice = parseInt(monster["robos:defendDice"], 10) || 2;
  const rolls = [];
  let blackShields = 0;
  for (let i = 0; i < numDice; i++) {
    const die = rollHeroCombatDie();
    rolls.push(die);
    // Authentic HeroQuest Rule: Monsters defend ONLY on Black Shields (⬛ Black Shield)
    if (die.type === "black-shield") blackShields++;
  }

  const resultBox = document.getElementById("act-monster-def-result");
  if (resultBox) {
    resultBox.innerHTML = rolls.map(r => `<span class="dice-badge ${r.faceClass}">${r.label}</span>`).join(" ");
  }

  logMonsterCombatAction(`⬛ ${monster["dcterms:title"]} rolled Monster Defend (${numDice} dice): ${rolls.map(r => r.type === "skull" ? "💀" : (r.type === "white-shield" ? "🛡️" : "⬛")).join(" ")} — [${blackShields} Black Shield${blackShields !== 1 ? 's' : ''} Defended]`, "defend");
  return { numDice, rolls, blackShields };
}

function rollMonsterMove() {
  const monster = getActiveMonster();
  if (!monster) return null;
  const moveSquares = parseInt(monster["robos:movementSquares"], 10) || 6;
  const resultBox = document.getElementById("act-monster-move-result");
  if (resultBox) {
    resultBox.innerHTML = `<span class="dice-badge dice-d6">👣 Move Allowance</span> = <strong>${moveSquares} Squares</strong>`;
  }
  logMonsterCombatAction(`👣 ${monster["dcterms:title"]} advances up to ${moveSquares} squares.`, "move");
  return { moveSquares };
}

function castMonsterSpell(monster, spellSlug) {
  if (!monster) monster = getActiveMonster();
  if (!monster) return null;

  if (!spellSlug) {
    const select = document.getElementById("act-mon-spell-select");
    spellSlug = select ? select.value : "";
  }
  if (!spellSlug) return null;

  const spell = DREAD_SPELLS.find(s => s.slug === spellSlug) || {
    slug: spellSlug,
    name: spellSlug,
    icon: "⚡",
    description: "Invoked Dread spell",
    effect: "dread-chaos"
  };

  const resultBox = document.getElementById("act-mon-spell-result");
  if (resultBox) {
    resultBox.innerHTML = `<span class="dice-badge" style="background:#581c87; color:#f3e8ff; border:1px solid #7e22ce;">${spell.icon} ${spell.name}</span>`;
  }

  let effectDescription = "";
  if (spell.slug === "lightning-bolt") {
    effectDescription = "Strikes target hero with black electricity for 2 BP damage! (Target rolls 2 defense dice)";
  } else if (spell.slug === "firestorm") {
    effectDescription = "Unleashes inferno across room for 3 BP damage! (Targets roll 3 defense dice)";
  } else if (spell.slug === "fear") {
    effectDescription = "Instills horrific dread! Target hero attacks with only 1 combat die on next turn.";
  } else if (spell.slug === "sleep-dread") {
    effectDescription = "Inflicts dark slumber! Hero falls asleep until rolling a 6 or wounded.";
  } else if (spell.slug === "cloud-of-chaos") {
    effectDescription = "Noxious vapors choke target hero! Hero loses their entire next turn.";
  } else if (spell.slug === "summon-undead") {
    effectDescription = "Chants necromantic rite! 2 Skeletons or Zombies rise from stone to attack!";
  } else if (spell.slug === "rust") {
    effectDescription = "Decays metal! Target hero's weapon or helmet corrodes into brittle rust.";
  } else if (spell.slug === "escape") {
    effectDescription = "Sorcerer dissolves into shadow and teleports away to another dungeon wing!";
  } else {
    effectDescription = spell.description;
  }

  logMonsterCombatAction(`⚡ ${monster["dcterms:title"]} cast DREAD SPELL: [${spell.icon} ${spell.name}] — ${effectDescription}`, "chaos");
  return { success: true, monster, spell, effectDescription };
}

function logMonsterCombatAction(msg, type = "system") {
  const logEl = document.getElementById("monster-combat-roll-log");
  if (!logEl) return;
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `[${time}] ${msg}`;
  logEl.prepend(entry);
}

async function saveActiveMonsterToKGraph(explicit = false) {
  const monster = getActiveMonster();
  if (!monster) return { success: false, error: "No active monster" };

  const monsterNode = {
    "@id": monster["@id"],
    "@type": [
      "oslc_am:Resource",
      "robos:TabletopMonster",
      "robos:GameMonster",
      "schema:Person"
    ],
    "dcterms:title": monster["dcterms:title"] || "Monster",
    "robos:bodyPoints": parseInt(monster["robos:bodyPoints"], 10) || 1,
    "robos:attackDice": parseInt(monster["robos:attackDice"], 10) || 2,
    "robos:defendDice": parseInt(monster["robos:defendDice"], 10) || 2,
    "robos:movementSquares": parseInt(monster["robos:movementSquares"], 10) || 6,
    "robos:roomId": monster["robos:roomId"] || "room-center",
    "robos:isBoss": !!monster["robos:isBoss"],
    "robos:isUndead": !!monster["robos:isUndead"],
    "robos:isSpellcaster": !!monster["robos:isSpellcaster"],
    "robos:spells": monster["robos:spells"] || [],
    "robos:tokenColor": monster["robos:tokenColor"] || "#991b1b",
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  };

  try {
    const res = await window.robosTabletop.saveKGraphEntity({ entity: monsterNode });
    if (explicit) {
      if (res && res.success) {
        setStatus(`Saved monster '${monsterNode["dcterms:title"]}' to Knowledge Graph.`);
        logMonsterCombatAction(`💾 Monster '${monsterNode["dcterms:title"]}' saved to Knowledge Graph.`, "system");
      } else {
        setStatus(`Error saving monster: ${res ? res.error : "Unknown"}`);
      }
    }
    return res;
  } catch (err) {
    if (explicit) setStatus(`Save failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

let monsterAutosaveTimer = null;
function triggerMonsterAutosave() {
  clearTimeout(monsterAutosaveTimer);
  monsterAutosaveTimer = setTimeout(() => {
    saveActiveMonsterToKGraph(false);
  }, 400);
}

function renderMonstersList() {
  const container = document.getElementById("monsters-list");
  if (!container) return;
  container.innerHTML = "";

  currentData.monsters.forEach(m => {
    const div = document.createElement("div");
    div.className = "list-item" + (m["@id"] === currentData.activeMonsterId ? " active" : "");
    let icon = "👹";
    if (m["robos:isBoss"]) icon = "👑";
    else if (m["robos:isUndead"]) icon = "💀";
    else if (m["robos:isSpellcaster"]) icon = "🧙‍♂️";
    div.innerHTML = `<span>${icon}</span> <strong>${m["dcterms:title"] || m["@id"]}</strong>`;
    div.onclick = () => selectMonster(m["@id"]);
    container.appendChild(div);
  });

  if (!currentData.activeMonsterId && currentData.monsters.length > 0) {
    selectMonster(currentData.monsters[0]["@id"]);
  }
}

function selectMonster(monsterId) {
  currentData.activeMonsterId = monsterId;
  const monster = currentData.monsters.find(m => m["@id"] === monsterId);
  if (!monster) return;

  renderMonstersList();
  document.getElementById("monster-editor-title").textContent = "Edit Monster: " + (monster["dcterms:title"] || "");
  document.getElementById("monster-id").value = monster["@id"] || "";
  document.getElementById("monster-name").value = monster["dcterms:title"] || "";
  document.getElementById("monster-bp").value = monster["robos:bodyPoints"] || 1;
  document.getElementById("monster-atk").value = monster["robos:attackDice"] || 2;
  document.getElementById("monster-def").value = monster["robos:defendDice"] || 2;
  document.getElementById("monster-move").value = monster["robos:movementSquares"] || 6;
  document.getElementById("monster-room").value = monster["robos:roomId"] || "room-center";
  document.getElementById("monster-is-boss").checked = !!monster["robos:isBoss"];
  document.getElementById("monster-is-undead").checked = !!monster["robos:isUndead"];

  const isCaster = !!monster["robos:isSpellcaster"];
  const casterCheckbox = document.getElementById("monster-is-spellcaster");
  if (casterCheckbox) casterCheckbox.checked = isCaster;

  renderMonsterGrimoire(monster);
  renderMonsterActionScreen(monster);
}

function setupMonsterEditorControls() {
  const bindInput = (id, prop, isNumber = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", (e) => {
      const monster = getActiveMonster();
      if (!monster) return;
      monster[prop] = isNumber ? parseInt(e.target.value, 10) || 0 : e.target.value;
      if (prop === "dcterms:title") {
        document.getElementById("monster-editor-title").textContent = "Edit Monster: " + e.target.value;
        renderMonstersList();
      }
      renderMonsterActionScreen(monster);
      triggerMonsterAutosave();
    });
  };

  bindInput("monster-name", "dcterms:title");
  bindInput("monster-bp", "robos:bodyPoints", true);
  bindInput("monster-atk", "robos:attackDice", true);
  bindInput("monster-def", "robos:defendDice", true);
  bindInput("monster-move", "robos:movementSquares", true);
  bindInput("monster-room", "robos:roomId");

  document.getElementById("monster-is-boss")?.addEventListener("change", (e) => {
    const monster = getActiveMonster();
    if (!monster) return;
    monster["robos:isBoss"] = e.target.checked;
    renderMonstersList();
    renderMonsterActionScreen(monster);
    triggerMonsterAutosave();
  });

  document.getElementById("monster-is-undead")?.addEventListener("change", (e) => {
    const monster = getActiveMonster();
    if (!monster) return;
    monster["robos:isUndead"] = e.target.checked;
    renderMonstersList();
    renderMonsterActionScreen(monster);
    triggerMonsterAutosave();
  });

  document.getElementById("monster-is-spellcaster")?.addEventListener("change", (e) => {
    const monster = getActiveMonster();
    if (!monster) return;
    monster["robos:isSpellcaster"] = e.target.checked;
    if (monster["robos:isSpellcaster"] && (!monster["robos:spells"] || monster["robos:spells"].length === 0)) {
      monster["robos:spells"] = ["urn:robos:tabletop:spell:lightning-bolt"];
    }
    renderMonsterGrimoire(monster);
    renderMonsterActionScreen(monster);
    triggerMonsterAutosave();
  });

  document.getElementById("btn-monster-add-spell")?.addEventListener("click", () => {
    const monster = getActiveMonster();
    const select = document.getElementById("monster-spell-add-select");
    if (!monster || !select || !select.value) return;
    addMonsterSpell(monster, select.value);
  });

  document.getElementById("btn-act-monster-dmg-bp")?.addEventListener("click", () => {
    const monster = getActiveMonster();
    if (!monster || monster["robos:currentBP"] <= 0) return;
    monster["robos:currentBP"]--;
    renderMonsterVitalityPips(monster);
    const maxBP = parseInt(monster["robos:bodyPoints"], 10) || 1;
    logMonsterCombatAction(`💥 ${monster["dcterms:title"]} took 1 damage! (BP: ${monster["robos:currentBP"]}/${maxBP})`, "attack");
    if (monster["robos:currentBP"] === 0) {
      logMonsterCombatAction(`💀 ${monster["dcterms:title"]} has been DEFEATED!`, "system");
    }
  });

  document.getElementById("btn-act-monster-heal-bp")?.addEventListener("click", () => {
    const monster = getActiveMonster();
    const maxBP = parseInt(monster["robos:bodyPoints"], 10) || 1;
    if (!monster || monster["robos:currentBP"] >= maxBP) return;
    monster["robos:currentBP"]++;
    renderMonsterVitalityPips(monster);
    logMonsterCombatAction(`💖 ${monster["dcterms:title"]} healed 1 Body Point! (BP: ${monster["robos:currentBP"]}/${maxBP})`, "defend");
  });

  document.getElementById("btn-roll-monster-attack")?.addEventListener("click", rollMonsterAttack);
  document.getElementById("btn-roll-monster-defend")?.addEventListener("click", rollMonsterDefend);
  document.getElementById("btn-roll-monster-move")?.addEventListener("click", rollMonsterMove);
  document.getElementById("btn-cast-monster-spell")?.addEventListener("click", () => castMonsterSpell());

  document.getElementById("btn-add-monster")?.addEventListener("click", () => {
    const newId = `urn:robos:tabletop:monster:custom-${Date.now().toString(36)}`;
    const newMonster = {
      "@id": newId,
      "@type": [
        "oslc_am:Resource",
        "robos:TabletopMonster",
        "robos:GameMonster",
        "schema:Person"
      ],
      "dcterms:title": "New Monster",
      "robos:bodyPoints": 2,
      "robos:attackDice": 2,
      "robos:defendDice": 2,
      "robos:movementSquares": 6,
      "robos:roomId": "room-center",
      "robos:isBoss": false,
      "robos:isUndead": false,
      "robos:isSpellcaster": false,
      "robos:spells": [],
      "robos:tokenColor": "#991b1b"
    };
    currentData.monsters.push(newMonster);
    renderMonstersList();
    selectMonster(newId);
    triggerMonsterAutosave();
  });
}

// Render Spells & Items
function renderSpellsAndItems() {
  const spellsGrid = document.getElementById("spells-grid");
  if (spellsGrid) {
    spellsGrid.innerHTML = "";
    const elfElement = currentData.spellAllocation?.elfElement || "water";
    const allSpells = [];
    Object.keys(ELEMENTAL_DECKS).forEach(elemKey => {
      ELEMENTAL_DECKS[elemKey].spells.forEach(s => allSpells.push(s));
    });

    allSpells.forEach(s => {
      const card = document.createElement("div");
      card.className = `spell-card deck-${s.element}`;
      const isElf = s.element === elfElement;
      const draftedBy = isElf ? "🧝 Elf Grimoire" : "🧙 Wizard Grimoire";
      const draftedClass = isElf ? "badge-info" : "badge-purple";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <div class="card-title" style="margin:0;">${s.icon} ${s.name}</div>
          <span class="element-tag tag-${s.element}">${s.element.toUpperCase()}</span>
        </div>
        <div class="card-meta" style="color:var(--text-muted); font-size:0.75rem; margin-bottom:6px;">${s.description}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;">
          <span class="card-meta" style="margin:0;">College: ${ELEMENTAL_DECKS[s.element]?.name}</span>
          <span class="badge ${draftedClass}" style="font-size:0.7rem;">${draftedBy}</span>
        </div>
      `;
      spellsGrid.appendChild(card);
    });
  }

  const itemsGrid = document.getElementById("items-grid");
  if (itemsGrid) {
    itemsGrid.innerHTML = "";
    const armory = [
      { name: "Broadsword", type: "Weapon", dice: "3 Attack Dice", cost: "250 GP", icon: "⚔️" },
      { name: "Shortsword", type: "Weapon", dice: "2 Attack Dice (Diagonal)", cost: "150 GP", icon: "🗡️" },
      { name: "Battle Axe", type: "Weapon", dice: "4 Attack Dice (Two-Handed)", cost: "400 GP", icon: "🪓" },
      { name: "Crossbow", type: "Ranged Weapon", dice: "3 Attack Dice (Straight Line)", cost: "350 GP", icon: "🏹" },
      { name: "Chainmail", type: "Armor", dice: "+1 Defend Die (3 Total)", cost: "500 GP", icon: "🛡️" },
      { name: "Plate Armor", type: "Armor", dice: "+2 Defend Dice (4 Total, 1d6 Move)", cost: "850 GP", icon: "🦾" },
      { name: "Shield", type: "Armor", dice: "+1 Defend Die", cost: "150 GP", icon: "🛡️" },
      { name: "Helmet", type: "Armor", dice: "+1 Defend Die", cost: "120 GP", icon: "🪖" },
      { name: "Toolkit", type: "Gear", dice: "Disarm Traps on 1-5", cost: "250 GP", icon: "🔧" }
    ];
    armory.forEach(item => {
      const card = document.createElement("div");
      card.className = "spell-card";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="card-title">${item.icon} ${item.name}</div>
          <span style="font-weight:700; color:#fbbf24; font-size:0.8rem;">💰 ${item.cost}</span>
        </div>
        <div class="card-meta">${item.type} • ${item.dice}</div>
      `;
      itemsGrid.appendChild(card);
    });
  }

  const dreadGrid = document.getElementById("dread-spells-grid");
  if (dreadGrid) {
    dreadGrid.innerHTML = "";
    DREAD_SPELLS.forEach(s => {
      const card = document.createElement("div");
      card.className = "spell-card deck-dread";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <div class="card-title" style="margin:0; color:#f3e8ff;">${s.icon} ${s.name}</div>
          <span class="element-tag tag-dread">DREAD MAGIC</span>
        </div>
        <div class="card-meta" style="color:var(--text-muted); font-size:0.75rem; margin-bottom:6px;">${s.description}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;">
          <span class="card-meta" style="margin:0; color:#c084fc;">Witch Lord & Chaos Sorcerers</span>
          <span class="badge" style="background:#581c87; color:#f3e8ff; border:1px solid #7e22ce; font-size:0.7rem;">Enemy Magic</span>
        </div>
      `;
      dreadGrid.appendChild(card);
    });
  }
}

// ==========================================
// 3. CAMPAIGN & MULTI-QUEST ENGINE
// ==========================================

function getCampaign() {
  return currentData.campaign;
}

function getActiveQuest() {
  return currentData.currentQuest || currentData.campaign.quests[currentData.currentQuestIndex || 0];
}

function updateQuestStatusUI(q) {
  const statusBadge = document.getElementById("quest-status-badge");
  const victoryBanner = document.getElementById("quest-victory-banner");
  const completeBtn = document.getElementById("btn-complete-quest");
  const vicTitle = document.getElementById("victory-quest-title");
  const vicDesc = document.getElementById("victory-quest-desc");

  if (q.completed) {
    if (statusBadge) {
      statusBadge.className = "badge badge-success";
      statusBadge.textContent = "🏆 Completed";
    }
    if (victoryBanner) {
      victoryBanner.style.display = "flex";
      if (vicTitle) vicTitle.textContent = `🏆 ${q.title} Completed!`;
      if (vicDesc) vicDesc.textContent = `All heroes in the adventuring party have received their ${q.goldReward || 100}g quest bounty.`;
    }
    if (completeBtn) {
      completeBtn.innerHTML = "✓ Completed";
      completeBtn.className = "btn btn-sm btn-secondary";
      completeBtn.title = "Quest is already completed. Click Reset to replay.";
    }
  } else {
    if (statusBadge) {
      statusBadge.className = "badge badge-gray";
      statusBadge.textContent = "⏳ In Progress";
    }
    if (victoryBanner) {
      victoryBanner.style.display = "none";
    }
    if (completeBtn) {
      completeBtn.innerHTML = "🏆 Complete Quest";
      completeBtn.className = "btn btn-sm btn-success";
      completeBtn.title = "Complete quest and award gold bounty to party";
    }
  }
}

async function selectQuest(index, preserveBoard = false) {
  if (index < 0 || index >= currentData.campaign.quests.length) return;
  currentData.currentQuestIndex = index;
  const q = currentData.campaign.quests[index];
  currentData.currentQuest = q;

  // Populate form fields
  const slugEl = document.getElementById("quest-slug");
  const titleEl = document.getElementById("quest-title");
  const editorTitleEl = document.getElementById("quest-editor-title");
  const rulesetEl = document.getElementById("quest-ruleset");
  const spawnXEl = document.getElementById("quest-spawn-x");
  const spawnYEl = document.getElementById("quest-spawn-y");
  const goldEl = document.getElementById("quest-gold");
  const briefingEl = document.getElementById("quest-briefing");
  const bossEl = document.getElementById("quest-boss-target");
  const bgSelectEl = document.getElementById("quest-bg-ref");

  if (slugEl) slugEl.value = q.slug || "";
  if (titleEl) titleEl.value = q.title || "";
  if (editorTitleEl) editorTitleEl.textContent = q.title || `Quest ${index + 1}`;
  if (rulesetEl) rulesetEl.value = q.ruleset || "heroquest";
  if (spawnXEl) spawnXEl.value = q.startingStairs?.[0] ?? 1;
  if (spawnYEl) spawnYEl.value = q.startingStairs?.[1] ?? 1;
  if (goldEl) goldEl.value = q.goldReward !== undefined ? q.goldReward : 100;
  if (briefingEl) briefingEl.value = q.briefing || "";
  if (bossEl) bossEl.value = q.bossTarget || "";

  // Update Status Badge & Victory Banner
  updateQuestStatusUI(q);

  // Update Delete Button state (cannot delete if only 1 quest remains)
  const delBtn = document.getElementById("btn-delete-quest");
  if (delBtn) {
    delBtn.disabled = currentData.campaign.quests.length <= 1;
    delBtn.style.opacity = currentData.campaign.quests.length <= 1 ? "0.4" : "1";
    delBtn.style.cursor = currentData.campaign.quests.length <= 1 ? "not-allowed" : "pointer";
  }

  // Switch map configuration if different
  if (q.mapConfigId && (!currentData.activeMapConfig || currentData.activeMapConfig.id !== q.mapConfigId)) {
    await switchMapConfiguration(q.mapConfigId, true);
  } else if (bgSelectEl && q.mapConfigId) {
    bgSelectEl.value = q.mapConfigId;
  }

  renderCampaignQuestsList();
  updateCampaignProgress();
  updateSummaryStats();
  drawBoard();
}

function renderCampaignQuestsList() {
  const listEl = document.getElementById("campaign-quests-list");
  if (!listEl) return;

  listEl.innerHTML = "";
  currentData.campaign.quests.forEach((q, idx) => {
    const item = document.createElement("div");
    item.className = `quest-list-item ${idx === currentData.currentQuestIndex ? "active" : ""}`;
    item.onclick = () => selectQuest(idx);

    const isCompleted = !!q.completed;
    const statusIcon = isCompleted ? "🏆" : "⏳";
    const statusClass = isCompleted ? "badge-success" : "badge-progress";
    const statusText = isCompleted ? "Completed" : "Active";

    item.innerHTML = `
      <div class="quest-list-item-header">
        <span class="quest-list-item-title">${escapeHtml(q.title || `Quest ${idx + 1}`)}</span>
        <span class="badge ${statusClass}" style="font-size:10px; padding:2px 6px;">${statusIcon} ${statusText}</span>
      </div>
      <div class="quest-list-item-footer">
        <span style="color:#94a3b8; font-size:11px;">🗺️ ${escapeHtml(q.mapConfigId || "map")}</span>
        <span class="gold-badge" style="font-size:11px; padding:1px 5px; background:rgba(234,179,8,0.15); color:#fde047; border-radius:3px;">🪙 ${q.goldReward || 0}g</span>
      </div>
    `;
    listEl.appendChild(item);
  });

  renderHeaderQuestSelect();
}

function renderHeaderQuestSelect() {
  const select = document.getElementById("header-quest-select") || document.getElementById("cartridge-select");
  if (!select) return;

  select.innerHTML = "";
  if (!Array.isArray(currentData.campaign?.quests)) return;

  currentData.campaign.quests.forEach((q, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    const isCompleted = !!q.completed;
    const statusIcon = isCompleted ? "🏆" : "⏳";
    opt.textContent = `${statusIcon} ${q.title || `Quest ${idx + 1}`} (${q.mapConfigId || "26×19"})`;
    if (idx === currentData.currentQuestIndex) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function updateCampaignProgress() {
  const quests = currentData.campaign.quests;
  const total = quests.length;
  const completed = quests.filter(q => q.completed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalGold = quests.reduce((acc, q) => acc + (Number(q.goldReward) || 0), 0);

  const barEl = document.getElementById("campaign-progress-bar");
  const pctEl = document.getElementById("campaign-progress-pct");
  const countEl = document.getElementById("campaign-progress-count");
  const goldPotEl = document.getElementById("campaign-total-gold-pot");
  const titleDisplayEl = document.getElementById("campaign-title-display");

  if (barEl) barEl.style.width = `${pct}%`;
  if (pctEl) {
    pctEl.textContent = `${pct}% Completed`;
    pctEl.className = pct === 100 ? "badge badge-success" : "badge badge-cyan";
  }
  if (countEl) countEl.textContent = `${completed} / ${total} Quests Finished`;
  if (goldPotEl) goldPotEl.textContent = `Total Bounty: ${totalGold}g`;
  if (titleDisplayEl && currentData.campaign.title) titleDisplayEl.textContent = currentData.campaign.title;
}

function completeQuest(index = currentData.currentQuestIndex) {
  if (index < 0 || index >= currentData.campaign.quests.length) return null;
  const q = currentData.campaign.quests[index];
  q.completed = true;

  // Award gold bounty to all heroes
  const bounty = Number(q.goldReward) || 100;
  if (Array.isArray(currentData.heroes)) {
    currentData.heroes.forEach(h => {
      h["robos:gold"] = (Number(h["robos:gold"]) || 0) + bounty;
    });
  }

  // Update hero UI if active
  const heroGoldEl = document.getElementById("hero-gold");
  const actHeroGoldEl = document.getElementById("act-hero-gold");
  const activeH = getActiveHero();
  if (activeH) {
    if (heroGoldEl) heroGoldEl.value = activeH["robos:gold"] || 0;
    if (actHeroGoldEl) actHeroGoldEl.textContent = `${activeH["robos:gold"] || 0}g`;
  }
  renderHeroesList();
  if (typeof renderHeroActionScreen === "function") {
    renderHeroActionScreen();
  }

  // Update Quest UI
  updateQuestStatusUI(q);
  renderCampaignQuestsList();
  updateCampaignProgress();

  setStatus(`🏆 Victory! Completed '${q.title}' and awarded ${bounty}g bounty to all party members!`);
  return { success: true, quest: q, goldAwarded: bounty };
}

function resetQuest(index = currentData.currentQuestIndex) {
  if (index < 0 || index >= currentData.campaign.quests.length) return null;
  const q = currentData.campaign.quests[index];
  q.completed = false;

  updateQuestStatusUI(q);
  renderCampaignQuestsList();
  updateCampaignProgress();

  setStatus(`Reopened quest '${q.title}'. Ready for adventure.`);
  return { success: true, quest: q };
}

function addQuest(customProps = {}) {
  const nextNum = currentData.campaign.quests.length + 1;
  const newQuest = {
    id: `quest-${nextNum}`,
    slug: customProps.slug || `heroquest-quest-${nextNum}`,
    title: customProps.title || `Quest ${nextNum}: New Adventure`,
    briefing: customProps.briefing || `A dark shadow looms over the realm. Brave heroes must explore the dungeon depths and vanquish the lurking evil.`,
    mapConfigId: customProps.mapConfigId || currentData.activeMapConfig?.id || "fan-dungeon-28x21",
    ruleset: customProps.ruleset || "heroquest",
    goldReward: customProps.goldReward !== undefined ? customProps.goldReward : 150,
    bossTarget: customProps.bossTarget || "dungeon-boss",
    completed: false,
    startingStairs: customProps.startingStairs ? [...customProps.startingStairs] : [1, 1],
    activeRooms: new Set(),
    wallBlocks: [],
    doors: [],
    furniture: [],
    monsters: [],
    traps: []
  };

  currentData.campaign.quests.push(newQuest);
  selectQuest(currentData.campaign.quests.length - 1);
  updateCampaignProgress();
  setStatus(`Created new quest: '${newQuest.title}'`);
  return newQuest;
}

function deleteQuest(index = currentData.currentQuestIndex) {
  if (currentData.campaign.quests.length <= 1) {
    setStatus("Cannot delete: Campaign must have at least 1 quest.");
    return false;
  }
  if (index < 0 || index >= currentData.campaign.quests.length) return false;

  const deleted = currentData.campaign.quests.splice(index, 1)[0];
  const nextIdx = Math.max(0, Math.min(index, currentData.campaign.quests.length - 1));
  selectQuest(nextIdx);
  updateCampaignProgress();
  setStatus(`Deleted quest: '${deleted.title}'`);
  return true;
}

function advanceToNextQuest() {
  const nextIdx = currentData.currentQuestIndex + 1;
  if (nextIdx < currentData.campaign.quests.length) {
    selectQuest(nextIdx);
  } else {
    setStatus("Campaign complete! All quests in the campaign have been finished!");
  }
}

function setupCampaignQuestControls() {
  // Campaign Name Input
  const cNameInput = document.getElementById("campaign-name-input");
  if (cNameInput) {
    cNameInput.value = currentData.campaign.title;
    cNameInput.addEventListener("input", (e) => {
      currentData.campaign.title = e.target.value;
      const titleDisplay = document.getElementById("campaign-title-display");
      if (titleDisplay) titleDisplay.textContent = e.target.value;
    });
  }

  // Header Active Quest Dropdown Live Sync
  const headerQuestSelect = document.getElementById("header-quest-select") || document.getElementById("cartridge-select");
  if (headerQuestSelect) {
    headerQuestSelect.addEventListener("change", (e) => {
      const idx = parseInt(e.target.value, 10);
      if (!isNaN(idx) && idx >= 0 && idx < currentData.campaign.quests.length) {
        selectQuest(idx);
      }
    });
  }

  // Quest Title Live Sync
  document.getElementById("quest-title")?.addEventListener("input", (e) => {
    if (!currentData.currentQuest) return;
    currentData.currentQuest.title = e.target.value;
    const editorTitle = document.getElementById("quest-editor-title");
    if (editorTitle) editorTitle.textContent = e.target.value || "Edit Quest";
    renderCampaignQuestsList();
  });

  // Quest Slug Live Sync
  document.getElementById("quest-slug")?.addEventListener("input", (e) => {
    if (currentData.currentQuest) currentData.currentQuest.slug = e.target.value;
  });

  // Quest Ruleset Live Sync
  document.getElementById("quest-ruleset")?.addEventListener("change", (e) => {
    if (currentData.currentQuest) currentData.currentQuest.ruleset = e.target.value;
  });

  // Starting Spawn X, Y
  document.getElementById("quest-spawn-x")?.addEventListener("input", (e) => {
    if (!currentData.currentQuest) return;
    if (!currentData.currentQuest.startingStairs) currentData.currentQuest.startingStairs = [1, 1];
    currentData.currentQuest.startingStairs[0] = parseInt(e.target.value, 10) || 0;
    drawBoard();
  });

  document.getElementById("quest-spawn-y")?.addEventListener("input", (e) => {
    if (!currentData.currentQuest) return;
    if (!currentData.currentQuest.startingStairs) currentData.currentQuest.startingStairs = [1, 1];
    currentData.currentQuest.startingStairs[1] = parseInt(e.target.value, 10) || 0;
    drawBoard();
  });

  // Quest Gold Reward
  document.getElementById("quest-gold")?.addEventListener("input", (e) => {
    if (!currentData.currentQuest) return;
    currentData.currentQuest.goldReward = parseInt(e.target.value, 10) || 0;
    renderCampaignQuestsList();
    updateCampaignProgress();
  });

  // Story Briefing & Boss Target
  document.getElementById("quest-briefing")?.addEventListener("input", (e) => {
    if (currentData.currentQuest) currentData.currentQuest.briefing = e.target.value;
  });

  document.getElementById("quest-boss-target")?.addEventListener("input", (e) => {
    if (currentData.currentQuest) currentData.currentQuest.bossTarget = e.target.value;
  });

  // Campaign Buttons
  document.getElementById("btn-add-quest")?.addEventListener("click", () => addQuest());
  document.getElementById("btn-delete-quest")?.addEventListener("click", () => deleteQuest());
  document.getElementById("btn-complete-quest")?.addEventListener("click", () => completeQuest());
  document.getElementById("btn-reset-quest")?.addEventListener("click", () => resetQuest());
  document.getElementById("btn-next-quest-banner")?.addEventListener("click", () => advanceToNextQuest());
}

// Action: Save to KGraph
document.getElementById("btn-save-kgraph")?.addEventListener("click", async () => {
  setStatus("Saving Tabletop Quest to Knowledge Graph package 'tabletop-game'...");

  // Update Quest Map node in KGraph
  const questMapNode = {
    "@id": `urn:robos:tabletop:map:${currentData.currentQuest.slug}`,
    "@type": [
      "oslc_am:Resource",
      "robos:TabletopQuestMap",
      "robos:GameMap",
      "schema:Place"
    ],
    "dcterms:title": currentData.currentQuest.title,
    "robos:mapConfiguration": currentData.currentQuest.mapConfigId,
    "robos:activeRooms": Array.from(currentData.currentQuest.activeRooms),
    "robos:startingSpawn": currentData.currentQuest.startingStairs,
    "robos:wallBlocksCount": currentData.currentQuest.wallBlocks.length,
    "robos:doorsCount": currentData.currentQuest.doors.length,
    "robos:furnitureCount": currentData.currentQuest.furniture.length,
    "robos:monstersCount": currentData.currentQuest.monsters.length,
    "robos:trapsCount": currentData.currentQuest.traps.length,
    "robos:package": "tabletop-game",
    "robos:namespace": "robos.tabletop"
  };

  const res = await window.robosTabletop.saveKGraphEntity({ entity: questMapNode });
  if (res.success) {
    setStatus(`Successfully saved Quest Map '${questMapNode["dcterms:title"]}' to KGraph.`);
  } else {
    setStatus("Error saving quest to KGraph: " + res.error);
  }
});

// Helper: Compile active campaign & current quest into cartridge payload
function compileCurrentCartridgePayload() {
  const q = currentData.currentQuest;
  const cfg = currentData.activeMapConfig;
  const cartSlug = document.getElementById("quest-slug")?.value || q?.slug || "heroquest-the-trial";

  // Build maps object for all quests in campaign
  const mapsPayload = {};
  currentData.campaign.quests.forEach(qst => {
    const qCfg = currentData.mapConfigs?.find(c => c.id === qst.mapConfigId) || cfg;
    mapsPayload[qst.slug] = {
      id: qst.slug,
      title: qst.title,
      mapConfigurationId: qst.mapConfigId,
      width: qCfg?.gridDimensions?.[0] || 26,
      height: qCfg?.gridDimensions?.[1] || 19,
      backgroundImage: qCfg?.backgroundImage || "res://assets/boards/heroquest_board.png",
      startingStair: qst.startingStairs || [0, 1],
      activeRooms: Array.from(qst.activeRooms || []),
      rooms: qCfg?.rooms || [],
      doors: qst.doors || [],
      wallBlocks: qst.wallBlocks || [],
      furniture: qst.furniture || [],
      traps: qst.traps || []
    };
  });

  return {
    cartridgeId: cartSlug,
    campaignId: currentData.campaign.id,
    title: document.getElementById("campaign-name-input")?.value || currentData.campaign.title,
    description: currentData.campaign.description || q.briefing,
    ruleset: document.getElementById("quest-ruleset")?.value || "heroquest",
    startingMap: q.slug,
    startingPosition: q.startingStairs || [0, 1],
    heroes: currentData.heroes.map(h => ({
      id: h["@id"].split(":").pop(),
      slug: h["@id"].split(":").pop(),
      name: h["dcterms:title"],
      heroClass: getHeroClass(h),
      bodyPoints: h["robos:bodyPoints"] || 8,
      mindPoints: h["robos:mindPoints"] || 2,
      attackDice: h["robos:attackDice"] || 3,
      defendDice: h["robos:defendDice"] || 2,
      gold: h["robos:gold"] !== undefined ? h["robos:gold"] : 100,
      weapon: getHeroWeapon(h),
      armor: getHeroArmor(h),
      inventory: getHeroInventory(h),
      tokenColor: h["robos:tokenColor"] || "#b91c1c",
      spells: getHeroSpells(h),
      position: (h["robos:startingPosition"] && h["robos:startingPosition"].length === 2) ? h["robos:startingPosition"] : (q.startingStairs || [0, 1])
    })),
    monsters: q.monsters.map(m => {
      const kMonster = currentData.monsters?.find(km => km["@id"].endsWith(m.monsterType) || km["dcterms:title"] === m.name);
      return {
        id: m.id,
        slug: m.monsterType,
        name: m.name,
        bodyPoints: m.bp,
        attackDice: m.atk,
        defendDice: m.def,
        movementSquares: kMonster ? (kMonster["robos:movementSquares"] || 6) : 6,
        isBoss: !!m.isBoss,
        isUndead: kMonster ? !!kMonster["robos:isUndead"] : false,
        isSpellcaster: kMonster ? !!kMonster["robos:isSpellcaster"] : false,
        spells: kMonster ? getMonsterSpells(kMonster).map(s => s.slug) : [],
        position: [m.x, m.y],
        roomId: m.roomId
      };
    }),
    maps: mapsPayload,
    spellAllocation: {
      elfElement: currentData.spellAllocation.elfElement,
      wizardElements: currentData.spellAllocation.wizardElements,
      confirmed: !!currentData.spellAllocation.confirmed
    },
    quests: currentData.campaign.quests.map(qst => ({
      id: qst.id,
      slug: qst.slug,
      title: qst.title,
      briefing: qst.briefing,
      goldReward: qst.goldReward,
      completed: !!qst.completed,
      mapConfigId: qst.mapConfigId,
      startingPosition: qst.startingStairs
    }))
  };
}

// Helper: Auto-bundle current quest & launch player
async function autoBundleAndLaunch(role) {
  const payload = compileCurrentCartridgePayload();
  const slug = payload.cartridgeId;
  setStatus(`Bundling active quest "${slug}" for Tabletop Player...`);
  const bundleRes = await window.robosTabletop.bundleCartridge(payload);
  if (!bundleRes.success) {
    setStatus("Failed to bundle quest cartridge: " + bundleRes.error);
    return;
  }
  setStatus(`Launching Tabletop Player (${role.toUpperCase()} MODE)...`);
  const res = await window.robosTabletop.launchGame({ cartridgeSlug: slug, role: role });
  if (res.success) {
    setStatus(`Launched ${role.toUpperCase()} Mode (PID: ${res.pid})`);
  } else {
    setStatus("Error launching game: " + res.error);
  }
}

// Action: Bundle Cartridge
document.getElementById("btn-bundle")?.addEventListener("click", async () => {
  const payload = compileCurrentCartridgePayload();
  setStatus("Bundling Tabletop RPG Cartridge...");
  const res = await window.robosTabletop.bundleCartridge(payload);
  if (res.success) {
    setStatus(`Cartridge compiled successfully! Path: ${res.cartridgePath}`);
  } else {
    setStatus("Failed to bundle: " + res.error);
  }
});

// Action: Play as Hero (Always presents Elf Elemental Spell Draft modal on start)
document.getElementById("btn-play-hero")?.addEventListener("click", () => {
  openSpellSelectionModal(async () => {
    await autoBundleAndLaunch("player");
  });
});

// Action: Play as Game Master
document.getElementById("btn-play-dm")?.addEventListener("click", async () => {
  await autoBundleAndLaunch("gm");
});

// Map Undo & Redo Toolbar Actions
document.getElementById("btn-map-undo")?.addEventListener("click", undoMapAction);
document.getElementById("btn-map-redo")?.addEventListener("click", redoMapAction);

// Global Keyboard Shortcuts (Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Y, Ctrl+Shift+Z / Cmd+Shift+Z)
window.addEventListener("keydown", (e) => {
  const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : "";
  if (activeTag === "INPUT" || activeTag === "TEXTAREA" || document.activeElement?.isContentEditable) {
    return;
  }

  const isCtrlOrMeta = e.ctrlKey || e.metaKey;
  if (!isCtrlOrMeta) return;

  // Redo: Ctrl+Y or Ctrl+Shift+Z
  if (e.key === "y" || e.key === "Y" || ((e.key === "z" || e.key === "Z") && e.shiftKey)) {
    e.preventDefault();
    redoMapAction();
    return;
  }

  // Undo: Ctrl+Z (without shift)
  if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
    e.preventDefault();
    undoMapAction();
    return;
  }
});

// Expose on window for programmatic testing & debugging
if (typeof window !== "undefined") {
  window._tabletopMapHistory = {
    undo: undoMapAction,
    redo: redoMapAction,
    push: pushUndoState,
    getUndoStack: () => mapUndoStack,
    getRedoStack: () => mapRedoStack
  };

  window._tabletopHeroEditor = {
    getActiveHero,
    getHeroClass,
    getHeroWeapon,
    getHeroArmor,
    getHeroInventory,
    selectHero,
    saveActiveHeroToKGraph,
    rollHeroAttack,
    rollHeroDefend,
    rollHeroMove,
    addHeroInventoryItem,
    removeHeroInventoryItem
  };

  window._tabletopSpellDraft = {
    ELEMENTAL_DECKS,
    getSpellAllocation: () => currentData.spellAllocation,
    setElfElement,
    getHeroSpells,
    openSpellSelectionModal,
    closeSpellSelectionModal,
    castHeroSpell,
    renderSpellDraftSummaryBadges
  };

  window._tabletopCampaign = {
    getCampaign,
    getActiveQuest,
    getActiveQuestIndex: () => currentData.currentQuestIndex,
    selectQuest,
    addQuest,
    deleteQuest,
    completeQuest,
    resetQuest,
    advanceToNextQuest,
    updateCampaignProgress,
    renderHeaderQuestSelect
  };

  window._tabletopMonsterGrimoire = {
    DREAD_SPELLS,
    getActiveMonster,
    getMonsterSpells,
    addMonsterSpell,
    removeMonsterSpell,
    renderMonsterGrimoire,
    renderMonsterActionScreen,
    rollMonsterAttack,
    rollMonsterDefend,
    rollMonsterMove,
    castMonsterSpell,
    saveActiveMonsterToKGraph
  };
}

// Initialize on DOM ready
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", initKGraphData);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FURNITURE_ASSET_MAP,
    TILE_ASSET_MAP,
    getFurnitureImage,
    getTileImage
  };
}

