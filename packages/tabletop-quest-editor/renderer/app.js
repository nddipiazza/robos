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
    exitTile: null,
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
    noteMarker: 'Note A'
  },

  // Layer toggles
  layers: {
    showImage: true,
    showGrid: true,
    showRooms: true,
    showCorridors: true,
    showDoors: true,
    showMonsters: true,
    showFurniture: true,
    showTraps: true,
    showWallBlocks: true,
    showNotes: true,
    artOpacity: 1.0,
    gridOpacity: 0.75
  },

  // Undo / Redo history
  undoStack: [],
  redoStack: [],

  // Asset Sprite Cache
  assetCache: {}
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
  fireplace: { name: 'Fireplace', w: 2, h: 1, icon: '🔥' }
};

// -------------------------------------------------------------
// DOM Elements Cache
// -------------------------------------------------------------
const dom = {
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
  chkShowCorridors: document.getElementById('chk-show-corridors'),
  chkShowDoors: document.getElementById('chk-show-doors'),
  chkShowMonsters: document.getElementById('chk-show-monsters'),
  chkShowFurniture: document.getElementById('chk-show-furniture'),
  chkShowTraps: document.getElementById('chk-show-traps'),
  chkShowWallBlocks: document.getElementById('chk-show-wall-blocks'),
  chkShowNotes: document.getElementById('chk-show-notes'),
  sliderArtOpacity: document.getElementById('slider-art-opacity'),
  sliderGridOpacity: document.getElementById('slider-grid-opacity'),

  // Toast Container
  toastContainer: document.getElementById('toast-container')
};

dom.ctx = dom.canvas.getContext('2d');

// -------------------------------------------------------------
// Toast Messages
// -------------------------------------------------------------
function showToast(message, type = 'info') {
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
  render();
  showToast('Redone', 'info');
}

function updateHistoryButtons() {
  dom.btnUndo.disabled = state.undoStack.length === 0;
  dom.btnRedo.disabled = state.redoStack.length === 0;
}

// -------------------------------------------------------------
// Blockmap & Cartridge Loading
// -------------------------------------------------------------
async function initApp() {
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
      state.quest.wanderingMonster = mapData.wanderingMonster || 'orc';
      state.quest.startingStair = mapData.startingStair || c.header?.startingPosition || [0, 1];
      state.quest.exitTile = mapData.exitTile || mapData.exitStair || null;
      state.quest.doors = (mapData.doors || []).map((d, i) => ({
        id: d.id || `door-${i+1}`,
        from: d.from || [0, 0],
        to: d.to || [0, 1],
        state: d.state || 'closed',
        is_secret: Boolean(d.is_secret),
        room: d.room || ''
      }));
      state.quest.furniture = (mapData.furniture || []).map((f, i) => ({
        id: f.id || `furn-${i+1}`,
        name: f.name || f.type,
        type: f.type || 'chest',
        x: f.x || 0,
        y: f.y || 0,
        width: f.width || 1,
        height: f.height || 1,
        roomId: f.roomId || '',
        treasure: f.treasure || ''
      }));
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
        backgroundImage: bm.backgroundImage || '',
        tileSize: bm.tileSize || 39.0,
        pixelOffset: bm.pixelOffset || [0, 0],
        wanderingMonster: q.wanderingMonster || 'orc',
        startingStair: q.startingStair || [0, 1],
        startingPosition: q.startingStair || [0, 1],
        exitTile: q.exitTile || null,
        exitStair: q.exitTile || null,
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
  return {
    cols: dims[0],
    rows: dims[1],
    tileSize: tileSize,
    offsetX: offsetX,
    offsetY: offsetY
  };
}

function screenToWorld(sx, sy) {
  const wx = (sx - state.panX) / state.zoom;
  const wy = (sy - state.panY) / state.zoom;
  return { x: wx, y: wy };
}

function worldToTile(wx, wy) {
  const geom = getGridGeometry();
  const relX = wx - geom.offsetX;
  const relY = wy - geom.offsetY;
  const col = Math.floor(relX / geom.tileSize);
  const row = Math.floor(relY / geom.tileSize);
  if (col < 0 || col >= geom.cols || row < 0 || row >= geom.rows) {
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

  // 1. Board Background Artwork (Layer 1)
  if (state.layers.showImage && state.bgImage) {
    ctx.save();
    ctx.globalAlpha = state.layers.artOpacity;
    ctx.drawImage(state.bgImage, 0, 0);
    ctx.restore();
  }

  // 2. Corridors Underlay (Layer 1)
  if (state.layers.showCorridors && state.blockmap?.corridors) {
    ctx.fillStyle = 'rgba(71, 85, 105, 0.22)';
    for (const [c, r] of state.blockmap.corridors) {
      const pos = tileToWorld(c, r);
      ctx.fillRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
    }
  }

  // 3. Rooms Underlay (Layer 1)
  if (state.layers.showRooms && state.blockmap?.rooms) {
    for (const room of state.blockmap.rooms) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 2.0;

      if (room.tiles) {
        for (const [c, r] of room.tiles) {
          const pos = tileToWorld(c, r);
          ctx.fillRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
        }
      } else {
        const pos = tileToWorld(room.x, room.y);
        ctx.fillRect(pos.x, pos.y, room.w * geom.tileSize, room.h * geom.tileSize);
        ctx.strokeRect(pos.x, pos.y, room.w * geom.tileSize, room.h * geom.tileSize);
      }
    }
  }

  // 4. Grid Lines (Layer 1)
  if (state.layers.showGrid) {
    ctx.save();
    ctx.globalAlpha = state.layers.gridOpacity;
    ctx.strokeStyle = '#223249';
    ctx.lineWidth = 1.0;
    ctx.beginPath();

    const startX = geom.offsetX;
    const startY = geom.offsetY;
    const endX = startX + geom.cols * geom.tileSize;
    const endY = startY + geom.rows * geom.tileSize;

    // Vertical lines
    for (let c = 0; c <= geom.cols; c++) {
      const x = startX + c * geom.tileSize;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    // Horizontal lines
    for (let r = 0; r <= geom.rows; r++) {
      const y = startY + r * geom.tileSize;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 5. Starting Spiral Stairs & Quest Exit (Layer 2)
  if (state.quest.startingStair) {
    const [sc, sr] = state.quest.startingStair;
    const spos = tileToWorld(sc, sr);
    const stairsImg = state.assetCache['stairs'];
    const isBorder = isBorderTile(sc, sr);

    // Border tile indicator aura (highlights entrance from outside dungeon)
    if (isBorder) {
      ctx.save();
      ctx.fillStyle = 'rgba(14, 165, 233, 0.28)';
      ctx.fillRect(spos.x - 2, spos.y - 2, geom.tileSize + 4, geom.tileSize + 4);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(spos.x - 2, spos.y - 2, geom.tileSize + 4, geom.tileSize + 4);
      ctx.restore();
    }

    if (stairsImg) {
      ctx.drawImage(stairsImg, spos.x, spos.y, geom.tileSize, geom.tileSize);
    } else {
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(spos.x + 2, spos.y + 2, geom.tileSize - 4, geom.tileSize - 4);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(spos.x + 2, spos.y + 2, geom.tileSize - 4, geom.tileSize - 4);

      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪜', spos.x + geom.tileSize / 2, spos.y + geom.tileSize / 2);
    }

    // Label
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('START', spos.x + geom.tileSize / 2, spos.y + geom.tileSize - 4);

    if (state.selectedEntity && (state.selectedEntity.type === 'start' || state.selectedEntity.type === 'stairs')) {
      drawSelectionGlow(spos.x, spos.y, geom.tileSize, geom.tileSize);
    }
  }

  // 5b. Quest Exit Staircase / Escape Hatch
  if (state.quest.exitTile) {
    const [ec, er] = state.quest.exitTile;
    const epos = tileToWorld(ec, er);
    const stairsImg = state.assetCache['stairs'];
    const isBorder = isBorderTile(ec, er);

    // Border tile indicator aura (highlights exit to safety outside dungeon)
    if (isBorder) {
      ctx.save();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
      ctx.fillRect(epos.x - 2, epos.y - 2, geom.tileSize + 4, geom.tileSize + 4);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(epos.x - 2, epos.y - 2, geom.tileSize + 4, geom.tileSize + 4);
      ctx.restore();
    }

    if (stairsImg) {
      ctx.drawImage(stairsImg, epos.x, epos.y, geom.tileSize, geom.tileSize);
      ctx.save();
      ctx.fillStyle = 'rgba(5, 150, 105, 0.45)';
      ctx.fillRect(epos.x + 2, epos.y + 2, geom.tileSize - 4, geom.tileSize - 4);
      ctx.restore();
    } else {
      ctx.fillStyle = '#065f46';
      ctx.fillRect(epos.x + 2, epos.y + 2, geom.tileSize - 4, geom.tileSize - 4);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(epos.x + 2, epos.y + 2, geom.tileSize - 4, geom.tileSize - 4);

      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏁', epos.x + geom.tileSize / 2, epos.y + geom.tileSize / 2);
    }

    // Label
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', epos.x + geom.tileSize / 2, epos.y + geom.tileSize - 4);

    if (state.selectedEntity && state.selectedEntity.type === 'exit') {
      drawSelectionGlow(epos.x, epos.y, geom.tileSize, geom.tileSize);
    }
  }

  // 6. Wall Blocks (Layer 2)
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

  // 7. Traps (Layer 2)
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

  // 8. Furniture (Layer 2)
  if (state.layers.showFurniture && state.quest.furniture) {
    state.quest.furniture.forEach((f, i) => {
      const pos = tileToWorld(f.x, f.y);
      const fw = (f.width || 1) * geom.tileSize;
      const fh = (f.height || 1) * geom.tileSize;
      const furnImg = state.assetCache[f.type];

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

  // 9. Doors (Layer 2)
  if (state.layers.showDoors && state.quest.doors) {
    state.quest.doors.forEach((d, i) => {
      const isVertical = d.from[0] !== d.to[0];
      const c = isVertical ? Math.max(d.from[0], d.to[0]) : d.from[0];
      const r = isVertical ? d.from[1] : Math.max(d.from[1], d.to[1]);
      const basePos = tileToWorld(c, r);

      let dw, dh, dx, dy;
      if (isVertical) {
        dw = 8;
        dh = geom.tileSize * 0.75;
        dx = basePos.x - dw / 2;
        dy = basePos.y + (geom.tileSize - dh) / 2;
      } else {
        dw = geom.tileSize * 0.75;
        dh = 8;
        dx = basePos.x + (geom.tileSize - dw) / 2;
        dy = basePos.y - dh / 2;
      }

      const doorKey = d.state === 'open' ? 'door_open' : 'door_closed';
      const doorImg = state.assetCache[doorKey];

      if (doorImg && !d.is_secret) {
        // Draw texture
        ctx.drawImage(doorImg, dx, dy, dw, dh);
      } else {
        // Crisp vector representation
        ctx.fillStyle = d.is_secret ? '#a855f7' : (d.state === 'open' ? '#10b981' : '#b45309');
        ctx.fillRect(dx, dy, dw, dh);
        ctx.strokeStyle = d.is_secret ? '#d8b4fe' : (d.state === 'open' ? '#6ee7b7' : '#f59e0b');
        ctx.lineWidth = 1.5;
        ctx.strokeRect(dx, dy, dw, dh);

        // Secret 'S' badge
        if (d.is_secret) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S', dx + dw / 2, dy + dh / 2);
        }
      }

      if (state.selectedEntity && state.selectedEntity.type === 'door' && state.selectedEntity.index === i) {
        drawSelectionGlow(dx - 3, dy - 3, dw + 6, dh + 6);
      }
    });
  }

  // 10. Monsters (Layer 2)
  if (state.layers.showMonsters && state.quest.monsters) {
    state.quest.monsters.forEach((m, i) => {
      const pos = tileToWorld(m.pos[0], m.pos[1]);
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
    ctx.strokeStyle = state.subtool.doorType === 'secret' ? '#c084fc' : '#38bdf8';
    ctx.fillStyle = state.subtool.doorType === 'secret' ? 'rgba(192, 132, 252, 0.4)' : 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2.0;

    let dw, dh, dx, dy;
    if (e.orientation === 'v') {
      dw = 8;
      dh = geom.tileSize * 0.75;
      dx = e.cx - dw / 2;
      dy = e.cy - dh / 2;
    } else {
      dw = geom.tileSize * 0.75;
      dh = 8;
      dx = e.cx - dw / 2;
      dy = e.cy - dh / 2;
    }
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeRect(dx, dy, dw, dh);
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
    ctx.fillStyle = '#b45309';
    ctx.fillRect(pos.x, pos.y, w, h);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pos.x, pos.y, w, h);
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
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
    if (isBorderTile(col, row)) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
    }
  } else if (state.activeTool === 'exit') {
    ctx.fillStyle = '#059669';
    ctx.fillRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
    if (isBorderTile(col, row)) {
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(pos.x, pos.y, geom.tileSize, geom.tileSize);
    }
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
  const boardW = geom.cols * geom.tileSize;
  const boardH = geom.rows * geom.tileSize;
  const vpW = dom.canvas.width;
  const vpH = dom.canvas.height;

  const scaleX = (vpW - 80) / boardW;
  const scaleY = (vpH - 80) / boardH;
  state.zoom = Math.max(0.4, Math.min(2.5, Math.min(scaleX, scaleY)));

  state.panX = Math.round((vpW - boardW * state.zoom) / 2 - geom.offsetX * state.zoom);
  state.panY = Math.round((vpH - boardH * state.zoom) / 2 - geom.offsetY * state.zoom);

  updateZoomUI();
}

function updateZoomUI() {
  dom.infoZoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
}

// -------------------------------------------------------------
// Tool Handling & Interaction
// -------------------------------------------------------------
function updateStartSuboptsUI() {
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
  const tile = worldToTile(wx, wy);
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
    state.quest.startingStair = [col, row];
    state.selectedEntity = { type: 'start', index: 0, data: state.quest.startingStair };
    updateStartSuboptsUI();
    updateInspectorUI();
    updateEntitySummaryList();
  } else if (state.activeTool === 'exit') {
    state.quest.exitTile = [col, row];
    state.selectedEntity = { type: 'exit', index: 0, data: state.quest.exitTile };
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

  render();
}

function deleteEntity(type, index) {
  if (type === 'monster') {
    state.quest.monsters.splice(index, 1);
  } else if (type === 'door') {
    state.quest.doors.splice(index, 1);
  } else if (type === 'furniture') {
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
    item.innerHTML = `
      <div class="entity-item-main">
        <span class="entity-item-icon">🚪</span>
        <div>
          <div class="entity-item-name">${d.is_secret ? 'Secret Door' : 'Wood Door'} (${d.state})</div>
          <div class="entity-item-pos">[${d.from[0]},${d.from[1]}] ↔ [${d.to[0]},${d.to[1]}]</div>
        </div>
      </div>
      <button class="btn btn-sm btn-danger btn-del-entity">🗑️</button>
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
// Event Listeners Setup
// -------------------------------------------------------------
function setupEventListeners() {
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
  dom.chkShowCorridors.addEventListener('change', () => { state.layers.showCorridors = dom.chkShowCorridors.checked; render(); });
  dom.chkShowDoors.addEventListener('change', () => { state.layers.showDoors = dom.chkShowDoors.checked; render(); });
  dom.chkShowMonsters.addEventListener('change', () => { state.layers.showMonsters = dom.chkShowMonsters.checked; render(); });
  dom.chkShowFurniture.addEventListener('change', () => { state.layers.showFurniture = dom.chkShowFurniture.checked; render(); });
  dom.chkShowTraps.addEventListener('change', () => { state.layers.showTraps = dom.chkShowTraps.checked; render(); });
  dom.chkShowWallBlocks.addEventListener('change', () => { state.layers.showWallBlocks = dom.chkShowWallBlocks.checked; render(); });
  dom.chkShowNotes.addEventListener('change', () => { state.layers.showNotes = dom.chkShowNotes.checked; render(); });
  dom.sliderArtOpacity.addEventListener('input', () => { state.layers.artOpacity = parseFloat(dom.sliderArtOpacity.value); render(); });
  dom.sliderGridOpacity.addEventListener('input', () => { state.layers.gridOpacity = parseFloat(dom.sliderGridOpacity.value); render(); });

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
    const tile = worldToTile(world.x, world.y);

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
  syncQuestMetaInputs
};

// Bootstrap application on window load
window.addEventListener('DOMContentLoaded', initApp);
