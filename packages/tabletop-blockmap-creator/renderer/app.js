'use strict';

/**
 * RobOS Tabletop Blockmap Creator — Layer 1: Static Board Geometry & Tile Calibration
 * Focuses exclusively on the permanent cardboard board specification:
 * - Tile Size (px)
 * - Map Image Offset (X, Y)
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

function getShapeHelper(name) {
  if (typeof window !== 'undefined' && window.RobOSRoomShape && typeof window.RobOSRoomShape[name] === 'function') {
    return window.RobOSRoomShape[name];
  }
  if (typeof window !== 'undefined' && typeof window[name] === 'function') {
    return window[name];
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis[name] === 'function') {
    return globalThis[name];
  }
  return null;
}

function callValidateRoomContiguity(tiles) {
  const fn = getShapeHelper('validateRoomContiguity');
  return fn ? fn(tiles) : { valid: true };
}

function callComputeRoomBounds(tiles) {
  const fn = getShapeHelper('computeRoomBoundsFromTiles');
  return fn ? fn(tiles) : { x: 0, y: 0, w: 1, h: 1 };
}

function callGenerateRectTiles(x, y, w, h) {
  const fn = getShapeHelper('generateRectTiles');
  return fn ? fn(x, y, w, h) : [];
}

function callGetRoomPerimeterEdges(tiles) {
  const fn = getShapeHelper('getRoomPerimeterEdges');
  return fn ? fn(tiles) : [];
}


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
    this.additionalBorderTile = false;

    // Viewport transform
    this.panX = 40;
    this.panY = 40;
    this.zoom = 1.0;

    // 2. Active Tools
    this.activeTool = 'inspect';  // 'inspect', 'corridor', 'room', 'erase'
    this.corridorMode = 'toggle'; // 'toggle', 'paint', 'erase'
    this.roomMode = 'rect';       // 'rect' (Rectangle Selector), 'freeform' (Free Form Selector)
    this.draftFreeformTiles = new Set(); // Set of "col,row" strings
    this.draftStrokeHistory = [];        // Array of { added: string[], removed: string[] } for freeform undo
    this.currentFreeformStroke = null;   // Active stroke delta during drawing
    this.freeformEditingRoomId = null;   // null if new room, roomId if editing existing
    this.invalidFreeformTiles = null;    // Set of "col,row" when rejected
    this.freeformStrokeAction = 'add';   // 'add' or 'remove' during drag stroke

    // 3. Layer 1 Data
    this.image = null;
    this.imagePath = '';
    this.fileName = 'first_light_dungeon.png';
    this.boardId = 'first-light-dungeon';
    this.boardTitle = 'HeroQuest: First Light Side A';
    this.cartridgeSlug = null;

    this.corridorTiles = new Set(); // "col,row" strings
    this.rooms = [];                // Array of { id, name, x, y, w, h, shape, tiles, tileSet, quadrant, color }
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
        if (startup.type === 'blockmap' || startup.value.endsWith('.blockmap.json') || startup.value.includes('.blockmap.')) {
          await this.loadBlockmapFile(startup.value);
        } else if (startup.type === 'cartridge' || startup.value.includes('cartridge')) {
          await this.loadCartridge(startup.value);
        } else if (startup.type === 'image') {
          // If image matches a board preset, load the preset and all its rooms
          const presetsRes = await window.robosBlockmap.listBoardPresets();
          const matched = (presetsRes && presetsRes.presets) ? presetsRes.presets.find(p =>
            p.file.endsWith(startup.value) ||
            startup.value.endsWith(p.file) ||
            p.id === startup.value.replace(/\.[^/.]+$/, '')
          ) : null;
          if (matched) {
            await this.loadPreset(matched.id);
          } else {
            await this.loadImageFile(startup.value);
          }
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

    // Map Identity Controls
    const inputMapTitle = document.getElementById('input-map-title');
    if (inputMapTitle) {
      inputMapTitle.addEventListener('input', (e) => {
        this.boardTitle = e.target.value;
        const infoTitle = document.getElementById('info-map-title-text');
        if (infoTitle) infoTitle.textContent = this.boardTitle || 'Untitled Blockmap';
      });
      inputMapTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') inputMapTitle.blur();
      });
    }

    const inputMapId = document.getElementById('input-map-id');
    if (inputMapId) {
      inputMapId.addEventListener('input', (e) => {
        this.boardId = e.target.value.toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
      });
      inputMapId.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') inputMapId.blur();
      });
    }

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
    inputTile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') inputTile.blur();
    });

    sliderTile.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.tileSize = val;
      inputTile.value = val.toFixed(1);
      this.render();
    });

    document.getElementById('btn-tile-minus-1').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepTileSize(-1.0); });
    document.getElementById('btn-tile-minus-01').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepTileSize(-0.1); });
    document.getElementById('btn-tile-plus-01').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepTileSize(0.1); });
    document.getElementById('btn-tile-plus-1').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepTileSize(1.0); });

    // 2. Offset X Controls
    const inputOffX = document.getElementById('input-offset-x');
    inputOffX.addEventListener('input', (e) => {
      this.offsetX = parseFloat(e.target.value) || 0;
      this.render();
    });
    inputOffX.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') inputOffX.blur();
    });
    document.getElementById('btn-offx-minus-5').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepOffsetX(-5); });
    document.getElementById('btn-offx-minus-1').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepOffsetX(-1); });
    document.getElementById('btn-offx-plus-1').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepOffsetX(1); });
    document.getElementById('btn-offx-plus-5').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepOffsetX(5); });

    // Offset Y Controls
    const inputOffY = document.getElementById('input-offset-y');
    inputOffY.addEventListener('input', (e) => {
      this.offsetY = parseFloat(e.target.value) || 0;
      this.render();
    });
    inputOffY.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') inputOffY.blur();
    });
    document.getElementById('btn-offy-minus-5').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepOffsetY(-5); });
    document.getElementById('btn-offy-minus-1').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepOffsetY(-1); });
    document.getElementById('btn-offy-plus-1').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepOffsetY(1); });
    document.getElementById('btn-offy-plus-5').addEventListener('click', () => { if (document.activeElement) document.activeElement.blur(); this.stepOffsetY(5); });

    // Border Options
    const chkBorder = document.getElementById('chk-additional-border');
    if (chkBorder) {
      chkBorder.addEventListener('change', (e) => {
        this.additionalBorderTile = e.target.checked;
        this.render();
      });
    }

    // 3. Grid Dimensions
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
      r.addEventListener('change', (e) => { this.setRoomMode(e.target.value); });
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
      this.setActiveTool('room');
      this.setRoomMode('rect');
      this.showToast('Rectangle Selector: Drag on map to define room bounds');
    });

    const btnClearRooms = document.getElementById('btn-clear-all-rooms');
    if (btnClearRooms) {
      btnClearRooms.addEventListener('click', () => {
        this.clearAllRooms();
      });
    }

    const btnFreeformRoom = document.getElementById('btn-add-freeform-room');
    if (btnFreeformRoom) {
      btnFreeformRoom.addEventListener('click', () => {
        this.startFreeformRoom();
      });
    }

    const btnEditShape = document.getElementById('btn-edit-room-shape');
    if (btnEditShape) {
      btnEditShape.addEventListener('click', () => {
        const room = this.getSelectedRoom();
        if (room) this.startFreeformRoom(room);
      });
    }

    // Freeform Floating Action Bar
    const btnFreeformOk = document.getElementById('btn-freeform-ok');
    if (btnFreeformOk) {
      btnFreeformOk.addEventListener('click', () => this.finishFreeformRoom());
    }
    const btnFreeformClear = document.getElementById('btn-freeform-clear');
    if (btnFreeformClear) {
      btnFreeformClear.addEventListener('click', () => this.clearFreeformDraft());
    }
    const btnFreeformCancel = document.getElementById('btn-freeform-cancel');
    if (btnFreeformCancel) {
      btnFreeformCancel.addEventListener('click', () => this.cancelFreeformRoom());
    }

    // Corridor action buttons
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
      const isRoomTextProperty = (
        e.target && (e.target.id === 'prop-room-name' || e.target.id === 'prop-room-id')
      );
      if (isRoomTextProperty) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.target.blur();
        }
        return; // Allow native typing and text editing in room name/id fields
      }

      // Intercept Ctrl+Z / Ctrl+Y globally.
      // If calibration inputs (offset-x, offset-y, tile-size) or buttons had focus,
      // blur them so native browser undo does NOT roll back offset values!
      const isUndoKey = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ') && !e.shiftKey;
      const isRedoKey = (e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || e.code === 'KeyY' || (e.shiftKey && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ')));

      if (isUndoKey) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        this.undo();
        return;
      }

      if (isRedoKey) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        this.redo();
        return;
      }

      // Ignore single-character tool shortcuts if the user is typing in any other text input
      if (e.target && (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && !['radio', 'checkbox', 'range', 'button', 'submit'].includes(e.target.type)))) {
        if (e.key === 'Escape' || e.key === 'Enter') e.target.blur();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault(); // Prevent space from scrolling container/page down
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
      } else if (e.key === 'Enter') {
        if (this.roomMode === 'freeform' && this.draftFreeformTiles.size > 0) {
          e.preventDefault();
          this.finishFreeformRoom();
        }
      } else if (e.key === 'Escape') {
        if (this.roomMode === 'freeform') {
          e.preventDefault();
          this.cancelFreeformRoom();
        }
      }
    }, true);

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
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

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

      // Only push to undoStack for tools that immediately mutate persistent state
      if (this.activeTool === 'corridor' || this.activeTool === 'erase' || (this.activeTool === 'room' && this.roomMode === 'rect')) {
        this.pushHistory();
      }

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
        if (this.roomMode === 'freeform') {
          this.currentFreeformStroke = { added: [], removed: [] };
          if (this.isTileInBounds(tile.col, tile.row)) {
            const key = `${tile.col},${tile.row}`;
            this.freeformStrokeAction = this.draftFreeformTiles.has(key) ? 'remove' : 'add';
            if (this.freeformStrokeAction === 'add') {
              this.draftFreeformTiles.add(key);
              this.currentFreeformStroke.added.push(key);
            } else {
              this.draftFreeformTiles.delete(key);
              this.currentFreeformStroke.removed.push(key);
            }
            this.invalidFreeformTiles = null;
            this.modifiedThisStroke.add(key);
            this.updateFreeformHUD();
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
      } else if (this.activeTool === 'room' && this.roomMode === 'freeform' && this.isTileInBounds(tile.col, tile.row)) {
        const key = `${tile.col},${tile.row}`;
        if (!this.modifiedThisStroke.has(key)) {
          this.modifiedThisStroke.add(key);
          if (this.freeformStrokeAction === 'add') {
            this.draftFreeformTiles.add(key);
            if (this.currentFreeformStroke) this.currentFreeformStroke.added.push(key);
          } else {
            this.draftFreeformTiles.delete(key);
            if (this.currentFreeformStroke) this.currentFreeformStroke.removed.push(key);
          }
          this.invalidFreeformTiles = null;
          this.updateFreeformHUD();
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

      // Finalize room rectangle if dragging box in rect mode
      if (this.activeTool === 'room' && this.roomMode === 'rect' && this.dragStartTile) {
        const c1 = this.dragStartTile.col;
        const r1 = this.dragStartTile.row;
        const c2 = tile.col;
        const r2 = tile.row;

        const rx = Math.max(0, Math.min(c1, c2));
        const ry = Math.max(0, Math.min(r1, r2));
        const rw = Math.min(this.cols - rx, Math.abs(c2 - c1) + 1);
        const rh = Math.min(this.rows - ry, Math.abs(r2 - r1) + 1);

        if (rw >= 1 && rh >= 1) {
          this.addNewRoom(rx, ry, rw, rh);
        }
      } else if (this.activeTool === 'room' && this.roomMode === 'freeform') {
        if (this.currentFreeformStroke && (this.currentFreeformStroke.added.length > 0 || this.currentFreeformStroke.removed.length > 0)) {
          this.draftStrokeHistory.push(this.currentFreeformStroke);
        }
        this.currentFreeformStroke = null;
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

  eraseAtTile(col, row) {
    this.corridorTiles.delete(`${col},${row}`);
    document.getElementById('corridor-count').textContent = this.corridorTiles.size;
  }

  // ---------------- Rooms Management ----------------
  roomContainsTile(room, col, row) {
    if (!room) return false;
    if (room.tileSet) {
      return room.tileSet.has(`${col},${row}`);
    }
    if (room.tiles && Array.isArray(room.tiles)) {
      return room.tiles.some(t => t[0] === col && t[1] === row);
    }
    return col >= room.x && col < room.x + room.w && row >= room.y && row < room.y + room.h;
  }

  getNextRoomNumber() {
    let maxNum = 0;
    for (const r of this.rooms) {
      const match = (r.name || '').match(/Room\s+(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return maxNum > 0 ? maxNum + 1 : this.rooms.length + 1;
  }

  generateUniqueRoomId(quadrant) {
    const existingIds = new Set(this.rooms.map(r => r.id));
    let num = this.getNextRoomNumber();
    let id = `room-${quadrant}-${num}`;
    while (existingIds.has(id)) {
      num++;
      id = `room-${quadrant}-${num}`;
    }
    return id;
  }

  addNewRoom(x = 1, y = 1, w = 4, h = 4) {
    const count = this.getNextRoomNumber();
    const quadrant = this.determineQuadrant(x, y);
    const color = ROOM_COLORS[(this.rooms.length) % ROOM_COLORS.length];
    const tiles = callGenerateRectTiles(x, y, w, h);
    const id = this.generateUniqueRoomId(quadrant);
    const newRoom = {
      id: id,
      name: `Room ${count} (${quadrant.toUpperCase()})`,
      x: x,
      y: y,
      w: w,
      h: h,
      shape: 'rect',
      tiles: tiles,
      tileSet: new Set(tiles.map(t => `${t[0]},${t[1]}`)),
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

  addNewFreeformRoom(tileArray) {
    const bounds = callComputeRoomBounds(tileArray);
    const count = this.getNextRoomNumber();
    const quadrant = this.determineQuadrant(bounds.x, bounds.y);
    const color = ROOM_COLORS[(this.rooms.length) % ROOM_COLORS.length];
    const isRect = tileArray.length === bounds.w * bounds.h;
    const id = this.generateUniqueRoomId(quadrant);

    const newRoom = {
      id: id,
      name: `Room ${count} (${quadrant.toUpperCase()})`,
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      shape: isRect ? 'rect' : 'freeform',
      tiles: tileArray,
      tileSet: new Set(tileArray.map(t => `${t[0]},${t[1]}`)),
      quadrant: quadrant,
      color: color
    };

    this.rooms.push(newRoom);
    this.selectedRoomId = newRoom.id;
    this.updateRoomListUI();
    this.updateRoomInspector();
    this.showToast(`Defined ${newRoom.shape} room: ${newRoom.name} (${tileArray.length} tiles)`);
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

  clearAllRooms() {
    if (this.rooms.length === 0) {
      this.showToast('No rooms to clear');
      return;
    }
    this.pushHistory();
    const count = this.rooms.length;
    this.rooms = [];
    this.selectedRoomId = null;
    this.updateRoomListUI();
    this.updateRoomInspector();
    this.render();
    this.showToast(`Cleared all ${count} rooms`);
  }

  getSelectedRoom() {
    return this.rooms.find(r => r.id === this.selectedRoomId) || null;
  }

  getRoomAtTile(col, row) {
    for (const r of this.rooms) {
      if (this.roomContainsTile(r, col, row)) {
        return r;
      }
    }
    return null;
  }

  setRoomMode(mode) {
    this.roomMode = mode;
    const radio = document.querySelector(`input[name="room-mode"][value="${mode}"]`);
    if (radio) radio.checked = true;

    const bar = document.getElementById('freeform-action-bar');
    if (bar) {
      if (mode === 'freeform') {
        bar.classList.remove('hidden');
      } else if (!this.freeformEditingRoomId && this.draftFreeformTiles.size === 0) {
        bar.classList.add('hidden');
      }
    }
    this.render();
  }

  startFreeformRoom(existingRoom = null) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    this.setActiveTool('room');
    this.setRoomMode('freeform');
    this.invalidFreeformTiles = null;
    this.draftStrokeHistory = [];
    this.currentFreeformStroke = null;

    if (existingRoom) {
      this.freeformEditingRoomId = existingRoom.id;
      const tiles = existingRoom.tiles && existingRoom.tiles.length > 0
        ? existingRoom.tiles
        : callGenerateRectTiles(existingRoom.x, existingRoom.y, existingRoom.w, existingRoom.h);
      this.draftFreeformTiles = new Set(tiles.map(t => `${t[0]},${t[1]}`));
      const statusEl = document.getElementById('freeform-status-text');
      if (statusEl) {
        statusEl.innerHTML = `Editing <strong>${existingRoom.name}</strong>: Click/drag tiles. Must connect: <strong id="freeform-tile-count">${this.draftFreeformTiles.size}</strong> tiles`;
      }
      this.showToast(`Editing shape for ${existingRoom.name} in Free Form mode`);
    } else {
      this.freeformEditingRoomId = null;
      this.draftFreeformTiles.clear();
      const statusEl = document.getElementById('freeform-status-text');
      if (statusEl) {
        statusEl.innerHTML = `Click / drag tiles to define room boundaries: <strong id="freeform-tile-count">0</strong> tiles`;
      }
      this.showToast('Free Form mode: Click or drag tiles, then click OK');
    }

    const bar = document.getElementById('freeform-action-bar');
    if (bar) bar.classList.remove('hidden');
    this.updateFreeformHUD();
    this.render();
  }

  finishFreeformRoom() {
    if (this.draftFreeformTiles.size === 0) {
      this.showToast('⚠️ Room cannot be empty! Click or drag to add tiles.');
      return;
    }

    // Contiguity validation: reject any non-connecting shapes
    const validation = callValidateRoomContiguity(this.draftFreeformTiles);

    if (!validation.valid) {
      this.invalidFreeformTiles = new Set(this.draftFreeformTiles);
      const reasonMsg = validation.reason || 'All tiles in a room must be orthogonally connected.';
      this.showToast(`❌ Rejected: Non-connecting room shape! ${reasonMsg}`);
      const statusEl = document.getElementById('freeform-status-text');
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:#ef4444;font-weight:bold;">❌ Rejected: Non-connecting shape (${validation.componentCount || 0} separate islands). Must connect!</span>`;
      }
      this.render();
      return;
    }

    this.invalidFreeformTiles = null;
    this.draftStrokeHistory = [];
    this.currentFreeformStroke = null;
    const tileArray = Array.from(this.draftFreeformTiles).map(k => k.split(',').map(Number));
    const bounds = callComputeRoomBounds(tileArray);
    const isRect = tileArray.length === bounds.w * bounds.h;

    this.pushHistory();

    if (this.freeformEditingRoomId) {
      const room = this.rooms.find(r => r.id === this.freeformEditingRoomId);
      if (room) {
        room.x = bounds.x;
        room.y = bounds.y;
        room.w = bounds.w;
        room.h = bounds.h;
        room.shape = isRect ? 'rect' : 'freeform';
        room.tiles = tileArray;
        room.tileSet = new Set(this.draftFreeformTiles);
        this.selectedRoomId = room.id;
        this.showToast(`Updated shape for ${room.name} (${tileArray.length} tiles)`);
      }
    } else {
      this.addNewFreeformRoom(tileArray);
    }

    this.cancelFreeformRoom(false);
    this.updateRoomListUI();
    this.updateRoomInspector();
    this.render();
  }

  cancelFreeformRoom(notify = true) {
    this.draftFreeformTiles.clear();
    this.draftStrokeHistory = [];
    this.currentFreeformStroke = null;
    this.freeformEditingRoomId = null;
    this.invalidFreeformTiles = null;
    const bar = document.getElementById('freeform-action-bar');
    if (bar) bar.classList.add('hidden');
    this.setRoomMode('rect');
    this.render();
    if (notify) this.showToast('Cancelled Free Form mode');
  }

  clearFreeformDraft() {
    this.draftFreeformTiles.clear();
    this.draftStrokeHistory = [];
    this.currentFreeformStroke = null;
    this.invalidFreeformTiles = null;
    this.updateFreeformHUD();
    this.render();
    this.showToast('Cleared draft tiles');
  }

  updateFreeformHUD() {
    const el = document.getElementById('freeform-tile-count');
    if (el) el.textContent = this.draftFreeformTiles.size;
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
      const shapeLabel = r.shape === 'freeform' ? 'Free Form' : 'Rect';
      const tileCount = r.tiles ? r.tiles.length : (r.w * r.h);
      card.innerHTML = `
        <div class="room-item-badge" style="background:${r.color || '#00bcd4'};"></div>
        <div class="room-item-info">
          <span class="room-item-title">${r.name}</span>
          <span class="room-item-coords">[${r.x}, ${r.y}] ${r.w}×${r.h} • ${shapeLabel} (${tileCount}t) • ${r.quadrant.toUpperCase()}</span>
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
      const shapeEl = document.getElementById('prop-room-shape');
      if (shapeEl) shapeEl.textContent = '-';
      const tilesEl = document.getElementById('prop-room-tiles-count');
      if (tilesEl) tilesEl.textContent = '0';
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
    const shapeEl = document.getElementById('prop-room-shape');
    if (shapeEl) shapeEl.textContent = room.shape === 'freeform' ? 'Free Form' : 'Rectangle';
    const tilesEl = document.getElementById('prop-room-tiles-count');
    if (tilesEl) tilesEl.textContent = room.tiles ? room.tiles.length : (room.w * room.h);
  }

  updateMapIdentityUI() {
    const titleEl = document.getElementById('input-map-title');
    if (titleEl && document.activeElement !== titleEl) {
      titleEl.value = this.boardTitle || '';
    }
    const idEl = document.getElementById('input-map-id');
    if (idEl && document.activeElement !== idEl) {
      idEl.value = this.boardId || '';
    }
    const infoTitle = document.getElementById('info-map-title-text');
    if (infoTitle) {
      infoTitle.textContent = this.boardTitle || 'Untitled Blockmap';
    }
  }

  setActiveTool(tool) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
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
      rooms: this.rooms.map(r => ({
        ...r,
        tiles: r.tiles ? r.tiles.map(t => [...t]) : [],
        tileSet: new Set(r.tileSet ? r.tileSet : (r.tiles || []).map(t => `${t[0]},${t[1]}`))
      })),
      selectedRoomId: this.selectedRoomId
    };
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) btnUndo.disabled = false;
    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) btnRedo.disabled = true;
  }

  undo() {
    // 1. If in freeform mode with active draft strokes, undo the last stroke first
    if (this.roomMode === 'freeform') {
      if (this.draftStrokeHistory && this.draftStrokeHistory.length > 0) {
        const stroke = this.draftStrokeHistory.pop();
        if (stroke.added) {
          for (const k of stroke.added) {
            this.draftFreeformTiles.delete(k);
          }
        }
        if (stroke.removed) {
          for (const k of stroke.removed) {
            this.draftFreeformTiles.add(k);
          }
        }
        this.invalidFreeformTiles = null;
        this.updateFreeformHUD();
        this.render();
        this.showToast(`Undid draft tile stroke (${this.draftFreeformTiles.size} tiles remaining)`);
        return;
      } else if (this.draftFreeformTiles && this.draftFreeformTiles.size > 0) {
        this.draftFreeformTiles.clear();
        this.invalidFreeformTiles = null;
        this.updateFreeformHUD();
        this.render();
        this.showToast('Cleared draft room tiles');
        return;
      }
    }

    // 2. Global room & corridor undo
    if (this.undoStack.length === 0) return;
    const current = {
      corridorTiles: new Set(this.corridorTiles),
      rooms: this.rooms.map(r => ({
        ...r,
        tiles: r.tiles ? r.tiles.map(t => [...t]) : [],
        tileSet: new Set(r.tileSet ? r.tileSet : (r.tiles || []).map(t => `${t[0]},${t[1]}`))
      })),
      selectedRoomId: this.selectedRoomId
    };
    this.redoStack.push(current);

    const prev = this.undoStack.pop();
    this.corridorTiles = new Set(prev.corridorTiles);
    this.rooms = (prev.rooms || []).map(r => ({
      ...r,
      tiles: r.tiles ? r.tiles.map(t => [...t]) : [],
      tileSet: new Set(r.tileSet ? r.tileSet : (r.tiles || []).map(t => `${t[0]},${t[1]}`))
    }));
    this.selectedRoomId = prev.selectedRoomId || (this.rooms.length > 0 ? this.rooms[0].id : null);

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) btnUndo.disabled = this.undoStack.length === 0;
    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) btnRedo.disabled = false;
    this.updateRoomListUI();
    this.updateRoomInspector();
    this.render();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const current = {
      corridorTiles: new Set(this.corridorTiles),
      rooms: this.rooms.map(r => ({
        ...r,
        tiles: r.tiles ? r.tiles.map(t => [...t]) : [],
        tileSet: new Set(r.tileSet ? r.tileSet : (r.tiles || []).map(t => `${t[0]},${t[1]}`))
      })),
      selectedRoomId: this.selectedRoomId
    };
    this.undoStack.push(current);

    const next = this.redoStack.pop();
    this.corridorTiles = new Set(next.corridorTiles);
    this.rooms = (next.rooms || []).map(r => ({
      ...r,
      tiles: r.tiles ? r.tiles.map(t => [...t]) : [],
      tileSet: new Set(r.tileSet ? r.tileSet : (r.tiles || []).map(t => `${t[0]},${t[1]}`))
    }));
    this.selectedRoomId = next.selectedRoomId || (this.rooms.length > 0 ? this.rooms[0].id : null);

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) btnUndo.disabled = false;
    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
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
    this.cartridgeSlug = null;
    this.updateMapIdentityUI();
    this.tileSize = p.defaultTileSize || 39.0;
    this.offsetX = p.offsetX || 0;
    this.offsetY = p.offsetY || 0;
    this.cols = p.defaultCols || 26;
    this.rows = p.defaultRows || 19;

    document.getElementById('input-tile-size').value = this.tileSize.toFixed(1);
    document.getElementById('slider-tile-size').value = this.tileSize;
    document.getElementById('input-offset-x').value = this.offsetX;
    document.getElementById('input-offset-y').value = this.offsetY;
    document.getElementById('input-grid-cols').value = this.cols;
    document.getElementById('input-grid-rows').value = this.rows;

    const boardRes = await window.robosBlockmap.loadBoardMap(p.id);
    if (boardRes && boardRes.success && boardRes.boardData) {
      await this.applyBoardData(boardRes.boardData, boardRes.imageData);
    } else {
      await this.loadImageFile(p.file);
    }
  }

  async loadBlockmapFile(slugOrPath) {
    if (!window.robosBlockmap || !window.robosBlockmap.loadBoardMap) return;
    const res = await window.robosBlockmap.loadBoardMap(slugOrPath);
    if (res && res.success && res.boardData) {
      await this.applyBoardData(res.boardData, res.imageData);
      this.boardId = res.boardId || this.boardId;
      this.cartridgeSlug = null;
      const presetSelect = document.getElementById('board-preset-select');
      if (presetSelect) {
        const optionExists = Array.from(presetSelect.options).some(o => o.value === this.boardId);
        if (optionExists) presetSelect.value = this.boardId;
      }
      this.showToast(`Loaded Blockmap: ${this.boardTitle || this.boardId}`);
    } else {
      this.showToast(`Failed to load blockmap: ${res?.error || 'Unknown error'}`);
    }
  }

  async applyBoardData(boardData, imageData) {
    this.boardId = boardData.id || this.boardId;
    this.boardTitle = boardData.title || this.boardTitle;
    this.updateMapIdentityUI();

    if (boardData.gridDimensions) {
      this.cols = boardData.gridDimensions[0] || this.cols;
      this.rows = boardData.gridDimensions[1] || this.rows;
    } else {
      if (boardData.width) this.cols = boardData.width;
      if (boardData.height) this.rows = boardData.height;
    }

    if (boardData.calibration) {
      if (boardData.calibration.tileSize) this.tileSize = boardData.calibration.tileSize;
      if (boardData.calibration.offsetX !== undefined) this.offsetX = boardData.calibration.offsetX;
      if (boardData.calibration.offsetY !== undefined) this.offsetY = boardData.calibration.offsetY;
    }

    document.getElementById('input-tile-size').value = this.tileSize.toFixed(1);
    document.getElementById('slider-tile-size').value = this.tileSize;
    document.getElementById('input-offset-x').value = this.offsetX;
    document.getElementById('input-offset-y').value = this.offsetY;
    document.getElementById('input-grid-cols').value = this.cols;
    document.getElementById('input-grid-rows').value = this.rows;

    this.additionalBorderTile = Boolean(boardData.additionalBorderTile || boardData.calibration?.additionalBorderTile || boardData.hasBorder || boardData.calibration?.hasBorder);
    const chkBorder = document.getElementById('chk-additional-border');
    if (chkBorder) chkBorder.checked = this.additionalBorderTile;

    this.rooms = (boardData.rooms || []).map((r, i) => {
      const shape = r.shape || 'rect';
      const tiles = r.tiles && r.tiles.length > 0
        ? r.tiles
        : callGenerateRectTiles(r.x, r.y, r.w, r.h);
      return {
        ...r,
        shape: shape,
        tiles: tiles,
        tileSet: new Set(tiles.map(t => `${t[0]},${t[1]}`)),
        color: r.color || ROOM_COLORS[i % ROOM_COLORS.length]
      };
    });

    this.corridorTiles = new Set();
    if (Array.isArray(boardData.corridors)) {
      for (const c of boardData.corridors) {
        if (Array.isArray(c) && c.length >= 2) {
          this.corridorTiles.add(`${c[0]},${c[1]}`);
        }
      }
    }

    this.selectedRoomId = this.rooms.length > 0 ? this.rooms[0].id : null;
    this.updateRoomListUI();
    this.updateRoomInspector();

    if (imageData && imageData.dataUrl) {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.imagePath = imageData.filePath;
        this.fileName = imageData.fileName;
        document.getElementById('info-image-name').textContent = `🖼️ ${this.fileName}`;
        document.getElementById('info-image-size').textContent = `📐 ${img.naturalWidth} × ${img.naturalHeight} px`;
        document.getElementById('info-grid-size').textContent = `🧱 ${this.cols} × ${this.rows} grid`;
        this.fitToScreen();
        this.render();
      };
      img.src = imageData.dataUrl;
    } else {
      this.render();
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

      const baseName = this.fileName.replace(/\.[^/.]+$/, '');
      if (!this.boardTitle || this.boardId === 'first-light-dungeon') {
        this.boardTitle = baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        this.boardId = baseName.toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
      }
      this.updateMapIdentityUI();

      document.getElementById('info-image-name').textContent = `🖼️ ${this.fileName}`;
      document.getElementById('info-image-size').textContent = `📐 ${img.naturalWidth} × ${img.naturalHeight} px`;
      document.getElementById('info-grid-size').textContent = `🧱 ${this.cols} × ${this.rows} grid`;

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

      const baseName = this.fileName.replace(/\.[^/.]+$/, '');
      this.boardTitle = baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      this.boardId = baseName.toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
      this.updateMapIdentityUI();

      document.getElementById('info-image-name').textContent = `🖼️ ${this.fileName}`;
      document.getElementById('info-image-size').textContent = `📐 ${img.naturalWidth} × ${img.naturalHeight} px`;

      this.autoCalculateGrid();
      this.fitToScreen();
      this.render();
      this.showToast(`Loaded image: ${this.fileName}`);
    };
    img.src = res.dataUrl;
  }

  async loadCartridge(slug) {
    this.cartridgeSlug = slug;
    this.boardId = slug;
    const res = await window.robosBlockmap.loadCartridgeMap(slug);
    if (!res.success) {
      console.warn('Could not load cartridge map:', res.error);
      return;
    }

    const map = res.mapData || {};
    this.boardTitle = (map && (map.title || map.name)) || (slug.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    this.updateMapIdentityUI();
    this.cols = map.width || 26;
    this.rows = map.height || 19;
    this.rooms = (map.rooms || []).map((r, i) => {
      const shape = r.shape || 'rect';
      const tiles = r.tiles && r.tiles.length > 0
        ? r.tiles
        : callGenerateRectTiles(r.x, r.y, r.w, r.h);
      return {
        ...r,
        shape: shape,
        tiles: tiles,
        tileSet: new Set(tiles.map(t => `${t[0]},${t[1]}`)),
        color: r.color || ROOM_COLORS[i % ROOM_COLORS.length]
      };
    });

    if (map.calibration) {
      if (map.calibration.tileSize) this.tileSize = map.calibration.tileSize;
      if (map.calibration.offsetX !== undefined) this.offsetX = map.calibration.offsetX;
      if (map.calibration.offsetY !== undefined) this.offsetY = map.calibration.offsetY;
    }

    document.getElementById('input-tile-size').value = this.tileSize.toFixed(1);
    document.getElementById('slider-tile-size').value = this.tileSize;
    document.getElementById('input-offset-x').value = this.offsetX;
    document.getElementById('input-offset-y').value = this.offsetY;
    document.getElementById('input-grid-cols').value = this.cols;
    document.getElementById('input-grid-rows').value = this.rows;

    this.additionalBorderTile = Boolean(map.additionalBorderTile || map.calibration?.additionalBorderTile || map.hasBorder || map.calibration?.hasBorder);
    const chkBorder = document.getElementById('chk-additional-border');
    if (chkBorder) chkBorder.checked = this.additionalBorderTile;

    this.selectedRoomId = this.rooms.length > 0 ? this.rooms[0].id : null;
    this.updateRoomListUI();
    this.updateRoomInspector();

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
      additionalBorderTile: this.additionalBorderTile,
      calibration: {
        tileSize: this.tileSize,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        additionalBorderTile: this.additionalBorderTile,
        hasBorder: this.additionalBorderTile
      },
      rooms: this.rooms.map(r => ({
        id: r.id,
        name: r.name,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        shape: r.shape || 'rect',
        tiles: r.tiles || callGenerateRectTiles(r.x, r.y, r.w, r.h),
        quadrant: r.quadrant || 'center'
      })),
      corridors: Array.from(this.corridorTiles).map(k => k.split(',').map(Number))
    };
  }

  async saveBoard() {
    const payload = this.getStaticBoardPayload();
    const res = await window.robosBlockmap.saveBoardMap({
      boardId: this.boardId || 'custom-board',
      boardData: payload
    });

    if (res.success) {
      this.showToast(`Saved static board blockmap to ${res.fileName}!`);
    } else {
      this.showToast(`Save failed: ${res.error}`);
    }

    // Only if an explicit cartridge was opened via CLI/loader, also sync its map
    if (this.cartridgeSlug) {
      try {
        await window.robosBlockmap.saveCartridgeMap({
          cartridgeSlug: this.cartridgeSlug,
          mapId: this.boardId || 'custom-board',
          mapData: {
            id: this.boardId || 'custom-board',
            title: this.boardTitle || `${this.fileName} Static Board`,
            width: this.cols,
            height: this.rows,
            backgroundImage: `res://assets/boards/${this.fileName}`,
            calibration: {
              tileSize: this.tileSize,
              offsetX: this.offsetX,
              offsetY: this.offsetY
            },
            rooms: payload.rooms
          }
        });
      } catch (err) {
        console.warn('Optional cartridge sync error:', err);
      }
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
    // Always reset transform matrix to identity before clearing and rendering
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    try {
      ctx.translate(this.panX, this.panY);
      ctx.scale(this.zoom, this.zoom);

    const totalGridW = this.cols * this.tileSize;
    const totalGridH = this.rows * this.tileSize;

    // 0. Draw Additional Black Border Tiles (Border Option)
    if (this.additionalBorderTile) {
      ctx.save();
      for (let c = -1; c <= this.cols; c++) {
        for (let r = -1; r <= this.rows; r++) {
          if (c === -1 || c === this.cols || r === -1 || r === this.rows) {
            const bx = this.offsetX + c * this.tileSize;
            const by = this.offsetY + r * this.tileSize;
            ctx.fillStyle = '#080d18';
            ctx.fillRect(bx, by, this.tileSize, this.tileSize);
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1.0;
            ctx.strokeRect(bx, by, this.tileSize, this.tileSize);
            ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
            ctx.beginPath();
            ctx.moveTo(bx + 3, by + 3);
            ctx.lineTo(bx + this.tileSize - 3, by + this.tileSize - 3);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

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

    // 2. Draw Corridor Floor Tiles
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
        const color = r.color || '#10b981';
        const tileList = r.tiles && r.tiles.length > 0
          ? r.tiles
          : callGenerateRectTiles(r.x, r.y, r.w, r.h);

        ctx.save();
        // Room floor tint
        ctx.fillStyle = isSelected ? 'rgba(0, 188, 212, 0.32)' : `${color}28`;
        for (const [c, row] of tileList) {
          const tx = this.offsetX + c * this.tileSize;
          const ty = this.offsetY + row * this.tileSize;
          ctx.fillRect(tx, ty, this.tileSize, this.tileSize);
        }

        // Room solid wall boundary
        ctx.strokeStyle = isSelected ? '#00bcd4' : color;
        ctx.lineWidth = isSelected ? 2.5 : 1.8;

        if (r.shape === 'freeform') {
          const edges = callGetRoomPerimeterEdges(tileList);
          ctx.beginPath();
          for (const edge of edges) {
            const ex1 = edge.from ? edge.from[0] : edge.x1;
            const ey1 = edge.from ? edge.from[1] : edge.y1;
            const ex2 = edge.to ? edge.to[0] : edge.x2;
            const ey2 = edge.to ? edge.to[1] : edge.y2;
            const x1 = this.offsetX + ex1 * this.tileSize;
            const y1 = this.offsetY + ey1 * this.tileSize;
            const x2 = this.offsetX + ex2 * this.tileSize;
            const y2 = this.offsetY + ey2 * this.tileSize;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();
        } else {
          const rx = this.offsetX + r.x * this.tileSize;
          const ry = this.offsetY + r.y * this.tileSize;
          const rw = r.w * this.tileSize;
          const rh = r.h * this.tileSize;
          ctx.strokeRect(rx, ry, rw, rh);
        }

        // Room title banner
        ctx.fillStyle = isSelected ? '#00bcd4' : '#fff';
        ctx.font = `bold ${Math.max(10, Math.min(14, this.tileSize * 0.35))}px sans-serif`;
        const rx = this.offsetX + r.x * this.tileSize;
        const ry = this.offsetY + r.y * this.tileSize;
        ctx.fillText(r.name || r.id, rx + 6, ry + 16);
        ctx.restore();
      });
    }

    // 4.5 Draw Draft Freeform Room
    if (this.draftFreeformTiles && this.draftFreeformTiles.size > 0) {
      const isInvalid = !!this.invalidFreeformTiles;
      const tileArray = Array.from(this.draftFreeformTiles).map(k => k.split(',').map(Number));

      ctx.save();
      // Fill
      ctx.fillStyle = isInvalid ? 'rgba(239, 68, 68, 0.40)' : 'rgba(168, 85, 247, 0.38)';
      for (const [c, r] of tileArray) {
        const tx = this.offsetX + c * this.tileSize;
        const ty = this.offsetY + r * this.tileSize;
        ctx.fillRect(tx, ty, this.tileSize, this.tileSize);
      }

      // Perimeter line
      ctx.strokeStyle = isInvalid ? '#ef4444' : '#c084fc';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);

      const edges = callGetRoomPerimeterEdges(this.draftFreeformTiles);
      if (edges && edges.length > 0) {
        ctx.beginPath();
        for (const edge of edges) {
          const ex1 = edge.from ? edge.from[0] : edge.x1;
          const ey1 = edge.from ? edge.from[1] : edge.y1;
          const ex2 = edge.to ? edge.to[0] : edge.x2;
          const ey2 = edge.to ? edge.to[1] : edge.y2;
          const x1 = this.offsetX + ex1 * this.tileSize;
          const y1 = this.offsetY + ey1 * this.tileSize;
          const x2 = this.offsetX + ex2 * this.tileSize;
          const y2 = this.offsetY + ey2 * this.tileSize;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }

      // Status text on first tile
      if (tileArray.length > 0) {
        const [c0, r0] = tileArray[0];
        const tx = this.offsetX + c0 * this.tileSize;
        const ty = this.offsetY + r0 * this.tileSize;
        ctx.fillStyle = isInvalid ? '#fca5a5' : '#f3e8ff';
        ctx.font = 'bold 12px sans-serif';
        ctx.setLineDash([]);
        if (isInvalid) {
          ctx.fillText(`⚠️ Non-connecting shape!`, tx + 4, ty + 16);
        } else {
          ctx.fillText(`Draft Room (${this.draftFreeformTiles.size} tiles)`, tx + 4, ty + 16);
        }
      }

      ctx.restore();
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
    if (this.isDrawing && this.activeTool === 'room' && this.roomMode === 'rect' && this.dragStartTile && this.dragCurrentTile) {
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
  } catch (err) {
    console.error('Canvas render error:', err);
  } finally {
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
}

window.addEventListener('DOMContentLoaded', () => {
  window.blockmapCreator = new BlockmapCreator();
});
