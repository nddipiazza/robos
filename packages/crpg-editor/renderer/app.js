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
    spells: "Second Wind (1d10+1 hp/rest)",
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
    spells: "Sneak Attack (1d6), Cunning Action",
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
    spells: "Divine Smite, Lay on Hands (5 hp), Bless",
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
  setupCampaignHandlers();
  setupCharacterHandlers();
  setupInventoryHandlers();
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
  const mapControls = document.getElementById('maps-header-controls') || document.getElementById('blockmap-header-controls');

  if (campControls) campControls.classList.toggle('hidden', paneId !== 'pane-campaign');
  if (charControls) charControls.classList.toggle('hidden', paneId !== 'pane-characters');
  if (mapControls) mapControls.classList.toggle('hidden', paneId !== 'pane-maps' && paneId !== 'pane-blockmap');

  if (paneId === 'pane-maps' || paneId === 'pane-blockmap') {
    setTimeout(handleCanvasResize, 50);
  } else if (paneId === 'pane-characters') {
    renderCharactersList();
    if (state.activeCharacterSlug) {
      loadCharacterSheet(state.activeCharacterSlug);
    }
  } else if (paneId === 'pane-inventory') {
    renderInventoryViews();
  } else if (paneId === 'pane-campaign') {
    renderCampaignMapsChecklist();
    renderCampaignCharactersChecklist();
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

  const optionsHtml = state.scenes.map(s => `<option value="${s.slug}">${s.title || s.slug}</option>`).join('');
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
}

async function loadCampaignsList() {
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
        await loadCampaign(state.campaigns[0].slug);
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
      document.getElementById('camp-setting').value = res.data['robos:setting'] || res.data.setting || 'Sword Coast';
      document.getElementById('camp-ruleset').value = res.data['robos:ruleSet'] || res.data.ruleSet || 'D&D 5e SRD';
      document.getElementById('camp-difficulty').value = res.data['robos:difficulty'] || res.data.difficulty || 'Core Rules';
      document.getElementById('camp-desc').value = res.data['dcterms:description'] || res.data.description || '';

      const gs = getGameState();
      const currentScene = gs['robos:currentScene'] || gs.currentScene || 'candlekeep-exterior';
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

      renderQuestLog();
      renderStoryFlags();
      renderHeroesList();
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
      'robos:currentScene': 'candlekeep-exterior',
      'robos:activeParty': [],
      'robos:partyLeaderIndex': 0,
      'robos:partyFormation': 'rank',
      'robos:sharedInventory': { gold: 150, silver: 40, copper: 120, items: [] },
      'robos:questLog': [],
      'robos:worldFlags': {},
    };
  }
  return state.activeCampaignData['robos:gameState'];
}

function getHeroes() {
  if (!state.activeCampaignData) return [];
  if (!state.activeCampaignData['robos:heroes'] || state.activeCampaignData['robos:heroes'].length === 0) {
    // If campaign has robos:characters, find matching heroes in state.characters
    const campaignCharIds = (state.activeCampaignData['robos:characters'] || []).map(id => 
      typeof id === 'string' ? id.replace(/^urn:robos:crpg:character:/, '') : (id.slug || id.id)
    );
    const matched = state.characters.filter(c => {
      const isHero = c.characterType !== 'npc' && c.characterType !== 'robos:CRPGNPC' && !c.role;
      if (!isHero) return false;
      return campaignCharIds.length === 0 || campaignCharIds.includes(c.slug) || campaignCharIds.includes(c.id);
    });
    if (matched.length > 0) {
      state.activeCampaignData['robos:heroes'] = matched;
    }
  }
  return state.activeCampaignData['robos:heroes'] || [];
}

function updateCampaignSummaryStats() {
  const heroes = getHeroes();
  const gs = getGameState();
  const activeParty = gs['robos:activeParty'] || [];
  const quests = gs['robos:questLog'] || [];
  const gold = gs['robos:sharedInventory']?.gold ?? 150;

  document.getElementById('stat-heroes-count').textContent = heroes.length;
  document.getElementById('stat-party-count').textContent = activeParty.length;
  document.getElementById('stat-quests-count').textContent = quests.length;
  document.getElementById('stat-gold-count').textContent = `${gold} gp`;
}

function createNewCampaign() {
  const safeSlug = `campaign-${Date.now().toString().slice(-4)}`;
  state.activeCampaignSlug = safeSlug;
  state.activeCampaignData = {
    '@context': { robos: 'urn:robos:', dcterms: 'http://purl.org/dc/terms/' },
    '@type': 'robos:CRPGCampaign',
    '@id': `urn:robos:crpg:campaign:${safeSlug}`,
    'dcterms:title': 'New Epic Campaign',
    'dcterms:description': 'A new journey begins along the Sword Coast.',
    'robos:setting': 'Sword Coast / Forgotten Realms',
    'robos:ruleSet': 'D&D 5e SRD',
    'robos:difficulty': 'Core Rules',
    'robos:maps': [],
    'robos:characters': [],
    'robos:startingMap': '',
    'robos:heroes': [],
    'robos:gameState': {
      'robos:currentScene': 'candlekeep-exterior',
      'robos:activeParty': [],
      'robos:partyLeaderIndex': 0,
      'robos:partyFormation': 'rank',
      'robos:sharedInventory': { gold: 150, silver: 40, copper: 120, items: [] },
      'robos:questLog': [],
      'robos:worldFlags': { prologue_active: true },
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

  state.activeHeroId = null;
  state.activeEquipHeroId = null;

  renderQuestLog();
  renderStoryFlags();
  renderHeroesList();
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
    const isChecked = mapIds.includes(m.slug) || mapIds.length === 0;
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
    const isChecked = charIds.includes(c.slug) || (charIds.length === 0 && !isNpc);
    if (isChecked) checkedCount++;
    return `
      <label class="camp-check-item">
        <input type="checkbox" class="camp-char-chk" data-slug="${c.slug}" data-is-npc="${isNpc}" ${isChecked ? 'checked' : ''}>
        <span>${c.portrait || (isNpc ? '👑' : '👤')} ${c.name || c.slug}</span>
        <span class="char-type-pill ${isNpc ? 'npc' : 'hero'}">${isNpc ? (c.role || 'NPC') : 'Hero'}</span>
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
      await loadCampaignsList();
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

  renderHeroesList();
  loadHeroSheet(state.activeHeroId);
  renderInventoryViews();
  updateCampaignSummaryStats();
  setStatus('Scaffolded standard 6-hero party.');
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
function setupCharacterHandlers() {
  // Sidebar Add Buttons
  document.getElementById('btn-add-hero')?.addEventListener('click', addNewHero);
  document.getElementById('btn-add-npc')?.addEventListener('click', addNewNpc);

  // Top Header Context Controls
  document.getElementById('btn-header-new-hero')?.addEventListener('click', addNewHero);
  document.getElementById('btn-hdr-new-hero')?.addEventListener('click', addNewHero);
  document.getElementById('btn-header-new-npc')?.addEventListener('click', addNewNpc);
  document.getElementById('btn-hdr-new-npc')?.addEventListener('click', addNewNpc);
  document.getElementById('btn-header-save-char')?.addEventListener('click', saveCurrentCharacter);
  document.getElementById('btn-hdr-save-char')?.addEventListener('click', saveCurrentCharacter);
  document.getElementById('btn-header-delete-char')?.addEventListener('click', deleteActiveCharacter);
  document.getElementById('btn-hdr-del-char')?.addEventListener('click', deleteActiveCharacter);
  document.getElementById('header-char-select')?.addEventListener('change', (e) => {
    if (e.target.value) loadCharacterSheet(e.target.value);
  });

  // Action Buttons
  document.getElementById('btn-save-character')?.addEventListener('click', saveCurrentCharacter);
  document.getElementById('btn-clone-hero')?.addEventListener('click', cloneActiveCharacter);
  document.getElementById('btn-delete-hero')?.addEventListener('click', deleteActiveCharacter);

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
    if (titleEl) titleEl.textContent = `${e.target.value || 'Character'} (${isNpc ? 'NPC' : 'Hero'})`;
  });
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
  if (titleEl) titleEl.textContent = `${charName} (${isNpc ? 'NPC' : 'Hero'})`;
}

function updateAbilityModifier(attr, val) {
  const mod = Math.floor((val - 10) / 2);
  const sign = mod >= 0 ? `+${mod}` : `${mod}`;
  const label = document.getElementById(`mod-${attr}`);
  if (label) label.textContent = sign;
}

async function loadAllCharacters() {
  try {
    const res = await window.robos.listCharacters();
    if (res.success) {
      state.characters = res.characters || [];

      // Update header dropdown
      const hdrSelect = document.getElementById('header-char-select');
      if (hdrSelect) {
        hdrSelect.innerHTML = '<option value="">(Select character...)</option>' +
          state.characters.map(c => {
            const isNpc = c.characterType === 'npc' || !!c.role;
            return `<option value="${c.slug}">${c.portrait || (isNpc ? '👑' : '👤')} ${c.name || c.slug}</option>`;
          }).join('');
        if (state.activeCharacterSlug) {
          hdrSelect.value = state.activeCharacterSlug;
        }
      }

      renderCharactersList();

      if (!state.activeCharacterSlug && state.characters.length > 0) {
        await loadCharacterSheet(state.characters[0].slug);
      } else if (state.activeCharacterSlug) {
        await loadCharacterSheet(state.activeCharacterSlug);
      }
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
    if (state.characterFilter === 'hero') return !isNpc;
    if (state.characterFilter === 'npc') return isNpc;
    return true;
  });

  const countEl = document.getElementById('roster-count');
  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px;">No characters found for this filter. Click + Hero or + NPC.</div>';
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
            <span class="char-type-pill ${isNpc ? 'npc' : 'hero'}">${isNpc ? (c.role || 'NPC') : 'Hero'}</span>
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

async function loadCharacterSheet(slug) {
  if (!slug) return;
  try {
    setStatus(`Loading character ${slug}...`);
    const res = await window.robos.loadCharacter(slug);
    if (res.success) {
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

      document.getElementById('sheet-hero-title').textContent = `${name} (${isNpc ? 'NPC' : 'Hero'})`;
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

      document.getElementById('hero-spells').value = data['robos:spells'] || data.spells || '';
      document.getElementById('hero-backstory').value = data['robos:backstory'] || data.backstory || '';

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

  const types = ['robos:CRPGCharacter', isNpc ? 'robos:CRPGNPC' : 'robos:CRPGHero', 'schema:Person'];

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
  const safeSlug = `hero-${Date.now().toString().slice(-4)}`;
  state.activeCharacterSlug = safeSlug;
  state.activeCharacterData = null;

  document.getElementById('radio-type-hero').checked = true;
  document.getElementById('radio-type-npc').checked = false;
  toggleCharacterTypeUI(false);

  document.getElementById('sheet-hero-title').textContent = 'New Hero Character';
  document.getElementById('hero-avatar-display').textContent = '⚔️';
  document.getElementById('hero-name').value = 'New Hero';
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

  setStatus(`Ready to configure new hero: ${safeSlug}`);
}

function addNewNpc() {
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
  document.getElementById('npc-dialogue').value = 'Greetings, traveler. Safe journeys ahead.';
  document.getElementById('hero-backstory').value = 'A resident of the realm.';

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
  document.getElementById('sheet-hero-title').textContent = `${newName} (${isNpc ? 'NPC' : 'Hero'})`;

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
  const isNpc = arch.characterType === 'npc';
  const safeSlug = `${arch.slug || arch.id || archKey}-${Date.now().toString().slice(-4)}`;

  document.getElementById('radio-type-hero').checked = !isNpc;
  document.getElementById('radio-type-npc').checked = isNpc;
  toggleCharacterTypeUI(isNpc);

  document.getElementById('sheet-hero-title').textContent = `${arch.name} (${isNpc ? 'NPC' : 'Hero'})`;
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

  state.activeCharacterSlug = safeSlug;
  saveCurrentCharacter();
}

// ========================================================
// MODULE 3: cRPG INVENTORY EDITOR
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
}

function renderInventoryViews() {
  const heroes = getHeroes();
  const gs = getGameState();
  const activeParty = new Set(gs['robos:activeParty'] || []);

  // 1. Party Checklist
  const checklist = document.getElementById('party-checklist');
  if (checklist) {
    if (heroes.length === 0) {
      checklist.innerHTML = '<div style="color:var(--text-muted);font-size:11px;">No heroes created.</div>';
    } else {
      checklist.innerHTML = heroes.map(h => {
        const id = h.id || h['@id'];
        const checked = activeParty.has(id) ? 'checked' : '';
        return `
          <label class="party-checklist-item">
            <input type="checkbox" class="party-check-input" data-id="${id}" ${checked}>
            <span>${h.portrait || '👤'} ${h.name} (${h.class})</span>
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
  if (sceneSel) sceneSel.value = gs['robos:currentScene'] || 'candlekeep-exterior';

  // 3. Currency & Shared Stash
  const sharedInv = gs['robos:sharedInventory'] || { gold: 150, silver: 40, copper: 120, items: [] };
  document.getElementById('gold-gp').value = sharedInv.gold ?? 150;
  document.getElementById('gold-sp').value = sharedInv.silver ?? 40;
  document.getElementById('gold-cp').value = sharedInv.copper ?? 120;

  const itemsArr = Array.isArray(sharedInv.items) ? sharedInv.items : [];
  const itemsText = itemsArr.map(it => typeof it === 'string' ? it : (it.name || it.id)).join('\n');
  document.getElementById('shared-items-textarea').value = itemsText || "Potion of Healing (x4)\nSilk Rope (50 ft)\nThieves' Tools\nTorches (x3)\nRations (x10)";

  // 4. Hero Equipment Dropdown
  const equipHeroSelect = document.getElementById('equip-hero-select');
  if (equipHeroSelect) {
    equipHeroSelect.innerHTML = heroes.map(h => {
      const id = h.id || h['@id'];
      return `<option value="${id}">${h.portrait || '👤'} ${h.name}</option>`;
    }).join('');

    if (!state.activeEquipHeroId && heroes.length > 0) {
      state.activeEquipHeroId = heroes[0].id || heroes[0]['@id'];
    }
    equipHeroSelect.value = state.activeEquipHeroId;
    loadEquipSlotsForHero(state.activeEquipHeroId);
  }
}

function updateLeaderDropdown() {
  const heroes = getHeroes();
  const gs = getGameState();
  const activeParty = new Set(gs['robos:activeParty'] || []);
  const leaderSelect = document.getElementById('party-leader-select');
  if (!leaderSelect) return;

  const activeHeroes = heroes.filter(h => activeParty.has(h.id || h['@id']));
  if (activeHeroes.length === 0) {
    leaderSelect.innerHTML = '<option value="">(No active heroes)</option>';
    return;
  }

  leaderSelect.innerHTML = activeHeroes.map(h => {
    const id = h.id || h['@id'];
    return `<option value="${id}">${h.portrait || '👤'} ${h.name}</option>`;
  }).join('');

  const leaderIdx = gs['robos:partyLeaderIndex'] || 0;
  const currentLeader = heroes[leaderIdx];
  if (currentLeader && activeParty.has(currentLeader.id || currentLeader['@id'])) {
    leaderSelect.value = currentLeader.id || currentLeader['@id'];
  } else if (activeHeroes.length > 0) {
    leaderSelect.value = activeHeroes[0].id || activeHeroes[0]['@id'];
  }
}

function loadEquipSlotsForHero(heroId) {
  const heroes = getHeroes();
  const hero = heroes.find(h => (h.id || h['@id']) === heroId);
  if (!hero) return;

  document.getElementById('equip-mainhand').value = hero.mainHand || '';
  document.getElementById('equip-offhand').value = hero.offHand || '';
  document.getElementById('equip-armor').value = hero.armor || '';
  document.getElementById('equip-helmet').value = hero.helmet || '';
  document.getElementById('equip-cloak').value = hero.cloak || '';
  document.getElementById('equip-boots').value = hero.boots || '';
  document.getElementById('equip-ring1').value = hero.ring1 || '';
  document.getElementById('equip-quickitems').value = hero.quickItems || '';
}

function persistEquipSlotsToHero() {
  if (!state.activeEquipHeroId) return;
  const heroes = getHeroes();
  const hero = heroes.find(h => (h.id || h['@id']) === state.activeEquipHeroId);
  if (!hero) return;

  hero.mainHand = document.getElementById('equip-mainhand').value.trim();
  hero.offHand = document.getElementById('equip-offhand').value.trim();
  hero.armor = document.getElementById('equip-armor').value.trim();
  hero.helmet = document.getElementById('equip-helmet').value.trim();
  hero.cloak = document.getElementById('equip-cloak').value.trim();
  hero.boots = document.getElementById('equip-boots').value.trim();
  hero.ring1 = document.getElementById('equip-ring1').value.trim();
  hero.quickItems = document.getElementById('equip-quickitems').value.trim();
}

function persistInventoryFromUI() {
  const gs = getGameState();
  if (!gs['robos:sharedInventory']) gs['robos:sharedInventory'] = {};
  gs['robos:sharedInventory'].gold = Number(document.getElementById('gold-gp')?.value || 0);
  gs['robos:sharedInventory'].silver = Number(document.getElementById('gold-sp')?.value || 0);
  gs['robos:sharedInventory'].copper = Number(document.getElementById('gold-cp')?.value || 0);

  const rawItems = document.getElementById('shared-items-textarea')?.value || '';
  gs['robos:sharedInventory'].items = rawItems.split('\n').map(s => s.trim()).filter(Boolean);

  persistEquipSlotsToHero();
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
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
        No maps found matching "${escapeHtml(filterText)}".
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
