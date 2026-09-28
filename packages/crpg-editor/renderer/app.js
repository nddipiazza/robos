/**
 * RobOS cRPG Editor — Unified Controller & Application Logic
 * Integrates Campaign, Character Sheet, Party Inventory, and Blockmap Level Design.
 */

// Pre-rolled Hero Archetypes for quick party scaffolding
const ARCHETYPES = {
  fighter: {
    id: "hero-vance",
    name: "Vance",
    race: "Human",
    class: "Fighter",
    subclass: "Champion",
    background: "Ward of Gorion",
    alignment: "Neutral Good",
    level: 1,
    xp: 0,
    portrait: "⚔️",
    str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8,
    ac: 16, hpMax: 12, hpCurrent: 12, speed: 30, initiative: 2, prof: 2,
    mainHand: "Longsword (+5 to hit, 1d8+3 sl)",
    offHand: "Steel Shield (+2 AC)",
    armor: "Chain Mail (AC 16)",
    helmet: "Iron Bascinet",
    cloak: "Traveler's Cloak",
    boots: "Stout Boots",
    ring1: "Ring of Princes (+1 AC/Saves)",
    quickItems: "2x Potion of Healing, Torch",
    spells: "",
    abilities: ["second-wind", "action-surge"],
    backstory: "Raised within the fortified monastery of Candlekeep by the sage Gorion. Trained in bladecraft by the Watchers."
  },
  rogue: {
    id: "hero-imoen",
    name: "Imoen",
    race: "Human",
    class: "Rogue",
    subclass: "Thief",
    background: "Candlekeep Mischief",
    alignment: "Neutral Good",
    level: 1,
    xp: 0,
    portrait: "🏹",
    str: 9, dex: 18, con: 16, int: 12, wis: 11, cha: 16,
    ac: 15, hpMax: 10, hpCurrent: 10, speed: 30, initiative: 4, prof: 2,
    mainHand: "Shortbow (+6 to hit, 1d6+4 pierc)",
    offHand: "Dagger (+6 to hit, 1d4+4)",
    armor: "Studded Leather Armor (AC 12+DEX)",
    helmet: "Leather Cap",
    cloak: "Cloak of Elvenkind",
    boots: "Soft Leather Boots",
    ring1: "Ring of Lockpicking",
    quickItems: "Thieves' Tools, 20x Arrows, Potion of Speed",
    spells: "",
    abilities: ["sneak-attack", "cunning-action"],
    backstory: "Childhood companion and foster sister in Candlekeep, always picking locks and following along on adventures."
  },
  wizard: {
    id: "hero-ignis",
    name: "Ignis",
    race: "High Elf",
    class: "Wizard",
    subclass: "Evoker",
    background: "Scholar of Candlekeep",
    alignment: "True Neutral",
    level: 1,
    xp: 0,
    portrait: "🔮",
    str: 8, dex: 15, con: 13, int: 17, wis: 12, cha: 10,
    ac: 12, hpMax: 7, hpCurrent: 7, speed: 30, initiative: 2, prof: 2,
    mainHand: "Quarterstaff (+1 to hit, 1d6 blud)",
    offHand: "Spell Component Pouch",
    armor: "Mage Robes",
    helmet: "Circlet of Focus",
    cloak: "Scholar's Mantle",
    boots: "Cloth Slippers",
    ring1: "Ring of Wizardry",
    quickItems: "Scroll of Magic Missile, Wand of Frost (3 ch)",
    spells: "Cantrips: Fire Bolt, Light, Prestidigitation. Spells: Magic Missile, Shield, Mage Armor, Burning Hands",
    backstory: "Apprentice archivist studying under Firebead Elfmirk. Fascinated by the weave of destructive magic."
  },
  cleric: {
    id: "hero-thrumbar",
    name: "Thrumbar Ironforge",
    race: "Shield Dwarf",
    class: "Cleric",
    subclass: "Life Domain",
    background: "Acolyte of Oghma",
    alignment: "Lawful Good",
    level: 1,
    xp: 0,
    portrait: "🛡️",
    str: 15, dex: 10, con: 16, int: 10, wis: 16, cha: 10,
    ac: 18, hpMax: 11, hpCurrent: 11, speed: 25, initiative: 0, prof: 2,
    mainHand: "Warhammer (+4 to hit, 1d8+2 blud)",
    offHand: "Heavy Iron Shield (+2 AC)",
    armor: "Scale Mail (AC 14+2)",
    helmet: "Dwarven Helm",
    cloak: "Prayer Vestment",
    boots: "Steel-toed Greaves",
    ring1: "Holy Symbol of Oghma",
    quickItems: "Healer's Kit, 3x Holy Water, Rations",
    spells: "Cantrips: Sacred Flame, Spare the Dying, Guidance. Spells: Cure Wounds, Bless, Healing Word",
    backstory: "Devout cleric of the Binder in Candlekeep's Great Library, resolute in defending lore and healing the righteous."
  },
  ranger: {
    id: "hero-elora",
    name: "Elora Swiftstep",
    race: "Wood Elf",
    class: "Ranger",
    subclass: "Hunter",
    background: "Coast Way Wanderer",
    alignment: "Chaotic Good",
    level: 1,
    xp: 0,
    portrait: "🌲",
    str: 12, dex: 17, con: 14, int: 10, wis: 15, cha: 9,
    ac: 15, hpMax: 12, hpCurrent: 12, speed: 35, initiative: 3, prof: 2,
    mainHand: "Longbow (+5 to hit, 1d8+3 pierc)",
    offHand: "Shortsword (+5 to hit, 1d6+3 pierc)",
    armor: "Leather Armor (AC 11+DEX)",
    helmet: "Falcon Cowl",
    cloak: "Forest Camouflage Cloak",
    boots: "Stalker Boots",
    ring1: "Quiver of Endless Flight",
    quickItems: "Antidote, Hunting Trap, 20x Arrows",
    spells: "Hunter's Mark, Cure Wounds, Primeval Awareness",
    backstory: "Wilderness scout who monitors goblin activity along the Coast Way approaching the Lion's Way."
  },
  paladin: {
    id: "hero-faerun",
    name: "Faerûn",
    race: "Half-Elf",
    class: "Paladin",
    subclass: "Oath of Devotion",
    background: "Noble Guard",
    alignment: "Lawful Good",
    level: 1,
    xp: 0,
    portrait: "✨",
    str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 16,
    ac: 18, hpMax: 12, hpCurrent: 12, speed: 30, initiative: 0, prof: 2,
    mainHand: "Bastard Sword (+5 to hit, 1d10+3 sl)",
    offHand: "Crested Knight Shield (+2 AC)",
    armor: "Splint Mail (AC 17)",
    helmet: "Silver Visor",
    cloak: "Devotion Banner Cloak",
    boots: "Plate Greaves",
    ring1: "Signet Ring of the Watchers",
    quickItems: "2x Healing Potion, Holy Relic",
    spells: "Bless",
    abilities: ["divine-smite"],
    backstory: "Sworn champion dispatched to ensure safe passage across the Sword Coast."
  },
  // NPC Archetypes & Roles
  npc_king: {
    id: "npc-king-loric",
    slug: "king-loric",
    name: "King Loric",
    characterType: "npc",
    role: "king",
    alignment: "Lawful Good",
    portrait: "👑",
    interactionType: "save",
    location: "tantegel-throne-room",
    col: 8,
    row: 4,
    facing: "down",
    dialogue: "Descendant of Erdrick, listen now to my words. Recover the Ball of Light and restore peace to Alefgard!\nTake now whatever thou may find in these Treasure Chests to aid thee in thy quest.",
    backstory: "Monarch of Tantegel Castle who records heroic deeds on the Imperial Scrolls of Honor."
  },
  npc_princess: {
    id: "npc-princess-gwaelin",
    slug: "princess-gwaelin",
    name: "Princess Gwaelin",
    characterType: "npc",
    role: "princess",
    alignment: "Neutral Good",
    portrait: "👸",
    interactionType: "talk",
    location: "tantegel-throne-room",
    col: 9,
    row: 4,
    facing: "down",
    dialogue: "Please save our kingdom from the Dragonlord, brave hero.\nI have faith that the bloodline of Erdrick will prevail!",
    backstory: "Beloved princess of Tantegel Castle, held captive by the Dragonlord in a swamp cave."
  },
  npc_guard: {
    id: "npc-tantegel-guard",
    slug: "tantegel-guard",
    name: "Tantegel Guard",
    characterType: "npc",
    role: "guard",
    alignment: "Lawful Neutral",
    portrait: "🛡️",
    interactionType: "talk",
    location: "tantegel-throne-room",
    col: 4,
    row: 8,
    facing: "down",
    dialogue: "Welcome to Tantegel Castle. King Loric awaits thee in the throne room.",
    backstory: "Royal guard protecting the castle gates and throne dais."
  },
  npc_merchant: {
    id: "npc-brecconary-merchant",
    slug: "brecconary-merchant",
    name: "Brecconary Merchant",
    characterType: "npc",
    role: "merchant",
    alignment: "Neutral Good",
    portrait: "💰",
    interactionType: "shop",
    location: "brecconary-town",
    col: 10,
    row: 12,
    facing: "down",
    dialogue: "Welcome! We have weapons and armor for brave adventurers.",
    backstory: "Trading weapons, copper swords, and herbs in Brecconary town."
  },
  npc_sage: {
    id: "npc-old-man-healer",
    slug: "old-man-healer",
    name: "Old Man Healer",
    characterType: "npc",
    role: "sage",
    alignment: "Neutral Good",
    portrait: "✨",
    interactionType: "rest",
    location: "tantegel-throne-room",
    col: 14,
    row: 4,
    facing: "down",
    dialogue: "When thy Magic Points are low, come back to me. I shall restore them for free.",
    backstory: "Mystic elder residing in Tantegel Castle capable of replenishing magical reserves."
  },
  npc_innkeeper: {
    id: "npc-brecconary-innkeeper",
    slug: "brecconary-innkeeper",
    name: "Corwin the Innkeeper",
    characterType: "npc",
    role: "innkeeper",
    alignment: "True Neutral",
    portrait: "🍺",
    interactionType: "inn",
    location: "brecconary-town",
    col: 18,
    row: 8,
    facing: "down",
    dialogue: "Good day! A night's rest at our inn costs 6 Gold. It restores all HP and MP.",
    backstory: "Warm-hearted innkeeper hosting weary wanderers."
  },
  npc_villager: {
    id: "npc-town-villager",
    slug: "town-villager",
    name: "Town Villager",
    characterType: "npc",
    role: "villager",
    alignment: "Neutral Good",
    portrait: "🧑",
    interactionType: "talk",
    location: "brecconary-town",
    col: 6,
    row: 14,
    facing: "right",
    dialogue: "East of this castle is a town where armor and weapons may be purchased. Return to the inn if thou art wounded.",
    backstory: "Resident of the town surrounding Tantegel Castle."
  }
};

// Application State
const state = {
  activeModule: 'pane-campaign',
  
  // Campaign State
  campaigns: [],
  activeCampaignSlug: null,
  activeCampaignData: null,
  activeHeroId: null,
  activeEquipHeroId: null,
  
  // Independent Characters & NPCs State
  characters: [],
  activeCharacterSlug: null,
  activeCharacterData: null,
  characterFilter: 'all', // 'all', 'hero', 'npc'

  // Item Studio State
  items: [],
  activeItemSlug: null,
  activeItemData: null,
  itemFilter: 'all', // 'all', 'weapon', 'armor', etc.

  // Spells Studio State
  spells: [],
  activeSpellSlug: null,
  activeSpellData: null,
  spellSchoolFilter: 'all',
  spellLevelFilter: 'all',

  // Abilities Studio State
  abilities: [],
  activeAbilitySlug: null,
  activeAbilityData: null,
  abilityCategoryFilter: 'all',
  abilityActionFilter: 'all',

  // Game Events State (Knowledge Graph & Infinity Engine interactions)
  gameEvents: [],
  activeEventSlug: null,
  activeEventData: null,

  // Character Active Spells, Abilities & Directives
  activeCharPreparedSpells: [],
  activeCharAssignedAbilities: [],
  activeCharDirective: {},

  // Campaign Simulation State
  simState: {
    round: 0,
    maxRounds: 25,
    scenarioId: 'crypt-skeleton-patrol',
    partyAlive: 4,
    enemiesAlive: 3,
    outcome: 'ready',
    log: []
  },

  // Map / Blockmap State
  maps: [],
  activeMapSlug: null,
  activeMapData: null,
  activeTool: 'select', // 'select', 'place', 'pan'
  selectedObjectId: null,
  isPanning: false,
  isPlacing: false,
  isDraggingObject: false,
  dragStart: { x: 0, y: 0 },
  canvasMode: 'canvas', // 'canvas' or 'png'
  
  // Scenes State
  scenes: [],
};

// Canvas Renderer Instance
let canvasRenderer = null;

// ========================================================
// INITIALIZATION
// ========================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupSplitDividers();
  setupCampaignHandlers();
  setupCharacterHandlers();
  setupItemHandlers();
  setupSpellHandlers();
  setupAbilityHandlers();
  setupTacticsSimHandlers();
  setupInventoryHandlers();
  setupDragAndDrop();
  setupBlockmapHandlers();

  // Initialize Canvas Renderer
  const canvasEl = document.getElementById('blockmap-canvas');
  if (canvasEl) {
    canvasRenderer = new MapCanvasRenderer(canvasEl);
    setupCanvasInteractions(canvasEl);
    window.addEventListener('resize', handleCanvasResize);
    handleCanvasResize();
  }

  // Load initial data via IPC
  await loadScenesList();
  await loadMapsList();
  await loadAllItems();
  await loadAllSpells();
  await loadAllAbilities();
  await loadAllGameEvents();
  await loadAllCharacters();
  await loadCampaignsList();

  setStatus('RobOS cRPG Editor ready.');
});

function setStatus(msg, filePath = '') {
  const msgEl = document.getElementById('status-message');
  const pathEl = document.getElementById('status-filepath');
  if (msgEl) msgEl.textContent = msg;
  if (pathEl) pathEl.textContent = filePath;
}

// ========================================================
// NAVIGATION & MODULE SWITCHING
// ========================================================
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-tab-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const paneId = btn.getAttribute('data-pane');
      switchModule(paneId);
    });
  });
}

function switchModule(paneId) {
  // Alias support for maps pane
  if (paneId === 'pane-blockmap') paneId = 'pane-maps';
  state.activeModule = paneId;

  // Update nav buttons
  document.querySelectorAll('.nav-tab-btn').forEach(b => {
    const targetPane = b.getAttribute('data-pane');
    const isMatch = targetPane === paneId || 
                    (targetPane === 'pane-blockmap' && paneId === 'pane-maps') ||
                    (targetPane === 'pane-maps' && paneId === 'pane-blockmap');
    b.classList.toggle('active', isMatch);
  });

  // Update panes
  document.querySelectorAll('.module-pane').forEach(p => {
    const isMatch = p.id === paneId ||
                    (p.id === 'pane-blockmap' && paneId === 'pane-maps') ||
                    (p.id === 'pane-maps' && paneId === 'pane-blockmap');
    p.classList.toggle('active', isMatch);
  });

  // Toggle contextual header controls
  const campControls = document.getElementById('campaign-header-controls');
  const charControls = document.getElementById('character-header-controls');
  const itemControls = document.getElementById('items-header-controls');
  const spellsControls = document.getElementById('spells-header-controls');
  const abilitiesControls = document.getElementById('abilities-header-controls');
  const invControls = document.getElementById('inventory-header-controls');
  const mapControls = document.getElementById('maps-header-controls') || document.getElementById('blockmap-header-controls');

  if (campControls) campControls.classList.toggle('hidden', paneId !== 'pane-campaign');
  if (charControls) charControls.classList.toggle('hidden', paneId !== 'pane-characters');
  if (itemControls) itemControls.classList.toggle('hidden', paneId !== 'pane-items');
  if (spellsControls) spellsControls.classList.toggle('hidden', paneId !== 'pane-spells');
  if (abilitiesControls) abilitiesControls.classList.toggle('hidden', paneId !== 'pane-abilities');
  if (invControls) invControls.classList.toggle('hidden', paneId !== 'pane-inventory');
  if (mapControls) mapControls.classList.toggle('hidden', paneId !== 'pane-maps' && paneId !== 'pane-blockmap');

  if (paneId === 'pane-maps' || paneId === 'pane-blockmap') {
    setTimeout(handleCanvasResize, 50);
  } else if (paneId === 'pane-characters') {
    renderCharactersList();
    if (state.activeCharacterSlug) {
      loadCharacterSheet(state.activeCharacterSlug);
    } else {
      showEmptyCharacterState();
    }
  } else if (paneId === 'pane-items') {
    renderItemsList();
    if (state.activeItemSlug) {
      loadItemForm(state.activeItemSlug);
    } else {
      showEmptyItemState();
    }
  } else if (paneId === 'pane-spells') {
    renderSpellsList();
    if (state.activeSpellSlug) {
      loadSpellForm(state.activeSpellSlug);
    } else {
      showEmptySpellState();
    }
  } else if (paneId === 'pane-abilities') {
    renderAbilitiesList();
    if (state.activeAbilitySlug) {
      loadAbilityForm(state.activeAbilitySlug);
    } else {
      showEmptyAbilityState();
    }
  } else if (paneId === 'pane-inventory') {
    renderInventoryViews();
  } else if (paneId === 'pane-campaign') {
    renderCampaignMapsChecklist();
    renderCampaignCharactersChecklist();
    const activeSubpane = document.querySelector('.campaign-subtab-btn.active')?.getAttribute('data-subpane');
    if (activeSubpane === 'subpane-camp-inventory') {
      renderInventoryViews();
    } else if (activeSubpane === 'subpane-camp-tactics') {
      renderCampaignTacticsRoster();
    }
  }
}

// ========================================================
// SCENES API
// ========================================================
async function loadScenesList() {
  try {
    const res = await window.robos.listScenes();
    if (res.success) {
      state.scenes = res.scenes;
      populateSceneDropdowns();
    }
  } catch (err) {
    console.error('Error loading scenes:', err);
  }
}

function populateSceneDropdowns() {
  const campSelect = document.getElementById('camp-starting-scene');
  const invSelect = document.getElementById('inventory-scene-select');

  const options = [];
  if (Array.isArray(state.scenes) && state.scenes.length > 0) {
    state.scenes.forEach(s => options.push({ slug: s.slug, title: s.title || s.slug }));
  }
  if (Array.isArray(state.maps) && state.maps.length > 0) {
    state.maps.forEach(m => {
      if (!options.some(o => o.slug === m.slug)) {
        options.push({ slug: m.slug, title: m.title ? `${m.title}` : m.slug });
      }
    });
  }

  if (options.length === 0) {
    const emptyHtml = '<option value="">(No scenes available)</option>';
    if (campSelect) campSelect.innerHTML = emptyHtml;
    if (invSelect) invSelect.innerHTML = emptyHtml;
    return;
  }

  const optionsHtml = options.map(s => `<option value="${s.slug}">${s.title}</option>`).join('');
  if (campSelect) campSelect.innerHTML = optionsHtml;
  if (invSelect) invSelect.innerHTML = optionsHtml;
}

// ========================================================
// MODULE 1: cRPG CAMPAIGN
// ========================================================
function setupCampaignHandlers() {
  const campSelect = document.getElementById('campaign-select');
  const btnNew = document.getElementById('btn-new-campaign');
  const btnSave = document.getElementById('btn-save-campaign');
  const btnDelete = document.getElementById('btn-delete-campaign');
  const btnScaffold = document.getElementById('btn-scaffold-party');
  const btnAddQuest = document.getElementById('btn-add-quest');
  const btnAddFlag = document.getElementById('btn-add-flag');

  const btnSelectAllMaps = document.getElementById('btn-select-all-maps');
  const btnClearMaps = document.getElementById('btn-clear-maps');
  const campStartMap = document.getElementById('camp-starting-map');
  const btnSelectAllHeroes = document.getElementById('btn-select-all-heroes');
  const btnSelectAllNpcs = document.getElementById('btn-select-all-npcs');

  campSelect?.addEventListener('change', (e) => {
    if (e.target.value) loadCampaign(e.target.value);
  });

  // Campaign Sub-navigation (Overview & Story vs Party & Inventory)
  document.querySelectorAll('.campaign-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subpaneId = btn.getAttribute('data-subpane');
      switchCampaignSubpane(subpaneId);
    });
  });

  btnNew?.addEventListener('click', createNewCampaign);
  btnSave?.addEventListener('click', saveCurrentCampaign);
  btnDelete?.addEventListener('click', deleteCurrentCampaign);
  btnScaffold?.addEventListener('click', scaffoldStandardParty);

  btnSelectAllMaps?.addEventListener('click', () => {
    document.querySelectorAll('#camp-maps-checklist .camp-map-chk').forEach(c => c.checked = true);
    updateCampaignMapsFromChecklist();
  });

  btnClearMaps?.addEventListener('click', () => {
    document.querySelectorAll('#camp-maps-checklist .camp-map-chk').forEach(c => c.checked = false);
    updateCampaignMapsFromChecklist();
  });

  campStartMap?.addEventListener('change', (e) => {
    if (state.activeCampaignData) state.activeCampaignData['robos:startingMap'] = e.target.value;
  });

  btnSelectAllHeroes?.addEventListener('click', () => {
    document.querySelectorAll('#camp-characters-checklist .camp-char-chk').forEach(c => {
      if (c.getAttribute('data-is-npc') !== 'true') c.checked = true;
    });
    updateCampaignCharactersFromChecklist();
  });

  btnSelectAllNpcs?.addEventListener('click', () => {
    document.querySelectorAll('#camp-characters-checklist .camp-char-chk').forEach(c => {
      if (c.getAttribute('data-is-npc') === 'true') c.checked = true;
    });
    updateCampaignCharactersFromChecklist();
  });

  btnAddQuest?.addEventListener('click', () => {
    if (!state.activeCampaignData) return;
    const gs = getGameState();
    if (!Array.isArray(gs['robos:questLog'])) gs['robos:questLog'] = [];
    gs['robos:questLog'].push({
      id: `quest-${Date.now().toString().slice(-4)}`,
      title: "New Adventure Objective",
      status: "active",
      description: "Investigate suspicious activity in the surrounding lands.",
      reward: "100 XP, 50 GP"
    });
    renderQuestLog();
    updateCampaignSummaryStats();
  });

  btnAddFlag?.addEventListener('click', () => {
    if (!state.activeCampaignData) return;
    const gs = getGameState();
    if (!gs['robos:worldFlags']) gs['robos:worldFlags'] = {};
    const key = `flag_event_${Date.now().toString().slice(-4)}`;
    gs['robos:worldFlags'][key] = true;
    renderStoryFlags();
  });

  const updateCampSelectDraftText = () => {
    const select = document.getElementById('campaign-select');
    if (!select) return;
    const currentSlug = document.getElementById('camp-slug')?.value.trim() || state.activeCampaignSlug;
    const currentTitle = document.getElementById('camp-title')?.value.trim() || 'New Campaign';
    let opt = select.querySelector(`option[value="${currentSlug}"]`);
    if (!opt && currentSlug) {
      opt = document.createElement('option');
      opt.value = currentSlug;
      select.insertBefore(opt, select.firstChild);
      select.value = currentSlug;
    }
    if (opt) {
      opt.textContent = `✨ ${currentTitle} (${currentSlug})`;
    }
  };
  document.getElementById('camp-title')?.addEventListener('input', updateCampSelectDraftText);
  document.getElementById('camp-slug')?.addEventListener('input', updateCampSelectDraftText);

  setupStoryTreeHandlers();
}

function switchCampaignSubpane(subpaneId) {
  document.querySelectorAll('.campaign-subtab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-subpane') === subpaneId);
  });
  document.querySelectorAll('.campaign-subpane').forEach(p => {
    const isTarget = p.id === subpaneId;
    p.classList.toggle('active', isTarget);
    p.classList.toggle('hidden', !isTarget);
  });
  if (subpaneId === 'subpane-camp-inventory') {
    renderInventoryViews();
  } else if (subpaneId === 'subpane-camp-tactics') {
    renderCampaignTacticsRoster();
  } else if (subpaneId === 'subpane-camp-quests') {
    renderQuestScenarioTree();
  } else if (subpaneId === 'subpane-camp-maps') {
    renderCampaignMapsChecklist();
  } else if (subpaneId === 'subpane-camp-roster') {
    renderCampaignCharactersChecklist();
  } else if (subpaneId === 'subpane-camp-flags') {
    renderStoryFlags();
  }
}
window.switchCampaignSubpane = switchCampaignSubpane;

async function loadCampaignsList(preferredSlug) {
  try {
    const res = await window.robos.listCampaigns();
    if (res.success) {
      state.campaigns = res.campaigns;
      const select = document.getElementById('campaign-select');
      if (select) {
        select.innerHTML = state.campaigns.map(c => 
          `<option value="${c.slug}">${c.title || c.slug}</option>`
        ).join('');
      }

      if (state.campaigns.length > 0) {
        const targetSlug = preferredSlug && state.campaigns.some(c => c.slug === preferredSlug)
          ? preferredSlug
          : (state.activeCampaignSlug && state.campaigns.some(c => c.slug === state.activeCampaignSlug)
            ? state.activeCampaignSlug
            : state.campaigns[0].slug);
        await loadCampaign(targetSlug);
      } else {
        createNewCampaign();
      }
    }
  } catch (err) {
    console.error('Error listing campaigns:', err);
  }
}

async function loadCampaign(slug) {
  try {
    setStatus(`Loading campaign ${slug}...`);
    const res = await window.robos.loadCampaign(slug);
    if (res.success) {
      state.activeCampaignSlug = slug;
      state.activeCampaignData = res.data;

      // Select in dropdown
      const select = document.getElementById('campaign-select');
      if (select) select.value = slug;

      // Populate Campaign Overview
      document.getElementById('camp-title').value = res.data['dcterms:title'] || res.data.title || slug;
      document.getElementById('camp-slug').value = slug;
      document.getElementById('camp-setting').value = res.data['robos:setting'] || res.data.setting || '';
      document.getElementById('camp-ruleset').value = res.data['robos:ruleSet'] || res.data.ruleSet || 'D&D 5e SRD';
      document.getElementById('camp-difficulty').value = res.data['robos:difficulty'] || res.data.difficulty || 'Core Rules';
      document.getElementById('camp-desc').value = res.data['dcterms:description'] || res.data.description || '';

      const gs = getGameState();
      const currentScene = gs['robos:currentScene'] || gs.currentScene || '';
      const sceneSelect = document.getElementById('camp-starting-scene');
      if (sceneSelect) sceneSelect.value = currentScene;

      // Starting Map & Checklists
      populateCampStartingMapDropdown();
      const startingMap = res.data['robos:startingMap'] || '';
      const startMapSelect = document.getElementById('camp-starting-map');
      if (startMapSelect && startingMap) startMapSelect.value = startingMap;

      renderCampaignMapsChecklist();
      renderCampaignCharactersChecklist();

      // Set initial active hero if present
      const heroes = getHeroes();
      state.activeHeroId = heroes.length > 0 ? (heroes[0].id || heroes[0]['@id'] || heroes[0].slug) : null;
      state.activeEquipHeroId = state.activeHeroId;

      state.selectedStoryNodeId = null;
      state.storyWalkthrough = { active: false, currentNodeId: null, visitedNodeIds: [] };
      const flow = getStoryFlow();
      const pages = ensureFlowPages(flow);
      state.activeFlowPageId = pages[0]?.id || 'page-1';
      document.getElementById('story-walkthrough-hud')?.classList.add('hidden');
      document.getElementById('story-epilogue-overlay')?.classList.add('hidden');
      document.getElementById('flow-page-modal')?.classList.add('hidden');

      renderQuestLog();
      renderQuestScenarioTree();
      renderStoryFlags();
      renderCharactersList();
      renderInventoryViews();
      updateCampaignSummaryStats();

      setStatus(`Loaded campaign: ${slug}`, res.filePath);
    }
  } catch (err) {
    console.error('Error loading campaign:', err);
    setStatus(`Error loading campaign: ${err.message}`);
  }
}

function getGameState() {
  if (!state.activeCampaignData) return {};
  if (!state.activeCampaignData['robos:gameState']) {
    state.activeCampaignData['robos:gameState'] = {
      'robos:currentScene': '',
      'robos:activeParty': [],
      'robos:partyLeaderIndex': 0,
      'robos:partyFormation': 'rank',
      'robos:sharedInventory': { gold: 0, silver: 0, copper: 0, items: [] },
      'robos:questLog': [],
      'robos:worldFlags': {},
    };
  }
  return state.activeCampaignData['robos:gameState'];
}

function getHeroes() {
  if (state.activeCampaignData && Array.isArray(state.activeCampaignData['robos:heroes']) && state.activeCampaignData['robos:heroes'].length > 0) {
    state.activeCampaignData['robos:heroes'].forEach(h => {
      const match = (state.characters || []).find(c => c.slug === h.slug || c.id === h.id || c.name === h.name);
      if (match) {
        if (!h['robos:inventory'] || (Array.isArray(h['robos:inventory']) && h['robos:inventory'].length === 0)) {
          if (match['robos:inventory'] && match['robos:inventory'].length > 0) {
            h['robos:inventory'] = [...match['robos:inventory']];
            h.inventory = h['robos:inventory'];
          } else if (match.inventory && match.inventory.length > 0) {
            h['robos:inventory'] = [...match.inventory];
            h.inventory = h['robos:inventory'];
          }
        }
      }
    });
    return state.activeCampaignData['robos:heroes'];
  }
  if (state.activeCampaignData) {
    // If campaign has robos:characters, find matching heroes in state.characters
    const campaignCharIds = (state.activeCampaignData['robos:characters'] || []).map(id => 
      typeof id === 'string' ? id.replace(/^urn:robos:crpg:character:/, '') : (id.slug || id.id)
    );
    if (campaignCharIds.length > 0) {
      const matched = (state.characters || []).filter(c => {
        const isHero = c.characterType !== 'npc' && c.characterType !== 'robos:CRPGNPC' && !c.role;
        if (!isHero) return false;
        return campaignCharIds.includes(c.slug) || campaignCharIds.includes(c.id);
      });
      if (matched.length > 0) {
        state.activeCampaignData['robos:heroes'] = matched;
        return matched;
      }
    }
  }
  // Otherwise, return all Player Characters authored in workspace state.characters
  return (state.characters || []).filter(c => {
    const isHero = c.characterType !== 'npc' && c.characterType !== 'robos:CRPGNPC' && !c.role;
    return isHero;
  });
}

function updateCampaignSummaryStats() {
  const heroes = getHeroes();
  const gs = getGameState();
  const activeParty = gs['robos:activeParty'] || [];
  const storyFlow = getStoryFlow();
  const storyNodes = storyFlow['robos:storyNodes'] || [];
  const nodeCount = storyNodes.length > 0 ? storyNodes.length : (gs['robos:questLog'] || []).length;
  const gold = gs['robos:sharedInventory']?.gold ?? 0;

  const heroesEl = document.getElementById('stat-heroes-count');
  if (heroesEl) heroesEl.textContent = heroes.length;
  const partyEl = document.getElementById('stat-party-count');
  if (partyEl) partyEl.textContent = activeParty.length;
  const questsEl = document.getElementById('stat-quests-count');
  if (questsEl) questsEl.textContent = nodeCount;
  const goldEl = document.getElementById('stat-gold-count');
  if (goldEl) goldEl.textContent = `${gold} gp`;
}

function createNewCampaign() {
  const safeSlug = `campaign-${Date.now().toString().slice(-4)}`;
  state.activeCampaignSlug = safeSlug;
  state.activeCampaignData = {
    '@context': { robos: 'urn:robos:', dcterms: 'http://purl.org/dc/terms/' },
    '@type': 'robos:CRPGCampaign',
    '@id': `urn:robos:crpg:campaign:${safeSlug}`,
    'dcterms:title': 'New Campaign',
    'dcterms:description': '',
    'robos:setting': '',
    'robos:ruleSet': 'D&D 5e SRD',
    'robos:difficulty': 'Core Rules',
    'robos:maps': [],
    'robos:characters': [],
    'robos:startingMap': '',
    'robos:heroes': [],
    'robos:gameState': {
      'robos:currentScene': '',
      'robos:activeParty': [],
      'robos:partyLeaderIndex': 0,
      'robos:partyFormation': 'rank',
      'robos:sharedInventory': { gold: 0, silver: 0, copper: 0, items: [] },
      'robos:questLog': [],
      'robos:worldFlags': {},
    }
  };

  document.getElementById('camp-title').value = state.activeCampaignData['dcterms:title'];
  document.getElementById('camp-slug').value = safeSlug;
  document.getElementById('camp-setting').value = state.activeCampaignData['robos:setting'];
  document.getElementById('camp-ruleset').value = state.activeCampaignData['robos:ruleSet'];
  document.getElementById('camp-difficulty').value = state.activeCampaignData['robos:difficulty'];
  document.getElementById('camp-desc').value = state.activeCampaignData['dcterms:description'];

  populateCampStartingMapDropdown();
  renderCampaignMapsChecklist();
  renderCampaignCharactersChecklist();

  // Populate / select in campaign dropdown immediately
  const campSelect = document.getElementById('campaign-select');
  if (campSelect) {
    let opt = campSelect.querySelector(`option[value="${safeSlug}"]`);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = safeSlug;
      campSelect.insertBefore(opt, campSelect.firstChild);
    }
    opt.textContent = `✨ New Campaign (${safeSlug})`;
    campSelect.value = safeSlug;
  }

  state.activeHeroId = null;
  state.activeEquipHeroId = null;

  renderQuestLog();
  renderStoryFlags();
  renderCharactersList();
  renderInventoryViews();
  updateCampaignSummaryStats();

  setStatus(`Created new campaign: ${safeSlug}`);
}

function populateCampStartingMapDropdown() {
  const select = document.getElementById('camp-starting-map');
  if (!select) return;

  const currentVal = select.value || (state.activeCampaignData && state.activeCampaignData['robos:startingMap']) || '';
  select.innerHTML = '<option value="">(Select starting map...)</option>' +
    state.maps.map(m => `<option value="${m.slug}">🗺️ ${m.title || m.slug}</option>`).join('');

  if (currentVal && state.maps.some(m => m.slug === currentVal)) {
    select.value = currentVal;
  } else if (state.maps.length > 0 && !currentVal) {
    select.value = state.maps[0].slug;
    if (state.activeCampaignData) state.activeCampaignData['robos:startingMap'] = state.maps[0].slug;
  }
}

function populateNpcLocationDropdown() {
  const select = document.getElementById('npc-location');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">(Select map placement...)</option>' +
    state.maps.map(m => `<option value="${m.slug}">🗺️ ${m.title || m.slug}</option>`).join('');

  if (currentVal) select.value = currentVal;
}

function renderCampaignMapsChecklist() {
  const container = document.getElementById('camp-maps-checklist');
  if (!container) return;

  const campMaps = (state.activeCampaignData && state.activeCampaignData['robos:maps']) || [];
  const mapIds = campMaps.map(m => typeof m === 'string' ? m.replace(/^urn:robos:crpg:battle-map:/, '') : (m.slug || m.id));

  if (state.maps.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px;">No maps available.</div>';
    document.getElementById('camp-maps-count').textContent = '0';
    return;
  }

  let checkedCount = 0;
  container.innerHTML = state.maps.map(m => {
    const isChecked = mapIds.includes(m.slug);
    if (isChecked) checkedCount++;
    return `
      <label class="camp-check-item">
        <input type="checkbox" class="camp-map-chk" data-slug="${m.slug}" ${isChecked ? 'checked' : ''}>
        <span>🗺️ ${m.title || m.slug} (${m.width || 120}×${m.height || 80} ft)</span>
      </label>
    `;
  }).join('');

  document.getElementById('camp-maps-count').textContent = checkedCount;

  container.querySelectorAll('.camp-map-chk').forEach(chk => {
    chk.addEventListener('change', updateCampaignMapsFromChecklist);
  });
}

function updateCampaignMapsFromChecklist() {
  if (!state.activeCampaignData) return;
  const container = document.getElementById('camp-maps-checklist');
  if (!container) return;

  const checkedSlugs = [];
  container.querySelectorAll('.camp-map-chk:checked').forEach(c => {
    checkedSlugs.push(c.getAttribute('data-slug'));
  });

  state.activeCampaignData['robos:maps'] = checkedSlugs.map(s => `urn:robos:crpg:battle-map:${s}`);
  document.getElementById('camp-maps-count').textContent = checkedSlugs.length;

  populateCampStartingMapDropdown();
}

function renderCampaignCharactersChecklist() {
  const container = document.getElementById('camp-characters-checklist');
  if (!container) return;

  const campChars = (state.activeCampaignData && state.activeCampaignData['robos:characters']) || [];
  const charIds = campChars.map(c => typeof c === 'string' ? c.replace(/^urn:robos:crpg:character:/, '') : (c.slug || c.id));

  if (state.characters.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px;">No characters created.</div>';
    document.getElementById('camp-chars-count').textContent = '0';
    return;
  }

  let checkedCount = 0;
  container.innerHTML = state.characters.map(c => {
    const isNpc = c.characterType === 'npc' || c.characterType === 'robos:CRPGNPC' || !!c.role;
    const isChecked = charIds.includes(c.slug);
    if (isChecked) checkedCount++;
    return `
      <label class="camp-check-item">
        <input type="checkbox" class="camp-char-chk" data-slug="${c.slug}" data-is-npc="${isNpc}" ${isChecked ? 'checked' : ''}>
        <span>${c.portrait || (isNpc ? '👑' : '👤')} ${c.name || c.slug}</span>
        <span class="char-type-pill ${isNpc ? 'npc' : 'hero'}">${isNpc ? (c.role || 'NPC') : 'Player Character'}</span>
      </label>
    `;
  }).join('');

  document.getElementById('camp-chars-count').textContent = checkedCount;

  container.querySelectorAll('.camp-char-chk').forEach(chk => {
    chk.addEventListener('change', updateCampaignCharactersFromChecklist);
  });
}

function updateCampaignCharactersFromChecklist() {
  if (!state.activeCampaignData) return;
  const container = document.getElementById('camp-characters-checklist');
  if (!container) return;

  const checkedSlugs = [];
  container.querySelectorAll('.camp-char-chk:checked').forEach(c => {
    checkedSlugs.push(c.getAttribute('data-slug'));
  });

  state.activeCampaignData['robos:characters'] = checkedSlugs.map(s => `urn:robos:crpg:character:${s}`);
  document.getElementById('camp-chars-count').textContent = checkedSlugs.length;

  const heroes = state.characters.filter(c => {
    const isHero = c.characterType !== 'npc' && c.characterType !== 'robos:CRPGNPC' && !c.role;
    return isHero && checkedSlugs.includes(c.slug);
  });
  state.activeCampaignData['robos:heroes'] = heroes;
  updateCampaignSummaryStats();
  renderInventoryViews();
}

async function saveCurrentCampaign() {
  if (!state.activeCampaignData) return;

  const slug = document.getElementById('camp-slug').value.trim() || 'my-campaign';
  state.activeCampaignData['dcterms:title'] = document.getElementById('camp-title').value.trim();
  state.activeCampaignData['robos:setting'] = document.getElementById('camp-setting').value.trim();
  state.activeCampaignData['robos:ruleSet'] = document.getElementById('camp-ruleset').value;
  state.activeCampaignData['robos:difficulty'] = document.getElementById('camp-difficulty').value;
  state.activeCampaignData['dcterms:description'] = document.getElementById('camp-desc').value.trim();

  const gs = getGameState();
  const startScene = document.getElementById('camp-starting-scene')?.value;
  if (startScene) gs['robos:currentScene'] = startScene;

  // Starting map and campaign maps
  const startingMap = document.getElementById('camp-starting-map')?.value;
  if (startingMap) state.activeCampaignData['robos:startingMap'] = startingMap;

  const mapChecklist = document.getElementById('camp-maps-checklist');
  if (mapChecklist) {
    const checkedMapSlugs = [];
    mapChecklist.querySelectorAll('.camp-map-chk:checked').forEach(c => {
      checkedMapSlugs.push(c.getAttribute('data-slug'));
    });
    if (checkedMapSlugs.length > 0) {
      state.activeCampaignData['robos:maps'] = checkedMapSlugs.map(s => `urn:robos:crpg:battle-map:${s}`);
    }
  }

  // Campaign characters
  const charChecklist = document.getElementById('camp-characters-checklist');
  if (charChecklist) {
    const checkedCharSlugs = [];
    charChecklist.querySelectorAll('.camp-char-chk:checked').forEach(c => {
      checkedCharSlugs.push(c.getAttribute('data-slug'));
    });
    if (checkedCharSlugs.length > 0) {
      state.activeCampaignData['robos:characters'] = checkedCharSlugs.map(s => `urn:robos:crpg:character:${s}`);
    }
  }

  // Persist inventory inputs
  persistInventoryFromUI();

  try {
    setStatus(`Saving campaign ${slug}...`);
    const res = await window.robos.saveCampaign({ slug, data: state.activeCampaignData });
    if (res.success) {
      state.activeCampaignSlug = res.slug;
      setStatus(`Saved campaign successfully!`, res.filePath);
      await loadCampaignsList(res.slug);
      const select = document.getElementById('campaign-select');
      if (select) select.value = res.slug;
    } else {
      setStatus(`Failed to save campaign: ${res.error}`);
    }
  } catch (err) {
    console.error('Error saving campaign:', err);
    setStatus(`Error saving campaign: ${err.message}`);
  }
}

async function deleteCurrentCampaign() {
  if (!state.activeCampaignSlug) return;
  if (!confirm(`Are you sure you want to delete campaign '${state.activeCampaignSlug}'?`)) return;

  try {
    const res = await window.robos.deleteCampaign(state.activeCampaignSlug);
    if (res.success) {
      setStatus(`Deleted campaign: ${state.activeCampaignSlug}`);
      await loadCampaignsList();
    }
  } catch (err) {
    console.error('Error deleting campaign:', err);
    setStatus(`Error deleting campaign: ${err.message}`);
  }
}

function scaffoldStandardParty() {
  if (!state.activeCampaignData) return;
  const heroes = getHeroes();
  heroes.length = 0; // Clear roster

  // Add the 6 core archetypes
  Object.values(ARCHETYPES).forEach(arch => {
    heroes.push(JSON.parse(JSON.stringify(arch)));
  });

  // Set all 6 to active party
  const gs = getGameState();
  gs['robos:activeParty'] = heroes.map(h => h.id);
  gs['robos:partyLeaderIndex'] = 0;

  state.activeHeroId = heroes[0].id;
  state.activeEquipHeroId = heroes[0].id;

  renderCharactersList();
  if (state.characters && state.characters.length > 0) {
    loadCharacterSheet(state.characters[0].slug || state.characters[0].id);
  }
  renderInventoryViews();
  updateCampaignSummaryStats();
  setStatus('Scaffolded standard 6-PC party.');
}

function renderQuestLog() {
  const container = document.getElementById('quest-cards-list');
  if (!container) return;
  const gs = getGameState();
  const quests = gs['robos:questLog'] || [];
  document.getElementById('quest-count').textContent = quests.length;

  if (quests.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px;">No quests added yet. Click + Add Quest.</div>';
    return;
  }

  container.innerHTML = quests.map((q, idx) => `
    <div class="quest-item-card" data-idx="${idx}">
      <div class="quest-item-header">
        <input type="text" class="input-text quest-title-input" value="${q.title || 'Untitled'}" style="font-weight:600;font-size:12px;padding:2px 6px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <select class="dropdown-select quest-status-select" style="font-size:11px;padding:2px 4px;">
            <option value="active" ${q.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="completed" ${q.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="failed" ${q.status === 'failed' ? 'selected' : ''}>Failed</option>
          </select>
          <button class="btn btn-danger btn-sm btn-delete-quest" data-idx="${idx}" style="padding:2px 6px;">✕</button>
        </div>
      </div>
      <textarea rows="2" class="quest-desc-input" style="font-size:11px;padding:4px 6px;">${q.description || ''}</textarea>
    </div>
  `).join('');

  // Wire events
  container.querySelectorAll('.quest-title-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const idx = e.target.closest('.quest-item-card').getAttribute('data-idx');
      quests[idx].title = e.target.value.trim();
    });
  });
  container.querySelectorAll('.quest-status-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const idx = e.target.closest('.quest-item-card').getAttribute('data-idx');
      quests[idx].status = e.target.value;
    });
  });
  container.querySelectorAll('.quest-desc-input').forEach(ta => {
    ta.addEventListener('change', (e) => {
      const idx = e.target.closest('.quest-item-card').getAttribute('data-idx');
      quests[idx].description = e.target.value.trim();
    });
  });
  container.querySelectorAll('.btn-delete-quest').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number(btn.getAttribute('data-idx'));
      quests.splice(idx, 1);
      renderQuestLog();
      updateCampaignSummaryStats();
    });
  });
}

// ==========================================================================
// QUEST & SCENARIO TREE EDITOR & WALKTHROUGH SIMULATOR
// ==========================================================================
state.selectedStoryNodeId = null;
state.storyWalkthrough = { active: false, currentNodeId: null, visitedNodeIds: [] };
state.storyTreeZoom = 1.0;
state.activeFlowPageId = 'page-1';
state.flowPageSearchQuery = '';
state.directoryActFilter = 'all';
state.directorySearchQuery = '';

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function getNodeTypeIcon(type) {
  switch (type) {
    case 'game_start': return '🚩';
    case 'act_chapter': return '📖';
    case 'quest_stage': return '📜';
    case 'decision_branch': return '🔀';
    case 'combat_trial': return '⚔️';
    case 'end_game_state': return '🏆';
    default: return '📜';
  }
}

function getNodeTypeLabel(type) {
  switch (type) {
    case 'game_start': return 'Game Start';
    case 'act_chapter': return 'Chapter';
    case 'quest_stage': return 'Quest Stage';
    case 'decision_branch': return 'Decision';
    case 'combat_trial': return 'Combat';
    case 'end_game_state': return 'End Game';
    default: return 'Story Node';
  }
}

function getEventIcon(eventType) {
  switch (eventType) {
    case 'dialogue': return '💬';
    case 'combat_victory': return '⚔️';
    case 'area_transition': return '🚪';
    case 'cutscene': return '🎬';
    case 'item_acquisition': return '🔮';
    case 'quest_milestone': return '📜';
    case 'decision_branch': return '⚖️';
    default: return '⚡';
  }
}

async function loadAllGameEvents() {
  try {
    if (window.robos && window.robos.listGameEvents) {
      const res = await window.robos.listGameEvents();
      if (res.success) {
        state.gameEvents = res.events || [];
      }
    }
  } catch (err) {
    console.error('Error loading game events:', err);
  }
}

function ensureFlowPages(flow) {
  if (!flow) return [];
  if (!Array.isArray(flow['robos:flowPages']) || flow['robos:flowPages'].length === 0) {
    // Generate flow pages from existing nodes' acts
    const nodes = flow['robos:storyNodes'] || [];
    const actMap = new Map();
    nodes.forEach(n => {
      const act = n['robos:act'] || n.act || 'Prologue';
      if (!actMap.has(act)) actMap.set(act, []);
      actMap.get(act).push(n);
    });

    if (actMap.size === 0) {
      flow['robos:flowPages'] = [
        { id: 'page-1', name: 'Page 1: Main Story Flow', act: 'Prologue', summary: 'Main story questline and events' }
      ];
    } else {
      let pageIdx = 1;
      const pages = [];
      for (const [act, actNodes] of actMap.entries()) {
        const slug = act.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `page-${pageIdx}`;
        const pageId = `page-${slug}`;
        pages.push({
          id: pageId,
          name: `Page ${pageIdx}: ${act}`,
          act: act,
          summary: `${act} storyline and scenarios (${actNodes.length} nodes)`
        });
        actNodes.forEach(node => {
          if (!node['robos:flowPage'] && !node.flowPage) {
            node['robos:flowPage'] = pageId;
          }
        });
        pageIdx++;
      }
      flow['robos:flowPages'] = pages;
    }
  }

  // Ensure every node has a valid robos:flowPage
  const pages = flow['robos:flowPages'];
  const firstPageId = pages[0]?.id || 'page-1';
  const nodes = flow['robos:storyNodes'] || [];
  nodes.forEach(node => {
    let pId = node['robos:flowPage'] || node.flowPage;
    if (!pId || !pages.some(p => p.id === pId)) {
      const act = (node['robos:act'] || node.act || '').toLowerCase();
      const match = pages.find(p => (p.act || '').toLowerCase() === act);
      node['robos:flowPage'] = match ? match.id : firstPageId;
    }
  });

  return pages;
}

function getStoryFlowPages() {
  const flow = getStoryFlow();
  return ensureFlowPages(flow);
}

async function saveCampaignJson() {
  if (!state.activeCampaignSlug || !state.activeCampaignData) return;
  try {
    if (window.robos?.saveCampaign) {
      await window.robos.saveCampaign({
        slug: state.activeCampaignSlug,
        data: state.activeCampaignData
      });
    }
  } catch (err) {
    console.error('Failed to auto-save campaign JSON:', err);
  }
}

function getStoryFlow() {
  if (!state.activeCampaignData) return { 'robos:rootNodeId': '', 'robos:storyNodes': [], 'robos:flowPages': [] };
  if (!state.activeCampaignData['robos:storyFlow']) {
    state.activeCampaignData['robos:storyFlow'] = {
      '@type': 'robos:CRPGStoryFlow',
      '@id': `urn:robos:crpg:storyflow:${state.activeCampaignSlug || 'campaign'}`,
      'dcterms:title': `${state.activeCampaignData['dcterms:title'] || 'Campaign'} Quest & Story Tree`,
      'robos:rootNodeId': 'node-start',
      'robos:flowPages': [
        { id: 'page-1', name: 'Page 1: Prologue — Awakening', act: 'Prologue', summary: 'Beginning of the adventure' },
        { id: 'page-2', name: 'Page 2: Chapter 1 — Trials', act: 'Chapter 1', summary: 'Initial trials and quests' },
        { id: 'page-3', name: 'Page 3: Finale & Endings', act: 'Epilogue', summary: 'Climactic decisions and resolutions' }
      ],
      'robos:storyNodes': [
        {
          '@type': 'robos:CRPGStoryNode',
          id: 'node-start',
          'dcterms:title': 'Campaign Beginning',
          'robos:nodeType': 'game_start',
          'robos:act': 'Prologue',
          'robos:flowPage': 'page-1',
          'robos:location': state.activeCampaignData['robos:startingMap'] || '',
          'robos:giver': '',
          'robos:summary': 'The adventure begins as the party prepares to face the perils of the realm.',
          'robos:choices': [
            {
              targetNodeId: 'node-first-quest',
              label: 'Embark on the journey',
              setFlags: { 'journey_started': true }
            }
          ]
        },
        {
          '@type': 'robos:CRPGStoryNode',
          id: 'node-first-quest',
          'dcterms:title': 'The First Trial',
          'robos:nodeType': 'quest_stage',
          'robos:act': 'Chapter 1',
          'robos:flowPage': 'page-2',
          'robos:location': '',
          'robos:giver': '',
          'robos:summary': 'Overcome initial trials and make pivotal decisions for the fate of the land.',
          'robos:choices': [
            {
              targetNodeId: 'node-ending-triumph',
              label: 'Triumph over evil and restore peace',
              setFlags: { 'realm_saved': true }
            },
            {
              targetNodeId: 'node-ending-dark',
              label: 'Seize dark power and rule the shadows',
              setFlags: { 'dark_reign': true }
            }
          ]
        },
        {
          '@type': 'robos:CRPGStoryNode',
          id: 'node-ending-triumph',
          'dcterms:title': 'Ending A: Heroic Triumph',
          'robos:nodeType': 'end_game_state',
          'robos:act': 'Epilogue',
          'robos:flowPage': 'page-3',
          'robos:endingType': 'triumph_good',
          'robos:victoryStatus': 'victory',
          'robos:summary': 'Peace is restored to the realm through steadfast bravery.',
          'robos:epilogueText': 'Your valor is etched onto the pillars of the realm, remembered by all...',
          'robos:choices': []
        },
        {
          '@type': 'robos:CRPGStoryNode',
          id: 'node-ending-dark',
          'dcterms:title': 'Ending B: Reign of Shadows',
          'robos:nodeType': 'end_game_state',
          'robos:act': 'Epilogue',
          'robos:flowPage': 'page-3',
          'robos:endingType': 'tyrant_evil',
          'robos:victoryStatus': 'victory',
          'robos:summary': 'You claim the realm for yourself with an iron fist.',
          'robos:epilogueText': 'The realm bends the knee before your terrifying might...',
          'robos:choices': []
        }
      ]
    };
  }
  const flow = state.activeCampaignData['robos:storyFlow'];
  ensureFlowPages(flow);
  return flow;
}

function renderFlowPageTurner() {
  const container = document.getElementById('quest-flow-page-tabs');
  const indicator = document.getElementById('flow-page-indicator');
  const selectEl = document.getElementById('flow-page-quick-select');
  const jumpInput = document.getElementById('flow-page-jump-input');
  const totalLabel = document.getElementById('flow-page-total-label');
  const countBadge = document.getElementById('flow-pages-count-badge');
  const btnFirst = document.getElementById('btn-flow-first-page');
  const btnPrev = document.getElementById('btn-flow-prev-page');
  const btnNext = document.getElementById('btn-flow-next-page');
  const btnLast = document.getElementById('btn-flow-last-page');
  const btnToggleAll = document.getElementById('btn-flow-toggle-all');
  const btnMoveLeft = document.getElementById('btn-flow-move-left');
  const btnMoveRight = document.getElementById('btn-flow-move-right');
  const searchInput = document.getElementById('flow-page-search-input');
  const searchClear = document.getElementById('btn-clear-flow-page-search');
  const matchBadge = document.getElementById('flow-search-match-badge');

  const flow = getStoryFlow();
  const pages = ensureFlowPages(flow);
  const nodes = flow['robos:storyNodes'] || [];

  if (!state.activeFlowPageId || (state.activeFlowPageId !== 'all' && !pages.some(p => p.id === state.activeFlowPageId))) {
    state.activeFlowPageId = pages[0]?.id || 'page-1';
  }

  const curIdx = pages.findIndex(p => p.id === state.activeFlowPageId);
  const isAll = state.activeFlowPageId === 'all';

  // Update total count badge on directory button
  if (countBadge) countBadge.textContent = pages.length;

  // Update Quick Select Dropdown
  if (selectEl) {
    let selectHtml = pages.map((page, idx) => {
      const pageNodes = nodes.filter(n => (n['robos:flowPage'] || n.flowPage) === page.id);
      return `<option value="${page.id}" ${state.activeFlowPageId === page.id ? 'selected' : ''}>Page ${idx + 1}: ${escapeXml(page.name)} (${pageNodes.length} nodes)</option>`;
    }).join('');
    selectHtml += `<option value="all" ${isAll ? 'selected' : ''}>🌐 All Flow (Overview) (${nodes.length} nodes)</option>`;
    selectEl.innerHTML = selectHtml;
  }

  // Update Direct Jump Input & Total Label
  if (jumpInput) {
    jumpInput.min = '1';
    jumpInput.max = String(pages.length);
    jumpInput.value = isAll ? '' : String(curIdx >= 0 ? curIdx + 1 : 1);
  }
  if (totalLabel) {
    totalLabel.textContent = `/ ${pages.length}`;
  }

  // Update Indicator if present in DOM
  if (indicator) {
    if (isAll) {
      indicator.textContent = `All Flow (${pages.length} Pages, ${nodes.length} Nodes)`;
    } else {
      indicator.textContent = `Page ${curIdx >= 0 ? curIdx + 1 : 1} of ${pages.length}`;
    }
  }

  // Update First / Prev / Next / Last / Reorder button states
  if (btnFirst) {
    btnFirst.disabled = isAll || curIdx <= 0;
    btnFirst.style.opacity = btnFirst.disabled ? '0.4' : '1';
  }
  if (btnPrev) {
    btnPrev.disabled = isAll || curIdx <= 0;
    btnPrev.style.opacity = btnPrev.disabled ? '0.4' : '1';
  }
  if (btnNext) {
    btnNext.disabled = isAll || curIdx >= pages.length - 1;
    btnNext.style.opacity = btnNext.disabled ? '0.4' : '1';
  }
  if (btnLast) {
    btnLast.disabled = isAll || curIdx >= pages.length - 1;
    btnLast.style.opacity = btnLast.disabled ? '0.4' : '1';
  }
  if (btnMoveLeft) {
    btnMoveLeft.disabled = isAll || curIdx <= 0;
    btnMoveLeft.style.opacity = btnMoveLeft.disabled ? '0.4' : '1';
  }
  if (btnMoveRight) {
    btnMoveRight.disabled = isAll || curIdx >= pages.length - 1;
    btnMoveRight.style.opacity = btnMoveRight.disabled ? '0.4' : '1';
  }
  if (btnToggleAll) {
    btnToggleAll.classList.toggle('active', isAll);
    if (isAll) {
      btnToggleAll.style.borderColor = '#38bdf8';
      btnToggleAll.style.background = 'rgba(56, 189, 248, 0.15)';
    } else {
      btnToggleAll.style.borderColor = '';
      btnToggleAll.style.background = '';
    }
  }

  // Handle Live Search Filtering
  const rawQuery = (state.flowPageSearchQuery || '').trim().toLowerCase();
  let matchingPages = pages;
  if (rawQuery) {
    searchClear?.classList.remove('hidden');
    matchingPages = pages.filter(page => {
      const pageNodes = nodes.filter(n => (n['robos:flowPage'] || n.flowPage) === page.id);
      const matchName = (page.name || '').toLowerCase().includes(rawQuery);
      const matchId = (page.id || '').toLowerCase().includes(rawQuery);
      const matchAct = (page.act || '').toLowerCase().includes(rawQuery);
      const matchSummary = (page.summary || '').toLowerCase().includes(rawQuery);
      const matchNodes = pageNodes.some(n => 
        (n['dcterms:title'] || n.title || n.id || '').toLowerCase().includes(rawQuery) ||
        (n['robos:narrative'] || '').toLowerCase().includes(rawQuery)
      );
      return matchName || matchId || matchAct || matchSummary || matchNodes;
    });

    if (matchBadge) {
      matchBadge.textContent = `${matchingPages.length} / ${pages.length} pages`;
      matchBadge.classList.remove('hidden');
    }
  } else {
    searchClear?.classList.add('hidden');
    matchBadge?.classList.add('hidden');
  }

  // Render Smart Page Ribbon (matching search or clean compact tabs)
  if (container) {
    let tabsHtml = matchingPages.map((page) => {
      const originalIdx = pages.findIndex(p => p.id === page.id);
      const isActive = state.activeFlowPageId === page.id;
      const pageNodes = nodes.filter(n => (n['robos:flowPage'] || n.flowPage) === page.id);
      return `
        <div class="flow-page-tab ${isActive ? 'active' : ''}" data-page-id="${page.id}" title="${escapeXml(page.summary || page.name)}">
          <span>📄</span>
          <span>Pg ${originalIdx + 1}: ${escapeXml(page.name)}</span>
          <span class="flow-page-node-count">${pageNodes.length}</span>
        </div>
      `;
    }).join('');

    // If query matches overview or empty query, show All Flow
    const matchAll = !rawQuery || 'all flow overview'.includes(rawQuery);
    if (matchAll) {
      tabsHtml += `
        <div class="flow-page-tab ${isAll ? 'active' : ''}" data-page-id="all" title="View all story flow pages together in macro overview">
          <span>🌐</span>
          <span>All Flow</span>
          <span class="flow-page-node-count">${nodes.length}</span>
        </div>
      `;
    }

    container.innerHTML = tabsHtml;

    container.querySelectorAll('.flow-page-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const pageId = tab.getAttribute('data-page-id');
        switchFlowPage(pageId);
      });
    });
  }
}

// Alias for backward compatibility
function renderFlowPageTabs() {
  renderFlowPageTurner();
}

function switchFlowPage(pageId) {
  state.activeFlowPageId = pageId;
  const flow = getStoryFlow();
  const pages = ensureFlowPages(flow);
  const nodes = flow['robos:storyNodes'] || [];

  // If selected node is not on the new page, select the first node of this page
  if (pageId !== 'all') {
    const pageNodes = nodes.filter(n => (n['robos:flowPage'] || n.flowPage) === pageId);
    if (pageNodes.length > 0 && !pageNodes.some(n => n.id === state.selectedStoryNodeId)) {
      state.selectedStoryNodeId = pageNodes[0].id;
    }
  }

  renderQuestScenarioTree();
}

function firstFlowPage() {
  const pages = getStoryFlowPages();
  if (pages.length > 0) switchFlowPage(pages[0].id);
}

function prevFlowPage() {
  const pages = getStoryFlowPages();
  const curIdx = pages.findIndex(p => p.id === state.activeFlowPageId);
  if (curIdx > 0) {
    switchFlowPage(pages[curIdx - 1].id);
  } else if (state.activeFlowPageId === 'all' && pages.length > 0) {
    switchFlowPage(pages[0].id);
  }
}

function nextFlowPage() {
  const pages = getStoryFlowPages();
  const curIdx = pages.findIndex(p => p.id === state.activeFlowPageId);
  if (curIdx >= 0 && curIdx < pages.length - 1) {
    switchFlowPage(pages[curIdx + 1].id);
  } else if (state.activeFlowPageId === 'all' && pages.length > 0) {
    switchFlowPage(pages[0].id);
  }
}

function lastFlowPage() {
  const pages = getStoryFlowPages();
  if (pages.length > 0) switchFlowPage(pages[pages.length - 1].id);
}

function toggleAllFlow() {
  if (state.activeFlowPageId === 'all') {
    const pages = getStoryFlowPages();
    state.activeFlowPageId = pages[0]?.id || 'page-1';
  } else {
    state.activeFlowPageId = 'all';
  }
  renderQuestScenarioTree();
}

function jumpToFlowPageNumber(pageNum) {
  if (isNaN(pageNum)) return;
  const pages = getStoryFlowPages();
  const targetIdx = Math.max(0, Math.min(pages.length - 1, pageNum - 1));
  if (pages[targetIdx]) {
    switchFlowPage(pages[targetIdx].id);
  }
}

function moveCurrentFlowPage(direction) {
  if (state.activeFlowPageId === 'all') return;
  moveFlowPage(state.activeFlowPageId, direction);
}

function moveFlowPage(pageId, direction) {
  const flow = getStoryFlow();
  const pages = flow['robos:flowPages'] || [];
  const idx = pages.findIndex(p => p.id === pageId);
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= pages.length) return;

  const temp = pages[idx];
  pages[idx] = pages[targetIdx];
  pages[targetIdx] = temp;

  saveCampaignJson();
  renderQuestScenarioTree();
  if (!document.getElementById('flow-pages-directory-modal')?.classList.contains('hidden')) {
    renderPagesDirectory();
  }
  setStatus(`Reordered Page: "${temp.name}" is now at position ${targetIdx + 1}.`);
}

function openPagesDirectoryModal() {
  const modal = document.getElementById('flow-pages-directory-modal');
  if (!modal) return;
  state.directorySearchQuery = state.flowPageSearchQuery || '';
  state.directoryActFilter = 'all';

  const searchInput = document.getElementById('directory-search-input');
  if (searchInput) searchInput.value = state.directorySearchQuery;

  renderDirectoryActFilters();
  renderPagesDirectory();
  modal.classList.remove('hidden');
}

function closePagesDirectoryModal() {
  document.getElementById('flow-pages-directory-modal')?.classList.add('hidden');
}

function renderDirectoryActFilters() {
  const container = document.getElementById('directory-act-filters');
  if (!container) return;
  const pages = getStoryFlowPages();
  const acts = new Set();
  pages.forEach(p => { if (p.act) acts.add(p.act); });

  let html = `<div class="act-filter-pill ${state.directoryActFilter === 'all' ? 'active' : ''}" data-act="all">All Acts (${pages.length})</div>`;
  acts.forEach(act => {
    const actPages = pages.filter(p => p.act === act);
    html += `<div class="act-filter-pill ${state.directoryActFilter === act ? 'active' : ''}" data-act="${escapeXml(act)}">${escapeXml(act)} (${actPages.length})</div>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.act-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      state.directoryActFilter = pill.getAttribute('data-act');
      renderDirectoryActFilters();
      renderPagesDirectory();
    });
  });
}

function renderPagesDirectory() {
  const grid = document.getElementById('page-directory-grid');
  const statPages = document.getElementById('dir-stat-pages');
  const statNodes = document.getElementById('dir-stat-nodes');
  const subtitle = document.getElementById('directory-campaign-subtitle');
  if (!grid) return;

  const flow = getStoryFlow();
  const pages = ensureFlowPages(flow);
  const nodes = flow['robos:storyNodes'] || [];

  if (statPages) statPages.textContent = `${pages.length} Pages`;
  if (statNodes) statNodes.textContent = `${nodes.length} Story Nodes`;
  if (subtitle && state.activeCampaignData) {
    subtitle.textContent = `${state.activeCampaignData['dcterms:title'] || 'Campaign'} — Interactive Story Flow Catalog`;
  }

  const query = (state.directorySearchQuery || '').trim().toLowerCase();
  const actFilter = state.directoryActFilter || 'all';

  const filtered = pages.filter(page => {
    if (actFilter !== 'all' && (page.act || '') !== actFilter) return false;
    if (!query) return true;

    const pageNodes = nodes.filter(n => (n['robos:flowPage'] || n.flowPage) === page.id);
    const matchName = (page.name || '').toLowerCase().includes(query);
    const matchId = (page.id || '').toLowerCase().includes(query);
    const matchAct = (page.act || '').toLowerCase().includes(query);
    const matchSummary = (page.summary || '').toLowerCase().includes(query);
    const matchNodes = pageNodes.some(n => 
      (n['dcterms:title'] || n.title || n.id || '').toLowerCase().includes(query) ||
      (n['robos:narrative'] || '').toLowerCase().includes(query)
    );
    return matchName || matchId || matchAct || matchSummary || matchNodes;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p style="font-size: 14px; margin-bottom: 8px;">🔍 No flow pages match "${escapeXml(query)}"</p>
        <button id="btn-clear-dir-search" class="btn btn-secondary btn-xs">Clear Filter</button>
      </div>
    `;
    document.getElementById('btn-clear-dir-search')?.addEventListener('click', () => {
      state.directorySearchQuery = '';
      const inp = document.getElementById('directory-search-input');
      if (inp) inp.value = '';
      renderPagesDirectory();
    });
    return;
  }

  grid.innerHTML = filtered.map((page) => {
    const originalIdx = pages.findIndex(p => p.id === page.id);
    const isActive = state.activeFlowPageId === page.id;
    const pageNodes = nodes.filter(n => (n['robos:flowPage'] || n.flowPage) === page.id);

    const compCounts = {};
    pageNodes.forEach(n => {
      const t = n['robos:nodeType'] || n.nodeType || 'standard';
      compCounts[t] = (compCounts[t] || 0) + 1;
    });

    const compPills = Object.entries(compCounts).map(([type, count]) => {
      const icon = getNodeTypeIcon(type);
      return `<span class="comp-pill">${icon} ${count} ${type}</span>`;
    }).join('');

    const nodesChips = pageNodes.map(n => {
      const icon = getNodeTypeIcon(n['robos:nodeType'] || n.nodeType);
      const title = n['dcterms:title'] || n.title || n.id;
      return `<span class="card-node-chip" data-page-id="${page.id}" data-node-id="${n.id}" title="${escapeXml(title)}">${icon} ${escapeXml(title)}</span>`;
    }).join('');

    const canMoveUp = originalIdx > 0;
    const canMoveDown = originalIdx < pages.length - 1;

    return `
      <div class="page-directory-card ${isActive ? 'active' : ''}" data-page-id="${page.id}">
        <div class="card-top-row">
          <div class="card-badge-cluster">
            <span class="card-page-num">Page ${originalIdx + 1}</span>
            <span class="card-act-tag">${escapeXml(page.act || 'Prologue')}</span>
            ${isActive ? '<span class="card-active-indicator">★ ACTIVE</span>' : ''}
          </div>
          <div class="card-reorder-cluster">
            <button class="card-reorder-btn btn-page-move-up" data-page-id="${page.id}" title="Move Page Earlier" ${canMoveUp ? '' : 'disabled style="opacity:0.3;"'}>⬆️</button>
            <button class="card-reorder-btn btn-page-move-down" data-page-id="${page.id}" title="Move Page Later" ${canMoveDown ? '' : 'disabled style="opacity:0.3;"'}>⬇️</button>
          </div>
        </div>

        <div class="card-title-text">${escapeXml(page.name)}</div>
        <div class="card-summary-text">${escapeXml(page.summary || 'No page summary notes documented.')}</div>

        <div class="card-composition-row">
          <span style="font-size: 10px; font-weight: 700; color: #38bdf8;">${pageNodes.length} Nodes:</span>
          ${compPills}
        </div>

        <div class="card-nodes-container">
          <span class="card-nodes-title">Contained Nodes:</span>
          <div class="card-nodes-chips">
            ${nodesChips || '<span style="color:var(--text-muted); font-size:10px;">No nodes assigned to this page.</span>'}
          </div>
        </div>

        <div class="card-bottom-row">
          <button class="btn btn-primary btn-xs btn-card-open-page" data-page-id="${page.id}">
            <span>${isActive ? 'Viewing Page' : '🚀 Open Page'}</span>
          </button>
          <div style="display:flex; gap: 4px;">
            <button class="btn btn-secondary btn-xs btn-card-edit-page" data-page-id="${page.id}" title="Edit page details">✏️ Edit</button>
            <button class="btn btn-secondary btn-xs btn-card-delete-page" data-page-id="${page.id}" title="Delete page" ${pages.length <= 1 ? 'disabled style="opacity:0.3;"' : ''}>🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners on cards
  grid.querySelectorAll('.btn-card-open-page').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pageId = e.currentTarget.getAttribute('data-page-id');
      switchFlowPage(pageId);
      closePagesDirectoryModal();
    });
  });

  grid.querySelectorAll('.card-node-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const pageId = chip.getAttribute('data-page-id');
      const nodeId = chip.getAttribute('data-node-id');
      jumpToNodeInPage(pageId, nodeId);
    });
  });

  grid.querySelectorAll('.btn-page-move-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pageId = btn.getAttribute('data-page-id');
      moveFlowPage(pageId, -1);
    });
  });

  grid.querySelectorAll('.btn-page-move-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pageId = btn.getAttribute('data-page-id');
      moveFlowPage(pageId, 1);
    });
  });

  grid.querySelectorAll('.btn-card-edit-page').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pageId = btn.getAttribute('data-page-id');
      state.activeFlowPageId = pageId;
      closePagesDirectoryModal();
      showEditFlowPageModal();
    });
  });

  grid.querySelectorAll('.btn-card-delete-page').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pageId = btn.getAttribute('data-page-id');
      state.activeFlowPageId = pageId;
      deleteCurrentFlowPage();
      renderPagesDirectory();
    });
  });
}

function jumpToNodeInPage(pageId, nodeId) {
  closePagesDirectoryModal();
  state.activeFlowPageId = pageId;
  state.selectedStoryNodeId = nodeId;
  renderQuestScenarioTree();
  setTimeout(() => {
    selectStoryNode(nodeId);
    const card = document.querySelector(`.story-node-card[data-id="${nodeId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, 60);
}

let editingFlowPageId = null;

function showCreateFlowPageModal() {
  editingFlowPageId = null;
  const modal = document.getElementById('flow-page-modal');
  const titleEl = document.getElementById('flow-page-modal-title');
  const nameInp = document.getElementById('modal-flow-page-title');
  const idInp = document.getElementById('modal-flow-page-id');
  const actInp = document.getElementById('modal-flow-page-act');
  const summaryInp = document.getElementById('modal-flow-page-summary');

  if (titleEl) titleEl.textContent = 'Create Story Flow Page';
  const pages = getStoryFlowPages();
  const nextNum = pages.length + 1;
  if (nameInp) nameInp.value = `Page ${nextNum}: New Flow Chapter`;
  if (idInp) {
    idInp.value = `page-${nextNum}`;
    idInp.readOnly = false;
  }
  if (actInp) actInp.value = `Chapter ${nextNum - 1 > 0 ? nextNum - 1 : 1}`;
  if (summaryInp) summaryInp.value = '';

  modal?.classList.remove('hidden');
}

function showEditFlowPageModal() {
  const pages = getStoryFlowPages();
  let page = pages.find(p => p.id === state.activeFlowPageId);
  if (!page) {
    if (pages.length > 0) page = pages[0];
    else return;
  }
  editingFlowPageId = page.id;

  const modal = document.getElementById('flow-page-modal');
  const titleEl = document.getElementById('flow-page-modal-title');
  const nameInp = document.getElementById('modal-flow-page-title');
  const idInp = document.getElementById('modal-flow-page-id');
  const actInp = document.getElementById('modal-flow-page-act');
  const summaryInp = document.getElementById('modal-flow-page-summary');

  if (titleEl) titleEl.textContent = `Edit Flow Page: ${page.name}`;
  if (nameInp) nameInp.value = page.name || '';
  if (idInp) {
    idInp.value = page.id;
    idInp.readOnly = true;
  }
  if (actInp) actInp.value = page.act || '';
  if (summaryInp) summaryInp.value = page.summary || '';

  modal?.classList.remove('hidden');
}

function saveFlowPageFromModal() {
  const nameInp = document.getElementById('modal-flow-page-title');
  const idInp = document.getElementById('modal-flow-page-id');
  const actInp = document.getElementById('modal-flow-page-act');
  const summaryInp = document.getElementById('modal-flow-page-summary');

  const title = nameInp?.value.trim();
  const id = idInp?.value.trim();
  const act = actInp?.value.trim() || 'Prologue';
  const summary = summaryInp?.value.trim() || '';

  if (!title || !id) {
    alert('Page Title and Page ID are required.');
    return;
  }

  const flow = getStoryFlow();
  const pages = ensureFlowPages(flow);

  if (editingFlowPageId) {
    const page = pages.find(p => p.id === editingFlowPageId);
    if (page) {
      page.name = title;
      page.act = act;
      page.summary = summary;
    }
  } else {
    if (pages.some(p => p.id === id)) {
      alert(`A flow page with ID "${id}" already exists.`);
      return;
    }
    const newPage = { id, name: title, act, summary };
    pages.push(newPage);
    state.activeFlowPageId = id;
  }

  document.getElementById('flow-page-modal')?.classList.add('hidden');
  saveCampaignJson();
  renderQuestScenarioTree();
  setStatus(`Flow Page "${title}" saved successfully.`);
}

function deleteCurrentFlowPage() {
  const pages = getStoryFlowPages();
  if (pages.length <= 1) {
    alert('Cannot delete the only Flow Page in the campaign.');
    return;
  }
  const curPage = pages.find(p => p.id === state.activeFlowPageId);
  if (!curPage) {
    alert('Select a specific Flow Page to delete.');
    return;
  }

  if (!confirm(`Are you sure you want to delete "${curPage.name}"? Any nodes on this page will be reassigned to the first Flow Page.`)) {
    return;
  }

  const flow = getStoryFlow();
  const pageIdx = flow['robos:flowPages'].findIndex(p => p.id === curPage.id);
  if (pageIdx !== -1) {
    flow['robos:flowPages'].splice(pageIdx, 1);
  }
  const fallbackPageId = flow['robos:flowPages'][0]?.id || 'page-1';

  // Reassign nodes
  (flow['robos:storyNodes'] || []).forEach(node => {
    if ((node['robos:flowPage'] || node.flowPage) === curPage.id) {
      node['robos:flowPage'] = fallbackPageId;
    }
  });

  state.activeFlowPageId = fallbackPageId;
  saveCampaignJson();
  renderQuestScenarioTree();
  setStatus(`Deleted Flow Page "${curPage.name}". Nodes reassigned.`);
}

function setupStoryTreeHandlers() {
  const btnAddNode = document.getElementById('btn-add-story-node');
  const btnAddBranch = document.getElementById('btn-add-story-branch');
  const btnPlayWalkthrough = document.getElementById('btn-play-story-tree');
  const btnResetWalkthrough = document.getElementById('btn-reset-story-walkthrough');
  const actFilter = document.getElementById('story-act-filter');
  const btnCloseHud = document.getElementById('btn-close-walkthrough-hud');
  const btnCloseEpilogue = document.getElementById('btn-close-epilogue');
  const btnRestartEpilogue = document.getElementById('btn-restart-from-epilogue');
  const btnDeleteNode = document.getElementById('btn-delete-story-node');
  const btnAddChoiceItem = document.getElementById('btn-add-choice-item');

  // Flow Page bar buttons
  const btnAddPage = document.getElementById('btn-add-flow-page');
  const btnEditPage = document.getElementById('btn-edit-flow-page');
  const btnDeletePage = document.getElementById('btn-delete-flow-page');
  const btnPrevPage = document.getElementById('btn-flow-prev-page');
  const btnNextPage = document.getElementById('btn-flow-next-page');
  const btnSavePageModal = document.getElementById('btn-save-flow-page-modal');
  const btnClosePageModal = document.getElementById('btn-close-flow-page-modal');

  const btnZoomIn = document.getElementById('btn-tree-zoom-in');
  const btnZoomOut = document.getElementById('btn-tree-zoom-out');
  const btnFit = document.getElementById('btn-tree-fit');

  btnAddNode?.addEventListener('click', () => {
    createStoryNode();
  });

  btnAddBranch?.addEventListener('click', () => {
    addChoiceToSelectedNode();
  });

  btnPlayWalkthrough?.addEventListener('click', () => {
    toggleStoryWalkthrough();
  });

  btnResetWalkthrough?.addEventListener('click', () => {
    resetStoryWalkthrough();
  });

  actFilter?.addEventListener('change', () => {
    renderQuestScenarioTree();
  });

  btnAddPage?.addEventListener('click', () => {
    showCreateFlowPageModal();
  });

  btnEditPage?.addEventListener('click', () => {
    showEditFlowPageModal();
  });

  btnDeletePage?.addEventListener('click', () => {
    deleteCurrentFlowPage();
  });

  btnPrevPage?.addEventListener('click', () => {
    prevFlowPage();
  });

  btnNextPage?.addEventListener('click', () => {
    nextFlowPage();
  });

  // Flow Page Turner & Search Controls
  const btnFirstPage = document.getElementById('btn-flow-first-page');
  const btnLastPage = document.getElementById('btn-flow-last-page');
  const btnToggleAll = document.getElementById('btn-flow-toggle-all');
  const btnMoveLeft = document.getElementById('btn-flow-move-left');
  const btnMoveRight = document.getElementById('btn-flow-move-right');
  const quickSelect = document.getElementById('flow-page-quick-select');
  const jumpInput = document.getElementById('flow-page-jump-input');
  const searchInput = document.getElementById('flow-page-search-input');
  const btnClearSearch = document.getElementById('btn-clear-flow-page-search');
  const btnOpenDirectory = document.getElementById('btn-open-pages-directory');
  const btnCloseDirectory = document.getElementById('btn-close-pages-directory');
  const directorySearchInput = document.getElementById('directory-search-input');
  const btnDirAddPage = document.getElementById('btn-dir-add-page');
  const btnDirViewAll = document.getElementById('btn-dir-view-all');

  btnFirstPage?.addEventListener('click', () => {
    firstFlowPage();
  });

  btnLastPage?.addEventListener('click', () => {
    lastFlowPage();
  });

  btnToggleAll?.addEventListener('click', () => {
    toggleAllFlow();
  });

  btnMoveLeft?.addEventListener('click', () => {
    moveCurrentFlowPage(-1);
  });

  btnMoveRight?.addEventListener('click', () => {
    moveCurrentFlowPage(1);
  });

  quickSelect?.addEventListener('change', (e) => {
    switchFlowPage(e.target.value);
  });

  jumpInput?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    const pages = getStoryFlowPages();
    if (!isNaN(val) && val >= 1 && val <= pages.length) {
      jumpToFlowPageNumber(val);
    }
  });

  jumpInput?.addEventListener('change', (e) => {
    jumpToFlowPageNumber(parseInt(e.target.value, 10));
  });

  jumpInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      jumpToFlowPageNumber(parseInt(e.target.value, 10));
    }
  });

  searchInput?.addEventListener('input', (e) => {
    state.flowPageSearchQuery = e.target.value;
    renderFlowPageTurner();
  });

  btnClearSearch?.addEventListener('click', () => {
    state.flowPageSearchQuery = '';
    if (searchInput) searchInput.value = '';
    renderFlowPageTurner();
  });

  btnOpenDirectory?.addEventListener('click', () => {
    openPagesDirectoryModal();
  });

  btnCloseDirectory?.addEventListener('click', () => {
    closePagesDirectoryModal();
  });

  directorySearchInput?.addEventListener('input', (e) => {
    state.directorySearchQuery = e.target.value;
    renderPagesDirectory();
  });

  btnDirAddPage?.addEventListener('click', () => {
    closePagesDirectoryModal();
    showCreateFlowPageModal();
  });

  btnDirViewAll?.addEventListener('click', () => {
    closePagesDirectoryModal();
    switchFlowPage('all');
  });

  // Global Page Turner keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return;
    }
    const questTreePane = document.getElementById('subpane-camp-quests');
    if (!questTreePane || questTreePane.classList.contains('hidden')) {
      return;
    }

    if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft')) {
      e.preventDefault();
      prevFlowPage();
    } else if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight')) {
      e.preventDefault();
      nextFlowPage();
    } else if (e.key === 'Home') {
      e.preventDefault();
      firstFlowPage();
    } else if (e.key === 'End') {
      e.preventDefault();
      lastFlowPage();
    } else if (e.key === '/') {
      e.preventDefault();
      const sInput = document.getElementById('flow-page-search-input');
      sInput?.focus();
      sInput?.select();
    }
  });

  btnSavePageModal?.addEventListener('click', () => {
    saveFlowPageFromModal();
  });

  btnClosePageModal?.addEventListener('click', () => {
    document.getElementById('flow-page-modal')?.classList.add('hidden');
  });

  btnCloseHud?.addEventListener('click', () => {
    state.storyWalkthrough.active = false;
    document.getElementById('story-walkthrough-hud')?.classList.add('hidden');
    renderQuestScenarioTree();
  });

  btnCloseEpilogue?.addEventListener('click', () => {
    document.getElementById('story-epilogue-overlay')?.classList.add('hidden');
  });

  btnRestartEpilogue?.addEventListener('click', () => {
    document.getElementById('story-epilogue-overlay')?.classList.add('hidden');
    resetStoryWalkthrough();
    startStoryWalkthrough();
  });

  btnDeleteNode?.addEventListener('click', () => {
    if (!state.selectedStoryNodeId) return;
    deleteStoryNode(state.selectedStoryNodeId);
  });

  btnAddChoiceItem?.addEventListener('click', () => {
    addChoiceToSelectedNode();
  });

  btnZoomIn?.addEventListener('click', () => {
    state.storyTreeZoom = Math.min(1.8, state.storyTreeZoom + 0.15);
    applyTreeZoom();
  });
  btnZoomOut?.addEventListener('click', () => {
    state.storyTreeZoom = Math.max(0.5, state.storyTreeZoom - 0.15);
    applyTreeZoom();
  });
  btnFit?.addEventListener('click', () => {
    state.storyTreeZoom = 1.0;
    applyTreeZoom();
  });

  // Node Inspector input bindings
  const titleInp = document.getElementById('node-edit-title');
  const typeSelect = document.getElementById('node-edit-type');
  const actInp = document.getElementById('node-edit-act');
  const flowPageSelect = document.getElementById('node-edit-flow-page');
  const locSelect = document.getElementById('node-edit-location');
  const giverSelect = document.getElementById('node-edit-giver');
  const summaryInp = document.getElementById('node-edit-summary');
  const endingTypeSelect = document.getElementById('node-edit-ending-type');
  const victorySelect = document.getElementById('node-edit-victory-status');
  const epilogueInp = document.getElementById('node-edit-epilogue-text');

  const onInspectorChange = () => {
    if (!state.selectedStoryNodeId) return;
    const flow = getStoryFlow();
    const node = (flow['robos:storyNodes'] || []).find(n => n.id === state.selectedStoryNodeId);
    if (!node) return;

    node['dcterms:title'] = titleInp.value.trim();
    node.title = titleInp.value.trim();
    node['robos:nodeType'] = typeSelect.value;
    node.type = typeSelect.value;
    node['robos:act'] = actInp.value.trim();
    node.act = actInp.value.trim();

    let pageChanged = false;
    if (flowPageSelect && flowPageSelect.value) {
      const prevPage = node['robos:flowPage'] || node.flowPage;
      node['robos:flowPage'] = flowPageSelect.value;
      node.flowPage = flowPageSelect.value;
      if (prevPage !== flowPageSelect.value) {
        pageChanged = true;
      }
    }

    node['robos:location'] = locSelect.value;
    node.location = locSelect.value;
    node['robos:giver'] = giverSelect.value;
    node.giver = giverSelect.value;
    node['robos:summary'] = summaryInp.value.trim();
    node.summary = summaryInp.value.trim();

    if (typeSelect.value === 'end_game_state') {
      node['robos:endingType'] = endingTypeSelect.value;
      node.endingType = endingTypeSelect.value;
      node['robos:victoryStatus'] = victorySelect.value;
      node.victoryStatus = victorySelect.value;
      node['robos:epilogueText'] = epilogueInp.value.trim();
      node.epilogueText = epilogueInp.value.trim();
      document.getElementById('node-ending-fields')?.classList.remove('hidden');
    } else {
      document.getElementById('node-ending-fields')?.classList.add('hidden');
    }

    saveCampaignJson();
    renderQuestScenarioTree(!pageChanged);
  };

  titleInp?.addEventListener('input', onInspectorChange);
  typeSelect?.addEventListener('change', onInspectorChange);
  actInp?.addEventListener('input', onInspectorChange);
  flowPageSelect?.addEventListener('change', onInspectorChange);
  locSelect?.addEventListener('change', onInspectorChange);
  giverSelect?.addEventListener('change', onInspectorChange);
  summaryInp?.addEventListener('input', onInspectorChange);
  endingTypeSelect?.addEventListener('change', onInspectorChange);
  victorySelect?.addEventListener('change', onInspectorChange);
  epilogueInp?.addEventListener('input', onInspectorChange);
}

function applyTreeZoom() {
  const layer = document.getElementById('quest-tree-nodes-layer');
  const svg = document.getElementById('quest-tree-svg');
  if (layer) {
    layer.style.transform = `scale(${state.storyTreeZoom})`;
    layer.style.transformOrigin = '0 0';
  }
  if (svg) {
    svg.style.transform = `scale(${state.storyTreeZoom})`;
    svg.style.transformOrigin = '0 0';
  }
}

function populateStoryInspectorDropdowns() {
  const locSelect = document.getElementById('node-edit-location');
  if (locSelect) {
    const curLoc = locSelect.value;
    locSelect.innerHTML = '<option value="">(None / World General)</option>' +
      (state.maps || []).map(m => `<option value="${m.slug}">📍 ${m.title || m.slug}</option>`).join('');
    if (curLoc) locSelect.value = curLoc;
  }

  const giverSelect = document.getElementById('node-edit-giver');
  if (giverSelect) {
    const curGiver = giverSelect.value;
    giverSelect.innerHTML = '<option value="">(None / Narrator)</option>' +
      (state.characters || []).map(c => `<option value="${c.name || c.slug}">👑 ${c.name || c.slug}</option>`).join('');
    if (curGiver) giverSelect.value = curGiver;
  }

  const flowPageSelect = document.getElementById('node-edit-flow-page');
  if (flowPageSelect) {
    const curPage = flowPageSelect.value;
    const pages = getStoryFlowPages();
    flowPageSelect.innerHTML = pages.map(p => `<option value="${p.id}">📄 ${escapeXml(p.name)}</option>`).join('');
    if (curPage) flowPageSelect.value = curPage;
  }
}

function renderQuestScenarioTree(keepInspector = false) {
  const flow = getStoryFlow();
  const pages = ensureFlowPages(flow);
  let nodes = flow['robos:storyNodes'] || [];
  const filterAct = document.getElementById('story-act-filter')?.value || 'all';

  const badgeEl = document.getElementById('story-node-count-badge');
  if (badgeEl) badgeEl.textContent = `${nodes.length} nodes (${pages.length} pages)`;

  // Render Flow Page tabs
  renderFlowPageTabs();

  populateStoryInspectorDropdowns();

  if ((!state.selectedStoryNodeId || !nodes.some(n => n.id === state.selectedStoryNodeId)) && nodes.length > 0) {
    if (state.activeFlowPageId !== 'all') {
      const pageNodes = nodes.filter(n => (n['robos:flowPage'] || n.flowPage) === state.activeFlowPageId);
      state.selectedStoryNodeId = pageNodes[0]?.id || flow['robos:rootNodeId'] || nodes[0].id;
    } else {
      state.selectedStoryNodeId = flow['robos:rootNodeId'] || nodes[0].id;
    }
  }

  // 1. Render Left Sidebar Outline
  renderStoryTreeOutline(nodes, filterAct);

  // 2. Compute DAG Coordinates and Render Canvas & SVG Connections
  renderStoryTreeCanvas(nodes, filterAct);

  // 3. Render Inspector
  if (!keepInspector && state.selectedStoryNodeId) {
    loadStoryNodeInspector(state.selectedStoryNodeId);
  }

  // 4. Update Walkthrough HUD if active
  if (state.storyWalkthrough.active) {
    renderStoryWalkthroughHUD();
  }
}

function renderStoryTreeOutline(nodes, filterAct) {
  const container = document.getElementById('story-tree-outline');
  if (!container) return;

  const flow = getStoryFlow();
  const pages = ensureFlowPages(flow);

  // Group nodes by Flow Page
  const pageGroups = {};
  pages.forEach(p => { pageGroups[p.id] = []; });
  nodes.forEach(n => {
    const pId = n['robos:flowPage'] || n.flowPage || pages[0]?.id || 'page-1';
    if (!pageGroups[pId]) pageGroups[pId] = [];
    pageGroups[pId].push(n);
  });

  if (pages.length === 0 || nodes.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px;">No story nodes. Click + Add Story Node.</div>';
    return;
  }

  container.innerHTML = pages.map(page => {
    const pageNodes = pageGroups[page.id] || [];
    const isCurrentPage = state.activeFlowPageId === page.id;
    return `
      <div class="story-outline-act-group" style="${isCurrentPage ? 'border-left: 2px solid #0ea5e9; padding-left: 4px;' : ''}">
        <div class="story-outline-act-header" data-page-id="${page.id}" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;" title="Click to view ${escapeXml(page.name)}">
          <span>📄 ${escapeXml(page.name)}</span>
          <span style="font-size:9px;opacity:0.7;">(${pageNodes.length})</span>
        </div>
        ${pageNodes.map(n => {
          if (filterAct !== 'all' && (n['robos:act'] || n.act || 'Prologue').toLowerCase() !== filterAct.toLowerCase()) return '';
          const type = n['robos:nodeType'] || n.type || 'quest_stage';
          const icon = getNodeTypeIcon(type);
          const title = n['dcterms:title'] || n.title || n.id;
          const isSelected = n.id === state.selectedStoryNodeId;
          const isWalkthrough = n.id === state.storyWalkthrough.currentNodeId;
          return `
            <div class="story-outline-item ${isSelected ? 'selected' : ''} ${isWalkthrough ? 'active-walkthrough' : ''}" data-id="${n.id}" data-page="${page.id}">
              <span>${icon}</span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeXml(title)}</span>
              ${type === 'end_game_state' ? '<span style="font-size:10px;color:#c084fc;">🏆</span>' : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.story-outline-act-header').forEach(header => {
    header.addEventListener('click', () => {
      const pageId = header.getAttribute('data-page-id');
      if (pageId) switchFlowPage(pageId);
    });
  });

  container.querySelectorAll('.story-outline-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      const pageId = item.getAttribute('data-page');
      if (state.activeFlowPageId !== 'all' && state.activeFlowPageId !== pageId) {
        state.activeFlowPageId = pageId;
      }
      selectStoryNode(id);
      renderQuestScenarioTree();
    });
  });
}

function renderStoryTreeCanvas(nodes, filterAct) {
  const svgEl = document.getElementById('quest-tree-svg');
  const layerEl = document.getElementById('quest-tree-nodes-layer');
  const container = document.getElementById('quest-tree-canvas-container');
  if (!svgEl || !layerEl || !container) return;

  const flow = getStoryFlow();
  const pages = ensureFlowPages(flow);

  // Determine which nodes to display based on active flow page
  let visibleNodes = [];
  if (state.activeFlowPageId === 'all') {
    visibleNodes = nodes;
  } else {
    visibleNodes = nodes.filter(n => (n['robos:flowPage'] || n.flowPage) === state.activeFlowPageId);
  }

  // Act filter on top if specified
  if (filterAct !== 'all') {
    visibleNodes = visibleNodes.filter(n => (n['robos:act'] || n.act || 'Prologue').toLowerCase() === filterAct.toLowerCase());
  }

  // Clean empty state
  if (visibleNodes.length === 0) {
    svgEl.innerHTML = '';
    layerEl.innerHTML = `
      <div style="padding: 60px 40px; color: var(--text-muted); font-size: 13px;">
        <p>No story nodes on this Flow Page.</p>
        <button class="btn btn-primary btn-sm" style="margin-top: 10px;" onclick="createStoryNode()">➕ Add Story Node to this Page</button>
      </div>
    `;
    return;
  }

  const colWidth = 320;
  const rowHeight = 185;
  const x0 = 40;
  const y0 = 50;

  if (state.activeFlowPageId === 'all') {
    // Macro view: group nodes by flow page index
    const pageIndexMap = {};
    pages.forEach((p, idx) => { pageIndexMap[p.id] = idx; });

    const pageColGroups = {};
    visibleNodes.forEach(node => {
      const pId = node['robos:flowPage'] || node.flowPage || pages[0]?.id;
      const pIdx = pageIndexMap[pId] !== undefined ? pageIndexMap[pId] : 0;
      if (!pageColGroups[pIdx]) pageColGroups[pIdx] = [];
      pageColGroups[pIdx].push(node);
    });

    let bannersHtml = '';
    Object.keys(pageColGroups).forEach(colKey => {
      const colIdx = Number(colKey);
      const pageObj = pages[colIdx] || { name: `Page ${colIdx + 1}` };
      const colLeft = x0 + colIdx * (colWidth + 40);

      bannersHtml += `
        <div class="flow-page-boundary-label" style="left: ${colLeft}px; top: 15px;">
          📄 ${escapeXml(pageObj.name)}
        </div>
      `;

      pageColGroups[colKey].forEach((node, rowIdx) => {
        node._x = colLeft;
        node._y = y0 + 30 + rowIdx * rowHeight;
      });
    });

    layerEl.innerHTML = bannersHtml;
  } else {
    // Single page view: arrange topologically by node type
    const typeOrder = {
      'game_start': 0,
      'act_chapter': 0,
      'quest_stage': 1,
      'combat_trial': 2,
      'decision_branch': 2,
      'end_game_state': 3
    };

    const colGroups = {};
    visibleNodes.forEach(node => {
      const type = node['robos:nodeType'] || node.type || 'quest_stage';
      let col = typeOrder[type] !== undefined ? typeOrder[type] : 1;
      if (!colGroups[col]) colGroups[col] = [];
      colGroups[col].push(node);
    });

    Object.keys(colGroups).forEach(colKey => {
      const colIdx = Number(colKey);
      colGroups[colKey].forEach((node, rowIdx) => {
        node._x = x0 + colIdx * colWidth;
        node._y = y0 + rowIdx * rowHeight;
      });
    });

    layerEl.innerHTML = '';
  }

  // 1. Render SVG Connection Curves
  let svgPaths = '';
  visibleNodes.forEach(node => {
    const choices = node['robos:choices'] || node.choices || [];
    choices.forEach(ch => {
      const targetNode = visibleNodes.find(n => n.id === ch.targetNodeId);
      if (targetNode && node._x !== undefined && targetNode._x !== undefined) {
        const x1 = node._x + 230;
        const y1 = node._y + 40;
        const x2 = targetNode._x;
        const y2 = targetNode._y + 40;
        const dx = Math.max(50, Math.abs(x2 - x1) * 0.45);
        const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

        const isVisited = state.storyWalkthrough.visitedNodeIds.includes(node.id) &&
                          state.storyWalkthrough.visitedNodeIds.includes(targetNode.id);
        const isEndNode = targetNode['robos:nodeType'] === 'end_game_state' || targetNode.type === 'end_game_state';
        const strokeColor = isVisited ? '#10b981' : (isEndNode ? '#a855f7' : '#0ea5e9');
        const strokeWidth = isVisited ? 3 : 2;

        svgPaths += `<path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${isVisited ? 1 : 0.6}" ${isVisited ? '' : 'stroke-dasharray="4,3"'}/>`;

        if (ch.label) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const truncatedLabel = ch.label.length > 22 ? ch.label.slice(0, 20) + '…' : ch.label;
          svgPaths += `
            <g transform="translate(${mx}, ${my})">
              <rect x="-70" y="-10" width="140" height="18" rx="4" fill="#0f172a" stroke="${strokeColor}" stroke-width="1" opacity="0.9"/>
              <text x="0" y="2" fill="#e2e8f0" font-size="9" font-family="system-ui, sans-serif" text-anchor="middle" dominant-baseline="middle">${escapeXml(truncatedLabel)}</text>
            </g>
          `;
        }
      }
    });
  });
  svgEl.innerHTML = svgPaths;

  // 2. Render Node Cards with Inbound/Outbound Cross-Page Jump Ports
  const nodeCardsHtml = visibleNodes.map(node => {
    const isSelected = node.id === state.selectedStoryNodeId;
    const isWalkthrough = node.id === state.storyWalkthrough.currentNodeId;
    const nodeType = node['robos:nodeType'] || node.type || 'quest_stage';
    const icon = getNodeTypeIcon(nodeType);
    const typeLabel = getNodeTypeLabel(nodeType);
    const act = node['robos:act'] || node.act || 'Prologue';
    const title = node['dcterms:title'] || node.title || node.id;
    const location = node['robos:location'] || node.location || '';
    const giver = node['robos:giver'] || node.giver || '';
    const choices = node['robos:choices'] || node.choices || [];

    // Find any inbound cross-page connections
    let inboundHtml = '';
    if (state.activeFlowPageId !== 'all') {
      const inboundNodes = nodes.filter(other => {
        const otherPage = other['robos:flowPage'] || other.flowPage;
        if (otherPage === state.activeFlowPageId) return false;
        const otherChoices = other['robos:choices'] || other.choices || [];
        return otherChoices.some(ch => ch.targetNodeId === node.id);
      });
      if (inboundNodes.length > 0) {
        inboundHtml = inboundNodes.map(src => {
          const srcPage = pages.find(p => p.id === (src['robos:flowPage'] || src.flowPage));
          const pageShort = srcPage ? srcPage.name.split(':')[0] : 'Page';
          return `<div class="inbound-page-badge" title="Incoming story connection from ${srcPage ? srcPage.name : 'previous page'}">↰ From ${pageShort}: ${escapeXml(src['dcterms:title'] || src.id)}</div>`;
        }).join('');
      }
    }

    // Choices and Outbound Cross-Page Jump Ports
    const choicesHtml = choices.length > 0 ? `
      <div class="story-node-choices">
        ${choices.map(c => {
          const targetNode = nodes.find(n => n.id === c.targetNodeId);
          const isCrossPage = targetNode && state.activeFlowPageId !== 'all' && (targetNode['robos:flowPage'] || targetNode.flowPage) !== state.activeFlowPageId;
          const targetPage = isCrossPage ? pages.find(p => p.id === (targetNode['robos:flowPage'] || targetNode.flowPage)) : null;

          const boundEvt = (state.gameEvents || []).find(e =>
            e.slug === c.boundEventId ||
            e.id === c['robos:boundEvent'] ||
            e.urn === c['robos:boundEvent'] ||
            e.id === c.boundEventId
          );

          const eventBadge = boundEvt ? `
            <span class="choice-event-badge ${boundEvt.eventType}" title="Bound Infinity Engine Event: ${escapeXml(boundEvt.title)}\nType: ${boundEvt.eventType}\nBCS Trigger: ${escapeXml(boundEvt.infinityInteraction?.bcsTrigger || 'None')}\nBCS Action: ${escapeXml(boundEvt.infinityInteraction?.bcsAction || 'None')}">
              ${getEventIcon(boundEvt.eventType)} ${escapeXml(boundEvt.title.length > 22 ? boundEvt.title.slice(0, 20) + '…' : boundEvt.title)}
            </span>
          ` : '';

          if (isCrossPage && targetPage) {
            return `
              <div class="cross-page-jump-pill" data-target-page="${targetPage.id}" data-target-node="${targetNode.id}" title="Branch leads to ${escapeXml(targetPage.name)} — click to navigate">
                <span>↳ 📄 ${targetPage.name.split(':')[0]}: ${escapeXml(targetNode['dcterms:title'] || targetNode.id)}</span>
                ${eventBadge}
                <span>↗</span>
              </div>
            `;
          }
          return `
            <div class="node-choice-pill" title="${escapeXml(c.label || '')}">
              <span>↳</span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px;">${escapeXml(c.label || c.targetNodeId)}</span>
              ${eventBadge}
            </div>
          `;
        }).join('')}
      </div>
    ` : (nodeType === 'end_game_state' ? `
      <div class="story-node-choices">
        <div class="node-choice-pill" style="border-color:#a855f7;color:#d8b4fe;">
          <span>🏆</span>
          <span>End Game Conclusion</span>
        </div>
      </div>
    ` : '');

    return `
      <div class="story-node-card ${nodeType.replace(/_/g, '-')} ${isSelected ? 'selected' : ''} ${isWalkthrough ? 'active-walkthrough' : ''}"
           data-id="${node.id}" style="left: ${node._x}px; top: ${node._y}px;">
        <div class="story-node-header">
          <span>${icon} ${typeLabel}</span>
          <span>${act}</span>
        </div>
        <div class="story-node-body">
          ${inboundHtml}
          <div class="story-node-title">${escapeXml(title)}</div>
          <div class="story-node-meta">
            ${location ? `<span class="story-node-tag">📍 ${escapeXml(location)}</span>` : ''}
            ${giver ? `<span class="story-node-tag">👑 ${escapeXml(giver)}</span>` : ''}
          </div>
          ${choicesHtml}
        </div>
      </div>
    `;
  }).join('');

  layerEl.innerHTML += nodeCardsHtml;

  // Add click handlers on cross-page jump pills
  layerEl.querySelectorAll('.cross-page-jump-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = pill.getAttribute('data-target-page');
      const nId = pill.getAttribute('data-target-node');
      if (pId) switchFlowPage(pId);
      if (nId) selectStoryNode(nId);
    });
  });

  // Add click handlers on node cards
  layerEl.querySelectorAll('.story-node-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = card.getAttribute('data-id');
      selectStoryNode(id);
    });
  });

  // 3. Dynamic Canvas / SVG sizing so nothing clips and fills width
  const maxNodeX = Math.max(...visibleNodes.map(n => (n._x || 0) + 260), 0);
  const maxNodeY = Math.max(...visibleNodes.map(n => (n._y || 0) + 200), 0);
  const containerW = container.clientWidth || 1600;
  const containerH = container.clientHeight || 900;
  const fullW = Math.max(maxNodeX + 120, containerW);
  const fullH = Math.max(maxNodeY + 120, containerH);

  svgEl.style.width = fullW + 'px';
  svgEl.style.height = fullH + 'px';
  svgEl.setAttribute('width', fullW);
  svgEl.setAttribute('height', fullH);
  layerEl.style.width = fullW + 'px';
  layerEl.style.height = fullH + 'px';
}

function selectStoryNode(nodeId) {
  state.selectedStoryNodeId = nodeId;
  loadStoryNodeInspector(nodeId);

  // Update selection highlights in outline and canvas
  document.querySelectorAll('.story-outline-item').forEach(item => {
    item.classList.toggle('selected', item.getAttribute('data-id') === nodeId);
  });
  document.querySelectorAll('.story-node-card').forEach(card => {
    card.classList.toggle('selected', card.getAttribute('data-id') === nodeId);
  });
}

function loadStoryNodeInspector(nodeId) {
  const flow = getStoryFlow();
  const node = (flow['robos:storyNodes'] || []).find(n => n.id === nodeId);
  if (!node) return;

  const headerTitle = document.getElementById('inspector-header-title');
  if (headerTitle) headerTitle.textContent = `Node: ${node['dcterms:title'] || node.title || node.id}`;

  const titleInp = document.getElementById('node-edit-title');
  const idInp = document.getElementById('node-edit-id');
  const typeSelect = document.getElementById('node-edit-type');
  const actInp = document.getElementById('node-edit-act');
  const flowPageSelect = document.getElementById('node-edit-flow-page');
  const locSelect = document.getElementById('node-edit-location');
  const giverSelect = document.getElementById('node-edit-giver');
  const summaryInp = document.getElementById('node-edit-summary');

  if (titleInp) titleInp.value = node['dcterms:title'] || node.title || '';
  if (idInp) idInp.value = node.id || '';
  if (typeSelect) typeSelect.value = node['robos:nodeType'] || node.type || 'quest_stage';
  if (actInp) actInp.value = node['robos:act'] || node.act || 'Prologue';
  if (flowPageSelect) flowPageSelect.value = node['robos:flowPage'] || node.flowPage || '';
  if (locSelect) locSelect.value = node['robos:location'] || node.location || '';
  if (giverSelect) giverSelect.value = node['robos:giver'] || node.giver || '';
  if (summaryInp) summaryInp.value = node['robos:summary'] || node.summary || '';

  const endingFields = document.getElementById('node-ending-fields');
  const endingTypeSelect = document.getElementById('node-edit-ending-type');
  const victorySelect = document.getElementById('node-edit-victory-status');
  const epilogueInp = document.getElementById('node-edit-epilogue-text');

  const nodeType = node['robos:nodeType'] || node.type;
  if (nodeType === 'end_game_state') {
    endingFields?.classList.remove('hidden');
    if (endingTypeSelect) endingTypeSelect.value = node['robos:endingType'] || node.endingType || 'triumph_good';
    if (victorySelect) victorySelect.value = node['robos:victoryStatus'] || node.victoryStatus || 'victory';
    if (epilogueInp) epilogueInp.value = node['robos:epilogueText'] || node.epilogueText || '';
  } else {
    endingFields?.classList.add('hidden');
  }

  renderStoryNodeChoices(node);
}

function renderStoryNodeChoices(node) {
  const container = document.getElementById('inspector-choices-list');
  const countBadge = document.getElementById('inspector-choices-count');
  if (!container) return;

  const choices = node['robos:choices'] || node.choices || [];
  if (countBadge) countBadge.textContent = choices.length;

  const flow = getStoryFlow();
  const allNodes = flow['robos:storyNodes'] || [];

  if (choices.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px;">No outgoing choices. Click + Add Choice.</div>';
    return;
  }

  container.innerHTML = choices.map((ch, idx) => {
    const boundEvt = (state.gameEvents || []).find(e =>
      e.slug === ch.boundEventId ||
      e.id === ch['robos:boundEvent'] ||
      e.urn === ch['robos:boundEvent'] ||
      e.id === ch.boundEventId
    );

    return `
    <div class="choice-edit-item" data-idx="${idx}">
      <div class="choice-edit-header">
        <span>Choice #${idx + 1}</span>
        <button class="btn btn-danger btn-sm btn-del-choice" data-idx="${idx}" style="padding:1px 6px;">✕</button>
      </div>
      <div class="form-group" style="margin-bottom:4px;">
        <label style="font-size:10px;">Player Choice Label</label>
        <input type="text" class="input-text choice-label-inp" value="${escapeXml(ch.label || '')}" placeholder="e.g. Draw weapon and attack">
      </div>
      <div class="choice-edit-grid">
        <div class="form-group">
          <label style="font-size:10px;">Target Node</label>
          <select class="dropdown-select choice-target-select">
            ${allNodes.filter(n => n.id !== node.id).map(n => `
              <option value="${n.id}" ${n.id === ch.targetNodeId ? 'selected' : ''}>${getNodeTypeIcon(n['robos:nodeType'] || n.type)} ${escapeXml(n['dcterms:title'] || n.title || n.id)}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label style="font-size:10px;">Required Flag (Prerequisite)</label>
          <input type="text" class="input-text choice-req-flag-inp" value="${escapeXml(ch.requiredFlag || '')}" placeholder="e.g. spoke_to_gorion">
        </div>
      </div>

      <div class="choice-edit-grid" style="margin-top:6px;">
        <div class="form-group" style="grid-column: 1 / -1;">
          <label style="font-size:10px; display:flex; justify-content:space-between; align-items:center;">
            <span>Bound Game Event (Knowledge Graph)</span>
            <span style="color:#38bdf8; font-weight:600; font-size:9px;">⚙️ Infinity Engine</span>
          </label>
          <select class="dropdown-select choice-bound-event-select">
            <option value="">(None — Pure Narrative / Flag Transition)</option>
            ${(state.gameEvents || []).map(ev => `
              <option value="${ev.slug}" ${ev.slug === ch.boundEventId || ev.id === ch['robos:boundEvent'] || ev.urn === ch['robos:boundEvent'] ? 'selected' : ''}>
                ${getEventIcon(ev.eventType)} ${escapeXml(ev.title)} (${ev.eventType})
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      ${boundEvt ? `
        <div class="infinity-interaction-card">
          <div class="infinity-card-header">
            <span class="infinity-engine-badge">⚙️ GemRB Infinity Engine</span>
            <span class="infinity-type-tag">${boundEvt.eventType.toUpperCase()}</span>
          </div>
          <div class="infinity-card-title">${getEventIcon(boundEvt.eventType)} ${escapeXml(boundEvt.title)}</div>
          ${boundEvt.description ? `<div class="infinity-card-desc">${escapeXml(boundEvt.description)}</div>` : ''}

          <div class="infinity-details-grid">
            <div class="infinity-detail-row">
              <span class="infinity-detail-label">Script VM:</span>
              <span class="infinity-detail-val" title="Virtual Machine Subsystem">urn:robos:infinity:subsystem:bcs-script-vm</span>
            </div>
            ${boundEvt.infinityInteraction?.dialogueRef ? `
              <div class="infinity-detail-row">
                <span class="infinity-detail-label">DLG State:</span>
                <span class="infinity-detail-val" style="color:#38bdf8; font-weight:600;">💬 ${escapeXml(boundEvt.infinityInteraction.dialogueRef)}</span>
              </div>
            ` : ''}
            ${boundEvt.infinityInteraction?.bcsTrigger ? `
              <div class="infinity-code-section">
                <div class="infinity-code-label">BCS Trigger (IF Condition):</div>
                <pre class="bcs-code-block">${escapeXml(boundEvt.infinityInteraction.bcsTrigger)}</pre>
              </div>
            ` : ''}
            ${boundEvt.infinityInteraction?.bcsAction ? `
              <div class="infinity-code-section">
                <div class="infinity-code-label">BCS Action Queue (THEN Execution):</div>
                <pre class="bcs-code-block">${escapeXml(boundEvt.infinityInteraction.bcsAction)}</pre>
              </div>
            ` : ''}
            ${boundEvt.infinityInteraction?.journalEntry ? `
              <div class="infinity-detail-row">
                <span class="infinity-detail-label">Journal:</span>
                <span class="infinity-detail-val" style="color:#fcd34d; font-style:italic;">📜 "${escapeXml(boundEvt.infinityInteraction.journalEntry)}"</span>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
    </div>
  `}).join('');

  container.querySelectorAll('.choice-label-inp').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idx = e.target.closest('.choice-edit-item').getAttribute('data-idx');
      choices[idx].label = e.target.value.trim();
      renderQuestScenarioTree(true);
    });
  });

  container.querySelectorAll('.choice-target-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const idx = e.target.closest('.choice-edit-item').getAttribute('data-idx');
      choices[idx].targetNodeId = e.target.value;
      renderQuestScenarioTree(true);
    });
  });

  container.querySelectorAll('.choice-req-flag-inp').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idx = e.target.closest('.choice-edit-item').getAttribute('data-idx');
      choices[idx].requiredFlag = e.target.value.trim();
    });
  });

  container.querySelectorAll('.choice-bound-event-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const idx = Number(e.target.closest('.choice-edit-item').getAttribute('data-idx'));
      const val = e.target.value.trim();
      if (val) {
        choices[idx].boundEventId = val;
        choices[idx]['robos:boundEvent'] = `urn:robos:crpg:event:${val}`;
      } else {
        delete choices[idx].boundEventId;
        delete choices[idx]['robos:boundEvent'];
      }
      saveCampaignJson();
      renderStoryNodeChoices(node);
      renderQuestScenarioTree(true);
    });
  });

  container.querySelectorAll('.btn-del-choice').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number(btn.getAttribute('data-idx'));
      choices.splice(idx, 1);
      renderStoryNodeChoices(node);
      renderQuestScenarioTree(true);
    });
  });
}

function createStoryNode() {
  const flow = getStoryFlow();
  const pages = ensureFlowPages(flow);
  if (!Array.isArray(flow['robos:storyNodes'])) flow['robos:storyNodes'] = [];

  const targetPageId = (state.activeFlowPageId && state.activeFlowPageId !== 'all')
    ? state.activeFlowPageId
    : (pages[0]?.id || 'page-1');
  const targetPage = pages.find(p => p.id === targetPageId);

  const safeId = `node-story-${Date.now().toString().slice(-4)}`;
  const newNode = {
    '@type': 'robos:CRPGStoryNode',
    id: safeId,
    'dcterms:title': 'New Story Node',
    title: 'New Story Node',
    'robos:nodeType': 'quest_stage',
    type: 'quest_stage',
    'robos:act': targetPage?.act || 'Chapter 1',
    act: targetPage?.act || 'Chapter 1',
    'robos:flowPage': targetPageId,
    flowPage: targetPageId,
    'robos:location': '',
    'robos:giver': '',
    'robos:summary': 'Narrative journal entry and scene description...',
    'robos:choices': []
  };

  flow['robos:storyNodes'].push(newNode);
  state.selectedStoryNodeId = safeId;
  saveCampaignJson();
  renderQuestScenarioTree();
  updateCampaignSummaryStats();
  setStatus(`Created new story node: ${safeId} on ${targetPage?.name || targetPageId}`);
}

function deleteStoryNode(nodeId) {
  const flow = getStoryFlow();
  const nodes = flow['robos:storyNodes'] || [];
  const idx = nodes.findIndex(n => n.id === nodeId);
  if (idx === -1) return;

  if (nodeId === flow['robos:rootNodeId']) {
    alert('Cannot delete the root Game Start node of this story tree.');
    return;
  }

  nodes.splice(idx, 1);
  nodes.forEach(n => {
    const chs = n['robos:choices'] || n.choices || [];
    const filtered = chs.filter(c => c.targetNodeId !== nodeId);
    n['robos:choices'] = filtered;
    n.choices = filtered;
  });

  state.selectedStoryNodeId = nodes[0]?.id || null;
  renderQuestScenarioTree();
  updateCampaignSummaryStats();
  setStatus(`Deleted story node: ${nodeId}`);
}

function addChoiceToSelectedNode() {
  if (!state.selectedStoryNodeId) return;
  const flow = getStoryFlow();
  const node = (flow['robos:storyNodes'] || []).find(n => n.id === state.selectedStoryNodeId);
  if (!node) return;

  if (!Array.isArray(node['robos:choices'])) node['robos:choices'] = [];
  const otherNodes = (flow['robos:storyNodes'] || []).filter(n => n.id !== node.id);
  const targetId = otherNodes[0]?.id || '';

  node['robos:choices'].push({
    targetNodeId: targetId,
    label: 'Next action / choice',
    requiredFlag: '',
    setFlags: {}
  });
  node.choices = node['robos:choices'];

  renderStoryNodeChoices(node);
  renderQuestScenarioTree(true);
}

// ── Interactive Story Walkthrough Engine ─────────────────────────────────
function toggleStoryWalkthrough() {
  if (state.storyWalkthrough.active) {
    state.storyWalkthrough.active = false;
    document.getElementById('story-walkthrough-hud')?.classList.add('hidden');
    renderQuestScenarioTree();
  } else {
    startStoryWalkthrough();
  }
}

function startStoryWalkthrough() {
  const flow = getStoryFlow();
  const nodes = flow['robos:storyNodes'] || [];
  if (nodes.length === 0) return;

  const rootId = flow['robos:rootNodeId'] || nodes[0].id;
  state.storyWalkthrough.active = true;
  state.storyWalkthrough.currentNodeId = rootId;
  state.storyWalkthrough.visitedNodeIds = [rootId];

  renderStoryWalkthroughHUD();
  renderQuestScenarioTree();
  setStatus('Started Interactive Story Walkthrough.');
}

function resetStoryWalkthrough() {
  const flow = getStoryFlow();
  const rootId = flow['robos:rootNodeId'] || (flow['robos:storyNodes'] || [])[0]?.id;
  state.storyWalkthrough.currentNodeId = rootId;
  state.storyWalkthrough.visitedNodeIds = rootId ? [rootId] : [];
  state.storyWalkthrough.lastFiredEvent = null;
  document.getElementById('story-epilogue-overlay')?.classList.add('hidden');
  renderStoryWalkthroughHUD();
  renderQuestScenarioTree();
}

function renderStoryWalkthroughHUD() {
  const hud = document.getElementById('story-walkthrough-hud');
  if (!hud) return;

  if (!state.storyWalkthrough.active) {
    hud.classList.add('hidden');
    return;
  }
  hud.classList.remove('hidden');

  const flow = getStoryFlow();
  const node = (flow['robos:storyNodes'] || []).find(n => n.id === state.storyWalkthrough.currentNodeId);
  if (!node) return;

  const iconEl = document.getElementById('hud-node-type-icon');
  const titleEl = document.getElementById('hud-node-title');
  const actEl = document.getElementById('hud-act-tag');
  const locEl = document.getElementById('hud-location-tag');
  const giverEl = document.getElementById('hud-giver-tag');
  const narrativeEl = document.getElementById('hud-narrative-text');
  const choicesListEl = document.getElementById('hud-choices-list');

  const type = node['robos:nodeType'] || node.type || 'quest_stage';
  if (iconEl) iconEl.textContent = getNodeTypeIcon(type);
  if (titleEl) titleEl.textContent = node['dcterms:title'] || node.title || node.id;
  if (actEl) actEl.textContent = node['robos:act'] || node.act || 'Prologue';
  if (locEl) locEl.textContent = `📍 ${node['robos:location'] || node.location || 'World General'}`;
  if (giverEl) giverEl.textContent = `👑 ${node['robos:giver'] || node.giver || 'Narrator'}`;

  // If node is an end game state, automatically display the Epilogue Modal!
  if (type === 'end_game_state') {
    showEpilogueModal(node);
  }

  // Fired Event Banner
  let firedBannerHtml = '';
  if (state.storyWalkthrough.lastFiredEvent) {
    const ev = state.storyWalkthrough.lastFiredEvent;
    const bcsActionDisplay = ev.infinityInteraction?.bcsAction
      ? ev.infinityInteraction.bcsAction.replace(/\n/g, ' ➔ ')
      : '';
    firedBannerHtml = `
      <div class="hud-fired-event-banner">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:700; color:#38bdf8; font-size:11px;">⚡ Infinity Engine Event Fired: ${getEventIcon(ev.eventType)} ${escapeXml(ev.title)}</span>
          <span style="font-size:9px; background:rgba(56,189,248,0.2); padding:1px 5px; border-radius:3px; color:#bae6fd; font-family:monospace;">${escapeXml(ev.infinityInteraction?.interactionType || 'bcs_script_action')}</span>
        </div>
        ${bcsActionDisplay ? `
          <div style="font-size:10px; color:#e2e8f0; font-family:monospace; margin-top:4px; background:#020617; padding:3px 6px; border-radius:3px; border:1px solid #1e293b;">
            <span style="color:#10b981; font-weight:700;">EXEC:</span> ${escapeXml(bcsActionDisplay)}
          </div>
        ` : ''}
        ${ev.infinityInteraction?.dialogueRef ? `
          <div style="font-size:10px; color:#c084fc; margin-top:2px;">💬 Dialogue State: <strong>${escapeXml(ev.infinityInteraction.dialogueRef)}</strong></div>
        ` : ''}
      </div>
    `;
  }

  if (narrativeEl) {
    narrativeEl.innerHTML = `${firedBannerHtml}<div>${escapeXml(node['robos:summary'] || node.summary || 'No narrative description provided.')}</div>`;
  }

  // Render choice action buttons
  const choices = node['robos:choices'] || node.choices || [];
  const gs = getGameState();
  const flags = gs['robos:worldFlags'] || {};

  if (choices.length === 0) {
    choicesListEl.innerHTML = `
      <div style="font-size:12px;color:#c084fc;font-weight:600;display:flex;align-items:center;gap:6px;">
        <span>🏆 You have reached a Campaign Conclusion / End Game State.</span>
        <button class="btn btn-secondary btn-sm" onclick="showEpilogueModal(state.activeCampaignData['robos:storyFlow']['robos:storyNodes'].find(n => n.id === '${node.id}'))">📜 Read Epilogue Scroll</button>
      </div>
    `;
    return;
  }

  choicesListEl.innerHTML = choices.map((ch, idx) => {
    let isLocked = false;
    let lockReason = '';
    if (ch.requiredFlag && !flags[ch.requiredFlag]) {
      isLocked = true;
      lockReason = ` (Requires: ${ch.requiredFlag})`;
    }

    const boundEvt = (state.gameEvents || []).find(e =>
      e.slug === ch.boundEventId ||
      e.id === ch['robos:boundEvent'] ||
      e.urn === ch['robos:boundEvent'] ||
      e.id === ch.boundEventId
    );

    const icon = isLocked ? '🔒' : (boundEvt ? getEventIcon(boundEvt.eventType) : '⚔️');
    const eventBadge = boundEvt
      ? `<span class="hud-bound-event-tag" title="Fires Infinity Engine Event: ${escapeXml(boundEvt.title)}">⚡ ${escapeXml(boundEvt.title.length > 22 ? boundEvt.title.slice(0, 20) + '…' : boundEvt.title)}</span>`
      : '';

    return `
      <button class="hud-choice-btn ${isLocked ? 'disabled' : ''}" data-target="${ch.targetNodeId}" data-idx="${idx}" ${isLocked ? 'disabled title="Prerequisite flag not met"' : ''}>
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>${icon}</span>
            <span>${escapeXml(ch.label || 'Advance to next stage')}${lockReason}</span>
          </div>
          ${eventBadge}
        </div>
      </button>
    `;
  }).join('');

  choicesListEl.querySelectorAll('.hud-choice-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const idx = Number(btn.getAttribute('data-idx'));
      const choice = choices[idx];

      // Apply any choice setFlags
      if (choice.setFlags && typeof choice.setFlags === 'object') {
        Object.assign(flags, choice.setFlags);
        renderStoryFlags();
      }

      // Fire Bound Game Event if linked!
      const boundEvt = (state.gameEvents || []).find(e =>
        e.slug === choice.boundEventId ||
        e.id === choice['robos:boundEvent'] ||
        e.urn === choice['robos:boundEvent'] ||
        e.id === choice.boundEventId
      );

      if (boundEvt) {
        state.storyWalkthrough.lastFiredEvent = boundEvt;
        // Apply state mutations from the bound game event
        if (boundEvt.stateMutations) {
          if (boundEvt.stateMutations.setFlags) {
            Object.assign(flags, boundEvt.stateMutations.setFlags);
            renderStoryFlags();
          }
          if (boundEvt.stateMutations.xpAward) {
            const heroes = state.activeCampaignData?.heroes || [];
            heroes.forEach(h => { h.xp = (h.xp || 0) + boundEvt.stateMutations.xpAward; });
            renderCampaignTacticsRoster();
          }
          if (boundEvt.stateMutations.goldChange && gs['robos:sharedInventory']) {
            gs['robos:sharedInventory'].gold = Math.max(0, (gs['robos:sharedInventory'].gold || 0) + boundEvt.stateMutations.goldChange);
            renderInventoryOverview();
          }
        }
        setStatus(`Infinity Engine Event [${boundEvt.title}] fired. BCS action queue executed.`);
      } else {
        state.storyWalkthrough.lastFiredEvent = null;
      }

      state.storyWalkthrough.currentNodeId = targetId;
      if (!state.storyWalkthrough.visitedNodeIds.includes(targetId)) {
        state.storyWalkthrough.visitedNodeIds.push(targetId);
      }
      state.selectedStoryNodeId = targetId;

      // Auto-turn Flow Page if target is on a different page!
      const targetNode = (flow['robos:storyNodes'] || []).find(n => n.id === targetId);
      if (targetNode) {
        const targetPage = targetNode['robos:flowPage'] || targetNode.flowPage;
        if (targetPage && state.activeFlowPageId !== 'all' && state.activeFlowPageId !== targetPage) {
          state.activeFlowPageId = targetPage;
        }
      }

      renderStoryWalkthroughHUD();
      renderQuestScenarioTree();
    });
  });
}

function showEpilogueModal(node) {
  const overlay = document.getElementById('story-epilogue-overlay');
  if (!overlay) return;

  const badgeEl = document.getElementById('epilogue-badge');
  const titleEl = document.getElementById('epilogue-title');
  const subtitleEl = document.getElementById('epilogue-ending-type');
  const textEl = document.getElementById('epilogue-narrative-text');
  const flagsSummaryEl = document.getElementById('epilogue-flags-summary');

  const victoryStatus = (node['robos:victoryStatus'] || node.victoryStatus || 'victory').toUpperCase();
  const endingType = node['robos:endingType'] || node.endingType || 'triumph_good';

  if (badgeEl) {
    badgeEl.textContent = `${victoryStatus === 'VICTORY' ? '🏆 VICTORY' : (victoryStatus === 'DEFEAT' ? '💀 DEFEAT' : '🕊️ RESOLVED')}`;
    badgeEl.style.background = victoryStatus === 'VICTORY' ? '#eab308' : (victoryStatus === 'DEFEAT' ? '#ef4444' : '#38bdf8');
  }

  if (titleEl) titleEl.textContent = node['dcterms:title'] || node.title || 'Campaign Ending';
  if (subtitleEl) {
    switch (endingType) {
      case 'triumph_good': subtitleEl.textContent = '🌟 Heroic Triumph Ending — Savior of the Realm'; break;
      case 'tyrant_evil': subtitleEl.textContent = '👑 Dark Ascension Ending — The Reign of Terror'; break;
      case 'tragic_sacrifice': subtitleEl.textContent = '🕊️ Bittersweet Sacrifice Ending — The Martyr\'s Light'; break;
      case 'neutral_wanderer': subtitleEl.textContent = '🌲 The Wanderer\'s Exile — Beyond the Edge of Maps'; break;
      case 'game_over_defeat': subtitleEl.textContent = '💀 Total Defeat — Shadows Consume All'; break;
      default: subtitleEl.textContent = 'Campaign Resolution'; break;
    }
  }

  if (textEl) {
    textEl.textContent = node['robos:epilogueText'] || node.epilogueText || node['robos:summary'] || node.summary || 'Your campaign concludes here.';
  }

  if (flagsSummaryEl) {
    const gs = getGameState();
    const flags = gs['robos:worldFlags'] || {};
    const activeFlags = Object.keys(flags).filter(k => flags[k] === true);
    if (activeFlags.length > 0) {
      flagsSummaryEl.innerHTML = activeFlags.map(f => `<span class="epilogue-flag-pill">✔ ${f}</span>`).join('');
    } else {
      flagsSummaryEl.innerHTML = '<span style="font-size:11px;color:#94a3b8;">No critical narrative flags recorded.</span>';
    }
  }

  overlay.classList.remove('hidden');
}
window.showEpilogueModal = showEpilogueModal;

function renderStoryFlags() {
  const tbody = document.getElementById('flags-table-body');
  if (!tbody) return;
  const gs = getGameState();
  const flags = gs['robos:worldFlags'] || {};

  const keys = Object.keys(flags);
  if (keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="color:var(--text-muted);padding:8px;">No story flags set.</td></tr>';
    return;
  }

  tbody.innerHTML = keys.map(key => `
    <tr>
      <td><strong>${key}</strong></td>
      <td>
        <input type="text" class="input-text flag-val-input" data-key="${key}" value="${flags[key]}" style="padding:2px 6px;font-size:11px;width:100%;">
      </td>
      <td>
        <button class="btn btn-danger btn-sm btn-del-flag" data-key="${key}" style="padding:2px 6px;">✕</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.flag-val-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const k = e.target.getAttribute('data-key');
      let val = e.target.value.trim();
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(Number(val)) && val !== '') val = Number(val);
      flags[k] = val;
    });
  });

  tbody.querySelectorAll('.btn-del-flag').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-key');
      delete flags[k];
      renderStoryFlags();
    });
  });
}

// ========================================================
// MODULE 2: cRPG CHARACTER EDITOR & NPC STUDIO
// ========================================================
let characterSearchQuery = '';

function setupCharacterHandlers() {
  // Sidebar Add Buttons
  document.getElementById('btn-add-hero')?.addEventListener('click', addNewHero);
  document.getElementById('btn-add-npc')?.addEventListener('click', addNewNpc);

  // File menu dropdown
  const btnCharFileMenu = document.getElementById('btn-char-file-menu');
  const charFileDropdown = document.getElementById('menu-char-file-dropdown');

  btnCharFileMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    charFileDropdown?.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (charFileDropdown && !charFileDropdown.contains(e.target) && e.target !== btnCharFileMenu) {
      charFileDropdown.classList.add('hidden');
    }
  });

  document.getElementById('menu-item-new-hero')?.addEventListener('click', () => {
    charFileDropdown?.classList.add('hidden');
    addNewHero();
  });
  document.getElementById('menu-item-new-npc')?.addEventListener('click', () => {
    charFileDropdown?.classList.add('hidden');
    addNewNpc();
  });
  document.getElementById('menu-item-save-char')?.addEventListener('click', () => {
    charFileDropdown?.classList.add('hidden');
    saveCurrentCharacter();
  });
  document.getElementById('menu-item-close-char')?.addEventListener('click', () => {
    charFileDropdown?.classList.add('hidden');
    closeActiveCharacter();
  });

  // Top Header Context Controls
  document.getElementById('btn-header-new-hero')?.addEventListener('click', addNewHero);
  document.getElementById('btn-hdr-new-hero')?.addEventListener('click', addNewHero);
  document.getElementById('btn-header-new-npc')?.addEventListener('click', addNewNpc);
  document.getElementById('btn-hdr-new-npc')?.addEventListener('click', addNewNpc);
  document.getElementById('btn-header-close-char')?.addEventListener('click', closeActiveCharacter);
  document.getElementById('btn-header-save-char')?.addEventListener('click', saveCurrentCharacter);
  document.getElementById('btn-hdr-save-char')?.addEventListener('click', saveCurrentCharacter);
  document.getElementById('btn-header-delete-char')?.addEventListener('click', deleteActiveCharacter);
  document.getElementById('btn-hdr-del-char')?.addEventListener('click', deleteActiveCharacter);
  document.getElementById('header-char-select')?.addEventListener('change', (e) => {
    if (e.target.value) {
      loadCharacterSheet(e.target.value);
    } else {
      closeActiveCharacter();
    }
  });

  // Action Buttons inside Sheet Area
  document.getElementById('btn-save-character')?.addEventListener('click', saveCurrentCharacter);
  document.getElementById('btn-close-character')?.addEventListener('click', closeActiveCharacter);
  document.getElementById('btn-clone-hero')?.addEventListener('click', cloneActiveCharacter);
  document.getElementById('btn-delete-hero')?.addEventListener('click', deleteActiveCharacter);

  // Empty State Buttons
  document.getElementById('btn-empty-new-hero')?.addEventListener('click', addNewHero);
  document.getElementById('btn-empty-new-npc')?.addEventListener('click', addNewNpc);

  // Live Roster Search Bar
  document.getElementById('character-search-input')?.addEventListener('input', (e) => {
    characterSearchQuery = (e.target.value || '').trim().toLowerCase();
    renderCharactersList();
  });

  // Filter Pills
  document.getElementById('pill-filter-all')?.addEventListener('click', () => setCharacterFilter('all'));
  document.getElementById('pill-filter-heroes')?.addEventListener('click', () => setCharacterFilter('hero'));
  document.getElementById('pill-filter-npcs')?.addEventListener('click', () => setCharacterFilter('npc'));

  // Entity Type Radios (Hero vs NPC)
  document.querySelectorAll('input[name="char-type-radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const isNpc = e.target.value === 'npc';
      toggleCharacterTypeUI(isNpc);
    });
  });

  // Archetype Dropdown
  document.getElementById('archetype-select')?.addEventListener('change', (e) => {
    const archKey = e.target.value;
    if (!archKey || !ARCHETYPES[archKey]) return;
    applyArchetype(ARCHETYPES[archKey], archKey);
    e.target.value = '';
  });

  // Live Modifiers for Ability Scores
  ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(attr => {
    const input = document.getElementById(`attr-${attr}`);
    input?.addEventListener('input', () => {
      updateAbilityModifier(attr, Number(input.value || 10));
    });
  });

  // Live Portrait & Name sync
  document.getElementById('hero-portrait')?.addEventListener('input', (e) => {
    const avatar = document.getElementById('hero-avatar-display');
    if (avatar) avatar.textContent = e.target.value.trim() || '👤';
  });

  document.getElementById('hero-name')?.addEventListener('input', (e) => {
    const isNpc = document.getElementById('radio-type-npc')?.checked;
    const titleEl = document.getElementById('sheet-hero-title');
    if (titleEl) titleEl.textContent = `${e.target.value || 'Character'} (${isNpc ? 'NPC' : 'Player Character'})`;
  });

  // Character Sheet Equipment & Strength Encumbrance Listeners
  ['char-equip-mainhand', 'char-equip-offhand', 'char-equip-armor', 'char-equip-cloak'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      updateCharSheetEncumbranceMeter();
    });
  });

  const csQuickSel = document.getElementById('char-equip-quickitems');
  csQuickSel?.addEventListener('change', () => {
    renderQuickItemPills('char-equip-quickitems-pills', 'char-equip-quickitems', () => {
      updateCharSheetEncumbranceMeter();
    });
    updateCharSheetEncumbranceMeter();
  });

  document.getElementById('attr-str')?.addEventListener('input', () => {
    updateCharSheetEncumbranceMeter();
  });

  document.getElementById('npc-str')?.addEventListener('input', () => {
    updateCharSheetEncumbranceMeter();
  });

  // Spellbook & Prepared Spells handlers
  document.getElementById('btn-char-add-spell')?.addEventListener('click', () => {
    const sel = document.getElementById('char-spells-select');
    const spellSlug = sel?.value;
    if (!spellSlug) return;
    addSpellToActiveCharacter(spellSlug);
  });

  // Abilities handlers
  document.getElementById('btn-char-add-ability')?.addEventListener('click', () => {
    const sel = document.getElementById('char-abilities-select');
    const abilitySlug = sel?.value;
    if (!abilitySlug) return;
    addAbilityToActiveCharacter(abilitySlug);
  });

  // Infinity AI Directives handlers
  document.getElementById('char-ai-heal-slider')?.addEventListener('input', (e) => {
    const val = document.getElementById('char-ai-heal-val');
    if (val) val.textContent = `${e.target.value}%`;
  });
  document.getElementById('char-ai-potion-slider')?.addEventListener('input', (e) => {
    const val = document.getElementById('char-ai-potion-val');
    if (val) val.textContent = `${e.target.value}%`;
  });
  document.getElementById('char-ai-role')?.addEventListener('change', (e) => {
    updateCharRoleBadge(e.target.value);
  });

  // Update spell stats on class/attribute changes
  ['attr-int', 'attr-wis', 'attr-cha', 'vital-prof', 'hero-class'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => updateCharSpellStats());
    document.getElementById(id)?.addEventListener('change', () => updateCharSpellStats());
  });
}

function showEmptyCharacterState() {
  state.activeCharacterSlug = null;
  state.activeCharacterData = null;
  state.activeCharPreparedSpells = [];
  state.activeCharAssignedAbilities = [];
  renderCharSpellChips();
  renderCharAbilityChips();
  updateCharSpellStats();
  loadCharDirectiveUI({});

  const emptyOverlay = document.getElementById('character-empty-state');
  if (emptyOverlay) emptyOverlay.classList.remove('hidden');

  const sheetForm = document.getElementById('character-sheet-form-container');
  if (sheetForm) sheetForm.classList.add('hidden');

  const hdrSelect = document.getElementById('header-char-select');
  if (hdrSelect) hdrSelect.value = '';

  document.querySelectorAll('.hero-list-item').forEach(el => el.classList.remove('active'));

  setStatus('No character selected.');
}

function closeActiveCharacter() {
  showEmptyCharacterState();
  setStatus('Character closed.');
}

function setCharacterFilter(filter) {
  state.characterFilter = filter;
  document.getElementById('pill-filter-all')?.classList.toggle('active', filter === 'all');
  document.getElementById('pill-filter-heroes')?.classList.toggle('active', filter === 'hero');
  document.getElementById('pill-filter-npcs')?.classList.toggle('active', filter === 'npc');
  renderCharactersList();
}

function toggleCharacterTypeUI(isNpc) {
  const npcSection = document.getElementById('section-npc-details');
  const heroSection = document.getElementById('section-hero-details');
  if (npcSection) npcSection.classList.toggle('hidden', !isNpc);
  if (heroSection) heroSection.classList.toggle('hidden', isNpc);

  const charName = document.getElementById('hero-name')?.value || 'Character';
  const titleEl = document.getElementById('sheet-hero-title');
  if (titleEl) titleEl.textContent = `${charName} (${isNpc ? 'NPC' : 'Player Character'})`;
}

function updateAbilityModifier(attr, val) {
  const mod = Math.floor((val - 10) / 2);
  const sign = mod >= 0 ? `+${mod}` : `${mod}`;
  const label = document.getElementById(`mod-${attr}`);
  if (label) label.textContent = sign;
}

async function loadAllCharacters(options = {}) {
  const { autoSelect = false, targetSlug = null } = options;
  try {
    const res = await window.robos.listCharacters();
    if (res.success) {
      state.characters = res.characters || [];

      // Update header dropdown
      const hdrSelect = document.getElementById('header-char-select');
      if (hdrSelect) {
        hdrSelect.innerHTML = '<option value="">(No character selected)</option>' +
          state.characters.map(c => {
            const isNpc = c.characterType === 'npc' || !!c.role;
            return `<option value="${c.slug}">${c.portrait || (isNpc ? '👑' : '👤')} ${c.name || c.slug}</option>`;
          }).join('');
        if (state.activeCharacterSlug) {
          hdrSelect.value = state.activeCharacterSlug;
        }
      }

      renderCharactersList();

      if (targetSlug && state.characters.some(c => c.slug === targetSlug)) {
        await loadCharacterSheet(targetSlug);
      } else if (state.activeCharacterSlug && state.characters.some(c => c.slug === state.activeCharacterSlug)) {
        await loadCharacterSheet(state.activeCharacterSlug);
      } else if (autoSelect && state.characters.length > 0) {
        await loadCharacterSheet(state.characters[0].slug);
      } else if (!state.activeCharacterSlug) {
        showEmptyCharacterState();
      }

      renderInventoryViews();
    }
  } catch (err) {
    console.error('Error loading characters list:', err);
  }
}

function renderCharactersList() {
  const listEl = document.getElementById('heroes-list');
  if (!listEl) return;

  const filtered = state.characters.filter(c => {
    const isNpc = c.characterType === 'npc' || !!c.role;
    if (state.characterFilter === 'hero' && isNpc) return false;
    if (state.characterFilter === 'npc' && !isNpc) return false;
    if (characterSearchQuery) {
      const name = (c.name || '').toLowerCase();
      const slug = (c.slug || '').toLowerCase();
      const role = (c.role || '').toLowerCase();
      const cls = (c.class || '').toLowerCase();
      if (!name.includes(characterSearchQuery) && !slug.includes(characterSearchQuery) && !role.includes(characterSearchQuery) && !cls.includes(characterSearchQuery)) {
        return false;
      }
    }
    return true;
  });

  const countEl = document.getElementById('roster-count');
  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    const msg = characterSearchQuery
      ? 'No characters found matching search filter.'
      : 'No characters in workspace. Click + Player Character or + NPC to create one.';
    listEl.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:8px;">${msg}</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const isNpc = c.characterType === 'npc' || !!c.role;
    const isActive = c.slug === state.activeCharacterSlug;
    return `
      <div class="hero-list-item ${isActive ? 'active' : ''}" data-slug="${c.slug}">
        <div class="hero-avatar-badge">${c.portrait || (isNpc ? '👑' : '👤')}</div>
        <div class="hero-info-text">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="hero-name-label">${c.name || c.slug}</span>
            <span class="char-type-pill ${isNpc ? 'npc' : 'hero'}">${isNpc ? (c.role || 'NPC') : 'Player Character'}</span>
          </div>
          <span class="hero-class-label">${isNpc ? `Role: ${c.role || 'NPC'}` : `Lvl ${c.level || 1} ${c.race || ''} ${c.class || ''}`}</span>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.hero-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const slug = item.getAttribute('data-slug');
      loadCharacterSheet(slug);
    });
  });
}

// Canonical abilities lookup & normalization
const KNOWN_ABILITY_SLUGS = [
  'sneak-attack',
  'cunning-action',
  'action-surge',
  'second-wind',
  'divine-smite',
  'turn-undead',
  'rage',
  'uncanny-dodge',
  'defensive-flurry',
  'flank-advantage',
  'rallying-stomp',
  'trip-attack'
];

function normalizeAbilitySlug(str) {
  if (!str) return null;
  const s = String(str).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!s) return null;

  // Direct exact match
  if (KNOWN_ABILITY_SLUGS.includes(s)) return s;
  if (state.abilities && state.abilities.some(a => a.slug === s)) return s;

  // Prefix match (e.g. sneak-attack-1d6-, sneak-attack-2d6-, cunning-action-dash...)
  for (const slug of KNOWN_ABILITY_SLUGS) {
    if (s === slug || s.startsWith(slug + '-') || s.startsWith(slug)) {
      return slug;
    }
  }

  // State abilities match by name or prefix
  if (state.abilities) {
    for (const a of state.abilities) {
      if (s.startsWith(a.slug + '-') || s.startsWith(a.slug)) return a.slug;
      if (a.name) {
        const normName = a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (s === normName || s.startsWith(normName + '-') || s.startsWith(normName)) return a.slug;
      }
    }
  }

  return null;
}

function partitionSpellsAndAbilities(rawSpells, rawAbilities) {
  const preparedSpells = [];
  const assignedAbilities = [];

  const parseTokens = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input.map(item => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        return item.slug || item.name || '';
      }).filter(Boolean);
    }
    if (typeof input === 'string') {
      return input.split(/[\n,]/).map(t => t.trim()).filter(Boolean);
    }
    return [];
  };

  const rawSpellTokens = parseTokens(rawSpells);
  const rawAbilityTokens = parseTokens(rawAbilities);

  // Process ability tokens first
  for (const token of rawAbilityTokens) {
    const abSlug = normalizeAbilitySlug(token) || token.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (abSlug && !assignedAbilities.includes(abSlug)) {
      assignedAbilities.push(abSlug);
    }
  }

  // Process spell tokens, strictly extracting any abilities that were mistakenly categorized as spells
  for (const token of rawSpellTokens) {
    const cleanToken = token.trim();
    if (!cleanToken) continue;
    const abilityMatch = normalizeAbilitySlug(cleanToken);
    if (abilityMatch) {
      if (!assignedAbilities.includes(abilityMatch)) {
        assignedAbilities.push(abilityMatch);
      }
    } else {
      const spellSlug = cleanToken.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (spellSlug && !preparedSpells.includes(spellSlug)) {
        preparedSpells.push(spellSlug);
      }
    }
  }

  return { preparedSpells, assignedAbilities };
}

async function loadCharacterSheet(slug) {
  if (!slug) return;
  try {
    setStatus(`Loading character ${slug}...`);
    const res = await window.robos.loadCharacter(slug);
    if (res.success) {
      const emptyOverlay = document.getElementById('character-empty-state');
      if (emptyOverlay) emptyOverlay.classList.add('hidden');
      const sheetForm = document.getElementById('character-sheet-form-container');
      if (sheetForm) sheetForm.classList.remove('hidden');

      const data = res.data;
      state.activeCharacterSlug = slug;
      state.activeCharacterData = data;

      // Header select sync
      const hdrSelect = document.getElementById('header-char-select');
      if (hdrSelect) hdrSelect.value = slug;

      // Determine NPC vs Hero
      const types = Array.isArray(data['@type']) ? data['@type'] : [data['@type']];
      const isNpc = data['robos:characterType'] === 'npc' ||
                    data.characterType === 'npc' ||
                    types.includes('robos:CRPGNPC') ||
                    !!data['robos:npcRole'] ||
                    !!data.role;

      // Update Radio Buttons
      const radHero = document.getElementById('radio-type-hero');
      const radNpc = document.getElementById('radio-type-npc');
      if (radHero && radNpc) {
        radHero.checked = !isNpc;
        radNpc.checked = isNpc;
      }
      toggleCharacterTypeUI(isNpc);

      const name = data['schema:name'] || data.name || slug;
      const portrait = data['robos:portrait'] || data.portrait || (isNpc ? '👑' : '👤');

      document.getElementById('sheet-hero-title').textContent = `${name} (${isNpc ? 'NPC' : 'Player Character'})`;
      document.getElementById('hero-avatar-display').textContent = portrait;
      document.getElementById('hero-name').value = name;
      document.getElementById('hero-slug').value = slug;
      document.getElementById('hero-portrait').value = portrait;
      document.getElementById('hero-alignment').value = data['robos:alignment'] || data.alignment || 'Neutral Good';

      // NPC details
      document.getElementById('npc-role').value = data['robos:npcRole'] || data.role || 'villager';
      document.getElementById('npc-interaction').value = data['robos:interactionType'] || data.interactionType || 'talk';
      populateNpcLocationDropdown();
      document.getElementById('npc-location').value = data['robos:location'] || data.location || '';
      document.getElementById('npc-facing').value = data['robos:facing'] || data.facing || 'down';
      document.getElementById('npc-col').value = data['robos:col'] ?? data.col ?? 0;
      document.getElementById('npc-row').value = data['robos:row'] ?? data.row ?? 0;
      const npcStrInput = document.getElementById('npc-str');
      if (npcStrInput) npcStrInput.value = data['robos:str'] || data.str || 10;

      const dialogue = data['robos:dialogue'] || data.dialogue || '';
      document.getElementById('npc-dialogue').value = Array.isArray(dialogue) ? dialogue.join('\n\n') : dialogue;

      // Hero details
      document.getElementById('hero-level').value = data['robos:level'] || data.level || 1;
      document.getElementById('hero-race').value = data['robos:race'] || data.race || 'Human';
      document.getElementById('hero-class').value = data['robos:class'] || data.class || 'Fighter';
      document.getElementById('hero-subclass').value = data['robos:subclass'] || data.subclass || '';
      document.getElementById('hero-background').value = data['robos:background'] || data.background || '';
      document.getElementById('hero-xp').value = data['robos:xp'] || data.xp || 0;

      ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(attr => {
        const val = data[`robos:${attr}`] || data[attr] || 10;
        const input = document.getElementById(`attr-${attr}`);
        if (input) input.value = val;
        updateAbilityModifier(attr, val);
      });

      document.getElementById('vital-ac').value = data['robos:ac'] || data.ac || 10;
      document.getElementById('vital-hp-max').value = data['robos:hpMax'] || data.hpMax || 10;
      document.getElementById('vital-hp-cur').value = data['robos:hpCurrent'] || data.hpCurrent || 10;
      document.getElementById('vital-speed').value = data['robos:speed'] || data.speed || 30;
      document.getElementById('vital-init').value = data['robos:initiative'] || data.initiative || 0;
      document.getElementById('vital-prof').value = data['robos:prof'] || data.prof || 2;

      // Spellbook, Abilities & Infinity AI Directives
      const rawSpells = data['robos:preparedSpells'] || data.preparedSpells || data['robos:spells'] || data.spells || [];
      const rawAbilities = data['robos:abilities'] || data.abilities || [];
      const partitioned = partitionSpellsAndAbilities(rawSpells, rawAbilities);

      state.activeCharPreparedSpells = partitioned.preparedSpells;
      state.activeCharAssignedAbilities = partitioned.assignedAbilities;

      populateCharSpellsDropdown();
      renderCharSpellChips();
      updateCharSpellStats();

      populateCharAbilitiesDropdown();
      renderCharAbilityChips();

      const charDirective = data['robos:directive'] || data.directive || {};
      loadCharDirectiveUI(charDirective);

      document.getElementById('hero-backstory').value = data['robos:backstory'] || data.backstory || '';

      // Equipment slots & encumbrance meter for Character Sheet
      populateCharSheetEquipmentDropdowns(data);
      updateCharSheetEncumbranceMeter();
      renderPaperdollSlots(data, 'cs');
      renderQuickItemSlots(data, 'cs');
      renderCharacterBag(data, 'char-sheet');
      populateBagPickers();

      // Update active highlight in sidebar list
      document.querySelectorAll('#heroes-list .hero-list-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-slug') === slug);
      });

      setStatus(`Loaded character: ${slug}`, res.filePath);
    }
  } catch (err) {
    console.error('Error loading character:', err);
    setStatus(`Error loading character: ${err.message}`);
  }
}

async function saveCurrentCharacter() {
  const name = document.getElementById('hero-name').value.trim() || 'New Character';
  let slug = document.getElementById('hero-slug').value.trim();
  if (!slug) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `char-${Date.now().toString().slice(-4)}`;
    document.getElementById('hero-slug').value = slug;
  }

  const isNpc = document.getElementById('radio-type-npc').checked;
  const characterType = isNpc ? 'npc' : 'hero';
  const portrait = document.getElementById('hero-portrait').value.trim() || (isNpc ? '👑' : '👤');
  const alignment = document.getElementById('hero-alignment').value;
  const backstory = document.getElementById('hero-backstory').value.trim();

  const types = isNpc
    ? ['robos:CRPGCharacter', 'robos:CRPGNPC', 'schema:Person']
    : ['robos:CRPGCharacter', 'robos:CRPGPlayerCharacter', 'robos:CRPGHero', 'schema:Person'];

  const charData = {
    '@context': {
      robos: 'urn:robos:',
      schema: 'https://schema.org/',
      dcterms: 'http://purl.org/dc/terms/'
    },
    '@type': types,
    '@id': `urn:robos:crpg:character:${slug}`,
    'schema:name': name,
    name,
    slug,
    'robos:characterType': characterType,
    characterType,
    'robos:portrait': portrait,
    portrait,
    'robos:alignment': alignment,
    alignment,
    'robos:backstory': backstory,
    backstory
  };

  if (isNpc) {
    const role = document.getElementById('npc-role').value;
    const interactionType = document.getElementById('npc-interaction').value;
    const location = document.getElementById('npc-location').value;
    const facing = document.getElementById('npc-facing').value;
    const col = Number(document.getElementById('npc-col').value || 0);
    const row = Number(document.getElementById('npc-row').value || 0);
    const npcStr = Number(document.getElementById('npc-str')?.value || 10);
    const rawDialogue = document.getElementById('npc-dialogue').value.trim();
    const dialogue = rawDialogue ? rawDialogue.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean) : [];

    charData['robos:npcRole'] = role;
    charData.role = role;
    charData['robos:interactionType'] = interactionType;
    charData.interactionType = interactionType;
    charData['robos:location'] = location;
    charData.location = location;
    charData['robos:facing'] = facing;
    charData.facing = facing;
    charData['robos:col'] = col;
    charData.col = col;
    charData['robos:row'] = row;
    charData.row = row;
    charData['robos:str'] = npcStr;
    charData.str = npcStr;
    charData['robos:dialogue'] = dialogue.length > 0 ? dialogue : [rawDialogue];
    charData.dialogue = charData['robos:dialogue'];
  } else {
    const level = Number(document.getElementById('hero-level').value || 1);
    const race = document.getElementById('hero-race').value;
    const charClass = document.getElementById('hero-class').value;
    const subclass = document.getElementById('hero-subclass').value.trim();
    const background = document.getElementById('hero-background').value.trim();
    const xp = Number(document.getElementById('hero-xp').value || 0);

    charData['robos:level'] = level;
    charData.level = level;
    charData['robos:race'] = race;
    charData.race = race;
    charData['robos:class'] = charClass;
    charData.class = charClass;
    charData['robos:subclass'] = subclass;
    charData.subclass = subclass;
    charData['robos:background'] = background;
    charData.background = background;
    charData['robos:xp'] = xp;
    charData.xp = xp;

    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(attr => {
      const val = Number(document.getElementById(`attr-${attr}`).value || 10);
      charData[`robos:${attr}`] = val;
      charData[attr] = val;
    });

    const ac = Number(document.getElementById('vital-ac').value || 10);
    const hpMax = Number(document.getElementById('vital-hp-max').value || 10);
    const hpCurrent = Number(document.getElementById('vital-hp-cur').value || 10);
    const speed = Number(document.getElementById('vital-speed').value || 30);
    const init = Number(document.getElementById('vital-init').value || 0);
    const prof = Number(document.getElementById('vital-prof').value || 2);

    charData['robos:ac'] = ac;
    charData.ac = ac;
    charData['robos:hpMax'] = hpMax;
    charData.hpMax = hpMax;
    charData['robos:hpCurrent'] = hpCurrent;
    charData.hpCurrent = hpCurrent;
    charData['robos:speed'] = speed;
    charData.speed = speed;
    charData['robos:initiative'] = init;
    charData.initiative = init;
    charData['robos:prof'] = prof;
    charData.prof = prof;

    const spells = document.getElementById('hero-spells').value.trim();
    charData['robos:spells'] = spells;
    charData.spells = spells;
  }

  // Equipment slots for character (PCs and NPCs)
  const csMainHand = document.getElementById('char-equip-mainhand')?.value || '';
  const csOffHand = document.getElementById('char-equip-offhand')?.value || '';
  const csArmor = document.getElementById('char-equip-armor')?.value || '';
  const csCloak = document.getElementById('char-equip-cloak')?.value || '';
  const csQuickSelect = document.getElementById('char-equip-quickitems');
  const csQuickItems = getMultiSelectValues(csQuickSelect);
  const csQuickVal = csQuickItems.length <= 1 ? (csQuickItems[0] || '') : csQuickItems;

  charData['robos:mainHand'] = csMainHand;
  charData.mainHand = csMainHand;
  charData['robos:offHand'] = csOffHand;
  charData.offHand = csOffHand;
  charData['robos:armor'] = csArmor;
  charData.armor = csArmor;
  charData['robos:cloak'] = csCloak;
  charData.cloak = csCloak;
  charData['robos:quickItems'] = csQuickVal;
  charData.quickItems = csQuickVal;

  // Spellbook, Abilities & Infinity AI Directives
  const preparedSpells = state.activeCharPreparedSpells || [];
  charData['robos:preparedSpells'] = preparedSpells;
  charData.preparedSpells = preparedSpells;
  charData['robos:spells'] = preparedSpells.join(', ');
  charData.spells = preparedSpells.join(', ');

  const assignedAbilities = state.activeCharAssignedAbilities || [];
  charData['robos:abilities'] = assignedAbilities;
  charData.abilities = assignedAbilities;

  const directive = saveCharDirectiveUI();
  charData['robos:directive'] = directive;
  charData.directive = directive;

  const charBag = getCharacterBag(state.activeCharacterData);
  charData['robos:inventory'] = charBag;
  charData.inventory = charBag;

  try {
    setStatus(`Saving character ${slug}...`);
    const res = await window.robos.saveCharacter({ slug, data: charData });
    if (res.success) {
      state.activeCharacterSlug = res.slug;
      setStatus(`Saved character successfully!`, res.filePath);
      await loadAllCharacters();
      await loadCharacterSheet(res.slug);
      renderCampaignCharactersChecklist();
    } else {
      setStatus(`Failed to save character: ${res.error}`);
    }
  } catch (err) {
    console.error('Error saving character:', err);
    setStatus(`Error saving character: ${err.message}`);
  }
}

function addNewHero() {
  const emptyOverlay = document.getElementById('character-empty-state');
  if (emptyOverlay) emptyOverlay.classList.add('hidden');
  const sheetForm = document.getElementById('character-sheet-form-container');
  if (sheetForm) sheetForm.classList.remove('hidden');

  const safeSlug = `hero-${Date.now().toString().slice(-4)}`;
  state.activeCharacterSlug = safeSlug;
  state.activeCharacterData = null;

  document.getElementById('radio-type-hero').checked = true;
  document.getElementById('radio-type-npc').checked = false;
  toggleCharacterTypeUI(false);

  document.getElementById('sheet-hero-title').textContent = 'New Player Character';
  document.getElementById('hero-avatar-display').textContent = '⚔️';
  document.getElementById('hero-name').value = 'New Player Character';
  document.getElementById('hero-slug').value = safeSlug;
  document.getElementById('hero-portrait').value = '⚔️';
  document.getElementById('hero-alignment').value = 'Neutral Good';
  document.getElementById('hero-level').value = 1;
  document.getElementById('hero-race').value = 'Human';
  document.getElementById('hero-class').value = 'Fighter';
  document.getElementById('hero-subclass').value = '';
  document.getElementById('hero-background').value = 'Folk Hero';
  document.getElementById('hero-xp').value = 0;

  ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(attr => {
    const input = document.getElementById(`attr-${attr}`);
    if (input) input.value = 12;
    updateAbilityModifier(attr, 12);
  });

  document.getElementById('vital-ac').value = 14;
  document.getElementById('vital-hp-max').value = 12;
  document.getElementById('vital-hp-cur').value = 12;
  document.getElementById('vital-speed').value = 30;
  document.getElementById('vital-init').value = 1;
  document.getElementById('vital-prof').value = 2;
  document.getElementById('hero-spells').value = '';
  document.getElementById('hero-backstory').value = 'A brave adventurer setting forth on a quest.';

  state.activeCharPreparedSpells = [];
  state.activeCharAssignedAbilities = [];
  populateCharSpellsDropdown();
  populateCharAbilitiesDropdown();
  renderCharSpellChips();
  renderCharAbilityChips();
  updateCharSpellStats();
  loadCharDirectiveUI({
    controller: 'infinity_ai',
    role: 'striker',
    targetPriority: 'nearest',
    movement: 'advance',
    healThreshold: 0.5,
    potionThreshold: 0.4,
    useSpells: true
  });

  populateCharSheetEquipmentDropdowns(null);
  updateCharSheetEncumbranceMeter();

  setStatus(`Ready to configure new player character: ${safeSlug}`);
}

function addNewNpc() {
  const emptyOverlay = document.getElementById('character-empty-state');
  if (emptyOverlay) emptyOverlay.classList.add('hidden');
  const sheetForm = document.getElementById('character-sheet-form-container');
  if (sheetForm) sheetForm.classList.remove('hidden');

  const safeSlug = `npc-${Date.now().toString().slice(-4)}`;
  state.activeCharacterSlug = safeSlug;
  state.activeCharacterData = null;

  document.getElementById('radio-type-hero').checked = false;
  document.getElementById('radio-type-npc').checked = true;
  toggleCharacterTypeUI(true);

  document.getElementById('sheet-hero-title').textContent = 'New NPC Character';
  document.getElementById('hero-avatar-display').textContent = '👑';
  document.getElementById('hero-name').value = 'New NPC';
  document.getElementById('hero-slug').value = safeSlug;
  document.getElementById('hero-portrait').value = '👑';
  document.getElementById('hero-alignment').value = 'Lawful Good';

  document.getElementById('npc-role').value = 'villager';
  document.getElementById('npc-interaction').value = 'talk';
  populateNpcLocationDropdown();
  if (state.maps.length > 0) {
    document.getElementById('npc-location').value = state.maps[0].slug;
  }
  document.getElementById('npc-facing').value = 'down';
  document.getElementById('npc-col').value = 5;
  document.getElementById('npc-row').value = 5;
  const npcStrInput = document.getElementById('npc-str');
  if (npcStrInput) npcStrInput.value = 10;
  document.getElementById('npc-dialogue').value = 'Greetings, traveler. Safe journeys ahead.';
  document.getElementById('hero-backstory').value = 'A resident of the realm.';

  state.activeCharPreparedSpells = [];
  state.activeCharAssignedAbilities = [];
  populateCharSpellsDropdown();
  populateCharAbilitiesDropdown();
  renderCharSpellChips();
  renderCharAbilityChips();
  loadCharDirectiveUI({
    controller: 'scripted',
    role: 'tank',
    targetPriority: 'nearest',
    movement: 'hold',
    healThreshold: 0.3,
    potionThreshold: 0.2,
    useSpells: false
  });

  populateCharSheetEquipmentDropdowns(null);
  updateCharSheetEncumbranceMeter();

  setStatus(`Ready to configure new NPC: ${safeSlug}`);
}

function cloneActiveCharacter() {
  if (!state.activeCharacterData) return;
  const isNpc = document.getElementById('radio-type-npc').checked;
  const baseName = document.getElementById('hero-name').value.trim();
  const newName = `${baseName} (Copy)`;
  const newSlug = `${state.activeCharacterSlug}-copy`;

  document.getElementById('hero-name').value = newName;
  document.getElementById('hero-slug').value = newSlug;
  document.getElementById('sheet-hero-title').textContent = `${newName} (${isNpc ? 'NPC' : 'Player Character'})`;

  saveCurrentCharacter();
}

async function deleteActiveCharacter() {
  if (!state.activeCharacterSlug) return;
  if (!confirm(`Are you sure you want to delete character '${state.activeCharacterSlug}'?`)) return;

  try {
    const res = await window.robos.deleteCharacter(state.activeCharacterSlug);
    if (res.success) {
      setStatus(`Deleted character: ${state.activeCharacterSlug}`);
      state.activeCharacterSlug = null;
      await loadAllCharacters();
    }
  } catch (err) {
    console.error('Error deleting character:', err);
    setStatus(`Error deleting character: ${err.message}`);
  }
}

function applyArchetype(arch, archKey) {
  const emptyOverlay = document.getElementById('character-empty-state');
  if (emptyOverlay) emptyOverlay.classList.add('hidden');
  const sheetForm = document.getElementById('character-sheet-form-container');
  if (sheetForm) sheetForm.classList.remove('hidden');

  const isNpc = arch.characterType === 'npc';
  const safeSlug = `${arch.slug || arch.id || archKey}-${Date.now().toString().slice(-4)}`;

  document.getElementById('radio-type-hero').checked = !isNpc;
  document.getElementById('radio-type-npc').checked = isNpc;
  toggleCharacterTypeUI(isNpc);

  document.getElementById('sheet-hero-title').textContent = `${arch.name} (${isNpc ? 'NPC' : 'Player Character'})`;
  document.getElementById('hero-avatar-display').textContent = arch.portrait || (isNpc ? '👑' : '👤');
  document.getElementById('hero-name').value = arch.name;
  document.getElementById('hero-slug').value = safeSlug;
  document.getElementById('hero-portrait').value = arch.portrait || '';
  document.getElementById('hero-alignment').value = arch.alignment || 'Neutral Good';
  document.getElementById('hero-backstory').value = arch.backstory || '';

  if (isNpc) {
    document.getElementById('npc-role').value = arch.role || 'villager';
    document.getElementById('npc-interaction').value = arch.interactionType || 'talk';
    populateNpcLocationDropdown();
    document.getElementById('npc-location').value = arch.location || '';
    document.getElementById('npc-facing').value = arch.facing || 'down';
    document.getElementById('npc-col').value = arch.col ?? 0;
    document.getElementById('npc-row').value = arch.row ?? 0;
    const npcStrInput = document.getElementById('npc-str');
    if (npcStrInput) npcStrInput.value = arch.str || 10;
    document.getElementById('npc-dialogue').value = arch.dialogue || '';
  } else {
    document.getElementById('hero-level').value = arch.level || 1;
    document.getElementById('hero-race').value = arch.race || 'Human';
    document.getElementById('hero-class').value = arch.class || 'Fighter';
    document.getElementById('hero-subclass').value = arch.subclass || '';
    document.getElementById('hero-background').value = arch.background || '';
    document.getElementById('hero-xp').value = arch.xp || 0;

    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(attr => {
      const val = arch[attr] || 10;
      const input = document.getElementById(`attr-${attr}`);
      if (input) input.value = val;
      updateAbilityModifier(attr, val);
    });

    document.getElementById('vital-ac').value = arch.ac || 10;
    document.getElementById('vital-hp-max').value = arch.hpMax || 10;
    document.getElementById('vital-hp-cur').value = arch.hpCurrent || 10;
    document.getElementById('vital-speed').value = arch.speed || 30;
    document.getElementById('vital-init').value = arch.initiative || 0;
    document.getElementById('vital-prof').value = arch.prof || 2;
    document.getElementById('hero-spells').value = arch.spells || '';
  }

  populateCharSheetEquipmentDropdowns(arch);
  updateCharSheetEncumbranceMeter();

  state.activeCharacterSlug = safeSlug;
  saveCurrentCharacter();
}

// ========================================================
// INFINITY ENGINE ENCUMBRANCE & CARRYING CAPACITY ENGINE
// ========================================================
const INFINITY_ENGINE_ENCUMBRANCE_TABLE = {
  1: 1, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60, 9: 70, 10: 90,
  11: 110, 12: 120, 13: 140, 14: 160, 15: 180, 16: 200, 17: 230, 18: 270,
  19: 500, 20: 600, 21: 700, 22: 800, 23: 1000, 24: 1440, 25: 1600
};

function getCarryingCapacity(strScore) {
  const s = Math.round(Number(strScore) || 10);
  if (s in INFINITY_ENGINE_ENCUMBRANCE_TABLE) return INFINITY_ENGINE_ENCUMBRANCE_TABLE[s];
  if (s < 1) return 1;
  return Math.max(1, s * 15);
}

function getItemWeight(itemSlugOrObj) {
  if (!itemSlugOrObj) return 0;
  if (typeof itemSlugOrObj === 'object') {
    if (itemSlugOrObj['robos:weight'] !== undefined) return Number(itemSlugOrObj['robos:weight']) || 0;
    if (itemSlugOrObj.weight !== undefined) return Number(itemSlugOrObj.weight) || 0;
    const s = itemSlugOrObj.slug || itemSlugOrObj.id;
    if (s) return getItemWeight(s);
    return 0;
  }
  const rawStr = String(itemSlugOrObj).trim();
  if (!rawStr) return 0;

  const items = state.items || [];
  // 1. Direct match on slug / id / identifier
  let it = items.find(x => x.slug === rawStr || x.id === rawStr || x['@id'] === rawStr || x['dcterms:identifier'] === rawStr);
  if (it) return Number(it['robos:weight'] ?? it.weight ?? 0);

  // 2. Case-insensitive slug match
  const lower = rawStr.toLowerCase();
  it = items.find(x => (x.slug || '').toLowerCase() === lower);
  if (it) return Number(it['robos:weight'] ?? it.weight ?? 0);

  // 3. Exact title match
  it = items.find(x => (x['dcterms:title'] || x.title || '').toLowerCase() === lower);
  if (it) return Number(it['robos:weight'] ?? it.weight ?? 0);

  // 4. Fuzzy title match (e.g. "Bamboo Pole (Club 1d4)" matches "Bamboo Pole", "Medicinal Herb (0.2 lbs)" matches "Medicinal Herb")
  it = items.find(x => {
    const t = (x['dcterms:title'] || x.title || '').toLowerCase();
    const s = (x.slug || '').toLowerCase();
    return (t && (lower.startsWith(t) || lower.includes(t))) || (s && lower.includes(s));
  });
  if (it) return Number(it['robos:weight'] ?? it.weight ?? 0);

  // 5. Look for embedded weight annotation in parentheses, e.g. "Traveler's Cloak (2 lbs)" or "(0.5 lbs)"
  const m = rawStr.match(/\((\d+(?:\.\d+)?)\s*lbs?\)/i);
  if (m) {
    const parsed = parseFloat(m[1]);
    if (!isNaN(parsed)) return parsed;
  }

  return 0;
}

function parseQuickItemsList(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map(x => (typeof x === 'object' && x !== null) ? (x.slug || x.id || '') : String(x).trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    return val.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function calculateCharacterEncumbrance(charOrHero) {
  if (!charOrHero) {
    return {
      str: 10,
      carriedWeight: 0,
      maxCapacity: 90,
      ratio: 0,
      percent: 0,
      status: 'normal',
      badgeClass: 'normal',
      label: 'Normal',
      penalty: 'Normal Movement'
    };
  }

  // Get Strength (PC or NPC)
  const isNpc = charOrHero.characterType === 'npc' || charOrHero.characterType === 'robos:CRPGNPC' || !!charOrHero.role || (Array.isArray(charOrHero['@type']) && charOrHero['@type'].includes('robos:CRPGNPC'));
  const isEditingInCharSheet = state.activeCharacterSlug && (charOrHero.slug === state.activeCharacterSlug || charOrHero.id === state.activeCharacterSlug);
  
  let str = Number(charOrHero['robos:str'] ?? charOrHero.str);
  if (isNaN(str) || str <= 0) {
    if (isEditingInCharSheet) {
      str = Number((isNpc ? document.getElementById('npc-str')?.value : document.getElementById('attr-str')?.value) || 10);
    } else {
      str = 10;
    }
  }

  const maxCapacity = getCarryingCapacity(str);

  // Sum weights from equipment slots
  const slots = ['mainHand', 'offHand', 'armor', 'helmet', 'cloak', 'boots', 'ring1'];
  let totalWeight = 0;

  slots.forEach(slotKey => {
    const robosKey = `robos:${slotKey}`;
    const slug = charOrHero[robosKey] || charOrHero[slotKey];
    if (slug) {
      totalWeight += getItemWeight(slug);
    }
  });

  // Quick items
  const qItems = charOrHero['robos:quickItems'] || charOrHero.quickItems;
  const qList = parseQuickItemsList(qItems);
  qList.forEach(qSlug => {
    totalWeight += getItemWeight(qSlug);
  });

  // Personal inventory if present
  const personalItems = charOrHero.items || charOrHero['robos:inventory'] || [];
  if (Array.isArray(personalItems)) {
    personalItems.forEach(pIt => {
      const w = getItemWeight(pIt);
      const qty = (typeof pIt === 'object' && pIt !== null) ? (pIt.quantity || 1) : 1;
      totalWeight += w * qty;
    });
  }

  const carriedWeight = Math.round(totalWeight * 10) / 10;
  const ratio = maxCapacity > 0 ? (carriedWeight / maxCapacity) : 0;
  const percent = Math.min(100, Math.round(ratio * 100));

  let status = 'normal';
  let badgeClass = 'normal';
  let label = 'Normal';
  let penalty = `Strength ${str} (Max ${maxCapacity} lbs) • Full Movement Speed`;

  if (ratio > 1.0) {
    status = 'overburdened';
    badgeClass = 'overburdened';
    label = 'Overburdened';
    penalty = `Strength ${str} (Max ${maxCapacity} lbs) • Speed 0 ft (Immobilized)`;
  } else if (ratio > 0.70) {
    status = 'heavy';
    badgeClass = 'heavy';
    label = 'Heavily Encumbered';
    penalty = `Strength ${str} (Max ${maxCapacity} lbs) • Speed -20 ft, Disadvantage on checks`;
  } else if (ratio > 0.35) {
    status = 'light';
    badgeClass = 'light';
    label = 'Light Encumbrance';
    penalty = `Strength ${str} (Max ${maxCapacity} lbs) • Speed -10 ft`;
  }

  return {
    str,
    carriedWeight,
    maxCapacity,
    ratio,
    percent,
    status,
    badgeClass,
    label,
    penalty
  };
}

function updateCampaignEncumbranceMeter(heroOrChar) {
  const enc = calculateCharacterEncumbrance(heroOrChar);
  const weightDisplay = document.getElementById('encumb-weight-display');
  const barFill = document.getElementById('encumb-bar-fill');
  const badge = document.getElementById('encumb-badge-display') || document.getElementById('encumb-status-badge');
  const strDesc = document.getElementById('encumb-str-desc');
  const penalty = document.getElementById('encumb-penalty-desc') || document.getElementById('encumb-penalty-text');

  if (weightDisplay) weightDisplay.textContent = `${enc.carriedWeight.toFixed(1)} / ${enc.maxCapacity.toFixed(1)} lbs`;
  if (barFill) {
    barFill.style.width = `${Math.min(100, enc.percent)}%`;
    barFill.className = `encumbrance-bar-fill ${enc.badgeClass}`;
  }
  if (badge) {
    badge.textContent = enc.label;
    badge.className = `encumbrance-badge ${enc.badgeClass}`;
  }
  if (strDesc) {
    strDesc.textContent = `STR ${enc.str} (Infinity Engine Capacity: ${enc.maxCapacity} lbs)`;
  }
  if (penalty) {
    penalty.textContent = enc.penalty;
  }
}

function findCharacterById(charId) {
  if (!charId) return null;
  const cleanId = String(charId).replace(/^urn:robos:crpg:character:/, '');
  const heroes = getHeroes();
  let found = heroes.find(h => (h.id || h['@id'] || `urn:robos:crpg:character:${h.slug}`) === charId || h.slug === cleanId || h.id === cleanId);
  if (found) return found;
  return (state.characters || []).find(c => (c.id || c['@id'] || `urn:robos:crpg:character:${c.slug}`) === charId || c.slug === cleanId || c.id === cleanId);
}

function setMultiSelectValues(selectEl, values) {
  if (!selectEl) return;
  const valList = (values || []).map(v => String(v).trim().toLowerCase()).filter(Boolean);
  for (const opt of selectEl.options) {
    if (!opt.value) {
      opt.selected = false;
      continue;
    }
    const optVal = opt.value.toLowerCase();
    const optText = (opt.textContent || '').trim().toLowerCase();
    const matched = valList.some(v => 
      v === optVal || 
      v === optText || 
      optVal.includes(v) || 
      optText.includes(v) || 
      v.includes(optVal)
    );
    opt.selected = matched;
  }
}

function getMultiSelectValues(selectEl) {
  if (!selectEl) return [];
  const selected = [];
  for (const opt of selectEl.options) {
    if (opt.selected && opt.value) {
      selected.push(opt.value);
    }
  }
  return selected;
}

function renderQuickItemPills(containerId, selectId, onRemoveCallback) {
  const container = document.getElementById(containerId);
  const select = document.getElementById(selectId);
  if (!container || !select) return;

  const selectedSlugs = getMultiSelectValues(select);
  if (selectedSlugs.length === 0) {
    container.innerHTML = '<span style="font-size:10px; color:var(--text-muted); font-style:italic;">No quick items equipped</span>';
    return;
  }

  container.innerHTML = selectedSlugs.map(slug => {
    const it = (state.items || []).find(x => x.slug === slug);
    const title = it ? (it['dcterms:title'] || it.title || slug) : slug;
    const icon = it ? (it['robos:icon'] || it.icon || '🧪') : '🧪';
    const weight = it ? (it['robos:weight'] ?? it.weight ?? 0) : 0;
    return `
      <span class="quickitem-pill">
        <span>${icon} ${title} (${weight} lbs)</span>
        <span class="quickitem-pill-remove" data-slug="${slug}" title="Remove">&times;</span>
      </span>
    `;
  }).join('');

  container.querySelectorAll('.quickitem-pill-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slugToRemove = btn.getAttribute('data-slug');
      for (const opt of select.options) {
        if (opt.value === slugToRemove) {
          opt.selected = false;
        }
      }
      renderQuickItemPills(containerId, selectId, onRemoveCallback);
      if (onRemoveCallback) onRemoveCallback();
    });
  });
}

function populateEquipmentSelectElement(selectEl, categories, slots, currentVal) {
  if (!selectEl) return;
  const allItems = state.items || [];
  let html = '<option value="">(Empty / None)</option>';

  // If this is a quick-items select, prioritize compatible items from the active character's bag
  if (selectEl.id === 'equip-quickitems' || selectEl.id === 'char-equip-quickitems') {
    const activeHero = selectEl.id === 'equip-quickitems'
      ? (findCharacterById(state.activeEquipHeroId) || state.activeCharacterData)
      : (state.activeCharacterData || findCharacterById(state.activeEquipHeroId));

    const bagItems = getCharacterBag(activeHero);
    const compatibleBagItems = [];
    bagItems.forEach(it => {
      const slug = typeof it === 'object' && it !== null ? (it.slug || it.id) : it;
      const entity = allItems.find(x => x.slug === slug);
      if (slug && isQuickItemCompatible(entity, slug) && !compatibleBagItems.some(c => c.slug === slug)) {
        compatibleBagItems.push({
          slug,
          name: typeof it === 'object' ? (it.name || entity?.['dcterms:title'] || entity?.title || slug) : (entity?.['dcterms:title'] || slug),
          icon: typeof it === 'object' ? (it.icon || entity?.['robos:icon'] || '🧪') : (entity?.['robos:icon'] || '🧪'),
          qty: typeof it === 'object' ? (it.quantity || 1) : 1
        });
      }
    });

    if (compatibleBagItems.length > 0) {
      html += '<optgroup label="Compatible Items in Personal Bag">';
      compatibleBagItems.forEach(it => {
        html += `<option value="${it.slug}">${it.icon} ${it.name} (x${it.qty} in Bag)</option>`;
      });
      html += '</optgroup>';
    }

    const otherConsumables = allItems.filter(it => {
      const slug = it.slug || it['dcterms:identifier'];
      return isQuickItemCompatible(it, slug) && !compatibleBagItems.some(c => c.slug === slug);
    });

    if (otherConsumables.length > 0) {
      html += '<optgroup label="Other Compatible Consumables (Item Catalog)">';
      otherConsumables.forEach(it => {
        const slug = it.slug || it['dcterms:identifier'];
        const title = it['dcterms:title'] || it.title || it.name || slug;
        const icon = it['robos:icon'] || it.icon || '🧪';
        html += `<option value="${slug}">${icon} ${title}</option>`;
      });
      html += '</optgroup>';
    }

    selectEl.innerHTML = html;
    if (currentVal !== undefined && currentVal !== null) {
      const slugs = parseQuickItemsList(currentVal);
      setMultiSelectValues(selectEl, slugs);
    }
    return;
  }

  const matching = allItems.filter(it => {
    const cat = (it['robos:itemCategory'] || it.category || '').toLowerCase();
    const slot = (it['robos:equipSlot'] || it.equipSlot || '').toLowerCase();
    return categories.some(c => cat.includes(c)) || slots.some(s => slot.includes(s));
  });
  const others = allItems.filter(it => !matching.includes(it));

  if (matching.length > 0) {
    html += '<optgroup label="Compatible Items">';
    matching.forEach(it => {
      const slug = it.slug || it['dcterms:identifier'];
      const title = it['dcterms:title'] || it.title || it.name || slug;
      const icon = it['robos:icon'] || it.icon || '📦';
      const weight = it['robos:weight'] ?? it.weight ?? 0;
      html += `<option value="${slug}">${icon} ${title} (${weight} lbs)</option>`;
    });
    html += '</optgroup>';
  }

  if (others.length > 0) {
    html += '<optgroup label="Other Items">';
    others.forEach(it => {
      const slug = it.slug || it['dcterms:identifier'];
      const title = it['dcterms:title'] || it.title || it.name || slug;
      const icon = it['robos:icon'] || it.icon || '📦';
      const weight = it['robos:weight'] ?? it.weight ?? 0;
      html += `<option value="${slug}">${icon} ${title} (${weight} lbs)</option>`;
    });
    html += '</optgroup>';
  }

  selectEl.innerHTML = html;
  if (currentVal !== undefined && currentVal !== null) {
    if (selectEl.multiple) {
      const slugs = parseQuickItemsList(currentVal);
      setMultiSelectValues(selectEl, slugs);
    } else {
      setSelectValue(selectEl, currentVal);
    }
  }
}

function populateEquipmentDropdowns() {
  const slotConfigs = [
    { id: 'equip-mainhand', categories: ['weapon'], slots: ['main_hand'] },
    { id: 'equip-offhand', categories: ['shield', 'weapon'], slots: ['off_hand'] },
    { id: 'equip-armor', categories: ['armor'], slots: ['armor'] },
    { id: 'equip-helmet', categories: ['armor'], slots: ['helmet'] },
    { id: 'equip-cloak', categories: ['accessory'], slots: ['cloak'] },
    { id: 'equip-boots', categories: ['accessory', 'armor'], slots: ['boots'] },
    { id: 'equip-ring1', categories: ['accessory'], slots: ['ring'] },
    { id: 'equip-quickitems', categories: ['consumable', 'tool'], slots: ['quick_item'] }
  ];

  slotConfigs.forEach(({ id, categories, slots }) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = sel.multiple ? getMultiSelectValues(sel) : sel.value;
    populateEquipmentSelectElement(sel, categories, slots, currentVal);
  });
}

function populateCharSheetEquipmentDropdowns(charData) {
  const slotConfigs = [
    { id: 'char-equip-mainhand', categories: ['weapon'], slots: ['main_hand'], val: charData?.['robos:mainHand'] || charData?.mainHand || '' },
    { id: 'char-equip-offhand', categories: ['shield', 'weapon'], slots: ['off_hand'], val: charData?.['robos:offHand'] || charData?.offHand || '' },
    { id: 'char-equip-armor', categories: ['armor'], slots: ['armor'], val: charData?.['robos:armor'] || charData?.armor || '' },
    { id: 'char-equip-cloak', categories: ['accessory'], slots: ['cloak'], val: charData?.['robos:cloak'] || charData?.cloak || '' },
    { id: 'char-equip-quickitems', categories: ['consumable', 'tool'], slots: ['quick_item'], val: charData?.['robos:quickItems'] || charData?.quickItems || [] }
  ];

  slotConfigs.forEach(({ id, categories, slots, val }) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    populateEquipmentSelectElement(sel, categories, slots, val);
  });

  renderQuickItemPills('char-equip-quickitems-pills', 'char-equip-quickitems', () => {
    updateCharSheetEncumbranceMeter();
  });
}

function updateCharSheetEncumbranceMeter() {
  const isNpc = document.getElementById('radio-type-npc')?.checked;
  const strVal = isNpc
    ? Number(document.getElementById('npc-str')?.value || 10)
    : Number(document.getElementById('attr-str')?.value || 10);

  const mainHand = document.getElementById('char-equip-mainhand')?.value || '';
  const offHand = document.getElementById('char-equip-offhand')?.value || '';
  const armor = document.getElementById('char-equip-armor')?.value || '';
  const cloak = document.getElementById('char-equip-cloak')?.value || '';
  const quickItems = getMultiSelectValues(document.getElementById('char-equip-quickitems'));

  const tempChar = {
    str: strVal,
    'robos:str': strVal,
    mainHand,
    offHand,
    armor,
    cloak,
    quickItems
  };

  const enc = calculateCharacterEncumbrance(tempChar);

  const weightDisplay = document.getElementById('char-sheet-encumb-weight');
  const strDisplay = document.getElementById('char-sheet-encumb-str');
  const barFill = document.getElementById('char-sheet-encumb-bar-fill');
  const badge = document.getElementById('char-sheet-encumb-badge');
  const statusEl = document.getElementById('char-sheet-encumb-status');
  const penaltyEl = document.getElementById('char-sheet-encumb-penalty');

  if (weightDisplay) weightDisplay.textContent = `${enc.carriedWeight.toFixed(1)} / ${enc.maxCapacity.toFixed(1)} lbs`;
  if (strDisplay) strDisplay.textContent = `STR ${strVal} (Infinity Engine Max: ${enc.maxCapacity} lbs)`;
  if (barFill) {
    barFill.style.width = `${Math.min(100, enc.percent)}%`;
    barFill.className = `encumbrance-bar-fill ${enc.badgeClass}`;
  }
  if (badge) {
    badge.textContent = enc.label;
    badge.className = `encumbrance-badge ${enc.badgeClass}`;
  }
  if (statusEl) {
    const icons = { normal: '🟢', light: '🟡', heavy: '🟠', overburdened: '🔴' };
    statusEl.textContent = `${icons[enc.status] || '🟢'} ${enc.label}`;
  }
  if (penaltyEl) penaltyEl.textContent = enc.penalty;
}

// ========================================================
// CAMPAIGN PARTY & INVENTORY SUB-VIEW
// ========================================================
function setupInventoryHandlers() {
  const equipHeroSelect = document.getElementById('equip-hero-select');
  equipHeroSelect?.addEventListener('change', (e) => {
    persistEquipSlotsToHero();
    state.activeEquipHeroId = e.target.value;
    loadEquipSlotsForHero(state.activeEquipHeroId);
  });

  const partyLeaderSelect = document.getElementById('party-leader-select');
  partyLeaderSelect?.addEventListener('change', (e) => {
    const gs = getGameState();
    const heroes = getHeroes();
    const leaderIdx = heroes.findIndex(h => (h.id || h['@id']) === e.target.value);
    gs['robos:partyLeaderIndex'] = Math.max(0, leaderIdx);
  });

  const formationSelect = document.getElementById('party-formation-select');
  formationSelect?.addEventListener('change', (e) => {
    const gs = getGameState();
    gs['robos:partyFormation'] = e.target.value;
  });

  const sceneSelect = document.getElementById('inventory-scene-select');
  sceneSelect?.addEventListener('change', (e) => {
    const gs = getGameState();
    gs['robos:currentScene'] = e.target.value;
  });

  document.getElementById('btn-add-stash-item')?.addEventListener('click', addStashItem);

  // Stash view toggle (Grid vs Table)
  document.getElementById('btn-stash-view-grid')?.addEventListener('click', () => {
    document.getElementById('stash-view-grid')?.classList.remove('hidden');
    document.getElementById('stash-view-table')?.classList.add('hidden');
    document.getElementById('btn-stash-view-grid')?.classList.add('active');
    document.getElementById('btn-stash-view-table')?.classList.remove('active');
    renderGraphicalStash();
  });
  document.getElementById('btn-stash-view-table')?.addEventListener('click', () => {
    document.getElementById('stash-view-table')?.classList.remove('hidden');
    document.getElementById('stash-view-grid')?.classList.add('hidden');
    document.getElementById('btn-stash-view-table')?.classList.add('active');
    document.getElementById('btn-stash-view-grid')?.classList.remove('active');
    renderStashTable();
  });

  // Bag item adders
  document.getElementById('btn-add-item-to-bag')?.addEventListener('click', () => {
    const picker = document.getElementById('bag-item-picker');
    if (!picker || !picker.value || !state.activeEquipHeroId) return;
    const hero = findCharacterById(state.activeEquipHeroId);
    if (!hero) return;
    addItemToCharacterBag(hero, picker.value, 1);
    picker.value = '';
    renderCharacterBag(hero, 'camp');
    renderPaperdollSlots(hero, 'camp');
    renderQuickItemSlots(hero, 'camp');
    populateEquipmentDropdowns();
    updateCampaignEncumbranceMeter(hero);
  });

  document.getElementById('btn-char-sheet-add-item')?.addEventListener('click', () => {
    const picker = document.getElementById('char-sheet-bag-picker');
    if (!picker || !picker.value || !state.activeCharacterData) return;
    addItemToCharacterBag(state.activeCharacterData, picker.value, 1);
    picker.value = '';
    renderCharacterBag(state.activeCharacterData, 'char-sheet');
    renderPaperdollSlots(state.activeCharacterData, 'cs');
    renderQuickItemSlots(state.activeCharacterData, 'cs');
    populateCharSheetEquipmentDropdowns(state.activeCharacterData);
    updateCharSheetEncumbranceMeter();
  });

  document.querySelectorAll('.equip-slot-select').forEach(sel => {
    sel.addEventListener('change', () => {
      persistEquipSlotsToHero();
      if (sel.id === 'equip-quickitems') {
        renderQuickItemPills('equip-quickitems-pills', 'equip-quickitems', () => {
          persistEquipSlotsToHero();
        });
      }
    });
  });

  document.getElementById('btn-save-inventory')?.addEventListener('click', saveInventory);
  document.getElementById('btn-hdr-save-inventory')?.addEventListener('click', saveInventory);
}

function renderInventoryViews() {
  const heroes = getHeroes();
  const gs = getGameState();
  const activeParty = new Set(gs['robos:activeParty'] || []);

  // 1. Party Checklist
  const checklist = document.getElementById('party-checklist');
  if (checklist) {
    if (heroes.length === 0) {
      checklist.innerHTML = '<div style="color:var(--text-muted);font-size:11px;">No player characters created.</div>';
    } else {
      checklist.innerHTML = heroes.map(h => {
        const id = h.id || h['@id'] || `urn:robos:crpg:character:${h.slug}`;
        const checked = activeParty.has(id) ? 'checked' : '';
        return `
          <label class="party-checklist-item">
            <input type="checkbox" class="party-check-input" data-id="${id}" ${checked}>
            <span>${h.portrait || '👤'} ${h.name} (${h.class || 'Adventurer'})</span>
          </label>
        `;
      }).join('');

      checklist.querySelectorAll('.party-check-input').forEach(chk => {
        chk.addEventListener('change', () => {
          const selected = [];
          checklist.querySelectorAll('.party-check-input:checked').forEach(c => {
            selected.push(c.getAttribute('data-id'));
          });
          gs['robos:activeParty'] = selected;
          updateLeaderDropdown();
          updateCampaignSummaryStats();
        });
      });
    }
  }

  // 2. Leader & Formation Dropdowns
  updateLeaderDropdown();
  const formSel = document.getElementById('party-formation-select');
  if (formSel) formSel.value = gs['robos:partyFormation'] || 'rank';

  const sceneSel = document.getElementById('inventory-scene-select');
  if (sceneSel) sceneSel.value = gs['robos:currentScene'] || '';

  // 3. Currency & Shared Stash
  const sharedInv = gs['robos:sharedInventory'] || { gold: 0, silver: 0, copper: 0, items: [] };
  const gpInput = document.getElementById('gold-gp');
  const spInput = document.getElementById('gold-sp');
  const cpInput = document.getElementById('gold-cp');
  if (gpInput) gpInput.value = sharedInv.gold ?? 0;
  if (spInput) spInput.value = sharedInv.silver ?? 0;
  if (cpInput) cpInput.value = sharedInv.copper ?? 0;

  populateStashItemPicker();
  renderStashTable();
  renderGraphicalStash();
  populateBagPickers();

  // 4. Character Equipment Dropdown (Player Characters AND NPCs) & Slot Selects
  populateEquipmentDropdowns();
  const equipHeroSelect = document.getElementById('equip-hero-select');
  if (equipHeroSelect) {
    const allChars = state.characters || [];
    const npcs = allChars.filter(c => {
      return c.characterType === 'npc' || c.characterType === 'robos:CRPGNPC' || !!c.role || (Array.isArray(c['@type']) && c['@type'].includes('robos:CRPGNPC'));
    });
    const totalChars = [...heroes, ...npcs];

    if (totalChars.length === 0) {
      equipHeroSelect.innerHTML = '<option value="">(No characters available)</option>';
      state.activeEquipHeroId = null;
      loadEquipSlotsForHero(null);
    } else {
      let html = '';
      if (heroes.length > 0) {
        html += '<optgroup label="Player Characters">';
        heroes.forEach(h => {
          const id = h.id || h['@id'] || `urn:robos:crpg:character:${h.slug}`;
          html += `<option value="${id}">${h.portrait || '👤'} ${h.name || h.slug}</option>`;
        });
        html += '</optgroup>';
      }
      if (npcs.length > 0) {
        html += '<optgroup label="NPCs & Companions">';
        npcs.forEach(n => {
          const id = n.id || n['@id'] || `urn:robos:crpg:character:${n.slug}`;
          html += `<option value="${id}">${n.portrait || '👑'} ${n.name || n.slug} (${n.role || 'NPC'})</option>`;
        });
        html += '</optgroup>';
      }
      equipHeroSelect.innerHTML = html;

      if (!state.activeEquipHeroId || !totalChars.some(c => (c.id || c['@id'] || `urn:robos:crpg:character:${c.slug}` || c.slug) === state.activeEquipHeroId)) {
        const first = totalChars[0];
        state.activeEquipHeroId = first.id || first['@id'] || `urn:robos:crpg:character:${first.slug}` || first.slug;
      }
      equipHeroSelect.value = state.activeEquipHeroId;
      loadEquipSlotsForHero(state.activeEquipHeroId);
    }
  }
}

function updateLeaderDropdown() {
  const heroes = getHeroes();
  const gs = getGameState();
  const activeParty = new Set(gs['robos:activeParty'] || []);
  const leaderSelect = document.getElementById('party-leader-select');
  if (!leaderSelect) return;

  const activeHeroes = heroes.filter(h => activeParty.has(h.id || h['@id'] || `urn:robos:crpg:character:${h.slug}`));
  if (activeHeroes.length === 0) {
    leaderSelect.innerHTML = '<option value="">(No active party members)</option>';
    return;
  }

  leaderSelect.innerHTML = activeHeroes.map(h => {
    const id = h.id || h['@id'] || `urn:robos:crpg:character:${h.slug}`;
    return `<option value="${id}">${h.portrait || '👤'} ${h.name}</option>`;
  }).join('');

  const leaderIdx = gs['robos:partyLeaderIndex'] || 0;
  const currentLeader = heroes[leaderIdx];
  const currentLeaderId = currentLeader ? (currentLeader.id || currentLeader['@id'] || `urn:robos:crpg:character:${currentLeader.slug}`) : null;
  if (currentLeaderId && activeParty.has(currentLeaderId)) {
    leaderSelect.value = currentLeaderId;
  } else if (activeHeroes.length > 0) {
    leaderSelect.value = activeHeroes[0].id || activeHeroes[0]['@id'] || `urn:robos:crpg:character:${activeHeroes[0].slug}`;
  }
}

function setSelectValue(selectEl, val) {
  if (!selectEl) return;
  if (!val) {
    selectEl.value = '';
    return;
  }
  const cleanVal = String(val).trim();
  let found = false;
  for (const opt of selectEl.options) {
    if (opt.value === cleanVal || (cleanVal && opt.value && (cleanVal.includes(opt.value) || opt.value.includes(cleanVal)))) {
      selectEl.value = opt.value;
      found = true;
      break;
    }
    if (opt.textContent && opt.textContent.toLowerCase().includes(cleanVal.toLowerCase())) {
      selectEl.value = opt.value;
      found = true;
      break;
    }
  }
  if (!found && cleanVal) {
    const opt = document.createElement('option');
    opt.value = cleanVal;
    opt.textContent = cleanVal;
    selectEl.appendChild(opt);
    selectEl.value = cleanVal;
  }
}

// ========================================================
// RESIZABLE SPLIT DIVIDERS
// ========================================================
function setupSplitDividers() {
  const dividers = document.querySelectorAll('.split-divider');
  dividers.forEach(divider => {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startPrevSize = 0;
    let startNextSize = 0;
    const targetDirection = divider.getAttribute('data-target') || 'prev';
    const isCol = divider.classList.contains('col-resize');
    const minSize = parseInt(divider.getAttribute('data-min') || '160', 10);
    const maxSize = parseInt(divider.getAttribute('data-max') || '850', 10);

    const onPointerDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      try {
        divider.setPointerCapture(e.pointerId);
      } catch (err) {}
      divider.classList.add('active');
      document.body.classList.add('resizing');

      const prevEl = divider.previousElementSibling;
      const nextEl = divider.nextElementSibling;
      if (prevEl) {
        startPrevSize = isCol ? prevEl.getBoundingClientRect().width : prevEl.getBoundingClientRect().height;
      }
      if (nextEl) {
        startNextSize = isCol ? nextEl.getBoundingClientRect().width : nextEl.getBoundingClientRect().height;
      }
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const delta = isCol ? deltaX : deltaY;

      const prevEl = divider.previousElementSibling;
      const nextEl = divider.nextElementSibling;

      if (targetDirection === 'prev' && prevEl) {
        let newSize = Math.max(minSize, Math.min(maxSize, startPrevSize + delta));
        if (isCol) {
          prevEl.style.width = `${newSize}px`;
          prevEl.style.flex = `0 0 ${newSize}px`;
        } else {
          prevEl.style.height = `${newSize}px`;
          prevEl.style.flex = `0 0 ${newSize}px`;
        }
      } else if (targetDirection === 'next' && nextEl) {
        let newSize = Math.max(minSize, Math.min(maxSize, startNextSize - delta));
        if (isCol) {
          nextEl.style.width = `${newSize}px`;
          nextEl.style.flex = `0 0 ${newSize}px`;
        } else {
          nextEl.style.height = `${newSize}px`;
          nextEl.style.flex = `0 0 ${newSize}px`;
        }
      }
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        divider.releasePointerCapture(e.pointerId);
      } catch (err) {}
      divider.classList.remove('active');
      document.body.classList.remove('resizing');
    };

    divider.addEventListener('pointerdown', onPointerDown);
    divider.addEventListener('pointermove', onPointerMove);
    divider.addEventListener('pointerup', onPointerUp);
    divider.addEventListener('pointercancel', onPointerUp);
  });
}

// ========================================================
// GRAPHICAL BAG & PAPERDOLL INVENTORY HELPERS
// ========================================================
function getCharacterBag(hero) {
  if (!hero) return [];
  let bag = hero['robos:inventory'] || hero.inventory;
  if (!Array.isArray(bag)) {
    bag = [];
    hero['robos:inventory'] = bag;
    hero.inventory = bag;
  }
  return bag;
}

function normalizeCharacterBag(hero) {
  const bag = getCharacterBag(hero);
  const slots = new Array(16).fill(null);
  bag.forEach((it, idx) => {
    if (!it) return;
    const isObj = typeof it === 'object' && it !== null;
    const slug = isObj ? (it.slug || it.id || '') : it;
    if (!slug) return;
    const slotIdx = isObj && typeof it.slot === 'number' && it.slot >= 0 && it.slot < 16 ? it.slot : idx;
    const itemEntity = (state.items || []).find(x => x.slug === slug);
    const itemObj = {
      slot: slotIdx,
      slug: slug,
      name: isObj ? (it.name || it.title || slug) : (itemEntity ? (itemEntity['dcterms:title'] || itemEntity.title) : slug),
      icon: isObj ? (it.icon || '📦') : (itemEntity ? (itemEntity['robos:icon'] || itemEntity.icon || '📦') : '📦'),
      category: isObj ? (it.category || 'misc') : (itemEntity ? (itemEntity['robos:itemCategory'] || itemEntity.category || 'misc') : 'misc'),
      quantity: isObj ? (it.quantity || 1) : 1,
      weight: itemEntity ? (itemEntity['robos:weightLbs'] || itemEntity.weightLbs || itemEntity['robos:weight'] || itemEntity.weight || 1) : 1
    };
    if (slotIdx >= 0 && slotIdx < 16 && !slots[slotIdx]) {
      slots[slotIdx] = itemObj;
    } else {
      const freeIdx = slots.findIndex(s => s === null);
      if (freeIdx !== -1) {
        itemObj.slot = freeIdx;
        slots[freeIdx] = itemObj;
      }
    }
  });
  return slots;
}

function syncCharacterBagBack(hero, slots) {
  if (!hero) return [];
  const cleanBag = slots.filter(Boolean).map((it, idx) => ({
    ...it,
    slot: it.slot !== undefined ? it.slot : idx
  }));
  hero['robos:inventory'] = cleanBag;
  hero.inventory = cleanBag;
  return cleanBag;
}

function isQuickItemCompatible(itemEntity, slug) {
  if (!itemEntity && !slug) return false;
  const cat = (itemEntity?.['robos:itemCategory'] || itemEntity?.category || '').toLowerCase();
  const eqSlot = (itemEntity?.['robos:equipSlot'] || itemEntity?.equipSlot || '').toLowerCase();
  const title = (itemEntity?.['dcterms:title'] || itemEntity?.title || slug || '').toLowerCase();
  const s = (slug || '').toLowerCase();

  if (eqSlot === 'quick_item' || cat === 'consumable' || cat === 'potion' || cat === 'scroll' || cat === 'wand' || cat === 'herb') {
    return true;
  }
  const keywords = ['potion', 'scroll', 'herb', 'salve', 'elixir', 'flask', 'torch', 'remedy', 'heal', 'antidote', 'fairy_water', 'bomb', 'draught'];
  return keywords.some(k => s.includes(k) || title.includes(k));
}

function isPaperdollSlotCompatible(slotName, itemEntity, slug) {
  if (!itemEntity && !slug) return false;
  const cat = (itemEntity?.['robos:itemCategory'] || itemEntity?.category || '').toLowerCase();
  const eq = (itemEntity?.['robos:equipSlot'] || itemEntity?.equipSlot || '').toLowerCase();
  const s = (slug || '').toLowerCase();

  switch (slotName) {
    case 'mainhand':
      return eq === 'main_hand' || eq === 'two_hand' || eq === 'versatile' || cat === 'weapon' || s.includes('sword') || s.includes('staff') || s.includes('blade') || s.includes('bow') || s.includes('dagger') || s.includes('axe') || s.includes('club');
    case 'offhand':
      return eq === 'off_hand' || eq === 'shield' || cat === 'shield' || s.includes('shield') || s.includes('buckler') || (cat === 'weapon' && (s.includes('dagger') || s.includes('shortsword')));
    case 'armor':
      return eq === 'armor' || cat === 'armor' || s.includes('mail') || s.includes('plate') || s.includes('leather') || s.includes('robe') || s.includes('armor');
    case 'helmet':
      return eq === 'helmet' || cat === 'helmet' || s.includes('helm') || s.includes('hat') || s.includes('cap') || s.includes('crown') || s.includes('circlet');
    case 'cloak':
      return eq === 'cloak' || cat === 'cloak' || s.includes('cloak') || s.includes('cape') || s.includes('mantle');
    case 'boots':
      return eq === 'boots' || cat === 'boots' || s.includes('boots') || s.includes('greaves') || s.includes('shoes') || s.includes('treads');
    case 'ring1':
      return eq === 'ring1' || eq === 'ring' || eq === 'accessory' || cat === 'accessory' || cat === 'ring' || s.includes('ring') || s.includes('amulet') || s.includes('pendant') || s.includes('token');
    default:
      return true;
  }
}

function getHeroEquipSlotValue(hero, slotKey) {
  if (!hero) return '';
  switch (slotKey) {
    case 'mainhand': return hero['robos:mainHand'] || hero.mainHand || '';
    case 'offhand': return hero['robos:offHand'] || hero.offHand || '';
    case 'armor': return hero['robos:armor'] || hero.armor || '';
    case 'helmet': return hero['robos:helmet'] || hero.helmet || '';
    case 'cloak': return hero['robos:cloak'] || hero.cloak || '';
    case 'boots': return hero['robos:boots'] || hero.boots || '';
    case 'ring1': return hero['robos:ring1'] || hero.ring1 || '';
    default: return '';
  }
}

function setHeroEquipSlotValue(hero, slotKey, val) {
  if (!hero) return;
  const v = val || '';
  switch (slotKey) {
    case 'mainhand': hero['robos:mainHand'] = v; hero.mainHand = v; break;
    case 'offhand': hero['robos:offHand'] = v; hero.offHand = v; break;
    case 'armor': hero['robos:armor'] = v; hero.armor = v; break;
    case 'helmet': hero['robos:helmet'] = v; hero.helmet = v; break;
    case 'cloak': hero['robos:cloak'] = v; hero.cloak = v; break;
    case 'boots': hero['robos:boots'] = v; hero.boots = v; break;
    case 'ring1': hero['robos:ring1'] = v; hero.ring1 = v; break;
  }
  const campSel = document.getElementById(`equip-${slotKey}`);
  if (campSel) campSel.value = v;
  const csSel = document.getElementById(`char-equip-${slotKey}`);
  if (csSel) csSel.value = v;
}

function addItemToCharacterBag(hero, slug, qty = 1) {
  if (!hero || !slug) return false;
  const slots = normalizeCharacterBag(hero);
  const itemEntity = (state.items || []).find(x => x.slug === slug);
  const name = itemEntity ? (itemEntity['dcterms:title'] || itemEntity.title || slug) : slug;
  const icon = itemEntity ? (itemEntity['robos:icon'] || itemEntity.icon || '📦') : '📦';
  const category = itemEntity ? (itemEntity['robos:itemCategory'] || itemEntity.category || 'misc') : 'misc';
  const weight = itemEntity ? (itemEntity['robos:weightLbs'] || itemEntity.weightLbs || itemEntity['robos:weight'] || 1) : 1;

  // Check stackable item in existing slot
  const isStackable = category === 'consumable' || category === 'potion' || category === 'herb' || category === 'scroll' || category === 'ammo';
  if (isStackable) {
    const existing = slots.find(s => s && s.slug === slug);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + qty;
      syncCharacterBagBack(hero, slots);
      return true;
    }
  }

  // Find first empty slot
  const freeIdx = slots.findIndex(s => s === null);
  if (freeIdx === -1) {
    setStatus(`⚠️ Inventory Bag Full (16/16 slots). Cannot add ${name}.`);
    return false;
  }

  slots[freeIdx] = {
    slot: freeIdx,
    slug,
    name,
    icon,
    category,
    quantity: qty,
    weight
  };
  syncCharacterBagBack(hero, slots);
  return true;
}

function removeItemFromCharacterBag(hero, slotIndex, qty = 1) {
  if (!hero || slotIndex < 0 || slotIndex >= 16) return null;
  const slots = normalizeCharacterBag(hero);
  const it = slots[slotIndex];
  if (!it) return null;

  let removedItem = null;
  if ((it.quantity || 1) <= qty) {
    removedItem = { ...it };
    slots[slotIndex] = null;
  } else {
    it.quantity -= qty;
    removedItem = { ...it, quantity: qty };
  }
  syncCharacterBagBack(hero, slots);
  return removedItem;
}

function moveItemFromBagToStash(hero, slotIndex) {
  if (!hero) return;
  const removed = removeItemFromCharacterBag(hero, slotIndex);
  if (!removed) return;

  const gs = getGameState();
  if (!gs['robos:sharedInventory']) gs['robos:sharedInventory'] = { gold: 0, silver: 0, copper: 0, items: [] };
  if (!Array.isArray(gs['robos:sharedInventory'].items)) gs['robos:sharedInventory'].items = [];

  const items = gs['robos:sharedInventory'].items;
  const existing = items.find(x => typeof x === 'object' && x !== null && x.slug === removed.slug);
  if (existing) {
    existing.quantity = (existing.quantity || 1) + (removed.quantity || 1);
  } else {
    items.push({
      slug: removed.slug,
      name: removed.name,
      icon: removed.icon,
      category: removed.category,
      quantity: removed.quantity || 1
    });
  }

  renderGraphicalStash();
  renderStashTable();
  renderCharacterBag(hero, 'camp');
  renderCharacterBag(hero, 'char-sheet');
  updateCampaignEncumbranceMeter(hero);
  updateCharSheetEncumbranceMeter();
  persistInventoryFromUI();
  setStatus(`Moved ${removed.name} from bag to party stash.`);
}

function moveItemFromStashToBag(stashIndex, hero, targetSlotIndex) {
  if (!hero) return;
  const gs = getGameState();
  const items = gs['robos:sharedInventory']?.items || [];
  if (stashIndex < 0 || stashIndex >= items.length) return;

  const stashItem = items[stashIndex];
  const isObj = typeof stashItem === 'object' && stashItem !== null;
  const slug = isObj ? (stashItem.slug || stashItem.id) : stashItem;
  if (!slug) return;

  const added = addItemToCharacterBag(hero, slug, 1);
  if (!added) return;

  if (isObj && (stashItem.quantity || 1) > 1) {
    stashItem.quantity -= 1;
  } else {
    items.splice(stashIndex, 1);
  }

  renderGraphicalStash();
  renderStashTable();
  renderCharacterBag(hero, 'camp');
  renderCharacterBag(hero, 'char-sheet');
  updateCampaignEncumbranceMeter(hero);
  updateCharSheetEncumbranceMeter();
  persistInventoryFromUI();
  setStatus(`Moved item from party stash to ${hero.name}'s bag.`);
}

function equipItemFromBag(hero, slotKey, bagSlotIndex) {
  if (!hero) return;
  const slots = normalizeCharacterBag(hero);
  const bagItem = slots[bagSlotIndex];
  if (!bagItem) return;

  const itemEntity = (state.items || []).find(x => x.slug === bagItem.slug);
  if (!isPaperdollSlotCompatible(slotKey, itemEntity, bagItem.slug)) {
    setStatus(`⚠️ Cannot equip ${bagItem.name} in ${slotKey} (Incompatible slot).`);
    return;
  }

  const currentEquippedSlug = getHeroEquipSlotValue(hero, slotKey);

  // Equip new item
  setHeroEquipSlotValue(hero, slotKey, bagItem.slug);

  // If slot already had an item, swap it back to the bag
  if (currentEquippedSlug) {
    const curEntity = (state.items || []).find(x => x.slug === currentEquippedSlug);
    slots[bagSlotIndex] = {
      slot: bagSlotIndex,
      slug: currentEquippedSlug,
      name: curEntity ? (curEntity['dcterms:title'] || curEntity.title || currentEquippedSlug) : currentEquippedSlug,
      icon: curEntity ? (curEntity['robos:icon'] || curEntity.icon || '📦') : '📦',
      category: curEntity ? (curEntity['robos:itemCategory'] || curEntity.category || 'misc') : 'misc',
      quantity: 1,
      weight: curEntity ? (curEntity['robos:weightLbs'] || curEntity.weightLbs || 1) : 1
    };
  } else {
    slots[bagSlotIndex] = null;
  }

  syncCharacterBagBack(hero, slots);
  renderPaperdollSlots(hero, 'camp');
  renderPaperdollSlots(hero, 'cs');
  renderCharacterBag(hero, 'camp');
  renderCharacterBag(hero, 'char-sheet');
  updateCampaignEncumbranceMeter(hero);
  updateCharSheetEncumbranceMeter();
  persistInventoryFromUI();
  setStatus(`Equipped ${bagItem.name} in ${slotKey}.`);
}

function unequipItemToBag(hero, slotKey) {
  if (!hero) return;
  const currentSlug = getHeroEquipSlotValue(hero, slotKey);
  if (!currentSlug) return;

  const added = addItemToCharacterBag(hero, currentSlug, 1);
  if (!added) {
    setStatus(`⚠️ Cannot unequip: Inventory bag is full! Free a slot first.`);
    return;
  }

  setHeroEquipSlotValue(hero, slotKey, '');
  renderPaperdollSlots(hero, 'camp');
  renderPaperdollSlots(hero, 'cs');
  renderCharacterBag(hero, 'camp');
  renderCharacterBag(hero, 'char-sheet');
  updateCampaignEncumbranceMeter(hero);
  updateCharSheetEncumbranceMeter();
  persistInventoryFromUI();
  setStatus(`Unequipped ${currentSlug} to bag.`);
}

function equipQuickItemFromBag(hero, quickIndex, slug) {
  if (!hero || !slug || quickIndex < 0 || quickIndex >= 3) return;
  const itemEntity = (state.items || []).find(x => x.slug === slug);
  if (!isQuickItemCompatible(itemEntity, slug)) {
    setStatus(`⚠️ Incompatible quick item: ${slug} is not a potion, scroll, herb or consumable.`);
    return;
  }

  let quickItems = parseQuickItemsList(hero['robos:quickItems'] || hero.quickItems || '');
  while (quickItems.length <= quickIndex) quickItems.push('');
  quickItems[quickIndex] = slug;

  hero['robos:quickItems'] = quickItems;
  hero.quickItems = quickItems;

  const qSel = document.getElementById('equip-quickitems');
  if (qSel) setMultiSelectValues(qSel, quickItems);
  const csQSel = document.getElementById('char-equip-quickitems');
  if (csQSel) setMultiSelectValues(csQSel, quickItems);

  renderQuickItemSlots(hero, 'camp');
  renderQuickItemSlots(hero, 'cs');
  persistInventoryFromUI();
  setStatus(`Set Quick Slot ${quickIndex + 1} to ${itemEntity?.title || slug}.`);
}

function removeQuickItemAtIndex(hero, quickIndex) {
  if (!hero || quickIndex < 0) return;
  let quickItems = parseQuickItemsList(hero['robos:quickItems'] || hero.quickItems || '');
  if (quickIndex < quickItems.length) {
    quickItems[quickIndex] = '';
  }
  quickItems = quickItems.filter(Boolean);
  hero['robos:quickItems'] = quickItems;
  hero.quickItems = quickItems;

  const qSel = document.getElementById('equip-quickitems');
  if (qSel) setMultiSelectValues(qSel, quickItems);
  const csQSel = document.getElementById('char-equip-quickitems');
  if (csQSel) setMultiSelectValues(csQSel, quickItems);

  renderQuickItemSlots(hero, 'camp');
  renderQuickItemSlots(hero, 'cs');
  persistInventoryFromUI();
  setStatus(`Cleared Quick Slot ${quickIndex + 1}.`);
}

// ========================================================
// RENDERERS FOR GRAPHICAL STASH, BAG, PAPERDOLL & QUICK SLOTS
// ========================================================
function renderGraphicalStash() {
  const container = document.getElementById('stash-items-grid');
  if (!container) return;

  const gs = getGameState();
  if (!gs['robos:sharedInventory']) gs['robos:sharedInventory'] = { gold: 0, silver: 0, copper: 0, items: [] };
  const items = gs['robos:sharedInventory'].items || [];

  if (items.length === 0) {
    container.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; color:var(--text-muted); font-size:11px; padding:20px;">Party stash is empty. Drag items from bags or drop items here.</div>';
    return;
  }

  container.innerHTML = items.map((it, idx) => {
    const isObj = typeof it === 'object' && it !== null;
    const slug = isObj ? (it.slug || it.id || '') : it;
    const itemEntity = (state.items || []).find(x => x.slug === slug);
    const name = isObj ? (it.name || it.title || slug) : (itemEntity ? (itemEntity['dcterms:title'] || itemEntity.title) : slug);
    const icon = isObj ? (it.icon || '📦') : (itemEntity ? (itemEntity['robos:icon'] || itemEntity.icon || '📦') : '📦');
    const qty = isObj ? (it.quantity || 1) : 1;
    const weight = itemEntity ? (itemEntity['robos:weightLbs'] || itemEntity.weightLbs || itemEntity['robos:weight'] || 1) : 1;

    return `
      <div class="inventory-slot" data-stash-idx="${idx}" data-slug="${slug}">
        <div class="item-tile" draggable="true" data-stash-idx="${idx}" data-slug="${slug}" title="${name} (${qty}) • ${weight} lbs">
          <span class="item-tile-weight">${weight}#</span>
          <span class="item-tile-icon">${icon}</span>
          <span class="item-tile-name">${name}</span>
          ${qty > 1 ? `<span class="item-tile-qty">x${qty}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Dragstart from stash
  container.querySelectorAll('.item-tile').forEach(tile => {
    tile.addEventListener('dragstart', (e) => {
      const idx = parseInt(tile.getAttribute('data-stash-idx'), 10);
      const slug = tile.getAttribute('data-slug');
      e.dataTransfer.setData('application/json', JSON.stringify({
        source: 'stash',
        stashIndex: idx,
        slug
      }));
      e.dataTransfer.effectAllowed = 'move';
      tile.classList.add('dragging');
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
    });
  });

  // Stash accepts drops from bags or paperdoll
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    container.classList.add('drag-over');
  });
  container.addEventListener('dragleave', () => {
    container.classList.remove('drag-over');
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    container.classList.remove('drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.source === 'bag') {
        const hero = (state.activeEquipHeroId ? findCharacterById(state.activeEquipHeroId) : null) || state.activeCharacterData;
        if (hero) moveItemFromBagToStash(hero, data.slotIndex);
      } else if (data.source === 'equip') {
        const hero = (state.activeEquipHeroId ? findCharacterById(state.activeEquipHeroId) : null) || state.activeCharacterData;
        if (hero) {
          const slug = getHeroEquipSlotValue(hero, data.slotKey);
          if (slug) {
            setHeroEquipSlotValue(hero, data.slotKey, '');
            const gs = getGameState();
            if (!gs['robos:sharedInventory']) gs['robos:sharedInventory'] = { gold: 0, silver: 0, copper: 0, items: [] };
            gs['robos:sharedInventory'].items.push({ slug, quantity: 1 });
            renderGraphicalStash();
            renderStashTable();
            renderPaperdollSlots(hero, 'camp');
            renderPaperdollSlots(hero, 'cs');
            updateCampaignEncumbranceMeter(hero);
            updateCharSheetEncumbranceMeter();
            persistInventoryFromUI();
          }
        }
      } else if (data.source === 'item-catalog') {
        const gs = getGameState();
        if (!gs['robos:sharedInventory']) gs['robos:sharedInventory'] = { gold: 0, silver: 0, copper: 0, items: [] };
        gs['robos:sharedInventory'].items.push({ slug: data.slug, quantity: 1 });
        renderGraphicalStash();
        renderStashTable();
        persistInventoryFromUI();
      }
    } catch (err) {
      console.warn('Error handling drop on stash grid:', err);
    }
  });
}

function renderCharacterBag(hero, prefix = 'camp') {
  const gridId = prefix === 'char-sheet' ? 'char-sheet-bag-grid' : 'camp-char-bag-grid';
  const titleId = prefix === 'char-sheet' ? 'char-sheet-bag-title' : 'camp-bag-title';
  const countId = prefix === 'char-sheet' ? 'char-sheet-bag-count' : 'camp-bag-count';
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (!hero) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; color:var(--text-muted); font-size:11px; padding:20px;">Select a character to view inventory bag.</div>';
    const countEl = document.getElementById(countId);
    if (countEl) countEl.textContent = '0 / 16';
    return;
  }

  const slots = normalizeCharacterBag(hero);
  const filledCount = slots.filter(Boolean).length;

  const titleEl = document.getElementById(titleId);
  if (titleEl) titleEl.textContent = `🎒 ${hero.name || 'Character'}'s Inventory Bag (16 Slots)`;

  const countEl = document.getElementById(countId);
  if (countEl) {
    countEl.textContent = `${filledCount} / 16`;
    countEl.className = filledCount >= 16 ? 'counter-badge danger' : 'counter-badge';
  }

  grid.innerHTML = slots.map((it, idx) => {
    if (!it) {
      return `
        <div class="inventory-slot empty" data-slot-idx="${idx}">
          <span class="slot-number">${idx + 1}</span>
        </div>
      `;
    }
    return `
      <div class="inventory-slot" data-slot-idx="${idx}" data-slug="${it.slug}">
        <div class="item-tile" draggable="true" data-slot-idx="${idx}" data-slug="${it.slug}" title="${it.name} (${it.quantity}) • ${it.weight} lbs\nClick/Drag to equip, swap or transfer">
          <span class="item-tile-weight">${it.weight}#</span>
          <span class="item-tile-icon">${it.icon}</span>
          <span class="item-tile-name">${it.name}</span>
          ${it.quantity > 1 ? `<span class="item-tile-qty">x${it.quantity}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Wire drag & drop on bag slots
  grid.querySelectorAll('.inventory-slot').forEach(slotEl => {
    const slotIdx = parseInt(slotEl.getAttribute('data-slot-idx'), 10);
    const tile = slotEl.querySelector('.item-tile');

    if (tile) {
      tile.addEventListener('dragstart', (e) => {
        const slug = tile.getAttribute('data-slug');
        e.dataTransfer.setData('application/json', JSON.stringify({
          source: 'bag',
          slotIndex: slotIdx,
          slug,
          heroId: hero.id || hero.slug
        }));
        e.dataTransfer.effectAllowed = 'move';
        tile.classList.add('dragging');
      });
      tile.addEventListener('dragend', () => {
        tile.classList.remove('dragging');
      });
    }

    slotEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slotEl.classList.add('drag-over');
    });

    slotEl.addEventListener('dragleave', () => {
      slotEl.classList.remove('drag-over');
    });

    slotEl.addEventListener('drop', (e) => {
      e.preventDefault();
      slotEl.classList.remove('drag-over');
      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.source === 'stash') {
          moveItemFromStashToBag(data.stashIndex, hero, slotIdx);
        } else if (data.source === 'bag') {
          // Swap or move within bag
          if (data.slotIndex !== slotIdx) {
            const currentSlots = normalizeCharacterBag(hero);
            const temp = currentSlots[slotIdx];
            currentSlots[slotIdx] = currentSlots[data.slotIndex];
            currentSlots[data.slotIndex] = temp;
            if (currentSlots[slotIdx]) currentSlots[slotIdx].slot = slotIdx;
            if (currentSlots[data.slotIndex]) currentSlots[data.slotIndex].slot = data.slotIndex;
            syncCharacterBagBack(hero, currentSlots);
            renderCharacterBag(hero, prefix);
            updateCampaignEncumbranceMeter(hero);
            updateCharSheetEncumbranceMeter();
            persistInventoryFromUI();
          }
        } else if (data.source === 'equip') {
          unequipItemToBag(hero, data.slotKey);
        } else if (data.source === 'item-catalog') {
          addItemToCharacterBag(hero, data.slug, 1);
          renderCharacterBag(hero, prefix);
          updateCampaignEncumbranceMeter(hero);
          updateCharSheetEncumbranceMeter();
          persistInventoryFromUI();
        }
      } catch (err) {
        console.warn('Error dropping on bag slot:', err);
      }
    });
  });
}

function renderPaperdollSlots(hero, prefix = 'camp') {
  const slotKeys = ['helmet', 'cloak', 'mainhand', 'armor', 'offhand', 'ring1', 'boots'];
  const prefixId = prefix === 'cs' ? 'cs-pd-drop-' : 'pd-drop-';

  slotKeys.forEach(slotKey => {
    const dropzone = document.getElementById(`${prefixId}${slotKey}`);
    if (!dropzone) return;

    const currentSlug = getHeroEquipSlotValue(hero, slotKey);
    const itemEntity = currentSlug ? (state.items || []).find(x => x.slug === currentSlug) : null;

    if (currentSlug) {
      const name = itemEntity ? (itemEntity['dcterms:title'] || itemEntity.title || currentSlug) : currentSlug;
      const icon = itemEntity ? (itemEntity['robos:icon'] || itemEntity.icon || '📦') : '📦';
      dropzone.innerHTML = `
        <div class="equipped-item-chip" draggable="true" data-slot="${slotKey}" data-slug="${currentSlug}" title="${name}\nDrag to unequip or move to bag">
          <span>${icon} ${name}</span>
          <button type="button" class="equipped-item-unequip-btn" data-slot="${slotKey}" title="Unequip">×</button>
        </div>
      `;
      const chip = dropzone.querySelector('.equipped-item-chip');
      chip?.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
          source: 'equip',
          slotKey,
          slug: currentSlug
        }));
        e.dataTransfer.effectAllowed = 'move';
      });
      dropzone.querySelector('.equipped-item-unequip-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        unequipItemToBag(hero, slotKey);
      });
    } else {
      dropzone.innerHTML = `<span class="slot-empty-placeholder">Empty</span>`;
    }

    // Dropzone listeners
    dropzone.ondragover = (e) => {
      e.preventDefault();
      dropzone.parentElement.classList.add('drag-over');
    };
    dropzone.ondragleave = () => {
      dropzone.parentElement.classList.remove('drag-over', 'drag-invalid');
    };
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.parentElement.classList.remove('drag-over', 'drag-invalid');
      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.source === 'bag') {
          equipItemFromBag(hero, slotKey, data.slotIndex);
        } else if (data.source === 'item-catalog') {
          const it = (state.items || []).find(x => x.slug === data.slug);
          if (isPaperdollSlotCompatible(slotKey, it, data.slug)) {
            setHeroEquipSlotValue(hero, slotKey, data.slug);
            renderPaperdollSlots(hero, prefix);
            updateCampaignEncumbranceMeter(hero);
            updateCharSheetEncumbranceMeter();
            persistInventoryFromUI();
          } else {
            setStatus(`⚠️ ${data.slug} is incompatible with ${slotKey}.`);
          }
        }
      } catch (err) {
        console.warn('Error dropping on paperdoll slot:', err);
      }
    };
  });
}

function renderQuickItemSlots(hero, prefix = 'camp') {
  const prefixDrop = prefix === 'cs' ? 'cs-quick-drop-' : 'camp-quick-drop-';
  const quickItems = parseQuickItemsList(hero?.['robos:quickItems'] || hero?.quickItems || '');

  [0, 1, 2].forEach(slotIdx => {
    const dropzone = document.getElementById(`${prefixDrop}${slotIdx}`);
    if (!dropzone) return;

    const slug = quickItems[slotIdx] || '';
    const itemEntity = slug ? (state.items || []).find(x => x.slug === slug) : null;

    if (slug) {
      const name = itemEntity ? (itemEntity['dcterms:title'] || itemEntity.title || slug) : slug;
      const icon = itemEntity ? (itemEntity['robos:icon'] || itemEntity.icon || '🧪') : '🧪';
      dropzone.innerHTML = `
        <div class="equipped-item-chip" draggable="true" data-quick-slot="${slotIdx}" data-slug="${slug}" title="${name}\nClick × to remove">
          <span>${icon} ${name}</span>
          <button type="button" class="equipped-item-unequip-btn" data-quick-slot="${slotIdx}" title="Clear Quick Slot">×</button>
        </div>
      `;
      dropzone.querySelector('.equipped-item-unequip-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        removeQuickItemAtIndex(hero, slotIdx);
      });
    } else {
      dropzone.innerHTML = `<span class="slot-empty-placeholder">+ Drop Potion/Scroll</span>`;
    }

    // Dropzone listeners
    dropzone.ondragover = (e) => {
      e.preventDefault();
      dropzone.parentElement.classList.add('drag-over');
    };
    dropzone.ondragleave = () => {
      dropzone.parentElement.classList.remove('drag-over', 'drag-invalid');
    };
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.parentElement.classList.remove('drag-over', 'drag-invalid');
      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.slug) {
          equipQuickItemFromBag(hero, slotIdx, data.slug);
        }
      } catch (err) {
        console.warn('Error dropping on quick slot:', err);
      }
    };
  });
}

function populateBagPickers() {
  const pickers = [
    document.getElementById('bag-item-picker'),
    document.getElementById('char-sheet-bag-picker')
  ];

  const items = state.items || [];
  let html = '<option value="">(Add item directly to bag...)</option>';
  items.forEach(it => {
    const slug = it.slug || it['dcterms:identifier'];
    const title = it['dcterms:title'] || it.title || it.name || slug;
    const cat = it['robos:itemCategory'] || it.category || 'misc';
    const icon = it['robos:icon'] || it.icon || '📦';
    const weight = it['robos:weightLbs'] || it.weightLbs || it['robos:weight'] || 1;
    html += `<option value="${slug}">${icon} ${title} (${cat}, ${weight} lbs)</option>`;
  });

  pickers.forEach(picker => {
    if (picker) {
      const cur = picker.value;
      picker.innerHTML = html;
      if (cur) picker.value = cur;
    }
  });
}

function addSpellToActiveCharacter(spellSlug) {
  if (!spellSlug) return;
  const abilityMatch = normalizeAbilitySlug(spellSlug);
  if (abilityMatch) {
    addAbilityToActiveCharacter(abilityMatch);
    setStatus(`"${spellSlug}" is a class ability/feature and was routed to Special Abilities & Feats.`);
    return;
  }
  if (!state.activeCharPreparedSpells) state.activeCharPreparedSpells = [];
  if (!state.activeCharPreparedSpells.includes(spellSlug)) {
    state.activeCharPreparedSpells.push(spellSlug);
    renderCharSpellChips();
    updateCharSpellStats();
  }
}

function addAbilityToActiveCharacter(abilitySlug) {
  if (!abilitySlug) return;
  const canonical = normalizeAbilitySlug(abilitySlug) || abilitySlug;
  if (!state.activeCharAssignedAbilities) state.activeCharAssignedAbilities = [];
  if (!state.activeCharAssignedAbilities.includes(canonical)) {
    state.activeCharAssignedAbilities.push(canonical);
    renderCharAbilityChips();
  }
}

function setupDragAndDrop() {
  // Setup spell chips and ability chips dropzones for character sheet
  const spellChipsContainer = document.getElementById('char-spells-chips');
  if (spellChipsContainer) {
    spellChipsContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      spellChipsContainer.classList.add('drag-over');
    });
    spellChipsContainer.addEventListener('dragleave', () => {
      spellChipsContainer.classList.remove('drag-over');
    });
    spellChipsContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      spellChipsContainer.classList.remove('drag-over');
      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.source === 'spell' && data.slug) {
          addSpellToActiveCharacter(data.slug);
        } else if (data.source === 'ability' && data.slug) {
          addAbilityToActiveCharacter(data.slug);
        }
      } catch (err) {}
    });
  }

  const abilityChipsContainer = document.getElementById('char-abilities-chips');
  if (abilityChipsContainer) {
    abilityChipsContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      abilityChipsContainer.classList.add('drag-over');
    });
    abilityChipsContainer.addEventListener('dragleave', () => {
      abilityChipsContainer.classList.remove('drag-over');
    });
    abilityChipsContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      abilityChipsContainer.classList.remove('drag-over');
      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.source === 'ability' && data.slug) {
          addAbilityToActiveCharacter(data.slug);
        } else if (data.source === 'spell' && data.slug) {
          addSpellToActiveCharacter(data.slug);
        }
      } catch (err) {}
    });
  }
}

function loadEquipSlotsForHero(heroId) {
  const hero = findCharacterById(heroId);
  if (!hero) {
    ['equip-mainhand', 'equip-offhand', 'equip-armor', 'equip-helmet', 'equip-cloak', 'equip-boots', 'equip-ring1'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.value = '';
    });
    const qSel = document.getElementById('equip-quickitems');
    if (qSel) {
      for (const opt of qSel.options) opt.selected = false;
    }
    renderQuickItemPills('equip-quickitems-pills', 'equip-quickitems', null);
    renderPaperdollSlots(null, 'camp');
    renderQuickItemSlots(null, 'camp');
    renderCharacterBag(null, 'camp');
    updateCampaignEncumbranceMeter(null);
    return;
  }

  setSelectValue(document.getElementById('equip-mainhand'), hero['robos:mainHand'] || hero.mainHand || '');
  setSelectValue(document.getElementById('equip-offhand'), hero['robos:offHand'] || hero.offHand || '');
  setSelectValue(document.getElementById('equip-armor'), hero['robos:armor'] || hero.armor || '');
  setSelectValue(document.getElementById('equip-helmet'), hero['robos:helmet'] || hero.helmet || '');
  setSelectValue(document.getElementById('equip-cloak'), hero['robos:cloak'] || hero.cloak || '');
  setSelectValue(document.getElementById('equip-boots'), hero['robos:boots'] || hero.boots || '');
  setSelectValue(document.getElementById('equip-ring1'), hero['robos:ring1'] || hero.ring1 || '');

  const qItems = parseQuickItemsList(hero['robos:quickItems'] || hero.quickItems || '');
  const qSel = document.getElementById('equip-quickitems');
  setMultiSelectValues(qSel, qItems);

  renderQuickItemPills('equip-quickitems-pills', 'equip-quickitems', () => {
    persistEquipSlotsToHero();
  });

  renderPaperdollSlots(hero, 'camp');
  renderQuickItemSlots(hero, 'camp');
  renderCharacterBag(hero, 'camp');
  populateBagPickers();

  updateCampaignEncumbranceMeter(hero);
}

function persistEquipSlotsToHero() {
  if (!state.activeEquipHeroId) return;
  const hero = findCharacterById(state.activeEquipHeroId);
  if (!hero) return;

  const mainHand = document.getElementById('equip-mainhand')?.value || '';
  const offHand = document.getElementById('equip-offhand')?.value || '';
  const armor = document.getElementById('equip-armor')?.value || '';
  const helmet = document.getElementById('equip-helmet')?.value || '';
  const cloak = document.getElementById('equip-cloak')?.value || '';
  const boots = document.getElementById('equip-boots')?.value || '';
  const ring1 = document.getElementById('equip-ring1')?.value || '';

  const quickSelect = document.getElementById('equip-quickitems');
  const quickItems = getMultiSelectValues(quickSelect);
  const quickVal = quickItems.length <= 1 ? (quickItems[0] || '') : quickItems;

  hero.mainHand = mainHand;
  hero.offHand = offHand;
  hero.armor = armor;
  hero.helmet = helmet;
  hero.cloak = cloak;
  hero.boots = boots;
  hero.ring1 = ring1;
  hero.quickItems = quickVal;

  hero['robos:mainHand'] = mainHand;
  hero['robos:offHand'] = offHand;
  hero['robos:armor'] = armor;
  hero['robos:helmet'] = helmet;
  hero['robos:cloak'] = cloak;
  hero['robos:boots'] = boots;
  hero['robos:ring1'] = ring1;
  hero['robos:quickItems'] = quickVal;

  const char = (state.characters || []).find(c => (c.id || c['@id'] || `urn:robos:crpg:character:${c.slug}` || c.slug) === state.activeEquipHeroId);
  if (char && char !== hero) {
    char.mainHand = mainHand;
    char.offHand = offHand;
    char.armor = armor;
    char.helmet = helmet;
    char.cloak = cloak;
    char.boots = boots;
    char.ring1 = ring1;
    char.quickItems = quickVal;
    char['robos:mainHand'] = mainHand;
    char['robos:offHand'] = offHand;
    char['robos:armor'] = armor;
    char['robos:helmet'] = helmet;
    char['robos:cloak'] = cloak;
    char['robos:boots'] = boots;
    char['robos:ring1'] = ring1;
    char['robos:quickItems'] = quickVal;
  }

  renderQuickItemPills('equip-quickitems-pills', 'equip-quickitems', () => {
    persistEquipSlotsToHero();
  });

  updateCampaignEncumbranceMeter(hero);
}

function populateStashItemPicker() {
  const picker = document.getElementById('stash-item-picker');
  if (!picker) return;
  const currentVal = picker.value;
  let html = '<option value="">(Select item to add...)</option>';
  (state.items || []).forEach(it => {
    const slug = it.slug || it['dcterms:identifier'];
    const title = it['dcterms:title'] || it.title || it.name || slug;
    const cat = it['robos:itemCategory'] || it.category || 'misc';
    const icon = it['robos:icon'] || it.icon || '📦';
    html += `<option value="${slug}">${icon} ${title} (${cat})</option>`;
  });
  picker.innerHTML = html;
  if (currentVal) picker.value = currentVal;
}

function renderStashTable() {
  const tbody = document.getElementById('stash-items-tbody');
  if (!tbody) return;
  const gs = getGameState();
  if (!gs['robos:sharedInventory']) gs['robos:sharedInventory'] = { gold: 0, silver: 0, copper: 0, items: [] };
  const items = gs['robos:sharedInventory'].items || [];

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); font-size:11px; padding:12px;">No items in party stash.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map((it, idx) => {
    const isObj = typeof it === 'object' && it !== null;
    const slug = isObj ? (it.slug || it.id || '') : it;
    const itemEntity = (state.items || []).find(x => x.slug === slug);
    const name = isObj ? (it.name || it.title || slug) : (itemEntity ? (itemEntity['dcterms:title'] || itemEntity.title) : slug);
    const icon = isObj ? (it.icon || '📦') : (itemEntity ? (itemEntity['robos:icon'] || itemEntity.icon || '📦') : '📦');
    const category = isObj ? (it.category || 'misc') : (itemEntity ? (itemEntity['robos:itemCategory'] || itemEntity.category || 'misc') : 'misc');
    const qty = isObj ? (it.quantity || 1) : 1;

    return `
      <tr data-index="${idx}" data-slug="${slug}">
        <td style="font-size: 14px; text-align: center;">${icon}</td>
        <td style="font-weight: 500;">${name}</td>
        <td><span class="item-badge-pill">${category}</span></td>
        <td style="text-align: center;"><span class="stash-qty-badge">${qty}</span></td>
        <td style="text-align: center;">
          <button type="button" class="stash-remove-btn" data-index="${idx}" title="Remove item">×</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.stash-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      if (!isNaN(idx) && idx >= 0 && idx < items.length) {
        items.splice(idx, 1);
        renderStashTable();
        renderGraphicalStash();
        persistInventoryFromUI();
      }
    });
  });
}

function addStashItem() {
  const picker = document.getElementById('stash-item-picker');
  const qtyInput = document.getElementById('stash-item-qty');
  if (!picker || !picker.value) return;

  const slug = picker.value;
  const qty = Math.max(1, parseInt(qtyInput?.value || '1', 10));
  const itemEntity = (state.items || []).find(x => x.slug === slug);
  const name = itemEntity ? (itemEntity['dcterms:title'] || itemEntity.title || slug) : slug;
  const icon = itemEntity ? (itemEntity['robos:icon'] || itemEntity.icon || '📦') : '📦';
  const category = itemEntity ? (itemEntity['robos:itemCategory'] || itemEntity.category || 'misc') : 'misc';

  const gs = getGameState();
  if (!gs['robos:sharedInventory']) gs['robos:sharedInventory'] = { gold: 0, silver: 0, copper: 0, items: [] };
  if (!Array.isArray(gs['robos:sharedInventory'].items)) gs['robos:sharedInventory'].items = [];

  const items = gs['robos:sharedInventory'].items;
  const existing = items.find(it => (typeof it === 'object' && it !== null && it.slug === slug));
  if (existing) {
    existing.quantity = (existing.quantity || 1) + qty;
  } else {
    items.push({
      id: itemEntity ? (itemEntity['@id'] || `urn:robos:crpg:item:${slug}`) : `urn:robos:crpg:item:${slug}`,
      slug,
      name,
      icon,
      category,
      quantity: qty
    });
  }

  picker.value = '';
  if (qtyInput) qtyInput.value = '1';
  renderStashTable();
  renderGraphicalStash();
  persistInventoryFromUI();
}

function persistInventoryFromUI() {
  const gs = getGameState();
  if (!gs['robos:sharedInventory']) gs['robos:sharedInventory'] = {};
  gs['robos:sharedInventory'].gold = Number(document.getElementById('gold-gp')?.value || 0);
  gs['robos:sharedInventory'].silver = Number(document.getElementById('gold-sp')?.value || 0);
  gs['robos:sharedInventory'].copper = Number(document.getElementById('gold-cp')?.value || 0);

  if (!Array.isArray(gs['robos:sharedInventory'].items)) {
    gs['robos:sharedInventory'].items = [];
  }

  const rawItems = gs['robos:sharedInventory'].items.map(it => typeof it === 'string' ? it : (it.name || it.slug)).join('\n');
  const txtArea = document.getElementById('shared-items-textarea');
  if (txtArea) txtArea.value = rawItems;

  persistEquipSlotsToHero();
}

async function saveInventory() {
  try {
    setStatus('Saving party inventory and equipment...');
    persistInventoryFromUI();

    // 1. Persist active player character equipment slots to disk
    if (state.activeEquipHeroId) {
      const hero = (state.characters || []).find(c => (c.id || c['@id'] || `urn:robos:crpg:character:${c.slug}` || c.slug) === state.activeEquipHeroId) ||
                   getHeroes().find(h => (h.id || h['@id'] || `urn:robos:crpg:character:${h.slug}` || h.slug) === state.activeEquipHeroId);
      if (hero && hero.slug) {
        const charPayload = {
          ...(hero.raw || {}),
          ...hero,
          mainHand: hero.mainHand || '',
          offHand: hero.offHand || '',
          armor: hero.armor || '',
          helmet: hero.helmet || '',
          cloak: hero.cloak || '',
          boots: hero.boots || '',
          ring1: hero.ring1 || '',
          quickItems: hero.quickItems || '',
          'robos:mainHand': hero.mainHand || '',
          'robos:offHand': hero.offHand || '',
          'robos:armor': hero.armor || '',
          'robos:helmet': hero.helmet || '',
          'robos:cloak': hero.cloak || '',
          'robos:boots': hero.boots || '',
          'robos:ring1': hero.ring1 || '',
          'robos:quickItems': hero.quickItems || '',
          'robos:inventory': getCharacterBag(hero),
          inventory: getCharacterBag(hero),
        };
        const resChar = await window.robos.saveCharacter({ slug: hero.slug, data: charPayload });
        if (!resChar.success) {
          console.warn('Could not save character equipment:', resChar.error);
        }
      }
    }

    // 2. Persist shared inventory, currency, party formation & scene to campaign
    const campSlug = state.activeCampaignSlug || document.getElementById('camp-slug')?.value?.trim() || 'campaign';
    const gs = getGameState();
    const campData = state.activeCampaignData || {
      '@type': ['robos:CRPGCampaign', 'schema:CreativeWork'],
      'dcterms:title': document.getElementById('camp-title')?.value?.trim() || 'New Campaign',
      'dcterms:description': document.getElementById('camp-desc')?.value?.trim() || '',
      'robos:setting': document.getElementById('camp-setting')?.value?.trim() || '',
      'robos:ruleSet': document.getElementById('camp-ruleset')?.value || 'D&D 5e SRD',
      'robos:difficulty': document.getElementById('camp-difficulty')?.value || 'Core Rules',
      'robos:startingMap': document.getElementById('camp-starting-scene')?.value || '',
      'robos:maps': (state.maps || []).map(m => m.id || `urn:robos:crpg:battle-map:${m.slug}`),
      'robos:characters': (state.characters || []).map(c => c.id || `urn:robos:crpg:character:${c.slug}`),
    };
    campData.gameState = gs;
    campData['robos:gameState'] = gs;
    campData['robos:heroes'] = getHeroes();

    const resCamp = await window.robos.saveCampaign({
      slug: campSlug,
      data: campData
    });

    if (resCamp.success) {
      state.activeCampaignSlug = campSlug;
      state.activeCampaignData = campData;
      updateCampaignSummaryStats();
      setStatus('Saved inventory, party configuration & equipment!', resCamp.filePath);
      return { success: true };
    } else {
      setStatus(`Failed to save inventory: ${resCamp.error}`);
      return { success: false, error: resCamp.error };
    }
  } catch (err) {
    console.error('Error saving inventory:', err);
    setStatus(`Error saving inventory: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ========================================================
// MODULE 3: ITEM STUDIO (robos:CRPGItem)
// ========================================================
function setupItemHandlers() {
  const hdrSelect = document.getElementById('header-item-select');
  hdrSelect?.addEventListener('change', (e) => {
    if (e.target.value) {
      loadItemForm(e.target.value);
    } else {
      closeItem();
    }
  });

  document.getElementById('btn-header-new-item')?.addEventListener('click', createNewItem);
  document.getElementById('btn-sidebar-new-item')?.addEventListener('click', createNewItem);
  document.getElementById('btn-empty-new-item')?.addEventListener('click', createNewItem);

  document.getElementById('btn-header-close-item')?.addEventListener('click', closeItem);
  document.getElementById('btn-close-item')?.addEventListener('click', closeItem);

  document.getElementById('btn-header-save-item')?.addEventListener('click', saveCurrentItem);
  document.getElementById('btn-save-item')?.addEventListener('click', saveCurrentItem);

  document.getElementById('btn-header-delete-item')?.addEventListener('click', deleteCurrentItem);
  document.getElementById('btn-delete-item')?.addEventListener('click', deleteCurrentItem);

  const searchInput = document.getElementById('item-search-input');
  searchInput?.addEventListener('input', () => {
    renderItemsList();
  });

  const filterRow = document.getElementById('item-category-filters');
  filterRow?.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      filterRow.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.itemFilter = pill.getAttribute('data-category') || 'all';
      renderItemsList();
    });
  });

  const categorySelect = document.getElementById('item-category');
  categorySelect?.addEventListener('change', () => {
    updateItemCategorySections();
  });

  const itemNameInput = document.getElementById('item-name');
  itemNameInput?.addEventListener('input', () => {
    if (!state.activeItemSlug) {
      const slugInput = document.getElementById('item-slug');
      if (slugInput) {
        slugInput.value = itemNameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      }
    }
  });
}

function updateItemCategorySections() {
  const cat = document.getElementById('item-category')?.value || 'weapon';
  const secWeapon = document.getElementById('section-item-weapon');
  const secArmor = document.getElementById('section-item-armor');
  const secConsumable = document.getElementById('section-item-consumable');
  const equipSlotSel = document.getElementById('item-equip-slot');

  if (secWeapon) secWeapon.classList.toggle('hidden', cat !== 'weapon');
  if (secArmor) secArmor.classList.toggle('hidden', cat !== 'armor' && cat !== 'shield');
  if (secConsumable) secConsumable.classList.toggle('hidden', cat !== 'consumable');

  // Auto-suggest equip slot if creating or currently none
  if (equipSlotSel) {
    if (cat === 'weapon' && (equipSlotSel.value === 'none' || !equipSlotSel.value)) {
      equipSlotSel.value = 'main_hand';
    } else if (cat === 'armor' && (equipSlotSel.value === 'none' || !equipSlotSel.value)) {
      equipSlotSel.value = 'armor';
    } else if (cat === 'shield' && (equipSlotSel.value === 'none' || !equipSlotSel.value)) {
      equipSlotSel.value = 'off_hand';
    } else if (cat === 'consumable' && (equipSlotSel.value === 'none' || !equipSlotSel.value)) {
      equipSlotSel.value = 'quick_item';
    }
  }
}

async function loadAllItems() {
  try {
    const res = await window.robos.listItems();
    if (res.success) {
      state.items = res.items || [];
      updateItemsHeaderSelect();
      renderItemsList();
      populateEquipmentDropdowns();
      populateStashItemPicker();
      if (state.activeEquipHeroId) {
        loadEquipSlotsForHero(state.activeEquipHeroId);
      }
      if (state.activeCharacterData) {
        populateCharSheetEquipmentDropdowns(state.activeCharacterData);
        updateCharSheetEncumbranceMeter();
      }
    }
  } catch (err) {
    console.error('Error loading items list:', err);
  }
}

function updateItemsHeaderSelect() {
  const hdrSelect = document.getElementById('header-item-select');
  if (!hdrSelect) return;
  hdrSelect.innerHTML = '<option value="">(No item selected)</option>' +
    (state.items || []).map(it => {
      const slug = it.slug || it['dcterms:identifier'];
      const title = it['dcterms:title'] || it.title || it.name || slug;
      const icon = it['robos:icon'] || it.icon || '📦';
      return `<option value="${slug}">${icon} ${title}</option>`;
    }).join('');

  if (state.activeItemSlug) {
    hdrSelect.value = state.activeItemSlug;
  }
}

function renderItemsList() {
  const listEl = document.getElementById('items-list');
  const countEl = document.getElementById('items-count');
  if (!listEl) return;

  const query = (document.getElementById('item-search-input')?.value || '').toLowerCase().trim();
  const filter = state.itemFilter || 'all';

  const filtered = (state.items || []).filter(it => {
    const cat = (it['robos:itemCategory'] || it.category || 'misc').toLowerCase();
    const title = (it['dcterms:title'] || it.title || it.name || it.slug || '').toLowerCase();
    const slug = (it.slug || it['dcterms:identifier'] || '').toLowerCase();
    const slot = (it['robos:equipSlot'] || it.equipSlot || '').toLowerCase();

    if (filter !== 'all' && cat !== filter) {
      return false;
    }
    if (query) {
      return title.includes(query) || slug.includes(query) || cat.includes(query) || slot.includes(query);
    }
    return true;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">No items match query.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(it => {
    const slug = it.slug || it['dcterms:identifier'];
    const title = it['dcterms:title'] || it.title || it.name || slug;
    const icon = it['robos:icon'] || it.icon || '📦';
    const cat = it['robos:itemCategory'] || it.category || 'misc';
    const cost = it['robos:cost'] ?? it.cost ?? 0;
    const isSelected = slug === state.activeItemSlug;

    return `
      <div class="item-list-item ${isSelected ? 'active' : ''}" data-slug="${slug}" draggable="true">
        <span class="item-list-icon">${icon}</span>
        <div class="item-list-meta">
          <div class="item-list-title">${title}</div>
          <div class="item-list-sub">
            <span class="item-badge-pill">${cat}</span>
            <span class="item-cost-text">${cost} GP</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.item-list-item').forEach(itemEl => {
    itemEl.addEventListener('dragstart', (e) => {
      const slug = itemEl.getAttribute('data-slug');
      const itemEntity = (state.items || []).find(x => x.slug === slug);
      e.dataTransfer.setData('application/json', JSON.stringify({
        source: 'item-catalog',
        slug,
        name: itemEntity?.['dcterms:title'] || itemEntity?.title || slug,
        icon: itemEntity?.['robos:icon'] || itemEntity?.icon || '📦',
        category: itemEntity?.['robos:itemCategory'] || itemEntity?.category || 'misc'
      }));
      e.dataTransfer.effectAllowed = 'copy';
      itemEl.classList.add('dragging');
    });
    itemEl.addEventListener('dragend', () => {
      itemEl.classList.remove('dragging');
    });
    itemEl.addEventListener('click', () => {
      const slug = itemEl.getAttribute('data-slug');
      loadItemForm(slug);
    });
  });
}

function showEmptyItemState() {
  const emptyState = document.getElementById('item-empty-state');
  const formContainer = document.getElementById('item-form-container');
  if (emptyState) emptyState.classList.remove('hidden');
  if (formContainer) formContainer.classList.add('hidden');
}

async function loadItemForm(slug) {
  try {
    setStatus(`Loading item ${slug}...`);
    const res = await window.robos.loadItem(slug);
    if (!res.success) {
      setStatus(`Failed to load item: ${res.error}`);
      return;
    }

    state.activeItemSlug = slug;
    state.activeItemData = res.item;

    const it = res.item;
    document.getElementById('item-name').value = it['dcterms:title'] || it.title || it.name || '';
    document.getElementById('item-slug').value = it['dcterms:identifier'] || it.slug || slug;
    document.getElementById('item-icon').value = it['robos:icon'] || it.icon || '📦';
    document.getElementById('item-category').value = it['robos:itemCategory'] || it.category || 'weapon';
    document.getElementById('item-equip-slot').value = it['robos:equipSlot'] || it.equipSlot || 'none';
    document.getElementById('item-cost').value = it['robos:cost'] ?? it.cost ?? 0;
    document.getElementById('item-weight').value = it['robos:weight'] ?? it.weight ?? 1;
    document.getElementById('item-rarity').value = it['robos:rarity'] || it.rarity || 'common';
    document.getElementById('item-desc').value = it['dcterms:description'] || it.description || '';

    // Weapon
    document.getElementById('item-damage').value = it['robos:damageDice'] || it.damageDice || '';
    document.getElementById('item-damage-type').value = it['robos:damageType'] || it.damageType || 'slashing';

    // Armor
    document.getElementById('item-ac-bonus').value = it['robos:acBonus'] ?? it.acBonus ?? 10;

    // Consumable
    document.getElementById('item-effect').value = it['robos:effect'] || it.effect || '';

    updateItemCategorySections();

    const emptyState = document.getElementById('item-empty-state');
    const formContainer = document.getElementById('item-form-container');
    if (emptyState) emptyState.classList.add('hidden');
    if (formContainer) formContainer.classList.remove('hidden');

    const formTitle = document.getElementById('item-form-title');
    if (formTitle) formTitle.textContent = `Item Blueprint: ${it['dcterms:title'] || slug}`;

    const hdrSelect = document.getElementById('header-item-select');
    if (hdrSelect) hdrSelect.value = slug;

    renderItemsList();
    setStatus(`Item loaded: ${slug}`, res.filePath);
  } catch (err) {
    console.error('Error loading item:', err);
    setStatus(`Error loading item: ${err.message}`);
  }
}

function createNewItem() {
  state.activeItemSlug = null;
  state.activeItemData = null;

  document.getElementById('item-name').value = '';
  document.getElementById('item-slug').value = '';
  document.getElementById('item-icon').value = '📦';
  document.getElementById('item-category').value = 'weapon';
  document.getElementById('item-equip-slot').value = 'main_hand';
  document.getElementById('item-cost').value = '10';
  document.getElementById('item-weight').value = '1';
  document.getElementById('item-rarity').value = 'common';
  document.getElementById('item-desc').value = '';

  document.getElementById('item-damage').value = '1d6';
  document.getElementById('item-damage-type').value = 'slashing';
  document.getElementById('item-ac-bonus').value = '10';
  document.getElementById('item-effect').value = '';

  updateItemCategorySections();

  const emptyState = document.getElementById('item-empty-state');
  const formContainer = document.getElementById('item-form-container');
  if (emptyState) emptyState.classList.add('hidden');
  if (formContainer) formContainer.classList.remove('hidden');

  const formTitle = document.getElementById('item-form-title');
  if (formTitle) formTitle.textContent = 'Create New Item Blueprint';

  const hdrSelect = document.getElementById('header-item-select');
  if (hdrSelect) hdrSelect.value = '';

  document.getElementById('item-name')?.focus();
  setStatus('Authoring new item blueprint...');
}

function closeItem() {
  state.activeItemSlug = null;
  state.activeItemData = null;
  showEmptyItemState();
  const hdrSelect = document.getElementById('header-item-select');
  if (hdrSelect) hdrSelect.value = '';
  renderItemsList();
  setStatus('Closed item blueprint.');
}

async function saveCurrentItem() {
  const name = document.getElementById('item-name')?.value.trim() || 'New Item';
  let slug = document.getElementById('item-slug')?.value.trim();
  if (!slug) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `item-${Date.now().toString().slice(-4)}`;
    document.getElementById('item-slug').value = slug;
  }

  const category = document.getElementById('item-category')?.value || 'misc';
  const equipSlot = document.getElementById('item-equip-slot')?.value || 'none';
  const cost = Number(document.getElementById('item-cost')?.value || 0);
  const weight = Number(document.getElementById('item-weight')?.value || 1);
  const rarity = document.getElementById('item-rarity')?.value || 'common';
  const icon = document.getElementById('item-icon')?.value.trim() || '📦';
  const desc = document.getElementById('item-desc')?.value.trim() || '';

  const itemPayload = {
    '@context': {
      robos: 'urn:robos:',
      schema: 'http://schema.org/',
      dcterms: 'http://purl.org/dc/terms/',
      oslc_am: 'http://open-services.net/ns/am#'
    },
    '@id': `urn:robos:crpg:item:${slug}`,
    '@type': ['robos:CRPGItem', 'schema:Product', 'oslc_am:Resource'],
    'dcterms:identifier': slug,
    'dcterms:title': name,
    'dcterms:description': desc,
    'robos:icon': icon,
    'robos:itemCategory': category,
    'robos:equipSlot': equipSlot,
    'robos:cost': cost,
    'robos:weight': weight,
    'robos:rarity': rarity,
  };

  if (category === 'weapon') {
    itemPayload['robos:damageDice'] = document.getElementById('item-damage')?.value.trim() || '1d6';
    itemPayload['robos:damageType'] = document.getElementById('item-damage-type')?.value || 'slashing';
  } else if (category === 'armor' || category === 'shield') {
    itemPayload['robos:acBonus'] = Number(document.getElementById('item-ac-bonus')?.value || 0);
  } else if (category === 'consumable') {
    itemPayload['robos:effect'] = document.getElementById('item-effect')?.value.trim() || '';
  }

  try {
    setStatus(`Saving item ${slug}...`);
    const res = await window.robos.saveItem({ slug, data: itemPayload });
    if (res.success) {
      state.activeItemSlug = res.slug;
      state.activeItemData = itemPayload;
      setStatus(`Saved item successfully!`, res.filePath);
      await loadAllItems();
      const formTitle = document.getElementById('item-form-title');
      if (formTitle) formTitle.textContent = `Item Blueprint: ${name}`;
    } else {
      setStatus(`Failed to save item: ${res.error}`);
    }
  } catch (err) {
    console.error('Error saving item:', err);
    setStatus(`Error saving item: ${err.message}`);
  }
}

async function deleteCurrentItem() {
  if (!state.activeItemSlug) return;
  if (!confirm(`Are you sure you want to delete item '${state.activeItemSlug}'?`)) return;

  try {
    const res = await window.robos.deleteItem(state.activeItemSlug);
    if (res.success) {
      setStatus(`Deleted item: ${state.activeItemSlug}`);
      closeItem();
      await loadAllItems();
    } else {
      setStatus(`Failed to delete item: ${res.error}`);
    }
  } catch (err) {
    console.error('Error deleting item:', err);
    setStatus(`Error deleting item: ${err.message}`);
  }
}

// ========================================================
// CHARACTER SHEET SPELLBOOK, ABILITIES & AI DIRECTIVE HELPERS
// ========================================================
function populateCharSpellsDropdown() {
  const sel = document.getElementById('char-spells-select');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">(Select a spell to prepare...)</option>' +
    (state.spells || []).map(s => {
      const lvlStr = s.level === 0 ? 'Cantrip' : `L${s.level}`;
      return `<option value="${s.slug}">[${lvlStr}] ${s.name} (${s.school || 'Magic'})</option>`;
    }).join('');
  if (currentVal) sel.value = currentVal;
}

function populateCharAbilitiesDropdown() {
  const sel = document.getElementById('char-abilities-select');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">(Select an ability or feat...)</option>' +
    (state.abilities || []).map(a => {
      const actionLabel = (a.actionType || 'action').replace('_', ' ');
      return `<option value="${a.slug}">[${actionLabel.toUpperCase()}] ${a.name} (${a.category || 'Feat'})</option>`;
    }).join('');
  if (currentVal) sel.value = currentVal;
}

function renderCharSpellChips() {
  const container = document.getElementById('char-spells-chips');
  if (!container) return;

  const spells = state.activeCharPreparedSpells || [];

  // Strict safety check: if any ability slug leaked into preparedSpells, migrate it immediately
  const abilityLeaks = spells.filter(s => normalizeAbilitySlug(s));
  if (abilityLeaks.length > 0) {
    state.activeCharPreparedSpells = spells.filter(s => !normalizeAbilitySlug(s));
    if (!state.activeCharAssignedAbilities) state.activeCharAssignedAbilities = [];
    abilityLeaks.forEach(slug => {
      const canonical = normalizeAbilitySlug(slug);
      if (canonical && !state.activeCharAssignedAbilities.includes(canonical)) {
        state.activeCharAssignedAbilities.push(canonical);
      }
    });
    renderCharAbilityChips();
    renderCharSpellChips();
    return;
  }

  if (spells.length === 0) {
    const charClass = (document.getElementById('hero-class')?.value || state.activeCharacterData?.class || '').toLowerCase();
    const isNonCaster = ['rogue', 'fighter', 'barbarian'].includes(charClass);
    if (isNonCaster) {
      container.innerHTML = `<span style="color: var(--text-muted); font-size: 11px;">Non-spellcasting class (${charClass.toUpperCase()}). Class features and special abilities (e.g. Sneak Attack, Cunning Action) are managed in the Abilities section below.</span>`;
    } else {
      container.innerHTML = '<span style="color: var(--text-muted); font-size: 11px;">No spells prepared in spellbook.</span>';
    }
    const compField = document.getElementById('hero-spells');
    if (compField) compField.value = '';
    return;
  }

  container.innerHTML = spells.map((slug, idx) => {
    const spell = (state.spells || []).find(s => s.slug === slug) || { name: slug, level: '?', school: 'evocation' };
    const lvlStr = spell.level === 0 ? '0' : spell.level;
    const schoolClass = (spell.school || 'evocation').toLowerCase();
    return `
      <div class="spell-chip" data-index="${idx}" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 188, 212, 0.15); border: 1px solid rgba(0, 188, 212, 0.4); border-radius: 4px; padding: 2px 8px; font-size: 11px;">
        <span style="color: #00bcd4;">✨</span>
        <span style="font-weight: 500;">${spell.name}</span>
        <span class="spell-school-badge ${schoolClass}" style="font-size: 9px; padding: 1px 4px;">${lvlStr}</span>
        <button type="button" class="btn-remove-spell-chip" data-index="${idx}" style="background: none; border: none; color: #ff5252; cursor: pointer; padding: 0 2px; font-size: 12px; font-weight: bold;" title="Remove spell">×</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-remove-spell-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.getAttribute('data-index'));
      state.activeCharPreparedSpells.splice(idx, 1);
      renderCharSpellChips();
      updateCharSpellStats();
    });
  });

  const compField = document.getElementById('hero-spells');
  if (compField) compField.value = spells.join(', ');
}

function renderCharAbilityChips() {
  const container = document.getElementById('char-abilities-chips');
  if (!container) return;

  const abilities = state.activeCharAssignedAbilities || [];
  if (abilities.length === 0) {
    container.innerHTML = '<span style="color: var(--text-muted); font-size: 11px;">No special abilities assigned.</span>';
    const countEl = document.getElementById('char-ability-count');
    if (countEl) countEl.textContent = '0';
    return;
  }

  container.innerHTML = abilities.map((slug, idx) => {
    const ability = (state.abilities || []).find(a => a.slug === slug) || { name: slug, actionType: 'action' };
    const actionType = ability.actionType || 'action';
    return `
      <div class="ability-chip" data-index="${idx}" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 152, 0, 0.15); border: 1px solid rgba(255, 152, 0, 0.4); border-radius: 4px; padding: 2px 8px; font-size: 11px;">
        <span style="color: #ff9800;">⚡</span>
        <span style="font-weight: 500;">${ability.name}</span>
        <span class="action-type-badge ${actionType}" style="font-size: 9px; padding: 1px 4px;">${actionType.replace('_', ' ')}</span>
        <button type="button" class="btn-remove-ability-chip" data-index="${idx}" style="background: none; border: none; color: #ff5252; cursor: pointer; padding: 0 2px; font-size: 12px; font-weight: bold;" title="Remove ability">×</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-remove-ability-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.getAttribute('data-index'));
      state.activeCharAssignedAbilities.splice(idx, 1);
      renderCharAbilityChips();
    });
  });

  const countEl = document.getElementById('char-ability-count');
  if (countEl) countEl.textContent = abilities.length;
}

function updateCharSpellStats() {
  const charClass = (document.getElementById('hero-class')?.value || 'Wizard').toLowerCase();
  const prof = Number(document.getElementById('vital-prof')?.value || 2);
  let castingAttr = 'int';
  if (['cleric', 'druid', 'ranger'].includes(charClass)) {
    castingAttr = 'wis';
  } else if (['paladin', 'sorcerer', 'warlock', 'bard'].includes(charClass)) {
    castingAttr = 'cha';
  }

  const attrVal = Number(document.getElementById(`attr-${castingAttr}`)?.value || 10);
  const mod = Math.floor((attrVal - 10) / 2);
  const spellDC = 8 + prof + mod;
  const spellAttack = prof + mod;

  const dcEl = document.getElementById('char-spell-dc');
  if (dcEl) dcEl.textContent = spellDC;
  const atkEl = document.getElementById('char-spell-attack');
  if (atkEl) atkEl.textContent = spellAttack >= 0 ? `+${spellAttack}` : `${spellAttack}`;
  const countEl = document.getElementById('char-spell-count');
  if (countEl) countEl.textContent = (state.activeCharPreparedSpells || []).length;
}

function updateCharRoleBadge(role) {
  const badge = document.getElementById('char-ai-role-badge');
  if (!badge) return;
  badge.textContent = (role || 'striker').toUpperCase();
  badge.className = `ai-role-badge ${role || 'striker'}`;
}

function loadCharDirectiveUI(dir = {}) {
  const controller = dir.controller || 'infinity_ai';
  const role = dir.role || 'striker';
  const priority = dir.targetPriority || dir.priority || 'nearest';
  const movement = dir.movement || 'advance';
  const healFraction = dir.healThreshold ?? 0.5;
  const potionFraction = dir.potionThreshold ?? 0.4;
  const useSpells = dir.useSpells !== false;
  const friendlyFire = !!dir.allowFriendlyFire;

  const rx = dir.reactions || {};
  const shield = rx.shield !== false;
  const opp = rx.opportunityAttack !== false && rx.opportunity !== false;
  const counter = !!rx.counterspell;
  const dodge = !!rx.uncannyDodge;
  const flurry = !!rx.defensiveFlurry;

  const ctrlSel = document.getElementById('char-ai-controller');
  if (ctrlSel) ctrlSel.value = controller;

  const roleSel = document.getElementById('char-ai-role');
  if (roleSel) roleSel.value = role;

  const prioSel = document.getElementById('char-ai-priority');
  if (prioSel) prioSel.value = priority;

  const moveSel = document.getElementById('char-ai-movement');
  if (moveSel) moveSel.value = movement;

  const healPct = Math.round(healFraction * 100);
  const healSlider = document.getElementById('char-ai-heal-slider');
  const healVal = document.getElementById('char-ai-heal-val');
  if (healSlider) healSlider.value = healPct;
  if (healVal) healVal.textContent = `${healPct}%`;

  const potionPct = Math.round(potionFraction * 100);
  const potionSlider = document.getElementById('char-ai-potion-slider');
  const potionVal = document.getElementById('char-ai-potion-val');
  if (potionSlider) potionSlider.value = potionPct;
  if (potionVal) potionVal.textContent = `${potionPct}%`;

  const spellsChk = document.getElementById('char-ai-use-spells');
  if (spellsChk) spellsChk.checked = useSpells;

  const ffChk = document.getElementById('char-ai-friendly-fire');
  if (ffChk) ffChk.checked = friendlyFire;

  const rxShield = document.getElementById('rx-shield');
  if (rxShield) rxShield.checked = shield;
  const rxOpp = document.getElementById('rx-opportunity');
  if (rxOpp) rxOpp.checked = opp;
  const rxCounter = document.getElementById('rx-counterspell');
  if (rxCounter) rxCounter.checked = counter;
  const rxDodge = document.getElementById('rx-uncanny-dodge');
  if (rxDodge) rxDodge.checked = dodge;
  const rxFlurry = document.getElementById('rx-defensive-flurry');
  if (rxFlurry) rxFlurry.checked = flurry;

  updateCharRoleBadge(role);
}

function saveCharDirectiveUI() {
  return {
    controller: document.getElementById('char-ai-controller')?.value || 'infinity_ai',
    role: document.getElementById('char-ai-role')?.value || 'striker',
    targetPriority: document.getElementById('char-ai-priority')?.value || 'nearest',
    movement: document.getElementById('char-ai-movement')?.value || 'advance',
    healThreshold: Number(document.getElementById('char-ai-heal-slider')?.value || 50) / 100,
    potionThreshold: Number(document.getElementById('char-ai-potion-slider')?.value || 40) / 100,
    useSpells: document.getElementById('char-ai-use-spells')?.checked ?? true,
    allowFriendlyFire: document.getElementById('char-ai-friendly-fire')?.checked ?? false,
    reactions: {
      shield: document.getElementById('rx-shield')?.checked ?? true,
      opportunityAttack: document.getElementById('rx-opportunity')?.checked ?? true,
      counterspell: document.getElementById('rx-counterspell')?.checked ?? false,
      uncannyDodge: document.getElementById('rx-uncanny-dodge')?.checked ?? false,
      defensiveFlurry: document.getElementById('rx-defensive-flurry')?.checked ?? false
    }
  };
}

// ========================================================
// MODULE 5: cRPG SPELLS STUDIO
// ========================================================
let spellSearchQuery = '';
let selectedSpellSchool = 'all';
let selectedSpellLevel = 'all';

function setupSpellHandlers() {
  // Top Header Context Controls
  document.getElementById('btn-header-new-spell')?.addEventListener('click', createNewSpell);
  document.getElementById('btn-hdr-new-spell')?.addEventListener('click', createNewSpell);
  document.getElementById('btn-header-save-spell')?.addEventListener('click', saveCurrentSpell);
  document.getElementById('btn-hdr-save-spell')?.addEventListener('click', saveCurrentSpell);
  document.getElementById('btn-header-close-spell')?.addEventListener('click', closeSpell);
  document.getElementById('btn-header-delete-spell')?.addEventListener('click', deleteCurrentSpell);
  document.getElementById('btn-hdr-del-spell')?.addEventListener('click', deleteCurrentSpell);

  document.getElementById('header-spell-select')?.addEventListener('change', (e) => {
    if (e.target.value) {
      loadSpellForm(e.target.value);
    } else {
      closeSpell();
    }
  });

  // Sidebar Controls
  document.getElementById('btn-sidebar-new-spell')?.addEventListener('click', createNewSpell);
  document.getElementById('btn-empty-new-spell')?.addEventListener('click', createNewSpell);

  // Form Action Buttons
  document.getElementById('btn-save-spell')?.addEventListener('click', saveCurrentSpell);
  document.getElementById('btn-close-spell')?.addEventListener('click', closeSpell);
  document.getElementById('btn-delete-spell')?.addEventListener('click', deleteCurrentSpell);

  // Search input
  document.getElementById('spell-search-input')?.addEventListener('input', (e) => {
    spellSearchQuery = (e.target.value || '').trim().toLowerCase();
    renderSpellsList();
  });

  // School Filter Pills
  document.querySelectorAll('#spell-school-filters .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#spell-school-filters .filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSpellSchool = btn.getAttribute('data-school') || 'all';
      renderSpellsList();
    });
  });

  // Level Filter Pills
  document.querySelectorAll('#spell-level-filters .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#spell-level-filters .filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSpellLevel = btn.getAttribute('data-level') || 'all';
      renderSpellsList();
    });
  });

  // Form School change -> update school badge
  document.getElementById('spell-school')?.addEventListener('change', (e) => {
    const school = e.target.value || 'Evocation';
    const badge = document.getElementById('spell-form-school-badge');
    if (badge) {
      badge.textContent = school;
      badge.className = `spell-school-badge ${school.toLowerCase()}`;
    }
  });

  // Form Icon change -> update icon display
  document.getElementById('spell-icon')?.addEventListener('input', (e) => {
    const iconEl = document.getElementById('spell-form-icon');
    if (iconEl) iconEl.textContent = e.target.value.trim() || '✨';
  });
}

async function loadAllSpells(preferredSlug) {
  try {
    const res = await window.robos.listSpells();
    if (res.success) {
      state.spells = res.spells || [];
      const countEl = document.getElementById('spells-count');
      if (countEl) countEl.textContent = state.spells.length;

      // Populate header select
      const hdrSelect = document.getElementById('header-spell-select');
      if (hdrSelect) {
        hdrSelect.innerHTML = '<option value="">(Select a spell...)</option>' +
          state.spells.map(s => `<option value="${s.slug}">${s.icon || '✨'} ${s.name} (L${s.level})</option>`).join('');
      }

      renderSpellsList();
      populateCharSpellsDropdown();

      if (preferredSlug) {
        await loadSpellForm(preferredSlug);
      }
    }
  } catch (err) {
    console.error('Error loading spells:', err);
    setStatus(`Error loading spells: ${err.message}`);
  }
}

function renderSpellsList() {
  const container = document.getElementById('spells-list');
  if (!container) return;

  const filtered = state.spells.filter(s => {
    if (selectedSpellSchool !== 'all' && (s.school || '').toLowerCase() !== selectedSpellSchool.toLowerCase()) {
      return false;
    }
    if (selectedSpellLevel !== 'all' && String(s.level) !== String(selectedSpellLevel)) {
      return false;
    }
    if (spellSearchQuery) {
      const targetText = `${s.name || ''} ${s.slug || ''} ${s.school || ''} ${s.damage || ''} ${s.damageType || ''}`.toLowerCase();
      if (!targetText.includes(spellSearchQuery)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No spells found matching filters.</div>`;
    return;
  }

  container.innerHTML = filtered.map(s => {
    const isActive = state.activeSpellSlug === s.slug;
    const levelLabel = s.level === 0 ? 'Cantrip' : `Level ${s.level}`;
    const schoolClass = (s.school || 'evocation').toLowerCase();
    return `
      <div class="spell-list-item ${isActive ? 'active' : ''}" data-slug="${s.slug}" draggable="true">
        <div class="spell-item-icon">${s.icon || '✨'}</div>
        <div class="spell-item-info">
          <div class="spell-item-name">${s.name || s.slug}</div>
          <div class="spell-item-badges">
            <span class="spell-level-badge">${levelLabel}</span>
            <span class="spell-school-badge ${schoolClass}">${s.school || 'Magic'}</span>
            ${s.damage ? `<span class="spell-item-dmg">${s.damage} ${s.damageType || ''}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.spell-list-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const slug = el.getAttribute('data-slug');
      const spell = state.spells.find(x => x.slug === slug);
      e.dataTransfer.setData('application/json', JSON.stringify({
        source: 'spell',
        slug: slug,
        name: spell?.name || slug,
        icon: spell?.icon || '✨'
      }));
      e.dataTransfer.effectAllowed = 'copy';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
    });
    el.addEventListener('click', () => {
      const slug = el.getAttribute('data-slug');
      loadSpellForm(slug);
    });
  });
}

async function loadSpellForm(slug) {
  if (!slug) return;
  try {
    setStatus(`Loading spell ${slug}...`);
    const res = await window.robos.loadSpell(slug);
    if (res.success) {
      const data = res.data;
      state.activeSpellSlug = slug;
      state.activeSpellData = data;

      document.getElementById('spell-empty-state')?.classList.add('hidden');
      document.getElementById('spell-form-container')?.classList.remove('hidden');

      const name = data['dcterms:title'] || data['schema:name'] || data.name || slug;
      const school = data['robos:magicSchool'] || data['robos:school'] || data.magicSchool || data.school || 'Evocation';
      const icon = data['robos:icon'] || data.icon || '✨';

      document.getElementById('spell-form-title').textContent = `Spell: ${name}`;
      document.getElementById('spell-name').value = name;
      document.getElementById('spell-slug').value = slug;
      document.getElementById('spell-icon').value = icon;
      document.getElementById('spell-form-icon').textContent = icon;

      const schoolSelect = document.getElementById('spell-school');
      if (schoolSelect) schoolSelect.value = school;
      const schoolBadge = document.getElementById('spell-form-school-badge');
      if (schoolBadge) {
        schoolBadge.textContent = school;
        schoolBadge.className = `spell-school-badge ${school.toLowerCase()}`;
      }

      document.getElementById('spell-level').value = data['robos:spellLevel'] ?? data['robos:level'] ?? data.spellLevel ?? data.level ?? 1;
      document.getElementById('spell-casting-time').value = data['robos:castingTime'] || data.castingTime || '1 action';
      document.getElementById('spell-range').value = data['robos:range'] || data.range || '60 feet';
      document.getElementById('spell-duration').value = data['robos:duration'] || data.duration || 'Instantaneous';
      document.getElementById('spell-components').value = data['robos:components'] || data.components || 'V, S';
      document.getElementById('spell-damage').value = data['robos:damageFormula'] || data['robos:damage'] || data.damageFormula || data.damage || '';
      document.getElementById('spell-damage-type').value = data['robos:damageType'] || data.damageType || 'force';
      document.getElementById('spell-saving-throw').value = data['robos:savingThrow'] || data.savingThrow || 'None';
      document.getElementById('spell-desc').value = data['dcterms:description'] || data['schema:description'] || data.description || '';

      document.querySelectorAll('#spells-list .spell-list-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-slug') === slug);
      });

      const hdrSelect = document.getElementById('header-spell-select');
      if (hdrSelect) hdrSelect.value = slug;

      setStatus(`Loaded spell: ${name}`, res.filePath);
    }
  } catch (err) {
    console.error('Error loading spell:', err);
    setStatus(`Error loading spell: ${err.message}`);
  }
}

function showEmptySpellState() {
  state.activeSpellSlug = null;
  state.activeSpellData = null;
  document.getElementById('spell-form-container')?.classList.add('hidden');
  document.getElementById('spell-empty-state')?.classList.remove('hidden');
  document.querySelectorAll('#spells-list .spell-list-item').forEach(el => el.classList.remove('active'));
  const hdrSelect = document.getElementById('header-spell-select');
  if (hdrSelect) hdrSelect.value = '';
}

function closeSpell() {
  showEmptySpellState();
  setStatus('Closed spell.');
}

function createNewSpell() {
  state.activeSpellSlug = null;
  state.activeSpellData = null;

  document.getElementById('spell-empty-state')?.classList.add('hidden');
  document.getElementById('spell-form-container')?.classList.remove('hidden');

  document.getElementById('spell-form-title').textContent = 'New Spell Blueprint';
  document.getElementById('spell-name').value = '';
  document.getElementById('spell-slug').value = '';
  document.getElementById('spell-icon').value = '✨';
  document.getElementById('spell-form-icon').textContent = '✨';
  document.getElementById('spell-school').value = 'Evocation';
  const schoolBadge = document.getElementById('spell-form-school-badge');
  if (schoolBadge) {
    schoolBadge.textContent = 'Evocation';
    schoolBadge.className = 'spell-school-badge evocation';
  }
  document.getElementById('spell-level').value = '1';
  document.getElementById('spell-casting-time').value = '1 action';
  document.getElementById('spell-range').value = '60 feet';
  document.getElementById('spell-duration').value = 'Instantaneous';
  document.getElementById('spell-components').value = 'V, S';
  document.getElementById('spell-damage').value = '2d6';
  document.getElementById('spell-damage-type').value = 'force';
  document.getElementById('spell-saving-throw').value = 'DEX';
  document.getElementById('spell-desc').value = '';

  document.querySelectorAll('#spells-list .spell-list-item').forEach(el => el.classList.remove('active'));
  document.getElementById('spell-name').focus();
}

async function saveCurrentSpell() {
  const name = document.getElementById('spell-name').value.trim() || 'New Spell';
  let slug = document.getElementById('spell-slug').value.trim();
  if (!slug) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `spell-${Date.now().toString().slice(-4)}`;
    document.getElementById('spell-slug').value = slug;
  }

  const icon = document.getElementById('spell-icon').value.trim() || '✨';
  const school = document.getElementById('spell-school').value;
  const level = Number(document.getElementById('spell-level').value || 0);
  const castingTime = document.getElementById('spell-casting-time').value;
  const range = document.getElementById('spell-range').value.trim() || 'Touch';
  const duration = document.getElementById('spell-duration').value.trim() || 'Instantaneous';
  const components = document.getElementById('spell-components').value.trim() || 'V, S';
  const damage = document.getElementById('spell-damage').value.trim();
  const damageType = document.getElementById('spell-damage-type').value;
  const savingThrow = document.getElementById('spell-saving-throw').value;
  const description = document.getElementById('spell-desc').value.trim();

  const spellPayload = {
    '@context': {
      robos: 'urn:robos:',
      schema: 'https://schema.org/',
      dcterms: 'http://purl.org/dc/terms/'
    },
    '@type': ['robos:CRPGSpell', 'schema:Thing'],
    '@id': `urn:robos:crpg:spell:${slug}`,
    'schema:name': name,
    name,
    slug,
    'robos:icon': icon,
    icon,
    'robos:school': school,
    school,
    'robos:level': level,
    level,
    'robos:castingTime': castingTime,
    castingTime,
    'robos:range': range,
    range,
    'robos:duration': duration,
    duration,
    'robos:components': components,
    components,
    'robos:damage': damage,
    damage,
    'robos:damageType': damageType,
    damageType,
    'robos:savingThrow': savingThrow,
    savingThrow,
    'schema:description': description,
    description
  };

  try {
    setStatus(`Saving spell ${slug}...`);
    const res = await window.robos.saveSpell({ slug, data: spellPayload });
    if (res.success) {
      state.activeSpellSlug = res.slug;
      state.activeSpellData = spellPayload;
      setStatus(`Saved spell successfully!`, res.filePath);
      await loadAllSpells();
      document.getElementById('spell-form-title').textContent = `Spell: ${name}`;
    } else {
      setStatus(`Failed to save spell: ${res.error}`);
    }
  } catch (err) {
    console.error('Error saving spell:', err);
    setStatus(`Error saving spell: ${err.message}`);
  }
}

async function deleteCurrentSpell() {
  if (!state.activeSpellSlug) return;
  if (!confirm(`Are you sure you want to delete spell '${state.activeSpellSlug}'?`)) return;

  try {
    const res = await window.robos.deleteSpell(state.activeSpellSlug);
    if (res.success) {
      setStatus(`Deleted spell: ${state.activeSpellSlug}`);
      closeSpell();
      await loadAllSpells();
    } else {
      setStatus(`Failed to delete spell: ${res.error}`);
    }
  } catch (err) {
    console.error('Error deleting spell:', err);
    setStatus(`Error deleting spell: ${err.message}`);
  }
}

// ========================================================
// MODULE 6: cRPG ABILITIES STUDIO
// ========================================================
let abilitySearchQuery = '';
let selectedAbilityCategory = 'all';
let selectedAbilityAction = 'all';

function setupAbilityHandlers() {
  // Top Header Context Controls
  document.getElementById('btn-header-new-ability')?.addEventListener('click', createNewAbility);
  document.getElementById('btn-hdr-new-ability')?.addEventListener('click', createNewAbility);
  document.getElementById('btn-header-save-ability')?.addEventListener('click', saveCurrentAbility);
  document.getElementById('btn-hdr-save-ability')?.addEventListener('click', saveCurrentAbility);
  document.getElementById('btn-header-close-ability')?.addEventListener('click', closeAbility);
  document.getElementById('btn-header-delete-ability')?.addEventListener('click', deleteCurrentAbility);
  document.getElementById('btn-hdr-del-ability')?.addEventListener('click', deleteCurrentAbility);

  document.getElementById('header-ability-select')?.addEventListener('change', (e) => {
    if (e.target.value) {
      loadAbilityForm(e.target.value);
    } else {
      closeAbility();
    }
  });

  // Sidebar Controls
  document.getElementById('btn-sidebar-new-ability')?.addEventListener('click', createNewAbility);
  document.getElementById('btn-empty-new-ability')?.addEventListener('click', createNewAbility);

  // Form Action Buttons
  document.getElementById('btn-save-ability')?.addEventListener('click', saveCurrentAbility);
  document.getElementById('btn-close-ability')?.addEventListener('click', closeAbility);
  document.getElementById('btn-delete-ability')?.addEventListener('click', deleteCurrentAbility);

  // Search input
  document.getElementById('ability-search-input')?.addEventListener('input', (e) => {
    abilitySearchQuery = (e.target.value || '').trim().toLowerCase();
    renderAbilitiesList();
  });

  // Category Filter Pills
  document.querySelectorAll('#ability-category-filters .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ability-category-filters .filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAbilityCategory = btn.getAttribute('data-category') || 'all';
      renderAbilitiesList();
    });
  });

  // Action Filter Pills
  document.querySelectorAll('#ability-action-filters .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ability-action-filters .filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAbilityAction = btn.getAttribute('data-action') || 'all';
      renderAbilitiesList();
    });
  });

  // Form Action Type change -> update action badge
  document.getElementById('ability-action-type')?.addEventListener('change', (e) => {
    const actionType = e.target.value || 'action';
    const badge = document.getElementById('ability-form-action-badge');
    if (badge) {
      badge.textContent = actionType.replace('_', ' ');
      badge.className = `action-type-badge ${actionType}`;
    }
  });

  // Form Icon change -> update icon display
  document.getElementById('ability-icon')?.addEventListener('input', (e) => {
    const iconEl = document.getElementById('ability-form-icon');
    if (iconEl) iconEl.textContent = e.target.value.trim() || '⚡';
  });
}

async function loadAllAbilities(preferredSlug) {
  try {
    const res = await window.robos.listAbilities();
    if (res.success) {
      state.abilities = res.abilities || [];
      const countEl = document.getElementById('abilities-count');
      if (countEl) countEl.textContent = state.abilities.length;

      // Populate header select
      const hdrSelect = document.getElementById('header-ability-select');
      if (hdrSelect) {
        hdrSelect.innerHTML = '<option value="">(Select an ability...)</option>' +
          state.abilities.map(a => `<option value="${a.slug}">${a.icon || '⚡'} ${a.name} (${(a.actionType || 'action').replace('_', ' ')})</option>`).join('');
      }

      renderAbilitiesList();
      populateCharAbilitiesDropdown();

      if (preferredSlug) {
        await loadAbilityForm(preferredSlug);
      }
    }
  } catch (err) {
    console.error('Error loading abilities:', err);
    setStatus(`Error loading abilities: ${err.message}`);
  }
}

function renderAbilitiesList() {
  const container = document.getElementById('abilities-list');
  if (!container) return;

  const filtered = state.abilities.filter(a => {
    if (selectedAbilityCategory !== 'all' && (a.category || '').toLowerCase() !== selectedAbilityCategory.toLowerCase()) {
      return false;
    }
    if (selectedAbilityAction !== 'all' && (a.actionType || '').toLowerCase() !== selectedAbilityAction.toLowerCase()) {
      return false;
    }
    if (abilitySearchQuery) {
      const targetText = `${a.name || ''} ${a.slug || ''} ${a.category || ''} ${a.actionType || ''} ${a.effectFormula || ''}`.toLowerCase();
      if (!targetText.includes(abilitySearchQuery)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No abilities found matching filters.</div>`;
    return;
  }

  container.innerHTML = filtered.map(a => {
    const isActive = state.activeAbilitySlug === a.slug;
    const actionType = a.actionType || 'action';
    return `
      <div class="ability-list-item ${isActive ? 'active' : ''}" data-slug="${a.slug}" draggable="true">
        <div class="ability-item-icon">${a.icon || '⚡'}</div>
        <div class="ability-item-info">
          <div class="ability-item-name">${a.name || a.slug}</div>
          <div class="ability-item-badges">
            <span class="action-type-badge ${actionType}">${actionType.replace('_', ' ')}</span>
            <span class="ability-cat-badge">${(a.category || 'feature').replace('_', ' ')}</span>
            ${a.rechargeRate ? `<span class="ability-recharge-badge">${a.rechargeRate.replace('_', ' ')}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.ability-list-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const slug = el.getAttribute('data-slug');
      const ability = state.abilities.find(x => x.slug === slug);
      e.dataTransfer.setData('application/json', JSON.stringify({
        source: 'ability',
        slug: slug,
        name: ability?.name || slug,
        icon: ability?.icon || '⚡'
      }));
      e.dataTransfer.effectAllowed = 'copy';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
    });
    el.addEventListener('click', () => {
      const slug = el.getAttribute('data-slug');
      loadAbilityForm(slug);
    });
  });
}

async function loadAbilityForm(slug) {
  if (!slug) return;
  try {
    setStatus(`Loading ability ${slug}...`);
    const res = await window.robos.loadAbility(slug);
    if (res.success) {
      const data = res.data;
      state.activeAbilitySlug = slug;
      state.activeAbilityData = data;

      document.getElementById('ability-empty-state')?.classList.add('hidden');
      document.getElementById('ability-form-container')?.classList.remove('hidden');

      const name = data['dcterms:title'] || data['schema:name'] || data.name || slug;
      const actionType = data['robos:actionType'] || data.actionType || 'action';
      const icon = data['robos:icon'] || data.icon || '⚡';

      document.getElementById('ability-form-title').textContent = `Ability: ${name}`;
      document.getElementById('ability-name').value = name;
      document.getElementById('ability-slug').value = slug;
      document.getElementById('ability-icon').value = icon;
      document.getElementById('ability-form-icon').textContent = icon;

      const actSelect = document.getElementById('ability-action-type');
      if (actSelect) actSelect.value = actionType;
      const actBadge = document.getElementById('ability-form-action-badge');
      if (actBadge) {
        actBadge.textContent = actionType.replace('_', ' ');
        actBadge.className = `action-type-badge ${actionType}`;
      }

      document.getElementById('ability-category').value = data['robos:category'] || data.category || 'class_feature';
      document.getElementById('ability-recharge').value = data['robos:recharge'] || data['robos:rechargeRate'] || data.recharge || data.rechargeRate || 'short_rest';
      document.getElementById('ability-resource-cost').value = data['robos:resourceCost'] || data.resourceCost || '';
      document.getElementById('ability-range').value = data['robos:range'] || data.range || 'Self';
      document.getElementById('ability-duration').value = data['robos:duration'] || data.duration || 'Instantaneous';
      document.getElementById('ability-prereq').value = data['robos:prerequisites'] || data.prerequisites || '';
      document.getElementById('ability-effect-formula').value = data['robos:effectFormula'] || data.effectFormula || '';
      document.getElementById('ability-desc').value = data['dcterms:description'] || data['schema:description'] || data.description || '';

      document.querySelectorAll('#abilities-list .ability-list-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-slug') === slug);
      });

      const hdrSelect = document.getElementById('header-ability-select');
      if (hdrSelect) hdrSelect.value = slug;

      setStatus(`Loaded ability: ${name}`, res.filePath);
    }
  } catch (err) {
    console.error('Error loading ability:', err);
    setStatus(`Error loading ability: ${err.message}`);
  }
}

function showEmptyAbilityState() {
  state.activeAbilitySlug = null;
  state.activeAbilityData = null;
  document.getElementById('ability-form-container')?.classList.add('hidden');
  document.getElementById('ability-empty-state')?.classList.remove('hidden');
  document.querySelectorAll('#abilities-list .ability-list-item').forEach(el => el.classList.remove('active'));
  const hdrSelect = document.getElementById('header-ability-select');
  if (hdrSelect) hdrSelect.value = '';
}

function closeAbility() {
  showEmptyAbilityState();
  setStatus('Closed ability.');
}

function createNewAbility() {
  state.activeAbilitySlug = null;
  state.activeAbilityData = null;

  document.getElementById('ability-empty-state')?.classList.add('hidden');
  document.getElementById('ability-form-container')?.classList.remove('hidden');

  document.getElementById('ability-form-title').textContent = 'New Ability Blueprint';
  document.getElementById('ability-name').value = '';
  document.getElementById('ability-slug').value = '';
  document.getElementById('ability-icon').value = '⚡';
  document.getElementById('ability-form-icon').textContent = '⚡';
  document.getElementById('ability-category').value = 'class_feature';
  document.getElementById('ability-action-type').value = 'action';
  const actBadge = document.getElementById('ability-form-action-badge');
  if (actBadge) {
    actBadge.textContent = 'action';
    actBadge.className = 'action-type-badge action';
  }
  document.getElementById('ability-recharge').value = 'short_rest';
  document.getElementById('ability-resource-cost').value = '1 use';
  document.getElementById('ability-range').value = 'Self';
  document.getElementById('ability-duration').value = 'Instantaneous';
  document.getElementById('ability-prereq').value = '';
  document.getElementById('ability-effect-formula').value = '';
  document.getElementById('ability-desc').value = '';

  document.querySelectorAll('#abilities-list .ability-list-item').forEach(el => el.classList.remove('active'));
  document.getElementById('ability-name').focus();
}

async function saveCurrentAbility() {
  const name = document.getElementById('ability-name').value.trim() || 'New Ability';
  let slug = document.getElementById('ability-slug').value.trim();
  if (!slug) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `ability-${Date.now().toString().slice(-4)}`;
    document.getElementById('ability-slug').value = slug;
  }

  const icon = document.getElementById('ability-icon').value.trim() || '⚡';
  const category = document.getElementById('ability-category').value;
  const actionType = document.getElementById('ability-action-type').value;
  const rechargeRate = document.getElementById('ability-recharge').value;
  const resourceCost = document.getElementById('ability-resource-cost').value.trim();
  const range = document.getElementById('ability-range').value.trim() || 'Self';
  const duration = document.getElementById('ability-duration').value.trim() || 'Instantaneous';
  const prerequisites = document.getElementById('ability-prereq').value.trim();
  const effectFormula = document.getElementById('ability-effect-formula').value.trim();
  const description = document.getElementById('ability-desc').value.trim();

  const abilityPayload = {
    '@context': {
      robos: 'urn:robos:',
      schema: 'https://schema.org/',
      dcterms: 'http://purl.org/dc/terms/'
    },
    '@type': ['robos:CRPGAbility', 'schema:Thing'],
    '@id': `urn:robos:crpg:ability:${slug}`,
    'schema:name': name,
    name,
    slug,
    'robos:icon': icon,
    icon,
    'robos:category': category,
    category,
    'robos:actionType': actionType,
    actionType,
    'robos:rechargeRate': rechargeRate,
    rechargeRate,
    'robos:resourceCost': resourceCost,
    resourceCost,
    'robos:range': range,
    range,
    'robos:duration': duration,
    duration,
    'robos:prerequisites': prerequisites,
    prerequisites,
    'robos:effectFormula': effectFormula,
    effectFormula,
    'schema:description': description,
    description
  };

  try {
    setStatus(`Saving ability ${slug}...`);
    const res = await window.robos.saveAbility({ slug, data: abilityPayload });
    if (res.success) {
      state.activeAbilitySlug = res.slug;
      state.activeAbilityData = abilityPayload;
      setStatus(`Saved ability successfully!`, res.filePath);
      await loadAllAbilities();
      document.getElementById('ability-form-title').textContent = `Ability: ${name}`;
    } else {
      setStatus(`Failed to save ability: ${res.error}`);
    }
  } catch (err) {
    console.error('Error saving ability:', err);
    setStatus(`Error saving ability: ${err.message}`);
  }
}

async function deleteCurrentAbility() {
  if (!state.activeAbilitySlug) return;
  if (!confirm(`Are you sure you want to delete ability '${state.activeAbilitySlug}'?`)) return;

  try {
    const res = await window.robos.deleteAbility(state.activeAbilitySlug);
    if (res.success) {
      setStatus(`Deleted ability: ${state.activeAbilitySlug}`);
      closeAbility();
      await loadAllAbilities();
    } else {
      setStatus(`Failed to delete ability: ${res.error}`);
    }
  } catch (err) {
    console.error('Error deleting ability:', err);
    setStatus(`Error deleting ability: ${err.message}`);
  }
}

// ========================================================
// CAMPAIGN TACTICS & INFINITY AI ARENA SIMULATOR
// ========================================================
let simRound = 0;
let simLog = [];
let simEnemies = [];
let simParty = [];

function setupTacticsSimHandlers() {
  document.getElementById('btn-run-sim-round')?.addEventListener('click', stepSimRound);
  document.getElementById('btn-run-sim-battle')?.addEventListener('click', runSimFull);
  document.getElementById('btn-reset-sim')?.addEventListener('click', resetSim);
  document.getElementById('sim-scenario-select')?.addEventListener('change', resetSim);
}

function initSimState() {
  const partyCharacters = getCampaignActiveCharacters();
  simParty = partyCharacters.map(c => {
    const hpMax = c['robos:hpMax'] || c.hpMax || 24;
      const partitioned = partitionSpellsAndAbilities(
        c['robos:preparedSpells'] || c.preparedSpells || c['robos:spells'] || c.spells || [],
        c['robos:abilities'] || c.abilities || []
      );
      return {
        slug: c.slug,
        name: c['schema:name'] || c.name || c.slug,
        portrait: c['robos:portrait'] || c.portrait || '👤',
        charClass: c['robos:class'] || c.class || 'Fighter',
        level: c['robos:level'] || c.level || 1,
        ac: c['robos:ac'] || c.ac || 14,
        hpMax,
        hpCurrent: hpMax,
        spellSlots: 3,
        directive: c['robos:directive'] || c.directive || {
          controller: 'infinity_ai',
          role: 'striker',
          targetPriority: 'nearest',
          movement: 'advance',
          healThreshold: 0.5,
          potionThreshold: 0.4,
          useSpells: true
        },
        spells: partitioned.preparedSpells,
        abilities: partitioned.assignedAbilities,
        quickItems: Array.isArray(c['robos:quickItems'] || c.quickItems) 
          ? (c['robos:quickItems'] || c.quickItems).slice() 
          : [c['robos:quickItems'] || c.quickItems].filter(Boolean),
        alive: true
      };
  });

  const scenario = document.getElementById('sim-scenario-select')?.value || 'crypt-skeleton-patrol';
  if (scenario === 'homestead-hound-pack') {
    simEnemies = [
      { id: 'hound-1', name: 'Corrupted Hound Alpha', hpMax: 22, hpCurrent: 22, ac: 13, attackBonus: 5, damage: '1d6+3', alive: true },
      { id: 'hound-2', name: 'Blight Hound A', hpMax: 14, hpCurrent: 14, ac: 12, attackBonus: 4, damage: '1d6+2', alive: true },
      { id: 'hound-3', name: 'Blight Hound B', hpMax: 14, hpCurrent: 14, ac: 12, attackBonus: 4, damage: '1d6+2', alive: true }
    ];
  } else if (scenario === 'golem-attrition') {
    simEnemies = [
      { id: 'iron-golem', name: 'Vault Guardian Golem', hpMax: 55, hpCurrent: 55, ac: 16, attackBonus: 6, damage: '2d8+4', alive: true }
    ];
  } else {
    // Default: crypt-skeleton-patrol
    simEnemies = [
      { id: 'skel-1', name: 'Skeletal Champion', hpMax: 26, hpCurrent: 26, ac: 15, attackBonus: 5, damage: '1d8+3', alive: true },
      { id: 'skel-2', name: 'Bone Archer', hpMax: 16, hpCurrent: 16, ac: 13, attackBonus: 4, damage: '1d6+2', alive: true },
      { id: 'skel-3', name: 'Crypt Skeleton', hpMax: 14, hpCurrent: 14, ac: 12, attackBonus: 4, damage: '1d6+2', alive: true }
    ];
  }

  simRound = 0;
  simLog = [];
  updateSimDashboard();
}

function getCampaignActiveCharacters() {
  if (state.activeCampaignData) {
    const camp = state.activeCampaignData;
    const heroSlugs = camp['robos:party'] || camp.party || [];
    if (heroSlugs.length > 0) {
      const party = state.characters.filter(c => heroSlugs.includes(c.slug));
      if (party.length > 0) return party;
    }
  }
  // Fallback: all player characters
  const pcs = state.characters.filter(c => c.characterType !== 'npc' && !c.role);
  return pcs.length > 0 ? pcs : state.characters.slice(0, 4);
}

function renderCampaignTacticsRoster() {
  const container = document.getElementById('camp-tactics-roster-grid');
  if (!container) return;

  const party = getCampaignActiveCharacters();
  if (party.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No party members configured in campaign.</div>';
    return;
  }

  container.innerHTML = party.map(c => {
    const dir = c['robos:directive'] || c.directive || {};
    const controller = dir.controller || 'infinity_ai';
    const role = dir.role || 'striker';
    const priority = (dir.targetPriority || 'nearest').replace('_', ' ');
    const stance = (dir.movement || 'advance').replace('_', ' ');
    const partitioned = partitionSpellsAndAbilities(
      c['robos:preparedSpells'] || c.preparedSpells || c['robos:spells'] || c.spells || [],
      c['robos:abilities'] || c.abilities || []
    );
    const spells = partitioned.preparedSpells;
    const abilities = partitioned.assignedAbilities;
    const quickItems = Array.isArray(c['robos:quickItems'] || c.quickItems) 
      ? (c['robos:quickItems'] || c.quickItems) 
      : [c['robos:quickItems'] || c.quickItems].filter(Boolean);

    return `
      <div class="panel" style="background: rgba(18, 28, 48, 0.7); border: 1px solid var(--border-light); border-radius: 6px; padding: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 24px;">${c['robos:portrait'] || c.portrait || '👤'}</span>
            <div>
              <div style="font-weight: 600; font-size: 14px; color: #fff;">${c['schema:name'] || c.name || c.slug}</div>
              <div style="font-size: 11px; color: var(--text-muted);">Lvl ${c['robos:level'] || c.level || 1} ${c['robos:class'] || c.class || 'Fighter'}</div>
            </div>
          </div>
          <span class="ai-role-badge ${role}">${role.toUpperCase()}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; margin-bottom: 10px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">
          <div>Engine: <strong style="color: #00bcd4;">${controller}</strong></div>
          <div>Priority: <strong style="color: #ffb74d;">${priority}</strong></div>
          <div>Stance: <strong style="color: #81c784;">${stance}</strong></div>
          <div>Heal %: <strong style="color: #4caf50;">${Math.round((dir.healThreshold ?? 0.5) * 100)}%</strong></div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
          <div>✨ <strong>Prepared Spells (${spells.length}):</strong> <span style="color: #b0bec5;">${spells.slice(0, 3).join(', ') || 'None'}${spells.length > 3 ? '...' : ''}</span></div>
          <div>⚡ <strong>Abilities (${abilities.length}):</strong> <span style="color: #b0bec5;">${abilities.slice(0, 3).join(', ') || 'None'}${abilities.length > 3 ? '...' : ''}</span></div>
          <div>🧪 <strong>Quick Items:</strong> <span style="color: #b0bec5;">${quickItems.join(', ') || 'Empty'}</span></div>
        </div>
      </div>
    `;
  }).join('');

  if (!simParty || simParty.length === 0) {
    initSimState();
  }
}

function updateSimDashboard() {
  const roundEl = document.getElementById('sim-round-count');
  if (roundEl) roundEl.textContent = `${simRound} / 25`;

  const aliveParty = simParty.filter(p => p.alive).length;
  const alivePartyEl = document.getElementById('sim-party-alive');
  if (alivePartyEl) alivePartyEl.textContent = aliveParty;

  const aliveEnemies = simEnemies.filter(e => e.alive).length;
  const aliveEnemiesEl = document.getElementById('sim-enemies-alive');
  if (aliveEnemiesEl) aliveEnemiesEl.textContent = aliveEnemies;

  const outcomeBadge = document.getElementById('sim-outcome-badge');
  if (outcomeBadge) {
    if (aliveEnemies === 0 && aliveParty > 0) {
      outcomeBadge.textContent = '🏆 Victory (Party Won)';
      outcomeBadge.className = 'item-badge-pill';
      outcomeBadge.style.background = '#2e7d32';
    } else if (aliveParty === 0) {
      outcomeBadge.textContent = '💀 Defeat (Party Wiped)';
      outcomeBadge.className = 'item-badge-pill';
      outcomeBadge.style.background = '#c62828';
    } else if (simRound >= 25) {
      outcomeBadge.textContent = '⏳ Stalemate (Time Limit)';
      outcomeBadge.className = 'item-badge-pill';
      outcomeBadge.style.background = '#f57f17';
    } else if (simRound > 0) {
      outcomeBadge.textContent = '⚔️ In Progress';
      outcomeBadge.className = 'item-badge-pill';
      outcomeBadge.style.background = '#0277bd';
    } else {
      outcomeBadge.textContent = 'Ready';
      outcomeBadge.className = 'item-badge-pill';
      outcomeBadge.style.background = '#37474f';
    }
  }

  const logBox = document.getElementById('sim-log-entries');
  if (logBox) {
    if (simLog.length === 0) {
      logBox.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">Press "Step 1 Round" or "Simulate Full Battle" to execute autonomous Infinity AI combat decisions.</div>';
    } else {
      logBox.innerHTML = simLog.map(entry => `
        <div style="margin-bottom: 4px; padding: 2px 4px; border-left: 2px solid ${entry.color};">
          <span style="color: var(--text-muted);">[R${entry.round}]</span> ${entry.text}
        </div>
      `).join('');
      logBox.scrollTop = logBox.scrollHeight;
    }
  }
}

function logTactics(round, text, color = '#00bcd4') {
  simLog.push({ round, text, color });
}

function stepSimRound() {
  if (simParty.length === 0 || simEnemies.length === 0) {
    initSimState();
  }

  const aliveParty = simParty.filter(p => p.alive);
  const aliveEnemies = simEnemies.filter(e => e.alive);

  if (aliveParty.length === 0 || aliveEnemies.length === 0 || simRound >= 25) {
    return false;
  }

  simRound++;
  logTactics(simRound, `━━━ Round ${simRound} Commencing ━━━`, '#ffca28');

  // Party Phase (Infinity AI autonomous decisions)
  for (const pc of aliveParty) {
    if (!pc.alive) continue;
    const currentAliveEnemies = simEnemies.filter(e => e.alive);
    if (currentAliveEnemies.length === 0) break;

    const dir = pc.directive || {};
    const role = dir.role || 'striker';

    // 1. Check Potion Threshold
    const hpRatio = pc.hpCurrent / pc.hpMax;
    const potionThresh = dir.potionThreshold ?? 0.4;
    if (hpRatio <= potionThresh && pc.quickItems && pc.quickItems.length > 0) {
      const potIdx = pc.quickItems.findIndex(i => typeof i === 'string' && (i.toLowerCase().includes('potion') || i.toLowerCase().includes('heal')));
      if (potIdx !== -1) {
        const potionName = pc.quickItems[potIdx];
        const healAmt = Math.floor(Math.random() * 8) + 4; // 2d4+2
        pc.hpCurrent = Math.min(pc.hpMax, pc.hpCurrent + healAmt);
        pc.quickItems.splice(potIdx, 1);
        logTactics(simRound, `🧪 <strong>${pc.name}</strong> drinks <em>${potionName}</em>! Recovered +${healAmt} HP (${pc.hpCurrent}/${pc.hpMax} HP).`, '#4caf50');
        continue;
      }
    }

    // 2. Check Healer Role: heal injured ally
    if (role === 'healer' && dir.useSpells && pc.spellSlots > 0) {
      const healThresh = dir.healThreshold ?? 0.5;
      const woundedAlly = simParty.find(p => p.alive && (p.hpCurrent / p.hpMax) <= healThresh);
      if (woundedAlly) {
        pc.spellSlots--;
        const healAmt = Math.floor(Math.random() * 8) + 4; // 1d8+3
        woundedAlly.hpCurrent = Math.min(woundedAlly.hpMax, woundedAlly.hpCurrent + healAmt);
        logTactics(simRound, `✨ <strong>${pc.name}</strong> casts <em>Cure Wounds</em> on <strong>${woundedAlly.name}</strong>! Restored +${healAmt} HP.`, '#81c784');
        continue;
      }
    }

    // 3. Target Selection based on Target Priority
    let target = currentAliveEnemies[0];
    const prio = dir.targetPriority || 'nearest';
    if (prio === 'lowest_hp') {
      target = currentAliveEnemies.reduce((min, e) => e.hpCurrent < min.hpCurrent ? e : min, currentAliveEnemies[0]);
    } else if (prio === 'highest_hp') {
      target = currentAliveEnemies.reduce((max, e) => e.hpCurrent > max.hpCurrent ? e : max, currentAliveEnemies[0]);
    } else if (prio === 'weakest_ac') {
      target = currentAliveEnemies.reduce((min, e) => e.ac < min.ac ? e : min, currentAliveEnemies[0]);
    }

    // 4. Action: Spellcaster attack or Weapon attack
    if (role === 'caster' && dir.useSpells && pc.spellSlots > 0 && pc.spells.length > 0) {
      pc.spellSlots--;
      const spellName = pc.spells[0] || 'Magic Missile';
      const dmg = Math.floor(Math.random() * 10) + 6;
      target.hpCurrent -= dmg;
      logTactics(simRound, `✨ <strong>${pc.name}</strong> weaves <em>${spellName}</em> blasting <strong>${target.name}</strong> for <strong>${dmg}</strong> force damage!`, '#ab47bc');
    } else {
      // Melee/Ranged attack roll
      const d20 = Math.floor(Math.random() * 20) + 1;
      const attackRoll = d20 + 5;
      if (attackRoll >= target.ac || d20 === 20) {
        const isCrit = d20 === 20;
        let dmg = Math.floor(Math.random() * 8) + 3;
        if (isCrit) dmg *= 2;
        if (pc.abilities && pc.abilities.includes('sneak-attack')) {
          dmg += Math.floor(Math.random() * 6) + 1;
        }
        target.hpCurrent -= dmg;
        logTactics(simRound, `⚔️ <strong>${pc.name}</strong> hits <strong>${target.name}</strong> (Roll: ${d20}+5 = ${attackRoll} vs AC ${target.ac}) for <strong>${dmg}</strong> damage!${isCrit ? ' 💥 CRITICAL!' : ''}`, '#29b6f6');
      } else {
        logTactics(simRound, `🛡️ <strong>${pc.name}</strong> attacks <strong>${target.name}</strong> but misses (Roll: ${d20}+5 = ${attackRoll} vs AC ${target.ac}).`, '#78909c');
      }
    }

    // Check if target died
    if (target.hpCurrent <= 0) {
      target.alive = false;
      logTactics(simRound, `💀 <strong>${target.name}</strong> has been vanquished!`, '#ef5350');
    }
  }

  // Enemy Phase (Hostile AI)
  const remainingAliveEnemies = simEnemies.filter(e => e.alive);
  const remainingAliveParty = simParty.filter(p => p.alive);

  for (const enemy of remainingAliveEnemies) {
    if (remainingAliveParty.length === 0) break;
    const targetPC = remainingAliveParty[Math.floor(Math.random() * remainingAliveParty.length)];
    const d20 = Math.floor(Math.random() * 20) + 1;
    let targetAC = targetPC.ac;

    if (targetPC.directive?.reactions?.shield && targetPC.spells && targetPC.spells.includes('shield')) {
      targetAC += 5;
    }

    const attackRoll = d20 + enemy.attackBonus;
    if (attackRoll >= targetAC || d20 === 20) {
      let dmg = Math.floor(Math.random() * 6) + 2;
      if (targetPC.directive?.reactions?.uncannyDodge && targetPC.abilities?.includes('uncanny-dodge')) {
        dmg = Math.max(1, Math.floor(dmg / 2));
      }
      targetPC.hpCurrent -= dmg;
      logTactics(simRound, `🩸 <strong>${enemy.name}</strong> strikes <strong>${targetPC.name}</strong> for <strong>${dmg}</strong> damage! (${targetPC.hpCurrent}/${targetPC.hpMax} HP remaining)`, '#ff7043');
      if (targetPC.hpCurrent <= 0) {
        targetPC.alive = false;
        logTactics(simRound, `⚠️ <strong>${targetPC.name}</strong> has fallen unconscious in battle!`, '#e53935');
      }
    } else {
      logTactics(simRound, `🛡️ <strong>${enemy.name}</strong> attacks <strong>${targetPC.name}</strong> but is parried or deflected!`, '#78909c');
    }
  }

  updateSimDashboard();
  return true;
}

function runSimFull() {
  initSimState();
  let keepGoing = true;
  let counter = 0;
  while (keepGoing && counter < 25) {
    counter++;
    const stepped = stepSimRound();
    if (!stepped) break;
    const aliveParty = simParty.filter(p => p.alive).length;
    const aliveEnemies = simEnemies.filter(e => e.alive).length;
    if (aliveParty === 0 || aliveEnemies === 0) break;
  }
}

function resetSim() {
  initSimState();
}

// ========================================================
// MODULE 4: cRPG BLOCKMAP EDITOR
// ========================================================
function setupBlockmapHandlers() {
  const mapSelect = document.getElementById('map-select');
  const btnNewMap = document.getElementById('btn-new-map');
  const btnOpenMap = document.getElementById('btn-open-map');
  const btnCloseMap = document.getElementById('btn-close-map');
  const btnSaveMap = document.getElementById('btn-save-map');
  const btnBuildMap = document.getElementById('btn-build-map');
  const btnExportPng = document.getElementById('btn-export-png');

  mapSelect?.addEventListener('change', (e) => {
    if (e.target.value) {
      loadMap(e.target.value);
    } else {
      closeCurrentMap();
    }
  });

  btnNewMap?.addEventListener('click', createNewMap);
  btnOpenMap?.addEventListener('click', openMapModal);
  btnCloseMap?.addEventListener('click', closeCurrentMap);
  btnSaveMap?.addEventListener('click', saveCurrentMap);
  btnBuildMap?.addEventListener('click', buildMapBlockout);
  btnExportPng?.addEventListener('click', exportMapPng);

  // Empty state overlay buttons
  document.getElementById('btn-empty-new-map')?.addEventListener('click', createNewMap);
  document.getElementById('btn-empty-open-map')?.addEventListener('click', openMapModal);

  // File menu dropdown
  const btnFileMenu = document.getElementById('btn-map-file-menu');
  const fileDropdown = document.getElementById('menu-map-file-dropdown');

  btnFileMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileDropdown?.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (fileDropdown && !fileDropdown.contains(e.target) && e.target !== btnFileMenu) {
      fileDropdown.classList.add('hidden');
    }
  });

  document.getElementById('menu-item-new-map')?.addEventListener('click', () => {
    fileDropdown?.classList.add('hidden');
    createNewMap();
  });
  document.getElementById('menu-item-open-map')?.addEventListener('click', () => {
    fileDropdown?.classList.add('hidden');
    openMapModal();
  });
  document.getElementById('menu-item-save-map')?.addEventListener('click', () => {
    fileDropdown?.classList.add('hidden');
    saveCurrentMap();
  });
  document.getElementById('menu-item-close-map')?.addEventListener('click', () => {
    fileDropdown?.classList.add('hidden');
    closeCurrentMap();
  });

  // Modal Open Map Controls
  document.getElementById('btn-close-modal-map')?.addEventListener('click', closeMapModal);
  document.getElementById('btn-cancel-open-map')?.addEventListener('click', closeMapModal);
  document.getElementById('btn-confirm-open-map')?.addEventListener('click', async () => {
    if (selectedModalMapSlug) {
      const slug = selectedModalMapSlug;
      closeMapModal();
      await loadMap(slug);
    }
  });

  document.getElementById('map-search-input')?.addEventListener('input', (e) => {
    renderMapModalTree(e.target.value);
  });

  // Global keydown for Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMapModal();
      fileDropdown?.classList.add('hidden');
    }
  });

  // Subtabs in left sidebar (Map Settings vs Map Object)
  document.getElementById('subtab-map-settings')?.addEventListener('click', () => {
    document.getElementById('subtab-map-settings').classList.add('active');
    document.getElementById('subtab-map-objects').classList.remove('active');
    document.getElementById('content-map-settings').classList.remove('hidden');
    document.getElementById('content-map-objects').classList.add('hidden');
  });

  document.getElementById('subtab-map-objects')?.addEventListener('click', () => {
    document.getElementById('subtab-map-objects').classList.add('active');
    document.getElementById('subtab-map-settings').classList.remove('active');
    document.getElementById('content-map-objects').classList.remove('hidden');
    document.getElementById('content-map-settings').classList.add('hidden');
  });

  // Dimension presets
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = Number(btn.getAttribute('data-w'));
      const h = Number(btn.getAttribute('data-h'));
      document.getElementById('map-width').value = w;
      document.getElementById('map-height').value = h;
      updateMapDimensionsFromForm();
    });
  });

  document.getElementById('map-width')?.addEventListener('input', updateMapDimensionsFromForm);
  document.getElementById('map-height')?.addEventListener('input', updateMapDimensionsFromForm);
  document.getElementById('map-terrain')?.addEventListener('change', (e) => {
    if (state.activeMapData) {
      state.activeMapData['robos:terrain'] = e.target.value;
      canvasRenderer?.render();
    }
  });

  // Background Opacity slider
  const opacitySlider = document.getElementById('map-bg-opacity');
  opacitySlider?.addEventListener('input', (e) => {
    const val = Number(e.target.value) / 100;
    document.getElementById('lbl-bg-opacity').textContent = `${e.target.value}%`;
    if (canvasRenderer) {
      canvasRenderer.backgroundOpacity = val;
      canvasRenderer.render();
    }
  });

  // Shape radio switches in object form
  document.querySelectorAll('input[name="obj-shape"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateShapeCoordinateInputs(e.target.value);
    });
  });

  // Map Object Form Buttons
  document.getElementById('btn-apply-obj')?.addEventListener('click', applyMapObjectForm);
  document.getElementById('btn-duplicate-obj')?.addEventListener('click', duplicateSelectedMapObject);
  document.getElementById('btn-delete-obj')?.addEventListener('click', deleteSelectedMapObject);
  document.getElementById('btn-deselect-obj')?.addEventListener('click', deselectMapObject);

  // Filter map objects in right sidebar
  document.getElementById('filter-map-objects')?.addEventListener('input', (e) => {
    renderMapObjectsHierarchy(e.target.value.toLowerCase());
  });

  // View mode toggle (Canvas vs PNG)
  document.getElementById('btn-toggle-canvas')?.addEventListener('click', () => {
    setViewMode('canvas');
  });
  document.getElementById('btn-toggle-png')?.addEventListener('click', () => {
    setViewMode('png');
  });
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateShapeCoordinateInputs(shape) {
  document.getElementById('shape-rect-fields').classList.toggle('hidden', shape !== 'rect');
  document.getElementById('shape-circle-fields').classList.toggle('hidden', shape !== 'circle');
  document.getElementById('shape-line-fields').classList.toggle('hidden', shape !== 'line');
}

function updateMapDimensionsFromForm() {
  const w = Number(document.getElementById('map-width').value || 120);
  const h = Number(document.getElementById('map-height').value || 80);
  const cols = Math.floor(w / 5);
  const rows = Math.floor(h / 5);
  const pxW = w * 16;
  const pxH = h * 16;

  document.getElementById('lbl-grid-cells').textContent = `${cols} × ${rows} cells (5 ft)`;
  document.getElementById('lbl-png-res').textContent = `${pxW} × ${pxH} px (16 px/ft)`;

  if (state.activeMapData) {
    state.activeMapData['robos:width'] = w;
    state.activeMapData['robos:height'] = h;
    canvasRenderer?.setMapData(state.activeMapData);
  }
}

let selectedModalMapSlug = null;

function showEmptyMapState() {
  state.activeMapSlug = null;
  state.activeMapData = null;

  const emptyOverlay = document.getElementById('map-empty-state');
  if (emptyOverlay) emptyOverlay.classList.remove('hidden');

  const select = document.getElementById('map-select');
  if (select) select.value = '';

  // Clear Form Fields
  const slugInput = document.getElementById('map-slug');
  if (slugInput) slugInput.value = '';
  const titleInput = document.getElementById('map-title');
  if (titleInput) titleInput.value = '';
  const terrainInput = document.getElementById('map-terrain');
  if (terrainInput) terrainInput.value = 'stone';
  const widthInput = document.getElementById('map-width');
  if (widthInput) widthInput.value = 120;
  const heightInput = document.getElementById('map-height');
  if (heightInput) heightInput.value = 80;
  const bgImgInput = document.getElementById('map-bg-image');
  if (bgImgInput) bgImgInput.value = '';

  // Clear Objects List
  const objectsList = document.getElementById('map-objects-list');
  if (objectsList) {
    objectsList.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 11px; text-align: center;">No map open.</div>';
  }
  const objCount = document.getElementById('lbl-map-obj-count');
  if (objCount) objCount.textContent = '0';

  updateCollisionStats();

  // Reset Canvas
  if (canvasRenderer) {
    canvasRenderer.setMapData(null);
  }

  // Clear PNG preview
  const pngImg = document.getElementById('img-compiled-png');
  if (pngImg) pngImg.src = '';

  setStatus('No map open.');
}

function closeCurrentMap() {
  showEmptyMapState();
  setStatus('Map closed.');
}

function openMapModal() {
  const modal = document.getElementById('modal-open-map');
  if (!modal) return;
  selectedModalMapSlug = null;
  const confirmBtn = document.getElementById('btn-confirm-open-map');
  if (confirmBtn) confirmBtn.disabled = true;

  const searchInput = document.getElementById('map-search-input');
  if (searchInput) {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 60);
  }

  renderMapModalTree('');
  updateModalPreview(null);
  modal.classList.remove('hidden');
}

function closeMapModal() {
  const modal = document.getElementById('modal-open-map');
  if (modal) modal.classList.add('hidden');
  selectedModalMapSlug = null;
}

function renderMapModalTree(filterText = '') {
  const container = document.getElementById('map-tree-container');
  const countBadge = document.getElementById('map-tree-count');
  if (!container) return;

  const query = (filterText || '').trim().toLowerCase();
  const maps = state.maps || [];

  // Categorize maps
  const categories = {
    castles: { title: 'Castles & Keeps', icon: '🏰', items: [] },
    wilderness: { title: 'Wilderness & Overland', icon: '🌲', items: [] },
    dungeons: { title: 'Dungeons & Catacombs', icon: '🕳️', items: [] },
    other: { title: 'General & Custom', icon: '🗺️', items: [] },
  };

  let matchCount = 0;

  maps.forEach(m => {
    const title = (m.title || m.slug).toLowerCase();
    const slug = m.slug.toLowerCase();
    const terrain = (m.terrain || 'stone').toLowerCase();

    if (query && !title.includes(query) && !slug.includes(query) && !terrain.includes(query)) {
      return;
    }

    matchCount++;
    if (terrain === 'stone' || terrain === 'wood') {
      categories.castles.items.push(m);
    } else if (terrain === 'grass' || terrain === 'dirt' || terrain === 'sand' || terrain === 'snow') {
      categories.wilderness.items.push(m);
    } else if (terrain === 'cave') {
      categories.dungeons.items.push(m);
    } else {
      categories.other.items.push(m);
    }
  });

  if (countBadge) countBadge.textContent = matchCount;

  if (matchCount === 0) {
    const msg = filterText
      ? `No maps found matching "${escapeHtml(filterText)}".`
      : 'No maps available in workspace. Click "+ New" to create a map blueprint.';
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
        ${msg}
      </div>
    `;
    return;
  }

  let html = '';
  for (const [key, cat] of Object.entries(categories)) {
    if (cat.items.length === 0) continue;
    html += `
      <div class="tree-folder open" data-cat="${key}">
        <div class="tree-folder-header">
          <span class="tree-arrow">▼</span>
          <span class="tree-folder-icon">${cat.icon}</span>
          <span class="tree-folder-name">${cat.title}</span>
          <span class="tree-folder-count" style="font-size: 11px; color: var(--text-muted); margin-left: auto;">(${cat.items.length})</span>
        </div>
        <div class="tree-folder-children">
          ${cat.items.map(item => `
            <div class="tree-item ${selectedModalMapSlug === item.slug ? 'selected' : ''}" data-slug="${escapeHtml(item.slug)}">
              <span class="tree-item-icon">🗺️</span>
              <div class="tree-item-info">
                <span class="tree-item-title">${escapeHtml(item.title || item.slug)}</span>
                <span class="tree-item-slug">${escapeHtml(item.slug)}</span>
              </div>
              <span class="tree-item-badge">${item.width || 120}×${item.height || 80}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  container.querySelectorAll('.tree-folder-header').forEach(header => {
    header.addEventListener('click', () => {
      const folder = header.closest('.tree-folder');
      if (folder) folder.classList.toggle('collapsed');
    });
  });

  container.querySelectorAll('.tree-item').forEach(itemEl => {
    itemEl.addEventListener('click', () => {
      container.querySelectorAll('.tree-item').forEach(el => el.classList.remove('selected'));
      itemEl.classList.add('selected');
      const slug = itemEl.getAttribute('data-slug');
      selectedModalMapSlug = slug;
      const confirmBtn = document.getElementById('btn-confirm-open-map');
      if (confirmBtn) confirmBtn.disabled = false;
      const mapObj = maps.find(m => m.slug === slug);
      updateModalPreview(mapObj);
    });

    itemEl.addEventListener('dblclick', async () => {
      const slug = itemEl.getAttribute('data-slug');
      closeMapModal();
      await loadMap(slug);
    });
  });
}

function updateModalPreview(mapObj) {
  const emptyEl = document.getElementById('map-preview-empty');
  const contentEl = document.getElementById('map-preview-content');
  if (!mapObj) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');
  if (contentEl) contentEl.classList.remove('hidden');

  document.getElementById('preview-map-title').textContent = mapObj.title || mapObj.slug;
  document.getElementById('preview-map-slug').textContent = mapObj.slug;
  document.getElementById('preview-map-terrain').textContent = (mapObj.terrain || 'stone').toUpperCase();
  document.getElementById('preview-map-dimensions').textContent = `${mapObj.width || 120}×${mapObj.height || 80} ft`;
  document.getElementById('preview-map-objects').textContent = mapObj.objectCount || 0;

  const thumbnailImg = document.getElementById('preview-map-thumbnail');
  const noThumbnail = document.getElementById('preview-no-thumbnail');
  const pngPath = `../../games/crpg-realm/assets/blockouts/${mapObj.slug}.png?t=${Date.now()}`;

  const testImg = new Image();
  testImg.onload = () => {
    if (thumbnailImg) {
      thumbnailImg.src = pngPath;
      thumbnailImg.classList.remove('hidden');
    }
    if (noThumbnail) noThumbnail.classList.add('hidden');
  };
  testImg.onerror = () => {
    if (thumbnailImg) thumbnailImg.classList.add('hidden');
    if (noThumbnail) noThumbnail.classList.remove('hidden');
  };
  testImg.src = pngPath;
}

async function loadMapsList(options = {}) {
  const { autoSelect = false, targetSlug = null } = options;
  try {
    const res = await window.robos.listMaps();
    if (res.success) {
      state.maps = res.maps;
      const select = document.getElementById('map-select');
      if (select) {
        select.innerHTML = '<option value="">(No map open)</option>' + state.maps.map(m => 
          `<option value="${m.slug}">${m.title || m.slug}</option>`
        ).join('');
      }

      populateCampStartingMapDropdown();
      populateNpcLocationDropdown();
      renderCampaignMapsChecklist();

      if (targetSlug && state.maps.some(m => m.slug === targetSlug)) {
        if (select) select.value = targetSlug;
        await loadMap(targetSlug);
      } else if (state.activeMapSlug && state.maps.some(m => m.slug === state.activeMapSlug)) {
        if (select) select.value = state.activeMapSlug;
        await loadMap(state.activeMapSlug);
      } else if (autoSelect && state.maps.length > 0) {
        await loadMap(state.maps[0].slug);
      } else if (!state.activeMapData) {
        showEmptyMapState();
      }
    }
  } catch (err) {
    console.error('Error listing maps:', err);
  }
}

async function loadMap(slug) {
  if (!slug) return;
  try {
    setStatus(`Loading map ${slug}...`);
    const res = await window.robos.loadMap(slug);
    if (res.success) {
      const emptyOverlay = document.getElementById('map-empty-state');
      if (emptyOverlay) emptyOverlay.classList.add('hidden');

      state.activeMapSlug = slug;
      state.activeMapData = res.data;

      // Select in dropdown
      const select = document.getElementById('map-select');
      if (select) select.value = slug;

      // Populate Form Fields
      document.getElementById('map-slug').value = slug;
      document.getElementById('map-title').value = res.data['dcterms:title'] || res.data.title || slug;
      document.getElementById('map-terrain').value = res.data['robos:terrain'] || res.data.terrain || 'stone';
      document.getElementById('map-width').value = res.data['robos:width'] || res.data.width || 120;
      document.getElementById('map-height').value = res.data['robos:height'] || res.data.height || 80;
      document.getElementById('map-bg-image').value = res.data['robos:backgroundImage'] || res.data.backgroundImage || '';

      updateMapDimensionsFromForm();
      renderMapObjectsHierarchy();
      updateCollisionStats();

      // Update Canvas
      if (canvasRenderer) {
        canvasRenderer.setMapData(state.activeMapData);
        canvasRenderer.resetView(state.activeMapData['robos:width'], state.activeMapData['robos:height']);
      }

      // Check compiled PNG
      const pngImg = document.getElementById('img-compiled-png');
      if (pngImg) {
        pngImg.src = res.pngExists ? `../../games/crpg-realm/assets/blockouts/${slug}.png?t=${Date.now()}` : '';
      }

      setStatus(`Loaded map: ${slug}`, res.filePath);
    }
  } catch (err) {
    console.error('Error loading map:', err);
    setStatus(`Error loading map: ${err.message}`);
  }
}

function createNewMap() {
  const emptyOverlay = document.getElementById('map-empty-state');
  if (emptyOverlay) emptyOverlay.classList.add('hidden');

  const safeSlug = `map-${Date.now().toString().slice(-4)}`;
  state.activeMapSlug = safeSlug;
  state.activeMapData = {
    '@context': { robos: 'https://robos.dev/ns/sdlc#', dcterms: 'http://purl.org/dc/terms/' },
    '@type': ['robos:CRPGBattleMap', 'schema:Place'],
    '@id': `urn:robos:crpg:battle-map:${safeSlug}`,
    'dcterms:title': 'New Tactical Arena',
    'robos:width': 120,
    'robos:height': 80,
    'robos:terrain': 'stone',
    'robos:backgroundImage': '',
    'robos:backgroundOpacity': 1.0,
    'robos:mapObjects': [],
  };

  const slugInput = document.getElementById('map-slug');
  if (slugInput) slugInput.value = safeSlug;
  const titleInput = document.getElementById('map-title');
  if (titleInput) titleInput.value = state.activeMapData['dcterms:title'];
  const terrainInput = document.getElementById('map-terrain');
  if (terrainInput) terrainInput.value = 'stone';
  const widthInput = document.getElementById('map-width');
  if (widthInput) widthInput.value = 120;
  const heightInput = document.getElementById('map-height');
  if (heightInput) heightInput.value = 80;
  const bgImgInput = document.getElementById('map-bg-image');
  if (bgImgInput) bgImgInput.value = '';

  const select = document.getElementById('map-select');
  if (select) select.value = '';

  updateMapDimensionsFromForm();
  renderMapObjectsHierarchy();
  updateCollisionStats();

  if (canvasRenderer) {
    canvasRenderer.setMapData(state.activeMapData);
    canvasRenderer.resetView(120, 80);
  }

  setStatus(`Created new battle map template: ${safeSlug}`);
}

async function saveCurrentMap() {
  if (!state.activeMapData) return;

  const slug = document.getElementById('map-slug').value.trim() || 'my-map';
  state.activeMapData['dcterms:title'] = document.getElementById('map-title').value.trim();
  state.activeMapData['robos:terrain'] = document.getElementById('map-terrain').value;
  state.activeMapData['robos:width'] = Number(document.getElementById('map-width').value || 120);
  state.activeMapData['robos:height'] = Number(document.getElementById('map-height').value || 80);
  state.activeMapData['robos:backgroundImage'] = document.getElementById('map-bg-image').value.trim();
  state.activeMapData['robos:backgroundOpacity'] = Number(document.getElementById('map-bg-opacity').value || 100) / 100;

  try {
    setStatus(`Saving map ${slug}...`);
    const res = await window.robos.saveMap({ slug, data: state.activeMapData });
    if (res.success) {
      state.activeMapSlug = res.slug;
      setStatus(`Saved map successfully!`, res.filePath);
      await loadMapsList({ targetSlug: res.slug });
      const select = document.getElementById('map-select');
      if (select) select.value = res.slug;
    } else {
      setStatus(`Failed to save map: ${res.error}`);
    }
    return res;
  } catch (err) {
    console.error('Error saving map:', err);
    setStatus(`Error saving map: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function buildMapBlockout() {
  const inputSlug = document.getElementById('map-slug')?.value.trim();
  if (inputSlug) state.activeMapSlug = inputSlug;
  if (!state.activeMapSlug) return { success: false, error: 'No active map slug' };
  await saveCurrentMap();

  try {
    setStatus(`Building static PNG map & collision grid for ${state.activeMapSlug}...`);
    const res = await window.robos.buildMap({ slug: state.activeMapSlug });
    if (res.success) {
      const pngImg = document.getElementById('img-compiled-png');
      if (pngImg) pngImg.src = `../../games/crpg-realm/assets/blockouts/${state.activeMapSlug}.png?t=${Date.now()}`;

      // Refresh map data to get updated blockout numbers
      await loadMap(state.activeMapSlug);
      setStatus(`Blockout built successfully!`, res.pngPath);
    } else {
      setStatus(`Blockout build failed: ${res.error}`);
    }
    return res;
  } catch (err) {
    console.error('Error building blockout:', err);
    setStatus(`Build error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function exportMapPng() {
  if (!state.activeMapSlug) return;
  alert(`Compiled PNG is stored at: games/crpg-realm/assets/blockouts/${state.activeMapSlug}.png`);
}

function setViewMode(mode) {
  state.canvasMode = mode;
  document.getElementById('btn-toggle-canvas').classList.toggle('active', mode === 'canvas');
  document.getElementById('btn-toggle-png').classList.toggle('active', mode === 'png');
  document.getElementById('png-view-overlay').classList.toggle('hidden', mode !== 'png');
}

function normalizeMapObj(o) {
  if (!o) return { id: '', type: 'wall', shape: 'rect', label: '' };
  if (canvasRenderer) return canvasRenderer.normalizeMapObject(o);
  const id = o['robos:objectId'] || o.objectId || o.id || o['@id'] || '';
  const type = o['robos:objectType'] || o.objectType || o.type || 'wall';
  const shape = o['robos:shape'] || o.shape || 'rect';
  const label = o['dcterms:title'] || o.title || o['robos:label'] || o.label || id;
  return { id, type, shape, label, raw: o };
}

function renderMapObjectsHierarchy(filterText = '') {
  const container = document.getElementById('map-objects-list');
  if (!container || !state.activeMapData) return;

  const rawObjects = state.activeMapData['robos:mapObjects'] || [];
  document.getElementById('lbl-map-obj-count').textContent = rawObjects.length;

  const objects = rawObjects.map(o => normalizeMapObj(o));

  const filtered = filterText 
    ? objects.filter(o => o.id.toLowerCase().includes(filterText) || o.label.toLowerCase().includes(filterText) || o.type.toLowerCase().includes(filterText))
    : objects;

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px;">No objects match.</div>';
    return;
  }

  container.innerHTML = filtered.map(o => {
    const isSelected = o.id === state.selectedObjectId;
    return `
      <div class="object-tree-node ${isSelected ? 'active' : ''}" data-obj-id="${o.id}">
        <span>${o.label || o.id} (${o.type})</span>
        <span style="font-size:10px;opacity:0.6;">${o.shape}</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.object-tree-node').forEach(node => {
    node.addEventListener('click', () => {
      const id = node.getAttribute('data-obj-id');
      selectMapObject(id);
    });
  });
}

function selectMapObject(id) {
  state.selectedObjectId = id;
  canvasRenderer?.setSelectedObject(id);
  renderMapObjectsHierarchy();

  const dupBtn = document.getElementById('btn-duplicate-obj');
  const delBtn = document.getElementById('btn-delete-obj');
  if (dupBtn) dupBtn.disabled = !id;
  if (delBtn) delBtn.disabled = !id;

  if (!id) return;

  const objects = state.activeMapData['robos:mapObjects'] || [];
  const rawObj = objects.find(o => {
    const norm = normalizeMapObj(o);
    return norm.id === id;
  });
  if (!rawObj) return;
  const obj = normalizeMapObj(rawObj);

  // Switch to Map Objects subtab
  document.getElementById('subtab-map-objects')?.click();

  // Populate form
  document.getElementById('obj-id').value = obj.id || '';
  document.getElementById('obj-type').value = obj.type || 'wall';
  document.getElementById('obj-label').value = obj.label || '';

  const shape = obj.shape || 'rect';
  const radio = document.querySelector(`input[name="obj-shape"][value="${shape}"]`);
  if (radio) radio.checked = true;
  updateShapeCoordinateInputs(shape);

  if (shape === 'rect') {
    document.getElementById('obj-x').value = obj.x ?? 10;
    document.getElementById('obj-y').value = obj.y ?? 10;
    document.getElementById('obj-w').value = obj.width ?? 20;
    document.getElementById('obj-h').value = obj.height ?? 15;
  } else if (shape === 'circle') {
    document.getElementById('obj-cx').value = obj.cx ?? 30;
    document.getElementById('obj-cy').value = obj.cy ?? 30;
    document.getElementById('obj-radius').value = obj.radius ?? 5;
  } else if (shape === 'line') {
    document.getElementById('obj-lx1').value = obj.x1 ?? 0;
    document.getElementById('obj-ly1').value = obj.y1 ?? 20;
    document.getElementById('obj-lx2').value = obj.x2 ?? 60;
    document.getElementById('obj-ly2').value = obj.y2 ?? 20;
    document.getElementById('obj-thick').value = obj.thickness ?? 5;
  }
}

function deselectMapObject() {
  selectMapObject(null);
  document.getElementById('obj-id').value = '';
  document.getElementById('obj-label').value = '';
}

function applyMapObjectForm() {
  if (!state.activeMapData) return;
  const objects = state.activeMapData['robos:mapObjects'] || [];

  const id = document.getElementById('obj-id').value.trim() || `obj_${Date.now().toString().slice(-4)}`;
  const type = document.getElementById('obj-type').value;
  const label = document.getElementById('obj-label').value.trim();
  const shape = document.querySelector('input[name="obj-shape"]:checked')?.value || 'rect';

  let obj = objects.find(o => {
    const norm = normalizeMapObj(o);
    return norm.id === (state.selectedObjectId || id);
  });

  if (!obj) {
    obj = {
      '@type': 'robos:CRPGMapObject',
      'robos:objectId': id,
      'robos:objectType': type,
      'robos:shape': shape,
      'dcterms:title': label,
    };
    objects.push(obj);
  }

  // Update properties on obj (handling both prefixed and non-prefixed)
  if (obj['robos:objectId'] !== undefined) obj['robos:objectId'] = id;
  else obj.id = id;

  if (obj['robos:objectType'] !== undefined) obj['robos:objectType'] = type;
  else obj.type = type;

  if (obj['dcterms:title'] !== undefined) obj['dcterms:title'] = label;
  else obj.label = label;

  if (obj['robos:shape'] !== undefined) obj['robos:shape'] = shape;
  else obj.shape = shape;

  if (shape === 'rect') {
    const x = Number(document.getElementById('obj-x').value || 0);
    const y = Number(document.getElementById('obj-y').value || 0);
    const w = Number(document.getElementById('obj-w').value || 5);
    const h = Number(document.getElementById('obj-h').value || 5);
    if (obj['robos:position'] !== undefined) obj['robos:position'] = [x, y];
    else { obj.x = x; obj.y = y; }
    if (obj['robos:size'] !== undefined) obj['robos:size'] = [w, h];
    else { obj.width = w; obj.height = h; }
  } else if (shape === 'circle') {
    const cx = Number(document.getElementById('obj-cx').value || 0);
    const cy = Number(document.getElementById('obj-cy').value || 0);
    const rad = Number(document.getElementById('obj-radius').value || 5);
    if (obj['robos:center'] !== undefined) obj['robos:center'] = [cx, cy];
    else { obj.cx = cx; obj.cy = cy; }
    if (obj['robos:radius'] !== undefined) obj['robos:radius'] = rad;
    else obj.radius = rad;
  } else if (shape === 'line') {
    const x1 = Number(document.getElementById('obj-lx1').value || 0);
    const y1 = Number(document.getElementById('obj-ly1').value || 0);
    const x2 = Number(document.getElementById('obj-lx2').value || 0);
    const y2 = Number(document.getElementById('obj-ly2').value || 0);
    const th = Number(document.getElementById('obj-thick').value || 5);
    if (obj['robos:points'] !== undefined) obj['robos:points'] = [[x1, y1], [x2, y2]];
    else { obj.x1 = x1; obj.y1 = y1; obj.x2 = x2; obj.y2 = y2; }
    if (obj['robos:thickness'] !== undefined) obj['robos:thickness'] = th;
    else obj.thickness = th;
  }

  selectMapObject(id);
  canvasRenderer?.render();
  renderMapObjectsHierarchy();
}

function duplicateSelectedMapObject() {
  if (!state.selectedObjectId || !state.activeMapData) return;
  const objects = state.activeMapData['robos:mapObjects'] || [];
  const obj = objects.find(o => normalizeMapObj(o).id === state.selectedObjectId);
  if (!obj) return;

  const clone = JSON.parse(JSON.stringify(obj));
  const newId = `${normalizeMapObj(obj).id}_copy_${Date.now().toString().slice(-3)}`;
  if (clone['robos:objectId']) clone['robos:objectId'] = newId;
  else clone.id = newId;

  if (clone['robos:position']) {
    clone['robos:position'] = [clone['robos:position'][0] + 5, clone['robos:position'][1] + 5];
  } else if (clone.x !== undefined) {
    clone.x += 5;
    clone.y = (clone.y || 0) + 5;
  }

  objects.push(clone);
  selectMapObject(newId);
  canvasRenderer?.render();
  renderMapObjectsHierarchy();
}

function deleteSelectedMapObject() {
  if (!state.selectedObjectId || !state.activeMapData) return;
  const objects = state.activeMapData['robos:mapObjects'] || [];
  const idx = objects.findIndex(o => normalizeMapObj(o).id === state.selectedObjectId);
  if (idx >= 0) {
    objects.splice(idx, 1);
    deselectMapObject();
    canvasRenderer?.render();
    renderMapObjectsHierarchy();
  }
}

function updateCollisionStats() {
  if (!state.activeMapData) return;
  const w = Number(state.activeMapData['robos:width'] || 120);
  const h = Number(state.activeMapData['robos:height'] || 80);
  const totalCells = Math.floor(w / 5) * Math.floor(h / 5);

  const blockout = state.activeMapData['robos:blockout'] || {};
  document.getElementById('stat-total-cells').textContent = totalCells;
  document.getElementById('stat-blocked-cells').textContent = (blockout.blocked || []).length;
  document.getElementById('stat-opaque-cells').textContent = (blockout.opaque || []).length;
  document.getElementById('stat-diff-cells').textContent = (blockout.difficult || []).length;
}

// ========================================================
// CANVAS INTERACTIONS (PAN, ZOOM, SELECTION)
// ========================================================
function handleCanvasResize() {
  if (!canvasRenderer) return;
  const container = document.querySelector('.canvas-viewport-container');
  if (container) {
    canvasRenderer.resize(container.clientWidth, container.clientHeight);
  }
}

function setupCanvasInteractions(canvas) {
  // Toolbar buttons
  document.getElementById('tool-select')?.addEventListener('click', () => setCanvasTool('select'));
  document.getElementById('tool-place')?.addEventListener('click', () => setCanvasTool('place'));
  document.getElementById('tool-pan')?.addEventListener('click', () => setCanvasTool('pan'));

  document.getElementById('btn-zoom-in')?.addEventListener('click', () => zoomCanvas(1.2));
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => zoomCanvas(0.8));
  document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
    if (state.activeMapData && canvasRenderer) {
      canvasRenderer.resetView(state.activeMapData['robos:width'], state.activeMapData['robos:height']);
      updateZoomLevelDisplay();
    }
  });

  // Display toggles
  document.getElementById('chk-show-grid')?.addEventListener('change', (e) => {
    if (canvasRenderer) { canvasRenderer.showGrid = e.target.checked; canvasRenderer.render(); }
  });
  document.getElementById('chk-show-labels')?.addEventListener('change', (e) => {
    if (canvasRenderer) { canvasRenderer.showLabels = e.target.checked; canvasRenderer.render(); }
  });
  document.getElementById('chk-debug-collision')?.addEventListener('change', (e) => {
    if (canvasRenderer) { canvasRenderer.debugCollision = e.target.checked; canvasRenderer.render(); }
  });
  document.getElementById('chk-show-art')?.addEventListener('change', (e) => {
    if (canvasRenderer) { canvasRenderer.showBackground = e.target.checked; canvasRenderer.render(); }
  });

  // Mouse wheel zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    zoomCanvas(factor, e.offsetX, e.offsetY);
  }, { passive: false });

  // Mouse down
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || state.activeTool === 'pan' || (e.button === 0 && e.spaceKey)) {
      state.isPanning = true;
      state.dragStart = { x: e.clientX - canvasRenderer.panX, y: e.clientY - canvasRenderer.panY };
      return;
    }

    if (e.button === 0) {
      const worldPos = canvasRenderer.screenToWorld(e.offsetX, e.offsetY);
      const hit = canvasRenderer.hitTest(worldPos.x, worldPos.y);

      if (state.activeTool === 'select') {
        if (hit) {
          selectMapObject(hit.id);
          state.isDraggingObject = true;
          state.dragStart = { x: worldPos.x, y: worldPos.y };
        } else {
          deselectMapObject();
        }
      } else if (state.activeTool === 'place') {
        // Place new object at clicked coordinate
        const snap = document.getElementById('chk-snap-grid')?.checked;
        const x = snap ? Math.floor(worldPos.x / 5) * 5 : Math.round(worldPos.x);
        const y = snap ? Math.floor(worldPos.y / 5) * 5 : Math.round(worldPos.y);
        
        document.getElementById('obj-x').value = x;
        document.getElementById('obj-y').value = y;
        applyMapObjectForm();
      }
    }
  });

  // Mouse move
  window.addEventListener('mousemove', (e) => {
    if (state.isPanning && canvasRenderer) {
      canvasRenderer.panX = e.clientX - state.dragStart.x;
      canvasRenderer.panY = e.clientY - state.dragStart.y;
      canvasRenderer.render();
      return;
    }

    if (state.isDraggingObject && state.selectedObjectId && state.activeMapData && canvasRenderer) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const worldPos = canvasRenderer.screenToWorld(sx, sy);
      const dx = worldPos.x - state.dragStart.x;
      const dy = worldPos.y - state.dragStart.y;

      const obj = (state.activeMapData['robos:mapObjects'] || []).find(o => o.id === state.selectedObjectId);
      if (obj && obj.shape === 'rect') {
        const snap = document.getElementById('chk-snap-grid')?.checked;
        obj.x = snap ? Math.floor((obj.x + dx) / 5) * 5 : obj.x + dx;
        obj.y = snap ? Math.floor((obj.y + dy) / 5) * 5 : obj.y + dy;
        state.dragStart = { x: worldPos.x, y: worldPos.y };
        selectMapObject(obj.id); // sync form
        canvasRenderer.render();
      }
    }
  });

  // Mouse up
  window.addEventListener('mouseup', () => {
    state.isPanning = false;
    state.isDraggingObject = false;
  });

  // Canvas hover HUD
  canvas.addEventListener('mousemove', (e) => {
    if (!canvasRenderer) return;
    const worldPos = canvasRenderer.screenToWorld(e.offsetX, e.offsetY);
    const snap = document.getElementById('chk-snap-grid')?.checked;
    const fx = Math.round(worldPos.x);
    const fy = Math.round(worldPos.y);
    const cellC = Math.floor(worldPos.x / 5);
    const cellR = Math.floor(worldPos.y / 5);

    document.getElementById('hud-pos').textContent = `${fx} ft, ${fy} ft`;
    document.getElementById('hud-cell').textContent = `(${cellC}, ${cellR})`;
    document.getElementById('hud-terrain').textContent = state.activeMapData?.['robos:terrain'] || 'stone';
  });
}

function setCanvasTool(tool) {
  state.activeTool = tool;
  document.getElementById('tool-select')?.classList.toggle('active', tool === 'select');
  document.getElementById('tool-place')?.classList.toggle('active', tool === 'place');
  document.getElementById('tool-pan')?.classList.toggle('active', tool === 'pan');
}

function zoomCanvas(factor, pivotX, pivotY) {
  if (!canvasRenderer) return;
  const cw = canvasRenderer.canvas.clientWidth / 2;
  const ch = canvasRenderer.canvas.clientHeight / 2;
  const px = pivotX !== undefined ? pivotX : cw;
  const py = pivotY !== undefined ? pivotY : ch;

  const worldBefore = canvasRenderer.screenToWorld(px, py);
  canvasRenderer.zoom = Math.min(Math.max(canvasRenderer.zoom * factor, 0.2), 4.0);
  const worldAfter = canvasRenderer.screenToWorld(px, py);

  canvasRenderer.panX += (worldAfter.x - worldBefore.x) * canvasRenderer.pxPerFt * canvasRenderer.zoom;
  canvasRenderer.panY += (worldAfter.y - worldBefore.y) * canvasRenderer.pxPerFt * canvasRenderer.zoom;
  canvasRenderer.render();
  updateZoomLevelDisplay();
}

function updateZoomLevelDisplay() {
  if (!canvasRenderer) return;
  const pct = Math.round(canvasRenderer.zoom * 100);
  const lbl = document.getElementById('lbl-zoom-level');
  if (lbl) lbl.textContent = `${pct}%`;
}
