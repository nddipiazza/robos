// RobOS Tabletop Quest Map Editor - Renderer Application
// Layer 2 Quest Layout Engine: Doors, Monsters, Furniture, Traps, Wall Blocks, Stairs, Notes
'use strict';

// -------------------------------------------------------------
// Global State
// -------------------------------------------------------------
const state = {
  // Layer 1: Static Board Foundation
  blockmap: null,
  blockmapPath: null,
  bgImage: null,
  availableBlockmaps: [],

  // Layer 2: Quest Scenario Data
  quest: {
    title: 'Quest 1: Custom Dungeon',
    slug: 'custom-quest',
    wanderingMonster: 'orc',
    goldBounty: 100,
    briefing: 'Mentor speaks: "The Emperor calls upon the kingdom\'s greatest champions..."',
    startingStair: [0, 1],
    startingStairType: 'stairs_up_1x1',
    exitTile: null,
    exitStairType: 'stairs_down_1x1',
    doors: [],
    monsters: [],
    furniture: [],
    traps: [],
    wallBlocks: [],
    storyTriggers: []
  },

  // View & Camera
  zoom: 1.0,
  panX: 40,
  panY: 40,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,

  // Tool & Selection
  activeTool: 'door',
  selectedEntity: null, // { type, index }
  hoverTile: null,      // [col, row]
  hoverDoorEdge: null,  // { from: [c1, r1], to: [c2, r2], orientation: 'h'|'v', cx, cy }
  isDraggingEntity: false,
  dragEntityOriginalPos: null,

  // Subtool settings
  subtool: {
    doorType: 'wood-closed', // 'wood-closed', 'wood-open', 'secret'
    monsterType: 'goblin',
    furnitureType: 'chest',
    furnitureRotated: false, // false: normal, true: 90 deg rotated
    trapType: 'pit',
    wallBlockType: 'single',
    noteMarker: 'Note A',
    startStairType: 'stairs_up_1x1',
    exitStairType: 'stairs_down_1x1'
  },

  // Layer toggles
  layers: {
    showImage: true,
    showGrid: true,
    showRooms: true,
    showRoomNames: true,
    showCorridors: true,
    showDoors: true,
    showMonsters: true,
    showFurniture: true,
    showTraps: true,
    showWallBlocks: true,
    showNotes: true,
    showValidationWarnings: true,
    artOpacity: 1.0,
    gridOpacity: 0.75
  },

  // Error validation state
  validation: {
    valid: true,
    totalErrors: 0,
    errors: [],
    counts: {
      all: 0,
      furniture_bounds: 0,
      door_wall: 0,
      overlap: 0
    },
    activeFilter: 'all'
  },
  focusedErrorId: null,

  // Undo / Redo history
  undoStack: [],
  redoStack: [],

  // Asset Sprite Cache
  assetCache: {},

  // Additional Border Tile option
  hasAdditionalBorder: false
};

// -------------------------------------------------------------
// Monster Template Defaults (HeroQuest Ruleset)
// -------------------------------------------------------------
const MONSTER_DEFS = {
  goblin: { name: 'Goblin', bp: 1, mp: 1, atk: 2, def: 1, move: 10, isBoss: false, isUndead: false, isCaster: false, color: '#16a34a', icon: '👺' },
  orc: { name: 'Orc', bp: 1, mp: 2, atk: 3, def: 2, move: 6, isBoss: false, isUndead: false, isCaster: false, color: '#ca8a04', icon: '👹' },
  skeleton: { name: 'Skeleton', bp: 1, mp: 0, atk: 2, def: 2, move: 6, isBoss: false, isUndead: true, isCaster: false, color: '#94a3b8', icon: '💀' },
  zombie: { name: 'Zombie', bp: 1, mp: 0, atk: 3, def: 3, move: 4, isBoss: false, isUndead: true, isCaster: false, color: '#059669', icon: '🧟' },
  mummy: { name: 'Mummy', bp: 2, mp: 0, atk: 3, def: 4, move: 4, isBoss: false, isUndead: true, isCaster: false, color: '#d97706', icon: '🩹' },
  chaos_warrior: { name: 'Chaos Warrior', bp: 2, mp: 3, atk: 3, def: 4, move: 7, isBoss: false, isUndead: false, isCaster: false, color: '#7c3aed', icon: '⚔️' },
  fimir: { name: 'Fimir', bp: 2, mp: 3, atk: 3, def: 3, move: 6, isBoss: false, isUndead: false, isCaster: false, color: '#2563eb', icon: '🦎' },
  gargoyle: { name: 'Gargoyle', bp: 3, mp: 4, atk: 4, def: 5, move: 6, isBoss: false, isUndead: false, isCaster: false, color: '#dc2626', icon: '🗿' },
  boss: { name: 'Dungeon Boss', bp: 5, mp: 5, atk: 4, def: 4, move: 8, isBoss: true, isUndead: false, isCaster: true, color: '#e11d48', icon: '👑' }
};

// Furniture dimensions (w, h)
const FURNITURE_DEFS = {
  chest: { name: 'Treasure Chest', w: 1, h: 1, icon: '📦' },
  table: { name: 'Table', w: 2, h: 2, icon: '🪵' },
  bookcase: { name: 'Bookcase', w: 3, h: 1, icon: '📚' },
  bookshelf: { name: 'Bookshelf', w: 2, h: 1, icon: '📖' },
  weapons_rack: { name: 'Weapons Rack', w: 2, h: 1, icon: '⚔️' },
  altar: { name: 'Altar', w: 2, h: 1, icon: '🔮' },
  alchemists_bench: { name: "Alchemist's Bench", w: 2, h: 1, icon: '🧪' },
  tomb: { name: 'Stone Tomb', w: 2, h: 2, icon: '🪦' },
  throne: { name: 'Throne', w: 2, h: 2, icon: '👑' },
  cupboard: { name: 'Cupboard', w: 2, h: 1, icon: '🚪' },
  torture_rack: { name: 'Torture Rack', w: 2, h: 1, icon: '⛓️' },
  fireplace: { name: 'Fireplace', w: 2, h: 1, icon: '🔥' },
  stairs_up_1x1: { name: 'Up Staircase (1×1)', w: 1, h: 1, icon: '🪜' },
  stairs_down_1x1: { name: 'Down Staircase (1×1)', w: 1, h: 1, icon: '🪜' },
  stairs_up_2x2: { name: 'Up Staircase (2×2)', w: 2, h: 2, icon: '🪜' },
  stairs_down_2x2: { name: 'Down Staircase (2×2)', w: 2, h: 2, icon: '🪜' },
  stairs: { name: 'Up Staircase (1×1)', w: 1, h: 1, icon: '🪜' }
};

// -------------------------------------------------------------
// DOM Elements Cache
// -------------------------------------------------------------
const dom = (typeof document !== 'undefined') ? {
  canvas: document.getElementById('quest-canvas'),
  viewport: document.getElementById('canvas-viewport'),
  ctx: null,

  // Headers & Global controls
  selectBlockmap: document.getElementById('select-blockmap'),
  btnOpenBlockmap: document.getElementById('btn-open-blockmap'),
  btnOpenCartridge: document.getElementById('btn-open-cartridge'),
  btnSaveCartridge: document.getElementById('btn-save-cartridge'),
  btnExportJson: document.getElementById('btn-export-json'),
  btnCopyJson: document.getElementById('btn-copy-json'),
  btnTestPlay: document.getElementById('btn-test-play'),

  // Status & Info Bar
  infoBlockmapName: document.getElementById('info-blockmap-name'),
  infoGridSize: document.getElementById('info-grid-size'),
  infoQuestTitle: document.getElementById('info-quest-title'),
  infoActiveTool: document.getElementById('info-active-tool'),
  infoCursorCoords: document.getElementById('info-cursor-coords'),
  infoTileCoords: document.getElementById('info-tile-coords'),
  infoRoomName: document.getElementById('info-room-name'),
  infoZoomLevel: document.getElementById('info-zoom-level'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomFit: document.getElementById('btn-zoom-fit'),
  btnZoomReset: document.getElementById('btn-zoom-reset'),

  // Tool buttons
  toolBtns: document.querySelectorAll('.tool-btn[data-tool]'),
  btnUndo: document.getElementById('btn-undo'),
  btnRedo: document.getElementById('btn-redo'),

  // Subtool Drawer
  subtoolHeader: document.getElementById('subtool-header'),
  suboptsDoor: document.getElementById('subopts-door'),
  suboptsMonster: document.getElementById('subopts-monster'),
  suboptsFurniture: document.getElementById('subopts-furniture'),
  suboptsTrap: document.getElementById('subopts-trap'),
  suboptsWallBlock: document.getElementById('subopts-wall-block'),
  suboptsNote: document.getElementById('subopts-note'),
  suboptsStart: document.getElementById('subopts-start'),
  suboptsStartPos: document.getElementById('subopts-start-pos'),
  suboptsStartBorderBadge: document.getElementById('subopts-start-border-badge'),
  suboptsExit: document.getElementById('subopts-exit'),
  suboptsExitPos: document.getElementById('subopts-exit-pos'),
  suboptsExitBorderBadge: document.getElementById('subopts-exit-border-badge'),
  btnClearExit: document.getElementById('btn-clear-exit'),
  selectStartStairType: document.getElementById('select-start-stair-type'),
  selectExitStairType: document.getElementById('select-exit-stair-type'),

  // Subtool inputs
  radioDoorTypes: document.querySelectorAll('input[name="door-type"]'),
  selectMonsterType: document.getElementById('select-monster-type'),
  selectFurnitureType: document.getElementById('select-furniture-type'),
  btnRotateFurn: document.getElementById('btn-rotate-furn'),
  furnDimText: document.getElementById('furn-dim-text'),
  selectTrapType: document.getElementById('select-trap-type'),
  selectWallBlockType: document.getElementById('select-wall-block-type'),
  inputNoteMarker: document.getElementById('input-note-marker'),

  // Tabs & Sidebar
  sideTabs: document.querySelectorAll('.side-tab'),
  sidebarContents: document.querySelectorAll('.sidebar-content'),
  badgeEntityCount: document.getElementById('badge-entity-count'),

  // Quest Meta Tab
  inputQuestTitle: document.getElementById('input-quest-title'),
  inputQuestSlug: document.getElementById('input-quest-slug'),
  selectWanderingMonster: document.getElementById('select-wandering-monster'),
  inputGoldBounty: document.getElementById('input-gold-bounty'),
  textareaQuestBriefing: document.getElementById('textarea-quest-briefing'),

  // Inspector Tab
  inspectorEmpty: document.getElementById('inspector-empty'),
  inspectorForm: document.getElementById('inspector-form'),
  inspectTypeBadge: document.getElementById('inspect-type-badge'),
  inspectPosText: document.getElementById('inspect-pos-text'),
  inspectName: document.getElementById('inspect-name'),
  btnDeleteEntity: document.getElementById('btn-delete-entity'),

  // Inspector groups
  inspectGroupMonster: document.getElementById('inspect-group-monster'),
  inspectMonsterBp: document.getElementById('inspect-monster-bp'),
  inspectMonsterMp: document.getElementById('inspect-monster-mp'),
  inspectMonsterAtk: document.getElementById('inspect-monster-atk'),
  inspectMonsterDef: document.getElementById('inspect-monster-def'),
  inspectMonsterMove: document.getElementById('inspect-monster-move'),
  inspectMonsterIsBoss: document.getElementById('inspect-monster-is-boss'),
  inspectMonsterIsUndead: document.getElementById('inspect-monster-is-undead'),
  inspectMonsterIsCaster: document.getElementById('inspect-monster-is-caster'),

  inspectGroupDoor: document.getElementById('inspect-group-door'),
  inspectDoorState: document.getElementById('inspect-door-state'),
  inspectDoorSecret: document.getElementById('inspect-door-secret'),

  inspectGroupFurniture: document.getElementById('inspect-group-furniture'),
  inspectFurnDims: document.getElementById('inspect-furn-dims'),
  btnInspectRotateFurn: document.getElementById('btn-inspect-rotate-furn'),
  inspectFurnTreasure: document.getElementById('inspect-furn-treasure'),
  inspectFurnStairRole: document.getElementById('inspect-furn-stair-role'),
  inspectFurnStairStatus: document.getElementById('inspect-furn-stair-status'),
  btnFurnMakeStart: document.getElementById('btn-furn-make-start'),
  btnFurnMakeExit: document.getElementById('btn-furn-make-exit'),
  btnFurnClearRole: document.getElementById('btn-furn-clear-role'),

  inspectGroupTrap: document.getElementById('inspect-group-trap'),
  inspectTrapDmg: document.getElementById('inspect-trap-dmg'),

  inspectGroupNote: document.getElementById('inspect-group-note'),
  inspectNoteMarker: document.getElementById('inspect-note-marker'),
  inspectNoteTitle: document.getElementById('inspect-note-title'),
  inspectNoteNarrative: document.getElementById('inspect-note-narrative'),

  // Entities List Tab
  entitySummaryList: document.getElementById('entity-summary-list'),

  // Layers Tab
  chkShowImage: document.getElementById('chk-show-image'),
  chkShowGrid: document.getElementById('chk-show-grid'),
  chkShowRooms: document.getElementById('chk-show-rooms'),
  chkShowRoomNames: document.getElementById('chk-show-room-names'),
  btnToggleRoomNames: document.getElementById('btn-toggle-room-names'),
  chkShowCorridors: document.getElementById('chk-show-corridors'),
  chkShowDoors: document.getElementById('chk-show-doors'),
  chkShowMonsters: document.getElementById('chk-show-monsters'),
  chkShowFurniture: document.getElementById('chk-show-furniture'),
  chkShowTraps: document.getElementById('chk-show-traps'),
  chkShowWallBlocks: document.getElementById('chk-show-wall-blocks'),
  chkShowNotes: document.getElementById('chk-show-notes'),
  chkShowValidation: document.getElementById('chk-show-validation'),
  chkAdditionalBorder: document.getElementById('chk-additional-border'),
  sliderArtOpacity: document.getElementById('slider-art-opacity'),
  sliderGridOpacity: document.getElementById('slider-grid-opacity'),

  // Validation Tab & Status Badge
  infoValidationBadge: document.getElementById('info-validation-badge'),
  badgeValCount: document.getElementById('badge-val-count'),
  tabBtnValidation: document.getElementById('tab-btn-validation'),
  valSummaryBanner: document.getElementById('val-summary-banner'),
  valSummaryIcon: document.getElementById('val-summary-icon'),
  valSummaryTitle: document.getElementById('val-summary-title'),
  valSummaryDesc: document.getElementById('val-summary-desc'),
  valFilterAllCount: document.getElementById('val-filter-all-count'),
  valFilterBoundsCount: document.getElementById('val-filter-bounds-count'),
  valFilterDoorCount: document.getElementById('val-filter-door-count'),
  valFilterOverlapCount: document.getElementById('val-filter-overlap-count'),
  validationErrorsList: document.getElementById('validation-errors-list'),
  filterPills: document.querySelectorAll('.val-filters .filter-pill'),

  // Voice Dictation Controls
  btnVoiceAddItems: document.getElementById('btn-voice-add-items'),

  // Toast Container
  toastContainer: document.getElementById('toast-container')
} : {};

if (typeof document !== 'undefined' && dom.canvas) {
  dom.ctx = dom.canvas.getContext('2d');
}

// -------------------------------------------------------------
// Toast Messages
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  if (typeof document === 'undefined' || !dom.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// -------------------------------------------------------------
// History (Undo / Redo)
// -------------------------------------------------------------
function recordHistory() {
  const snapshot = JSON.stringify(state.quest);
  state.undoStack.push(snapshot);
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
  updateHistoryButtons();
}

function undo() {
  if (state.undoStack.length === 0) return;
  const current = JSON.stringify(state.quest);
  state.redoStack.push(current);
  const previous = state.undoStack.pop();
  state.quest = JSON.parse(previous);
  state.selectedEntity = null;
  updateInspectorUI();
  updateEntitySummaryList();
  syncQuestMetaInputs();
  updateHistoryButtons();
  runValidation();
  render();
  showToast('Undone', 'info');
}

function redo() {
  if (state.redoStack.length === 0) return;
  const current = JSON.stringify(state.quest);
  state.undoStack.push(current);
  const next = state.redoStack.pop();
  state.quest = JSON.parse(next);
  state.selectedEntity = null;
  updateInspectorUI();
  updateEntitySummaryList();
  syncQuestMetaInputs();
  updateHistoryButtons();
  runValidation();
  render();
  showToast('Redone', 'info');
}

function updateHistoryButtons() {
  if (dom.btnUndo) dom.btnUndo.disabled = state.undoStack.length === 0;
  if (dom.btnRedo) dom.btnRedo.disabled = state.redoStack.length === 0;
}

// -------------------------------------------------------------
// Room Names Visibility Toggle
// -------------------------------------------------------------
function toggleRoomNames(forceVal) {
  if (typeof forceVal === 'boolean') {
    state.layers.showRoomNames = forceVal;
  } else {
    state.layers.showRoomNames = !state.layers.showRoomNames;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('robos_quest_editor_show_room_names', String(state.layers.showRoomNames));
    }
  } catch (_) {}
  updateRoomNamesToggleUI();
  if (typeof render === 'function') {
    render();
  }
  return state.layers.showRoomNames;
}

function updateRoomNamesToggleUI() {
  const isShown = !!state.layers.showRoomNames;
  if (dom && dom.chkShowRoomNames) {
    dom.chkShowRoomNames.checked = isShown;
  }
  if (dom && dom.btnToggleRoomNames) {
    if (isShown) {
      dom.btnToggleRoomNames.classList.add('active-toggle');
      dom.btnToggleRoomNames.title = 'Hide Room Names on Board (Shortcut: Shift+N)';
    } else {
      dom.btnToggleRoomNames.classList.remove('active-toggle');
      dom.btnToggleRoomNames.title = 'Show Room Names on Board (Shortcut: Shift+N)';
    }
  }
}

// -------------------------------------------------------------
// Blockmap & Cartridge Loading
// -------------------------------------------------------------
async function initApp() {
  // Restore saved column widths if available
  try {
    const leftW = localStorage.getItem('robos_quest_editor_tool_palette_w');
    if (leftW) {
      const toolPalette = document.querySelector('.tool-palette');
      if (toolPalette) {
        const w = parseInt(leftW, 10);
        if (w >= 110 && w <= 450) {
          toolPalette.style.width = `${w}px`;
          toolPalette.style.flex = `0 0 ${w}px`;
        }
      }
    }
    const rightW = localStorage.getItem('robos_quest_editor_sidebar_right_w');
    if (rightW) {
      const sidebarRight = document.querySelector('.sidebar-right');
      if (sidebarRight) {
        const w = parseInt(rightW, 10);
        if (w >= 240 && w <= 800) {
          sidebarRight.style.width = `${w}px`;
          sidebarRight.style.flex = `0 0 ${w}px`;
        }
      }
    }
    const savedRoomNames = localStorage.getItem('robos_quest_editor_show_room_names');
    if (savedRoomNames !== null) {
      state.layers.showRoomNames = savedRoomNames === 'true';
    }
  } catch (_) {}

  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    render();
  });

  // Check startup arguments
  let startup = { type: 'blockmap', value: 'first-light-dungeon' };
  try {
    if (window.robosQuestEditor) {
      startup = await window.robosQuestEditor.getStartupArgs();
    }
  } catch (err) {
    console.warn('Error reading startup args:', err);
  }

  // Populate blockmaps dropdown
  await refreshBlockmapsDropdown();

  if (startup.type === 'cartridge') {
    await loadCartridge(startup.value);
  } else {
    await loadBlockmap(startup.value || 'first-light-dungeon');
  }

  // Preload asset sprites in background
  preloadAssets();

  setupEventListeners();
  updateRoomNamesToggleUI();
  runValidation();
  render();
}

async function refreshBlockmapsDropdown() {
  try {
    if (!window.robosQuestEditor) return;
    const res = await window.robosQuestEditor.listBlockmaps();
    if (res.success && res.blockmaps) {
      state.availableBlockmaps = res.blockmaps;
      dom.selectBlockmap.innerHTML = '';
      res.blockmaps.forEach(bm => {
        const opt = document.createElement('option');
        opt.value = bm.id || bm.file;
        opt.textContent = `${bm.title} (${bm.gridDimensions ? bm.gridDimensions.join('×') : '26×19'})`;
        dom.selectBlockmap.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Error refreshing blockmaps dropdown:', err);
  }
}

async function loadBlockmap(slugOrPath) {
  try {
    if (!window.robosQuestEditor) return;
    const res = await window.robosQuestEditor.loadBlockmap(slugOrPath);
    if (!res.success) {
      showToast(`Failed to load blockmap: ${res.error}`, 'error');
      return;
    }

    state.blockmap = res.blockmap;
    state.blockmapPath = res.blockmapPath;
    state.hasAdditionalBorder = Boolean(
      state.blockmap.additionalBorderTile ||
      state.blockmap.calibration?.additionalBorderTile ||
      state.blockmap.hasBorder ||
      state.blockmap.calibration?.hasBorder
    );
    if (dom.chkAdditionalBorder) {
      dom.chkAdditionalBorder.checked = state.hasAdditionalBorder;
    }

    // Load board background image
    if (res.imageData && res.imageData.dataUrl) {
      const img = new Image();
      img.onload = () => {
        state.bgImage = img;
        render();
      };
      img.src = res.imageData.dataUrl;
    } else {
      state.bgImage = null;
    }

    // Update blockmap dropdown and UI info
    if (dom.selectBlockmap) {
      dom.selectBlockmap.value = state.blockmap.id || slugOrPath;
    }
    const dims = state.blockmap.gridDimensions || [26, 19];
    dom.infoBlockmapName.textContent = state.blockmap.title || state.blockmap.id || 'Custom Dungeon';
    dom.infoGridSize.textContent = `${dims[0]} × ${dims[1]}`;

    // Fit view to screen
    fitView();
    runValidation();
    render();
    showToast(`Loaded Blockmap: ${state.blockmap.title || state.blockmap.id}`, 'success');
  } catch (err) {
    console.error('Error loading blockmap:', err);
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function loadCartridge(slugOrPath) {
  try {
    if (!window.robosQuestEditor) return;
    const res = await window.robosQuestEditor.loadCartridge(slugOrPath);
    if (!res.success) {
      showToast(`Failed to load cartridge: ${res.error}`, 'error');
      return;
    }

    const c = res.cartridge;
    state.quest.slug = res.slug || c.cartridgeId || 'custom-quest';
    state.quest.title = c.header?.title || 'Custom Quest';
    state.quest.briefing = c.header?.description || '';

    // Find the primary map
    let mapData = null;
    if (c.maps) {
      const keys = Object.keys(c.maps);
      if (keys.length > 0) {
        mapData = c.maps[state.quest.slug] || c.maps[keys[0]];
      }
    }

    if (mapData) {
      if (mapData.additionalBorderTile !== undefined) {
        state.hasAdditionalBorder = Boolean(mapData.additionalBorderTile);
        if (dom.chkAdditionalBorder) dom.chkAdditionalBorder.checked = state.hasAdditionalBorder;
      }
      state.quest.wanderingMonster = mapData.wanderingMonster || 'orc';
      state.quest.startingStair = mapData.startingStair || c.header?.startingPosition || [0, 1];
      state.quest.startingStairType = mapData.startingStairType || 'stairs_up_1x1';
      state.quest.exitTile = mapData.exitTile || mapData.exitStair || null;
      state.quest.exitStairType = mapData.exitStairType || 'stairs_down_1x1';
      state.subtool.startStairType = state.quest.startingStairType;
      state.subtool.exitStairType = state.quest.exitStairType;
      if (dom.selectStartStairType) dom.selectStartStairType.value = state.quest.startingStairType;
      if (dom.selectExitStairType) dom.selectExitStairType.value = state.quest.exitStairType;
      state.quest.doors = (mapData.doors || []).map((d, i) => ({
        id: d.id || `door-${i+1}`,
        from: d.from || [0, 0],
        to: d.to || [0, 1],
        state: d.state || 'closed',
        is_secret: Boolean(d.is_secret),
        room: d.room || ''
      }));
      state.quest.furniture = (mapData.furniture || []).map((f, i) => {
        const rawType = f.type || 'chest';
        const type = rawType === 'stairs' ? 'stairs_up_1x1' : rawType;
        const def = FURNITURE_DEFS[type] || { w: 1, h: 1, name: type };
        return {
          id: f.id || `furn-${i+1}`,
          name: f.name || def.name,
          type: type,
          x: f.x || 0,
          y: f.y || 0,
          width: f.width || def.w || 1,
          height: f.height || def.h || 1,
          roomId: f.roomId || '',
          treasure: f.treasure || ''
        };
      });
      state.quest.wallBlocks = (mapData.wallBlocks || []).map((wb, i) => ({
        id: wb.id || `block-${i+1}`,
        type: wb.type || 'single',
        x: wb.x || 0,
        y: wb.y || 0,
        width: wb.width || 1,
        height: wb.height || 1
      }));
      state.quest.traps = (mapData.traps || []).map((t, i) => ({
        id: t.id || `trap-${i+1}`,
        type: t.trapType || t.type || 'pit',
        x: t.x || 0,
        y: t.y || 0,
        damage: t.damageDice || t.damage || 1,
        detected: Boolean(t.detected),
        disarmed: Boolean(t.disarmed)
      }));
      state.quest.storyTriggers = (mapData.storyTriggers || []).map((st, i) => ({
        id: st.id || `trigger-${i+1}`,
        marker: st.marker || `Note ${String.fromCharCode(65 + i)}`,
        title: st.title || 'Special Note',
        narrative: st.narrative || '',
        tile: st.tile || [0, 0],
        room: st.room || ''
      }));
    }

    // Load monsters from cartridge root
    state.quest.monsters = [];
    if (c.monsters) {
      if (Array.isArray(c.monsters)) {
        c.monsters.forEach((m, i) => {
          const type = m.monsterType || m.slug || 'goblin';
          const def = MONSTER_DEFS[type] || MONSTER_DEFS.goblin;
          state.quest.monsters.push({
            id: m.id || `mon-${i+1}`,
            name: m.name || def.name,
            type: type,
            bp: m.bodyPoints || def.bp,
            mp: m.mindPoints || def.mp,
            atk: m.attackDice || def.atk,
            def: m.defendDice || def.def,
            move: m.movementSquares || def.move,
            pos: m.position || [0, 0],
            roomId: m.roomId || '',
            isBoss: Boolean(m.isBoss),
            isUndead: Boolean(m.isUndead),
            isSpellcaster: Boolean(m.isSpellcaster)
          });
        });
      } else if (typeof c.monsters === 'object') {
        Object.keys(c.monsters).forEach((k, i) => {
          const m = c.monsters[k];
          const type = m.monsterType || m.slug?.replace(/-[0-9]+$/, '') || 'goblin';
          const def = MONSTER_DEFS[type] || MONSTER_DEFS.goblin;
          state.quest.monsters.push({
            id: m.id || k,
            name: m.name || def.name,
            type: type,
            bp: m.bodyPoints || def.bp,
            mp: m.mindPoints || def.mp,
            atk: m.attackDice || def.atk,
            def: m.defendDice || def.def,
            move: m.movementSquares || def.move,
            pos: m.position || [0, 0],
            roomId: m.roomId || '',
            isBoss: Boolean(m.isBoss),
            isUndead: Boolean(m.isUndead),
            isSpellcaster: Boolean(m.isSpellcaster)
          });
        });
      }
    }

    // Load matching blockmap foundation
    const targetBlockmap = mapData?.mapConfigurationId || 'first-light-dungeon';
    await loadBlockmap(targetBlockmap);

    syncQuestMetaInputs();
    updateEntitySummaryList();
    runValidation();
    render();
    showToast(`Loaded Cartridge: ${state.quest.title}`, 'success');
  } catch (err) {
    console.error('Error loading cartridge:', err);
    showToast(`Error: ${err.message}`, 'error');
  }
}

// -------------------------------------------------------------
// Cartridge Export & Saving
// -------------------------------------------------------------
function buildCartridgePayload() {
  const q = state.quest;
  const bm = state.blockmap || {};
  const dims = bm.gridDimensions || [26, 19];

  // Build monsters dictionary
  const monstersDict = {};
  q.monsters.forEach(m => {
    monstersDict[m.id] = {
      id: m.id,
      slug: `${m.type}-${m.id}`,
      name: m.name,
      monsterType: m.type,
      bodyPoints: m.bp,
      mindPoints: m.mp,
      attackDice: m.atk,
      defendDice: m.def,
      movementSquares: m.move,
      isBoss: m.isBoss,
      isUndead: m.isUndead,
      isSpellcaster: m.isSpellcaster,
      spells: m.isSpellcaster ? ['lightning-bolt', 'firestorm'] : [],
      position: [m.pos[0], m.pos[1]],
      roomId: m.roomId || ''
    };
  });

  const cartridgeData = {
    cartridgeVersion: '2.0.0',
    cartridgeId: q.slug,
    header: {
      title: q.title,
      slug: q.slug,
      author: 'RobOS Tabletop Studio',
      gameType: 'tabletop',
      genre: 'Tabletop Dungeon Crawler',
      ruleset: 'heroquest',
      description: q.briefing,
      coverColor: '#0a0e17',
      icon: '🛡️',
      mapCount: 1,
      heroCount: 4,
      monsterCount: q.monsters.length,
      itemCount: 0,
      questCount: 1,
      startingMap: q.slug,
      startingPosition: q.startingStair || [0, 1],
      createdDate: new Date().toISOString()
    },
    heroes: {
      barbarian: {
        id: 'barbarian', slug: 'barbarian', name: 'Barbarian', heroClass: 'Barbarian',
        bodyPoints: 8, mindPoints: 2, attackDice: 3, defendDice: 2, gold: 100,
        position: q.startingStair || [0, 1]
      },
      dwarf: {
        id: 'dwarf', slug: 'dwarf', name: 'Dwarf', heroClass: 'Dwarf',
        bodyPoints: 7, mindPoints: 3, attackDice: 2, defendDice: 2, gold: 100,
        position: q.startingStair || [0, 1]
      },
      elf: {
        id: 'elf', slug: 'elf', name: 'Elf', heroClass: 'Elf',
        bodyPoints: 6, mindPoints: 4, attackDice: 2, defendDice: 2, gold: 100,
        position: q.startingStair || [0, 1]
      },
      wizard: {
        id: 'wizard', slug: 'wizard', name: 'Wizard', heroClass: 'Wizard',
        bodyPoints: 4, mindPoints: 6, attackDice: 1, defendDice: 2, gold: 100,
        position: q.startingStair || [0, 1]
      }
    },
    monsters: monstersDict,
    maps: {
      [q.slug]: {
        id: q.slug,
        title: q.title,
        mapConfigurationId: bm.id || 'custom-blockmap',
        width: dims[0],
        height: dims[1],
        additionalBorderTile: Boolean(state.hasAdditionalBorder),
        backgroundImage: bm.backgroundImage || '',
        tileSize: bm.tileSize || 39.0,
        pixelOffset: bm.pixelOffset || [0, 0],
        wanderingMonster: q.wanderingMonster || 'orc',
        startingStair: q.startingStair || [0, 1],
        startingPosition: q.startingStair || [0, 1],
        startingStairType: q.startingStairType || 'stairs_up_1x1',
        exitTile: q.exitTile || null,
        exitStair: q.exitTile || null,
        exitStairType: q.exitStairType || 'stairs_down_1x1',
        activeRooms: (bm.rooms || []).map(r => r.id),
        rooms: bm.rooms || [],
        corridors: bm.corridors || [],
        doors: q.doors.map(d => ({
          id: d.id,
          from: [d.from[0], d.from[1]],
          to: [d.to[0], d.to[1]],
          state: d.state || 'closed',
          is_secret: Boolean(d.is_secret),
          room: d.room || ''
        })),
        furniture: q.furniture.map(f => ({
          id: f.id,
          name: f.name,
          type: f.type,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          roomId: f.roomId || '',
          treasure: f.treasure || ''
        })),
        wallBlocks: q.wallBlocks.map(wb => ({
          id: wb.id,
          type: wb.type,
          x: wb.x,
          y: wb.y,
          width: wb.width,
          height: wb.height
        })),
        traps: q.traps.map(t => ({
          id: t.id,
          trapType: t.type,
          x: t.x,
          y: t.y,
          damageDice: t.damage,
          detected: false,
          disarmed: false
        })),
        storyTriggers: q.storyTriggers.map(st => ({
          id: st.id,
          marker: st.marker,
          title: st.title,
          banner: `QUEST NOTE [${st.marker}]`,
          narrative: st.narrative,
          tile: [st.tile[0], st.tile[1]],
          room: st.room || ''
        }))
      }
    }
  };

  return cartridgeData;
}

async function saveCartridge() {
  try {
    if (!window.robosQuestEditor) return;
    const payload = {
      slug: state.quest.slug,
      cartridgeData: buildCartridgePayload()
    };
    const res = await window.robosQuestEditor.saveCartridge(payload);
    if (res.success) {
      showToast(`Saved Cartridge: ${res.fileName}`, 'success');
    } else {
      showToast(`Failed to save: ${res.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function exportJson() {
  try {
    if (!window.robosQuestEditor) return;
    const data = buildCartridgePayload();
    const jsonStr = JSON.stringify(data, null, 2);
    const res = await window.robosQuestEditor.saveFileDialog({
      content: jsonStr,
      suggestedName: `${state.quest.slug}.cartridge.json`,
      title: 'Export Tabletop Quest Cartridge'
    });
    if (res.success) {
      showToast(`Exported: ${res.fileName}`, 'success');
    }
  } catch (err) {
    showToast(`Export error: ${err.message}`, 'error');
  }
}

async function copyJson() {
  try {
    if (!window.robosQuestEditor) return;
    const data = buildCartridgePayload();
    await window.robosQuestEditor.copyToClipboard(JSON.stringify(data, null, 2));
    showToast('Copied Quest JSON to clipboard!', 'success');
  } catch (err) {
    showToast(`Copy error: ${err.message}`, 'error');
  }
}

async function testPlay() {
  try {
    if (!window.robosQuestEditor) return;
    await saveCartridge();
    const res = await window.robosQuestEditor.launchGame(state.quest.slug);
    if (res.success) {
      showToast(`Launched Tabletop RPG (PID: ${res.pid})`, 'success');
    } else {
      showToast(`Launch failed: ${res.error}`, 'error');
    }
  } catch (err) {
    showToast(`Launch error: ${err.message}`, 'error');
  }
}

// -------------------------------------------------------------
// Asset Preloading
// -------------------------------------------------------------
function preloadAssets() {
  if (!window.robosQuestEditor) return;

  const assetsToLoad = [
    { key: 'door_closed', path: 'assets/doors/door_closed.png' },
    { key: 'door_open', path: 'assets/doors/door_open.png' },
    { key: 'token_goblin', path: 'assets/tokens/token_goblin.png' },
    { key: 'token_orc', path: 'assets/tokens/token_orc.png' },
    { key: 'token_skeleton', path: 'assets/tokens/token_skeleton.png' },
    { key: 'token_zombie', path: 'assets/tokens/token_zombie.png' },
    { key: 'token_mummy', path: 'assets/tokens/token_mummy.png' },
    { key: 'token_chaos_warrior', path: 'assets/tokens/token_chaos_warrior.png' },
    { key: 'token_fimir', path: 'assets/tokens/token_fimir.png' },
    { key: 'token_gargoyle', path: 'assets/tokens/token_gargoyle.png' },
    { key: 'chest', path: 'assets/furniture/chest.png' },
    { key: 'table', path: 'assets/furniture/table.png' },
    { key: 'bookcase', path: 'assets/furniture/bookcase.png' },
    { key: 'bookshelf', path: 'assets/furniture/bookshelf.png' },
    { key: 'weapons_rack', path: 'assets/furniture/weapons_rack.png' },
    { key: 'altar', path: 'assets/furniture/altar.png' },
    { key: 'alchemists_bench', path: 'assets/furniture/alchemists_bench.png' },
    { key: 'tomb', path: 'assets/furniture/tomb.png' },
    { key: 'throne', path: 'assets/furniture/throne.png' },
    { key: 'cupboard', path: 'assets/furniture/cupboard.png' },
    { key: 'torture_rack', path: 'assets/furniture/torture_rack.png' },
    { key: 'fireplace', path: 'assets/furniture/fireplace.png' },
    { key: 'stairs_up_1x1', path: 'assets/tiles/stairs_up_1x1.png' },
    { key: 'stairs_down_1x1', path: 'assets/tiles/stairs_down_1x1.png' },
    { key: 'stairs_up_2x2', path: 'assets/tiles/stairs_up_2x2.png' },
    { key: 'stairs_down_2x2', path: 'assets/tiles/stairs_down_2x2.png' },
    { key: 'stairs_up', path: 'assets/tiles/stairs_up_1x1.png' },
    { key: 'stairs_down', path: 'assets/tiles/stairs_down_1x1.png' },
    { key: 'stairs', path: 'assets/tiles/stairs.png' },
    { key: 'wall_block', path: 'assets/tiles/wall_block.png' },
    { key: 'trap_pit', path: 'assets/tiles/trap_pit.png' },
    { key: 'trap_spear', path: 'assets/tiles/trap_spear.png' },
    { key: 'trap_falling_block', path: 'assets/tiles/trap_falling_block.png' }
  ];

  assetsToLoad.forEach(async item => {
    try {
      const res = await window.robosQuestEditor.loadAssetImage(item.path);
      if (res.success && res.dataUrl) {
        const img = new Image();
        img.onload = () => {
          state.assetCache[item.key] = img;
          render();
        };
        img.src = res.dataUrl;
      }
    } catch {}
  });
}

// -------------------------------------------------------------
// Coordinate Math & Geometry
// -------------------------------------------------------------
function resizeCanvas() {
  if (!dom || !dom.viewport || !dom.canvas) return;
  const rect = dom.viewport.getBoundingClientRect();
  dom.canvas.width = rect.width;
  dom.canvas.height = rect.height;
}

function getGridGeometry() {
  const bm = state.blockmap || {};
  const cal = bm.calibration || {};
  const tileSize = cal.tileSize || bm.tileSize || 39.0;
  const offsetX = cal.offsetX !== undefined ? cal.offsetX : (bm.pixelOffset ? bm.pixelOffset[0] : 0);
  const offsetY = cal.offsetY !== undefined ? cal.offsetY : (bm.pixelOffset ? bm.pixelOffset[1] : 0);
  const dims = bm.gridDimensions || [26, 19];
  const hasAdditionalBorder = Boolean(
    state.hasAdditionalBorder !== undefined
      ? state.hasAdditionalBorder
      : (bm.additionalBorderTile || cal.additionalBorderTile || bm.hasBorder || cal.hasBorder)
  );
  return {
    cols: dims[0],
    rows: dims[1],
    tileSize: tileSize,
    offsetX: offsetX,
    offsetY: offsetY,
    hasAdditionalBorder: hasAdditionalBorder
  };
}

function screenToWorld(sx, sy) {
  const wx = (sx - state.panX) / state.zoom;
  const wy = (sy - state.panY) / state.zoom;
  return { x: wx, y: wy };
}

function worldToTile(wx, wy, clampToBorder = false) {
  const geom = getGridGeometry();
  const relX = wx - geom.offsetX;
  const relY = wy - geom.offsetY;
  let col = Math.floor(relX / geom.tileSize);
  let row = Math.floor(relY / geom.tileSize);

  const minCol = geom.hasAdditionalBorder ? -1 : 0;
  const maxCol = geom.hasAdditionalBorder ? geom.cols : geom.cols - 1;
  const minRow = geom.hasAdditionalBorder ? -1 : 0;
  const maxRow = geom.hasAdditionalBorder ? geom.rows : geom.rows - 1;

  if (clampToBorder) {
    col = Math.max(minCol, Math.min(maxCol, col));
    row = Math.max(minRow, Math.min(maxRow, row));
    return [col, row];
  }

  if (col < minCol || col > maxCol || row < minRow || row > maxRow) {
    return null;
  }
  return [col, row];
}

function tileToWorld(col, row) {
  const geom = getGridGeometry();
  return {
    x: geom.offsetX + col * geom.tileSize,
    y: geom.offsetY + row * geom.tileSize
  };
}

function isBorderTile(col, row) {
  const geom = getGridGeometry();
  if (geom.hasAdditionalBorder) {
    return col === -1 || col === geom.cols || row === -1 || row === geom.rows;
  }
  return col === 0 || col === geom.cols - 1 || row === 0 || row === geom.rows - 1;
}

function findRoomAtTile(col, row) {
  if (!state.blockmap || !state.blockmap.rooms) return null;
  for (const r of state.blockmap.rooms) {
    if (r.tiles) {
      if (r.tiles.some(t => t[0] === col && t[1] === row)) return r;
    } else {
      if (col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h) return r;
    }
  }
  return null;
}

// Edge snapping for doors
function detectDoorEdge(wx, wy) {
  const geom = getGridGeometry();
  const tile = worldToTile(wx, wy);
  if (!tile) return null;

  const [col, row] = tile;
  const tilePos = tileToWorld(col, row);
  const relX = (wx - tilePos.x) / geom.tileSize;
  const relY = (wy - tilePos.y) / geom.tileSize;

  // Determine closest edge among North, South, East, West
  const distN = relY;
  const distS = 1.0 - relY;
  const distW = relX;
  const distE = 1.0 - relX;
  const minDist = Math.min(distN, distS, distW, distE);

  let from = [col, row];
  let to = [col, row];
  let orientation = 'h';
  let cx = tilePos.x + geom.tileSize / 2;
  let cy = tilePos.y;

  if (minDist === distN) {
    to = [col, row - 1];
    orientation = 'h';
    cy = tilePos.y;
  } else if (minDist === distS) {
    to = [col, row + 1];
    orientation = 'h';
    cy = tilePos.y + geom.tileSize;
  } else if (minDist === distW) {
    to = [col - 1, row];
    orientation = 'v';
    cx = tilePos.x;
    cy = tilePos.y + geom.tileSize / 2;
  } else {
    to = [col + 1, row];
    orientation = 'v';
    cx = tilePos.x + geom.tileSize;
    cy = tilePos.y + geom.tileSize / 2;
  }

  // Determine target room
  const room1 = findRoomAtTile(from[0], from[1]);
  const room2 = findRoomAtTile(to[0], to[1]);
  const room = room1 ? room1.id : (room2 ? room2.id : '');

  return { from, to, orientation, cx, cy, room };
}

// -------------------------------------------------------------
// Canvas Rendering Engine
// -------------------------------------------------------------
function render() {
  if (!dom || !dom.ctx || !dom.canvas) return;
  const ctx = dom.ctx;
  const w = dom.canvas.width;
  const h = dom.canvas.height;
  const geom = getGridGeometry();

  ctx.clearRect(0, 0, w, h);

  // Background base
  ctx.fillStyle = '#060910';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);

  // 0. Additional Black Border Tiles (Border Option)
  if (geom.hasAdditionalBorder) {
    ctx.save();
    for (let c = -1; c <= geom.cols; c++) {
      for (let r = -1; r <= geom.rows; r++) {
        if (c === -1 || c === geom.cols || r === -1 || r === geom.rows) {
          const pos = tileToWorld(c, r);
          // Dark solid black tile
          ctx.fillStyle = '#070b12';
          ctx.fillRect(pos.x, pos.y, geom.tileSize, geom.tileSize);

          // Subtle slate border
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1.0;
          ctx.strokeRect(pos.x, pos.y, geom.tileSize, geom.tileSize);

          // Subtle stone wall texture line
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
          ctx.beginPath();
          ctx.moveTo(pos.x + 3, pos.y + 3);
          ctx.lineTo(pos.x + geom.tileSize - 3, pos.y + geom.tileSize - 3);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // 1. Board Background Artwork (Layer 1)
  if (state.layers.showImage && state.bgImage) {
    ctx.save();
    ctx.globalAlpha = state.layers.artOpacity;
    ctx.drawImage(state.bgImage, 0, 0);
    ctx.restore();
  }

  // 2. Corridors Underlay (Layer 1)
  if (state.layers.showCorridors && state.blockmap?.corridors) {
    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)'; // Soft Sky Blue tint
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)'; // Subtle corridor tile edge
    ctx.lineWidth = 1.0;
    for (const [c, r] of state.blockmap.corridors) {
      const pos = tileToWorld(c, r);
      ctx.fillRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
      ctx.strokeRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
    }
    ctx.restore();
  }

  // 3. Rooms Underlay (Layer 1)
  if (state.layers.showRooms && state.blockmap?.rooms) {
    ctx.save();
    for (const room of state.blockmap.rooms) {
      const roomColor = room.color;
      ctx.fillStyle = roomColor ? `${roomColor}24` : 'rgba(245, 158, 11, 0.14)'; // Soft Warm Amber tint default
      ctx.strokeStyle = roomColor ? `${roomColor}80` : 'rgba(245, 158, 11, 0.45)'; // Amber room perimeter border
      ctx.lineWidth = 1.8;

      if (room.tiles && room.tiles.length > 0) {
        const tileSet = new Set(room.tiles.map(([c, r]) => `${c},${r}`));
        ctx.beginPath();
        for (const [c, r] of room.tiles) {
          const pos = tileToWorld(c, r);
          ctx.fillRect(pos.x, pos.y, geom.tileSize, geom.tileSize);

          // Outer room perimeter borders
          if (!tileSet.has(`${c},${r - 1}`)) {
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(pos.x + geom.tileSize, pos.y);
          }
          if (!tileSet.has(`${c},${r + 1}`)) {
            ctx.moveTo(pos.x, pos.y + geom.tileSize);
            ctx.lineTo(pos.x + geom.tileSize, pos.y + geom.tileSize);
          }
          if (!tileSet.has(`${c - 1},${r}`)) {
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(pos.x, pos.y + geom.tileSize);
          }
          if (!tileSet.has(`${c + 1},${r}`)) {
            ctx.moveTo(pos.x + geom.tileSize, pos.y);
            ctx.lineTo(pos.x + geom.tileSize, pos.y + geom.tileSize);
          }
        }
        ctx.stroke();
      } else if (room.x !== undefined && room.y !== undefined && room.w && room.h) {
        const pos = tileToWorld(room.x, room.y);
        ctx.fillRect(pos.x, pos.y, room.w * geom.tileSize, room.h * geom.tileSize);
        ctx.strokeRect(pos.x, pos.y, room.w * geom.tileSize, room.h * geom.tileSize);
      }
    }
    ctx.restore();
  }

  // 4. Grid Lines (Layer 1)
  if (state.layers.showGrid) {
    ctx.save();
    ctx.globalAlpha = state.layers.gridOpacity;
    ctx.strokeStyle = '#223249';
    ctx.lineWidth = 1.0;
    ctx.beginPath();

    const minC = geom.hasAdditionalBorder ? -1 : 0;
    const maxC = geom.hasAdditionalBorder ? geom.cols + 1 : geom.cols;
    const minR = geom.hasAdditionalBorder ? -1 : 0;
    const maxR = geom.hasAdditionalBorder ? geom.rows + 1 : geom.rows;

    const startX = geom.offsetX + minC * geom.tileSize;
    const startY = geom.offsetY + minR * geom.tileSize;
    const endX = geom.offsetX + maxC * geom.tileSize;
    const endY = geom.offsetY + maxR * geom.tileSize;

    // Vertical lines
    for (let c = minC; c <= maxC; c++) {
      const x = geom.offsetX + c * geom.tileSize;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    // Horizontal lines
    for (let r = minR; r <= maxR; r++) {
      const y = geom.offsetY + r * geom.tileSize;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 4b. Room Names (Layer 1.5)
  if (state.layers.showRoomNames && state.blockmap?.rooms) {
    ctx.save();
    for (const room of state.blockmap.rooms) {
      const text = room.name || room.id;
      if (!text) continue;

      let centerTileX = 0;
      let centerTileY = 0;

      if (room.tiles && room.tiles.length > 0) {
        let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
        for (const [c, r] of room.tiles) {
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
        }
        centerTileX = (minC + maxC + 1) / 2;
        centerTileY = (minR + maxR + 1) / 2;
      } else if (room.x !== undefined && room.y !== undefined && room.w && room.h) {
        centerTileX = room.x + room.w / 2;
        centerTileY = room.y + room.h / 2;
      } else {
        continue;
      }

      const cx = geom.offsetX + centerTileX * geom.tileSize;
      const cy = geom.offsetY + centerTileY * geom.tileSize;

      const fontSize = Math.max(10, Math.min(14, Math.round(geom.tileSize * 0.3)));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;
      const padX = 7;
      const padY = 3.5;
      const boxW = textWidth + padX * 2;
      const boxH = fontSize + padY * 2;
      const rx = cx - boxW / 2;
      const ry = cy - boxH / 2;
      const radius = 4;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = room.color || 'rgba(245, 158, 11, 0.75)';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(rx, ry, boxW, boxH, radius);
      } else {
        ctx.rect(rx, ry, boxW, boxH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fde047';
      ctx.fillText(text, cx, cy + 0.5);
    }
    ctx.restore();
  }

  // 5. Wall Blocks (Layer 2)
  if (state.layers.showWallBlocks && state.quest.wallBlocks) {
    state.quest.wallBlocks.forEach((wb, i) => {
      const pos = tileToWorld(wb.x, wb.y);
      const bw = (wb.width || 1) * geom.tileSize;
      const bh = (wb.height || 1) * geom.tileSize;
      const blockImg = state.assetCache['wall_block'];

      if (blockImg) {
        ctx.drawImage(blockImg, pos.x, pos.y, bw, bh);
      } else {
        ctx.fillStyle = '#334155';
        ctx.fillRect(pos.x + 1, pos.y + 1, bw - 2, bh - 2);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pos.x + 1, pos.y + 1, bw - 2, bh - 2);

        // Brick lines
        ctx.strokeStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(pos.x + 1, pos.y + bh / 2);
        ctx.lineTo(pos.x + bw - 1, pos.y + bh / 2);
        ctx.stroke();
      }

      if (state.selectedEntity && state.selectedEntity.type === 'wall-block' && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, bw, bh);
      }
    });
  }

  // 6. Traps (Layer 2)
  if (state.layers.showTraps && state.quest.traps) {
    state.quest.traps.forEach((tr, i) => {
      const pos = tileToWorld(tr.x, tr.y);
      const trapKey = tr.type === 'spear' ? 'trap_spear' : (tr.type === 'falling_rock' ? 'trap_falling_block' : 'trap_pit');
      const trapImg = state.assetCache[trapKey];

      if (trapImg) {
        ctx.drawImage(trapImg, pos.x, pos.y, geom.tileSize, geom.tileSize);
      } else {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(pos.x + 2, pos.y + 2, geom.tileSize - 4, geom.tileSize - 4);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pos.x + 2, pos.y + 2, geom.tileSize - 4, geom.tileSize - 4);

        ctx.fillStyle = '#fca5a5';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠️', pos.x + geom.tileSize / 2, pos.y + geom.tileSize / 2);
      }

      if (state.selectedEntity && state.selectedEntity.type === 'trap' && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, geom.tileSize, geom.tileSize);
      }
    });
  }

  // 7. Furniture & Map Items (Layer 2)
  if (state.layers.showFurniture && state.quest.furniture) {
    state.quest.furniture.forEach((f, i) => {
      const pos = tileToWorld(f.x, f.y);
      const fw = (f.width || 1) * geom.tileSize;
      const fh = (f.height || 1) * geom.tileSize;
      let furnImg = state.assetCache[f.type];
      if (!furnImg && f.type.includes('stair')) {
        furnImg = state.assetCache['stairs_up_1x1'] || state.assetCache['stairs'];
      }

      if (furnImg) {
        ctx.drawImage(furnImg, pos.x, pos.y, fw, fh);
      } else {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(pos.x + 2, pos.y + 2, fw - 4, fh - 4);
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pos.x + 2, pos.y + 2, fw - 4, fh - 4);

        ctx.fillStyle = '#fef3c7';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const def = FURNITURE_DEFS[f.type] || { icon: '🪑' };
        ctx.fillText(def.icon, pos.x + fw / 2, pos.y + fh / 2);
      }

      if (state.selectedEntity && state.selectedEntity.type === 'furniture' && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, fw, fh);
      }
    });
  }

  // 8. Starting Spiral Stairs & Quest Exit (Layer 2 - drawn over map pieces / stairs)
  if (state.quest.startingStair) {
    const [sc, sr] = state.quest.startingStair;
    const isBorder = isBorderTile(sc, sr);

    // Check if starting stair is on a placed stairs furniture piece
    const stairFurn = state.quest.furniture.find(f =>
      f.type.includes('stair') &&
      sc >= f.x && sc < f.x + (f.width || 1) &&
      sr >= f.y && sr < f.y + (f.height || 1)
    );

    const spos = stairFurn ? tileToWorld(stairFurn.x, stairFurn.y) : tileToWorld(sc, sr);
    const sw = (stairFurn ? (stairFurn.width || 1) : (state.quest.startingStairType?.includes('2x2') ? 2 : 1)) * geom.tileSize;
    const sh = (stairFurn ? (stairFurn.height || 1) : (state.quest.startingStairType?.includes('2x2') ? 2 : 1)) * geom.tileSize;

    // Border tile indicator aura (highlights entrance from outside dungeon)
    if (isBorder) {
      ctx.save();
      ctx.fillStyle = 'rgba(14, 165, 233, 0.35)';
      ctx.fillRect(spos.x - 3, spos.y - 3, sw + 6, sh + 6);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(spos.x - 3, spos.y - 3, sw + 6, sh + 6);
      ctx.restore();
    }

    if (!stairFurn) {
      const stairKey = state.quest.startingStairType || 'stairs_up_1x1';
      const stairsImg = state.assetCache[stairKey] || state.assetCache['stairs_up_1x1'] || state.assetCache['stairs'];
      if (stairsImg) {
        ctx.drawImage(stairsImg, spos.x, spos.y, sw, sh);
        ctx.save();
        ctx.fillStyle = 'rgba(2, 132, 199, 0.35)';
        ctx.fillRect(spos.x + 1, spos.y + 1, sw - 2, sh - 2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(spos.x + 2, spos.y + 2, sw - 4, sh - 4);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(spos.x + 2, spos.y + 2, sw - 4, sh - 4);
      }
    } else {
      // Highlight existing stairs furniture that is the active start
      ctx.save();
      ctx.fillStyle = 'rgba(2, 132, 199, 0.28)';
      ctx.fillRect(spos.x + 1, spos.y + 1, sw - 2, sh - 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.0;
      ctx.strokeRect(spos.x + 1, spos.y + 1, sw - 2, sh - 2);
      ctx.restore();
    }

    // Always draw clear 🪜 ladder / entrance icon in center with contrast backdrop
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(16 * Math.min(sw, sh) / geom.tileSize)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪜', spos.x + sw / 2, spos.y + sh / 2 - 4);
    ctx.restore();

    // High-visibility START label pill
    const pillW = Math.min(sw - 4, 46);
    ctx.save();
    ctx.fillStyle = 'rgba(12, 74, 110, 0.9)';
    ctx.fillRect(spos.x + (sw - pillW) / 2, spos.y + sh - 13, pillW, 11);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.0;
    ctx.strokeRect(spos.x + (sw - pillW) / 2, spos.y + sh - 13, pillW, 11);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 8.5px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('START', spos.x + sw / 2, spos.y + sh - 7.5);
    ctx.restore();

    if (state.selectedEntity && (state.selectedEntity.type === 'start' || state.selectedEntity.type === 'stairs')) {
      drawSelectionGlow(spos.x, spos.y, sw, sh);
    }
  }

  // 8b. Quest Exit Staircase / Escape Hatch (Layer 2)
  if (state.quest.exitTile) {
    const [ec, er] = state.quest.exitTile;
    const isBorder = isBorderTile(ec, er);

    // Check if exit is on a placed stairs furniture piece
    const stairFurn = state.quest.furniture.find(f =>
      f.type.includes('stair') &&
      ec >= f.x && ec < f.x + (f.width || 1) &&
      er >= f.y && er < f.y + (f.height || 1)
    );

    const epos = stairFurn ? tileToWorld(stairFurn.x, stairFurn.y) : tileToWorld(ec, er);
    const ew = (stairFurn ? (stairFurn.width || 1) : (state.quest.exitStairType?.includes('2x2') ? 2 : 1)) * geom.tileSize;
    const eh = (stairFurn ? (stairFurn.height || 1) : (state.quest.exitStairType?.includes('2x2') ? 2 : 1)) * geom.tileSize;

    // Border tile indicator aura (highlights exit to safety outside dungeon)
    if (isBorder) {
      ctx.save();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
      ctx.fillRect(epos.x - 3, epos.y - 3, ew + 6, eh + 6);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(epos.x - 3, epos.y - 3, ew + 6, eh + 6);
      ctx.restore();
    }

    if (!stairFurn) {
      const stairKey = state.quest.exitStairType || 'stairs_down_1x1';
      const stairsImg = state.assetCache[stairKey] || state.assetCache['stairs_down_1x1'] || state.assetCache['stairs'];
      if (stairsImg) {
        ctx.drawImage(stairsImg, epos.x, epos.y, ew, eh);
        ctx.save();
        ctx.fillStyle = 'rgba(5, 150, 105, 0.55)';
        ctx.fillRect(epos.x + 1, epos.y + 1, ew - 2, eh - 2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#065f46';
        ctx.fillRect(epos.x + 2, epos.y + 2, ew - 4, eh - 4);
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(epos.x + 2, epos.y + 2, ew - 4, eh - 4);
      }
    } else {
      // Highlight existing stairs furniture that is the active exit
      ctx.save();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
      ctx.fillRect(epos.x + 1, epos.y + 1, ew - 2, eh - 2);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.0;
      ctx.strokeRect(epos.x + 1, epos.y + 1, ew - 2, eh - 2);
      ctx.restore();
    }

    // Always draw clear 🏁 checkered flag in center with contrast backdrop
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(16 * Math.min(ew, eh) / geom.tileSize)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏁', epos.x + ew / 2, epos.y + eh / 2 - 4);
    ctx.restore();

    // High-visibility EXIT label pill
    const pillW = Math.min(ew - 4, 46);
    ctx.save();
    ctx.fillStyle = 'rgba(6, 78, 59, 0.9)';
    ctx.fillRect(epos.x + (ew - pillW) / 2, epos.y + eh - 13, pillW, 11);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.0;
    ctx.strokeRect(epos.x + (ew - pillW) / 2, epos.y + eh - 13, pillW, 11);
    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 8.5px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', epos.x + ew / 2, epos.y + eh - 7.5);
    ctx.restore();

    if (state.selectedEntity && state.selectedEntity.type === 'exit') {
      drawSelectionGlow(epos.x, epos.y, ew, eh);
    }
  }

  // 9. Doors (Layer 2)
  if (state.layers.showDoors && state.quest.doors) {
    state.quest.doors.forEach((d, i) => {
      const isVertical = d.from[0] !== d.to[0];
      const c = isVertical ? Math.max(d.from[0], d.to[0]) : d.from[0];
      const r = isVertical ? d.from[1] : Math.max(d.from[1], d.to[1]);
      const basePos = tileToWorld(c, r);
      const ts = geom.tileSize;
      const doorLength = Math.round(ts * 0.82);
      const doorThick = 8;

      let dw, dh, dx, dy, cx, cy;
      if (isVertical) {
        dw = doorThick;
        dh = doorLength;
        cx = basePos.x;
        cy = basePos.y + ts / 2;
        dx = cx - dw / 2;
        dy = basePos.y + (ts - dh) / 2;
      } else {
        dw = doorLength;
        dh = doorThick;
        cx = basePos.x + ts / 2;
        cy = basePos.y;
        dx = basePos.x + (ts - dw) / 2;
        dy = cy - dh / 2;
      }

      ctx.save();

      if (d.is_secret) {
        if (d.state === 'open') {
          // Open Secret Door (revealed passageway)
          ctx.fillStyle = 'rgba(147, 51, 234, 0.25)';
          ctx.fillRect(dx, dy, dw, dh);

          ctx.strokeStyle = '#c084fc';
          ctx.setLineDash([3, 2]);
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          if (isVertical) {
            ctx.moveTo(cx, dy);
            ctx.lineTo(cx, dy + dh);
          } else {
            ctx.moveTo(dx, cy);
            ctx.lineTo(dx + dw, cy);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // Swung stone slab
          const leafLen = Math.round(doorLength * 0.82);
          const leafThick = 5.5;
          ctx.fillStyle = '#6b21a8';
          ctx.strokeStyle = '#d8b4fe';
          ctx.lineWidth = 1.5;
          if (isVertical) {
            ctx.fillRect(cx, dy - leafThick / 2, leafLen, leafThick);
            ctx.strokeRect(cx, dy - leafThick / 2, leafLen, leafThick);
            ctx.strokeStyle = 'rgba(216, 180, 254, 0.7)';
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.arc(cx, dy, leafLen, 0, Math.PI / 2);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.fillRect(dx - leafThick / 2, cy, leafThick, leafLen);
            ctx.strokeRect(dx - leafThick / 2, cy, leafThick, leafLen);
            ctx.strokeStyle = 'rgba(216, 180, 254, 0.7)';
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.arc(dx, cy, leafLen, 0, Math.PI / 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Secret Open Badge
          const bw = 24, bh = 11;
          ctx.fillStyle = '#581c87';
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 7px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S:OPEN', cx, cy + 0.5);
        } else {
          // Closed Secret Door: solid purple masonry slab with 'S' badge
          ctx.fillStyle = '#6b21a8';
          ctx.fillRect(dx, dy, dw, dh);
          ctx.strokeStyle = '#d8b4fe';
          ctx.lineWidth = 2.0;
          ctx.strokeRect(dx, dy, dw, dh);

          // Center 'S' badge
          ctx.fillStyle = '#581c87';
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S', cx, cy);
        }
      } else if (d.state === 'open') {
        // ── OPEN WOOD DOOR ──
        // 1. Open threshold glow (illuminated passageway)
        ctx.fillStyle = 'rgba(16, 185, 129, 0.32)';
        ctx.fillRect(dx, dy, dw, dh);

        // 2. Dashed threshold line (marking open wall boundary)
        ctx.strokeStyle = '#10b981';
        ctx.setLineDash([3, 2]);
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        if (isVertical) {
          ctx.moveTo(cx, dy);
          ctx.lineTo(cx, dy + dh);
        } else {
          ctx.moveTo(dx, cy);
          ctx.lineTo(dx + dw, cy);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Door jamb posts at ends
        ctx.fillStyle = '#064e3b';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.0;
        if (isVertical) {
          ctx.fillRect(cx - 3, dy - 1, 6, 3);
          ctx.strokeRect(cx - 3, dy - 1, 6, 3);
          ctx.fillRect(cx - 3, dy + dh - 2, 6, 3);
          ctx.strokeRect(cx - 3, dy + dh - 2, 6, 3);
        } else {
          ctx.fillRect(dx - 1, cy - 3, 3, 6);
          ctx.strokeRect(dx - 1, cy - 3, 3, 6);
          ctx.fillRect(dx + dw - 2, cy - 3, 3, 6);
          ctx.strokeRect(dx + dw - 2, cy - 3, 3, 6);
        }

        // 4. 90-degree swung wooden door leaf
        const leafLen = Math.round(doorLength * 0.85);
        const leafThick = 5.5;
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#34d399'; // vivid emerald outline
        ctx.lineWidth = 1.5;

        if (isVertical) {
          // Swung into right tile (+X)
          ctx.fillRect(cx, dy - leafThick / 2, leafLen, leafThick);
          ctx.strokeRect(cx, dy - leafThick / 2, leafLen, leafThick);

          // Brass hinge pin at corner
          ctx.fillStyle = '#fbbf24';
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.arc(cx, dy, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Quarter-circle swing arc
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.75)';
          ctx.setLineDash([2, 2]);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, dy, leafLen, 0, Math.PI / 2);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          // Swung into lower tile (+Y)
          ctx.fillRect(dx - leafThick / 2, cy, leafThick, leafLen);
          ctx.strokeRect(dx - leafThick / 2, cy, leafThick, leafLen);

          // Brass hinge pin at corner
          ctx.fillStyle = '#fbbf24';
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.arc(dx, cy, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Quarter-circle swing arc
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.75)';
          ctx.setLineDash([2, 2]);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(dx, cy, leafLen, 0, Math.PI / 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // 5. Central "OPEN" badge
        const bw = 24, bh = 11;
        ctx.fillStyle = '#064e3b';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 7.5px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('OPEN', cx, cy + 0.5);

      } else {
        // ── CLOSED WOOD DOOR ──
        // 1. Dark iron/slate jamb posts at ends
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.0;
        if (isVertical) {
          ctx.fillRect(cx - 4, dy - 2, 8, 3);
          ctx.strokeRect(cx - 4, dy - 2, 8, 3);
          ctx.fillRect(cx - 4, dy + dh - 1, 8, 3);
          ctx.strokeRect(cx - 4, dy + dh - 1, 8, 3);
        } else {
          ctx.fillRect(dx - 2, cy - 4, 3, 8);
          ctx.strokeRect(dx - 2, cy - 4, 3, 8);
          ctx.fillRect(dx + dw - 1, cy - 4, 3, 8);
          ctx.strokeRect(dx + dw - 1, cy - 4, 3, 8);
        }

        // 2. Heavy solid wood slab with gradient
        const grad = isVertical
          ? ctx.createLinearGradient(dx, cy, dx + dw, cy)
          : ctx.createLinearGradient(cx, dy, cx, dy + dh);
        grad.addColorStop(0, '#92400e');
        grad.addColorStop(0.5, '#78350f');
        grad.addColorStop(1, '#451a03');

        ctx.fillStyle = grad;
        ctx.fillRect(dx, dy, dw, dh);

        // 3. Solid Amber Border
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(dx, dy, dw, dh);

        // 4. Two Dark Iron Reinforcement Straps with Rivets
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 0.8;
        if (isVertical) {
          const y1 = dy + Math.round(dh * 0.25) - 1.5;
          const y2 = dy + Math.round(dh * 0.75) - 1.5;
          ctx.fillRect(dx, y1, dw, 3);
          ctx.strokeRect(dx, y1, dw, 3);
          ctx.fillRect(dx, y2, dw, 3);
          ctx.strokeRect(dx, y2, dw, 3);

          // Rivet dots
          ctx.fillStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.arc(dx + 2, y1 + 1.5, 0.8, 0, Math.PI * 2);
          ctx.arc(dx + dw - 2, y1 + 1.5, 0.8, 0, Math.PI * 2);
          ctx.arc(dx + 2, y2 + 1.5, 0.8, 0, Math.PI * 2);
          ctx.arc(dx + dw - 2, y2 + 1.5, 0.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const x1 = dx + Math.round(dw * 0.25) - 1.5;
          const x2 = dx + Math.round(dw * 0.75) - 1.5;
          ctx.fillRect(x1, dy, 3, dh);
          ctx.strokeRect(x1, dy, 3, dh);
          ctx.fillRect(x2, dy, 3, dh);
          ctx.strokeRect(x2, dy, 3, dh);

          // Rivet dots
          ctx.fillStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.arc(x1 + 1.5, dy + 2, 0.8, 0, Math.PI * 2);
          ctx.arc(x1 + 1.5, dy + dh - 2, 0.8, 0, Math.PI * 2);
          ctx.arc(x2 + 1.5, dy + 2, 0.8, 0, Math.PI * 2);
          ctx.arc(x2 + 1.5, dy + dh - 2, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // 5. Brass Handle Stud / Ring Plate in Center
        ctx.fillStyle = '#b45309';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (state.selectedEntity && state.selectedEntity.type === 'door' && state.selectedEntity.index === i) {
        drawSelectionGlow(dx - 3, dy - 3, dw + 6, dh + 6);
      }
    });
  }

  // 10. Monsters (Layer 2)
  if (state.layers.showMonsters && state.quest.monsters) {
    state.quest.monsters.forEach((m, i) => {
      const mc = m.pos ? m.pos[0] : (m.x !== undefined ? m.x : 0);
      const mr = m.pos ? m.pos[1] : (m.y !== undefined ? m.y : 0);
      const pos = tileToWorld(mc, mr);
      const tokenKey = `token_${m.type}`;
      const tokenImg = state.assetCache[tokenKey];
      const radius = (geom.tileSize / 2) - 3;
      const cx = pos.x + geom.tileSize / 2;
      const cy = pos.y + geom.tileSize / 2;

      if (tokenImg) {
        ctx.drawImage(tokenImg, pos.x + 2, pos.y + 2, geom.tileSize - 4, geom.tileSize - 4);
      } else {
        const def = MONSTER_DEFS[m.type] || MONSTER_DEFS.goblin;
        // Circular token
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = m.isBoss ? '#e11d48' : (def.color || '#ca8a04');
        ctx.fill();
        ctx.strokeStyle = m.isBoss ? '#fb7185' : '#ffffff';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.icon || '👾', cx, cy);
      }

      // Boss crown or skull indicator
      if (m.isBoss) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '10px sans-serif';
        ctx.fillText('👑', cx, cy - radius - 2);
      }

      if (state.selectedEntity && state.selectedEntity.type === 'monster' && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, geom.tileSize, geom.tileSize);
      }
    });
  }

  // 11. Story Triggers / Notes (Layer 2)
  if (state.layers.showNotes && state.quest.storyTriggers) {
    state.quest.storyTriggers.forEach((st, i) => {
      const pos = tileToWorld(st.tile[0], st.tile[1]);
      const cx = pos.x + geom.tileSize / 2;
      const cy = pos.y + geom.tileSize / 2;

      // Parchment seal icon
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mark = (st.marker || 'A').replace('Note ', '');
      ctx.fillText(mark, cx, cy);

      if (state.selectedEntity && state.selectedEntity.type === 'note' && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, geom.tileSize, geom.tileSize);
      }
    });
  }

  // 11.5. Validation Warnings Overlay
  if (state.layers.showValidationWarnings && state.validation && state.validation.errors && state.validation.errors.length > 0) {
    renderValidationCanvasOverlays(ctx, geom);
  }

  // 12. Hover & Placement Ghost Preview
  renderToolPreview(ctx, geom);

  ctx.restore();
}

function drawSelectionGlow(x, y, w, h) {
  const ctx = dom.ctx;
  ctx.save();
  ctx.strokeStyle = '#00bcd4';
  ctx.lineWidth = 2.0;
  ctx.shadowColor = '#00bcd4';
  ctx.shadowBlur = 8;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function renderToolPreview(ctx, geom) {
  if (state.activeTool === 'select' || state.activeTool === 'erase') {
    if (state.hoverTile) {
      const pos = tileToWorld(state.hoverTile[0], state.hoverTile[1]);
      ctx.strokeStyle = state.activeTool === 'erase' ? '#ef4444' : '#00bcd4';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
    }
    return;
  }

  // Door preview along wall edge
  if (state.activeTool === 'door' && state.hoverDoorEdge) {
    const e = state.hoverDoorEdge;
    ctx.save();
    const isSecret = state.subtool.doorType === 'secret';
    const isOpen = state.subtool.doorType === 'wood-open';
    const ts = geom.tileSize;
    const doorLength = Math.round(ts * 0.82);
    const doorThick = 8;

    let dw, dh, dx, dy;
    if (e.orientation === 'v') {
      dw = doorThick;
      dh = doorLength;
      dx = e.cx - dw / 2;
      dy = e.cy - dh / 2;
    } else {
      dw = doorLength;
      dh = doorThick;
      dx = e.cx - dw / 2;
      dy = e.cy - dh / 2;
    }

    if (isSecret) {
      ctx.fillStyle = 'rgba(147, 51, 234, 0.45)';
      ctx.strokeStyle = '#d8b4fe';
      ctx.lineWidth = 2.0;
      ctx.fillRect(dx, dy, dw, dh);
      ctx.strokeRect(dx, dy, dw, dh);
    } else if (isOpen) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.0;
      ctx.fillRect(dx, dy, dw, dh);
      ctx.strokeRect(dx, dy, dw, dh);

      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = '#34d399';
      ctx.beginPath();
      if (e.orientation === 'v') {
        ctx.moveTo(e.cx, dy);
        ctx.lineTo(e.cx, dy + dh);
      } else {
        ctx.moveTo(dx, e.cy);
        ctx.lineTo(dx + dw, e.cy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = 'rgba(180, 83, 9, 0.55)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.0;
      ctx.fillRect(dx, dy, dw, dh);
      ctx.strokeRect(dx, dy, dw, dh);
    }
    ctx.restore();
    return;
  }

  if (!state.hoverTile) return;
  const [col, row] = state.hoverTile;
  const pos = tileToWorld(col, row);

  ctx.save();
  ctx.globalAlpha = 0.55;

  if (state.activeTool === 'monster') {
    const def = MONSTER_DEFS[state.subtool.monsterType] || MONSTER_DEFS.goblin;
    ctx.beginPath();
    ctx.arc(pos.x + geom.tileSize / 2, pos.y + geom.tileSize / 2, (geom.tileSize / 2) - 3, 0, Math.PI * 2);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (state.activeTool === 'furniture') {
    const def = FURNITURE_DEFS[state.subtool.furnitureType] || { w: 1, h: 1 };
    const w = (state.subtool.furnitureRotated ? def.h : def.w) * geom.tileSize;
    const h = (state.subtool.furnitureRotated ? def.w : def.h) * geom.tileSize;
    let furnImg = state.assetCache[state.subtool.furnitureType];
    if (!furnImg && state.subtool.furnitureType.includes('stair')) {
      furnImg = state.assetCache['stairs_up_1x1'] || state.assetCache['stairs'];
    }
    if (furnImg) {
      ctx.drawImage(furnImg, pos.x, pos.y, w, h);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pos.x, pos.y, w, h);
    } else {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(pos.x, pos.y, w, h);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pos.x, pos.y, w, h);
    }
  } else if (state.activeTool === 'trap') {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
  } else if (state.activeTool === 'wall-block') {
    const isDoubleH = state.subtool.wallBlockType === 'double-h';
    const isDoubleV = state.subtool.wallBlockType === 'double-v';
    const bw = (isDoubleH ? 2 : 1) * geom.tileSize;
    const bh = (isDoubleV ? 2 : 1) * geom.tileSize;
    ctx.fillStyle = '#475569';
    ctx.fillRect(pos.x, pos.y, bw, bh);
  } else if (state.activeTool === 'start' || state.activeTool === 'stairs') {
    const is2x2 = state.subtool.startStairType?.includes('2x2');
    const sw = (is2x2 ? 2 : 1) * geom.tileSize;
    const sh = (is2x2 ? 2 : 1) * geom.tileSize;
    ctx.fillStyle = 'rgba(2, 132, 199, 0.75)';
    ctx.fillRect(pos.x + 1, pos.y + 1, sw - 2, sh - 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = isBorderTile(col, row) ? 3.0 : 1.5;
    ctx.strokeRect(pos.x + 1, pos.y + 1, sw - 2, sh - 2);

    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(14 * (is2x2 ? 1.5 : 1))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪜', pos.x + sw / 2, pos.y + sh / 2 - 4);

    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 8.5px monospace';
    ctx.fillText('START', pos.x + sw / 2, pos.y + sh - 6);
  } else if (state.activeTool === 'exit') {
    const is2x2 = state.subtool.exitStairType?.includes('2x2');
    const ew = (is2x2 ? 2 : 1) * geom.tileSize;
    const eh = (is2x2 ? 2 : 1) * geom.tileSize;
    ctx.fillStyle = 'rgba(5, 150, 105, 0.75)';
    ctx.fillRect(pos.x + 1, pos.y + 1, ew - 2, eh - 2);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = isBorderTile(col, row) ? 3.0 : 1.5;
    ctx.strokeRect(pos.x + 1, pos.y + 1, ew - 2, eh - 2);

    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(14 * (is2x2 ? 1.5 : 1))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏁', pos.x + ew / 2, pos.y + eh / 2 - 4);

    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 8.5px monospace';
    ctx.fillText('EXIT', pos.x + ew / 2, pos.y + eh - 6);
  } else if (state.activeTool === 'note') {
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(pos.x + geom.tileSize / 2, pos.y + geom.tileSize / 2, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// -------------------------------------------------------------
// View Camera & Zoom
// -------------------------------------------------------------
function fitView() {
  const geom = getGridGeometry();
  const minC = geom.hasAdditionalBorder ? -1 : 0;
  const maxC = geom.hasAdditionalBorder ? geom.cols + 1 : geom.cols;
  const minR = geom.hasAdditionalBorder ? -1 : 0;
  const maxR = geom.hasAdditionalBorder ? geom.rows + 1 : geom.rows;
  const boardW = (maxC - minC) * geom.tileSize;
  const boardH = (maxR - minR) * geom.tileSize;
  const vpW = dom.canvas.width;
  const vpH = dom.canvas.height;

  const scaleX = (vpW - 80) / boardW;
  const scaleY = (vpH - 80) / boardH;
  state.zoom = Math.max(0.4, Math.min(2.5, Math.min(scaleX, scaleY)));

  state.panX = Math.round((vpW - boardW * state.zoom) / 2 - (geom.offsetX + minC * geom.tileSize) * state.zoom);
  state.panY = Math.round((vpH - boardH * state.zoom) / 2 - (geom.offsetY + minR * geom.tileSize) * state.zoom);

  updateZoomUI();
}

function updateZoomUI() {
  dom.infoZoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
}

// -------------------------------------------------------------
// Tool Handling & Interaction
// -------------------------------------------------------------
function updateStartSuboptsUI() {
  if (dom.selectStartStairType) {
    dom.selectStartStairType.value = state.quest.startingStairType || state.subtool.startStairType || 'stairs_up_1x1';
  }
  if (!dom.suboptsStartPos) return;
  if (state.quest.startingStair) {
    const [sc, sr] = state.quest.startingStair;
    const isBorder = isBorderTile(sc, sr);
    dom.suboptsStartPos.textContent = `[${sc}, ${sr}]`;
    if (dom.suboptsStartBorderBadge) {
      dom.suboptsStartBorderBadge.style.display = isBorder ? 'inline-block' : 'none';
    }
  } else {
    dom.suboptsStartPos.textContent = 'None';
    if (dom.suboptsStartBorderBadge) dom.suboptsStartBorderBadge.style.display = 'none';
  }
}

function updateExitSuboptsUI() {
  if (dom.selectExitStairType) {
    dom.selectExitStairType.value = state.quest.exitStairType || state.subtool.exitStairType || 'stairs_down_1x1';
  }
  if (!dom.suboptsExitPos) return;
  if (state.quest.exitTile) {
    const [ec, er] = state.quest.exitTile;
    const isBorder = isBorderTile(ec, er);
    dom.suboptsExitPos.textContent = `[${ec}, ${er}]`;
    if (dom.suboptsExitBorderBadge) {
      dom.suboptsExitBorderBadge.style.display = isBorder ? 'inline-block' : 'none';
    }
  } else {
    dom.suboptsExitPos.textContent = 'None';
    if (dom.suboptsExitBorderBadge) dom.suboptsExitBorderBadge.style.display = 'none';
  }
}

function setActiveTool(tool) {
  state.activeTool = tool;
  dom.toolBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });

  // Update Status tag
  const toolLabels = {
    select: 'Select / Move',
    door: 'Door',
    monster: 'Monster',
    furniture: 'Furniture',
    trap: 'Trap',
    'wall-block': 'Wall Block',
    start: 'Starting Entrance (🪜)',
    stairs: 'Starting Entrance (🪜)',
    exit: 'Quest Exit (🏁)',
    note: 'Quest Note',
    erase: 'Erase'
  };
  dom.infoActiveTool.textContent = `🛠️ Tool: ${toolLabels[tool] || tool}`;

  // Hide all subtool groups
  [
    dom.suboptsDoor,
    dom.suboptsMonster,
    dom.suboptsFurniture,
    dom.suboptsTrap,
    dom.suboptsWallBlock,
    dom.suboptsNote,
    dom.suboptsStart,
    dom.suboptsExit
  ].forEach(el => { if (el) el.style.display = 'none'; });

  // Show matching subtool group
  if (tool === 'door') {
    dom.subtoolHeader.textContent = '🚪 Door Options';
    dom.suboptsDoor.style.display = 'flex';
  } else if (tool === 'monster') {
    dom.subtoolHeader.textContent = '👾 Monster Options';
    dom.suboptsMonster.style.display = 'flex';
  } else if (tool === 'furniture') {
    dom.subtoolHeader.textContent = '🪑 Furniture Options';
    dom.suboptsFurniture.style.display = 'flex';
  } else if (tool === 'trap') {
    dom.subtoolHeader.textContent = '⚠️ Trap Options';
    dom.suboptsTrap.style.display = 'flex';
  } else if (tool === 'wall-block') {
    dom.subtoolHeader.textContent = '🧱 Wall Block Options';
    dom.suboptsWallBlock.style.display = 'flex';
  } else if (tool === 'start' || tool === 'stairs') {
    dom.subtoolHeader.textContent = '🪜 Start Position Options';
    if (dom.suboptsStart) {
      dom.suboptsStart.style.display = 'block';
      updateStartSuboptsUI();
    }
  } else if (tool === 'exit') {
    dom.subtoolHeader.textContent = '🏁 Exit Position Options';
    if (dom.suboptsExit) {
      dom.suboptsExit.style.display = 'block';
      updateExitSuboptsUI();
    }
  } else if (tool === 'note') {
    dom.subtoolHeader.textContent = '📜 Note Options';
    dom.suboptsNote.style.display = 'flex';
  } else {
    dom.subtoolHeader.textContent = 'Options';
  }

  render();
}

function findFurnitureAtTile(col, row) {
  for (let i = 0; i < state.quest.furniture.length; i++) {
    const f = state.quest.furniture[i];
    if (col >= f.x && col < f.x + (f.width || 1) && row >= f.y && row < f.y + (f.height || 1)) {
      return f;
    }
  }
  return null;
}

function findEntityAt(col, row) {
  // Check monsters
  for (let i = 0; i < state.quest.monsters.length; i++) {
    const m = state.quest.monsters[i];
    if (m.pos[0] === col && m.pos[1] === row) {
      return { type: 'monster', index: i, data: m };
    }
  }

  // Check furniture
  for (let i = 0; i < state.quest.furniture.length; i++) {
    const f = state.quest.furniture[i];
    if (col >= f.x && col < f.x + (f.width || 1) && row >= f.y && row < f.y + (f.height || 1)) {
      return { type: 'furniture', index: i, data: f };
    }
  }

  // Check traps
  for (let i = 0; i < state.quest.traps.length; i++) {
    const tr = state.quest.traps[i];
    if (tr.x === col && tr.y === row) {
      return { type: 'trap', index: i, data: tr };
    }
  }

  // Check wall blocks
  for (let i = 0; i < state.quest.wallBlocks.length; i++) {
    const wb = state.quest.wallBlocks[i];
    if (col >= wb.x && col < wb.x + (wb.width || 1) && row >= wb.y && row < wb.y + (wb.height || 1)) {
      return { type: 'wall-block', index: i, data: wb };
    }
  }

  // Check start / stairs
  if (state.quest.startingStair && state.quest.startingStair[0] === col && state.quest.startingStair[1] === row) {
    return { type: 'start', index: 0, data: state.quest.startingStair };
  }

  // Check exit
  if (state.quest.exitTile && state.quest.exitTile[0] === col && state.quest.exitTile[1] === row) {
    return { type: 'exit', index: 0, data: state.quest.exitTile };
  }

  // Check notes
  for (let i = 0; i < state.quest.storyTriggers.length; i++) {
    const st = state.quest.storyTriggers[i];
    if (st.tile[0] === col && st.tile[1] === row) {
      return { type: 'note', index: i, data: st };
    }
  }

  // Check doors
  for (let i = 0; i < state.quest.doors.length; i++) {
    const d = state.quest.doors[i];
    if ((d.from[0] === col && d.from[1] === row) || (d.to[0] === col && d.to[1] === row)) {
      return { type: 'door', index: i, data: d };
    }
  }

  return null;
}

function handleCanvasClick(wx, wy) {
  const isStartOrExit = state.activeTool === 'start' || state.activeTool === 'stairs' || state.activeTool === 'exit';
  const tile = worldToTile(wx, wy, isStartOrExit);
  if (!tile) return;
  const [col, row] = tile;
  const room = findRoomAtTile(col, row);
  const roomId = room ? room.id : '';

  if (state.activeTool === 'select') {
    const entity = findEntityAt(col, row);
    state.selectedEntity = entity;
    updateInspectorUI();
    render();
    return;
  }

  if (state.activeTool === 'erase') {
    recordHistory();
    const entity = findEntityAt(col, row);
    if (entity) {
      deleteEntity(entity.type, entity.index);
    }
    render();
    return;
  }

  recordHistory();

  if (state.activeTool === 'door') {
    const edge = detectDoorEdge(wx, wy);
    if (!edge) return;

    // Check if door already exists on this edge
    const existingIdx = state.quest.doors.findIndex(d =>
      (d.from[0] === edge.from[0] && d.from[1] === edge.from[1] && d.to[0] === edge.to[0] && d.to[1] === edge.to[1]) ||
      (d.from[0] === edge.to[0] && d.from[1] === edge.to[1] && d.to[0] === edge.from[0] && d.to[1] === edge.from[1])
    );

    if (existingIdx >= 0) {
      // Select it or toggle closed/open/secret
      state.selectedEntity = { type: 'door', index: existingIdx, data: state.quest.doors[existingIdx] };
      updateInspectorUI();
    } else {
      const isSecret = state.subtool.doorType === 'secret';
      const isOpen = state.subtool.doorType === 'wood-open';
      const newDoor = {
        id: `door-${state.quest.doors.length + 1}`,
        from: edge.from,
        to: edge.to,
        state: isOpen ? 'open' : 'closed',
        is_secret: isSecret,
        room: edge.room || ''
      };
      state.quest.doors.push(newDoor);
      state.selectedEntity = { type: 'door', index: state.quest.doors.length - 1, data: newDoor };
      updateInspectorUI();
      updateEntitySummaryList();
    }
  } else if (state.activeTool === 'monster') {
    // Validation Rule: Characters and enemies cannot stand on furniture in HeroQuest
    const furnAtTile = findFurnitureAtTile(col, row);
    if (furnAtTile) {
      showToast(`⚠️ Characters and enemies cannot stand on furniture in HeroQuest! Tile [${col}, ${row}] is occupied by ${furnAtTile.name || furnAtTile.type}.`, 'error');
      return;
    }

    const type = state.subtool.monsterType;
    const def = MONSTER_DEFS[type] || MONSTER_DEFS.goblin;
    const newMon = {
      id: `mon-${type}-${state.quest.monsters.length + 1}`,
      name: def.name,
      type: type,
      bp: def.bp,
      mp: def.mp,
      atk: def.atk,
      def: def.def,
      move: def.move,
      pos: [col, row],
      roomId: roomId,
      isBoss: def.isBoss,
      isUndead: def.isUndead,
      isSpellcaster: def.isCaster
    };
    state.quest.monsters.push(newMon);
    state.selectedEntity = { type: 'monster', index: state.quest.monsters.length - 1, data: newMon };
    updateInspectorUI();
    updateEntitySummaryList();
  } else if (state.activeTool === 'furniture') {
    const def = FURNITURE_DEFS[state.subtool.furnitureType] || { w: 1, h: 1, name: 'Furniture' };
    const w = state.subtool.furnitureRotated ? def.h : def.w;
    const h = state.subtool.furnitureRotated ? def.w : def.h;

    // Validation Rule: Characters and enemies cannot stand on furniture in HeroQuest
    const overlappingMon = state.quest.monsters.find(m =>
      m.pos[0] >= col && m.pos[0] < col + w &&
      m.pos[1] >= row && m.pos[1] < row + h
    );
    if (overlappingMon) {
      showToast(`⚠️ Characters and enemies cannot stand on furniture in HeroQuest! Cannot place ${def.name} on ${overlappingMon.name} at [${overlappingMon.pos[0]}, ${overlappingMon.pos[1]}].`, 'error');
      return;
    }

    const newFurn = {
      id: `furn-${state.subtool.furnitureType}-${state.quest.furniture.length + 1}`,
      name: def.name,
      type: state.subtool.furnitureType,
      x: col,
      y: row,
      width: w,
      height: h,
      roomId: roomId,
      treasure: ''
    };
    state.quest.furniture.push(newFurn);
    state.selectedEntity = { type: 'furniture', index: state.quest.furniture.length - 1, data: newFurn };
    updateInspectorUI();
    updateEntitySummaryList();
  } else if (state.activeTool === 'trap') {
    const newTrap = {
      id: `trap-${state.subtool.trapType}-${state.quest.traps.length + 1}`,
      type: state.subtool.trapType,
      x: col,
      y: row,
      damage: state.subtool.trapType === 'falling_rock' ? 2 : 1,
      detected: false,
      disarmed: false
    };
    state.quest.traps.push(newTrap);
    state.selectedEntity = { type: 'trap', index: state.quest.traps.length - 1, data: newTrap };
    updateInspectorUI();
    updateEntitySummaryList();
  } else if (state.activeTool === 'wall-block') {
    const isDoubleH = state.subtool.wallBlockType === 'double-h';
    const isDoubleV = state.subtool.wallBlockType === 'double-v';
    const newBlock = {
      id: `block-${state.quest.wallBlocks.length + 1}`,
      type: state.subtool.wallBlockType,
      x: col,
      y: row,
      width: isDoubleH ? 2 : 1,
      height: isDoubleV ? 2 : 1
    };
    state.quest.wallBlocks.push(newBlock);
    state.selectedEntity = { type: 'wall-block', index: state.quest.wallBlocks.length - 1, data: newBlock };
    updateInspectorUI();
    updateEntitySummaryList();
  } else if (state.activeTool === 'start' || state.activeTool === 'stairs') {
    const stairFurn = state.quest.furniture.find(f =>
      f.type.includes('stair') &&
      col >= f.x && col < f.x + (f.width || 1) &&
      row >= f.y && row < f.y + (f.height || 1)
    );
    if (stairFurn) {
      state.quest.startingStair = [stairFurn.x, stairFurn.y];
      state.quest.startingStairType = stairFurn.type;
      state.selectedEntity = { type: 'furniture', index: state.quest.furniture.indexOf(stairFurn), data: stairFurn };
      showToast(`🪜 Starting entrance set to ${stairFurn.name || 'stairs'} at [${stairFurn.x}, ${stairFurn.y}]`, 'success');
    } else {
      state.quest.startingStair = [col, row];
      state.selectedEntity = { type: 'start', index: 0, data: state.quest.startingStair };
      showToast(`🪜 Starting entrance placed at [${col}, ${row}]${isBorderTile(col, row) ? ' (Border Tile)' : ''}`, 'success');
    }
    updateStartSuboptsUI();
    updateInspectorUI();
    updateEntitySummaryList();
  } else if (state.activeTool === 'exit') {
    const stairFurn = state.quest.furniture.find(f =>
      f.type.includes('stair') &&
      col >= f.x && col < f.x + (f.width || 1) &&
      row >= f.y && row < f.y + (f.height || 1)
    );
    if (stairFurn) {
      state.quest.exitTile = [stairFurn.x, stairFurn.y];
      state.quest.exitStairType = stairFurn.type;
      state.selectedEntity = { type: 'furniture', index: state.quest.furniture.indexOf(stairFurn), data: stairFurn };
      showToast(`🏁 Quest exit set to ${stairFurn.name || 'stairs'} at [${stairFurn.x}, ${stairFurn.y}]`, 'success');
    } else {
      state.quest.exitTile = [col, row];
      state.selectedEntity = { type: 'exit', index: 0, data: state.quest.exitTile };
      showToast(`🏁 Exit tile placed at [${col}, ${row}]${isBorderTile(col, row) ? ' (Border Tile)' : ''}`, 'success');
    }
    updateExitSuboptsUI();
    updateInspectorUI();
    updateEntitySummaryList();
  } else if (state.activeTool === 'note') {
    const mark = state.subtool.noteMarker || `Note ${String.fromCharCode(65 + state.quest.storyTriggers.length)}`;
    const newTrigger = {
      id: `trigger-${mark.toLowerCase().replace(/\s+/g, '-')}`,
      marker: mark,
      title: `${mark} Encounter`,
      narrative: 'Stop. Do not draw a card. As your hand reaches into the shadows...',
      tile: [col, row],
      room: roomId
    };
    state.quest.storyTriggers.push(newTrigger);
    state.selectedEntity = { type: 'note', index: state.quest.storyTriggers.length - 1, data: newTrigger };
    updateInspectorUI();
    updateEntitySummaryList();
  }

  runValidation();
  render();
}

function deleteEntity(type, index) {
  if (type === 'monster') {
    state.quest.monsters.splice(index, 1);
  } else if (type === 'door') {
    state.quest.doors.splice(index, 1);
  } else if (type === 'furniture') {
    const f = state.quest.furniture[index];
    if (f) {
      if (state.quest.startingStair && (
        (state.quest.startingStair[0] === f.x && state.quest.startingStair[1] === f.y) ||
        (state.quest.startingStair[0] >= f.x && state.quest.startingStair[0] < f.x + (f.width || 1) &&
         state.quest.startingStair[1] >= f.y && state.quest.startingStair[1] < f.y + (f.height || 1))
      )) {
        state.quest.startingStair = [0, 1];
        state.quest.startingStairType = 'stairs_up_1x1';
        updateStartSuboptsUI();
      }
      if (state.quest.exitTile && (
        (state.quest.exitTile[0] === f.x && state.quest.exitTile[1] === f.y) ||
        (state.quest.exitTile[0] >= f.x && state.quest.exitTile[0] < f.x + (f.width || 1) &&
         state.quest.exitTile[1] >= f.y && state.quest.exitTile[1] < f.y + (f.height || 1))
      )) {
        state.quest.exitTile = null;
        state.quest.exitStairType = 'stairs_down_1x1';
        updateExitSuboptsUI();
      }
    }
    state.quest.furniture.splice(index, 1);
  } else if (type === 'trap') {
    state.quest.traps.splice(index, 1);
  } else if (type === 'wall-block') {
    state.quest.wallBlocks.splice(index, 1);
  } else if (type === 'note') {
    state.quest.storyTriggers.splice(index, 1);
  } else if (type === 'stairs' || type === 'start') {
    state.quest.startingStair = null;
    updateStartSuboptsUI();
  } else if (type === 'exit') {
    state.quest.exitTile = null;
    updateExitSuboptsUI();
  }
  state.selectedEntity = null;
  updateInspectorUI();
  updateEntitySummaryList();
  runValidation();
  render();
}

// -------------------------------------------------------------
// Sidebar & Inspector UI Synchronization
// -------------------------------------------------------------
function switchSidebarTab(tabId) {
  dom.sideTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  dom.sidebarContents.forEach(c => c.classList.toggle('active', c.id === tabId));
}

function syncQuestMetaInputs() {
  dom.inputQuestTitle.value = state.quest.title;
  dom.inputQuestSlug.value = state.quest.slug;
  dom.selectWanderingMonster.value = state.quest.wanderingMonster;
  dom.inputGoldBounty.value = state.quest.goldBounty;
  dom.textareaQuestBriefing.value = state.quest.briefing;
  dom.infoQuestTitle.textContent = state.quest.title;
}

function updateInspectorUI() {
  if (!state.selectedEntity) {
    dom.inspectorEmpty.style.display = 'block';
    dom.inspectorForm.style.display = 'none';
    return;
  }

  dom.inspectorEmpty.style.display = 'none';
  dom.inspectorForm.style.display = 'block';

  // Hide all specific inspect groups
  [
    dom.inspectGroupMonster,
    dom.inspectGroupDoor,
    dom.inspectGroupFurniture,
    dom.inspectGroupTrap,
    dom.inspectGroupNote
  ].forEach(el => { el.style.display = 'none'; });

  const { type, index } = state.selectedEntity;
  dom.inspectTypeBadge.textContent = type.toUpperCase();

  if (type === 'monster') {
    const m = state.quest.monsters[index];
    if (!m) return;
    dom.inspectPosText.textContent = `[${m.pos[0]}, ${m.pos[1]}]`;
    dom.inspectName.value = m.name;
    dom.inspectMonsterBp.value = m.bp;
    dom.inspectMonsterMp.value = m.mp;
    dom.inspectMonsterAtk.value = m.atk;
    dom.inspectMonsterDef.value = m.def;
    dom.inspectMonsterMove.value = m.move;
    dom.inspectMonsterIsBoss.checked = m.isBoss;
    dom.inspectMonsterIsUndead.checked = m.isUndead;
    dom.inspectMonsterIsCaster.checked = m.isSpellcaster;
    dom.inspectGroupMonster.style.display = 'block';
  } else if (type === 'door') {
    const d = state.quest.doors[index];
    if (!d) return;
    dom.inspectPosText.textContent = `[${d.from[0]},${d.from[1]}] ↔ [${d.to[0]},${d.to[1]}]`;
    dom.inspectName.value = d.id;
    dom.inspectDoorState.value = d.state || 'closed';
    dom.inspectDoorSecret.checked = d.is_secret;
    dom.inspectGroupDoor.style.display = 'block';
  } else if (type === 'furniture') {
    const f = state.quest.furniture[index];
    if (!f) return;
    dom.inspectPosText.textContent = `[${f.x}, ${f.y}]`;
    dom.inspectName.value = f.name;
    dom.inspectFurnDims.textContent = `${f.width} × ${f.height}`;
    dom.inspectFurnTreasure.value = f.treasure || '';
    dom.inspectGroupFurniture.style.display = 'block';

    if (dom.inspectFurnStairRole) {
      const isStair = f.type && (f.type.includes('stair') || f.type.includes('stairs'));
      if (isStair) {
        dom.inspectFurnStairRole.style.display = 'block';
        const isStart = state.quest.startingStair && (
          (state.quest.startingStair[0] === f.x && state.quest.startingStair[1] === f.y) ||
          (state.quest.startingStair[0] >= f.x && state.quest.startingStair[0] < f.x + (f.width || 1) &&
           state.quest.startingStair[1] >= f.y && state.quest.startingStair[1] < f.y + (f.height || 1))
        );
        const isExit = state.quest.exitTile && (
          (state.quest.exitTile[0] === f.x && state.quest.exitTile[1] === f.y) ||
          (state.quest.exitTile[0] >= f.x && state.quest.exitTile[0] < f.x + (f.width || 1) &&
           state.quest.exitTile[1] >= f.y && state.quest.exitTile[1] < f.y + (f.height || 1))
        );
        if (isStart) {
          dom.inspectFurnStairStatus.innerHTML = '<span style="color:#38bdf8; font-weight:600;">🪜 Active Starting Entrance</span>';
          if (dom.btnFurnClearRole) dom.btnFurnClearRole.style.display = 'inline-block';
          if (dom.btnFurnMakeStart) dom.btnFurnMakeStart.style.display = 'none';
          if (dom.btnFurnMakeExit) dom.btnFurnMakeExit.style.display = 'inline-block';
        } else if (isExit) {
          dom.inspectFurnStairStatus.innerHTML = '<span style="color:#34d399; font-weight:600;">🏁 Active Quest Exit</span>';
          if (dom.btnFurnClearRole) dom.btnFurnClearRole.style.display = 'inline-block';
          if (dom.btnFurnMakeStart) dom.btnFurnMakeStart.style.display = 'inline-block';
          if (dom.btnFurnMakeExit) dom.btnFurnMakeExit.style.display = 'none';
        } else {
          dom.inspectFurnStairStatus.innerHTML = '<span style="color:#94a3b8;">Standard map piece</span>';
          if (dom.btnFurnClearRole) dom.btnFurnClearRole.style.display = 'none';
          if (dom.btnFurnMakeStart) dom.btnFurnMakeStart.style.display = 'inline-block';
          if (dom.btnFurnMakeExit) dom.btnFurnMakeExit.style.display = 'inline-block';
        }
      } else {
        dom.inspectFurnStairRole.style.display = 'none';
      }
    }
  } else if (type === 'trap') {
    const tr = state.quest.traps[index];
    if (!tr) return;
    dom.inspectPosText.textContent = `[${tr.x}, ${tr.y}]`;
    dom.inspectName.value = tr.id;
    dom.inspectTrapDmg.value = tr.damage;
    dom.inspectGroupTrap.style.display = 'block';
  } else if (type === 'note') {
    const st = state.quest.storyTriggers[index];
    if (!st) return;
    dom.inspectPosText.textContent = `[${st.tile[0]}, ${st.tile[1]}]`;
    dom.inspectName.value = st.marker;
    dom.inspectNoteMarker.value = st.marker;
    dom.inspectNoteTitle.value = st.title;
    dom.inspectNoteNarrative.value = st.narrative;
    dom.inspectGroupNote.style.display = 'block';
  } else if (type === 'start' || type === 'stairs') {
    const pos = state.quest.startingStair || [0, 1];
    const isBorder = isBorderTile(pos[0], pos[1]);
    dom.inspectPosText.textContent = `[${pos[0]}, ${pos[1]}]${isBorder ? ' (Border Tile - Entrance)' : ''}`;
    dom.inspectName.value = 'Starting Entrance / Staircase';
  } else if (type === 'exit') {
    const pos = state.quest.exitTile || [0, 0];
    const isBorder = isBorderTile(pos[0], pos[1]);
    dom.inspectPosText.textContent = `[${pos[0]}, ${pos[1]}]${isBorder ? ' (Border Tile - Escape Hatch)' : ''}`;
    dom.inspectName.value = 'Quest Exit / Escape Staircase';
  } else if (type === 'wall-block') {
    const wb = state.quest.wallBlocks[index];
    if (!wb) return;
    dom.inspectPosText.textContent = `[${wb.x}, ${wb.y}]`;
    dom.inspectName.value = wb.id;
  }
}

function updateEntitySummaryList() {
  const list = dom.entitySummaryList;
  list.innerHTML = '';

  let totalCount = 0;

  // Starting Entrance
  if (state.quest.startingStair) {
    totalCount++;
    const [sc, sr] = state.quest.startingStair;
    const isBorder = isBorderTile(sc, sr);
    const item = document.createElement('div');
    item.className = 'entity-summary-item';
    item.innerHTML = `
      <div class="entity-item-main">
        <span class="entity-item-icon">🪜</span>
        <div>
          <div class="entity-item-name">Starting Entrance / Stairs</div>
          <div class="entity-item-pos">[${sc}, ${sr}] ${isBorder ? '• Border Entrance' : ''}</div>
        </div>
      </div>
      <button class="btn btn-sm btn-danger btn-del-entity">🗑️</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-entity')) {
        recordHistory();
        deleteEntity('start', 0);
      } else {
        state.selectedEntity = { type: 'start', index: 0, data: state.quest.startingStair };
        switchSidebarTab('tab-entity-inspector');
        updateInspectorUI();
        render();
      }
    });
    list.appendChild(item);
  }

  // Quest Exit
  if (state.quest.exitTile) {
    totalCount++;
    const [ec, er] = state.quest.exitTile;
    const isBorder = isBorderTile(ec, er);
    const item = document.createElement('div');
    item.className = 'entity-summary-item';
    item.innerHTML = `
      <div class="entity-item-main">
        <span class="entity-item-icon">🏁</span>
        <div>
          <div class="entity-item-name">Quest Exit Staircase</div>
          <div class="entity-item-pos">[${ec}, ${er}] ${isBorder ? '• Border Exit' : ''}</div>
        </div>
      </div>
      <button class="btn btn-sm btn-danger btn-del-entity">🗑️</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-entity')) {
        recordHistory();
        deleteEntity('exit', 0);
      } else {
        state.selectedEntity = { type: 'exit', index: 0, data: state.quest.exitTile };
        switchSidebarTab('tab-entity-inspector');
        updateInspectorUI();
        render();
      }
    });
    list.appendChild(item);
  }

  // Monsters
  state.quest.monsters.forEach((m, idx) => {
    totalCount++;
    const item = document.createElement('div');
    item.className = 'entity-summary-item';
    item.innerHTML = `
      <div class="entity-item-main">
        <span class="entity-item-icon">👾</span>
        <div>
          <div class="entity-item-name">${m.name}</div>
          <div class="entity-item-pos">[${m.pos[0]}, ${m.pos[1]}] ${m.isBoss ? '• Boss' : ''}</div>
        </div>
      </div>
      <button class="btn btn-sm btn-danger btn-del-entity">🗑️</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-entity')) {
        recordHistory();
        deleteEntity('monster', idx);
      } else {
        state.selectedEntity = { type: 'monster', index: idx, data: m };
        switchSidebarTab('tab-entity-inspector');
        updateInspectorUI();
        render();
      }
    });
    list.appendChild(item);
  });

  // Doors
  state.quest.doors.forEach((d, idx) => {
    totalCount++;
    const item = document.createElement('div');
    item.className = 'entity-summary-item';
    const isSecret = !!d.is_secret;
    const isOpen = d.state === 'open';
    const badgeCls = isSecret ? (isOpen ? 'door-badge-secret-open' : 'door-badge-secret') : (isOpen ? 'door-badge-open' : 'door-badge-closed');
    const badgeText = isSecret ? (isOpen ? 'SECRET [OPEN]' : 'SECRET') : (isOpen ? 'OPEN' : 'CLOSED');
    const doorIcon = isSecret ? '🔮' : (isOpen ? '🚪🔓' : '🚪🔒');
    item.innerHTML = `
      <div class="entity-item-main">
        <span class="entity-item-icon">${doorIcon}</span>
        <div>
          <div class="entity-item-name">
            ${isSecret ? 'Secret Door' : 'Wood Door'}
            <span class="door-status-pill ${badgeCls}">${badgeText}</span>
          </div>
          <div class="entity-item-pos">[${d.from[0]},${d.from[1]}] ↔ [${d.to[0]},${d.to[1]}]</div>
        </div>
      </div>
      <button class="btn btn-sm btn-danger btn-del-entity" title="Delete Door">🗑️</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-entity')) {
        recordHistory();
        deleteEntity('door', idx);
      } else {
        state.selectedEntity = { type: 'door', index: idx, data: d };
        switchSidebarTab('tab-entity-inspector');
        updateInspectorUI();
        render();
      }
    });
    list.appendChild(item);
  });

  // Furniture
  state.quest.furniture.forEach((f, idx) => {
    totalCount++;
    const item = document.createElement('div');
    item.className = 'entity-summary-item';
    item.innerHTML = `
      <div class="entity-item-main">
        <span class="entity-item-icon">🪑</span>
        <div>
          <div class="entity-item-name">${f.name}</div>
          <div class="entity-item-pos">[${f.x}, ${f.y}] (${f.width}×${f.height})</div>
        </div>
      </div>
      <button class="btn btn-sm btn-danger btn-del-entity">🗑️</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-entity')) {
        recordHistory();
        deleteEntity('furniture', idx);
      } else {
        state.selectedEntity = { type: 'furniture', index: idx, data: f };
        switchSidebarTab('tab-entity-inspector');
        updateInspectorUI();
        render();
      }
    });
    list.appendChild(item);
  });

  // Traps
  state.quest.traps.forEach((tr, idx) => {
    totalCount++;
    const item = document.createElement('div');
    item.className = 'entity-summary-item';
    item.innerHTML = `
      <div class="entity-item-main">
        <span class="entity-item-icon">⚠️</span>
        <div>
          <div class="entity-item-name">${tr.type} Trap (${tr.damage} BP)</div>
          <div class="entity-item-pos">[${tr.x}, ${tr.y}]</div>
        </div>
      </div>
      <button class="btn btn-sm btn-danger btn-del-entity">🗑️</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-entity')) {
        recordHistory();
        deleteEntity('trap', idx);
      } else {
        state.selectedEntity = { type: 'trap', index: idx, data: tr };
        switchSidebarTab('tab-entity-inspector');
        updateInspectorUI();
        render();
      }
    });
    list.appendChild(item);
  });

  // Notes
  state.quest.storyTriggers.forEach((st, idx) => {
    totalCount++;
    const item = document.createElement('div');
    item.className = 'entity-summary-item';
    item.innerHTML = `
      <div class="entity-item-main">
        <span class="entity-item-icon">📜</span>
        <div>
          <div class="entity-item-name">${st.marker}: ${st.title}</div>
          <div class="entity-item-pos">[${st.tile[0]}, ${st.tile[1]}]</div>
        </div>
      </div>
      <button class="btn btn-sm btn-danger btn-del-entity">🗑️</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-entity')) {
        recordHistory();
        deleteEntity('note', idx);
      } else {
        state.selectedEntity = { type: 'note', index: idx, data: st };
        switchSidebarTab('tab-entity-inspector');
        updateInspectorUI();
        render();
      }
    });
    list.appendChild(item);
  });

  dom.badgeEntityCount.textContent = totalCount;
}

// -------------------------------------------------------------
// Error Validation Engine (HeroQuest Placement Rules)
// -------------------------------------------------------------
function validateQuest(quest, blockmap) {
  const errors = [];
  if (!quest) {
    return {
      valid: true,
      totalErrors: 0,
      errors: [],
      counts: { all: 0, furniture_bounds: 0, door_wall: 0, overlap: 0 }
    };
  }

  // Room lookup helper
  function getRoomAt(col, row) {
    if (!blockmap || !blockmap.rooms) return null;
    for (const r of blockmap.rooms) {
      if (r.tiles) {
        if (r.tiles.some(t => t[0] === col && t[1] === row)) return r;
      } else if (r.x !== undefined) {
        if (col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h) return r;
      }
    }
    return null;
  }

  // -------------------------------------------------------------
  // Rule 1: Furniture outside of bounds of single room
  // -------------------------------------------------------------
  if (Array.isArray(quest.furniture)) {
    quest.furniture.forEach((f, idx) => {
      const w = f.width || 1;
      const h = f.height || 1;
      const furnName = f.name || f.type || 'Furniture';
      const tiles = [];
      const roomsEncountered = new Map();
      const corridorTiles = [];

      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          const col = f.x + dx;
          const row = f.y + dy;
          tiles.push([col, row]);
          const room = getRoomAt(col, row);
          if (!room) {
            corridorTiles.push([col, row]);
          } else {
            if (!roomsEncountered.has(room.id)) {
              roomsEncountered.set(room.id, { room, tiles: [] });
            }
            roomsEncountered.get(room.id).tiles.push([col, row]);
          }
        }
      }

      // 1a: Extends into corridor / void outside room
      if (corridorTiles.length > 0) {
        const corrStr = corridorTiles.map(t => `[${t[0]}, ${t[1]}]`).join(', ');
        errors.push({
          id: `furn-bounds-corr-${f.id || idx}`,
          category: 'furniture_bounds',
          categoryLabel: 'Furniture Bounds',
          icon: '🪑',
          title: `${furnName} Outside Room Bounds`,
          description: `${furnName} at [${f.x}, ${f.y}] (${w}×${h}) extends outside room boundaries into corridor or void at tile${corridorTiles.length > 1 ? 's' : ''} ${corrStr}.`,
          tiles: corridorTiles,
          allTiles: tiles,
          entityType: 'furniture',
          entityIndex: idx,
          entityId: f.id || null,
          anchor: [f.x, f.y]
        });
      }

      // 1b: Straddles multiple rooms
      if (roomsEncountered.size > 1) {
        const roomNames = Array.from(roomsEncountered.values()).map(r => r.room.name || r.room.id).join(' and ');
        errors.push({
          id: `furn-bounds-multi-${f.id || idx}`,
          category: 'furniture_bounds',
          categoryLabel: 'Furniture Bounds',
          icon: '🪑',
          title: `${furnName} Straddles Multiple Rooms`,
          description: `${furnName} at [${f.x}, ${f.y}] (${w}×${h}) straddles multiple rooms (${roomNames}). Furniture must reside strictly within a single room.`,
          tiles: tiles,
          allTiles: tiles,
          entityType: 'furniture',
          entityIndex: idx,
          entityId: f.id || null,
          anchor: [f.x, f.y]
        });
      }
    });
  }

  // -------------------------------------------------------------
  // Rule 2: Door not on wall of room
  // -------------------------------------------------------------
  if (Array.isArray(quest.doors)) {
    quest.doors.forEach((d, idx) => {
      const from = d.from;
      const to = d.to;
      if (!from || !to) return;

      const r1 = getRoomAt(from[0], from[1]);
      const r2 = getRoomAt(to[0], to[1]);
      const doorName = d.is_secret ? 'Secret Door' : (d.state === 'open' ? 'Open Door' : 'Door');
      const doorId = d.id || idx;

      // In HeroQuest, a door connects a room to a corridor or connects two rooms.
      // Invalid: Both sides are corridors (!r1 && !r2) or both sides are in the same room (r1 && r2 && r1.id === r2.id)
      if (!r1 && !r2) {
        errors.push({
          id: `door-wall-corridor-${doorId}`,
          category: 'door_wall',
          categoryLabel: 'Door Wall',
          icon: '🚪',
          title: `${doorName} Floating in Corridor`,
          description: `${doorName} between [${from[0]}, ${from[1]}] and [${to[0]}, ${to[1]}] is not attached to any room perimeter wall (both sides are corridors).`,
          tiles: [from, to],
          allTiles: [from, to],
          entityType: 'door',
          entityIndex: idx,
          entityId: d.id || null,
          doorEdge: { from, to },
          anchor: from
        });
      } else if (r1 && r2 && r1.id === r2.id) {
        const roomName = r1.name || r1.id;
        errors.push({
          id: `door-wall-interior-${doorId}`,
          category: 'door_wall',
          categoryLabel: 'Door Wall',
          icon: '🚪',
          title: `${doorName} Inside Room Floor`,
          description: `${doorName} between [${from[0]}, ${from[1]}] and [${to[0]}, ${to[1]}] is placed inside open floor space within ${roomName} instead of on its perimeter wall.`,
          tiles: [from, to],
          allTiles: [from, to],
          entityType: 'door',
          entityIndex: idx,
          entityId: d.id || null,
          doorEdge: { from, to },
          anchor: from
        });
      }
    });
  }

  // -------------------------------------------------------------
  // Rule 3: Objects on top of each other
  // -------------------------------------------------------------
  const tileOccupants = new Map();
  function addOccupant(col, row, item) {
    const key = `${col},${row}`;
    if (!tileOccupants.has(key)) {
      tileOccupants.set(key, []);
    }
    tileOccupants.get(key).push(item);
  }

  // Furniture footprints
  if (Array.isArray(quest.furniture)) {
    quest.furniture.forEach((f, idx) => {
      const w = f.width || 1;
      const h = f.height || 1;
      const name = f.name || f.type || 'Furniture';
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          addOccupant(f.x + dx, f.y + dy, {
            type: 'furniture',
            index: idx,
            id: f.id || null,
            name,
            x: f.x + dx,
            y: f.y + dy,
            rootX: f.x,
            rootY: f.y,
            width: w,
            height: h
          });
        }
      }
    });
  }

  // Monsters
  if (Array.isArray(quest.monsters)) {
    quest.monsters.forEach((m, idx) => {
      const name = m.name || m.type || 'Monster';
      const mx = m.x !== undefined ? m.x : (m.pos ? m.pos[0] : 0);
      const my = m.y !== undefined ? m.y : (m.pos ? m.pos[1] : 0);
      addOccupant(mx, my, {
        type: 'monster',
        index: idx,
        id: m.id || null,
        name,
        x: mx,
        y: my
      });
    });
  }

  // Wall Blocks
  if (Array.isArray(quest.wallBlocks)) {
    quest.wallBlocks.forEach((b, idx) => {
      addOccupant(b.x, b.y, {
        type: 'wall-block',
        index: idx,
        id: b.id || null,
        name: 'Wall Block',
        x: b.x,
        y: b.y
      });
    });
  }

  // Traps
  if (Array.isArray(quest.traps)) {
    quest.traps.forEach((t, idx) => {
      addOccupant(t.x, t.y, {
        type: 'trap',
        index: idx,
        id: t.id || null,
        name: `Trap (${t.type || 'pit'})`,
        x: t.x,
        y: t.y
      });
    });
  }

  // Check tile collisions
  for (const [key, occupants] of tileOccupants.entries()) {
    if (occupants.length <= 1) continue;
    const [col, row] = key.split(',').map(Number);

    for (let i = 0; i < occupants.length; i++) {
      for (let j = i + 1; j < occupants.length; j++) {
        const o1 = occupants[i];
        const o2 = occupants[j];

        let title = `Object Collision at [${col}, ${row}]`;
        let desc = '';
        let primaryEntity = o2;

        if (o1.type === 'furniture' && o2.type === 'monster') {
          title = `Monster on Furniture at [${col}, ${row}]`;
          desc = `HeroQuest rule violation: ${o2.name} is standing on top of ${o1.name}. Characters and enemies cannot stand on furniture.`;
          primaryEntity = o2;
        } else if (o1.type === 'monster' && o2.type === 'furniture') {
          title = `Monster on Furniture at [${col}, ${row}]`;
          desc = `HeroQuest rule violation: ${o1.name} is standing on top of ${o2.name}. Characters and enemies cannot stand on furniture.`;
          primaryEntity = o1;
        } else if (o1.type === 'monster' && o2.type === 'monster') {
          title = `Monsters Colliding at [${col}, ${row}]`;
          desc = `Multiple monsters (${o1.name} and ${o2.name}) are placed on the exact same tile [${col}, ${row}].`;
          primaryEntity = o2;
        } else if (o1.type === 'furniture' && o2.type === 'furniture') {
          title = `Furniture Overlap at [${col}, ${row}]`;
          desc = `Furniture pieces '${o1.name}' and '${o2.name}' overlap each other at tile [${col}, ${row}].`;
          primaryEntity = o2;
        } else if (o1.type === 'wall-block' || o2.type === 'wall-block') {
          const other = o1.type === 'wall-block' ? o2 : o1;
          title = `Wall Block Overlap at [${col}, ${row}]`;
          desc = `Wall Block is placed on top of ${other.type} '${other.name}' at tile [${col}, ${row}].`;
          primaryEntity = o2;
        } else if (o1.type === 'trap' || o2.type === 'trap') {
          const other = o1.type === 'trap' ? o2 : o1;
          title = `Trap Collision at [${col}, ${row}]`;
          desc = `Trap at [${col}, ${row}] is placed on top of ${other.type} '${other.name}'.`;
          primaryEntity = o2;
        } else {
          title = `Object Collision at [${col}, ${row}]`;
          desc = `${o1.name} and ${o2.name} overlap at tile [${col}, ${row}].`;
        }

        errors.push({
          id: `overlap-${col}-${row}-${o1.type}-${o1.index}-${o2.type}-${o2.index}`,
          category: 'overlap',
          categoryLabel: 'Object Overlap',
          icon: '💥',
          title,
          description: desc,
          tiles: [[col, row]],
          allTiles: [[col, row]],
          entityType: primaryEntity.type,
          entityIndex: primaryEntity.index,
          entityId: primaryEntity.id,
          anchor: [col, row],
          occupants: [o1, o2]
        });
      }
    }
  }

  const counts = {
    all: errors.length,
    furniture_bounds: errors.filter(e => e.category === 'furniture_bounds').length,
    door_wall: errors.filter(e => e.category === 'door_wall').length,
    overlap: errors.filter(e => e.category === 'overlap').length
  };

  return {
    valid: errors.length === 0,
    totalErrors: errors.length,
    errors,
    counts
  };
}

function runValidation() {
  const result = validateQuest(state.quest, state.blockmap);
  const currentFilter = state.validation ? state.validation.activeFilter : 'all';
  state.validation = {
    ...result,
    activeFilter: currentFilter
  };
  renderValidationUI();
  return result;
}

function renderValidationUI() {
  const v = state.validation;
  if (!v) return;

  // 1. Info bar badge
  if (dom.infoValidationBadge) {
    if (v.valid) {
      dom.infoValidationBadge.className = 'info-tag badge-valid';
      dom.infoValidationBadge.innerHTML = '✅ <strong>0 Errors</strong>';
      dom.infoValidationBadge.title = 'Quest layout is valid! Click to view validation panel.';
    } else {
      dom.infoValidationBadge.className = 'info-tag badge-invalid';
      dom.infoValidationBadge.innerHTML = `⚠️ <strong>${v.totalErrors} Error${v.totalErrors > 1 ? 's' : ''}</strong>`;
      dom.infoValidationBadge.title = `${v.totalErrors} validation error${v.totalErrors > 1 ? 's' : ''} detected! Click to view and fix.`;
    }
  }

  // 2. Sidebar Tab Badge
  if (dom.badgeValCount) {
    dom.badgeValCount.textContent = v.totalErrors;
  }

  // 3. Summary Banner
  if (dom.valSummaryBanner) {
    if (v.valid) {
      dom.valSummaryBanner.className = 'val-summary-banner banner-valid';
      if (dom.valSummaryIcon) dom.valSummaryIcon.textContent = '✅';
      if (dom.valSummaryTitle) dom.valSummaryTitle.textContent = 'No Validation Errors';
      if (dom.valSummaryDesc) dom.valSummaryDesc.textContent = 'All furniture, doors, and objects pass HeroQuest board placement rules.';
    } else {
      dom.valSummaryBanner.className = 'val-summary-banner banner-invalid';
      if (dom.valSummaryIcon) dom.valSummaryIcon.textContent = '⚠️';
      if (dom.valSummaryTitle) dom.valSummaryTitle.textContent = `${v.totalErrors} Validation Error${v.totalErrors > 1 ? 's' : ''} Found`;
      if (dom.valSummaryDesc) dom.valSummaryDesc.textContent = 'Offending layout items must be relocated or deleted to conform to HeroQuest rules.';
    }
  }

  // 4. Filter counts
  if (dom.valFilterAllCount) dom.valFilterAllCount.textContent = v.counts.all;
  if (dom.valFilterBoundsCount) dom.valFilterBoundsCount.textContent = v.counts.furniture_bounds;
  if (dom.valFilterDoorCount) dom.valFilterDoorCount.textContent = v.counts.door_wall;
  if (dom.valFilterOverlapCount) dom.valFilterOverlapCount.textContent = v.counts.overlap;

  // 5. Update filter pills active state
  if (dom.filterPills) {
    dom.filterPills.forEach(pill => {
      pill.classList.toggle('active', pill.dataset.filter === v.activeFilter);
    });
  }

  // 6. Errors list
  if (dom.validationErrorsList) {
    dom.validationErrorsList.innerHTML = '';

    const filtered = v.activeFilter === 'all'
      ? v.errors
      : v.errors.filter(e => e.category === v.activeFilter);

    if (v.errors.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'val-empty-state';
      empty.innerHTML = `
        <span class="val-empty-icon">🛡️</span>
        <div class="val-empty-title">Clean Dungeon Layout</div>
        <div class="val-empty-desc">No furniture out of bounds, no floating doors, and no object overlaps detected.</div>
      `;
      dom.validationErrorsList.appendChild(empty);
    } else if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'val-empty-state';
      empty.innerHTML = `
        <span class="val-empty-icon">👌</span>
        <div class="val-empty-title">No Errors in This Category</div>
        <div class="val-empty-desc">All checks for '${v.activeFilter}' passed successfully.</div>
      `;
      dom.validationErrorsList.appendChild(empty);
    } else {
      filtered.forEach(err => {
        const card = document.createElement('div');
        const isFocused = state.focusedErrorId === err.id;
        card.className = `val-error-card ${isFocused ? 'focused' : ''}`;

        const coordStr = err.doorEdge
          ? `[${err.doorEdge.from[0]},${err.doorEdge.from[1]}] ↔ [${err.doorEdge.to[0]},${err.doorEdge.to[1]}]`
          : (err.tiles && err.tiles.length > 1
              ? `Tiles: ${err.tiles.map(t => `[${t[0]},${t[1]}]`).join(' ')}`
              : `Tile: [${err.anchor[0]}, ${err.anchor[1]}]`);

        card.innerHTML = `
          <div class="val-card-header">
            <span class="val-card-title">${err.icon} ${err.title}</span>
            <span class="val-category-pill cat-${err.category}">${err.categoryLabel}</span>
          </div>
          <div class="val-card-desc">${err.description}</div>
          <div class="val-card-footer">
            <span class="val-tile-tag">${coordStr}</span>
            <div class="val-card-actions">
              <button class="btn-val-action btn-val-locate" title="Pan and zoom to view this error">🎯 Locate</button>
              <button class="btn-val-action btn-val-delete" title="Delete offending entity">🗑️ Delete</button>
            </div>
          </div>
        `;

        card.querySelector('.btn-val-locate').addEventListener('click', (e) => {
          e.stopPropagation();
          focusValidationError(err);
        });

        card.querySelector('.btn-val-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteValidationErrorEntity(err);
        });

        card.addEventListener('click', () => {
          focusValidationError(err);
        });

        dom.validationErrorsList.appendChild(card);
      });
    }
  }
}

function focusValidationError(err) {
  state.focusedErrorId = err.id;
  const geom = getGridGeometry();

  // Highlight and select entity if possible
  if (err.entityType === 'furniture' && state.quest.furniture) {
    const idx = err.entityId ? state.quest.furniture.findIndex(f => f.id === err.entityId) : err.entityIndex;
    if (idx >= 0 && idx < state.quest.furniture.length) {
      state.selectedEntity = { type: 'furniture', index: idx, data: state.quest.furniture[idx] };
      updateInspectorUI();
    }
  } else if (err.entityType === 'door' && state.quest.doors) {
    const idx = err.entityId ? state.quest.doors.findIndex(d => d.id === err.entityId) : err.entityIndex;
    if (idx >= 0 && idx < state.quest.doors.length) {
      state.selectedEntity = { type: 'door', index: idx, data: state.quest.doors[idx] };
      updateInspectorUI();
    }
  } else if (err.entityType === 'monster' && state.quest.monsters) {
    const idx = err.entityId ? state.quest.monsters.findIndex(m => m.id === err.entityId) : err.entityIndex;
    if (idx >= 0 && idx < state.quest.monsters.length) {
      state.selectedEntity = { type: 'monster', index: idx, data: state.quest.monsters[idx] };
      updateInspectorUI();
    }
  } else if (err.entityType === 'trap' && state.quest.traps) {
    const idx = err.entityId ? state.quest.traps.findIndex(t => t.id === err.entityId) : err.entityIndex;
    if (idx >= 0 && idx < state.quest.traps.length) {
      state.selectedEntity = { type: 'trap', index: idx, data: state.quest.traps[idx] };
      updateInspectorUI();
    }
  } else if (err.entityType === 'wall-block' && state.quest.wallBlocks) {
    const idx = err.entityId ? state.quest.wallBlocks.findIndex(b => b.id === err.entityId) : err.entityIndex;
    if (idx >= 0 && idx < state.quest.wallBlocks.length) {
      state.selectedEntity = { type: 'wall-block', index: idx, data: state.quest.wallBlocks[idx] };
      updateInspectorUI();
    }
  }

  // Pan & Zoom to center on error anchor tile
  const anchor = err.anchor || (err.tiles && err.tiles[0]) || [0, 0];
  const targetWorld = tileToWorld(anchor[0], anchor[1]);
  const centerX = targetWorld.x + geom.tileSize / 2;
  const centerY = targetWorld.y + geom.tileSize / 2;

  state.zoom = Math.max(state.zoom, 1.25);
  updateZoomUI();

  const vpW = dom.canvas.width;
  const vpH = dom.canvas.height;
  state.panX = vpW / 2 - centerX * state.zoom;
  state.panY = vpH / 2 - centerY * state.zoom;

  renderValidationUI();
  render();
  showToast(`Located: ${err.title}`, 'info');
}

function deleteValidationErrorEntity(err) {
  recordHistory();
  let targetType = err.entityType;
  let targetIndex = err.entityIndex;

  if (targetType === 'furniture' && state.quest.furniture) {
    const idx = err.entityId ? state.quest.furniture.findIndex(f => f.id === err.entityId) : -1;
    if (idx !== -1) targetIndex = idx;
    else if (err.anchor) {
      const idx2 = state.quest.furniture.findIndex(f => f.x === err.anchor[0] && f.y === err.anchor[1]);
      if (idx2 !== -1) targetIndex = idx2;
    }
  } else if (targetType === 'door' && state.quest.doors) {
    const idx = err.entityId ? state.quest.doors.findIndex(d => d.id === err.entityId) : -1;
    if (idx !== -1) targetIndex = idx;
    else if (err.doorEdge) {
      const idx2 = state.quest.doors.findIndex(d =>
        (d.from[0] === err.doorEdge.from[0] && d.from[1] === err.doorEdge.from[1] &&
         d.to[0] === err.doorEdge.to[0] && d.to[1] === err.doorEdge.to[1]) ||
        (d.from[0] === err.doorEdge.to[0] && d.from[1] === err.doorEdge.to[1] &&
         d.to[0] === err.doorEdge.from[0] && d.to[1] === err.doorEdge.from[1])
      );
      if (idx2 !== -1) targetIndex = idx2;
    }
  } else if (targetType === 'monster' && state.quest.monsters) {
    const idx = err.entityId ? state.quest.monsters.findIndex(m => m.id === err.entityId) : -1;
    if (idx !== -1) targetIndex = idx;
    else if (err.anchor) {
      const idx2 = state.quest.monsters.findIndex(m => {
        const mx = m.x !== undefined ? m.x : m.pos?.[0];
        const my = m.y !== undefined ? m.y : m.pos?.[1];
        return mx === err.anchor[0] && my === err.anchor[1];
      });
      if (idx2 !== -1) targetIndex = idx2;
    }
  } else if (targetType === 'trap' && state.quest.traps) {
    const idx = err.entityId ? state.quest.traps.findIndex(t => t.id === err.entityId) : -1;
    if (idx !== -1) targetIndex = idx;
    else if (err.anchor) {
      const idx2 = state.quest.traps.findIndex(t => t.x === err.anchor[0] && t.y === err.anchor[1]);
      if (idx2 !== -1) targetIndex = idx2;
    }
  } else if (targetType === 'wall-block' && state.quest.wallBlocks) {
    const idx = err.entityId ? state.quest.wallBlocks.findIndex(b => b.id === err.entityId) : -1;
    if (idx !== -1) targetIndex = idx;
    else if (err.anchor) {
      const idx2 = state.quest.wallBlocks.findIndex(b => b.x === err.anchor[0] && b.y === err.anchor[1]);
      if (idx2 !== -1) targetIndex = idx2;
    }
  }

  deleteEntity(targetType, targetIndex);
  runValidation();
  showToast(`Deleted invalid ${targetType}`, 'info');
}

function renderValidationCanvasOverlays(ctx, geom) {
  if (!state.validation || !state.validation.errors || state.validation.errors.length === 0) return;

  const ts = geom.tileSize;

  state.validation.errors.forEach(err => {
    const isFocused = state.focusedErrorId === err.id;

    if (err.category === 'door_wall' && err.doorEdge) {
      const edge = err.doorEdge;
      const isVertical = edge.from[0] !== edge.to[0];
      const c = isVertical ? Math.max(edge.from[0], edge.to[0]) : edge.from[0];
      const r = isVertical ? edge.from[1] : Math.max(edge.from[1], edge.to[1]);
      const basePos = tileToWorld(c, r);

      let cx, cy;
      if (isVertical) {
        cx = basePos.x;
        cy = basePos.y + ts / 2;
      } else {
        cx = basePos.x + ts / 2;
        cy = basePos.y;
      }

      ctx.save();
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = isFocused ? 14 : 8;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = isFocused ? 3.0 : 2.0;
      ctx.setLineDash([4, 3]);

      if (isVertical) {
        ctx.strokeRect(cx - 7, cy - ts * 0.42, 14, ts * 0.84);
      } else {
        ctx.strokeRect(cx - ts * 0.42, cy - 7, ts * 0.84, 14);
      }
      ctx.setLineDash([]);

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠️', cx, cy);
      ctx.restore();

    } else {
      const tilesToDraw = (err.tiles && err.tiles.length > 0) ? err.tiles : [[err.anchor[0], err.anchor[1]]];
      tilesToDraw.forEach(tile => {
        const [col, row] = tile;
        const pos = tileToWorld(col, row);

        ctx.save();
        ctx.fillStyle = isFocused ? 'rgba(239, 68, 68, 0.32)' : 'rgba(239, 68, 68, 0.18)';
        ctx.fillRect(pos.x + 1, pos.y + 1, ts - 2, ts - 2);

        ctx.strokeStyle = isFocused ? '#f87171' : '#ef4444';
        ctx.lineWidth = isFocused ? 2.5 : 1.8;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = isFocused ? 12 : 6;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(pos.x + 1.5, pos.y + 1.5, ts - 3, ts - 3);
        ctx.setLineDash([]);

        ctx.shadowBlur = 0;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('⚠️', pos.x + ts - 2, pos.y + 2);
        ctx.restore();
      });
    }
  });
}

// -------------------------------------------------------------
// Voice Assistant Map Setup & Placement Engine
// -------------------------------------------------------------

function getTilesForRoom(room) {
  if (!room) return [];
  if (Array.isArray(room.tiles) && room.tiles.length > 0) {
    return room.tiles.map(t => [t[0], t[1]]);
  }
  const tiles = [];
  const x = room.x !== undefined ? room.x : 0;
  const y = room.y !== undefined ? room.y : 0;
  const w = room.w !== undefined ? room.w : 1;
  const h = room.h !== undefined ? room.h : 1;
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      tiles.push([c, r]);
    }
  }
  return tiles;
}

function getOccupiedTileSet(quest) {
  const set = new Set();
  if (!quest) return set;

  (quest.monsters || []).forEach(m => {
    const x = m.x !== undefined ? m.x : (m.pos ? m.pos[0] : null);
    const y = m.y !== undefined ? m.y : (m.pos ? m.pos[1] : null);
    if (x !== null && y !== null) set.add(`${x},${y}`);
  });

  (quest.furniture || []).forEach(f => {
    const w = f.width || 1;
    const h = f.height || 1;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        set.add(`${f.x + dx},${f.y + dy}`);
      }
    }
  });

  (quest.wallBlocks || []).forEach(wb => {
    set.add(`${wb.x},${wb.y}`);
  });

  (quest.traps || []).forEach(t => {
    set.add(`${t.x},${t.y}`);
  });

  if (quest.startingStair) {
    const [sx, sy] = quest.startingStair;
    const is2x2 = quest.startingStairType && quest.startingStairType.includes('2x2');
    set.add(`${sx},${sy}`);
    if (is2x2) {
      set.add(`${sx + 1},${sy}`);
      set.add(`${sx},${sy + 1}`);
      set.add(`${sx + 1},${sy + 1}`);
    }
  }

  return set;
}

function findTargetRoom(roomSpec, blockmap, currentContext = {}) {
  if (!blockmap || !Array.isArray(blockmap.rooms) || blockmap.rooms.length === 0) {
    return null;
  }
  const rooms = blockmap.rooms;

  // If no room specified, or "this room" / "current room"
  if (!roomSpec || /^(this\s+room|current\s+room|here)$/i.test(roomSpec.trim())) {
    if (currentContext.hoverTile) {
      const rm = rooms.find(r => {
        const tiles = getTilesForRoom(r);
        return tiles.some(t => t[0] === currentContext.hoverTile[0] && t[1] === currentContext.hoverTile[1]);
      });
      if (rm) return rm;
    }
    if (currentContext.selectedEntityRoom) return currentContext.selectedEntityRoom;
    return rooms[0];
  }

  const spec = roomSpec.toLowerCase().trim();

  // Match room number or word, e.g. "room 1", "room #2", "room one"
  const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const numMatch = spec.match(/room\s*#?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  if (numMatch) {
    let n = parseInt(numMatch[1], 10);
    if (isNaN(n)) {
      n = wordMap[numMatch[1].toLowerCase()];
    }
    if (n !== undefined) {
      // 1. Try matching room with name containing Room N
      const matchByName = rooms.find(r => (r.name && new RegExp(`\\broom\\s*#?${n}\\b`, 'i').test(r.name)) || (r.id && new RegExp(`\\b${n}\\b`).test(r.id)));
      if (matchByName) return matchByName;
      // 2. Try 1-based index in rooms array
      if (n >= 1 && n <= rooms.length) {
        return rooms[n - 1];
      }
    }
  }

  // Substring match on name or id
  const cleanSpec = spec.replace(/^(in|to|at|the)\s+/g, '').trim();
  const directMatch = rooms.find(r => {
    const name = (r.name || '').toLowerCase();
    const id = (r.id || '').toLowerCase();
    return name.includes(cleanSpec) || cleanSpec.includes(name) || id.includes(cleanSpec);
  });
  if (directMatch) return directMatch;

  return rooms[0];
}

function findFreeTilesInRoom(room, occupiedSet, count = 1) {
  const roomTiles = getTilesForRoom(room);
  const freeTiles = [];
  for (const [col, row] of roomTiles) {
    if (!occupiedSet.has(`${col},${row}`)) {
      freeTiles.push([col, row]);
      if (freeTiles.length >= count) break;
    }
  }
  return freeTiles;
}

function findFreeRectInRoom(room, w, h, occupiedSet) {
  const roomTiles = getTilesForRoom(room);
  const roomTileSet = new Set(roomTiles.map(t => `${t[0]},${t[1]}`));
  for (const [col, row] of roomTiles) {
    let fits = true;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const key = `${col + dx},${row + dy}`;
        if (!roomTileSet.has(key) || occupiedSet.has(key)) {
          fits = false;
          break;
        }
      }
      if (!fits) break;
    }
    if (fits) {
      return { x: col, y: row };
    }
  }
  return null;
}

function interpretVoiceQuestCommands(spokenText, blockmap, quest, currentContext = {}) {
  if (!spokenText || typeof spokenText !== 'string') return [];

  const WORD_TO_NUM = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    'a couple': 2, 'a couple of': 2, 'a pair': 2, 'a pair of': 2
  };

  const MONSTERS = [
    { type: 'skeleton', keys: ['skeletons', 'skeleton', 'skellies', 'skelly'] },
    { type: 'orc', keys: ['orcs', 'orc'] },
    { type: 'goblin', keys: ['goblins', 'goblin'] },
    { type: 'zombie', keys: ['zombies', 'zombie'] },
    { type: 'mummy', keys: ['mummies', 'mummy'] },
    { type: 'chaos_warrior', keys: ['chaos warriors', 'chaos warrior', 'chaos'] },
    { type: 'fimir', keys: ['fimirs', 'fimir'] },
    { type: 'gargoyle', keys: ['gargoyles', 'gargoyle'] },
    { type: 'boss', keys: ['bosses', 'boss', 'dungeon boss', 'warlord'] }
  ];

  const FURNITURE = [
    { type: 'chest', keys: ['treasure chests', 'treasure chest', 'chests', 'chest'] },
    { type: 'table', keys: ['tables', 'table'] },
    { type: 'bookcase', keys: ['bookcases', 'bookcase'] },
    { type: 'bookshelf', keys: ['bookshelves', 'bookshelf'] },
    { type: 'weapons_rack', keys: ['weapons racks', 'weapons rack', 'weapon racks', 'weapon rack'] },
    { type: 'altar', keys: ['altars', 'altar'] },
    { type: 'alchemists_bench', keys: ['alchemists benches', 'alchemist bench', 'alchemists bench', "alchemist's bench", 'alchemy bench'] },
    { type: 'tomb', keys: ['tombs', 'tomb', 'stone tombs', 'stone tomb', 'sarcophagus'] },
    { type: 'throne', keys: ['thrones', 'throne'] },
    { type: 'cupboard', keys: ['cupboards', 'cupboard'] },
    { type: 'torture_rack', keys: ['torture racks', 'torture rack'] },
    { type: 'fireplace', keys: ['fireplaces', 'fireplace'] },
    { type: 'stairs_up_1x1', keys: ['stairs up', 'staircase up', 'stairs', 'staircase'] },
    { type: 'stairs_down_1x1', keys: ['stairs down', 'staircase down'] }
  ];

  const TRAPS = [
    { type: 'pit', keys: ['pit traps', 'pit trap', 'pits', 'pit'] },
    { type: 'falling_block', keys: ['falling block traps', 'falling block', 'falling rock'] },
    { type: 'spear', keys: ['spear traps', 'spear trap', 'spears', 'spear'] }
  ];

  const DOORS = [
    { type: 'secret', keys: ['secret doors', 'secret door', 'hidden doors', 'hidden door'] },
    { type: 'wood-open', keys: ['open doors', 'open door'] },
    { type: 'wood-closed', keys: ['closed doors', 'closed door', 'doors', 'door'] }
  ];

  const WALL_BLOCKS = [
    { type: 'single', keys: ['wall blocks', 'wall block', 'blocked tiles', 'blocked tile', 'rock blocks', 'rock block'] }
  ];

  const ALL_ENTITIES = [];
  MONSTERS.forEach(m => m.keys.forEach(k => ALL_ENTITIES.push({ category: 'monster', type: m.type, key: k })));
  FURNITURE.forEach(f => f.keys.forEach(k => ALL_ENTITIES.push({ category: 'furniture', type: f.type, key: k })));
  TRAPS.forEach(t => t.keys.forEach(k => ALL_ENTITIES.push({ category: 'trap', type: t.type, key: k })));
  DOORS.forEach(d => d.keys.forEach(k => ALL_ENTITIES.push({ category: 'door', type: d.type, key: k })));
  WALL_BLOCKS.forEach(w => w.keys.forEach(k => ALL_ENTITIES.push({ category: 'wall-block', type: w.type, key: k })));
  ALL_ENTITIES.sort((a, b) => b.key.length - a.key.length);

  const sentences = spokenText.split(/[.!?;\n]+/);
  const commands = [];

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;

    const ROOM_REGEX = /(?:in|to|into|inside|at)\s+(?:the\s+)?(this\s+room|current\s+room|room\s*#?\s*\d+|room\s+[a-z]+|[a-z0-9\s'-]+?(?:room|crypt|hall|chamber|tomb))\b/gi;
    const matches = [...sentence.matchAll(ROOM_REGEX)];
    let clauses = [];

    if (matches.length === 0) {
      clauses = [{ text: sentence, room: 'this room' }];
    } else if (matches.length === 1) {
      const cleanedText = sentence.slice(0, matches[0].index) + ' ' + sentence.slice(matches[0].index + matches[0][0].length);
      clauses = [{ text: cleanedText, room: matches[0][1] }];
    } else {
      let prevEnd = 0;
      for (let i = 0; i < matches.length; i++) {
        const curMatch = matches[i];
        const end = (i < matches.length - 1) ? curMatch.index + curMatch[0].length : sentence.length;
        const rawClause = sentence.substring(prevEnd, end);
        const cleanedText = rawClause.replace(curMatch[0], ' ');
        clauses.push({ text: cleanedText, room: curMatch[1] });
        prevEnd = end;
      }
    }

    for (const clause of clauses) {
      let remaining = clause.text;
      for (const ent of ALL_ENTITIES) {
        const regex = new RegExp(`\\b(?:(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|a\\s+couple(?:\\s+of)?|a\\s+pair(?:\\s+of)?|a|an)\\s+)?${ent.key}\\b`, 'i');
        let m = remaining.match(regex);
        while (m) {
          let count = 1;
          if (m[1]) {
            const numStr = m[1].toLowerCase().trim();
            if (WORD_TO_NUM[numStr] !== undefined) {
              count = WORD_TO_NUM[numStr];
            } else {
              const parsed = parseInt(numStr, 10);
              if (!isNaN(parsed)) count = parsed;
            }
          }
          commands.push({
            category: ent.category,
            type: ent.type,
            count,
            targetRoom: clause.room
          });
          remaining = remaining.replace(m[0], ' ');
          m = remaining.match(regex);
        }
      }
    }
  }

  return commands;
}

function executeVoiceMapCommands(spokenText, guidancePrompt, targetQuest = null, targetBlockmap = null) {
  const currentQuest = targetQuest || state.quest;
  const currentBlockmap = targetBlockmap || state.blockmap;

  if (!currentBlockmap || !Array.isArray(currentBlockmap.rooms) || currentBlockmap.rooms.length === 0) {
    if (typeof showToast === 'function') {
      showToast('⚠️ No active blockmap or rooms available to place items.', 'error');
    }
    return { success: false, placed: [], errors: ['No active blockmap or rooms'] };
  }

  const currentContext = {
    hoverTile: (typeof state !== 'undefined' ? state.hoverTile : null),
    selectedEntity: (typeof state !== 'undefined' ? state.selectedEntity : null)
  };

  const parsed = interpretVoiceQuestCommands(spokenText, currentBlockmap, currentQuest, currentContext);
  if (!parsed || parsed.length === 0) {
    if (typeof showToast === 'function') {
      showToast(`🎙️ No valid map items recognized in: "${spokenText}"`, 'info');
    }
    return { success: false, placed: [], errors: ['No items recognized'] };
  }

  if (typeof recordHistory === 'function') {
    recordHistory();
  }

  const occupiedSet = getOccupiedTileSet(currentQuest);
  const placedSummary = [];

  for (const cmd of parsed) {
    const targetRoom = findTargetRoom(cmd.targetRoom, currentBlockmap, currentContext);
    if (!targetRoom) continue;

    const roomName = targetRoom.name || targetRoom.id || 'Room';
    let placedCount = 0;

    if (cmd.category === 'monster') {
      const def = MONSTER_DEFS[cmd.type] || MONSTER_DEFS.goblin;
      for (let i = 0; i < cmd.count; i++) {
        const freeTiles = findFreeTilesInRoom(targetRoom, occupiedSet, 1);
        if (freeTiles.length === 0) break;
        const [col, row] = freeTiles[0];
        const newMon = {
          id: `mon-${cmd.type}-${(currentQuest.monsters || []).length + 1}`,
          name: def.name,
          type: cmd.type,
          bp: def.bp,
          mp: def.mp,
          atk: def.atk,
          def: def.def,
          move: def.move,
          pos: [col, row],
          x: col,
          y: row,
          roomId: targetRoom.id,
          isBoss: def.isBoss,
          isUndead: def.isUndead,
          isSpellcaster: def.isCaster
        };
        if (!currentQuest.monsters) currentQuest.monsters = [];
        currentQuest.monsters.push(newMon);
        occupiedSet.add(`${col},${row}`);
        placedCount++;
      }
      if (placedCount > 0) {
        placedSummary.push(`${placedCount} ${cmd.type}${placedCount > 1 ? 's' : ''} in ${roomName}`);
      }
    } else if (cmd.category === 'furniture') {
      const def = FURNITURE_DEFS[cmd.type] || { w: 1, h: 1, name: 'Furniture' };
      for (let i = 0; i < cmd.count; i++) {
        let rect = findFreeRectInRoom(targetRoom, def.w, def.h, occupiedSet);
        let w = def.w;
        let h = def.h;
        if (!rect && def.w !== def.h) {
          rect = findFreeRectInRoom(targetRoom, def.h, def.w, occupiedSet);
          if (rect) {
            w = def.h;
            h = def.w;
          }
        }
        if (!rect) break;

        const newFurn = {
          id: `furn-${cmd.type}-${(currentQuest.furniture || []).length + 1}`,
          name: def.name,
          type: cmd.type,
          x: rect.x,
          y: rect.y,
          width: w,
          height: h,
          roomId: targetRoom.id,
          treasure: ''
        };
        if (!currentQuest.furniture) currentQuest.furniture = [];
        currentQuest.furniture.push(newFurn);
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            occupiedSet.add(`${rect.x + dx},${rect.y + dy}`);
          }
        }
        placedCount++;
      }
      if (placedCount > 0) {
        placedSummary.push(`${placedCount} ${def.name}${placedCount > 1 ? 's' : ''} in ${roomName}`);
      }
    } else if (cmd.category === 'trap') {
      for (let i = 0; i < cmd.count; i++) {
        const freeTiles = findFreeTilesInRoom(targetRoom, occupiedSet, 1);
        if (freeTiles.length === 0) break;
        const [col, row] = freeTiles[0];
        const newTrap = {
          id: `trap-${cmd.type}-${(currentQuest.traps || []).length + 1}`,
          type: cmd.type,
          x: col,
          y: row,
          damage: cmd.type === 'falling_block' ? 2 : 1,
          detected: false,
          disarmed: false
        };
        if (!currentQuest.traps) currentQuest.traps = [];
        currentQuest.traps.push(newTrap);
        occupiedSet.add(`${col},${row}`);
        placedCount++;
      }
      if (placedCount > 0) {
        placedSummary.push(`${placedCount} ${cmd.type} trap${placedCount > 1 ? 's' : ''} in ${roomName}`);
      }
    } else if (cmd.category === 'wall-block') {
      for (let i = 0; i < cmd.count; i++) {
        const freeTiles = findFreeTilesInRoom(targetRoom, occupiedSet, 1);
        if (freeTiles.length === 0) break;
        const [col, row] = freeTiles[0];
        const newBlock = {
          id: `block-${(currentQuest.wallBlocks || []).length + 1}`,
          type: 'single',
          x: col,
          y: row,
          width: 1,
          height: 1
        };
        if (!currentQuest.wallBlocks) currentQuest.wallBlocks = [];
        currentQuest.wallBlocks.push(newBlock);
        occupiedSet.add(`${col},${row}`);
        placedCount++;
      }
      if (placedCount > 0) {
        placedSummary.push(`${placedCount} wall block${placedCount > 1 ? 's' : ''} in ${roomName}`);
      }
    } else if (cmd.category === 'door') {
      const roomTiles = getTilesForRoom(targetRoom);
      const roomTileSet = new Set(roomTiles.map(t => `${t[0]},${t[1]}`));
      let doorPlaced = false;
      const existingDoors = currentQuest.doors || [];
      const hasDoorAtEdge = (c1, r1, c2, r2) => {
        return existingDoors.some(d =>
          (d.from[0] === c1 && d.from[1] === r1 && d.to[0] === c2 && d.to[1] === r2) ||
          (d.from[0] === c2 && d.from[1] === r2 && d.to[0] === c1 && d.to[1] === r1)
        );
      };

      for (const [col, row] of roomTiles) {
        const neighbors = [
          [col, row - 1],
          [col, row + 1],
          [col - 1, row],
          [col + 1, row]
        ];
        for (const [nc, nr] of neighbors) {
          if (!roomTileSet.has(`${nc},${nr}`) && !hasDoorAtEdge(col, row, nc, nr)) {
            const geom = (typeof getGridGeometry === 'function') ? getGridGeometry() : {
              cols: currentBlockmap.gridDimensions ? currentBlockmap.gridDimensions[0] : 28,
              rows: currentBlockmap.gridDimensions ? currentBlockmap.gridDimensions[1] : 21
            };
            if (nc >= 0 && nc < geom.cols && nr >= 0 && nr < geom.rows) {
              const newDoor = {
                id: `door-${(currentQuest.doors || []).length + 1}`,
                from: [col, row],
                to: [nc, nr],
                state: cmd.type === 'secret' ? 'secret' : (cmd.type === 'wood-open' ? 'open' : 'closed')
              };
              if (!currentQuest.doors) currentQuest.doors = [];
              currentQuest.doors.push(newDoor);
              doorPlaced = true;
              placedCount++;
              break;
            }
          }
        }
        if (doorPlaced) break;
      }
      if (placedCount > 0) {
        placedSummary.push(`door in ${roomName}`);
      }
    }
  }

  if (typeof runValidation === 'function' && typeof document !== 'undefined') runValidation();
  if (typeof updateEntitySummaryList === 'function' && typeof document !== 'undefined') updateEntitySummaryList();
  if (typeof render === 'function' && typeof document !== 'undefined') render();

  if (placedSummary.length > 0) {
    if (typeof showToast === 'function') {
      showToast(`🎙️ Placed: ${placedSummary.join(', ')}`, 'success');
    }
  } else {
    if (typeof showToast === 'function') {
      showToast('⚠️ No space in room(s) to place requested items.', 'error');
    }
  }

  return {
    success: placedSummary.length > 0,
    placed: placedSummary,
    parsedCommands: parsed
  };
}

// -------------------------------------------------------------
// Resizable Split Dividers
// -------------------------------------------------------------
function setupSplitDividers() {
  if (typeof document === 'undefined') return;

  const dividers = document.querySelectorAll('.split-divider');
  dividers.forEach(divider => {
    let isDragging = false;
    let startX = 0;
    let startSize = 0;
    const targetDirection = divider.getAttribute('data-target') || 'prev';
    const minSize = parseInt(divider.getAttribute('data-min') || '110', 10);
    const maxSize = parseInt(divider.getAttribute('data-max') || '680', 10);

    const onPointerDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      try {
        divider.setPointerCapture(e.pointerId);
      } catch (_) {}
      divider.classList.add('active');
      document.body.classList.add('resizing');

      const targetEl = targetDirection === 'prev' ? divider.previousElementSibling : divider.nextElementSibling;
      if (targetEl) {
        startSize = targetEl.getBoundingClientRect().width;
      }
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const targetEl = targetDirection === 'prev' ? divider.previousElementSibling : divider.nextElementSibling;
      if (!targetEl) return;

      let newSize;
      if (targetDirection === 'prev') {
        newSize = Math.max(minSize, Math.min(maxSize, startSize + deltaX));
      } else {
        newSize = Math.max(minSize, Math.min(maxSize, startSize - deltaX));
      }

      targetEl.style.width = `${newSize}px`;
      targetEl.style.flex = `0 0 ${newSize}px`;

      resizeCanvas();
      render();

      try {
        const storageKey = targetDirection === 'prev' ? 'robos_quest_editor_tool_palette_w' : 'robos_quest_editor_sidebar_right_w';
        localStorage.setItem(storageKey, String(newSize));
      } catch (_) {}
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        divider.releasePointerCapture(e.pointerId);
      } catch (_) {}
      divider.classList.remove('active');
      document.body.classList.remove('resizing');

      resizeCanvas();
      render();
    };

    divider.addEventListener('pointerdown', onPointerDown);
    divider.addEventListener('pointermove', onPointerMove);
    divider.addEventListener('pointerup', onPointerUp);
    divider.addEventListener('pointercancel', onPointerUp);

    // Double-click to reset to default
    divider.addEventListener('dblclick', () => {
      const defaultSize = targetDirection === 'prev' ? 140 : 360;
      const targetEl = targetDirection === 'prev' ? divider.previousElementSibling : divider.nextElementSibling;
      if (targetEl) {
        targetEl.style.width = `${defaultSize}px`;
        targetEl.style.flex = `0 0 ${defaultSize}px`;
        try {
          const storageKey = targetDirection === 'prev' ? 'robos_quest_editor_tool_palette_w' : 'robos_quest_editor_sidebar_right_w';
          localStorage.removeItem(storageKey);
        } catch (_) {}
        resizeCanvas();
        render();
      }
    });
  });
}

// -------------------------------------------------------------
// Event Listeners Setup
// -------------------------------------------------------------
function setupEventListeners() {
  setupSplitDividers();
  // Tool palette clicks
  dom.toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveTool(btn.dataset.tool);
    });
  });

  // Undo / Redo
  dom.btnUndo.addEventListener('click', undo);
  dom.btnRedo.addEventListener('click', redo);

  // Subtool radio / dropdown controls
  dom.radioDoorTypes.forEach(radio => {
    radio.addEventListener('change', () => {
      state.subtool.doorType = radio.value;
      render();
    });
  });

  dom.selectMonsterType.addEventListener('change', () => {
    state.subtool.monsterType = dom.selectMonsterType.value;
    render();
  });

  dom.selectFurnitureType.addEventListener('change', () => {
    state.subtool.furnitureType = dom.selectFurnitureType.value;
    const def = FURNITURE_DEFS[state.subtool.furnitureType] || { w: 1, h: 1 };
    dom.furnDimText.textContent = `${def.w}×${def.h}`;
    state.subtool.furnitureRotated = false;
    render();
  });

  dom.btnRotateFurn.addEventListener('click', () => {
    state.subtool.furnitureRotated = !state.subtool.furnitureRotated;
    const def = FURNITURE_DEFS[state.subtool.furnitureType] || { w: 1, h: 1 };
    const w = state.subtool.furnitureRotated ? def.h : def.w;
    const h = state.subtool.furnitureRotated ? def.w : def.h;
    dom.furnDimText.textContent = `${w}×${h}`;
    render();
  });

  dom.selectTrapType.addEventListener('change', () => {
    state.subtool.trapType = dom.selectTrapType.value;
  });

  dom.selectWallBlockType.addEventListener('change', () => {
    state.subtool.wallBlockType = dom.selectWallBlockType.value;
    render();
  });

  dom.inputNoteMarker.addEventListener('input', () => {
    state.subtool.noteMarker = dom.inputNoteMarker.value;
  });

  if (dom.selectStartStairType) {
    dom.selectStartStairType.addEventListener('change', () => {
      state.subtool.startStairType = dom.selectStartStairType.value;
      state.quest.startingStairType = dom.selectStartStairType.value;
      render();
    });
  }

  if (dom.selectExitStairType) {
    dom.selectExitStairType.addEventListener('change', () => {
      state.subtool.exitStairType = dom.selectExitStairType.value;
      state.quest.exitStairType = dom.selectExitStairType.value;
      render();
    });
  }

  // Tabs
  dom.sideTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      switchSidebarTab(btn.dataset.tab);
    });
  });

  // Inspector Form changes
  dom.inspectName.addEventListener('input', () => {
    if (!state.selectedEntity) return;
    const { type, index } = state.selectedEntity;
    if (type === 'monster') state.quest.monsters[index].name = dom.inspectName.value;
    if (type === 'furniture') state.quest.furniture[index].name = dom.inspectName.value;
    updateEntitySummaryList();
  });

  dom.inspectMonsterBp.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'monster') {
      state.quest.monsters[state.selectedEntity.index].bp = parseInt(dom.inspectMonsterBp.value) || 1;
    }
  });
  dom.inspectMonsterMp.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'monster') {
      state.quest.monsters[state.selectedEntity.index].mp = parseInt(dom.inspectMonsterMp.value) || 0;
    }
  });
  dom.inspectMonsterAtk.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'monster') {
      state.quest.monsters[state.selectedEntity.index].atk = parseInt(dom.inspectMonsterAtk.value) || 1;
    }
  });
  dom.inspectMonsterDef.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'monster') {
      state.quest.monsters[state.selectedEntity.index].def = parseInt(dom.inspectMonsterDef.value) || 1;
    }
  });
  dom.inspectMonsterMove.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'monster') {
      state.quest.monsters[state.selectedEntity.index].move = parseInt(dom.inspectMonsterMove.value) || 6;
    }
  });
  dom.inspectMonsterIsBoss.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'monster') {
      state.quest.monsters[state.selectedEntity.index].isBoss = dom.inspectMonsterIsBoss.checked;
      render();
    }
  });
  dom.inspectMonsterIsUndead.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'monster') {
      state.quest.monsters[state.selectedEntity.index].isUndead = dom.inspectMonsterIsUndead.checked;
    }
  });
  dom.inspectMonsterIsCaster.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'monster') {
      state.quest.monsters[state.selectedEntity.index].isSpellcaster = dom.inspectMonsterIsCaster.checked;
    }
  });

  dom.inspectDoorState.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'door') {
      state.quest.doors[state.selectedEntity.index].state = dom.inspectDoorState.value;
      render();
    }
  });
  dom.inspectDoorSecret.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'door') {
      state.quest.doors[state.selectedEntity.index].is_secret = dom.inspectDoorSecret.checked;
      render();
    }
  });

  dom.btnInspectRotateFurn.addEventListener('click', () => {
    if (state.selectedEntity?.type === 'furniture') {
      const f = state.quest.furniture[state.selectedEntity.index];
      const tmp = f.width;
      f.width = f.height;
      f.height = tmp;
      dom.inspectFurnDims.textContent = `${f.width} × ${f.height}`;
      render();
    }
  });

  dom.inspectFurnTreasure.addEventListener('input', () => {
    if (state.selectedEntity?.type === 'furniture') {
      state.quest.furniture[state.selectedEntity.index].treasure = dom.inspectFurnTreasure.value;
    }
  });

  dom.inspectTrapDmg.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'trap') {
      state.quest.traps[state.selectedEntity.index].damage = parseInt(dom.inspectTrapDmg.value) || 1;
    }
  });

  dom.inspectNoteMarker.addEventListener('input', () => {
    if (state.selectedEntity?.type === 'note') {
      state.quest.storyTriggers[state.selectedEntity.index].marker = dom.inspectNoteMarker.value;
      render();
    }
  });
  dom.inspectNoteTitle.addEventListener('input', () => {
    if (state.selectedEntity?.type === 'note') {
      state.quest.storyTriggers[state.selectedEntity.index].title = dom.inspectNoteTitle.value;
    }
  });
  dom.inspectNoteNarrative.addEventListener('input', () => {
    if (state.selectedEntity?.type === 'note') {
      state.quest.storyTriggers[state.selectedEntity.index].narrative = dom.inspectNoteNarrative.value;
    }
  });

  dom.btnDeleteEntity.addEventListener('click', () => {
    if (!state.selectedEntity) return;
    recordHistory();
    deleteEntity(state.selectedEntity.type, state.selectedEntity.index);
  });

  // Quest Metadata changes
  dom.inputQuestTitle.addEventListener('input', () => {
    state.quest.title = dom.inputQuestTitle.value;
    dom.infoQuestTitle.textContent = state.quest.title;
  });
  dom.inputQuestSlug.addEventListener('input', () => {
    state.quest.slug = dom.inputQuestSlug.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  });
  dom.selectWanderingMonster.addEventListener('change', () => {
    state.quest.wanderingMonster = dom.selectWanderingMonster.value;
  });
  dom.inputGoldBounty.addEventListener('change', () => {
    state.quest.goldBounty = parseInt(dom.inputGoldBounty.value) || 0;
  });
  dom.textareaQuestBriefing.addEventListener('input', () => {
    state.quest.briefing = dom.textareaQuestBriefing.value;
  });

  // Layer toggles
  dom.chkShowImage.addEventListener('change', () => { state.layers.showImage = dom.chkShowImage.checked; render(); });
  dom.chkShowGrid.addEventListener('change', () => { state.layers.showGrid = dom.chkShowGrid.checked; render(); });
  dom.chkShowRooms.addEventListener('change', () => { state.layers.showRooms = dom.chkShowRooms.checked; render(); });
  if (dom.chkShowRoomNames) {
    dom.chkShowRoomNames.addEventListener('change', () => {
      toggleRoomNames(dom.chkShowRoomNames.checked);
    });
  }
  if (dom.btnToggleRoomNames) {
    dom.btnToggleRoomNames.addEventListener('click', () => {
      toggleRoomNames();
    });
  }
  if (dom.infoRoomName) {
    dom.infoRoomName.addEventListener('click', () => {
      toggleRoomNames();
    });
  }
  dom.chkShowCorridors.addEventListener('change', () => { state.layers.showCorridors = dom.chkShowCorridors.checked; render(); });
  dom.chkShowDoors.addEventListener('change', () => { state.layers.showDoors = dom.chkShowDoors.checked; render(); });
  dom.chkShowMonsters.addEventListener('change', () => { state.layers.showMonsters = dom.chkShowMonsters.checked; render(); });
  dom.chkShowFurniture.addEventListener('change', () => { state.layers.showFurniture = dom.chkShowFurniture.checked; render(); });
  dom.chkShowTraps.addEventListener('change', () => { state.layers.showTraps = dom.chkShowTraps.checked; render(); });
  dom.chkShowWallBlocks.addEventListener('change', () => { state.layers.showWallBlocks = dom.chkShowWallBlocks.checked; render(); });
  dom.chkShowNotes.addEventListener('change', () => { state.layers.showNotes = dom.chkShowNotes.checked; render(); });
  if (dom.chkShowValidation) {
    dom.chkShowValidation.addEventListener('change', () => {
      state.layers.showValidationWarnings = dom.chkShowValidation.checked;
      render();
    });
  }
  dom.sliderArtOpacity.addEventListener('input', () => { state.layers.artOpacity = parseFloat(dom.sliderArtOpacity.value); render(); });
  dom.sliderGridOpacity.addEventListener('input', () => { state.layers.gridOpacity = parseFloat(dom.sliderGridOpacity.value); render(); });

  // Validation status badge & category filters
  if (dom.infoValidationBadge) {
    dom.infoValidationBadge.addEventListener('click', () => {
      switchSidebarTab('tab-validation');
    });
  }

  if (dom.filterPills) {
    dom.filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        state.validation.activeFilter = pill.dataset.filter;
        renderValidationUI();
      });
    });
  }

  // Top header button actions
  dom.selectBlockmap.addEventListener('change', async () => {
    await loadBlockmap(dom.selectBlockmap.value);
  });

  dom.btnOpenBlockmap.addEventListener('click', async () => {
    if (!window.robosQuestEditor) return;
    const res = await window.robosQuestEditor.openBlockmapDialog();
    if (res.success) {
      state.blockmap = res.blockmap;
      state.blockmapPath = res.blockmapPath;
      if (res.imageData && res.imageData.dataUrl) {
        const img = new Image();
        img.onload = () => { state.bgImage = img; render(); };
        img.src = res.imageData.dataUrl;
      }
      fitView();
      render();
      showToast(`Loaded: ${state.blockmap.title || path.basename(res.blockmapPath)}`, 'success');
    }
  });

  dom.btnSaveCartridge.addEventListener('click', saveCartridge);
  dom.btnExportJson.addEventListener('click', exportJson);
  dom.btnCopyJson.addEventListener('click', copyJson);
  dom.btnTestPlay.addEventListener('click', testPlay);

  if (dom.btnVoiceAddItems) {
    dom.btnVoiceAddItems.addEventListener('robos-voice-complete', (e) => {
      const { text, guidancePrompt } = e.detail || {};
      if (text && text.trim()) {
        executeVoiceMapCommands(text, guidancePrompt);
      }
    });
  }

  // Zoom controls
  dom.btnZoomIn.addEventListener('click', () => {
    state.zoom = Math.min(3.0, state.zoom * 1.2);
    updateZoomUI();
    render();
  });
  dom.btnZoomOut.addEventListener('click', () => {
    state.zoom = Math.max(0.3, state.zoom / 1.2);
    updateZoomUI();
    render();
  });
  dom.btnZoomReset.addEventListener('click', () => {
    state.zoom = 1.0;
    updateZoomUI();
    render();
  });
  dom.btnZoomFit.addEventListener('click', () => {
    fitView();
    render();
  });

  // Canvas Mouse Interactions
  dom.viewport.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.spaceKey || (e.button === 0 && e.altKey)) {
      // Pan
      state.isPanning = true;
      state.panStartX = e.clientX - state.panX;
      state.panStartY = e.clientY - state.panY;
      dom.viewport.classList.add('panning');
      return;
    }

    if (e.button === 0) {
      const rect = dom.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      handleCanvasClick(world.x, world.y);
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
      state.panX = e.clientX - state.panStartX;
      state.panY = e.clientY - state.panStartY;
      render();
      return;
    }

    const rect = dom.canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      state.hoverTile = null;
      state.hoverDoorEdge = null;
      render();
      return;
    }

    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    const isStartOrExit = state.activeTool === 'start' || state.activeTool === 'stairs' || state.activeTool === 'exit';
    const tile = worldToTile(world.x, world.y, isStartOrExit);

    dom.infoCursorCoords.textContent = `📍 Cursor: ${Math.round(world.x)}, ${Math.round(world.y)}`;

    if (tile) {
      state.hoverTile = tile;
      const isBorder = isBorderTile(tile[0], tile[1]);
      dom.infoTileCoords.textContent = `🎯 Tile: [${tile[0]}, ${tile[1]}]${isBorder ? ' (Border Tile)' : ''}`;
      const room = findRoomAtTile(tile[0], tile[1]);
      dom.infoRoomName.textContent = `🏠 Room: ${room ? (room.name || room.id) : (isBorder ? 'Border (Solid Wall / Portal)' : 'Corridor / None')}`;

      if (state.activeTool === 'door') {
        state.hoverDoorEdge = detectDoorEdge(world.x, world.y);
      } else {
        state.hoverDoorEdge = null;
      }
    } else {
      state.hoverTile = null;
      state.hoverDoorEdge = null;
      dom.infoTileCoords.textContent = '🎯 Tile: [-, -]';
      dom.infoRoomName.textContent = '🏠 Room: None';
    }

    render();
  });

  // Clear Exit Tile button handler
  if (dom.btnClearExit) {
    dom.btnClearExit.addEventListener('click', () => {
      recordHistory();
      state.quest.exitTile = null;
      updateExitSuboptsUI();
      if (state.selectedEntity && state.selectedEntity.type === 'exit') {
        state.selectedEntity = null;
        updateInspectorUI();
      }
      updateEntitySummaryList();
      render();
      showToast('Exit tile cleared', 'info');
    });
  }

  // Furniture Stairs Role button handlers
  if (dom.btnFurnMakeStart) {
    dom.btnFurnMakeStart.addEventListener('click', () => {
      if (!state.selectedEntity || state.selectedEntity.type !== 'furniture') return;
      const f = state.quest.furniture[state.selectedEntity.index];
      if (!f) return;
      recordHistory();
      state.quest.startingStair = [f.x, f.y];
      if (f.type.includes('stair')) {
        state.quest.startingStairType = f.type;
        state.subtool.startStairType = f.type;
      }
      updateStartSuboptsUI();
      updateInspectorUI();
      updateEntitySummaryList();
      render();
      showToast(`🪜 Starting entrance set to ${f.name || 'stairs'} at [${f.x}, ${f.y}]`, 'success');
    });
  }

  if (dom.btnFurnMakeExit) {
    dom.btnFurnMakeExit.addEventListener('click', () => {
      if (!state.selectedEntity || state.selectedEntity.type !== 'furniture') return;
      const f = state.quest.furniture[state.selectedEntity.index];
      if (!f) return;
      recordHistory();
      state.quest.exitTile = [f.x, f.y];
      if (f.type.includes('stair')) {
        state.quest.exitStairType = f.type;
        state.subtool.exitStairType = f.type;
      }
      updateExitSuboptsUI();
      updateInspectorUI();
      updateEntitySummaryList();
      render();
      showToast(`🏁 Quest exit set to ${f.name || 'stairs'} at [${f.x}, ${f.y}]`, 'success');
    });
  }

  if (dom.btnFurnClearRole) {
    dom.btnFurnClearRole.addEventListener('click', () => {
      if (!state.selectedEntity || state.selectedEntity.type !== 'furniture') return;
      const f = state.quest.furniture[state.selectedEntity.index];
      if (!f) return;
      recordHistory();
      if (state.quest.startingStair && (
        (state.quest.startingStair[0] === f.x && state.quest.startingStair[1] === f.y) ||
        (state.quest.startingStair[0] >= f.x && state.quest.startingStair[0] < f.x + (f.width || 1) &&
         state.quest.startingStair[1] >= f.y && state.quest.startingStair[1] < f.y + (f.height || 1))
      )) {
        state.quest.startingStair = [0, 1];
        state.quest.startingStairType = 'stairs_up_1x1';
        updateStartSuboptsUI();
      }
      if (state.quest.exitTile && (
        (state.quest.exitTile[0] === f.x && state.quest.exitTile[1] === f.y) ||
        (state.quest.exitTile[0] >= f.x && state.quest.exitTile[0] < f.x + (f.width || 1) &&
         state.quest.exitTile[1] >= f.y && state.quest.exitTile[1] < f.y + (f.height || 1))
      )) {
        state.quest.exitTile = null;
        state.quest.exitStairType = 'stairs_down_1x1';
        updateExitSuboptsUI();
      }
      updateInspectorUI();
      updateEntitySummaryList();
      render();
      showToast('Stairs role cleared', 'info');
    });
  }

  // Additional Border Tile toggle handler
  if (dom.chkAdditionalBorder) {
    dom.chkAdditionalBorder.addEventListener('change', (e) => {
      state.hasAdditionalBorder = e.target.checked;
      fitView();
      render();
      showToast(state.hasAdditionalBorder ? 'Additional border tiles enabled' : 'Additional border tiles disabled', 'info');
    });
  }

  window.addEventListener('mouseup', () => {
    if (state.isPanning) {
      state.isPanning = false;
      dom.viewport.classList.remove('panning');
    }
  });

  // Wheel zoom
  dom.viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = dom.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(0.25, Math.min(4.0, state.zoom * zoomFactor));

    // Zoom centered on mouse
    state.panX = mouseX - (mouseX - state.panX) * (newZoom / state.zoom);
    state.panY = mouseY - (mouseY - state.panY) * (newZoom / state.zoom);
    state.zoom = newZoom;

    updateZoomUI();
    render();
  }, { passive: false });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
      e.preventDefault();
      redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedEntity) {
        e.preventDefault();
        recordHistory();
        deleteEntity(state.selectedEntity.type, state.selectedEntity.index);
      }
    } else if (e.key === 's' || e.key === '1') {
      setActiveTool('select');
    } else if (e.key === 'd' || e.key === '2') {
      setActiveTool('door');
    } else if (e.key === 'm' || e.key === '3') {
      setActiveTool('monster');
    } else if (e.key === 'f' || e.key === '4') {
      setActiveTool('furniture');
    } else if (e.key === 't' || e.key === '5') {
      setActiveTool('trap');
    } else if (e.key === 'b' || e.key === '6') {
      setActiveTool('wall-block');
    } else if (e.key === 'l' || e.key === '7') {
      setActiveTool('start');
    } else if (e.key === 'x' || e.key === '0') {
      setActiveTool('exit');
    } else if (e.key === 'N' || (e.key === 'n' && e.shiftKey)) {
      e.preventDefault();
      toggleRoomNames();
    } else if (e.key === 'n' || e.key === '8') {
      setActiveTool('note');
    } else if (e.key === 'e' || e.key === '9') {
      setActiveTool('erase');
    } else if (e.key === 'r') {
      // Rotate active furniture
      if (state.activeTool === 'furniture') {
        state.subtool.furnitureRotated = !state.subtool.furnitureRotated;
        const def = FURNITURE_DEFS[state.subtool.furnitureType] || { w: 1, h: 1 };
        const w = state.subtool.furnitureRotated ? def.h : def.w;
        const h = state.subtool.furnitureRotated ? def.w : def.h;
        dom.furnDimText.textContent = `${w}×${h}`;
        render();
      } else if (state.selectedEntity?.type === 'furniture') {
        const furn = state.quest.furniture[state.selectedEntity.index];
        const tmp = furn.width;
        furn.width = furn.height;
        furn.height = tmp;
        dom.inspectFurnDims.textContent = `${furn.width} × ${furn.height}`;
        render();
      }
    }
  });
}

// -------------------------------------------------------------
// Expose test inspection hooks on window for automated testing
// -------------------------------------------------------------
if (typeof window !== 'undefined') {
  window.__test_quest_editor = {
    state,
    buildCartridgePayload,
    detectDoorEdge,
    worldToTile,
    tileToWorld,
    isBorderTile,
    findRoomAtTile,
    handleCanvasClick,
    deleteEntity,
    setActiveTool,
    undo,
    redo,
    render,
    updateInspectorUI,
    updateEntitySummaryList,
    syncQuestMetaInputs,
    validateQuest,
    runValidation,
    focusValidationError,
    deleteValidationErrorEntity,
    interpretVoiceQuestCommands,
    executeVoiceMapCommands,
    findTargetRoom,
    findFreeTilesInRoom,
    findFreeRectInRoom,
    setupSplitDividers,
    toggleRoomNames,
    updateRoomNamesToggleUI
  };

  // Bootstrap application on window load
  window.addEventListener('DOMContentLoaded', initApp);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateQuest,
    interpretVoiceQuestCommands,
    executeVoiceMapCommands,
    findTargetRoom,
    findFreeTilesInRoom,
    findFreeRectInRoom,
    setupSplitDividers,
    toggleRoomNames,
    updateRoomNamesToggleUI,
    state,
    dom,
    MONSTER_DEFS,
    FURNITURE_DEFS
  };
}
