'use strict';

/**
 * RobOS Tabletop Blockmap Creator — Layer 1: Static Board Geometry & Tile Calibration
 * Focuses exclusively on the permanent cardboard board specification:
 * - Tile Size (px)
 * - Map Image Offset (X, Y)
 * - Add 1-Tile Border Option Checkbox
 * - Corridor Draw Tool (Click & drag mouse to toggle/disable corridor tiles)
 * - Room Draw Tool (Click & drag mouse to toggle edges of tiles as room or drag box)
 * - Takes ANY image and turns it into a reusable board map specification
 */

const ROOM_COLORS = [
  '#00bcd4', '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#e11d48', '#a855f7', '#d97706', '#059669',
  '#38bdf8', '#4ade80', '#fbbf24', '#f43f5e', '#a78bfa',
  '#2dd4bf', '#fb923c'
];

class BlockmapCreator {
  constructor() {
    this.canvas = document.getElementById('map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.viewport = document.getElementById('canvas-viewport');

    // 1. Calibration Parameters
    this.tileSize = 39.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.cols = 26;
    this.rows = 19;
    this.addBorder = true;

    // Viewport transform
    this.panX = 40;
    this.panY = 40;
    this.zoom = 1.0;

    // 2. Active Tools
    this.activeTool = 'inspect';  // 'inspect', 'corridor', 'room', 'erase'
    this.corridorMode = 'toggle'; // 'toggle', 'paint', 'erase'
    this.roomMode = 'box';        // 'box', 'toggle', 'paint', 'erase'

    // 3. Layer 1 Data
    this.image = null;
    this.imagePath = '';
    this.fileName = 'first_light_dungeon.png';
    this.boardId = 'first-light-dungeon';
    this.boardTitle = 'HeroQuest: First Light Side A (Fortress of the Fire King)';
    this.cartridgeSlug = 'heroquest-fortress-fire-king';

    this.corridorTiles = new Set(); // "col,row" strings
    this.rooms = [];                // Array of { id, name, x, y, w, h, quadrant, color }
    this.selectedRoomId = null;

    // View Display Flags
    this.showImage = true;
    this.showGrid = true;
    this.showCoords = true;
    this.showCorridors = true;
    this.showRooms = true;
    this.artOpacity = 1.0;
    this.gridOpacity = 0.75;

    // Mouse Interaction
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.spacePressed = false;

    this.isDrawing = false;
    this.dragStartTile = null;
    this.dragCurrentTile = null;
    this.dragStrokeAction = 'paint';
    this.modifiedThisStroke = new Set();

    // History stack
    this.undoStack = [];
    this.redoStack = [];

    this.init();
  }

  async init() {
    this.bindEvents();
    this.resizeCanvas();

    // Check startup target
    try {
      const startup = await window.robosBlockmap.getStartupArgs();
      if (startup && startup.value) {
        if (startup.type === 'cartridge' || startup.value.includes('cartridge')) {
          await this.loadCartridge(startup.value);
        } else if (startup.type === 'image') {
          await this.loadImageFile(startup.value);
        } else {
          await this.loadPreset(startup.value || 'first-light-dungeon');
        }
      } else {
        await this.loadPreset('first-light-dungeon');
      }
    } catch (err) {
      console.warn('Initial load fallback:', err);
      await this.loadPreset('first-light-dungeon');
    }

    this.fitToScreen();
    this.render();
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.render();
    });

    // Preset selector
    const presetSelect = document.getElementById('board-preset-select');
    presetSelect.addEventListener('change', (e) => {
      this.loadPreset(e.target.value);
    });

    // Open image & export buttons
    document.getElementById('btn-open-image').addEventListener('click', () => this.handleOpenImage());
    document.getElementById('btn-save-board').addEventListener('click', () => this.saveBoard());
    document.getElementById('btn-export-json').addEventListener('click', () => this.exportJsonFile());
    document.getElementById('btn-copy-json').addEventListener('click', () => this.copyJsonToClipboard());

    // Zoom buttons
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.adjustZoom(1.2));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.adjustZoom(1 / 1.2));
    document.getElementById('btn-zoom-reset').addEventListener('click', () => this.resetZoom());
    document.getElementById('btn-zoom-fit').addEventListener('click', () => this.fitToScreen());

    // Undo / Redo
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());

    // Tool palette buttons
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setActiveTool(btn.getAttribute('data-tool'));
      });
    });

    // Sidebar navigation tabs
    document.querySelectorAll('.side-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-sidetab');
        const content = document.getElementById(targetId);
        if (content) content.classList.add('active');
      });
    });

    // 1. Tile Size Controls
    const inputTile = document.getElementById('input-tile-size');
    const sliderTile = document.getElementById('slider-tile-size');

    inputTile.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        this.tileSize = val;
        sliderTile.value = val;
        this.render();
      }
    });

    sliderTile.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.tileSize = val;
      inputTile.value = val.toFixed(1);
      this.render();
    });

    document.getElementById('btn-tile-minus-1').addEventListener('click', () => this.stepTileSize(-1.0));
    document.getElementById('btn-tile-minus-01').addEventListener('click', () => this.stepTileSize(-0.1));
    document.getElementById('btn-tile-plus-01').addEventListener('click', () => this.stepTileSize(0.1));
    document.getElementById('btn-tile-plus-1').addEventListener('click', () => this.stepTileSize(1.0));

    // 2. Offset X Controls
    const inputOffX = document.getElementById('input-offset-x');
    inputOffX.addEventListener('input', (e) => {
      this.offsetX = parseFloat(e.target.value) || 0;
      this.render();
    });
    document.getElementById('btn-offx-minus-5').addEventListener('click', () => this.stepOffsetX(-5));
    document.getElementById('btn-offx-minus-1').addEventListener('click', () => this.stepOffsetX(-1));
    document.getElementById('btn-offx-plus-1').addEventListener('click', () => this.stepOffsetX(1));
    document.getElementById('btn-offx-plus-5').addEventListener('click', () => this.stepOffsetX(5));

    // Offset Y Controls
    const inputOffY = document.getElementById('input-offset-y');
    inputOffY.addEventListener('input', (e) => {
      this.offsetY = parseFloat(e.target.value) || 0;
      this.render();
    });
    document.getElementById('btn-offy-minus-5').addEventListener('click', () => this.stepOffsetY(-5));
    document.getElementById('btn-offy-minus-1').addEventListener('click', () => this.stepOffsetY(-1));
    document.getElementById('btn-offy-plus-1').addEventListener('click', () => this.stepOffsetY(1));
    document.getElementById('btn-offy-plus-5').addEventListener('click', () => this.stepOffsetY(5));

    // 3. Add 1-Tile Border Checkbox
    const chkBorder = document.getElementById('chk-add-border');
    chkBorder.addEventListener('change', (e) => {
      this.addBorder = e.target.checked;
      if (this.addBorder) {
        this.fillOuterPerimeterCorridor();
      }
      this.render();
    });

    // Grid Dimensions
    document.getElementById('input-grid-cols').addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      if (val >= 2) {
        this.cols = val;
        this.render();
      }
    });

    document.getElementById('input-grid-rows').addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      if (val >= 2) {
        this.rows = val;
        this.render();
      }
    });

    document.getElementById('btn-auto-calc-grid').addEventListener('click', () => {
      this.autoCalculateGrid();
    });

    // View Layer Toggles
    document.getElementById('chk-show-image').addEventListener('change', (e) => { this.showImage = e.target.checked; this.render(); });
    document.getElementById('chk-show-grid').addEventListener('change', (e) => { this.showGrid = e.target.checked; this.render(); });
    document.getElementById('chk-show-coords').addEventListener('change', (e) => { this.showCoords = e.target.checked; this.render(); });
    document.getElementById('chk-show-corridors').addEventListener('change', (e) => { this.showCorridors = e.target.checked; this.render(); });
    document.getElementById('chk-show-rooms').addEventListener('change', (e) => { this.showRooms = e.target.checked; this.render(); });

    document.getElementById('slider-art-opacity').addEventListener('input', (e) => {
      this.artOpacity = parseFloat(e.target.value);
      this.render();
    });

    document.getElementById('slider-grid-opacity').addEventListener('input', (e) => {
      this.gridOpacity = parseFloat(e.target.value);
      this.render();
    });

    // Subtool Mode Radios
    document.querySelectorAll('input[name="corridor-mode"]').forEach(r => {
      r.addEventListener('change', (e) => { this.corridorMode = e.target.value; });
    });
    document.querySelectorAll('input[name="room-mode"]').forEach(r => {
      r.addEventListener('change', (e) => { this.roomMode = e.target.value; });
    });

    // Room Inspector Inputs
    document.getElementById('prop-room-name').addEventListener('input', (e) => {
      const room = this.getSelectedRoom();
      if (room) {
        room.name = e.target.value;
        this.updateRoomListUI();
        this.render();
      }
    });

    document.getElementById('prop-room-id').addEventListener('input', (e) => {
      const room = this.getSelectedRoom();
      if (room) {
        room.id = e.target.value;
        this.updateRoomListUI();
        this.render();
      }
    });

    document.getElementById('prop-room-quadrant').addEventListener('change', (e) => {
      const room = this.getSelectedRoom();
      if (room) {
        room.quadrant = e.target.value;
        this.updateRoomListUI();
        this.render();
      }
    });

    document.getElementById('btn-delete-room').addEventListener('click', () => {
      this.deleteSelectedRoom();
    });

    document.getElementById('btn-add-new-room').addEventListener('click', () => {
      this.addNewRoom();
    });

    // Corridor action buttons
    document.getElementById('btn-fill-outer-corridor').addEventListener('click', () => {
      this.pushHistory();
      this.fillOuterPerimeterCorridor();
      this.render();
      this.showToast('Filled 1-tile outer perimeter corridor');
    });

    document.getElementById('btn-clear-corridors').addEventListener('click', () => {
      this.pushHistory();
      this.corridorTiles.clear();
      this.render();
      this.showToast('Cleared all corridor tiles');
    });

    this.bindCanvasMouseEvents();
    this.bindKeyboardEvents();
  }

  bindCanvasMouseEvents() {
    this.viewport.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.viewport.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.viewport.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.code === 'Space') {
        this.spacePressed = true;
        this.viewport.classList.add('panning');
      } else if (e.key === 'v' || e.key === 'V') {
        this.setActiveTool('inspect');
      } else if (e.key === 'c' || e.key === 'C') {
        this.setActiveTool('corridor');
      } else if (e.key === 'r' || e.key === 'R') {
        this.setActiveTool('room');
      } else if (e.key === 'e' || e.key === 'E') {
        this.setActiveTool('erase');
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        this.redo();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        if (!this.isPanning) {
          this.viewport.classList.remove('panning');
        }
      }
    });
  }

  // ---------------- Canvas Transform & Coordinates ----------------
  resizeCanvas() {
    const rect = this.viewport.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  screenToWorld(screenX, screenY) {
    const rect = this.viewport.getBoundingClientRect();
    const vx = screenX - rect.left;
    const vy = screenY - rect.top;
    return {
      x: (vx - this.panX) / this.zoom,
      y: (vy - this.panY) / this.zoom
    };
  }

  worldToTile(worldX, worldY) {
    const gridX = worldX - this.offsetX;
    const gridY = worldY - this.offsetY;
    const col = Math.floor(gridX / this.tileSize);
    const row = Math.floor(gridY / this.tileSize);
    return { col, row };
  }

  isTileInBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  // ---------------- Mouse Event Handlers ----------------
  onMouseDown(e) {
    // Middle click, right click, or space+drag initiates pan
    if (e.button === 1 || e.button === 2 || this.spacePressed) {
      this.isPanning = true;
      this.panStartX = e.clientX - this.panX;
      this.panStartY = e.clientY - this.panY;
      this.viewport.classList.add('panning');
      return;
    }

    if (e.button === 0) {
      const world = this.screenToWorld(e.clientX, e.clientY);
      const tile = this.worldToTile(world.x, world.y);

      this.isDrawing = true;
      this.dragStartTile = tile;
      this.dragCurrentTile = tile;
      this.modifiedThisStroke.clear();

      this.pushHistory();

      const key = `${tile.col},${tile.row}`;

      if (this.activeTool === 'inspect') {
        const room = this.getRoomAtTile(tile.col, tile.row);
        this.selectedRoomId = room ? room.id : null;
        this.updateRoomInspector();
        this.updateRoomListUI();
      } else if (this.activeTool === 'corridor') {
        if (this.isTileInBounds(tile.col, tile.row)) {
          if (this.corridorMode === 'toggle') {
            this.dragStrokeAction = this.corridorTiles.has(key) ? 'erase' : 'paint';
          } else {
            this.dragStrokeAction = this.corridorMode;
          }
          this.applyCorridorTile(tile.col, tile.row, this.dragStrokeAction);
          this.modifiedThisStroke.add(key);
        }
      } else if (this.activeTool === 'room') {
        if (this.roomMode === 'paint' || this.roomMode === 'erase') {
          const room = this.getSelectedRoom();
          if (room && this.isTileInBounds(tile.col, tile.row)) {
            this.toggleRoomTile(room, tile.col, tile.row, this.roomMode === 'paint');
          }
        }
      } else if (this.activeTool === 'erase') {
        if (this.isTileInBounds(tile.col, tile.row)) {
          this.eraseAtTile(tile.col, tile.row);
        }
      }

      this.render();
    }
  }

  onMouseMove(e) {
    if (this.isPanning) {
      this.panX = e.clientX - this.panStartX;
      this.panY = e.clientY - this.panStartY;
      this.render();
      return;
    }

    const world = this.screenToWorld(e.clientX, e.clientY);
    const tile = this.worldToTile(world.x, world.y);

    document.getElementById('info-cursor-pos').textContent = `📍 Cursor: ${Math.round(world.x)}, ${Math.round(world.y)}`;
    if (this.isTileInBounds(tile.col, tile.row)) {
      document.getElementById('info-tile-pos').textContent = `🎯 Tile: [${tile.col}, ${tile.row}]`;
      const room = this.getRoomAtTile(tile.col, tile.row);
      document.getElementById('info-room-name').textContent = room ? `🏠 Room: ${room.name}` : (this.corridorTiles.has(`${tile.col},${tile.row}`) ? `🛣️ Corridor` : `⬛ Void`);
    } else {
      document.getElementById('info-tile-pos').textContent = `🎯 Tile: [out]`;
      document.getElementById('info-room-name').textContent = `🏠 Room: None`;
    }

    if (this.isDrawing) {
      this.dragCurrentTile = tile;
      if (this.activeTool === 'corridor' && this.isTileInBounds(tile.col, tile.row)) {
        const key = `${tile.col},${tile.row}`;
        if (!this.modifiedThisStroke.has(key)) {
          this.modifiedThisStroke.add(key);
          this.applyCorridorTile(tile.col, tile.row, this.dragStrokeAction);
        }
      } else if (this.activeTool === 'erase' && this.isTileInBounds(tile.col, tile.row)) {
        this.eraseAtTile(tile.col, tile.row);
      }
      this.render();
    }
  }

  onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      if (!this.spacePressed) {
        this.viewport.classList.remove('panning');
      }
      return;
    }

    if (this.isDrawing) {
      const world = this.screenToWorld(e.clientX, e.clientY);
      const tile = this.worldToTile(world.x, world.y);

      // Finalize room rectangle if dragging box
      if (this.activeTool === 'room' && (this.roomMode === 'box' || this.roomMode === 'toggle') && this.dragStartTile) {
        const c1 = this.dragStartTile.col;
        const r1 = this.dragStartTile.row;
        const c2 = tile.col;
        const r2 = tile.row;

        const rx = Math.max(0, Math.min(c1, c2));
        const ry = Math.max(0, Math.min(r1, r2));
        const rw = Math.min(this.cols - rx, Math.abs(c2 - c1) + 1);
        const rh = Math.min(this.rows - ry, Math.abs(r2 - r1) + 1);

        if (rw >= 1 && rh >= 1) {
          let activeRoom = this.getSelectedRoom();
          if (!activeRoom || (rw > 1 && rh > 1 && (activeRoom.w !== rw || activeRoom.h !== rh))) {
            activeRoom = this.addNewRoom(rx, ry, rw, rh);
          } else {
            activeRoom.x = rx;
            activeRoom.y = ry;
            activeRoom.w = rw;
            activeRoom.h = rh;
            this.updateRoomInspector();
            this.updateRoomListUI();
            this.showToast(`Updated ${activeRoom.name} bounds: [${rx}, ${ry}] ${rw}×${rh}`);
          }
        }
      }

      this.isDrawing = false;
      this.dragStartTile = null;
      this.dragCurrentTile = null;
      this.modifiedThisStroke.clear();
      this.render();
    }
  }

  onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : (1 / 1.12);

    const rect = this.viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newZoom = Math.max(0.2, Math.min(5.0, this.zoom * factor));
    this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    document.getElementById('info-zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
    this.render();
  }

  // ---------------- Static Layer Actions ----------------
  applyCorridorTile(col, row, action) {
    const key = `${col},${row}`;
    if (action === 'paint') {
      this.corridorTiles.add(key);
    } else {
      this.corridorTiles.delete(key);
    }
    document.getElementById('corridor-count').textContent = this.corridorTiles.size;
  }

  fillOuterPerimeterCorridor() {
    for (let c = 0; c < this.cols; c++) {
      this.corridorTiles.add(`${c},0`);
      this.corridorTiles.add(`${c},${this.rows - 1}`);
    }
    for (let r = 0; r < this.rows; r++) {
      this.corridorTiles.add(`0,${r}`);
      this.corridorTiles.add(`${this.cols - 1},${r}`);
    }
    document.getElementById('corridor-count').textContent = this.corridorTiles.size;
  }

  eraseAtTile(col, row) {
    this.corridorTiles.delete(`${col},${row}`);
    document.getElementById('corridor-count').textContent = this.corridorTiles.size;
  }

  // ---------------- Rooms Management ----------------
  addNewRoom(x = 1, y = 1, w = 4, h = 4) {
    const count = this.rooms.length + 1;
    const quadrant = this.determineQuadrant(x, y);
    const color = ROOM_COLORS[(count - 1) % ROOM_COLORS.length];
    const newRoom = {
      id: `room-${quadrant}-${count}`,
      name: `Room ${count} (${quadrant.toUpperCase()})`,
      x: x,
      y: y,
      w: w,
      h: h,
      quadrant: quadrant,
      color: color
    };

    this.rooms.push(newRoom);
    this.selectedRoomId = newRoom.id;
    this.updateRoomListUI();
    this.updateRoomInspector();
    this.showToast(`Defined new room: ${newRoom.name}`);
    return newRoom;
  }

  deleteSelectedRoom() {
    if (!this.selectedRoomId) return;
    this.pushHistory();
    const idx = this.rooms.findIndex(r => r.id === this.selectedRoomId);
    if (idx >= 0) {
      const name = this.rooms[idx].name;
      this.rooms.splice(idx, 1);
      this.selectedRoomId = this.rooms.length > 0 ? this.rooms[0].id : null;
      this.updateRoomListUI();
      this.updateRoomInspector();
      this.render();
      this.showToast(`Deleted ${name}`);
    }
  }

  getSelectedRoom() {
    return this.rooms.find(r => r.id === this.selectedRoomId) || null;
  }

  getRoomAtTile(col, row) {
    for (const r of this.rooms) {
      if (col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h) {
        return r;
      }
    }
    return null;
  }

  determineQuadrant(x, y) {
    const midX = this.cols / 2;
    const midY = this.rows / 2;
    if (Math.abs(x - midX) < 3 && Math.abs(y - midY) < 3) return 'center';
    if (x < midX && y < midY) return 'nw';
    if (x >= midX && y < midY) return 'ne';
    if (x < midX && y >= midY) return 'sw';
    return 'se';
  }

  updateRoomListUI() {
    const container = document.getElementById('room-items-container');
    container.innerHTML = '';
    document.getElementById('room-list-count').textContent = this.rooms.length;
    document.getElementById('sidebar-room-count').textContent = this.rooms.length;

    this.rooms.forEach(r => {
      const card = document.createElement('div');
      card.className = `room-card-item ${r.id === this.selectedRoomId ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="room-item-badge" style="background:${r.color || '#00bcd4'};"></div>
        <div class="room-item-info">
          <span class="room-item-title">${r.name}</span>
          <span class="room-item-coords">[${r.x}, ${r.y}] ${r.w}×${r.h} • ${r.quadrant.toUpperCase()}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        this.selectedRoomId = r.id;
        this.updateRoomListUI();
        this.updateRoomInspector();
        this.render();
      });
      container.appendChild(card);
    });
  }

  updateRoomInspector() {
    const card = document.getElementById('selected-room-card');
    const room = this.getSelectedRoom();
    if (!room) {
      card.style.opacity = '0.5';
      card.style.pointerEvents = 'none';
      document.getElementById('prop-room-header').textContent = 'No Room Selected';
      document.getElementById('prop-room-name').value = '';
      document.getElementById('prop-room-id').value = '';
      document.getElementById('prop-room-x').textContent = '0';
      document.getElementById('prop-room-y').textContent = '0';
      document.getElementById('prop-room-w').textContent = '0';
      document.getElementById('prop-room-h').textContent = '0';
      return;
    }

    card.style.opacity = '1.0';
    card.style.pointerEvents = 'auto';
    document.getElementById('prop-room-header').textContent = room.name;
    document.getElementById('prop-room-name').value = room.name;
    document.getElementById('prop-room-id').value = room.id;
    document.getElementById('prop-room-quadrant').value = room.quadrant || 'nw';
    document.getElementById('prop-room-x').textContent = room.x;
    document.getElementById('prop-room-y').textContent = room.y;
    document.getElementById('prop-room-w').textContent = room.w;
    document.getElementById('prop-room-h').textContent = room.h;
  }

  setActiveTool(tool) {
    this.activeTool = tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
    });

    document.getElementById('corridor-subtool-panel').classList.toggle('hidden', tool !== 'corridor');
    document.getElementById('room-subtool-panel').classList.toggle('hidden', tool !== 'room');

    const toolNames = {
      inspect: 'Select / Inspect',
      corridor: 'Corridor Draw Tool (Drag to toggle/paint)',
      room: 'Room Draw Tool (Drag to define edge/box)',
      erase: 'Eraser Tool'
    };
    document.getElementById('info-active-tool').textContent = `🛠️ Tool: ${toolNames[tool] || tool}`;
  }

  // ---------------- Calibration Adjusters ----------------
  stepTileSize(delta) {
    this.tileSize = Math.max(8.0, Math.min(150.0, Math.round((this.tileSize + delta) * 10) / 10));
    document.getElementById('input-tile-size').value = this.tileSize.toFixed(1);
    document.getElementById('slider-tile-size').value = this.tileSize;
    this.render();
  }

  stepOffsetX(delta) {
    this.offsetX += delta;
    document.getElementById('input-offset-x').value = this.offsetX;
    this.render();
  }

  stepOffsetY(delta) {
    this.offsetY += delta;
    document.getElementById('input-offset-y').value = this.offsetY;
    this.render();
  }

  autoCalculateGrid() {
    if (!this.image) return;
    const availableW = this.image.naturalWidth - this.offsetX;
    const availableH = this.image.naturalHeight - this.offsetY;
    this.cols = Math.max(2, Math.floor(availableW / this.tileSize));
    this.rows = Math.max(2, Math.floor(availableH / this.tileSize));
    document.getElementById('input-grid-cols').value = this.cols;
    document.getElementById('input-grid-rows').value = this.rows;
    this.render();
    this.showToast(`Auto-computed grid: ${this.cols} × ${this.rows} tiles`);
  }

  adjustZoom(factor) {
    this.zoom = Math.max(0.2, Math.min(5.0, this.zoom * factor));
    document.getElementById('info-zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
    this.render();
  }

  resetZoom() {
    this.zoom = 1.0;
    this.panX = 40;
    this.panY = 40;
    document.getElementById('info-zoom-level').textContent = '100%';
    this.render();
  }

  fitToScreen() {
    if (!this.image && (!this.cols || !this.rows)) return;
    const totalW = this.image ? this.image.naturalWidth : (this.cols * this.tileSize);
    const totalH = this.image ? this.image.naturalHeight : (this.rows * this.tileSize);

    const vpRect = this.viewport.getBoundingClientRect();
    const margin = 50;
    const scaleX = (vpRect.width - margin * 2) / totalW;
    const scaleY = (vpRect.height - margin * 2) / totalH;
    this.zoom = Math.max(0.3, Math.min(2.5, Math.min(scaleX, scaleY)));

    this.panX = (vpRect.width - totalW * this.zoom) / 2;
    this.panY = (vpRect.height - totalH * this.zoom) / 2;

    document.getElementById('info-zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
    this.render();
  }

  // ---------------- Undo / Redo ----------------
  pushHistory() {
    const snapshot = {
      corridorTiles: new Set(this.corridorTiles),
      rooms: JSON.parse(JSON.stringify(this.rooms))
    };
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    document.getElementById('btn-undo').disabled = false;
    document.getElementById('btn-redo').disabled = true;
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const current = {
      corridorTiles: new Set(this.corridorTiles),
      rooms: JSON.parse(JSON.stringify(this.rooms))
    };
    this.redoStack.push(current);

    const prev = this.undoStack.pop();
    this.corridorTiles = prev.corridorTiles;
    this.rooms = prev.rooms;

    document.getElementById('btn-undo').disabled = this.undoStack.length === 0;
    document.getElementById('btn-redo').disabled = false;
    this.updateRoomListUI();
    this.updateRoomInspector();
    this.render();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const current = {
      corridorTiles: new Set(this.corridorTiles),
      rooms: JSON.parse(JSON.stringify(this.rooms))
    };
    this.undoStack.push(current);

    const next = this.redoStack.pop();
    this.corridorTiles = next.corridorTiles;
    this.rooms = next.rooms;

    document.getElementById('btn-undo').disabled = false;
    document.getElementById('btn-redo').disabled = this.redoStack.length === 0;
    this.updateRoomListUI();
    this.updateRoomInspector();
    this.render();
  }

  // ---------------- Loading Presets & Images ----------------
  async loadPreset(presetId) {
    const presetsRes = await window.robosBlockmap.listBoardPresets();
    if (!presetsRes.success) return;
    const p = presetsRes.presets.find(x => x.id === presetId) || presetsRes.presets[0];

    document.getElementById('board-preset-select').value = p.id;
    this.boardId = p.id;
    this.boardTitle = p.title;
    this.tileSize = p.defaultTileSize || 39.0;
    this.offsetX = p.offsetX || 0;
    this.offsetY = p.offsetY || 0;
    this.cols = p.defaultCols || 26;
    this.rows = p.defaultRows || 19;
    this.addBorder = !!p.hasBorder;

    document.getElementById('input-tile-size').value = this.tileSize.toFixed(1);
    document.getElementById('slider-tile-size').value = this.tileSize;
    document.getElementById('input-offset-x').value = this.offsetX;
    document.getElementById('input-offset-y').value = this.offsetY;
    document.getElementById('input-grid-cols').value = this.cols;
    document.getElementById('input-grid-rows').value = this.rows;
    document.getElementById('chk-add-border').checked = this.addBorder;

    if (p.cartridgeSlug) {
      await this.loadCartridge(p.cartridgeSlug);
    } else {
      await this.loadImageFile(p.file);
    }
  }

  async loadImageFile(filePath) {
    const res = await window.robosBlockmap.loadImage(filePath);
    if (!res.success) {
      this.showToast(`Error: ${res.error}`);
      return;
    }

    const img = new Image();
    img.onload = () => {
      this.image = img;
      this.imagePath = res.filePath;
      this.fileName = res.fileName;

      document.getElementById('info-image-name').textContent = `🖼️ ${this.fileName}`;
      document.getElementById('info-image-size').textContent = `📐 ${img.naturalWidth} × ${img.naturalHeight} px`;
      document.getElementById('info-grid-size').textContent = `🧱 ${this.cols} × ${this.rows} grid`;

      if (this.addBorder && this.corridorTiles.size === 0) {
        this.fillOuterPerimeterCorridor();
      }
      this.fitToScreen();
      this.render();
      this.showToast(`Loaded map image: ${this.fileName}`);
    };
    img.src = res.dataUrl;
  }

  async handleOpenImage() {
    const res = await window.robosBlockmap.openFileDialog();
    if (res.canceled || !res.success) return;

    const img = new Image();
    img.onload = () => {
      this.image = img;
      this.imagePath = res.filePath;
      this.fileName = res.fileName;

      document.getElementById('info-image-name').textContent = `🖼️ ${this.fileName}`;
      document.getElementById('info-image-size').textContent = `📐 ${img.naturalWidth} × ${img.naturalHeight} px`;

      this.autoCalculateGrid();
      if (this.addBorder) this.fillOuterPerimeterCorridor();
      this.fitToScreen();
      this.render();
      this.showToast(`Loaded image: ${this.fileName}`);
    };
    img.src = res.dataUrl;
  }

  async loadCartridge(slug) {
    this.cartridgeSlug = slug;
    const res = await window.robosBlockmap.loadCartridgeMap(slug);
    if (!res.success) {
      console.warn('Could not load cartridge map:', res.error);
      return;
    }

    const map = res.mapData || {};
    this.cols = map.width || 26;
    this.rows = map.height || 19;
    this.rooms = (map.rooms || []).map((r, i) => ({
      ...r,
      color: r.color || ROOM_COLORS[i % ROOM_COLORS.length]
    }));

    if (map.calibration) {
      if (map.calibration.tileSize) this.tileSize = map.calibration.tileSize;
      if (map.calibration.offsetX !== undefined) this.offsetX = map.calibration.offsetX;
      if (map.calibration.offsetY !== undefined) this.offsetY = map.calibration.offsetY;
      if (map.calibration.border !== undefined) this.addBorder = map.calibration.border;
    }

    document.getElementById('input-tile-size').value = this.tileSize.toFixed(1);
    document.getElementById('slider-tile-size').value = this.tileSize;
    document.getElementById('input-offset-x').value = this.offsetX;
    document.getElementById('input-offset-y').value = this.offsetY;
    document.getElementById('input-grid-cols').value = this.cols;
    document.getElementById('input-grid-rows').value = this.rows;
    document.getElementById('chk-add-border').checked = this.addBorder;

    this.selectedRoomId = this.rooms.length > 0 ? this.rooms[0].id : null;
    this.updateRoomListUI();
    this.updateRoomInspector();

    if (this.addBorder) {
      this.fillOuterPerimeterCorridor();
    }

    if (res.imageData && res.imageData.dataUrl) {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.imagePath = res.imageData.filePath;
        this.fileName = res.imageData.fileName;
        document.getElementById('info-image-name').textContent = `🖼️ ${this.fileName}`;
        document.getElementById('info-image-size').textContent = `📐 ${img.naturalWidth} × ${img.naturalHeight} px`;
        document.getElementById('info-grid-size').textContent = `🧱 ${this.cols} × ${this.rows} grid`;
        this.fitToScreen();
        this.render();
      };
      img.src = res.imageData.dataUrl;
    } else {
      this.render();
    }
  }

  // ---------------- Export & Save ----------------
  getStaticBoardPayload() {
    return {
      id: this.boardId || 'custom-board',
      title: this.boardTitle || `${this.fileName} Static Board`,
      backgroundImage: this.imagePath ? `res://assets/boards/${this.fileName}` : 'res://assets/boards/first_light_dungeon.png',
      gridDimensions: [this.cols, this.rows],
      calibration: {
        tileSize: this.tileSize,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        hasBorder: this.addBorder
      },
      rooms: this.rooms.map(r => ({
        id: r.id,
        name: r.name,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        quadrant: r.quadrant || 'center'
      })),
      corridors: Array.from(this.corridorTiles).map(k => k.split(',').map(Number))
    };
  }

  async saveBoard() {
    const payload = {
      cartridgeSlug: this.cartridgeSlug,
      mapId: 'fortress-fire-king',
      mapData: {
        width: this.cols,
        height: this.rows,
        backgroundImage: `res://assets/boards/${this.fileName}`,
        calibration: {
          tileSize: this.tileSize,
          offsetX: this.offsetX,
          offsetY: this.offsetY,
          border: this.addBorder
        },
        rooms: this.rooms.map(r => ({
          id: r.id,
          name: r.name,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          quadrant: r.quadrant || 'center'
        }))
      }
    };

    const res = await window.robosBlockmap.saveCartridgeMap(payload);
    if (res.success) {
      this.showToast(`Saved static board blockmap to ${this.cartridgeSlug}!`);
    } else {
      this.showToast(`Save failed: ${res.error}`);
    }
  }

  async exportJsonFile() {
    const data = JSON.stringify(this.getStaticBoardPayload(), null, 2);
    const res = await window.robosBlockmap.saveMapToFile({
      content: data,
      suggestedName: `${this.boardId || 'board'}.blockmap.json`
    });
    if (res.success) {
      this.showToast(`Exported board to ${res.filePath}`);
    }
  }

  async copyJsonToClipboard() {
    const data = JSON.stringify(this.getStaticBoardPayload(), null, 2);
    await window.robosBlockmap.copyToClipboard(data);
    this.showToast('Copied Static Board JSON to clipboard!');
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  // ---------------- Canvas Rendering ----------------
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    const totalGridW = this.cols * this.tileSize;
    const totalGridH = this.rows * this.tileSize;

    // 1. Draw Map Image
    if (this.showImage && this.image) {
      ctx.save();
      ctx.globalAlpha = this.artOpacity;
      ctx.drawImage(this.image, 0, 0);
      ctx.restore();
    } else if (!this.image) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(this.offsetX, this.offsetY, totalGridW, totalGridH);
    }

    // 2. Draw 1-Tile Outer Border Corridor Highlight
    if (this.addBorder) {
      ctx.save();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.09)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1.2;

      // Top & Bottom border rows
      ctx.fillRect(this.offsetX, this.offsetY, totalGridW, this.tileSize);
      ctx.fillRect(this.offsetX, this.offsetY + totalGridH - this.tileSize, totalGridW, this.tileSize);
      // Left & Right border cols
      ctx.fillRect(this.offsetX, this.offsetY, this.tileSize, totalGridH);
      ctx.fillRect(this.offsetX + totalGridW - this.tileSize, this.offsetY, this.tileSize, totalGridH);

      ctx.restore();
    }

    // 3. Draw Corridor Floor Tiles
    if (this.showCorridors && this.corridorTiles.size > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.0;

      for (const key of this.corridorTiles) {
        const [c, r] = key.split(',').map(Number);
        const tx = this.offsetX + c * this.tileSize;
        const ty = this.offsetY + r * this.tileSize;
        ctx.fillRect(tx, ty, this.tileSize, this.tileSize);
      }
      ctx.restore();
    }

    // 4. Draw Static Rooms
    if (this.showRooms) {
      this.rooms.forEach(r => {
        const isSelected = r.id === this.selectedRoomId;
        const rx = this.offsetX + r.x * this.tileSize;
        const ry = this.offsetY + r.y * this.tileSize;
        const rw = r.w * this.tileSize;
        const rh = r.h * this.tileSize;

        ctx.save();
        // Room floor tint
        ctx.fillStyle = isSelected ? 'rgba(0, 188, 212, 0.32)' : 'rgba(16, 185, 129, 0.16)';
        ctx.fillRect(rx, ry, rw, rh);

        // Room solid wall boundary
        ctx.strokeStyle = isSelected ? '#00bcd4' : (r.color || '#10b981');
        ctx.lineWidth = isSelected ? 2.5 : 1.8;
        ctx.strokeRect(rx, ry, rw, rh);

        // Room title banner
        ctx.fillStyle = isSelected ? '#00bcd4' : '#fff';
        ctx.font = `bold ${Math.max(10, Math.min(14, this.tileSize * 0.35))}px sans-serif`;
        ctx.fillText(r.name || r.id, rx + 6, ry + 16);
        ctx.restore();
      });
    }

    // 5. Draw Grid Lines
    if (this.showGrid) {
      ctx.save();
      ctx.strokeStyle = `rgba(0, 229, 255, ${this.gridOpacity})`;
      ctx.lineWidth = 1.0;

      for (let c = 0; c <= this.cols; c++) {
        const x = this.offsetX + c * this.tileSize;
        ctx.beginPath();
        ctx.moveTo(x, this.offsetY);
        ctx.lineTo(x, this.offsetY + totalGridH);
        ctx.stroke();
      }

      for (let r = 0; r <= this.rows; r++) {
        const y = this.offsetY + r * this.tileSize;
        ctx.beginPath();
        ctx.moveTo(this.offsetX, y);
        ctx.lineTo(this.offsetX + totalGridW, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. Draw Coordinate Numbers
    if (this.showCoords && this.zoom >= 0.55) {
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.font = '9px monospace';
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          const tx = this.offsetX + c * this.tileSize;
          const ty = this.offsetY + r * this.tileSize;
          ctx.fillText(`${c},${r}`, tx + 2, ty + 10);
        }
      }
      ctx.restore();
    }

    // 7. Draw Room Box Drag Preview
    if (this.isDrawing && this.activeTool === 'room' && (this.roomMode === 'box' || this.roomMode === 'toggle') && this.dragStartTile && this.dragCurrentTile) {
      const c1 = this.dragStartTile.col;
      const r1 = this.dragStartTile.row;
      const c2 = this.dragCurrentTile.col;
      const r2 = this.dragCurrentTile.row;

      const rx = Math.max(0, Math.min(c1, c2));
      const ry = Math.max(0, Math.min(r1, r2));
      const rw = Math.min(this.cols - rx, Math.abs(c2 - c1) + 1);
      const rh = Math.min(this.rows - ry, Math.abs(r2 - r1) + 1);

      const px = this.offsetX + rx * this.tileSize;
      const py = this.offsetY + ry * this.tileSize;
      const pw = rw * this.tileSize;
      const ph = rh * this.tileSize;

      ctx.save();
      ctx.fillStyle = 'rgba(0, 188, 212, 0.35)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#00bcd4';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(px, py, pw, ph);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`Room: [${rx}, ${ry}] ${rw}×${rh}`, px + 6, py + 18);
      ctx.restore();
    }

    ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.blockmapCreator = new BlockmapCreator();
});
