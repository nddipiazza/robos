'use strict';

// RobOS Tabletop Studio Client Application
let currentData = {
  tabletopNodes: [],
  gameNodes: [],
  mapConfigs: [],
  activeMapConfig: null,
  heroes: [],
  monsters: [],
  spells: [],
  furniture: [],
  doors: [],
  activeHeroId: null,
  activeMonsterId: null,
  currentQuest: {
    slug: 'heroquest-the-trial',
    title: 'HeroQuest: The Trial',
    briefing: 'Seek out the foul Orc Warlord Verag in his catacombs, slay him, and return alive.',
    mapConfigId: 'fan-dungeon-28x21',
    activeRooms: new Set(),
    wallBlocks: [
      { id: 'block-1', x: 12, y: 0, type: 'single' },
      { id: 'block-2', x: 12, y: 20, type: 'single' },
      { id: 'block-3', x: 0, y: 10, type: 'single' },
      { id: 'block-4', x: 27, y: 10, type: 'single' }
    ],
    doors: [],
    furniture: [
      { id: 'furn-tomb-1', name: 'Ancient Stone Tomb', type: 'tomb', x: 4, y: 2, roomId: 'room-nw-crypt' },
      { id: 'furn-chest-1', name: 'Vault Chest of Gold', type: 'chest', x: 23, y: 2, roomId: 'room-ne-vault' },
      { id: 'furn-table-1', name: 'Alchemist Table', type: 'table', x: 14, y: 4, roomId: 'room-center-n' },
      { id: 'furn-rack-1', name: 'Weapons Rack', type: 'weapons-rack', x: 9, y: 2, roomId: 'room-n-armory' }
    ],
    monsters: [
      { id: 'mon-verag', name: 'Verag the Orc Warlord', monsterType: 'verag-boss', x: 4, y: 10, bp: 4, atk: 4, def: 4, isBoss: true, roomId: 'room-grand-fossil' },
      { id: 'mon-skel-1', name: 'Crypt Skeleton', monsterType: 'skeleton-1', x: 3, y: 3, bp: 1, atk: 2, def: 2, isBoss: false, roomId: 'room-nw-crypt' },
      { id: 'mon-skel-2', name: 'Crypt Skeleton', monsterType: 'skeleton-2', x: 5, y: 3, bp: 1, atk: 2, def: 2, isBoss: false, roomId: 'room-nw-crypt' },
      { id: 'mon-zombie-1', name: 'Cellar Zombie', monsterType: 'zombie-1', x: 4, y: 16, bp: 2, atk: 3, def: 3, isBoss: false, roomId: 'room-sw-cellar' },
      { id: 'mon-orc-1', name: 'Orc Guard', monsterType: 'orc-warrior-1', x: 14, y: 10, bp: 1, atk: 3, def: 2, isBoss: false, roomId: 'room-center-mid' },
      { id: 'mon-goblin-1', name: 'Goblin Scout', monsterType: 'goblin-scout-1', x: 15, y: 10, bp: 1, atk: 2, def: 1, isBoss: false, roomId: 'room-center-mid' }
    ],
    traps: [
      { id: 'trap-pit-1', trapType: 'pit', x: 0, y: 5, damageDice: 1, detected: false, disarmed: false },
      { id: 'trap-spear-1', trapType: 'spear', x: 7, y: 5, damageDice: 2, detected: false, disarmed: false },
      { id: 'trap-falling-1', trapType: 'falling-block', x: 21, y: 10, damageDice: 3, detected: false, disarmed: false }
    ],
    startingStairs: [0, 1]
  },
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

// DOM references
const statusBar = document.getElementById("status-text");

function setStatus(msg) {
  if (statusBar) statusBar.textContent = msg;
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

// Map Configuration Switcher
document.getElementById("map-config-select")?.addEventListener("change", async (e) => {
  const configId = e.target.value;
  await switchMapConfiguration(configId);
});

async function switchMapConfiguration(configId) {
  const config = currentData.mapConfigs.find(c => c.id === configId);
  if (!config) return;

  currentData.activeMapConfig = config;
  currentData.currentQuest.mapConfigId = config.id;

  // Apply default calibration for this map
  if (config.calibration) {
    currentData.calibration.insetLeft = Number.isFinite(config.calibration.insetLeft) ? config.calibration.insetLeft : 0;
    currentData.calibration.insetTop = Number.isFinite(config.calibration.insetTop) ? config.calibration.insetTop : 0;
    currentData.calibration.insetRight = Number.isFinite(config.calibration.insetRight) ? config.calibration.insetRight : 0;
    currentData.calibration.insetBottom = Number.isFinite(config.calibration.insetBottom) ? config.calibration.insetBottom : 0;

    document.getElementById("cal-inset-left").value = currentData.calibration.insetLeft;
    document.getElementById("val-inset-left").textContent = currentData.calibration.insetLeft;
    document.getElementById("cal-inset-top").value = currentData.calibration.insetTop;
    document.getElementById("val-inset-top").textContent = currentData.calibration.insetTop;
    document.getElementById("cal-inset-right").value = currentData.calibration.insetRight;
    document.getElementById("val-inset-right").textContent = currentData.calibration.insetRight;
    document.getElementById("cal-inset-bottom").value = currentData.calibration.insetBottom;
    document.getElementById("val-inset-bottom").textContent = currentData.calibration.insetBottom;
  }

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
    eraseAt(col, row);
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'wall-block') {
    const existingIdx = currentData.currentQuest.wallBlocks.findIndex(b => b.x === col && b.y === row);
    if (existingIdx >= 0) {
      currentData.currentQuest.wallBlocks.splice(existingIdx, 1);
      setStatus(`Removed stone block at [${col}, ${row}]`);
    } else {
      currentData.currentQuest.wallBlocks.push({
        id: `block-${col}-${row}`,
        x: col,
        y: row,
        type: 'single'
      });
      setStatus(`Placed stone block at [${col}, ${row}]`);
    }
    updateSummaryStats();
    drawBoard();
    return;
  }

  if (tool === 'furniture') {
    const furnType = document.getElementById("select-furniture-type").value || 'chest';
    const furnName = document.getElementById("select-furniture-type").selectedOptions[0]?.text || furnType;
    // Remove any existing furniture at this tile
    currentData.currentQuest.furniture = currentData.currentQuest.furniture.filter(f => !(f.x === col && f.y === row));
    currentData.currentQuest.furniture.push({
      id: `furn-${furnType}-${col}-${row}`,
      name: furnName,
      type: furnType,
      x: col,
      y: row,
      roomId
    });
    setStatus(`Placed ${furnName} at [${col}, ${row}]`);
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
    currentData.currentQuest.traps = currentData.currentQuest.traps.filter(t => !(t.x === col && t.y === row));
    currentData.currentQuest.traps.push({
      id: `trap-${trapType}-${col}-${row}`,
      trapType,
      x: col,
      y: row,
      damageDice: trapType === 'falling-block' ? 3 : 1,
      detected: false,
      disarmed: false
    });
    setStatus(`Placed ${trapType.toUpperCase()} trap at [${col}, ${row}]`);
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

function eraseAt(col, row) {
  currentData.currentQuest.wallBlocks = currentData.currentQuest.wallBlocks.filter(b => !(b.x === col && b.y === row));
  currentData.currentQuest.furniture = currentData.currentQuest.furniture.filter(f => !(f.x === col && f.y === row));
  currentData.currentQuest.monsters = currentData.currentQuest.monsters.filter(m => !(m.x === col && m.y === row));
  currentData.currentQuest.traps = currentData.currentQuest.traps.filter(t => !(t.x === col && t.y === row));
  currentData.currentQuest.doors = currentData.currentQuest.doors.filter(d => {
    return !(d.from[0] === col && d.from[1] === row) && !(d.to[0] === col && d.to[1] === row);
  });
  setStatus(`Erased items at [${col}, ${row}]`);
}

function inspectSquare(col, row) {
  const room = findRoomAt(col, row);
  const colLetter = String.fromCharCode(65 + (col % 26));
  const squareId = `${colLetter}-${row + 1}`;

  const block = currentData.currentQuest.wallBlocks.find(b => b.x === col && b.y === row);
  const furn = currentData.currentQuest.furniture.find(f => f.x === col && f.y === row);
  const mon = currentData.currentQuest.monsters.find(m => m.x === col && m.y === row);
  const trap = currentData.currentQuest.traps.find(t => t.x === col && t.y === row);
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
    html += `<div class="stat-pill" style="margin-top:6px;"><span>🧱 <strong>Stone Block Tile</strong></span><button onclick="eraseAt(${col}, ${row})" class="btn btn-xs btn-danger">Remove</button></div>`;
  }
  if (furn) {
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span>📦 <strong>${furn.name}</strong> (${furn.type})</span>
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
    html += `
      <div class="stat-pill" style="margin-top:6px;">
        <span>⚠️ <strong>${trap.trapType.toUpperCase()} TRAP</strong> (${trap.damageDice} dice)</span>
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
  } else if (type === "furniture") {
    items = q.furniture.map(f => ({
      label: f.name,
      coords: `[${f.x}, ${f.y}]`,
      col: f.x,
      row: f.y
    }));
  } else if (type === "monsters") {
    items = q.monsters.map(m => ({
      label: `${m.name} ${m.isBoss ? '👑' : ''}`,
      coords: `[${m.x}, ${m.y}]`,
      col: m.x,
      row: m.y
    }));
  } else if (type === "traps") {
    items = q.traps.map(t => ({
      label: `${t.trapType.toUpperCase()} Trap`,
      coords: `[${t.x}, ${t.y}]`,
      col: t.x,
      row: t.y
    }));
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

  // 6. Draw Wall Blocks (HeroQuest stone blocks)
  const q = currentData.currentQuest;
  q.wallBlocks.forEach(b => {
    const bx = insetL + b.x * cellW;
    const by = insetT + b.y * cellH;

    ctx.fillStyle = "#334155";
    ctx.fillRect(bx + 2, by + 2, cellW - 4, cellH - 4);

    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 2, by + 2, cellW - 4, cellH - 4);

    // Stone block cross hatch
    ctx.beginPath();
    ctx.moveTo(bx + 4, by + 4);
    ctx.lineTo(bx + cellW - 4, by + cellH - 4);
    ctx.moveTo(bx + cellW - 4, by + 4);
    ctx.lineTo(bx + 4, by + cellH - 4);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // 7. Draw Traps
  q.traps.forEach(t => {
    const tx = insetL + t.x * cellW + cellW / 2;
    const ty = insetT + t.y * cellH + cellH / 2;

    ctx.save();
    ctx.fillStyle = t.trapType === 'pit' ? '#dc2626' : (t.trapType === 'falling-block' ? '#ea580c' : '#7c3aed');
    ctx.beginPath();
    ctx.arc(tx, ty, cellW * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const icon = t.trapType === 'pit' ? '🕳️' : (t.trapType === 'falling-block' ? '🪨' : '🗡️');
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, tx, ty);
    ctx.restore();
  });

  // 8. Draw Furniture
  q.furniture.forEach(f => {
    const fx = insetL + f.x * cellW + cellW / 2;
    const fy = insetT + f.y * cellH + cellH / 2;

    ctx.save();
    ctx.fillStyle = "rgba(120, 53, 15, 0.9)";
    ctx.beginPath();
    ctx.roundRect(fx - cellW * 0.42, fy - cellH * 0.42, cellW * 0.84, cellH * 0.84, 4);
    ctx.fill();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    let icon = '📦';
    if (f.type === 'tomb') icon = '🪦';
    else if (f.type === 'alchemists-bench') icon = '🧪';
    else if (f.type === 'weapons-rack') icon = '⚔️';
    else if (f.type === 'table') icon = '🪵';
    else if (f.type === 'throne') icon = '👑';
    else if (f.type === 'bookcase') icon = '📚';
    else if (f.type === 'fireplace') icon = '🔥';

    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, fx, fy);
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
    const sx = insetL + q.startingStairs[0] * cellW + cellW / 2;
    const sy = insetT + q.startingStairs[1] * cellH + cellH / 2;

    ctx.save();
    ctx.fillStyle = "#1e40af";
    ctx.beginPath();
    ctx.arc(sx, sy, cellW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🪜", sx, sy);
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
      if (select) {
        select.innerHTML = "";
        currentData.mapConfigs.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = c.title;
          select.appendChild(opt);
        });
      }
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

      renderHeroesList();
      renderMonstersList();
      renderSpellsAndItems();
    }

    // 3. Switch to default map configuration
    await switchMapConfiguration("fan-dungeon-28x21");
    initBoard();
    setStatus("Tabletop RPG Quest Editor Ready.");
  } catch (err) {
    setStatus("Failed to initialize: " + err.message);
  }
}

// Render Heroes
function renderHeroesList() {
  const container = document.getElementById("heroes-list");
  if (!container) return;
  container.innerHTML = "";

  currentData.heroes.forEach(h => {
    const div = document.createElement("div");
    div.className = "list-item" + (h["@id"] === currentData.activeHeroId ? " active" : "");
    div.innerHTML = `<span>${h["robos:tokenColor"] ? '<span style="color:' + h["robos:tokenColor"] + '">●</span>' : "🛡️"}</span> <strong>${h["dcterms:title"] || h["@id"]}</strong>`;
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

  renderHeroesList();
  document.getElementById("hero-editor-title").textContent = "Edit Hero: " + (hero["dcterms:title"] || "");
  document.getElementById("hero-id").value = hero["@id"] || "";
  document.getElementById("hero-name").value = hero["dcterms:title"] || "";
  document.getElementById("hero-bp").value = hero["robos:bodyPoints"] || 8;
  document.getElementById("hero-mp").value = hero["robos:mindPoints"] || 2;
  document.getElementById("hero-atk").value = hero["robos:attackDice"] || 3;
  document.getElementById("hero-def").value = hero["robos:defendDice"] || 2;
  document.getElementById("hero-weapon").value = hero["robos:startingWeapon"] || "";
  document.getElementById("hero-ability").value = hero["robos:specialAbility"] || "";
  document.getElementById("hero-color").value = hero["robos:tokenColor"] || "#b91c1c";
  document.getElementById("hero-icon").value = hero["robos:icon"] || "🛡️";
  document.getElementById("hero-pos-x").value = (hero["robos:startingPosition"] && hero["robos:startingPosition"][0]) || 1;
  document.getElementById("hero-pos-y").value = (hero["robos:startingPosition"] && hero["robos:startingPosition"][1]) || 1;
}

// Render Monsters
function renderMonstersList() {
  const container = document.getElementById("monsters-list");
  if (!container) return;
  container.innerHTML = "";

  currentData.monsters.forEach(m => {
    const div = document.createElement("div");
    div.className = "list-item" + (m["@id"] === currentData.activeMonsterId ? " active" : "");
    div.innerHTML = `<span>${m["robos:isBoss"] ? "👑" : "👹"}</span> <strong>${m["dcterms:title"] || m["@id"]}</strong>`;
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
}

// Render Spells & Items
function renderSpellsAndItems() {
  const spellsGrid = document.getElementById("spells-grid");
  if (spellsGrid) {
    spellsGrid.innerHTML = "";
    currentData.spells.forEach(s => {
      const card = document.createElement("div");
      card.className = "spell-card";
      card.innerHTML = `
        <div class="card-title">${s["dcterms:title"]}</div>
        <div class="card-meta">College: ${s["robos:element"] || "neutral"}</div>
        <div class="card-meta">${s["robos:attackDice"] ? `Attack Dice: ${s["robos:attackDice"]}` : ""}</div>
      `;
      spellsGrid.appendChild(card);
    });
  }
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
    alert(`Saved Quest to Knowledge Graph!\nEntity: ${questMapNode["@id"]}`);
  } else {
    setStatus("Error saving quest to KGraph: " + res.error);
  }
});

// Action: Bundle Cartridge
document.getElementById("btn-bundle")?.addEventListener("click", async () => {
  const q = currentData.currentQuest;
  const cfg = currentData.activeMapConfig;

  const payload = {
    cartridgeId: document.getElementById("quest-slug").value || q.slug,
    title: document.getElementById("quest-title").value || q.title,
    description: document.getElementById("quest-briefing").value || q.briefing,
    ruleset: document.getElementById("quest-ruleset").value || "heroquest",
    startingMap: q.slug,
    startingPosition: q.startingStairs || [1, 0],
    heroes: currentData.heroes.map(h => ({
      id: h["@id"].split(":").pop(),
      slug: h["@id"].split(":").pop(),
      name: h["dcterms:title"],
      bodyPoints: h["robos:bodyPoints"] || 8,
      mindPoints: h["robos:mindPoints"] || 2,
      attackDice: h["robos:attackDice"] || 3,
      defendDice: h["robos:defendDice"] || 2,
      tokenColor: h["robos:tokenColor"] || "#b91c1c",
      position: [1, 1]
    })),
    monsters: q.monsters.map(m => ({
      id: m.id,
      slug: m.monsterType,
      name: m.name,
      bodyPoints: m.bp,
      attackDice: m.atk,
      defendDice: m.def,
      movementSquares: 6,
      isBoss: !!m.isBoss,
      position: [m.x, m.y],
      roomId: m.roomId
    })),
    maps: {
      [q.slug]: {
        id: q.slug,
        title: q.title,
        mapConfigurationId: q.mapConfigId,
        width: cfg?.gridDimensions?.[0] || 26,
        height: cfg?.gridDimensions?.[1] || 19,
        backgroundImage: cfg?.backgroundImage || "res://assets/boards/heroquest_board.png",
        startingStair: q.startingStairs,
        activeRooms: Array.from(q.activeRooms),
        rooms: cfg?.rooms || [],
        doors: q.doors,
        wallBlocks: q.wallBlocks,
        furniture: q.furniture,
        traps: q.traps
      }
    },
    quests: [
      { id: "quest-1", title: q.title }
    ]
  };

  setStatus("Bundling Tabletop RPG Cartridge...");
  const res = await window.robosTabletop.bundleCartridge(payload);
  if (res.success) {
    setStatus(`Cartridge generated: ${res.cartridgeId}.cartridge.json`);
    alert(`Tabletop RPG Cartridge compiled successfully!\nPath: ${res.cartridgePath}`);
  } else {
    setStatus("Failed to bundle: " + res.error);
  }
});

// Action: Play as Hero
document.getElementById("btn-play-hero")?.addEventListener("click", async () => {
  const slug = document.getElementById("quest-slug").value || currentData.currentQuest.slug;
  setStatus(`Launching Tabletop Player (PLAYER MODE)...`);
  const res = await window.robosTabletop.launchGame({ cartridgeSlug: slug, role: "player" });
  if (res.success) {
    setStatus(`Launched Player Mode (PID: ${res.pid})`);
  } else {
    setStatus("Error launching game: " + res.error);
  }
});

// Action: Play as Game Master
document.getElementById("btn-play-dm")?.addEventListener("click", async () => {
  const slug = document.getElementById("quest-slug").value || currentData.currentQuest.slug;
  setStatus(`Launching Tabletop Player (GAME MASTER MODE)...`);
  const res = await window.robosTabletop.launchGame({ cartridgeSlug: slug, role: "gm" });
  if (res.success) {
    setStatus(`Launched Game Master Mode (PID: ${res.pid})`);
  } else {
    setStatus("Error launching game: " + res.error);
  }
});

// Initialize on DOM ready
window.addEventListener("DOMContentLoaded", initKGraphData);
