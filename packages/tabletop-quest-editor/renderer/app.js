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
    storyTriggers: [],
    triggers: []
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
    doorSize: 'single', // 'single', 'double-2x1', 'double-1x2', 'double-auto'
    doorType: 'wood-closed', // 'wood-closed', 'wood-open', 'secret'
    monsterType: 'goblin',
    furnitureType: 'chest',
    furnitureRotated: false, // false: normal, true: 90 deg rotated
    trapType: 'pit',
    wallBlockType: 'single',
    noteMarker: 'Note A',
    triggerEvent: 'on_room_entered',
    triggerActionType: 'play_movie',
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
  abomination: { name: 'Abomination', bp: 2, mp: 3, atk: 3, def: 3, move: 6, isBoss: false, isUndead: false, isCaster: false, color: '#2563eb', icon: '🦎' },
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
// Trigger Event & Action Definitions
// -------------------------------------------------------------
const TRIGGER_EVENT_DEFS = {
  on_room_entered: { label: 'On Room Entered', icon: '🏰', color: '#3b82f6', targetType: 'room' },
  on_tile_stepped_on: { label: 'On Tile Stepped On', icon: '👣', color: '#10b981', targetType: 'tile' },
  on_door_opened: { label: 'On Door Opened', icon: '🚪', color: '#f59e0b', targetType: 'door' },
  on_monster_killed: { label: 'On Monster Killed', icon: '💀', color: '#ef4444', targetType: 'monster' },
  on_room_searched_treasure: { label: 'On Searched for Treasure', icon: '💰', color: '#eab308', targetType: 'room' },
  on_room_searched_traps: { label: 'On Searched for Traps', icon: '🔍', color: '#8b5cf6', targetType: 'room' },
  on_game_start: { label: 'On Game Start', icon: '🎮', color: '#06b6d4', targetType: 'none' },
  on_game_end: { label: 'On Game End', icon: '🏆', color: '#ec4899', targetType: 'none' }
};

const TRIGGER_ACTION_DEFS = {
  play_movie: {
    name: 'Play Movie',
    icon: '🎬',
    defaultParams: { moviePath: 'res://assets/movies/quest1-intro.mp4', title: 'Cinematic Scene', canSkip: true }
  },
  attack_character: {
    name: 'Attack Character',
    icon: '⚔️',
    defaultParams: { attacker: 'Hazard', damageDice: 2, damage: 2, target: 'active_hero' }
  },
  cast_spell: {
    name: 'Cast Spell',
    icon: '🪄',
    defaultParams: { spell: 'ball_of_flame', caster: 'Morcar', target: 'active_hero' }
  },
  spring_trap: {
    name: 'Spring Trap',
    icon: '⚠️',
    defaultParams: { trapType: 'falling_block', damage: 2 }
  },
  show_message: {
    name: 'Show Message',
    icon: '📜',
    defaultParams: { title: 'Dungeon Notice', text: 'Mentor speaks: "Tread carefully, heroes..."' }
  },
  display_message: {
    name: 'Display Message',
    icon: '📜',
    defaultParams: { title: 'Chamber Inscription', text: 'The ancient runes glow with an ominous crimson light.', buttonText: 'Continue' }
  },
  dialogue: {
    name: 'Character Dialogue',
    icon: '💬',
    defaultParams: {
      lines: [
        { speaker: 'barbarian', text: 'I sense danger lurking nearby...', audio: '' }
      ]
    }
  },
  furniture_visible: {
    name: 'Furniture Becomes Visible',
    icon: '✨',
    defaultParams: { furnitureId: '', target: 'Heist Treasure Chest' }
  },
  move_furniture: {
    name: 'Furniture Moves to [X, Y]',
    icon: '🪑',
    defaultParams: { furnitureId: '', target: 'Heist Treasure Chest', tile: [18, 17], x: 18, y: 17, message: '' }
  },
  spawn_monsters: {
    name: 'Spawn Monsters',
    icon: '👾',
    defaultParams: { monsterType: 'skeleton', count: 1, roomId: '' }
  },
  grant_reward: {
    name: 'Grant Reward',
    icon: '💰',
    defaultParams: { gold: 50, item: 'Potion of Healing' }
  },
  end_game: {
    name: 'End Game',
    icon: '🏁',
    defaultParams: { outcome: 'victory' }
  }
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
  btnExportPng: document.getElementById('btn-export-png'),
  btnExportPdf: document.getElementById('btn-export-pdf'),
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
  selectDoorSize: document.getElementById('select-door-size'),
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
  badgeTriggerCount: document.getElementById('badge-trigger-count'),

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
  inspectHidden: document.getElementById('inspect-hidden'),
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
  inspectDoorType: document.getElementById('inspect-door-type'),
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

  // Inspector: Trigger / Note & Action Pipeline
  inspectGroupNote: document.getElementById('inspect-group-note'),
  inspectNoteMarker: document.getElementById('inspect-note-marker'),
  inspectNoteTitle: document.getElementById('inspect-note-title'),
  inspectTriggerEvent: document.getElementById('inspect-trigger-event'),
  inspectTriggerTargetGroup: document.getElementById('inspect-trigger-target-group'),
  inspectTriggerTargetLbl: document.getElementById('inspect-trigger-target-lbl'),
  inspectTriggerTargetRoom: document.getElementById('inspect-trigger-target-room'),
  inspectTriggerTargetDoor: document.getElementById('inspect-trigger-target-door'),
  inspectTriggerTargetMonster: document.getElementById('inspect-trigger-target-monster'),
  inspectTriggerTargetTile: document.getElementById('inspect-trigger-target-tile'),
  inspectTriggerTileX: document.getElementById('inspect-trigger-tile-x'),
  inspectTriggerTileY: document.getElementById('inspect-trigger-tile-y'),
  inspectTriggerOnceOnly: document.getElementById('inspect-trigger-once-only'),
  inspectNoteNarrative: document.getElementById('inspect-note-narrative'),
  selectNewActionType: document.getElementById('select-new-action-type'),
  btnAddAction: document.getElementById('btn-add-action'),
  inspectTriggerActionsList: document.getElementById('inspect-trigger-actions-list'),

  // Triggers Tab
  btnAddTrigger: document.getElementById('btn-add-trigger'),
  filterTriggerEvent: document.getElementById('filter-trigger-event'),
  triggerList: document.getElementById('trigger-list'),

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

  // Export Modals (PNG / PDF)
  exportPngModal: document.getElementById('export-png-modal'),
  btnCloseExportPngModal: document.getElementById('btn-close-export-png-modal'),
  btnCancelExportPng: document.getElementById('btn-cancel-export-png'),
  btnConfirmSavePng: document.getElementById('btn-confirm-save-png'),
  btnCopyPngClipboard: document.getElementById('btn-copy-png-clipboard'),
  exportPngPreview: document.getElementById('export-png-preview'),
  exportPngDimensionsBadge: document.getElementById('export-png-dimensions-badge'),
  chkExportGrid: document.getElementById('chk-export-grid'),
  chkExportNames: document.getElementById('chk-export-names'),
  chkExportArtwork: document.getElementById('chk-export-artwork'),
  chkExportBanner: document.getElementById('chk-export-banner'),
  radioExportPngScale: document.querySelectorAll('input[name="export-png-scale"]'),

  exportPdfModal: document.getElementById('export-pdf-modal'),
  btnCloseExportPdfModal: document.getElementById('btn-close-export-pdf-modal'),
  btnCancelExportPdf: document.getElementById('btn-cancel-export-pdf'),
  btnConfirmSavePdf: document.getElementById('btn-confirm-save-pdf'),
  selectPdfPageSize: document.getElementById('select-pdf-page-size'),
  chkPdfHeader: document.getElementById('chk-pdf-header'),
  chkPdfMap: document.getElementById('chk-pdf-map'),
  chkPdfNotes: document.getElementById('chk-pdf-notes'),
  chkPdfActions: document.getElementById('chk-pdf-actions'),
  chkPdfRoster: document.getElementById('chk-pdf-roster'),
  chkPdfFurniture: document.getElementById('chk-pdf-furniture'),
  radioExportPdfOrientation: document.querySelectorAll('input[name="export-pdf-orientation"]'),

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
  toast.style.cursor = 'pointer';
  toast.title = 'Click to dismiss';
  toast.innerHTML = `<span>${message}</span>`;
  toast.addEventListener('click', () => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  });
  dom.toastContainer.appendChild(toast);
  const duration = type === 'error' ? 7000 : 3500;
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
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
    if (dom.infoBlockmapName) dom.infoBlockmapName.textContent = state.blockmap.title || state.blockmap.id || 'Custom Dungeon';
    if (dom.infoGridSize) dom.infoGridSize.textContent = `${dims[0]} × ${dims[1]}`;

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

async function openSelectedBlockmapInEditor() {
  try {
    const selectedBlockmap = state.blockmapPath || state.blockmap?.id || (dom.selectBlockmap ? dom.selectBlockmap.value : 'first-light-dungeon');
    if (!window.robosQuestEditor || !window.robosQuestEditor.openBlockmapEditor) {
      showToast('Blockmap Editor bridge not available in this environment', 'info');
      return { success: false, error: 'Bridge not available' };
    }
    const res = await window.robosQuestEditor.openBlockmapEditor(selectedBlockmap);
    if (res && res.success) {
      const displayName = state.blockmap?.title || state.blockmap?.id || res.blockmapName || 'blockmap';
      showToast(`Opening "${displayName}" in Blockmap Editor...`, 'success');
    } else {
      showToast(`Failed to open Blockmap Editor: ${res?.error || 'Unknown error'}`, 'error');
    }
    return res;
  } catch (err) {
    showToast(`Error opening blockmap editor: ${err.message}`, 'error');
    return { success: false, error: err.message };
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
      state.quest.doors = (mapData.doors || []).map((d, i) => {
        const dt = d.door_type || (d.width === 2 ? 'double-2x1' : (d.height === 2 ? 'double-1x2' : 'single'));
        const w = d.width || (dt === 'double-2x1' || dt === 'double-h' ? 2 : 1);
        const h = d.height || (dt === 'double-1x2' || dt === 'double-v' ? 2 : 1);
        return {
          id: d.id || `door-${i+1}`,
          name: d.name || d.id || (d.is_secret ? `Secret Door ${i+1}` : (w > 1 || h > 1 ? `Double Door ${i+1}` : `Door ${i+1}`)),
          from: d.from || [0, 0],
          to: d.to || [0, 1],
          state: d.state || 'closed',
          is_secret: Boolean(d.is_secret),
          room: d.room || '',
          hidden: Boolean(d.hidden),
          door_type: dt,
          width: w,
          height: h
        };
      });
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
          treasure: f.treasure || '',
          hidden: Boolean(f.hidden)
        };
      });
      state.quest.wallBlocks = (mapData.wallBlocks || []).map((wb, i) => ({
        id: wb.id || `block-${i+1}`,
        type: wb.type || 'single',
        x: wb.x || 0,
        y: wb.y || 0,
        width: wb.width || 1,
        height: wb.height || 1,
        hidden: Boolean(wb.hidden)
      }));
      state.quest.traps = (mapData.traps || []).map((t, i) => ({
        id: t.id || `trap-${i+1}`,
        type: t.trapType || t.type || 'pit',
        x: t.x || 0,
        y: t.y || 0,
        damage: t.damageDice || t.damage || 1,
        detected: Boolean(t.detected),
        disarmed: Boolean(t.disarmed),
        hidden: Boolean(t.hidden)
      }));

      const rawTriggers = mapData.triggers || mapData.storyTriggers || [];
      state.quest.storyTriggers = rawTriggers.map((st, i) => {
        let inferredEvent = st.event;
        if (!inferredEvent) {
          if (st.condition === 'search_treasure') inferredEvent = 'on_room_searched_treasure';
          else if (st.condition === 'search_traps') inferredEvent = 'on_room_searched_traps';
          else if (st.condition === 'enter_room' || st.condition === 'line_of_sight') inferredEvent = 'on_room_entered';
          else if (st.room) inferredEvent = 'on_room_entered';
          else inferredEvent = 'on_tile_stepped_on';
        }

        const actions = Array.isArray(st.actions) ? st.actions.map(a => ({ ...a })) : [];
        if (actions.length === 0) {
          const movieUrl = st.movie || st.moviePath || st.cinematic;
          if (movieUrl) {
            actions.push({
              type: 'play_movie',
              moviePath: movieUrl,
              title: st.title || 'Cinematic Scene',
              canSkip: true
            });
          }
          if (st.gold && st.gold > 0) {
            actions.push({
              type: 'grant_reward',
              gold: st.gold,
              item: (st.item && (typeof st.item === 'string' ? st.item : st.item.name)) || ''
            });
          }
          if (Array.isArray(st.spawnMonsters) && st.spawnMonsters.length > 0) {
            const first = st.spawnMonsters[0];
            actions.push({
              type: 'spawn_monsters',
              monsterType: first.monsterType || first.slug || 'skeleton',
              count: st.spawnMonsters.length,
              roomId: st.room || ''
            });
          }
        }

        return {
          id: st.id || `trigger-${i+1}`,
          marker: st.marker || `Note ${String.fromCharCode(65 + i)}`,
          name: st.name || st.title || 'Special Trigger',
          title: st.title || st.name || 'Special Trigger',
          event: inferredEvent,
          target: st.target || st.room || st.doorId || st.monsterId || '',
          room: st.room || (inferredEvent === 'on_room_entered' || inferredEvent === 'on_room_searched_treasure' || inferredEvent === 'on_room_searched_traps' ? (st.target || '') : ''),
          doorId: st.doorId || (inferredEvent === 'on_door_opened' ? (st.target || '') : ''),
          monsterId: st.monsterId || (inferredEvent === 'on_monster_killed' ? (st.target || '') : ''),
          tile: st.tile || [0, 0],
          onceOnly: st.onceOnly !== undefined ? Boolean(st.onceOnly) : true,
          narrative: st.narrative || '',
          actions: actions,
          hidden: Boolean(st.hidden)
        };
      });
      state.quest.triggers = state.quest.storyTriggers;
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
            isSpellcaster: Boolean(m.isSpellcaster),
            hidden: Boolean(m.hidden)
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
            isSpellcaster: Boolean(m.isSpellcaster),
            hidden: Boolean(m.hidden)
          });
        });
      }
    }

    // Load matching blockmap foundation
    const targetBlockmap = mapData?.mapConfigurationId || 'first-light-dungeon';
    await loadBlockmap(targetBlockmap);

    syncQuestMetaInputs();
    updateEntitySummaryList();
    updateTriggerTabUI();
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
      roomId: m.roomId || '',
      hidden: Boolean(m.hidden)
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
          name: d.name || d.id,
          from: [d.from[0], d.from[1]],
          to: [d.to[0], d.to[1]],
          state: d.state || 'closed',
          is_secret: Boolean(d.is_secret),
          room: d.room || '',
          hidden: Boolean(d.hidden),
          door_type: d.door_type || (d.width === 2 ? 'double-2x1' : (d.height === 2 ? 'double-1x2' : 'single')),
          width: d.width || (d.door_type === 'double-2x1' || d.door_type === 'double-h' ? 2 : 1),
          height: d.height || (d.door_type === 'double-1x2' || d.door_type === 'double-v' ? 2 : 1)
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
          treasure: f.treasure || '',
          hidden: Boolean(f.hidden)
        })),
        wallBlocks: q.wallBlocks.map(wb => ({
          id: wb.id,
          type: wb.type,
          x: wb.x,
          y: wb.y,
          width: wb.width,
          height: wb.height,
          hidden: Boolean(wb.hidden)
        })),
        traps: q.traps.map(t => ({
          id: t.id,
          trapType: t.type,
          x: t.x,
          y: t.y,
          damageDice: t.damage,
          detected: false,
          disarmed: false,
          hidden: Boolean(t.hidden)
        })),
        triggers: q.storyTriggers.map(st => ({
          id: st.id,
          name: st.title || st.name || '',
          title: st.title || st.name || '',
          marker: st.marker,
          event: st.event || (st.room ? 'on_room_entered' : 'on_tile_stepped_on'),
          target: st.target || st.room || st.doorId || st.monsterId || '',
          room: st.room || '',
          doorId: st.doorId || '',
          monsterId: st.monsterId || '',
          tile: [st.tile[0], st.tile[1]],
          onceOnly: Boolean(st.onceOnly !== false),
          narrative: st.narrative || '',
          hidden: Boolean(st.hidden),
          actions: (st.actions || []).map(a => ({
            ...a,
            lines: Array.isArray(a.lines) ? a.lines.map(l => ({ ...l })) : undefined
          }))
        })),
        storyTriggers: q.storyTriggers.map(st => {
          const movieAction = (st.actions || []).find(a => a.type === 'play_movie');
          return {
            id: st.id,
            marker: st.marker,
            title: st.title || st.name || '',
            banner: `QUEST NOTE [${st.marker}]`,
            narrative: st.narrative || '',
            tile: [st.tile[0], st.tile[1]],
            room: st.room || '',
            event: st.event || (st.room ? 'on_room_entered' : 'on_tile_stepped_on'),
            onceOnly: Boolean(st.onceOnly !== false),
            movie: movieAction?.moviePath || '',
            hidden: Boolean(st.hidden),
            actions: (st.actions || []).map(a => ({
              ...a,
              lines: Array.isArray(a.lines) ? a.lines.map(l => ({ ...l })) : undefined
            }))
          };
        })
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

// -------------------------------------------------------------
// Quest Map PNG & PDF Export Engine
// -------------------------------------------------------------

/**
 * Determine if a trigger represents the special opening / starting action of a quest.
 */
function isStartingQuestAction(trigger, quest, blockmap) {
  if (!trigger) return false;

  // Explicit flag
  if (trigger.isIntro || trigger.isStartingAction) return true;

  // Game start / Quest start events
  if (trigger.event === 'on_game_start' || trigger.event === 'on_quest_start') return true;

  // Intro movie action
  const hasIntroMovie = trigger.actions && trigger.actions.some(a =>
    (a.moviePath && a.moviePath.toLowerCase().includes('intro')) ||
    (a.title && a.title.toLowerCase().includes('intro'))
  );
  if (hasIntroMovie) return true;

  // Title / name containing intro or prologue
  const titleLower = (trigger.title || trigger.name || '').toLowerCase();
  if (titleLower.includes('prologue') || titleLower.includes('intro cinematic') || titleLower.includes('quest intro')) {
    return true;
  }

  // Positioned at tile [0,0] with narrative or movie/dialogue actions (not a playable room/corridor)
  if (trigger.tile && trigger.tile[0] === 0 && trigger.tile[1] === 0) {
    if (trigger.narrative || (trigger.actions && trigger.actions.length > 0)) {
      return true;
    }
  }

  // Trigger placed on the quest's starting position / starting stair that is an intro/mentor narrative
  if (quest && quest.startingStair && trigger.tile &&
      trigger.tile[0] === quest.startingStair[0] && trigger.tile[1] === quest.startingStair[1] &&
      (titleLower.includes('intro') || titleLower.includes('start') || (trigger.narrative && trigger.narrative.toLowerCase().includes('mentor speaks')))) {
    return true;
  }

  return false;
}

/**
 * Iterates through quest triggers, extracts the starting quest intro action,
 * and resolves each remaining map trigger to its relevant entity (room, monster, door, furniture, or tile)
 * with a distinct letter indicator (A, B, C...).
 */
function resolveTriggerIndicators(quest, blockmap, geomOverride) {
  quest = quest || state.quest || {};
  blockmap = blockmap || state.blockmap || {};
  const geom = geomOverride || (typeof getGridGeometry === 'function' ? getGridGeometry() : { tileSize: 39, offsetX: 0, offsetY: 0, cols: 26, rows: 19 });
  const triggers = (quest.triggers || quest.storyTriggers || []).slice();

  let startingAction = null;
  const mapTriggers = [];

  for (let i = 0; i < triggers.length; i++) {
    const t = triggers[i];
    if (!startingAction && isStartingQuestAction(t, quest, blockmap)) {
      startingAction = t;
    } else {
      mapTriggers.push({ trigger: t, originalIndex: i });
    }
  }

  // Check if markers already have unique distinct letter markers
  const existingMarkers = mapTriggers.map(item => (item.trigger.marker || '').trim().replace(/^Note\s*/i, ''));
  const hasDistinctLetters = existingMarkers.length > 0 &&
    new Set(existingMarkers).size === existingMarkers.length &&
    existingMarkers.every(m => m.length > 0 && m !== 'A');

  const indicators = [];
  for (let idx = 0; idx < mapTriggers.length; idx++) {
    const { trigger: st, originalIndex } = mapTriggers[idx];
    const letter = hasDistinctLetters
      ? existingMarkers[idx]
      : String.fromCharCode(65 + idx); // A, B, C...

    let targetType = 'tile';
    let targetEntity = null;
    let targetPos = null;
    let targetLabel = '';

    // Check Monster / Person target
    if (st.event === 'on_monster_killed' || st.event === 'on_monster_defeated' || st.monsterId || (st.target && (st.target.startsWith('mon-') || (quest.monsters || []).some(m => m.id === st.target || m.type === st.target || m.name === st.target)))) {
      let mon = null;
      if (st.monsterId || st.target) {
        mon = (quest.monsters || []).find(m =>
          m.id === st.monsterId ||
          m.id === st.target ||
          m.type === st.target ||
          (m.name && m.name.toLowerCase() === (st.target || '').toLowerCase())
        );
      }
      if (!mon && st.tile) {
        mon = (quest.monsters || []).find(m =>
          (m.pos && m.pos[0] === st.tile[0] && m.pos[1] === st.tile[1]) ||
          (m.x === st.tile[0] && m.y === st.tile[1])
        );
      }
      if (mon) {
        targetType = 'monster';
        targetEntity = mon;
        const mc = mon.pos ? mon.pos[0] : (mon.x !== undefined ? mon.x : 0);
        const mr = mon.pos ? mon.pos[1] : (mon.y !== undefined ? mon.y : 0);
        targetPos = { col: mc, row: mr };
        const def = MONSTER_DEFS[mon.type];
        targetLabel = `Monster: ${mon.name || def?.name || mon.type || 'Monster'}${mon.isBoss ? ' (Boss)' : ''}`;
      }
    }

    // Check Door target
    if (!targetEntity && (st.event === 'on_door_opened' || st.doorId || (st.target && (st.target.startsWith('door-') || (quest.doors || []).some(d => d.id === st.target || d.name === st.target))))) {
      let door = null;
      if (st.doorId || st.target) {
        door = (quest.doors || []).find(d => d.id === st.doorId || d.id === st.target || d.name === st.target);
      }
      if (!door && st.tile) {
        door = (quest.doors || []).find(d =>
          (d.from[0] === st.tile[0] && d.from[1] === st.tile[1]) ||
          (d.to[0] === st.tile[0] && d.to[1] === st.tile[1])
        );
      }
      if (door) {
        targetType = 'door';
        targetEntity = door;
        const isVertical = door.from[0] !== door.to[0];
        const dc = isVertical ? Math.max(door.from[0], door.to[0]) : door.from[0];
        const dr = isVertical ? door.from[1] : Math.max(door.from[1], door.to[1]);
        targetPos = { col: dc, row: dr, isVertical, door };
        targetLabel = `Door: ${door.name || door.id || 'Door'}${door.is_secret ? ' (Secret)' : ''}`;
      }
    }

    // Check Furniture target
    if (!targetEntity && (st.event === 'on_furniture_searched' || st.furnitureId || (st.target && (st.target.startsWith('furn-') || (quest.furniture || []).some(f => f.id === st.target || f.name === st.target || f.type === st.target))))) {
      const furn = (quest.furniture || []).find(f => f.id === st.furnitureId || f.id === st.target || f.name === st.target || f.type === st.target);
      if (furn) {
        targetType = 'furniture';
        targetEntity = furn;
        targetPos = { col: furn.x + (furn.width || 1) / 2, row: furn.y + (furn.height || 1) / 2, furn };
        const def = FURNITURE_DEFS[furn.type];
        targetLabel = `Furniture: ${furn.name || def?.name || furn.type || 'Furniture'}`;
      }
    }

    // Check Room target
    if (!targetEntity && (st.event === 'on_room_entered' || st.event === 'on_room_searched_treasure' || st.event === 'on_room_searched_traps' || st.room || (st.target && (st.target.startsWith('room-') || (blockmap.rooms || []).some(r => r.id === st.target || r.name === st.target))))) {
      let room = null;
      const targetRoomId = st.room || st.target;
      if (targetRoomId) {
        room = (blockmap.rooms || []).find(r => r.id === targetRoomId || r.name === targetRoomId);
      }
      if (!room && st.tile) {
        room = (blockmap.rooms || []).find(r =>
          (r.tiles && r.tiles.some(t => t[0] === st.tile[0] && t[1] === st.tile[1])) ||
          (st.tile[0] >= r.x && st.tile[0] < r.x + r.w && st.tile[1] >= r.y && st.tile[1] < r.y + r.h)
        );
      }
      if (room) {
        targetType = 'room';
        targetEntity = room;
        let centerTileX = 0, centerTileY = 0;
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
        }
        targetPos = { col: centerTileX, row: centerTileY, room };
        targetLabel = `Room: ${room.name || room.id || 'Room'}`;
      }
    }

    // Fallback: Tile (e.g. on_tile_stepped_on or explicit tile)
    if (!targetEntity) {
      if (st.tile && (st.tile[0] !== 0 || st.tile[1] !== 0 || st.event === 'on_tile_stepped_on')) {
        targetType = 'tile';
        targetPos = { col: st.tile[0], row: st.tile[1] };
        targetLabel = `Tile [${st.tile[0]}, ${st.tile[1]}]`;
      } else if (st.room) {
        const room = (blockmap.rooms || []).find(r => r.id === st.room);
        if (room) {
          targetType = 'room';
          targetEntity = room;
          targetPos = { col: (room.x || 0) + (room.w || 1) / 2, row: (room.y || 0) + (room.h || 1) / 2, room };
          targetLabel = `Room: ${room.name || room.id}`;
        }
      }
    }

    if (!targetPos) {
      targetPos = { col: st.tile ? st.tile[0] : 0, row: st.tile ? st.tile[1] : 0 };
      targetLabel = `Tile [${targetPos.col}, ${targetPos.row}]`;
    }

    indicators.push({
      trigger: st,
      originalIndex,
      letter,
      marker: `Note ${letter}`,
      targetType,
      targetEntity,
      targetPos,
      targetLabel
    });
  }

  return {
    startingAction,
    indicators
  };
}

/**
 * Render a crisp, classic HeroQuest-style letter indicator onto the export canvas.
 */
function drawExportTriggerIndicator(ctx, geom, ind, options = {}) {
  ctx.save();
  const { targetType, targetPos, letter } = ind;
  const ts = geom.tileSize;

  if (targetType === 'monster') {
    // Pinned to the top-right corner of the monster token
    const mpos = tileToWorld(targetPos.col, targetPos.row, geom);
    const cx = Math.round(mpos.x + ts - 5);
    const cy = Math.round(mpos.y + 5);
    const r = 8.5;

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;

    // Outer crimson rimmed parchment pin
    ctx.fillStyle = '#fef3c7'; // parchment
    ctx.strokeStyle = '#b91c1c'; // crimson seal border
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    // Inner fine ring
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Letter
    ctx.fillStyle = '#7f1d1d';
    ctx.font = 'bold 10px Cinzel, serif, Georgia, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy);

  } else if (targetType === 'door') {
    // Pinned beside / on the door
    const basePos = tileToWorld(targetPos.col, targetPos.row, geom);
    let cx = targetPos.isVertical ? basePos.x : basePos.x + ts / 2;
    let cy = targetPos.isVertical ? basePos.y + ts / 2 : basePos.y;
    // Offset slightly into the adjacent corridor / room so the door remains visible
    if (targetPos.isVertical) cx += 9; else cy += 9;
    const r = 8.5;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#b45309'; // warm amber brass border
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#78350f';
    ctx.font = 'bold 10px Cinzel, serif, Georgia, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy);

  } else if (targetType === 'room') {
    // Room emblem
    const cx = Math.round(geom.offsetX + targetPos.col * ts);
    let cy = Math.round(geom.offsetY + targetPos.row * ts);
    // If room names are enabled, displace slightly vertically so both room name and note letter are distinct
    if (options.showRoomNames !== false) {
      cy -= 13;
    }
    const r = 11;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1.5;

    // Classic HeroQuest Quest Book parchment seal
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#78350f'; // dark oak wood/leather border
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    // Inner gold ring
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#451a03';
    ctx.font = 'bold 12px Cinzel, serif, Georgia, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy);

  } else if (targetType === 'furniture') {
    // Pinned to furniture
    const cx = Math.round(geom.offsetX + targetPos.col * ts);
    const cy = Math.round(geom.offsetY + targetPos.row * ts);
    const r = 8.5;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    ctx.fillStyle = '#78350f';
    ctx.font = 'bold 10px Cinzel, serif, Georgia, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy);

  } else {
    // Tile (e.g. corridor or floor tile)
    const tpos = tileToWorld(targetPos.col, targetPos.row, geom);
    const cx = Math.round(tpos.x + ts / 2);
    const cy = Math.round(tpos.y + ts / 2);
    const r = 9;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#0284c7'; // sapphire blue border
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#0369a1';
    ctx.font = 'bold 10px Cinzel, serif, Georgia, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy);
  }

  ctx.restore();
}

function generateExportCanvas(options = {}) {
  const scale = Number(options.scale) || 1;
  const showBanner = Boolean(options.showBanner);
  const showArtwork = options.showArtwork !== undefined ? Boolean(options.showArtwork) : true;
  const showGrid = options.showGrid !== undefined ? Boolean(options.showGrid) : true;
  const showRoomNames = options.showRoomNames !== undefined ? Boolean(options.showRoomNames) : true;
  const quest = options.quest || state.quest || {};
  const blockmap = options.blockmap || state.blockmap || {};
  const bgImg = options.bgImage !== undefined ? options.bgImage : state.bgImage;

  const geom = getGridGeometry();
  const maxC = geom.hasAdditionalBorder ? geom.cols + 1 : geom.cols;
  const maxR = geom.hasAdditionalBorder ? geom.rows + 1 : geom.rows;

  let baseWidth = geom.offsetX + maxC * geom.tileSize + 20;
  let baseHeight = geom.offsetY + maxR * geom.tileSize + 20;

  if (bgImg && bgImg.width && bgImg.height && showArtwork) {
    baseWidth = Math.max(baseWidth, bgImg.width);
    baseHeight = Math.max(baseHeight, bgImg.height);
  }

  const bannerHeight = showBanner ? 56 : 0;
  const canvasW = Math.round(baseWidth * scale);
  const canvasH = Math.round((baseHeight + bannerHeight) * scale);

  let canvas;
  if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas');
  } else {
    // Mock canvas for headless test runner
    canvas = {
      width: canvasW,
      height: canvasH,
      getContext: () => ({
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        fillText: () => {},
        translate: () => {},
        scale: () => {},
        drawImage: () => {}
      }),
      toDataURL: () => 'data:image/png;base64,mockPngData'
    };
    return canvas;
  }

  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Background fill (deep dungeon navy)
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Optional Title Banner
  if (showBanner) {
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasW, Math.round(bannerHeight * scale));
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
    ctx.beginPath();
    ctx.moveTo(0, Math.round(bannerHeight * scale));
    ctx.lineTo(canvasW, Math.round(bannerHeight * scale));
    ctx.stroke();

    // Quest Title
    ctx.font = `bold ${Math.round(20 * scale)}px Cinzel, serif, Georgia, sans-serif`;
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const title = quest.title || 'Tabletop Quest Map';
    ctx.fillText(title, Math.round(24 * scale), Math.round((bannerHeight / 2) * scale));

    // Right subtitle info
    ctx.font = `500 ${Math.round(11 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    const subText = `${geom.cols}×${geom.rows} Grid • Generated by RobOS Tabletop Quest Editor`;
    ctx.fillText(subText, canvasW - Math.round(24 * scale), Math.round((bannerHeight / 2) * scale));
    ctx.restore();
  }

  // Draw Map Board Layers
  ctx.save();
  if (showBanner) {
    ctx.translate(0, Math.round(bannerHeight * scale));
  }
  ctx.scale(scale, scale);

  drawBoardLayers(ctx, geom, {
    forExport: true,
    showImage: showArtwork,
    showGrid: showGrid,
    showRoomNames: showRoomNames,
    showCorridors: options.showCorridors !== undefined ? options.showCorridors : true,
    showRooms: options.showRooms !== undefined ? options.showRooms : true,
    showWallBlocks: options.showWallBlocks !== undefined ? options.showWallBlocks : true,
    showTraps: options.showTraps !== undefined ? options.showTraps : true,
    showFurniture: options.showFurniture !== undefined ? options.showFurniture : true,
    showDoors: options.showDoors !== undefined ? options.showDoors : true,
    showMonsters: options.showMonsters !== undefined ? options.showMonsters : true,
    showNotes: options.showNotes !== undefined ? options.showNotes : true,
    quest,
    blockmap
  });

  ctx.restore();
  return canvas;
}

function openExportPngModal() {
  if (!dom.exportPngModal) return;
  dom.exportPngModal.style.display = 'flex';
  updateExportPngPreview();
}

function closeExportPngModal() {
  if (!dom.exportPngModal) return;
  dom.exportPngModal.style.display = 'none';
}

function updateExportPngPreview() {
  if (!dom.exportPngModal) return;
  let scale = 1;
  if (dom.radioExportPngScale) {
    for (const radio of dom.radioExportPngScale) {
      if (radio.checked) {
        scale = parseInt(radio.value, 10) || 1;
        break;
      }
    }
  }
  const showGrid = dom.chkExportGrid ? dom.chkExportGrid.checked : true;
  const showRoomNames = dom.chkExportNames ? dom.chkExportNames.checked : true;
  const showArtwork = dom.chkExportArtwork ? dom.chkExportArtwork.checked : true;
  const showBanner = dom.chkExportBanner ? dom.chkExportBanner.checked : false;

  const canvas = generateExportCanvas({ scale, showGrid, showRoomNames, showArtwork, showBanner });
  if (dom.exportPngPreview && canvas.toDataURL) {
    dom.exportPngPreview.src = canvas.toDataURL('image/png');
  }
  if (dom.exportPngDimensionsBadge) {
    dom.exportPngDimensionsBadge.textContent = `${canvas.width} × ${canvas.height} px (${scale}×)`;
  }
}

async function exportPng(customOptions = {}) {
  const origBtnText = dom.btnConfirmSavePng ? dom.btnConfirmSavePng.textContent : '';
  try {
    if (dom.btnConfirmSavePng) {
      dom.btnConfirmSavePng.disabled = true;
      dom.btnConfirmSavePng.textContent = '⏳ Saving PNG...';
    }
    let scale = customOptions.scale || 1;
    let showGrid = customOptions.showGrid !== undefined ? customOptions.showGrid : true;
    let showRoomNames = customOptions.showRoomNames !== undefined ? customOptions.showRoomNames : true;
    let showArtwork = customOptions.showArtwork !== undefined ? customOptions.showArtwork : true;
    let showBanner = customOptions.showBanner !== undefined ? customOptions.showBanner : false;

    if (!customOptions.scale && dom.radioExportPngScale) {
      for (const radio of dom.radioExportPngScale) {
        if (radio.checked) {
          scale = parseInt(radio.value, 10) || 1;
          break;
        }
      }
    }
    if (customOptions.showGrid === undefined && dom.chkExportGrid) {
      showGrid = dom.chkExportGrid.checked;
    }
    if (customOptions.showRoomNames === undefined && dom.chkExportNames) {
      showRoomNames = dom.chkExportNames.checked;
    }
    if (customOptions.showArtwork === undefined && dom.chkExportArtwork) {
      showArtwork = dom.chkExportArtwork.checked;
    }
    if (customOptions.showBanner === undefined && dom.chkExportBanner) {
      showBanner = dom.chkExportBanner.checked;
    }

    const canvas = generateExportCanvas({ scale, showGrid, showRoomNames, showArtwork, showBanner });
    const dataUrl = canvas.toDataURL ? canvas.toDataURL('image/png') : '';

    if (!window.robosQuestEditor || !window.robosQuestEditor.savePng) {
      closeExportPngModal();
      return { success: true, dataUrl, width: canvas.width, height: canvas.height };
    }

    const defaultName = `${state.quest.slug || 'tabletop-quest'}-map-${scale}x.png`;
    const res = await window.robosQuestEditor.savePng({ dataUrl, defaultName });
    if (res && res.success) {
      showToast(`Exported PNG map: ${res.fileName}`, 'success');
      closeExportPngModal();
    } else if (res && res.canceled) {
      // User canceled save dialog
    } else if (res && res.error) {
      showToast(`Export PNG failed: ${res.error}`, 'error');
    }
    return res;
  } catch (err) {
    showToast(`Export PNG error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  } finally {
    if (dom.btnConfirmSavePng) {
      dom.btnConfirmSavePng.disabled = false;
      dom.btnConfirmSavePng.textContent = origBtnText || '💾 Save PNG File...';
    }
  }
}

async function copyPngToClipboard(customOptions = {}) {
  try {
    let scale = customOptions.scale || 1;
    if (!customOptions.scale && dom.radioExportPngScale) {
      for (const radio of dom.radioExportPngScale) {
        if (radio.checked) {
          scale = parseInt(radio.value, 10) || 1;
          break;
        }
      }
    }
    const showGrid = customOptions.showGrid !== undefined ? customOptions.showGrid : (dom.chkExportGrid ? dom.chkExportGrid.checked : true);
    const showRoomNames = customOptions.showRoomNames !== undefined ? customOptions.showRoomNames : (dom.chkExportNames ? dom.chkExportNames.checked : true);
    const showArtwork = customOptions.showArtwork !== undefined ? customOptions.showArtwork : (dom.chkExportArtwork ? dom.chkExportArtwork.checked : true);
    const showBanner = customOptions.showBanner !== undefined ? customOptions.showBanner : (dom.chkExportBanner ? dom.chkExportBanner.checked : false);

    const canvas = generateExportCanvas({ scale, showGrid, showRoomNames, showArtwork, showBanner });
    const dataUrl = canvas.toDataURL ? canvas.toDataURL('image/png') : '';

    if (window.robosQuestEditor && window.robosQuestEditor.copyImageToClipboard) {
      const res = await window.robosQuestEditor.copyImageToClipboard(dataUrl);
      if (res && res.success) {
        showToast('Copied high-res map image to clipboard!', 'success');
        closeExportPngModal();
      } else {
        showToast(`Failed to copy image: ${res?.error || 'Unknown error'}`, 'error');
      }
      return res;
    } else {
      showToast('Clipboard copy not available in this environment', 'info');
      closeExportPngModal();
      return { success: false };
    }
  } catch (err) {
    showToast(`Clipboard error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

function openExportPdfModal() {
  if (!dom.exportPdfModal) return;
  dom.exportPdfModal.style.display = 'flex';
}

function closeExportPdfModal() {
  if (!dom.exportPdfModal) return;
  dom.exportPdfModal.style.display = 'none';
}

/**
 * Format a trigger event ID into an icon + user-friendly label.
 */
function formatTriggerEventName(event) {
  if (!event) return 'Trigger Event';
  const def = (typeof TRIGGER_EVENT_DEFS !== 'undefined') && TRIGGER_EVENT_DEFS[event];
  if (def) {
    return `${def.icon ? def.icon + ' ' : ''}${def.label || event}`;
  }
  return String(event)
    .replace(/^on_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Recursively formats an array of trigger actions into clean, printable HTML.
 * Formats full details of every action type (dialogue lines, movies, moves, spells, traps, rewards)
 * and recursively indents nested/sub-actions.
 */
function renderActionPipelineRecursiveHtml(actions, prefix = '', depth = 0) {
  if (!actions || !Array.isArray(actions) || actions.length === 0) return '';
  const indentStyle = depth > 0 ? `margin-left: ${Math.min(depth * 12, 36)}px; border-left: 2px solid #93c5fd; padding-left: 8px;` : '';

  return `<div class="action-pipeline-list" style="${indentStyle}">
    ${actions.map((a, idx) => {
      if (!a) return '';
      const numStr = prefix ? `${prefix}${idx + 1}` : `${idx + 1}`;
      const type = a.type || 'action';
      const def = (typeof TRIGGER_ACTION_DEFS !== 'undefined' && TRIGGER_ACTION_DEFS[type]) || { icon: '⚡', name: type };
      const icon = def.icon || '⚡';
      let titleHtml = `<strong>${numStr}. ${icon} ${escapeHtml(def.name || type)}</strong>`;
      if (a.title && a.title !== def.name) {
        titleHtml += `: <span style="color:#0369a1; font-weight:600;">${escapeHtml(a.title)}</span>`;
      }

      let detailsHtml = '';

      if (type === 'dialogue') {
        const rawLines = Array.isArray(a.lines) ? a.lines : (a.text ? [{ speaker: a.speaker, text: a.text, audio: a.audio, fade_timeout: a.fade_timeout }] : []);
        if (rawLines.length > 0) {
          detailsHtml = `<div class="action-dialogue-block" style="margin-top:3px; display:flex; flex-direction:column; gap:3px;">
            ${rawLines.map(l => {
              const spk = l.speaker || 'Speaker';
              const txt = l.text || '';
              return `<div class="action-dialogue-line" style="background:#f0f9ff; border-left:3px solid #0284c7; border-radius:3px; padding:3px 6px; font-size:8pt; line-height:1.35;">
                <span class="action-dialogue-speaker" style="font-weight:700; color:#0369a1;">💬 ${escapeHtml(spk)}:</span>
                <span class="action-dialogue-text" style="color:#0f172a; font-style:italic;">"${escapeHtml(txt)}"</span>
                ${l.audio ? `<span style="font-size:7pt; color:#64748b; margin-left:6px;">🎵 ${escapeHtml(l.audio)}</span>` : ''}
                ${l.fade_timeout ? `<span style="font-size:7pt; color:#64748b; margin-left:6px;">⏱️ ${l.fade_timeout}s</span>` : ''}
              </div>`;
            }).join('')}
          </div>`;
        }
      } else if (type === 'play_movie') {
        const movieFile = a.moviePath || a.movie || a.file || '';
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; color:#475569; margin-top:2px;">
          ${movieFile ? `<span>📹 File: <code>${escapeHtml(movieFile)}</code></span>` : ''}
          ${a.canSkip !== undefined ? `<span style="margin-left:6px; color:#64748b;">(${a.canSkip ? 'Skippable' : 'Non-skippable'})</span>` : ''}
          ${(a.narration || a.description) ? `<div style="margin-top:2px; font-style:italic; color:#334155;">🎙️ "${escapeHtml(a.narration || a.description)}"</div>` : ''}
        </div>`;
      } else if (type === 'furniture_visible') {
        const target = a.target || a.furnitureId || 'Furniture';
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; color:#475569; margin-top:2px;">
          <span>Target: <strong>${escapeHtml(target)}</strong></span>
          ${a.furnitureId ? `<span style="margin-left:4px; font-size:7pt; color:#64748b;">(ID: ${escapeHtml(a.furnitureId)})</span>` : ''}
          ${a.visible !== undefined ? `<span style="margin-left:6px; font-weight:600; color:${a.visible ? '#15803d' : '#b91c1c'};">${a.visible ? '👁️ Made Visible' : '🙈 Hidden'}</span>` : ''}
        </div>`;
      } else if (type === 'move_furniture') {
        const target = a.target || a.furnitureId || 'Furniture';
        const destX = a.x !== undefined ? a.x : a.tile?.[0];
        const destY = a.y !== undefined ? a.y : a.tile?.[1];
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; color:#475569; margin-top:2px;">
          <span>Target: <strong>${escapeHtml(target)}</strong> → Destination: <strong>[${destX}, ${destY}]</strong></span>
          ${a.furnitureId ? `<span style="margin-left:4px; font-size:7pt; color:#64748b;">(ID: ${escapeHtml(a.furnitureId)})</span>` : ''}
          ${a.message ? `<div style="margin-top:2px; color:#0f766e; font-style:italic;">📢 "${escapeHtml(a.message)}"</div>` : ''}
        </div>`;
      } else if (type === 'show_message' || type === 'display_message') {
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; margin-top:2px;">
          <div style="font-style:italic; color:#334155;">"${escapeHtml(a.text || '')}"</div>
          ${a.buttonText ? `<span style="font-size:7pt; color:#64748b;">(Button: ${escapeHtml(a.buttonText)})</span>` : ''}
        </div>`;
      } else if (type === 'attack_character') {
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; color:#475569; margin-top:2px;">
          <span>Attacker: <strong>${escapeHtml(a.attacker || 'Hazard')}</strong></span> • 
          <span>Target: <strong>${escapeHtml(a.target || 'active_hero')}</strong></span> • 
          <span>Damage: <strong>${a.damageDice ? a.damageDice + ' dice' : (a.damage || 2) + ' wounds'}</strong></span>
        </div>`;
      } else if (type === 'cast_spell') {
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; color:#475569; margin-top:2px;">
          <span>Spell: <strong>${escapeHtml(a.spell || 'Spell')}</strong></span>
          ${a.caster ? ` • <span>Caster: ${escapeHtml(a.caster)}</span>` : ''}
          ${a.target ? ` • <span>Target: ${escapeHtml(a.target)}</span>` : ''}
        </div>`;
      } else if (type === 'spring_trap') {
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; color:#475569; margin-top:2px;">
          <span>Trap: <strong>${escapeHtml((a.trapType || a.trap || 'trap').replace('_', ' '))}</strong></span>
          ${a.damage !== undefined ? ` • <span>Damage: ${a.damage} wounds</span>` : ''}
        </div>`;
      } else if (type === 'spawn_monsters') {
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; color:#475569; margin-top:2px;">
          <span>Monster: <strong>${escapeHtml(a.monsterType || 'Monster')}</strong> ×${a.count || 1}</span>
          ${a.roomId ? ` • <span>Room: ${escapeHtml(a.roomId)}</span>` : ''}
          ${a.tile ? ` • <span>Tile: [${a.tile.join(', ')}]</span>` : ''}
        </div>`;
      } else if (type === 'grant_reward') {
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; color:#475569; margin-top:2px;">
          ${a.gold ? `<span>💰 ${a.gold} Gold</span>` : ''}
          ${a.item ? `<span>🎁 ${escapeHtml(a.item)}</span>` : ''}
        </div>`;
      } else if (type === 'end_game') {
        detailsHtml = `<div class="action-details" style="font-size:7.5pt; color:#475569; margin-top:2px;">
          <span>Outcome: <strong>${escapeHtml((a.outcome || 'victory').toUpperCase())}</strong></span>
        </div>`;
      } else {
        const keys = Object.keys(a).filter(k => !['type', 'title', 'actions', 'subActions', 'then', 'onComplete', 'nextActions', '$$hashKey'].includes(k));
        if (keys.length > 0) {
          detailsHtml = `<div class="action-details" style="font-size:7pt; color:#64748b; margin-top:2px;">
            ${keys.map(k => `${k}: <strong>${escapeHtml(String(a[k]))}</strong>`).join(' • ')}
          </div>`;
        }
      }

      // Check for nested/recursive actions
      const subActionLists = [a.actions, a.subActions, a.then, a.onComplete, a.nextActions, a.onSuccess, a.onFailure, a.pipeline, a.steps].filter(list => Array.isArray(list) && list.length > 0);
      let nestedHtml = '';
      if (subActionLists.length > 0) {
        nestedHtml = subActionLists.map(list => renderActionPipelineRecursiveHtml(list, `${numStr}.`, depth + 1)).join('');
      }

      // Check for conditional branching / choices
      if (Array.isArray(a.choices) && a.choices.length > 0) {
        nestedHtml += a.choices.map((c, cIdx) => {
          const choiceLabel = c.label || c.text || `Branch ${cIdx + 1}`;
          const choiceActions = c.actions || c.then || [];
          return `<div style="margin-top:3px; margin-left:${Math.min((depth + 1) * 12, 36)}px; border-left:2px dashed #a855f7; padding-left:8px;">
            <div style="font-size:7.5pt; font-weight:700; color:#7e22ce;">🔀 Branch: ${escapeHtml(choiceLabel)}</div>
            ${renderActionPipelineRecursiveHtml(choiceActions, `${numStr}.${cIdx + 1}.`, depth + 2)}
          </div>`;
        }).join('');
      }

      return `<div class="action-item">
        <div class="action-item-header">${titleHtml}</div>
        ${detailsHtml}
        ${nestedHtml}
      </div>`;
    }).join('')}
  </div>`;
}

function generateQuestPdfHtml(quest, blockmap, mapDataUrl, options = {}) {
  quest = quest || state.quest || {};
  blockmap = blockmap || state.blockmap || {};
  const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
  const pageSize = options.pageSize === 'Letter' ? 'letter' : 'a4';
  const includeHeader = options.includeHeader !== false;
  const includeMap = options.includeMap !== false && !!mapDataUrl;
  const includeNotes = options.includeNotes !== false;
  const includeActions = options.includeActions !== false;
  const includeRoster = options.includeRoster !== false;
  const includeFurniture = options.includeFurniture !== false;

  // Aggregate monsters
  const monsters = quest.monsters || [];
  const monsterCounts = {};
  monsters.forEach(m => {
    const type = m.type || 'goblin';
    if (!monsterCounts[type]) {
      const def = MONSTER_DEFS[type] || { name: type, move: 6, attack: 2, defend: 2, body: 1, mind: 1, icon: '👾' };
      monsterCounts[type] = {
        name: def.name || type,
        icon: def.icon || '👾',
        count: 0,
        move: def.move || 6,
        attack: def.attack || 2,
        defend: def.defend || 2,
        body: def.body || 1,
        mind: def.mind || 1,
        bossCount: 0
      };
    }
    monsterCounts[type].count++;
    if (m.isBoss) monsterCounts[type].bossCount++;
  });

  // Aggregate furniture
  const furniture = quest.furniture || [];
  const furnCounts = {};
  furniture.forEach(f => {
    const type = f.type || 'chest';
    const def = FURNITURE_DEFS[type] || { name: type, icon: '🪑' };
    if (!furnCounts[type]) {
      furnCounts[type] = { name: def.name || type, icon: def.icon || '🪑', count: 0 };
    }
    furnCounts[type].count++;
  });

  // Aggregate traps
  const traps = quest.traps || [];
  const trapCounts = {};
  traps.forEach(t => {
    const type = t.type || 'pit';
    trapCounts[type] = (trapCounts[type] || 0) + 1;
  });

  // Story triggers / notes & starting quest action
  const { startingAction, indicators } = resolveTriggerIndicators(quest, blockmap);
  const notes = indicators;

  const title = quest.title || 'Tabletop Quest Map';
  const briefing = quest.briefing || quest.description || quest.header?.description || '';
  const wanderingMonster = quest.wanderingMonster ? (MONSTER_DEFS[quest.wanderingMonster]?.name || quest.wanderingMonster) : 'None';
  const goldBounty = quest.goldBounty !== undefined ? quest.goldBounty : 0;
  const startLoc = quest.startingStair ? `[${quest.startingStair[0]}, ${quest.startingStair[1]}]` : 'Not set';
  const exitLoc = quest.exitTile ? `[${quest.exitTile[0]}, ${quest.exitTile[1]}]` : (quest.startingStair ? `${startLoc} (Return to Entrance)` : 'None');

  // Starting quest action displayed as intro text alongside quest briefing
  let introHtml = '';
  if (briefing) {
    introHtml += `<div class="story-briefing-text">${escapeHtml(briefing).replace(/\n/g, '<br>')}</div>`;
  }
  if (startingAction) {
    const startNarrative = startingAction.narrative;
    if (startNarrative && startNarrative.trim() && startNarrative.trim() !== briefing.trim()) {
      introHtml += `<div class="story-starting-action-text" style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #cbd5e1; color: #1e293b;">${escapeHtml(startNarrative).replace(/\n/g, '<br>')}</div>`;
    }
    const movieAction = startingAction.actions?.find(a => a.type === 'play_movie');
    if (movieAction) {
      introHtml += `<div style="margin-top: 5px; font-size: 8pt; color: #0284c7; font-style: normal; font-weight: 600;">🎬 Opening Cinematic: ${escapeHtml(movieAction.title || movieAction.moviePath || 'Intro Movie')}</div>`;
    }
    const dialogueAction = startingAction.actions?.find(a => a.type === 'dialogue');
    if (dialogueAction && dialogueAction.lines && dialogueAction.lines.length > 0) {
      introHtml += `<div style="margin-top: 4px; font-size: 8pt; color: #475569; font-style: italic;">${dialogueAction.lines.map(l => `"${escapeHtml(l.text)}"`).join(' ')}</div>`;
    }
    if (includeActions && startingAction.actions && startingAction.actions.length > 0) {
      introHtml += `<div class="action-pipeline-container" style="margin-top:6px; padding-top:4px; border-top:1px dashed #cbd5e1;">
        <div class="action-pipeline-header" style="font-size:7.5pt; font-weight:700; color:#0369a1; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:3px;">
          ⚡ Opening Action Pipeline (${startingAction.actions.length} action${startingAction.actions.length !== 1 ? 's' : ''}):
        </div>
        ${renderActionPipelineRecursiveHtml(startingAction.actions, '', 0)}
      </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page {
    size: ${pageSize} ${orientation};
    margin: 10mm 12mm 10mm 12mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    margin: 0;
    padding: 0;
    line-height: 1.35;
    font-size: 9.5pt;
  }
  .quest-sheet {
    width: 100%;
    margin: 0 auto;
  }
  .quest-header {
    border-bottom: 2.5px solid #0f172a;
    padding-bottom: 6px;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .quest-title-block h1 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 20pt;
    margin: 0 0 2px 0;
    color: #0f172a;
    letter-spacing: 0.5px;
  }
  .quest-subtitle {
    font-size: 8.5pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 700;
  }
  .quest-meta-pills {
    display: flex;
    gap: 8px;
    font-size: 8pt;
  }
  .meta-pill {
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 3px 8px;
    color: #334155;
  }
  .meta-pill strong {
    color: #0f172a;
  }
  .story-briefing {
    background: #f8fafc;
    border-left: 3.5px solid #0284c7;
    border-radius: 4px;
    padding: 8px 12px;
    margin-bottom: 10px;
    font-style: italic;
    color: #334155;
    font-size: 9pt;
    line-height: 1.4;
  }
  .story-briefing-title {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-style: normal;
    color: #0369a1;
    margin-bottom: 3px;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .map-container {
    text-align: center;
    margin-bottom: 10px;
    page-break-inside: avoid;
  }
  .map-container img {
    max-width: 100%;
    max-height: ${orientation === 'landscape' ? '125mm' : '155mm'};
    object-fit: contain;
    border: 1.5px solid #334155;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  }
  .details-columns {
    display: grid;
    grid-template-columns: ${orientation === 'landscape' ? '1.15fr 0.85fr' : '1fr'};
    gap: 12px;
    page-break-inside: auto;
  }
  .section-card {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 10px;
    page-break-inside: auto;
  }
  .section-heading {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 10.5pt;
    font-weight: 700;
    color: #0f172a;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 3px;
    margin-top: 0;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .notes-flow {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .note-entry {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 8.5pt;
    background: #f8fafc;
    padding: 6px 9px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    page-break-inside: avoid;
  }
  .note-disc {
    background: #0f172a;
    color: #ffffff;
    font-weight: 700;
    font-family: monospace;
    font-size: 8pt;
    min-width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .note-body {
    flex: 1;
  }
  .note-head {
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 2px;
  }
  .note-desc {
    color: #475569;
    font-size: 8pt;
    line-height: 1.35;
  }
  .note-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 2px 0 4px 0;
    font-size: 7.5pt;
    color: #475569;
  }
  .note-meta-tag {
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    padding: 1px 5px;
    font-weight: 500;
  }
  .note-meta-event {
    background: #e0f2fe;
    color: #0369a1;
    border-color: #bae6fd;
    font-weight: 600;
  }
  .note-meta-hidden {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fecaca;
  }
  .note-narrative-box {
    background: #fffbeb;
    border-left: 3px solid #f59e0b;
    border-radius: 3px;
    padding: 4px 8px;
    margin: 4px 0;
    color: #78350f;
    font-size: 8pt;
    line-height: 1.35;
  }
  .action-pipeline-container {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px dashed #cbd5e1;
  }
  .action-pipeline-header {
    font-size: 7.5pt;
    font-weight: 700;
    color: #0369a1;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
  }
  .action-pipeline-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .action-item {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 4px 8px;
    margin: 2px 0;
    font-size: 8pt;
    line-height: 1.35;
  }
  .action-item-header {
    font-size: 8pt;
    color: #1e293b;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .action-details {
    margin-top: 2px;
    color: #475569;
    font-size: 7.5pt;
  }
  .action-dialogue-block {
    margin-top: 3px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .action-dialogue-line {
    background: #f0f9ff;
    border-left: 3px solid #0284c7;
    border-radius: 3px;
    padding: 3px 6px;
    font-size: 8pt;
    line-height: 1.3;
  }
  .action-dialogue-speaker {
    font-weight: 700;
    color: #0369a1;
    margin-right: 4px;
  }
  .action-dialogue-text {
    color: #0f172a;
    font-style: italic;
  }
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
  }
  table.data-table th {
    background: #f1f5f9;
    color: #334155;
    font-weight: 700;
    text-align: center;
    padding: 3px 5px;
    border-bottom: 1.5px solid #cbd5e1;
  }
  table.data-table td {
    padding: 3px 5px;
    border-bottom: 1px solid #f1f5f9;
    text-align: center;
    color: #1e293b;
  }
  table.data-table td.text-left {
    text-align: left;
  }
  .boss-badge {
    background: #e11d48;
    color: #ffffff;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 6.5pt;
    font-weight: 700;
    margin-left: 4px;
  }
  .pill-tag {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 7.5pt;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    color: #334155;
    margin-right: 4px;
    margin-bottom: 4px;
  }
  .footer-line {
    border-top: 1px solid #e2e8f0;
    padding-top: 4px;
    display: flex;
    justify-content: space-between;
    font-size: 7pt;
    color: #94a3b8;
    margin-top: 8px;
  }
</style>
</head>
<body>
<div class="quest-sheet">
  ${includeHeader ? `
  <div class="quest-header">
    <div class="quest-title-block">
      <h1>${escapeHtml(title)}</h1>
      <div class="quest-subtitle">Tabletop RPG Adventure Module • RobOS Quest Platform</div>
    </div>
    <div class="quest-meta-pills">
      <div class="meta-pill"><strong>Wandering:</strong> ${escapeHtml(wanderingMonster)}</div>
      <div class="meta-pill"><strong>Bounty:</strong> ${goldBounty} Gold</div>
      <div class="meta-pill"><strong>Entrance:</strong> ${startLoc}</div>
      <div class="meta-pill"><strong>Exit:</strong> ${exitLoc}</div>
    </div>
  </div>
  ${introHtml ? `
  <div class="story-briefing">
    <div class="story-briefing-title">📜 The Quest Briefing</div>
    ${introHtml}
  </div>` : ''}
  ` : ''}

  ${includeMap ? `
  <div class="map-container">
    <img src="${mapDataUrl}" alt="${escapeHtml(title)} Dungeon Map" />
  </div>
  ` : ''}

  <div class="details-columns">
    ${includeNotes ? `
    <div class="section-card">
      <div class="section-heading">
        <span>📜 Quest Notes &amp; Story Triggers</span>
        <span style="font-size:8pt; font-weight:normal; color:#64748b;">${notes.length} Triggers</span>
      </div>
      ${notes.length > 0 ? `
      <div class="notes-flow">
        ${notes.map(ind => {
          const st = ind.trigger;
          const mark = ind.letter;
          const targetStr = ind.targetLabel;
          const noteTitle = st.title || st.name || '';
          const eventLabel = formatTriggerEventName(st.event);
          return `
          <div class="note-entry">
            <div class="note-disc">${escapeHtml(mark)}</div>
            <div class="note-body">
              <div class="note-head">Note ${escapeHtml(mark)}${noteTitle ? ': ' + escapeHtml(noteTitle) : ''} <span style="font-weight:normal; color:#64748b;">(${escapeHtml(targetStr)})</span></div>
              <div class="note-meta-row">
                <span class="note-meta-tag note-meta-event">${escapeHtml(eventLabel)}</span>
                ${targetStr ? `<span class="note-meta-tag">🎯 ${escapeHtml(targetStr)}</span>` : ''}
                ${st.room ? `<span class="note-meta-tag">🚪 Room: ${escapeHtml(st.room)}</span>` : ''}
                ${st.tile && Array.isArray(st.tile) && (st.tile[0] !== 0 || st.tile[1] !== 0) ? `<span class="note-meta-tag">📍 Tile: [${st.tile.join(', ')}]</span>` : ''}
                ${st.onceOnly !== undefined ? `<span class="note-meta-tag">${st.onceOnly ? '🔒 Once Only' : '🔄 Repeatable'}</span>` : ''}
                ${st.hidden ? `<span class="note-meta-tag note-meta-hidden">👁️ Hidden</span>` : ''}
              </div>
              ${st.narrative ? `<div class="note-desc note-narrative-box"><strong>📜 Narrative:</strong> ${escapeHtml(st.narrative)}</div>` : ''}
              ${(st.actions && st.actions.length > 0) ? (
                includeActions ? `
                  <div class="action-pipeline-container">
                    <div class="action-pipeline-header">
                      ⚡ Action Pipeline (${st.actions.length} action${st.actions.length !== 1 ? 's' : ''}):
                    </div>
                    ${renderActionPipelineRecursiveHtml(st.actions, '', 0)}
                  </div>
                ` : `
                  <div style="margin-top:2px; font-size:7.5pt; color:#0369a1;">
                    ${st.actions.map(a => `• ${escapeHtml(a.type)}${a.title ? ': ' + escapeHtml(a.title) : ''}`).join(' ')}
                  </div>
                `
              ) : ''}
            </div>
          </div>`;
        }).join('')}
      </div>` : '<div style="color:#94a3b8; font-style:italic;">No custom story triggers placed in this quest.</div>'}
    </div>
    ` : ''}

    <div>
      ${includeRoster ? `
      <div class="section-card">
        <div class="section-heading">
          <span>👾 Monster Roster &amp; Statistics</span>
          <span style="font-size:8pt; font-weight:normal; color:#64748b;">${monsters.length} Total</span>
        </div>
        ${Object.keys(monsterCounts).length > 0 ? `
        <table class="data-table">
          <thead>
            <tr>
              <th class="text-left">Monster</th>
              <th>Qty</th>
              <th>Move</th>
              <th>Attack</th>
              <th>Defend</th>
              <th>Body</th>
              <th>Mind</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(monsterCounts).map(mc => `
            <tr>
              <td class="text-left">${mc.icon} <strong>${escapeHtml(mc.name)}</strong>${mc.bossCount > 0 ? ` <span class="boss-badge">BOSS ×${mc.bossCount}</span>` : ''}</td>
              <td><strong>${mc.count}</strong></td>
              <td>${mc.move}</td>
              <td>${mc.attack}⚔️</td>
              <td>${mc.defend}🛡️</td>
              <td>${mc.body}❤️</td>
              <td>${mc.mind}🧠</td>
            </tr>
            `).join('')}
          </tbody>
        </table>` : '<div style="color:#94a3b8; font-style:italic;">No monsters placed.</div>'}
      </div>
      ` : ''}

      ${includeFurniture ? `
      <div class="section-card">
        <div class="section-heading">
          <span>🪑 Furniture &amp; Dungeon Features</span>
          <span style="font-size:8pt; font-weight:normal; color:#64748b;">${furniture.length} Pieces • ${traps.length} Traps</span>
        </div>
        <div style="margin-bottom:6px;">
          ${Object.values(furnCounts).map(fc => `
            <span class="pill-tag">${fc.icon} ${escapeHtml(fc.name)}: <strong>${fc.count}</strong></span>
          `).join('')}
          ${Object.keys(furnCounts).length === 0 ? '<span style="color:#94a3b8; font-style:italic;">No furniture. </span>' : ''}
        </div>
        ${Object.keys(trapCounts).length > 0 ? `
        <div style="font-size:8pt; color:#b91c1c; border-top:1px dashed #e2e8f0; padding-top:4px;">
          ⚠️ <strong>Traps:</strong> ${Object.entries(trapCounts).map(([k, v]) => `${k.replace('_', ' ')} (${v})`).join(', ')}
        </div>` : ''}
      </div>
      ` : ''}
    </div>
  </div>

  <div class="footer-line">
    <span>RobOS Tabletop Quest Map Editor</span>
    <span>Generated: ${new Date().toLocaleDateString()}</span>
  </div>
</div>
</body>
</html>`;
}

async function exportPdf(customOptions = {}) {
  const origBtnText = dom.btnConfirmSavePdf ? dom.btnConfirmSavePdf.textContent : '';
  try {
    if (dom.btnConfirmSavePdf) {
      dom.btnConfirmSavePdf.disabled = true;
      dom.btnConfirmSavePdf.textContent = '⏳ Preparing PDF...';
    }
    let orientation = customOptions.orientation || 'landscape';
    if (!customOptions.orientation && dom.radioExportPdfOrientation) {
      for (const radio of dom.radioExportPdfOrientation) {
        if (radio.checked) {
          orientation = radio.value;
          break;
        }
      }
    }
    const pageSize = customOptions.pageSize || (dom.selectPdfPageSize ? dom.selectPdfPageSize.value : 'A4');
    const includeHeader = customOptions.includeHeader !== undefined ? customOptions.includeHeader : (dom.chkPdfHeader ? dom.chkPdfHeader.checked : true);
    const includeMap = customOptions.includeMap !== undefined ? customOptions.includeMap : (dom.chkPdfMap ? dom.chkPdfMap.checked : true);
    const includeNotes = customOptions.includeNotes !== undefined ? customOptions.includeNotes : (dom.chkPdfNotes ? dom.chkPdfNotes.checked : true);
    const includeActions = customOptions.includeActions !== undefined ? customOptions.includeActions : (dom.chkPdfActions ? dom.chkPdfActions.checked : true);
    const includeRoster = customOptions.includeRoster !== undefined ? customOptions.includeRoster : (dom.chkPdfRoster ? dom.chkPdfRoster.checked : true);
    const includeFurniture = customOptions.includeFurniture !== undefined ? customOptions.includeFurniture : (dom.chkPdfFurniture ? dom.chkPdfFurniture.checked : true);

    // Generate crisp 2x map for print
    const mapCanvas = generateExportCanvas({
      scale: 2,
      showBanner: false,
      showArtwork: true,
      showGrid: true,
      showRoomNames: true
    });
    const mapDataUrl = mapCanvas.toDataURL ? mapCanvas.toDataURL('image/png') : '';

    const html = generateQuestPdfHtml(state.quest, state.blockmap, mapDataUrl, {
      orientation,
      pageSize,
      includeHeader,
      includeMap,
      includeNotes,
      includeActions,
      includeRoster,
      includeFurniture
    });

    if (!window.robosQuestEditor || !window.robosQuestEditor.exportPdf) {
      closeExportPdfModal();
      return { success: true, html };
    }

    const defaultName = `${state.quest.slug || 'tabletop-quest'}-quest-sheet.pdf`;
    const res = await window.robosQuestEditor.exportPdf({
      html,
      orientation,
      pageSize,
      defaultName
    });

    if (res && res.success) {
      showToast(`Exported PDF Quest Sheet: ${res.fileName}`, 'success');
      closeExportPdfModal();
    } else if (res && res.canceled) {
      // User canceled file dialog
    } else if (res && res.error) {
      showToast(`Export PDF failed: ${res.error}`, 'error');
    }
    return res;
  } catch (err) {
    showToast(`Export PDF error: ${err.message}`, 'error');
    return { success: false, error: err.message };
  } finally {
    if (dom.btnConfirmSavePdf) {
      dom.btnConfirmSavePdf.disabled = false;
      dom.btnConfirmSavePdf.textContent = origBtnText || '💾 Save PDF Document...';
    }
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
    { key: 'token_abomination', path: 'assets/tokens/token_fimir.png' },
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

function tileToWorld(col, row, geomOverride) {
  const geom = geomOverride || getGridGeometry();
  return {
    x: geom.offsetX + col * geom.tileSize,
    y: geom.offsetY + row * geom.tileSize
  };
}

function isBorderTile(col, row, geomOverride) {
  const geom = geomOverride || getGridGeometry();
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

  let [col, row] = tile;
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

  // Double door sizing / snapping adjustments
  const isDouble2x1 = state.subtool.doorSize === 'double-2x1' || (state.subtool.doorSize === 'double-auto' && orientation === 'h');
  const isDouble1x2 = state.subtool.doorSize === 'double-1x2' || (state.subtool.doorSize === 'double-auto' && orientation === 'v');

  if (state.subtool.doorSize === 'double-2x1') {
    if (orientation === 'v') {
      orientation = 'h';
      if (relY < 0.5) {
        to = [col, row - 1];
        cy = tilePos.y;
      } else {
        to = [col, row + 1];
        cy = tilePos.y + geom.tileSize;
      }
    }
  } else if (state.subtool.doorSize === 'double-1x2') {
    if (orientation === 'h') {
      orientation = 'v';
      if (relX < 0.5) {
        to = [col - 1, row];
        cx = tilePos.x;
      } else {
        to = [col + 1, row];
        cx = tilePos.x + geom.tileSize;
      }
    }
  }

  if (isDouble2x1) {
    if (col >= geom.cols - 1) {
      col = Math.max(0, geom.cols - 2);
      from[0] = col;
      to[0] = col;
    }
    const baseP = tileToWorld(col, row);
    cx = baseP.x + geom.tileSize;
  } else if (isDouble1x2) {
    if (row >= geom.rows - 1) {
      row = Math.max(0, geom.rows - 2);
      from[1] = row;
      to[1] = row;
    }
    const baseP = tileToWorld(col, row);
    cy = baseP.y + geom.tileSize;
  }

  // Determine target room
  const room1 = findRoomAtTile(from[0], from[1]);
  const room2 = findRoomAtTile(to[0], to[1]);
  const room = room1 ? room1.id : (room2 ? room2.id : '');

  return { from, to, orientation, cx, cy, room, isDouble2x1, isDouble1x2 };
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

  drawBoardLayers(ctx, geom, { forExport: false });

  // 11.6. Validation Warnings Overlay
  if (state.layers.showValidationWarnings && state.validation && state.validation.errors && state.validation.errors.length > 0) {
    renderValidationCanvasOverlays(ctx, geom);
  }

  // 12. Hover & Placement Ghost Preview
  renderToolPreview(ctx, geom);

  ctx.restore();
}

function drawBoardLayers(ctx, geom, options = {}) {
  const forExport = !!options.forExport;
  const quest = options.quest || state.quest || {};
  const blockmap = options.blockmap || state.blockmap || {};
  const showGrid = options.showGrid !== undefined ? options.showGrid : state.layers.showGrid;
  const showRoomNames = options.showRoomNames !== undefined ? options.showRoomNames : state.layers.showRoomNames;
  const showImage = options.showImage !== undefined ? options.showImage : state.layers.showImage;
  const showCorridors = options.showCorridors !== undefined ? options.showCorridors : state.layers.showCorridors;
  const showRooms = options.showRooms !== undefined ? options.showRooms : state.layers.showRooms;
  const showWallBlocks = options.showWallBlocks !== undefined ? options.showWallBlocks : state.layers.showWallBlocks;
  const showTraps = options.showTraps !== undefined ? options.showTraps : state.layers.showTraps;
  const showFurniture = options.showFurniture !== undefined ? options.showFurniture : state.layers.showFurniture;
  const showDoors = options.showDoors !== undefined ? options.showDoors : state.layers.showDoors;
  const showMonsters = options.showMonsters !== undefined ? options.showMonsters : state.layers.showMonsters;
  const showNotes = options.showNotes !== undefined ? options.showNotes : state.layers.showNotes;

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
  if (showImage && state.bgImage) {
    ctx.save();
    ctx.globalAlpha = state.layers.artOpacity;
    ctx.drawImage(state.bgImage, 0, 0);
    ctx.restore();
  }

  // 2. Corridors Underlay (Layer 1)
  if (showCorridors && state.blockmap?.corridors) {
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
  if (showRooms && state.blockmap?.rooms) {
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
  if (showGrid) {
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

  // 5. Wall Blocks (Layer 2)
  if (showWallBlocks && state.quest.wallBlocks) {
    state.quest.wallBlocks.forEach((wb, i) => {
      const pos = tileToWorld(wb.x, wb.y, geom);
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

      if (!forExport && state.selectedEntity && state.selectedEntity.type === 'wall-block' && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, bw, bh, ctx);
      }
    });
  }

  // 6. Traps (Layer 2)
  if (showTraps && state.quest.traps) {
    state.quest.traps.forEach((tr, i) => {
      const pos = tileToWorld(tr.x, tr.y, geom);
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

      if (!forExport && state.selectedEntity && state.selectedEntity.type === 'trap' && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, geom.tileSize, geom.tileSize, ctx);
      }
    });
  }

  // 7. Furniture & Map Items (Layer 2)
  if (showFurniture && state.quest.furniture) {
    state.quest.furniture.forEach((f, i) => {
      const pos = tileToWorld(f.x, f.y, geom);
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

      if (f.hidden) {
        ctx.save();
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(pos.x + 1, pos.y + 1, fw - 2, fh - 2);
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#f3e8ff';
        ctx.fillText('👻', pos.x + fw - 8, pos.y + 10);
        ctx.restore();
      }

      if (!forExport && state.selectedEntity && state.selectedEntity.type === 'furniture' && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, fw, fh, ctx);
      }
    });
  }

  // 8. Starting Spiral Stairs & Quest Exit (Layer 2 - drawn over map pieces / stairs)
  if (state.quest.startingStair) {
    const [sc, sr] = state.quest.startingStair;
    const isBorder = isBorderTile(sc, sr, geom);

    // Check if starting stair is on a placed stairs furniture piece
    const stairFurn = state.quest.furniture.find(f =>
      f.type.includes('stair') &&
      sc >= f.x && sc < f.x + (f.width || 1) &&
      sr >= f.y && sr < f.y + (f.height || 1)
    );

    const spos = stairFurn ? tileToWorld(stairFurn.x, stairFurn.y, geom) : tileToWorld(sc, sr, geom);
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

    if (!forExport && state.selectedEntity && (state.selectedEntity.type === 'start' || state.selectedEntity.type === 'stairs')) {
      drawSelectionGlow(spos.x, spos.y, sw, sh, ctx);
    }
  }

  // 8b. Quest Exit Staircase / Escape Hatch (Layer 2)
  if (state.quest.exitTile) {
    const [ec, er] = state.quest.exitTile;
    const isBorder = isBorderTile(ec, er, geom);

    // Check if exit is on a placed stairs furniture piece
    const stairFurn = state.quest.furniture.find(f =>
      f.type.includes('stair') &&
      ec >= f.x && ec < f.x + (f.width || 1) &&
      er >= f.y && er < f.y + (f.height || 1)
    );

    const epos = stairFurn ? tileToWorld(stairFurn.x, stairFurn.y, geom) : tileToWorld(ec, er, geom);
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

    if (!forExport && state.selectedEntity && state.selectedEntity.type === 'exit') {
      drawSelectionGlow(epos.x, epos.y, ew, eh, ctx);
    }
  }

  // 9. Doors (Layer 2)
  if (showDoors && state.quest.doors) {
    state.quest.doors.forEach((d, i) => {
      const isVertical = d.from[0] !== d.to[0];
      const isDoubleH = d.door_type === 'double-2x1' || d.door_type === 'double-h' || d.width === 2;
      const isDoubleV = d.door_type === 'double-1x2' || d.door_type === 'double-v' || d.height === 2;
      const isDouble = isDoubleH || isDoubleV;
      const c = isVertical ? Math.max(d.from[0], d.to[0]) : d.from[0];
      const r = isVertical ? d.from[1] : Math.max(d.from[1], d.to[1]);
      const basePos = tileToWorld(c, r);
      const ts = geom.tileSize;
      const doorLength = isDouble ? Math.round(ts * 1.82) : Math.round(ts * 0.82);
      const doorThick = isDouble ? 9 : 8;

      let dw, dh, dx, dy, cx, cy;
      if (isVertical) {
        dw = doorThick;
        dh = doorLength;
        cx = basePos.x;
        cy = isDoubleV ? (basePos.y + ts) : (basePos.y + ts / 2);
        dx = cx - dw / 2;
        dy = cy - dh / 2;
      } else {
        dw = doorLength;
        dh = doorThick;
        cx = isDoubleH ? (basePos.x + ts) : (basePos.x + ts / 2);
        cy = basePos.y;
        dx = cx - dw / 2;
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

          const leafLen = Math.round(doorLength * (isDouble ? 0.42 : 0.82));
          const leafThick = 5.5;
          ctx.fillStyle = '#6b21a8';
          ctx.strokeStyle = '#d8b4fe';
          ctx.lineWidth = 1.5;

          if (isDouble) {
            if (isVertical) {
              // Top slab
              ctx.fillRect(cx, dy - leafThick / 2, leafLen, leafThick);
              ctx.strokeRect(cx, dy - leafThick / 2, leafLen, leafThick);
              // Bottom slab
              ctx.fillRect(cx, dy + dh - leafThick / 2, leafLen, leafThick);
              ctx.strokeRect(cx, dy + dh - leafThick / 2, leafLen, leafThick);
              ctx.strokeStyle = 'rgba(216, 180, 254, 0.7)';
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.arc(cx, dy, leafLen, 0, Math.PI / 2);
              ctx.arc(cx, dy + dh, leafLen, 0, Math.PI / 2);
              ctx.stroke();
              ctx.setLineDash([]);
            } else {
              // Left slab
              ctx.fillRect(dx - leafThick / 2, cy, leafThick, leafLen);
              ctx.strokeRect(dx - leafThick / 2, cy, leafThick, leafLen);
              // Right slab
              ctx.fillRect(dx + dw - leafThick / 2, cy, leafThick, leafLen);
              ctx.strokeRect(dx + dw - leafThick / 2, cy, leafThick, leafLen);
              ctx.strokeStyle = 'rgba(216, 180, 254, 0.7)';
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.arc(dx, cy, leafLen, 0, Math.PI / 2);
              ctx.arc(dx + dw, cy, leafLen, Math.PI / 2, Math.PI);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          } else {
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

          if (isDouble) {
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            if (isVertical) {
              ctx.moveTo(dx, cy);
              ctx.lineTo(dx + dw, cy);
            } else {
              ctx.moveTo(cx, dy);
              ctx.lineTo(cx, dy + dh);
            }
            ctx.stroke();
          }

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

        // 4. Swung wooden door leaf / leaves
        const leafLen = Math.round(doorLength * (isDouble ? 0.42 : 0.85));
        const leafThick = 5.5;
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#34d399'; // vivid emerald outline
        ctx.lineWidth = 1.5;

        if (isDouble) {
          if (isVertical) {
            // Top leaf swung into right tile (+X)
            ctx.fillRect(cx, dy - leafThick / 2, leafLen, leafThick);
            ctx.strokeRect(cx, dy - leafThick / 2, leafLen, leafThick);

            // Bottom leaf swung into right tile (+X)
            ctx.fillRect(cx, dy + dh - leafThick / 2, leafLen, leafThick);
            ctx.strokeRect(cx, dy + dh - leafThick / 2, leafLen, leafThick);

            // Brass hinge pins
            ctx.fillStyle = '#fbbf24';
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.arc(cx, dy, 2.5, 0, Math.PI * 2);
            ctx.arc(cx, dy + dh, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Swing arcs
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.75)';
            ctx.setLineDash([2, 2]);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(cx, dy, leafLen, 0, Math.PI / 2);
            ctx.arc(cx, dy + dh, leafLen, -Math.PI / 2, 0);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            // Left leaf swung into lower tile (+Y)
            ctx.fillRect(dx - leafThick / 2, cy, leafThick, leafLen);
            ctx.strokeRect(dx - leafThick / 2, cy, leafThick, leafLen);

            // Right leaf swung into lower tile (+Y)
            ctx.fillRect(dx + dw - leafThick / 2, cy, leafThick, leafLen);
            ctx.strokeRect(dx + dw - leafThick / 2, cy, leafThick, leafLen);

            // Brass hinge pins
            ctx.fillStyle = '#fbbf24';
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.arc(dx, cy, 2.5, 0, Math.PI * 2);
            ctx.arc(dx + dw, cy, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Swing arcs
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.75)';
            ctx.setLineDash([2, 2]);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(dx, cy, leafLen, 0, Math.PI / 2);
            ctx.arc(dx + dw, cy, leafLen, Math.PI / 2, Math.PI);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else {
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
        ctx.fillText(isDouble ? '2×OPEN' : 'OPEN', cx, cy + 0.5);

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

        if (isDouble) {
          // Center Meeting Seam (astragal)
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (isVertical) {
            ctx.moveTo(dx, cy);
            ctx.lineTo(dx + dw, cy);
          } else {
            ctx.moveTo(cx, dy);
            ctx.lineTo(cx, dy + dh);
          }
          ctx.stroke();

          // 4 Iron Reinforcement Straps (2 on each leaf)
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 0.8;
          if (isVertical) {
            const straps = [
              dy + Math.round(dh * 0.12) - 1.5,
              dy + Math.round(dh * 0.38) - 1.5,
              dy + Math.round(dh * 0.62) - 1.5,
              dy + Math.round(dh * 0.88) - 1.5
            ];
            straps.forEach(sy => {
              ctx.fillRect(dx, sy, dw, 3);
              ctx.strokeRect(dx, sy, dw, 3);
              ctx.fillStyle = '#cbd5e1';
              ctx.beginPath();
              ctx.arc(dx + 2, sy + 1.5, 0.8, 0, Math.PI * 2);
              ctx.arc(dx + dw - 2, sy + 1.5, 0.8, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#0f172a';
            });

            // Twin brass pull rings
            [cy - 7, cy + 7].forEach(ry => {
              ctx.fillStyle = '#b45309';
              ctx.strokeStyle = '#fbbf24';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.arc(cx, ry, 3.0, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = '#1c1917';
              ctx.beginPath();
              ctx.arc(cx, ry, 1.2, 0, Math.PI * 2);
              ctx.fill();
            });
          } else {
            const straps = [
              dx + Math.round(dw * 0.12) - 1.5,
              dx + Math.round(dw * 0.38) - 1.5,
              dx + Math.round(dw * 0.62) - 1.5,
              dx + Math.round(dw * 0.88) - 1.5
            ];
            straps.forEach(sx => {
              ctx.fillRect(sx, dy, 3, dh);
              ctx.strokeRect(sx, dy, 3, dh);
              ctx.fillStyle = '#cbd5e1';
              ctx.beginPath();
              ctx.arc(sx + 1.5, dy + 2, 0.8, 0, Math.PI * 2);
              ctx.arc(sx + 1.5, dy + dh - 2, 0.8, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#0f172a';
            });

            // Twin brass pull rings
            [cx - 7, cx + 7].forEach(rx => {
              ctx.fillStyle = '#b45309';
              ctx.strokeStyle = '#fbbf24';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.arc(rx, cy, 3.0, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = '#1c1917';
              ctx.beginPath();
              ctx.arc(rx, cy, 1.2, 0, Math.PI * 2);
              ctx.fill();
            });
          }
        } else {
          // Single Door: Two Dark Iron Reinforcement Straps with Rivets
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

          // Brass Handle Stud / Ring Plate in Center
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
      }

      ctx.restore();

      if (!forExport && state.selectedEntity && state.selectedEntity.type === 'door' && state.selectedEntity.index === i) {
        drawSelectionGlow(dx - 3, dy - 3, dw + 6, dh + 6, ctx);
      }
    });
  }

  // 10. Monsters (Layer 2)
  if (showMonsters && state.quest.monsters) {
    state.quest.monsters.forEach((m, i) => {
      const mc = m.pos ? m.pos[0] : (m.x !== undefined ? m.x : 0);
      const mr = m.pos ? m.pos[1] : (m.y !== undefined ? m.y : 0);
      const pos = tileToWorld(mc, mr, geom);
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

      if (!forExport && state.selectedEntity && state.selectedEntity.type === 'monster' && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, geom.tileSize, geom.tileSize, ctx);
      }
    });
  }

  // 11. Story Triggers / Notes (Layer 2 - Interactive Editor View)
  if (showNotes && !forExport && state.quest.storyTriggers) {
    state.quest.storyTriggers.forEach((st, i) => {
      const pos = tileToWorld(st.tile[0], st.tile[1], geom);
      const cx = pos.x + geom.tileSize / 2;
      const cy = pos.y + geom.tileSize / 2;

      const eventDef = TRIGGER_EVENT_DEFS[st.event] || TRIGGER_EVENT_DEFS.on_room_entered;
      const color = eventDef.color || '#d97706';

      // Outer glowing halo
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Inner dark disc
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Marker
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mark = (st.marker || 'A').replace('Note ', '');
      ctx.fillText(mark, cx, cy - 1);

      // Mini action badge on bottom right
      const actions = st.actions || [];
      const hasMovie = actions.some(a => a.type === 'play_movie');
      const hasAttack = actions.some(a => a.type === 'attack_character' || a.type === 'spring_trap' || a.type === 'cast_spell');
      if (hasMovie) {
        ctx.font = '8px sans-serif';
        ctx.fillText('🎬', cx + 7, cy + 7);
      } else if (hasAttack) {
        ctx.font = '8px sans-serif';
        ctx.fillText('⚔️', cx + 7, cy + 7);
      }

      if (!forExport && state.selectedEntity && (state.selectedEntity.type === 'note' || state.selectedEntity.type === 'trigger') && state.selectedEntity.index === i) {
        drawSelectionGlow(pos.x, pos.y, geom.tileSize, geom.tileSize, ctx);
      }
    });
  }

  // 11.5. Room Names (Layer 2.5 - scrunched height, sits on top of tokens)
  if (showRoomNames && state.blockmap?.rooms) {
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

      // Scrunched, compact badge font & tight height
      const fontSize = Math.max(9, Math.min(11, Math.round(geom.tileSize * 0.23)));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;
      const padX = 4;
      const padY = 0.5;
      const boxW = Math.round(textWidth + padX * 2);
      const boxH = Math.round(fontSize + padY * 2 + 1); // tight scrunched height (e.g. 11-12px)
      const rx = Math.round(cx - boxW / 2);
      const ry = Math.round(cy - boxH / 2);
      const radius = 2.5;

      // Render crisp badge sitting on top of tokens with soft shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = room.color || 'rgba(245, 158, 11, 0.85)';
      ctx.lineWidth = 1.0;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(rx, ry, boxW, boxH, radius);
      } else {
        ctx.rect(rx, ry, boxW, boxH);
      }
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.fillText(text, cx, cy);
      ctx.restore();
    }
    ctx.restore();
  }

  // 12. Export Trigger Indicators (HeroQuest-Style Letter Badges placed on target entities)
  if (showNotes && forExport) {
    const { indicators } = resolveTriggerIndicators(quest, blockmap, geom);
    indicators.forEach(ind => {
      drawExportTriggerIndicator(ctx, geom, ind, { showRoomNames });
    });
  }
}

function drawSelectionGlow(x, y, w, h, targetCtx) {
  const ctx = targetCtx || dom.ctx;
  if (!ctx) return;
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
    const isDoubleH = Boolean(e.isDouble2x1 || state.subtool.doorSize === 'double-2x1' || (state.subtool.doorSize === 'double-auto' && e.orientation === 'h'));
    const isDoubleV = Boolean(e.isDouble1x2 || state.subtool.doorSize === 'double-1x2' || (state.subtool.doorSize === 'double-auto' && e.orientation === 'v'));
    const isDouble = isDoubleH || isDoubleV;
    const ts = geom.tileSize;
    const doorLength = isDouble ? Math.round(ts * 1.82) : Math.round(ts * 0.82);
    const doorThick = isDouble ? 9 : 8;

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

      if (isDouble) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (e.orientation === 'v') {
          ctx.moveTo(dx, e.cy);
          ctx.lineTo(dx + dw, e.cy);
        } else {
          ctx.moveTo(e.cx, dy);
          ctx.lineTo(e.cx, dy + dh);
        }
        ctx.stroke();
      }
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
  if (dom.infoZoomLevel) {
    dom.infoZoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
  }
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
    const isDoubleH = d.door_type === 'double-2x1' || d.door_type === 'double-h' || d.width === 2;
    const isDoubleV = d.door_type === 'double-1x2' || d.door_type === 'double-v' || d.height === 2;
    if ((d.from[0] === col && d.from[1] === row) || (d.to[0] === col && d.to[1] === row)) {
      return { type: 'door', index: i, data: d };
    }
    if (isDoubleH) {
      if ((d.from[0] + 1 === col && d.from[1] === row) || (d.to[0] + 1 === col && d.to[1] === row)) {
        return { type: 'door', index: i, data: d };
      }
    }
    if (isDoubleV) {
      if ((d.from[0] === col && d.from[1] + 1 === row) || (d.to[0] === col && d.to[1] + 1 === row)) {
        return { type: 'door', index: i, data: d };
      }
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

    const isDouble2x1 = Boolean(edge.isDouble2x1 || state.subtool.doorSize === 'double-2x1' || (state.subtool.doorSize === 'double-auto' && edge.orientation === 'h'));
    const isDouble1x2 = Boolean(edge.isDouble1x2 || state.subtool.doorSize === 'double-1x2' || (state.subtool.doorSize === 'double-auto' && edge.orientation === 'v'));
    const isDouble = isDouble2x1 || isDouble1x2;

    // Check if door already exists on this edge or overlapping edge
    const existingIdx = state.quest.doors.findIndex(d => {
      const dDoubleH = d.door_type === 'double-2x1' || d.door_type === 'double-h' || d.width === 2;
      const dDoubleV = d.door_type === 'double-1x2' || d.door_type === 'double-v' || d.height === 2;
      const match1 = (d.from[0] === edge.from[0] && d.from[1] === edge.from[1] && d.to[0] === edge.to[0] && d.to[1] === edge.to[1]) ||
                     (d.from[0] === edge.to[0] && d.from[1] === edge.to[1] && d.to[0] === edge.from[0] && d.to[1] === edge.from[1]);
      if (match1) return true;
      if (dDoubleH) {
        const match2 = (d.from[0] + 1 === edge.from[0] && d.from[1] === edge.from[1] && d.to[0] + 1 === edge.to[0] && d.to[1] === edge.to[1]) ||
                       (d.from[0] + 1 === edge.to[0] && d.from[1] === edge.to[1] && d.to[0] + 1 === edge.from[0] && d.to[1] === edge.from[1]);
        if (match2) return true;
      }
      if (dDoubleV) {
        const match2 = (d.from[0] === edge.from[0] && d.from[1] + 1 === edge.from[1] && d.to[0] === edge.to[0] && d.to[1] + 1 === edge.to[1]) ||
                       (d.from[0] === edge.to[0] && d.from[1] + 1 === edge.to[1] && d.to[0] === edge.from[0] && d.to[1] + 1 === edge.from[1]);
        if (match2) return true;
      }
      if (isDouble2x1) {
        const match3 = (d.from[0] === edge.from[0] + 1 && d.from[1] === edge.from[1] && d.to[0] === edge.to[0] + 1 && d.to[1] === edge.to[1]) ||
                       (d.from[0] === edge.to[0] + 1 && d.from[1] === edge.to[1] && d.to[0] === edge.from[0] + 1 && d.to[1] === edge.from[1]);
        if (match3) return true;
      }
      if (isDouble1x2) {
        const match3 = (d.from[0] === edge.from[0] && d.from[1] === edge.from[1] + 1 && d.to[0] === edge.to[0] && d.to[1] === edge.to[1] + 1) ||
                       (d.from[0] === edge.to[0] && d.from[1] === edge.to[1] + 1 && d.to[0] === edge.from[0] && d.to[1] === edge.from[1] + 1);
        if (match3) return true;
      }
      return false;
    });

    if (existingIdx >= 0) {
      // Select it or toggle closed/open/secret
      state.selectedEntity = { type: 'door', index: existingIdx, data: state.quest.doors[existingIdx] };
      updateInspectorUI();
    } else {
      const isSecret = state.subtool.doorType === 'secret';
      const isOpen = state.subtool.doorType === 'wood-open';
      const doorNum = state.quest.doors.length + 1;
      const defaultName = isSecret
        ? (isDouble ? `Secret Double Door ${doorNum}` : `Secret Door ${doorNum}`)
        : (isDouble ? `Double Door ${doorNum}` : `Door ${doorNum}`);
      const newDoor = {
        id: `door-${doorNum}`,
        name: defaultName,
        from: edge.from,
        to: edge.to,
        state: isOpen ? 'open' : 'closed',
        is_secret: isSecret,
        room: edge.room || '',
        door_type: isDouble2x1 ? 'double-2x1' : (isDouble1x2 ? 'double-1x2' : 'single'),
        width: isDouble2x1 ? 2 : 1,
        height: isDouble1x2 ? 2 : 1
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
    const eventType = state.subtool.triggerEvent || (roomId ? 'on_room_entered' : 'on_tile_stepped_on');
    const newTrigger = {
      id: `trigger-${mark.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36).slice(-4)}`,
      marker: mark,
      name: `${mark} Encounter`,
      title: `${mark} Encounter`,
      event: eventType,
      target: roomId || '',
      room: roomId || '',
      doorId: '',
      monsterId: '',
      tile: [col, row],
      onceOnly: true,
      narrative: 'Stop. Do not draw a card. As your hand reaches into the shadows...',
      actions: [
        {
          type: 'play_movie',
          moviePath: 'res://assets/movies/quest1-intro.mp4',
          title: `${mark} Cinematic`,
          canSkip: true
        }
      ]
    };
    state.quest.storyTriggers.push(newTrigger);
    state.quest.triggers = state.quest.storyTriggers;
    state.selectedEntity = { type: 'note', index: state.quest.storyTriggers.length - 1, data: newTrigger };
    updateInspectorUI();
    updateEntitySummaryList();
    updateTriggerTabUI();
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
  } else if (type === 'note' || type === 'trigger') {
    state.quest.storyTriggers.splice(index, 1);
    state.quest.triggers = state.quest.storyTriggers;
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
  updateTriggerTabUI();
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

  let currentTargetEntity = null;
  if (type === 'monster') currentTargetEntity = state.quest.monsters[index];
  else if (type === 'door') currentTargetEntity = state.quest.doors[index];
  else if (type === 'furniture') currentTargetEntity = state.quest.furniture[index];
  else if (type === 'trap') currentTargetEntity = state.quest.traps[index];
  else if (type === 'note' || type === 'trigger') currentTargetEntity = state.quest.storyTriggers[index];
  else if (type === 'wall-block') currentTargetEntity = state.quest.wallBlocks[index];

  if (dom.inspectHidden) {
    dom.inspectHidden.checked = Boolean(currentTargetEntity && currentTargetEntity.hidden);
  }

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
    const isDoubleH = d.door_type === 'double-2x1' || d.door_type === 'double-h' || d.width === 2;
    const isDoubleV = d.door_type === 'double-1x2' || d.door_type === 'double-v' || d.height === 2;
    const sizeSpan = isDoubleH ? ' (Double 2×1)' : (isDoubleV ? ' (Double 1×2)' : ' (Single 1×1)');
    dom.inspectPosText.textContent = `[${d.from[0]},${d.from[1]}] ↔ [${d.to[0]},${d.to[1]}]${sizeSpan}`;
    dom.inspectName.value = d.name !== undefined ? d.name : (d.id || `Door ${index + 1}`);
    dom.inspectDoorState.value = d.state || 'closed';
    dom.inspectDoorSecret.checked = d.is_secret;
    if (dom.inspectDoorType) {
      dom.inspectDoorType.value = isDoubleH ? 'double-2x1' : (isDoubleV ? 'double-1x2' : 'single');
    }
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
  } else if (type === 'note' || type === 'trigger') {
    const st = state.quest.storyTriggers[index];
    if (!st) return;
    dom.inspectPosText.textContent = `[${st.tile[0]}, ${st.tile[1]}]`;
    dom.inspectName.value = st.title || st.name || st.marker;
    dom.inspectNoteMarker.value = st.marker || 'Note A';
    dom.inspectNoteTitle.value = st.title || st.name || '';
    dom.inspectNoteNarrative.value = st.narrative || '';
    if (dom.inspectTriggerEvent) {
      dom.inspectTriggerEvent.value = st.event || 'on_room_entered';
    }
    if (dom.inspectTriggerOnceOnly) {
      dom.inspectTriggerOnceOnly.checked = st.onceOnly !== false;
    }
    updateTriggerTargetOptions(st);
    renderActionPipelineUI(st);
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
    const isDoubleH = d.door_type === 'double-2x1' || d.door_type === 'double-h' || d.width === 2;
    const isDoubleV = d.door_type === 'double-1x2' || d.door_type === 'double-v' || d.height === 2;
    const sizePill = isDoubleH ? '<span class="door-status-pill door-badge-double">2×1</span>' : (isDoubleV ? '<span class="door-status-pill door-badge-double">1×2</span>' : '');
    const badgeCls = isSecret ? (isOpen ? 'door-badge-secret-open' : 'door-badge-secret') : (isOpen ? 'door-badge-open' : 'door-badge-closed');
    const badgeText = isSecret ? (isOpen ? 'SECRET [OPEN]' : 'SECRET') : (isOpen ? 'OPEN' : 'CLOSED');
    const doorIcon = isSecret ? '🔮' : (isOpen ? '🚪🔓' : '🚪🔒');
    const displayName = d.name || (isSecret ? (isDoubleH || isDoubleV ? 'Secret Double Door' : 'Secret Door') : (isDoubleH || isDoubleV ? 'Double Door' : 'Wood Door'));
    item.innerHTML = `
      <div class="entity-item-main">
        <span class="entity-item-icon">${doorIcon}</span>
        <div>
          <div class="entity-item-name">
            ${escapeHtml(displayName)}
            ${sizePill}
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
// Trigger & Action Pipeline Management
// -------------------------------------------------------------
function updateTriggerTargetOptions(st) {
  if (!dom.inspectTriggerTargetGroup) return;

  const eventKey = st.event || 'on_room_entered';
  const eventDef = TRIGGER_EVENT_DEFS[eventKey] || TRIGGER_EVENT_DEFS.on_room_entered;

  // Reset visibility
  if (dom.inspectTriggerTargetRoom) dom.inspectTriggerTargetRoom.style.display = 'none';
  if (dom.inspectTriggerTargetDoor) dom.inspectTriggerTargetDoor.style.display = 'none';
  if (dom.inspectTriggerTargetMonster) dom.inspectTriggerTargetMonster.style.display = 'none';
  if (dom.inspectTriggerTargetTile) dom.inspectTriggerTargetTile.style.display = 'none';

  if (eventDef.targetType === 'room') {
    if (dom.inspectTriggerTargetLbl) dom.inspectTriggerTargetLbl.textContent = 'Room:';
    if (dom.inspectTriggerTargetRoom) {
      dom.inspectTriggerTargetRoom.style.display = 'block';
      dom.inspectTriggerTargetRoom.innerHTML = '<option value="">(Any / Current Room)</option>';
      const rooms = state.blockmap?.rooms || [];
      rooms.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `${r.name || r.id} (${r.id})`;
        if (st.room === r.id || st.target === r.id) opt.selected = true;
        dom.inspectTriggerTargetRoom.appendChild(opt);
      });
    }
  } else if (eventDef.targetType === 'door') {
    if (dom.inspectTriggerTargetLbl) dom.inspectTriggerTargetLbl.textContent = 'Door:';
    if (dom.inspectTriggerTargetDoor) {
      dom.inspectTriggerTargetDoor.style.display = 'block';
      dom.inspectTriggerTargetDoor.innerHTML = '<option value="">(Any Door)</option>';
      const doors = state.quest.doors || [];
      doors.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        const doorLabel = d.name ? `${d.name} (${d.id})` : d.id;
        opt.textContent = `${doorLabel} [${d.from[0]},${d.from[1]}] ${d.is_secret ? '🔮 Secret' : (d.state === 'open' ? '🔓 Open' : '🔒 Closed')}`;
        if (st.doorId === d.id || st.target === d.id) opt.selected = true;
        dom.inspectTriggerTargetDoor.appendChild(opt);
      });
    }
  } else if (eventDef.targetType === 'monster') {
    if (dom.inspectTriggerTargetLbl) dom.inspectTriggerTargetLbl.textContent = 'Monster:';
    if (dom.inspectTriggerTargetMonster) {
      dom.inspectTriggerTargetMonster.style.display = 'block';
      dom.inspectTriggerTargetMonster.innerHTML = '<option value="">(Any Monster Defeated)</option>';
      const monsters = state.quest.monsters || [];
      monsters.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} (${m.type}) [${m.pos[0]},${m.pos[1]}]`;
        if (st.monsterId === m.id || st.target === m.id) opt.selected = true;
        dom.inspectTriggerTargetMonster.appendChild(opt);
      });
    }
  } else if (eventDef.targetType === 'tile') {
    if (dom.inspectTriggerTargetLbl) dom.inspectTriggerTargetLbl.textContent = 'Tile [X, Y]:';
    if (dom.inspectTriggerTargetTile) dom.inspectTriggerTargetTile.style.display = 'flex';
    if (dom.inspectTriggerTileX) dom.inspectTriggerTileX.value = st.tile ? st.tile[0] : 0;
    if (dom.inspectTriggerTileY) dom.inspectTriggerTileY.value = st.tile ? st.tile[1] : 0;
  } else {
    if (dom.inspectTriggerTargetLbl) dom.inspectTriggerTargetLbl.textContent = 'Target:';
    if (dom.inspectTriggerTargetGroup) dom.inspectTriggerTargetGroup.style.display = 'none';
    return;
  }
  if (dom.inspectTriggerTargetGroup) dom.inspectTriggerTargetGroup.style.display = 'flex';
}

function renderActionPipelineUI(st) {
  if (!dom.inspectTriggerActionsList) return;
  const list = dom.inspectTriggerActionsList;
  list.innerHTML = '';

  const actions = st.actions || [];
  if (actions.length === 0) {
    list.innerHTML = `
      <div style="color:#64748b; font-size:11px; font-style:italic; padding:8px 4px; text-align:center;">
        No actions in this pipeline. Choose an action above and click "+ Add".
      </div>
    `;
    return;
  }

  actions.forEach((act, idx) => {
    const def = TRIGGER_ACTION_DEFS[act.type] || { name: act.type, icon: '⚡' };
    const card = document.createElement('div');
    card.className = 'action-step-card';

    let fieldsHtml = '';
    if (act.type === 'play_movie') {
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Movie Path:</label>
          <input type="text" class="text-input text-input-xs act-field-movie" value="${escapeHtml(act.moviePath || '')}" placeholder="res://assets/movies/..." style="flex:1;">
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Title:</label>
          <input type="text" class="text-input text-input-xs act-field-title" value="${escapeHtml(act.title || '')}" placeholder="Cinematic Scene" style="flex:1;">
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label class="custom-checkbox" style="font-size:10px;">Can Skip
            <input type="checkbox" class="act-field-skip" ${act.canSkip !== false ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
        </div>
      `;
    } else if (act.type === 'attack_character') {
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Attacker:</label>
          <input type="text" class="text-input text-input-xs act-field-attacker" value="${escapeHtml(act.attacker || 'Hazard')}" style="width:80px;">
          <label style="font-size:10px; margin-left:6px;">Dice:</label>
          <input type="number" class="num-input-xs act-field-dice" value="${act.damageDice || 2}" min="1" max="10" style="width:40px;">
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Target:</label>
          <select class="dropdown dropdown-xs act-field-target" style="flex:1;">
            <option value="active_hero" ${act.target !== 'all_heroes' ? 'selected' : ''}>Active Hero</option>
            <option value="all_heroes" ${act.target === 'all_heroes' ? 'selected' : ''}>All Heroes in Room</option>
          </select>
        </div>
      `;
    } else if (act.type === 'cast_spell') {
      const spells = [
        ['ball_of_flame', '🔥 Ball of Flame (2 BP)'],
        ['fire_of_wrath', '🔥 Fire of Wrath (2 BP)'],
        ['sleep', '💤 Sleep (Incapacitate)'],
        ['courage', '🦁 Courage (+2 Atk)'],
        ['rock_skin', '🛡️ Rock Skin (+1 Def)'],
        ['pass_through_rock', '🧱 Pass Through Rock'],
        ['veil_of_mist', '🌫️ Veil of Mist'],
        ['heal_body', '❤️ Heal Body (+4 BP)'],
        ['water_of_healing', '💧 Water of Healing (+4 BP)'],
        ['tempest', '🌪️ Tempest (Skip Turn)']
      ];
      const spellOptions = spells.map(([val, lbl]) => `<option value="${val}" ${act.spell === val ? 'selected' : ''}>${lbl}</option>`).join('');
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Spell:</label>
          <select class="dropdown dropdown-xs act-field-spell" style="flex:1;">
            ${spellOptions}
          </select>
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Caster:</label>
          <input type="text" class="text-input text-input-xs act-field-caster" value="${escapeHtml(act.caster || 'Morcar')}" style="width:90px;">
          <label style="font-size:10px; margin-left:6px;">Target:</label>
          <select class="dropdown dropdown-xs act-field-target" style="flex:1;">
            <option value="active_hero" ${act.target !== 'all_heroes' ? 'selected' : ''}>Active Hero</option>
            <option value="all_heroes" ${act.target === 'all_heroes' ? 'selected' : ''}>All Heroes</option>
          </select>
        </div>
      `;
    } else if (act.type === 'spring_trap') {
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Trap Type:</label>
          <select class="dropdown dropdown-xs act-field-trap-type" style="flex:1;">
            <option value="pit" ${act.trapType === 'pit' ? 'selected' : ''}>🕳️ Pit Trap</option>
            <option value="spear" ${act.trapType === 'spear' ? 'selected' : ''}>🗡️ Spear Trap</option>
            <option value="falling_block" ${act.trapType === 'falling_block' ? 'selected' : ''}>🧱 Falling Rock / Block</option>
            <option value="poison" ${act.trapType === 'poison' ? 'selected' : ''}>☠️ Poison Gas</option>
          </select>
          <label style="font-size:10px; margin-left:6px;">Dmg:</label>
          <input type="number" class="num-input-xs act-field-damage" value="${act.damage || 2}" min="1" max="10" style="width:40px;">
        </div>
      `;
    } else if (act.type === 'show_message' || act.type === 'display_message') {
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Title:</label>
          <input type="text" class="text-input text-input-xs act-field-title" value="${escapeHtml(act.title || '')}" style="flex:1;">
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Message:</label>
          <textarea class="text-input text-input-xs act-field-text" rows="2" style="flex:1;">${escapeHtml(act.text || act.narrative || act.message || '')}</textarea>
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Button:</label>
          <input type="text" class="text-input text-input-xs act-field-button-text" value="${escapeHtml(act.buttonText || 'Continue')}" style="width:110px;">
          <span style="font-size:10px; color:#94a3b8; font-style:italic;">(Must dismiss to continue)</span>
        </div>
      `;
    } else if (act.type === 'dialogue') {
      if (!Array.isArray(act.lines) || act.lines.length === 0) {
        act.lines = [
          { speaker: 'barbarian', text: 'I sense danger lurking nearby...', audio: '' }
        ];
      }
      const speakerOptions = (selectedVal) => {
        const presets = [
          ['barbarian', 'Barbarian (Rogar)'],
          ['dwarf', 'Dwarf (Dorgan)'],
          ['elf', 'Elf'],
          ['wizard', 'Wizard (Telor)'],
          ['mentor', 'Mentor'],
          ['zargon', 'Zargon / Morcar'],
          ['monster', 'Room Monster / Foe'],
          ['narrator', 'Narrator']
        ];
        const monPresets = (state.quest.monsters || []).map(m => [m.name || m.id, `👾 ${m.name || m.id}`]);
        const all = [...presets, ...monPresets];
        if (selectedVal && !all.some(([val]) => val === selectedVal)) {
          all.push([selectedVal, `🗣️ ${selectedVal}`]);
        }
        return all.map(([val, label]) => `<option value="${escapeHtml(val)}" ${selectedVal === val ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
      };

      const bubblesHtml = act.lines.map((line, bIdx) => `
        <div class="dialogue-bubble-card" data-line-idx="${bIdx}">
          <div class="dialogue-bubble-header">
            <span class="dialogue-bubble-count">💬 Bubble #${bIdx + 1}</span>
            <div style="display:flex; gap:4px; align-items:center;">
              <select class="dropdown dropdown-xs act-bubble-speaker" data-line-idx="${bIdx}" style="width:170px;">
                ${speakerOptions(line.speaker || 'barbarian')}
              </select>
              ${act.lines.length > 1 ? `<button type="button" class="btn btn-xs btn-danger btn-del-bubble" data-line-idx="${bIdx}" title="Delete Bubble">🗑️</button>` : ''}
            </div>
          </div>
          <div class="action-step-row" style="margin-top:2px;">
            <label style="font-size:9px; min-width:45px;">Speaker:</label>
            <input type="text" class="text-input text-input-xs act-bubble-speaker-custom" data-line-idx="${bIdx}" value="${escapeHtml(line.speaker || '')}" placeholder="Custom speaker name (e.g. Goblin who hesited chest)" style="flex:1;">
          </div>
          <div class="action-step-row" style="margin-top:2px;">
            <label style="font-size:9px; min-width:45px;">Speech:</label>
            <textarea class="text-input text-input-xs act-bubble-text" data-line-idx="${bIdx}" rows="2" placeholder="Spoken dialogue text..." style="flex:1;">${escapeHtml(line.text || '')}</textarea>
          </div>
          <div class="action-step-row" style="margin-top:2px;">
            <label style="font-size:9px; min-width:45px;">Audio:</label>
            <input type="text" class="text-input text-input-xs act-bubble-audio" data-line-idx="${bIdx}" value="${escapeHtml(line.audio || '')}" placeholder="res://assets/audio/voice.ogg (optional)" style="flex:1;">
          </div>
        </div>
      `).join('');

      fieldsHtml = `
        <div style="font-size:10px; color:#38bdf8; margin-bottom:2px;">
          Dialogue bubbles appear over character tokens in sequence and log to combat journal.
        </div>
        <div class="dialogue-bubbles-container">
          ${bubblesHtml}
        </div>
        <button type="button" class="btn-add-bubble" style="width:100%; margin-top:4px;">+ Add Dialogue Bubble</button>
      `;
    } else if (act.type === 'furniture_visible' || act.type === 'furniture_becomes_visible' || act.type === 'reveal_furniture') {
      const furnOpts = (state.quest.furniture || []).map(f =>
        `<option value="${escapeHtml(f.name || f.id)}" ${(act.furnitureId === f.id || act.target === f.name || act.furnitureName === f.name) ? 'selected' : ''}>${escapeHtml(f.name || f.id)} [${f.x}, ${f.y}]</option>`
      ).join('');
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Furniture:</label>
          <select class="dropdown dropdown-xs act-field-furn-sel" style="flex:1;">
            <option value="">-- Select Placed Furniture --</option>
            ${furnOpts}
          </select>
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Target Name:</label>
          <input type="text" class="text-input text-input-xs act-field-furn-name" value="${escapeHtml(act.target || act.furnitureName || act.furnitureId || '')}" placeholder="e.g. Heist Treasure Chest" style="flex:1;">
        </div>
      `;
    } else if (act.type === 'move_furniture' || act.type === 'furniture_moves_to') {
      const furnOpts = (state.quest.furniture || []).map(f =>
        `<option value="${escapeHtml(f.name || f.id)}" ${(act.furnitureId === f.id || act.target === f.name || act.furnitureName === f.name) ? 'selected' : ''}>${escapeHtml(f.name || f.id)} [${f.x}, ${f.y}]</option>`
      ).join('');
      const curX = act.tile ? act.tile[0] : (act.x !== undefined ? act.x : 0);
      const curY = act.tile ? act.tile[1] : (act.y !== undefined ? act.y : 0);
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Furniture:</label>
          <select class="dropdown dropdown-xs act-field-furn-sel" style="flex:1;">
            <option value="">-- Select Placed Furniture --</option>
            ${furnOpts}
          </select>
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Target Name:</label>
          <input type="text" class="text-input text-input-xs act-field-furn-name" value="${escapeHtml(act.target || act.furnitureName || act.furnitureId || '')}" placeholder="e.g. Heist Treasure Chest" style="flex:1;">
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Move To Tile:</label>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:10px;">X:</span>
            <input type="number" class="num-input-xs act-field-furn-x" value="${curX}" min="0" max="30" style="width:45px;">
            <span style="font-size:10px;">Y:</span>
            <input type="number" class="num-input-xs act-field-furn-y" value="${curY}" min="0" max="30" style="width:45px;">
          </div>
        </div>
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Custom Msg:</label>
          <input type="text" class="text-input text-input-xs act-field-furn-msg" value="${escapeHtml(act.message || act.customMessage || '')}" placeholder="Default: {name} moved (e.g. Chest was thrown through the wall...)" style="flex:1;">
        </div>
      `;
    } else if (act.type === 'spawn_monsters') {
      const monOpts = Object.keys(MONSTER_DEFS).map(k =>
        `<option value="${k}" ${act.monsterType === k ? 'selected' : ''}>${MONSTER_DEFS[k].icon} ${MONSTER_DEFS[k].name}</option>`
      ).join('');
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Type:</label>
          <select class="dropdown dropdown-xs act-field-monster-type" style="flex:1;">
            ${monOpts}
          </select>
          <label style="font-size:10px; margin-left:6px;">Qty:</label>
          <input type="number" class="num-input-xs act-field-count" value="${act.count || 1}" min="1" max="10" style="width:40px;">
        </div>
      `;
    } else if (act.type === 'grant_reward') {
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Gold:</label>
          <input type="number" class="num-input-xs act-field-gold" value="${act.gold || 50}" min="0" step="25" style="width:55px;">
          <label style="font-size:10px; margin-left:6px;">Item:</label>
          <input type="text" class="text-input text-input-xs act-field-item" value="${escapeHtml(act.item || '')}" placeholder="Potion / Card" style="flex:1;">
        </div>
      `;
    } else if (act.type === 'end_game') {
      fieldsHtml = `
        <div class="action-step-row" style="margin-top:4px;">
          <label style="font-size:10px; min-width:65px;">Outcome:</label>
          <select class="dropdown dropdown-xs act-field-outcome" style="flex:1;">
            <option value="victory" ${act.outcome !== 'defeat' ? 'selected' : ''}>🏆 Victory (Bounty &amp; Clear)</option>
            <option value="defeat" ${act.outcome === 'defeat' ? 'selected' : ''}>💀 Defeat (Party Slain)</option>
          </select>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="action-step-header">
        <span class="action-step-badge">${def.icon} Step ${idx + 1}: ${def.name}</span>
        <button type="button" class="btn btn-xs btn-danger btn-del-act" data-idx="${idx}" title="Delete Action">🗑️</button>
      </div>
      <div class="action-step-body">
        ${fieldsHtml}
      </div>
    `;

    // Wire up inputs inside the action card
    const movieIn = card.querySelector('.act-field-movie');
    if (movieIn) movieIn.addEventListener('input', () => { act.moviePath = movieIn.value; });
    const titleIn = card.querySelector('.act-field-title');
    if (titleIn) titleIn.addEventListener('input', () => { act.title = titleIn.value; });
    const skipIn = card.querySelector('.act-field-skip');
    if (skipIn) skipIn.addEventListener('change', () => { act.canSkip = skipIn.checked; });

    const btnTextIn = card.querySelector('.act-field-button-text');
    if (btnTextIn) btnTextIn.addEventListener('input', () => { act.buttonText = btnTextIn.value; });

    const atkIn = card.querySelector('.act-field-attacker');
    if (atkIn) atkIn.addEventListener('input', () => { act.attacker = atkIn.value; });
    const diceIn = card.querySelector('.act-field-dice');
    if (diceIn) diceIn.addEventListener('change', () => { act.damageDice = parseInt(diceIn.value) || 2; });
    const tgtIn = card.querySelector('.act-field-target');
    if (tgtIn) tgtIn.addEventListener('change', () => { act.target = tgtIn.value; });

    const spellIn = card.querySelector('.act-field-spell');
    if (spellIn) spellIn.addEventListener('change', () => { act.spell = spellIn.value; });
    const casterIn = card.querySelector('.act-field-caster');
    if (casterIn) casterIn.addEventListener('input', () => { act.caster = casterIn.value; });

    const trapTypeIn = card.querySelector('.act-field-trap-type');
    if (trapTypeIn) trapTypeIn.addEventListener('change', () => { act.trapType = trapTypeIn.value; });
    const dmgIn = card.querySelector('.act-field-damage');
    if (dmgIn) dmgIn.addEventListener('change', () => { act.damage = parseInt(dmgIn.value) || 2; });

    const textIn = card.querySelector('.act-field-text');
    if (textIn) textIn.addEventListener('input', () => { act.text = textIn.value; });

    // Dialogue bubble inputs and controls
    card.querySelectorAll('.act-bubble-speaker').forEach(sel => {
      sel.addEventListener('change', () => {
        const lIdx = parseInt(sel.dataset.lineIdx);
        if (act.lines && act.lines[lIdx]) {
          act.lines[lIdx].speaker = sel.value;
          const customIn = card.querySelector(`.act-bubble-speaker-custom[data-line-idx="${lIdx}"]`);
          if (customIn) customIn.value = sel.value;
        }
      });
    });
    card.querySelectorAll('.act-bubble-speaker-custom').forEach(cin => {
      cin.addEventListener('input', () => {
        const lIdx = parseInt(cin.dataset.lineIdx);
        if (act.lines && act.lines[lIdx]) {
          act.lines[lIdx].speaker = cin.value;
        }
      });
    });
    card.querySelectorAll('.act-bubble-text').forEach(txt => {
      txt.addEventListener('input', () => {
        const lIdx = parseInt(txt.dataset.lineIdx);
        if (act.lines && act.lines[lIdx]) act.lines[lIdx].text = txt.value;
      });
    });
    card.querySelectorAll('.act-bubble-audio').forEach(aud => {
      aud.addEventListener('input', () => {
        const lIdx = parseInt(aud.dataset.lineIdx);
        if (act.lines && act.lines[lIdx]) act.lines[lIdx].audio = aud.value;
      });
    });
    card.querySelectorAll('.btn-del-bubble').forEach(btn => {
      btn.addEventListener('click', () => {
        const lIdx = parseInt(btn.dataset.lineIdx);
        if (act.lines && act.lines.length > 1) {
          recordHistory();
          act.lines.splice(lIdx, 1);
          renderActionPipelineUI(st);
        }
      });
    });
    const addBubbleBtn = card.querySelector('.btn-add-bubble');
    if (addBubbleBtn) {
      addBubbleBtn.addEventListener('click', () => {
        recordHistory();
        if (!Array.isArray(act.lines)) act.lines = [];
        const nextSpeaker = act.lines.length % 2 === 1 ? 'mentor' : 'barbarian';
        act.lines.push({ speaker: nextSpeaker, text: '', audio: '' });
        renderActionPipelineUI(st);
      });
    }

    // Furniture action inputs
    const furnSelIn = card.querySelector('.act-field-furn-sel');
    if (furnSelIn) {
      furnSelIn.addEventListener('change', () => {
        const val = furnSelIn.value;
        const matched = (state.quest.furniture || []).find(f => (f.name === val || f.id === val));
        if (matched) {
          act.furnitureId = matched.id;
          act.target = matched.name || matched.id;
          act.furnitureName = matched.name || matched.id;
        } else {
          act.target = val;
          act.furnitureName = val;
        }
        const furnNameIn = card.querySelector('.act-field-furn-name');
        if (furnNameIn) furnNameIn.value = act.target;
      });
    }
    const furnNameIn = card.querySelector('.act-field-furn-name');
    if (furnNameIn) {
      furnNameIn.addEventListener('input', () => {
        act.target = furnNameIn.value;
        act.furnitureName = furnNameIn.value;
        const matched = (state.quest.furniture || []).find(f => (f.name === act.target || f.id === act.target));
        if (matched) act.furnitureId = matched.id;
      });
    }
    const furnXIn = card.querySelector('.act-field-furn-x');
    const furnYIn = card.querySelector('.act-field-furn-y');
    if (furnXIn) {
      furnXIn.addEventListener('change', () => {
        const nx = parseInt(furnXIn.value) || 0;
        act.x = nx;
        if (!Array.isArray(act.tile)) act.tile = [nx, 0];
        act.tile[0] = nx;
      });
    }
    if (furnYIn) {
      furnYIn.addEventListener('change', () => {
        const ny = parseInt(furnYIn.value) || 0;
        act.y = ny;
        if (!Array.isArray(act.tile)) act.tile = [0, ny];
        act.tile[1] = ny;
      });
    }
    const furnMsgIn = card.querySelector('.act-field-furn-msg');
    if (furnMsgIn) {
      furnMsgIn.addEventListener('input', () => {
        act.message = furnMsgIn.value;
      });
    }

    const mTypeIn = card.querySelector('.act-field-monster-type');
    if (mTypeIn) mTypeIn.addEventListener('change', () => { act.monsterType = mTypeIn.value; });
    const countIn = card.querySelector('.act-field-count');
    if (countIn) countIn.addEventListener('change', () => { act.count = parseInt(countIn.value) || 1; });

    const goldIn = card.querySelector('.act-field-gold');
    if (goldIn) goldIn.addEventListener('change', () => { act.gold = parseInt(goldIn.value) || 0; });
    const itemIn = card.querySelector('.act-field-item');
    if (itemIn) itemIn.addEventListener('input', () => { act.item = itemIn.value; });

    const outcomeIn = card.querySelector('.act-field-outcome');
    if (outcomeIn) outcomeIn.addEventListener('change', () => { act.outcome = outcomeIn.value; });

    const delBtn = card.querySelector('.btn-del-act');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        recordHistory();
        st.actions.splice(idx, 1);
        renderActionPipelineUI(st);
        updateTriggerTabUI();
        render();
      });
    }

    list.appendChild(card);
  });
}

function updateTriggerTabUI() {
  if (!dom.triggerList) return;
  const list = dom.triggerList;
  list.innerHTML = '';

  const triggers = state.quest.storyTriggers || [];
  if (dom.badgeTriggerCount) {
    dom.badgeTriggerCount.textContent = triggers.length;
  }

  const filterVal = dom.filterTriggerEvent ? dom.filterTriggerEvent.value : 'all';
  const filtered = triggers.filter(t => filterVal === 'all' || (t.event || 'on_room_entered') === filterVal);

  if (filtered.length === 0) {
    list.innerHTML = `
      <div style="color:#64748b; font-size:11px; font-style:italic; padding:16px 8px; text-align:center;">
        No triggers match current filter. Click "+ Add Trigger" above to create one.
      </div>
    `;
    return;
  }

  filtered.forEach(st => {
    const realIdx = triggers.indexOf(st);
    const eventKey = st.event || 'on_room_entered';
    const eventDef = TRIGGER_EVENT_DEFS[eventKey] || TRIGGER_EVENT_DEFS.on_room_entered;

    let targetDesc = '';
    if (eventDef.targetType === 'room') {
      const room = state.blockmap?.rooms?.find(r => r.id === (st.room || st.target));
      targetDesc = `Room: ${room ? (room.name || room.id) : (st.room || st.target || 'Current')}`;
    } else if (eventDef.targetType === 'door') {
      targetDesc = `Door: ${st.doorId || st.target || 'Any'}`;
    } else if (eventDef.targetType === 'monster') {
      const mon = state.quest.monsters?.find(m => m.id === (st.monsterId || st.target));
      targetDesc = `Monster: ${mon ? mon.name : (st.monsterId || st.target || 'Any')}`;
    } else if (eventDef.targetType === 'tile') {
      targetDesc = `Tile: [${st.tile[0]}, ${st.tile[1]}]`;
    } else {
      targetDesc = `Target: Global Event`;
    }

    const actionBadgesHtml = (st.actions || []).map(a => {
      const def = TRIGGER_ACTION_DEFS[a.type] || { name: a.type, icon: '⚡' };
      return `<span class="badge" style="font-size:9px; padding:1px 5px; background:rgba(30,41,59,0.8);">${def.icon} ${def.name}</span>`;
    }).join(' ');

    const card = document.createElement('div');
    card.className = 'trigger-card';
    card.innerHTML = `
      <div class="trigger-card-header">
        <span class="trigger-event-badge badge-${eventKey}">${eventDef.icon} ${eventDef.label}</span>
        <span style="font-weight:600; font-size:11px; color:#cbd5e1; margin-left:4px;">[${st.marker}]</span>
        <button class="btn btn-xs btn-danger btn-del-trigger" data-idx="${realIdx}" title="Delete Trigger" style="margin-left:auto;">🗑️</button>
      </div>
      <div class="trigger-card-title">${escapeHtml(st.title || st.name || 'Untitled Trigger')}</div>
      <div class="trigger-card-target">${escapeHtml(targetDesc)}</div>
      <div class="trigger-card-actions-row" style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap;">
        ${actionBadgesHtml || '<span style="color:#64748b; font-size:10px; font-style:italic;">No actions</span>'}
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-trigger')) {
        recordHistory();
        deleteEntity('note', realIdx);
        updateTriggerTabUI();
      } else {
        state.selectedEntity = { type: 'note', index: realIdx, data: st };
        switchSidebarTab('tab-entity-inspector');
        updateInspectorUI();
        render();
      }
    });

    list.appendChild(card);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addTrigger(opts = {}) {
  const triggers = state.quest.storyTriggers;
  const mark = opts.marker || `Note ${String.fromCharCode(65 + triggers.length)}`;
  const eventType = opts.event || (state.blockmap?.rooms?.length > 0 ? 'on_room_entered' : 'on_tile_stepped_on');
  const defaultRoom = state.blockmap?.rooms?.[0]?.id || '';
  const newTrigger = {
    id: opts.id || `trigger-${mark.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36).slice(-4)}`,
    marker: mark,
    name: opts.name || opts.title || `${mark} Trigger`,
    title: opts.title || opts.name || `${mark} Trigger`,
    event: eventType,
    target: opts.target || (eventType === 'on_room_entered' ? defaultRoom : ''),
    room: opts.room || (eventType === 'on_room_entered' ? defaultRoom : ''),
    doorId: opts.doorId || '',
    monsterId: opts.monsterId || '',
    tile: opts.tile || [0, 0],
    onceOnly: opts.onceOnly !== undefined ? Boolean(opts.onceOnly) : true,
    narrative: opts.narrative || 'Mentor speaks: "As you step forward, ancient magic stirs..."',
    actions: opts.actions || [
      {
        type: 'play_movie',
        moviePath: 'res://assets/movies/quest1-intro.mp4',
        title: `${mark} Cinematic`,
        canSkip: true
      }
    ]
  };

  recordHistory();
  triggers.push(newTrigger);
  state.quest.triggers = triggers;
  state.selectedEntity = { type: 'note', index: triggers.length - 1, data: newTrigger };
  updateTriggerTabUI();
  updateEntitySummaryList();
  switchSidebarTab('tab-entity-inspector');
  updateInspectorUI();
  render();
  return newTrigger;
}

function addActionToTrigger(trigger, actionType = 'play_movie', customParams = {}) {
  if (!trigger) return null;
  if (!Array.isArray(trigger.actions)) trigger.actions = [];
  const def = TRIGGER_ACTION_DEFS[actionType] || { defaultParams: {} };
  const newAct = {
    type: actionType,
    ...def.defaultParams,
    ...customParams
  };
  trigger.actions.push(newAct);
  return newAct;
}

function removeActionFromTrigger(trigger, actionIndex) {
  if (!trigger || !Array.isArray(trigger.actions)) return false;
  if (actionIndex >= 0 && actionIndex < trigger.actions.length) {
    trigger.actions.splice(actionIndex, 1);
    return true;
  }
  return false;
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

  // Corridor lookup helper
  const hasCorridorList = Boolean(blockmap && Array.isArray(blockmap.corridors) && blockmap.corridors.length > 0);
  const corridorSet = hasCorridorList
    ? new Set(blockmap.corridors.map(t => `${t[0]},${t[1]}`))
    : null;

  // -------------------------------------------------------------
  // Rule 1: Furniture outside of bounds of single room
  // (Treasure chests and stairs can appear in corridors)
  // -------------------------------------------------------------
  if (Array.isArray(quest.furniture)) {
    quest.furniture.forEach((f, idx) => {
      const w = f.width || 1;
      const h = f.height || 1;
      const furnName = f.name || f.type || 'Furniture';
      const furnType = String(f.type || '').toLowerCase();
      const furnNameLower = String(f.name || '').toLowerCase();
      const isChest = furnType === 'chest' ||
                      furnType === 'treasure_chest' ||
                      furnType === 'treasure-chest' ||
                      furnType.includes('chest') ||
                      furnNameLower.includes('chest');
      const isStair = furnType.includes('stair') || furnNameLower.includes('stair');
      const isCorridorAllowed = isChest || isStair;

      const tiles = [];
      const roomsEncountered = new Map();
      const corridorTiles = [];
      const voidTiles = [];

      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          const col = f.x + dx;
          const row = f.y + dy;
          tiles.push([col, row]);
          const room = getRoomAt(col, row);
          if (room) {
            if (!roomsEncountered.has(room.id)) {
              roomsEncountered.set(room.id, { room, tiles: [] });
            }
            roomsEncountered.get(room.id).tiles.push([col, row]);
          } else {
            // Check if this non-room tile is a valid corridor or void/outside bounds
            let isCorridor = true;
            if (hasCorridorList) {
              isCorridor = corridorSet.has(`${col},${row}`);
            } else if (blockmap && Array.isArray(blockmap.gridDimensions)) {
              const [cols, rows] = blockmap.gridDimensions;
              const border = blockmap.additionalBorderTile ? 1 : 0;
              isCorridor = col >= -border && col < cols + border && row >= -border && row < rows + border;
            }

            if (isCorridor) {
              corridorTiles.push([col, row]);
            } else {
              voidTiles.push([col, row]);
            }
          }
        }
      }

      // 1a: Extends into void or outside board boundaries
      if (isCorridorAllowed) {
        if (voidTiles.length > 0) {
          const voidStr = voidTiles.map(t => `[${t[0]}, ${t[1]}]`).join(', ');
          errors.push({
            id: `furn-bounds-void-${f.id || idx}`,
            category: 'furniture_bounds',
            categoryLabel: 'Furniture Bounds',
            icon: '🪑',
            title: `${furnName} Outside Board Bounds`,
            description: `${furnName} at [${f.x}, ${f.y}] (${w}×${h}) is placed in void or outside board boundaries at tile${voidTiles.length > 1 ? 's' : ''} ${voidStr}.`,
            tiles: voidTiles,
            allTiles: tiles,
            entityType: 'furniture',
            entityIndex: idx,
            entityId: f.id || null,
            anchor: [f.x, f.y]
          });
        }

        // 1b: Straddles room and corridor boundaries
        if (roomsEncountered.size > 0 && corridorTiles.length > 0) {
          const corrStr = corridorTiles.map(t => `[${t[0]}, ${t[1]}]`).join(', ');
          errors.push({
            id: `furn-bounds-corr-${f.id || idx}`,
            category: 'furniture_bounds',
            categoryLabel: 'Furniture Bounds',
            icon: '🪑',
            title: `${furnName} Straddles Room and Corridor`,
            description: `${furnName} at [${f.x}, ${f.y}] (${w}×${h}) straddles room and corridor boundaries at tile${corridorTiles.length > 1 ? 's' : ''} ${corrStr}.`,
            tiles: corridorTiles,
            allTiles: tiles,
            entityType: 'furniture',
            entityIndex: idx,
            entityId: f.id || null,
            anchor: [f.x, f.y]
          });
        }
      } else {
        // Non-corridor furniture cannot extend outside rooms into corridors or void
        const outTiles = [...corridorTiles, ...voidTiles];
        if (outTiles.length > 0) {
          const corrStr = outTiles.map(t => `[${t[0]}, ${t[1]}]`).join(', ');
          errors.push({
            id: `furn-bounds-corr-${f.id || idx}`,
            category: 'furniture_bounds',
            categoryLabel: 'Furniture Bounds',
            icon: '🪑',
            title: `${furnName} Outside Room Bounds`,
            description: `${furnName} at [${f.x}, ${f.y}] (${w}×${h}) extends outside room boundaries into corridor or void at tile${outTiles.length > 1 ? 's' : ''} ${corrStr}.`,
            tiles: outTiles,
            allTiles: tiles,
            entityType: 'furniture',
            entityIndex: idx,
            entityId: f.id || null,
            anchor: [f.x, f.y]
          });
        }
      }

      // 1c: Straddles multiple rooms
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

      const isDoubleH = d.door_type === 'double-2x1' || d.door_type === 'double-h' || d.width === 2;
      const isDoubleV = d.door_type === 'double-1x2' || d.door_type === 'double-v' || d.height === 2;
      const isDouble = isDoubleH || isDoubleV;
      const allTiles = [from, to];
      if (isDoubleH) {
        allTiles.push([from[0] + 1, from[1]], [to[0] + 1, to[1]]);
      } else if (isDoubleV) {
        allTiles.push([from[0], from[1] + 1], [to[0], to[1] + 1]);
      }

      const r1 = getRoomAt(from[0], from[1]);
      const r2 = getRoomAt(to[0], to[1]);
      let r3 = null, r4 = null;
      if (isDoubleH) {
        r3 = getRoomAt(from[0] + 1, from[1]);
        r4 = getRoomAt(to[0] + 1, to[1]);
      } else if (isDoubleV) {
        r3 = getRoomAt(from[0], from[1] + 1);
        r4 = getRoomAt(to[0], to[1] + 1);
      }

      const doorName = d.name || (d.is_secret ? (isDouble ? 'Secret Double Door' : 'Secret Door') : (d.state === 'open' ? (isDouble ? 'Open Double Door' : 'Open Door') : (isDouble ? 'Double Door' : 'Door')));
      const doorId = d.id || idx;

      // In HeroQuest, a door connects a room to a corridor or connects two rooms.
      // Invalid: Both sides are corridors (!r1 && !r2) or both sides are in the same room (r1 && r2 && r1.id === r2.id)
      const half1Corridor = (!r1 && !r2);
      const half2Corridor = isDouble && (!r3 && !r4);
      const half1Interior = (r1 && r2 && r1.id === r2.id);
      const half2Interior = isDouble && (r3 && r4 && r3.id === r4.id);

      if (half1Corridor || half2Corridor) {
        errors.push({
          id: `door-wall-corridor-${doorId}`,
          category: 'door_wall',
          categoryLabel: 'Door Wall',
          icon: '🚪',
          title: `${doorName} Floating in Corridor`,
          description: `${doorName} between [${from[0]}, ${from[1]}] and [${to[0]}, ${to[1]}] is not attached to any room perimeter wall (both sides are corridors).`,
          tiles: allTiles,
          allTiles: allTiles,
          entityType: 'door',
          entityIndex: idx,
          entityId: d.id || null,
          doorEdge: { from, to },
          anchor: from
        });
      } else if (half1Interior || half2Interior) {
        const roomName = (r1 ? (r1.name || r1.id) : (r3 ? (r3.name || r3.id) : 'Room'));
        errors.push({
          id: `door-wall-interior-${doorId}`,
          category: 'door_wall',
          categoryLabel: 'Door Wall',
          icon: '🚪',
          title: `${doorName} Inside Room Floor`,
          description: `${doorName} between [${from[0]}, ${from[1]}] and [${to[0]}, ${to[1]}] is placed inside open floor space within ${roomName} instead of on its perimeter wall.`,
          tiles: allTiles,
          allTiles: allTiles,
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
  const cleanSpec = spec
    .replace(/\b(?:to|in|into|at|inside)\s+(?:b|g)rooms?\b/gi, (match) => {
      const prep = match.split(/\s+/)[0];
      return `${prep} room`;
    })
    .replace(/\b(?:b|g)rooms?\s+(#?\d+|[a-z0-9\-_]+)\b/gi, 'room $1')
    .replace(/^(?:in|to|into|at|inside|the)\s+/g, '')
    .replace(/[.,!?;:]+$/g, '')
    .trim();

  const wordMap = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23, 'twenty-four': 24, 'twenty-five': 25,
    'twenty one': 21, 'twenty two': 22, 'twenty three': 23, 'twenty four': 24, 'twenty five': 25,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
    sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
    eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
    sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20
  };

  // Match room number or word, e.g. "room 1", "room 19", "broom 19", "room nineteen", "second room", "first room", "two", "2", "one", "1"
  const numMatch = cleanSpec.match(/(?:(?:the\s+)?(?:room|broom|groom)\s*#?|(?:the\s+))?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)(?:\s+(?:room|broom|groom))?\b/i);
  if (numMatch) {
    let n = parseInt(numMatch[1], 10);
    if (isNaN(n)) {
      n = wordMap[numMatch[1].toLowerCase()];
    }
    if (n !== undefined) {
      // 1. Try matching room with name containing Room N, Room #N, or id containing N / room-N
      const matchByName = rooms.find(r =>
        (r.name && (new RegExp(`\\broom\\s*#?${n}\\b`, 'i').test(r.name) || new RegExp(`\\b${n}\\b`).test(r.name))) ||
        (r.id && (new RegExp(`\\b${n}\\b`).test(r.id) || r.id === `room-${n}` || r.id === `r${n}`))
      );
      if (matchByName) return matchByName;
      // 2. Try 1-based index in rooms array
      if (n >= 1 && n <= rooms.length) {
        return rooms[n - 1];
      }
    }
  }

  // Substring match on name or id
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

  const cleanInput = spokenText
    .replace(/[(\[*]\s*(?:wind\s+blowing|wind|music|applause|laughter|cough|sigh|noise|groan|chatter)\s*[)\]*]/gi, ' ')
    .replace(/[(\[*][^()\[\]]{2,30}[)\]*]/g, ' ')
    .replace(/\b(?:to|in|into|at|inside)\s+(?:b|g)rooms?\b/gi, (match) => {
      const prep = match.split(/\s+/)[0];
      return `${prep} room`;
    })
    .replace(/\b(?:b|g)rooms?\s+(#?\d+|[a-z0-9\-_]+)\b/gi, 'room $1')
    .trim();

  if (!cleanInput) return [];

  const WORD_TO_NUM = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23, 'twenty-four': 24, 'twenty-five': 25,
    'twenty one': 21, 'twenty two': 22, 'twenty three': 23, 'twenty four': 24, 'twenty five': 25,
    'a couple': 2, 'a couple of': 2, 'a pair': 2, 'a pair of': 2
  };

  const MONSTERS = [
    { type: 'skeleton', keys: ['skeletons', 'skeleton', 'skellies', 'skelly'] },
    { type: 'orc', keys: ['orcs', 'orc'] },
    { type: 'goblin', keys: ['goblins', 'goblin'] },
    { type: 'zombie', keys: ['zombies', 'zombie', 'zombys', 'zomby'] },
    { type: 'mummy', keys: ['mummies', 'mummy'] },
    { type: 'chaos_warrior', keys: ['chaos warriors', 'chaos warrior', 'chaos'] },
    { type: 'fimir', keys: ['fimirs', 'fimir', 'abominations', 'abomination'] },
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
    { type: 'secret', keys: ['secret doors', 'secret door', 'hidden doors', 'hidden door', 'concealed doors', 'concealed door'] },
    { type: 'wood-open', keys: ['open doors', 'open door', 'open wooden doors', 'open wooden door', 'open wood doors', 'open wood door'] },
    { type: 'wood-closed', keys: [
      'closed doors', 'closed door', 'closed wooden doors', 'closed wooden door', 'closed wood doors', 'closed wood door',
      'wooden doors', 'wooden door', 'wood doors', 'wood door',
      'iron doors', 'iron door', 'metal doors', 'metal door', 'stone doors', 'stone door',
      'doors', 'door'
    ] }
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

  const sentences = cleanInput.split(/[.!?;\n]+/);
  const commands = [];

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;

    const ROOM_TERM = `(?:this\\s+room|current\\s+room|room\\s*#?\\s*\\d+|room\\s+[a-z]+|[a-z0-9\\s'-]+?(?:room|crypt|hall|chamber|tomb))\\b`;
    const BETWEEN_REGEX = new RegExp(`\\b(?:between\\s+)(${ROOM_TERM})\\s+and\\s+(?:room\\s*#?\\s*)?(${ROOM_TERM}|\\d+)`, 'gi');
    const DIRECTION_ROOM_REGEX = new RegExp(`\\b(?:in|to|into|inside|at|on|along)\\s+(?:the\\s+)?(?:(north|south|east|west|top|bottom|left|right)\\s+wall\\s+(?:of|in)\\s+)?(${ROOM_TERM})`, 'gi');

    let betweenMatches = [...sentence.matchAll(BETWEEN_REGEX)];
    let matches = [];
    if (betweenMatches.length > 0) {
      matches = betweenMatches.map(m => {
        let sec = m[2];
        if (/^\d+$/.test(sec.trim())) sec = 'room ' + sec.trim();
        return {
          index: m.index,
          length: m[0].length,
          matchStr: m[0],
          room: m[1],
          secondRoom: sec,
          wall: null
        };
      });
    } else {
      let dirMatches = [...sentence.matchAll(DIRECTION_ROOM_REGEX)];
      matches = dirMatches.map(m => ({
        index: m.index,
        length: m[0].length,
        matchStr: m[0],
        room: m[2],
        secondRoom: null,
        wall: m[1] || null
      }));
    }

    let clauses = [];
    if (matches.length === 0) {
      clauses = [{ text: sentence, room: 'this room', wall: null, secondRoom: null }];
    } else if (matches.length === 1) {
      const cleanedText = sentence.slice(0, matches[0].index) + ' ' + sentence.slice(matches[0].index + matches[0].length);
      clauses = [{ text: cleanedText, room: matches[0].room, wall: matches[0].wall, secondRoom: matches[0].secondRoom }];
    } else {
      let prevEnd = 0;
      for (let i = 0; i < matches.length; i++) {
        const curMatch = matches[i];
        const end = (i < matches.length - 1) ? curMatch.index + curMatch.length : sentence.length;
        const rawClause = sentence.substring(prevEnd, end);
        const cleanedText = rawClause.replace(curMatch.matchStr, ' ');
        clauses.push({ text: cleanedText, room: curMatch.room, wall: curMatch.wall, secondRoom: curMatch.secondRoom });
        prevEnd = end;
      }
    }

    for (const clause of clauses) {
      let remaining = clause.text;

      // Extract trailing wall direction if not captured by room preposition (e.g. "to room 1 on the north wall")
      let clauseWall = clause.wall;
      if (!clauseWall) {
        const wallMatch = remaining.match(/\b(?:(?:on|along|at)\s+(?:the\s+)?)?(north|south|east|west|top|bottom|left|right)\s+wall\b/i);
        if (wallMatch) {
          clauseWall = wallMatch[1].toLowerCase();
          remaining = remaining.replace(wallMatch[0], ' ');
        }
      }

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
            targetRoom: clause.room,
            wall: clauseWall || null,
            secondRoom: clause.secondRoom || null
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
  const trimmed = (spokenText || '').trim();
  if (/^[(\[*]\s*(?:wind\s+blowing|wind|music|applause|laughter|cough|noise|sigh|groan|chatter)[)\]*][.!]*$/i.test(trimmed)) {
    return { success: true, placed: [], isAmbient: true };
  }

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
      const existingDoors = currentQuest.doors || [];
      const hasDoorAtEdge = (c1, r1, c2, r2) => {
        return existingDoors.some(d =>
          (d.from[0] === c1 && d.from[1] === r1 && d.to[0] === c2 && d.to[1] === r2) ||
          (d.from[0] === c2 && d.from[1] === r2 && d.to[0] === c1 && d.to[1] === r1)
        );
      };

      const geom = (typeof getGridGeometry === 'function') ? getGridGeometry() : {
        cols: currentBlockmap.gridDimensions ? currentBlockmap.gridDimensions[0] : 28,
        rows: currentBlockmap.gridDimensions ? currentBlockmap.gridDimensions[1] : 21
      };

      const getRoomAt = (c, r) => {
        if (!currentBlockmap || !currentBlockmap.rooms) return null;
        for (const rm of currentBlockmap.rooms) {
          if (rm.tiles) {
            if (rm.tiles.some(t => t[0] === c && t[1] === r)) return rm;
          } else if (rm.x !== undefined) {
            if (c >= rm.x && c < rm.x + rm.w && r >= rm.y && r < rm.y + rm.h) return rm;
          }
        }
        return null;
      };

      // Second room target if inter-room door requested (e.g. "between room 1 and room 2")
      let targetRoom2 = null;
      if (cmd.secondRoom) {
        targetRoom2 = findTargetRoom(cmd.secondRoom, currentBlockmap, currentContext);
      }

      // Desired wall direction (north, south, east, west)
      let desiredWall = null;
      if (cmd.wall) {
        const w = cmd.wall.toLowerCase().trim();
        if (w === 'top' || w === 'north') desiredWall = 'north';
        else if (w === 'bottom' || w === 'south') desiredWall = 'south';
        else if (w === 'left' || w === 'west') desiredWall = 'west';
        else if (w === 'right' || w === 'east') desiredWall = 'east';
      }

      const corridorSet = new Set((currentBlockmap.corridors || []).map(t => `${t[0]},${t[1]}`));
      const hasCorridorsList = Boolean(currentBlockmap.corridors && currentBlockmap.corridors.length > 0);

      // Collect all candidate perimeter edges of targetRoom
      const candidateEdges = [];
      for (const [col, row] of roomTiles) {
        const neighbors = [
          { nc: col, nr: row - 1, wall: 'north' },
          { nc: col, nr: row + 1, wall: 'south' },
          { nc: col - 1, nr: row, wall: 'west' },
          { nc: col + 1, nr: row, wall: 'east' }
        ];

        for (const { nc, nr, wall } of neighbors) {
          // Inside board boundary
          if (nc < 0 || nc >= geom.cols || nr < 0 || nr >= geom.rows) continue;
          // Not within the same room
          if (roomTileSet.has(`${nc},${nr}`)) continue;
          // No door already placed on this edge
          if (hasDoorAtEdge(col, row, nc, nr)) continue;

          const otherRoom = getRoomAt(nc, nr);
          const isCorridor = hasCorridorsList ? corridorSet.has(`${nc},${nr}`) : !otherRoom;

          // Per HeroQuest rules, a door must connect a room to a corridor or to an adjacent room
          if (!isCorridor && !otherRoom) continue;

          candidateEdges.push({
            col, row, nc, nr, wall,
            otherRoom,
            isCorridor
          });
        }
      }

      // Filter by secondRoom if requested
      let pool = candidateEdges;
      if (targetRoom2) {
        pool = pool.filter(c => c.otherRoom && (c.otherRoom.id === targetRoom2.id || c.otherRoom.name === targetRoom2.name));
      }

      // Filter by desired wall direction if specified
      if (desiredWall) {
        const wallMatches = pool.filter(c => c.wall === desiredWall);
        if (wallMatches.length > 0) {
          pool = wallMatches;
        }
      }

      const neededCount = Math.max(1, cmd.count || 1);
      const selected = [];
      const usedIndices = new Set();
      if (pool.length <= neededCount) {
        selected.push(...pool);
      } else {
        const step = pool.length / neededCount;
        for (let i = 0; i < neededCount; i++) {
          let idx = Math.floor(i * step + step / 2);
          if (idx >= pool.length) idx = pool.length - 1;
          while (usedIndices.has(idx) && idx < pool.length - 1) idx++;
          while (usedIndices.has(idx) && idx > 0) idx--;
          if (!usedIndices.has(idx)) {
            usedIndices.add(idx);
            selected.push(pool[idx]);
          }
        }
      }

      if (!currentQuest.doors) currentQuest.doors = [];

      for (const edge of selected) {
        const isSecret = cmd.type === 'secret';
        const isOpen = cmd.type === 'wood-open';
        const doorNum = currentQuest.doors.length + 1;
        const defaultName = isSecret ? `Secret Door ${doorNum}` : `Door ${doorNum}`;
        const newDoor = {
          id: `door-${doorNum}`,
          name: defaultName,
          from: [edge.col, edge.row],
          to: [edge.nc, edge.nr],
          state: isSecret ? 'secret' : (isOpen ? 'open' : 'closed'),
          is_secret: isSecret,
          room: targetRoom.id || ''
        };
        currentQuest.doors.push(newDoor);
        placedCount++;
      }

      if (placedCount > 0) {
        const doorLabel = (cmd.type === 'secret') ? 'secret door' : ((cmd.type === 'wood-open') ? 'open door' : 'door');
        let summary = `${placedCount} ${doorLabel}${placedCount > 1 ? 's' : ''}`;
        if (targetRoom2) {
          summary += ` between ${roomName} and ${targetRoom2.name || targetRoom2.id}`;
        } else {
          summary += ` in ${roomName}`;
          if (desiredWall) {
            summary += ` on ${desiredWall} wall`;
          }
        }
        placedSummary.push(summary);
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
  if (dom.selectDoorSize) {
    dom.selectDoorSize.addEventListener('change', () => {
      state.subtool.doorSize = dom.selectDoorSize.value;
      render();
    });
  }
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
    if (type === 'monster' && state.quest.monsters[index]) {
      state.quest.monsters[index].name = dom.inspectName.value;
      if (state.selectedEntity.data) state.selectedEntity.data.name = dom.inspectName.value;
    }
    if (type === 'furniture' && state.quest.furniture[index]) {
      state.quest.furniture[index].name = dom.inspectName.value;
      if (state.selectedEntity.data) state.selectedEntity.data.name = dom.inspectName.value;
    }
    if (type === 'door' && state.quest.doors[index]) {
      state.quest.doors[index].name = dom.inspectName.value;
      if (state.selectedEntity.data) state.selectedEntity.data.name = dom.inspectName.value;
    }
    if (type === 'trap' && state.quest.traps[index]) {
      state.quest.traps[index].name = dom.inspectName.value;
      if (state.selectedEntity.data) state.selectedEntity.data.name = dom.inspectName.value;
    }
    if (type === 'wall-block' && state.quest.wallBlocks[index]) {
      state.quest.wallBlocks[index].name = dom.inspectName.value;
      if (state.selectedEntity.data) state.selectedEntity.data.name = dom.inspectName.value;
    }
    updateEntitySummaryList();
  });

  if (dom.inspectHidden) {
    dom.inspectHidden.addEventListener('change', () => {
      if (!state.selectedEntity) return;
      const { type, index } = state.selectedEntity;
      const isHidden = dom.inspectHidden.checked;
      recordHistory();
      if (type === 'monster' && state.quest.monsters[index]) state.quest.monsters[index].hidden = isHidden;
      else if (type === 'door' && state.quest.doors[index]) state.quest.doors[index].hidden = isHidden;
      else if (type === 'furniture' && state.quest.furniture[index]) state.quest.furniture[index].hidden = isHidden;
      else if (type === 'trap' && state.quest.traps[index]) state.quest.traps[index].hidden = isHidden;
      else if ((type === 'note' || type === 'trigger') && state.quest.storyTriggers[index]) state.quest.storyTriggers[index].hidden = isHidden;
      else if (type === 'wall-block' && state.quest.wallBlocks[index]) state.quest.wallBlocks[index].hidden = isHidden;
      render();
      updateEntitySummaryList();
    });
  }

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
      updateEntitySummaryList();
    }
  });
  dom.inspectDoorSecret.addEventListener('change', () => {
    if (state.selectedEntity?.type === 'door') {
      state.quest.doors[state.selectedEntity.index].is_secret = dom.inspectDoorSecret.checked;
      render();
      updateEntitySummaryList();
    }
  });
  if (dom.inspectDoorType) {
    dom.inspectDoorType.addEventListener('change', () => {
      if (state.selectedEntity?.type === 'door') {
        recordHistory();
        const d = state.quest.doors[state.selectedEntity.index];
        if (d) {
          const val = dom.inspectDoorType.value;
          d.door_type = val;
          d.width = val === 'double-2x1' ? 2 : 1;
          d.height = val === 'double-1x2' ? 2 : 1;
          updateInspectorUI();
          updateEntitySummaryList();
          render();
        }
      }
    });
  }

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
    if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
      const st = state.quest.storyTriggers[state.selectedEntity.index];
      st.marker = dom.inspectNoteMarker.value;
      updateTriggerTabUI();
      render();
    }
  });
  dom.inspectNoteTitle.addEventListener('input', () => {
    if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
      const st = state.quest.storyTriggers[state.selectedEntity.index];
      st.title = dom.inspectNoteTitle.value;
      st.name = dom.inspectNoteTitle.value;
      updateTriggerTabUI();
    }
  });
  dom.inspectNoteNarrative.addEventListener('input', () => {
    if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
      state.quest.storyTriggers[state.selectedEntity.index].narrative = dom.inspectNoteNarrative.value;
    }
  });
  if (dom.inspectTriggerEvent) {
    dom.inspectTriggerEvent.addEventListener('change', () => {
      if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
        const st = state.quest.storyTriggers[state.selectedEntity.index];
        st.event = dom.inspectTriggerEvent.value;
        updateTriggerTargetOptions(st);
        updateTriggerTabUI();
        render();
      }
    });
  }
  if (dom.inspectTriggerTargetRoom) {
    dom.inspectTriggerTargetRoom.addEventListener('change', () => {
      if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
        const st = state.quest.storyTriggers[state.selectedEntity.index];
        st.room = dom.inspectTriggerTargetRoom.value;
        st.target = st.room;
        updateTriggerTabUI();
      }
    });
  }
  if (dom.inspectTriggerTargetDoor) {
    dom.inspectTriggerTargetDoor.addEventListener('change', () => {
      if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
        const st = state.quest.storyTriggers[state.selectedEntity.index];
        st.doorId = dom.inspectTriggerTargetDoor.value;
        st.target = st.doorId;
        updateTriggerTabUI();
      }
    });
  }
  if (dom.inspectTriggerTargetMonster) {
    dom.inspectTriggerTargetMonster.addEventListener('change', () => {
      if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
        const st = state.quest.storyTriggers[state.selectedEntity.index];
        st.monsterId = dom.inspectTriggerTargetMonster.value;
        st.target = st.monsterId;
        updateTriggerTabUI();
      }
    });
  }
  if (dom.inspectTriggerTileX) {
    dom.inspectTriggerTileX.addEventListener('change', () => {
      if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
        const st = state.quest.storyTriggers[state.selectedEntity.index];
        if (!st.tile) st.tile = [0, 0];
        st.tile[0] = parseInt(dom.inspectTriggerTileX.value) || 0;
        updateTriggerTabUI();
        render();
      }
    });
  }
  if (dom.inspectTriggerTileY) {
    dom.inspectTriggerTileY.addEventListener('change', () => {
      if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
        const st = state.quest.storyTriggers[state.selectedEntity.index];
        if (!st.tile) st.tile = [0, 0];
        st.tile[1] = parseInt(dom.inspectTriggerTileY.value) || 0;
        updateTriggerTabUI();
        render();
      }
    });
  }
  if (dom.inspectTriggerOnceOnly) {
    dom.inspectTriggerOnceOnly.addEventListener('change', () => {
      if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
        const st = state.quest.storyTriggers[state.selectedEntity.index];
        st.onceOnly = dom.inspectTriggerOnceOnly.checked;
      }
    });
  }
  if (dom.btnAddAction) {
    dom.btnAddAction.addEventListener('click', () => {
      if (state.selectedEntity?.type === 'note' || state.selectedEntity?.type === 'trigger') {
        const st = state.quest.storyTriggers[state.selectedEntity.index];
        const actionType = dom.selectNewActionType ? dom.selectNewActionType.value : 'play_movie';
        recordHistory();
        addActionToTrigger(st, actionType);
        renderActionPipelineUI(st);
        updateTriggerTabUI();
        render();
      }
    });
  }
  if (dom.btnAddTrigger) {
    dom.btnAddTrigger.addEventListener('click', () => {
      const filterVal = dom.filterTriggerEvent ? dom.filterTriggerEvent.value : 'all';
      const eventType = filterVal !== 'all' ? filterVal : 'on_room_entered';
      addTrigger({ event: eventType });
    });
  }
  if (dom.filterTriggerEvent) {
    dom.filterTriggerEvent.addEventListener('change', () => {
      updateTriggerTabUI();
    });
  }

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

  if (dom.btnOpenBlockmap) {
    dom.btnOpenBlockmap.addEventListener('click', openSelectedBlockmapInEditor);
  }

  if (dom.btnOpenCartridge) {
    dom.btnOpenCartridge.addEventListener('click', async () => {
      if (!window.robosQuestEditor) return;
      const res = await window.robosQuestEditor.openCartridgeDialog();
      if (res && res.success && res.filePath) {
        await loadCartridge(res.filePath);
      }
    });
  }

  dom.btnSaveCartridge.addEventListener('click', saveCartridge);
  if (dom.btnExportPng) {
    dom.btnExportPng.addEventListener('click', openExportPngModal);
  }
  if (dom.btnExportPdf) {
    dom.btnExportPdf.addEventListener('click', openExportPdfModal);
  }
  dom.btnExportJson.addEventListener('click', exportJson);
  dom.btnCopyJson.addEventListener('click', copyJson);
  dom.btnTestPlay.addEventListener('click', testPlay);

  // Export PNG Modal listeners
  if (dom.btnCloseExportPngModal) {
    dom.btnCloseExportPngModal.addEventListener('click', closeExportPngModal);
  }
  if (dom.btnCancelExportPng) {
    dom.btnCancelExportPng.addEventListener('click', closeExportPngModal);
  }
  if (dom.btnConfirmSavePng) {
    dom.btnConfirmSavePng.addEventListener('click', () => exportPng());
  }
  if (dom.btnCopyPngClipboard) {
    dom.btnCopyPngClipboard.addEventListener('click', () => copyPngToClipboard());
  }
  if (dom.exportPngModal) {
    dom.exportPngModal.addEventListener('click', (e) => {
      if (e.target === dom.exportPngModal) closeExportPngModal();
    });
  }
  if (dom.radioExportPngScale) {
    dom.radioExportPngScale.forEach(r => r.addEventListener('change', updateExportPngPreview));
  }
  [dom.chkExportGrid, dom.chkExportNames, dom.chkExportArtwork, dom.chkExportBanner].forEach(chk => {
    if (chk) chk.addEventListener('change', updateExportPngPreview);
  });

  // Export PDF Modal listeners
  if (dom.btnCloseExportPdfModal) {
    dom.btnCloseExportPdfModal.addEventListener('click', closeExportPdfModal);
  }
  if (dom.btnCancelExportPdf) {
    dom.btnCancelExportPdf.addEventListener('click', closeExportPdfModal);
  }
  if (dom.btnConfirmSavePdf) {
    dom.btnConfirmSavePdf.addEventListener('click', () => exportPdf());
  }
  if (dom.exportPdfModal) {
    dom.exportPdfModal.addEventListener('click', (e) => {
      if (e.target === dom.exportPdfModal) closeExportPdfModal();
    });
  }

  // ── Voice Dictation Integration with RobOS Voice Overlay App ─────────────
  const VOICE_GUIDANCE_PROMPT = "Tabletop Quest Map Editor Voice Assistant: The user is dictating quest map setup commands to place monsters, furniture, doors, traps, or wall blocks on the board (e.g. 'add 3 skeletons to room 1', 'place a treasure chest in room 2', 'put an orc in the north room').";
  const VOICE_API_URL = 'http://127.0.0.1:19188';

  const voiceState = {
    isListening: false,
    eventSource: null,
    capturedText: '',
    interimText: ''
  };

  async function toggleVoiceRecording() {
    if (voiceState.isListening) {
      await stopVoiceRecording();
    } else {
      await startVoiceRecording();
    }
  }

  async function startVoiceRecording() {
    if (voiceState.isListening) return;
    voiceState.isListening = true;
    voiceState.capturedText = '';
    voiceState.interimText = '';
    voiceState.bubbles = {};
    voiceState.executedBubbles = new Set();
    voiceState.executedTexts = new Set();

    // Indicator in the "record" icon to show we are listening
    if (dom.btnVoiceAddItems) {
      dom.btnVoiceAddItems.classList.add('listening', 'recording');
      dom.btnVoiceAddItems.setAttribute('aria-pressed', 'true');
      dom.btnVoiceAddItems.title = 'Listening... Click to stop recording';
    }

    // 1. Pop-up RobOS Voice app if not already running
    try {
      if (window.robosQuestEditor && typeof window.robosQuestEditor.ensureVoiceApp === 'function') {
        await window.robosQuestEditor.ensureVoiceApp();
      }
    } catch (err) {
      console.warn('[Voice] Error ensuring voice app:', err);
    }

    // 2. Pop-up RobOS Voice HUD and start dictating there (streams text to its text bubbles)
    try {
      await fetch(`${VOICE_API_URL}/api/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backgroundMode: false,
          activeApp: 'tabletop-quest-editor',
          guidancePrompt: VOICE_GUIDANCE_PROMPT,
        }),
      });
    } catch (err) {
      console.warn('[Voice] Failed to activate dictation on RobOS Voice overlay:', err);
    }

    // 3. Listen to that stream from the app via API
    if (typeof EventSource !== 'undefined') {
      try {
        if (voiceState.eventSource) {
          voiceState.eventSource.close();
        }
        voiceState.eventSource = new EventSource(`${VOICE_API_URL}/api/stream`);
        voiceState.eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (!data) return;

            // Handle structured bubble from AI stream
            const bubble = data.bubble || (data.type === 'bubble' ? data : null);
            if (bubble) {
              if (!voiceState.bubbles) voiceState.bubbles = {};
              voiceState.bubbles[bubble.bubbleId] = bubble;

              // If ambient noise (e.g. "(wind blowing)"), ignore without error
              if (bubble.isAmbient) {
                return;
              }

              // Real-time execution: when a bubble is final and has speech, execute it immediately!
              if (bubble.isFinal && bubble.msg) {
                if (!voiceState.executedBubbles) voiceState.executedBubbles = new Set();
                if (!voiceState.executedBubbles.has(bubble.bubbleId)) {
                  voiceState.executedBubbles.add(bubble.bubbleId);
                  if (!voiceState.executedTexts) voiceState.executedTexts = new Set();
                  voiceState.executedTexts.add(bubble.msg.trim());
                  executeVoiceMapCommands(bubble.msg, VOICE_GUIDANCE_PROMPT);
                }
              }
            }

            if (data.text) {
              const clean = data.text.trim();
              if (/^[(\[*]\s*(?:wind\s+blowing|wind|music|applause|laughter|cough|noise|sigh|groan)[)\]*][.!]*$/i.test(clean)) {
                return;
              }
              if (data.isFinal) {
                if (!voiceState.capturedText.endsWith(clean)) {
                  voiceState.capturedText = (voiceState.capturedText + ' ' + clean).trim();
                }
                voiceState.interimText = '';
                if (!voiceState.executedTexts) voiceState.executedTexts = new Set();
                if (!voiceState.executedTexts.has(clean)) {
                  voiceState.executedTexts.add(clean);
                  executeVoiceMapCommands(clean, VOICE_GUIDANCE_PROMPT);
                }
              } else {
                voiceState.interimText = clean;
              }
            }
          } catch {}
        };
      } catch (err) {
        console.warn('[Voice] SSE connection error:', err);
      }
    }
  }

  async function stopVoiceRecording() {
    if (!voiceState.isListening) return;
    voiceState.isListening = false;

    // Reset indicator in the "record" icon
    if (dom.btnVoiceAddItems) {
      dom.btnVoiceAddItems.classList.remove('listening', 'recording');
      dom.btnVoiceAddItems.setAttribute('aria-pressed', 'false');
      dom.btnVoiceAddItems.title = 'Voice Dictation: Click to record map setup instructions';
    }

    if (voiceState.eventSource) {
      try { voiceState.eventSource.close(); } catch {}
      voiceState.eventSource = null;
    }

    // Deactivate on RobOS Voice overlay and retrieve final transcribed text
    let finalText = (voiceState.capturedText || voiceState.interimText || '').trim();
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
      const res = await fetch(`${VOICE_API_URL}/api/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller ? controller.signal : undefined,
      });
      if (timer) clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.text && data.text.trim()) {
          finalText = data.text.trim();
        }
      }
    } catch (err) {
      console.warn('[Voice] Error deactivating voice dictation:', err);
    }

    if (finalText) {
      if (!voiceState.executedTexts || !voiceState.executedTexts.has(finalText)) {
        if (!voiceState.executedTexts) voiceState.executedTexts = new Set();
        voiceState.executedTexts.add(finalText);
        executeVoiceMapCommands(finalText, VOICE_GUIDANCE_PROMPT);
      }
    }
  }

  if (dom.btnVoiceAddItems) {
    dom.btnVoiceAddItems.addEventListener('click', (e) => {
      e.preventDefault();
      toggleVoiceRecording();
    });
  }

  // Expose for debugging and tests
  window.toggleVoiceRecording = toggleVoiceRecording;
  window.startVoiceRecording = startVoiceRecording;
  window.stopVoiceRecording = stopVoiceRecording;
  window.voiceState = voiceState;
  window.state = state;
  window.dom = dom;


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
    } else if (e.key === 'Escape') {
      if (dom.exportPngModal && dom.exportPngModal.style.display !== 'none') {
        closeExportPngModal();
      }
      if (dom.exportPdfModal && dom.exportPdfModal.style.display !== 'none') {
        closeExportPdfModal();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      openExportPngModal();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      openExportPdfModal();
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
    updateRoomNamesToggleUI,
    generateExportCanvas,
    generateQuestPdfHtml,
    exportPng,
    exportPdf,
    copyPngToClipboard,
    openExportPngModal,
    closeExportPngModal,
    openExportPdfModal,
    closeExportPdfModal,
    loadBlockmap,
    openSelectedBlockmapInEditor,
    loadCartridge,
    isStartingQuestAction,
    resolveTriggerIndicators,
    drawExportTriggerIndicator,
    formatTriggerEventName,
    renderActionPipelineRecursiveHtml
  };

  // Bootstrap application on window load
  window.addEventListener('DOMContentLoaded', initApp);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateQuest,
    loadCartridge,
    loadBlockmap,
    openSelectedBlockmapInEditor,
    isStartingQuestAction,
    resolveTriggerIndicators,
    drawExportTriggerIndicator,
    formatTriggerEventName,
    renderActionPipelineRecursiveHtml,
    interpretVoiceQuestCommands,
    executeVoiceMapCommands,
    findTargetRoom,
    findFreeTilesInRoom,
    findFreeRectInRoom,
    setupSplitDividers,
    toggleRoomNames,
    updateRoomNamesToggleUI,
    updateInspectorUI,
    updateEntitySummaryList,
    updateTriggerTargetOptions,
    updateTriggerTabUI,
    renderActionPipelineUI,
    addActionToTrigger,
    removeActionFromTrigger,
    addTrigger,
    buildCartridgePayload,
    generateExportCanvas,
    generateQuestPdfHtml,
    exportPng,
    exportPdf,
    copyPngToClipboard,
    openExportPngModal,
    closeExportPngModal,
    openExportPdfModal,
    closeExportPdfModal,
    findEntityAt,
    detectDoorEdge,
    handleCanvasClick,
    state,
    dom,
    MONSTER_DEFS,
    FURNITURE_DEFS,
    TRIGGER_EVENT_DEFS,
    TRIGGER_ACTION_DEFS
  };
}
