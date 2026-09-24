/**
 * RobOS cRPG Campaign Studio — Controller & State Management
 */

// Default archetypes for quick party scaffolding
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
    backstory: "Devoted battle priest dispatched to Candlekeep library to catalog ancient dwarven liturgical codices."
  },
  ranger: {
    id: "hero-elora",
    name: "Elora Nightbreeze",
    race: "Wood Elf",
    class: "Ranger",
    subclass: "Hunter",
    background: "Coast Wayfarer",
    alignment: "Chaotic Good",
    level: 1,
    xp: 0,
    portrait: "🌲",
    str: 12, dex: 17, con: 14, int: 10, wis: 15, cha: 8,
    ac: 15, hpMax: 12, hpCurrent: 12, speed: 35, initiative: 3, prof: 2,
    mainHand: "Longbow (+5 to hit, 1d8+3 pierc)",
    offHand: "Shortsword (+5 to hit, 1d6+3)",
    armor: "Leather Armor (AC 11+DEX)",
    helmet: "Hood of the Woods",
    cloak: "Camouflage Cloak",
    boots: "Stalker Boots",
    ring1: "Ring of Natural Attunement",
    quickItems: "Hunting Trap, 40x Flight Arrows, Jerky",
    spells: "Favored Enemy: Humanoids, Natural Explorer: Coast",
    backstory: "Wilderness scout patrolling the Lion's Way and Coast Way cliffs, watchful of bandit raids."
  },
  paladin: {
    id: "hero-faerun",
    name: "Faerûn",
    race: "Half-Elf",
    class: "Paladin",
    subclass: "Oath of Devotion",
    background: "Noble Knight",
    alignment: "Lawful Good",
    level: 1,
    xp: 0,
    portrait: "✨",
    str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 16,
    ac: 18, hpMax: 12, hpCurrent: 12, speed: 30, initiative: 0, prof: 2,
    mainHand: "Bastard Sword (+5 to hit, 1d10+3 sl)",
    offHand: "Heraldic Kite Shield (+2 AC)",
    armor: "Chain Mail (AC 16)",
    helmet: "Winged Helm",
    cloak: "Silver Mantle",
    boots: "Cavalier Boots",
    ring1: "Signet Ring of Baldur's Gate",
    quickItems: "2x Healing Draught, Whetstone",
    spells: "Divine Sense, Lay on Hands (5 hp pool)",
    backstory: "Sworn champion on pilgrimage to the sacred archives of Oghma before undertaking his knightly quest."
  }
};

let currentCampaign = {
  title: "Candlekeep: The Prophecy Begins",
  slug: "candlekeep-prologue",
  setting: "Sword Coast / Forgotten Realms",
  ruleSet: "D&D 5e SRD",
  difficulty: "Core Rules",
  startingScene: "candlekeep-exterior",
  description: "The young ward of Gorion prepares to leave the safety of Candlekeep monastery amid rumors of iron shortages and sinister assassination attempts.",
  heroes: [],
  gameState: {
    currentScene: "candlekeep-exterior",
    activeParty: ["hero-vance", "hero-imoen"],
    partyLeaderIndex: 0,
    partyFormation: "rank",
    sharedInventory: {
      gold: 150,
      sp: 40,
      cp: 120,
      items: [
        "Potion of Healing (x4)",
        "Thieves' Tools (Fine)",
        "Scroll of Armor of Agathys",
        "Rope (50 ft, silk)",
        "Tinderbox and 4 Torches"
      ]
    },
    questLog: [
      {
        id: "q-gorion-departure",
        title: "Departure from Candlekeep",
        status: "active",
        stage: 1,
        giver: "Gorion",
        description: "Gorion has urged you to make haste and purchase necessary supplies. Meet him by the central library steps once ready to leave."
      },
      {
        id: "q-firebead-scroll",
        title: "Firebead's Identification Scroll",
        status: "active",
        stage: 1,
        giver: "Firebead Elfmirk",
        description: "Fetch the scroll of identify from Tethtoril and bring it to Firebead inside the Candlekeep Inn."
      },
      {
        id: "q-shank-carbos",
        title: "Assassins in the Sanctuary",
        status: "active",
        stage: 1,
        giver: "Self",
        description: "Two cutthroats named Shank and Carbos have attempted to murder you in the storehouses. Find out who sent them."
      },
      {
        id: "q-dreppin-cow",
        title: "Dreppin's Sick Cow",
        status: "active",
        stage: 1,
        giver: "Dreppin",
        description: "Retrieve an antidote potion from the temple stores to cure Nessa the cow."
      },
      {
        id: "q-hull-sword",
        title: "Hull's Longsword",
        status: "active",
        stage: 1,
        giver: "Hull",
        description: "Find the longsword Hull forgot in the gate barracks and return it to him at the main gates."
      },
      {
        id: "q-reevor-storehouse",
        title: "Reevor's Infested Storehouse",
        status: "active",
        stage: 1,
        giver: "Reevor",
        description: "Clear out the giant rats invading Reevor's grain storehouse near the library."
      }
    ],
    worldFlags: {
      "spoke_to_gorion": true,
      "spoke_to_winthrop": true,
      "shank_defeated": false,
      "carbos_defeated": false,
      "firebead_scroll_delivered": false,
      "dreppin_antidote_delivered": false,
      "hull_sword_returned": false,
      "storehouse_rats_cleared": false,
      "gate_unlocked": false
    }
  }
};

let activeHeroIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEventListeners();
  loadCampaignsList();
});

function setupTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const paneId = tab.getAttribute('data-tab');
      const pane = document.getElementById(paneId);
      if (pane) pane.classList.add('active');

      if (paneId === 'tab-jsonld') {
        updateJsonLdView();
      } else if (paneId === 'tab-gamestate') {
        renderGameStateTab();
      }
    });
  });
}

function setupEventListeners() {
  // Campaign select & actions
  document.getElementById('campaign-select').addEventListener('change', (e) => {
    if (e.target.value) {
      loadSelectedCampaign(e.target.value);
    }
  });

  document.getElementById('btn-new-campaign').addEventListener('click', createNewCampaign);
  document.getElementById('btn-save-campaign').addEventListener('click', saveActiveCampaign);
  document.getElementById('btn-delete-campaign').addEventListener('click', deleteActiveCampaign);
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const jsonStr = JSON.stringify(buildJsonLdPayload(), null, 2);
    navigator.clipboard.writeText(jsonStr);
    showStatus("Campaign JSON-LD copied to clipboard!", "success");
  });
  document.getElementById('btn-copy-jsonld').addEventListener('click', () => {
    const jsonStr = JSON.stringify(buildJsonLdPayload(), null, 2);
    navigator.clipboard.writeText(jsonStr);
    showStatus("JSON-LD copied to clipboard!", "success");
  });

  // Hero management
  document.getElementById('btn-add-hero').addEventListener('click', () => {
    addNewHero();
  });

  document.getElementById('quick-archetype-select').addEventListener('change', (e) => {
    const key = e.target.value;
    if (key && ARCHETYPES[key]) {
      addArchetypeHero(ARCHETYPES[key]);
      e.target.value = "";
    }
  });

  document.getElementById('btn-quick-archetypes').addEventListener('click', () => {
    scaffoldFullSixHeroParty();
  });

  document.getElementById('btn-clone-hero').addEventListener('click', () => {
    if (activeHeroIndex >= 0 && currentCampaign.heroes[activeHeroIndex]) {
      const copy = JSON.parse(JSON.stringify(currentCampaign.heroes[activeHeroIndex]));
      copy.id = `hero-${Date.now()}`;
      copy.name = `${copy.name} (Copy)`;
      currentCampaign.heroes.push(copy);
      renderHeroRoster();
      selectHero(currentCampaign.heroes.length - 1);
      showStatus(`Cloned hero: ${copy.name}`);
    }
  });

  document.getElementById('btn-remove-hero').addEventListener('click', () => {
    if (activeHeroIndex >= 0 && currentCampaign.heroes[activeHeroIndex]) {
      const removed = currentCampaign.heroes.splice(activeHeroIndex, 1)[0];
      // Also remove from active party
      currentCampaign.gameState.activeParty = currentCampaign.gameState.activeParty.filter(id => id !== removed.id);
      renderHeroRoster();
      if (currentCampaign.heroes.length > 0) {
        selectHero(0);
      } else {
        clearHeroSheet();
      }
      showStatus(`Removed hero: ${removed.name}`);
    }
  });

  // Ability score inputs live modifier calculation
  ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(attr => {
    const input = document.getElementById(`attr-${attr}`);
    if (input) {
      input.addEventListener('input', () => {
        const val = parseInt(input.value, 10) || 10;
        const mod = Math.floor((val - 10) / 2);
        const modBadge = document.getElementById(`mod-${attr}`);
        if (modBadge) modBadge.textContent = (mod >= 0 ? `+${mod}` : `${mod}`);
        saveCurrentHeroFromSheet();
      });
    }
  });

  // Sheet inputs auto-save to active hero
  const sheetInputIds = [
    'hero-name', 'hero-level', 'hero-xp', 'hero-race', 'hero-class', 'hero-subclass',
    'hero-background', 'hero-alignment', 'hero-portrait-url',
    'combat-ac', 'combat-hp-max', 'combat-hp-current', 'combat-speed', 'combat-initiative', 'combat-prof',
    'equip-mainhand', 'equip-offhand', 'equip-armor', 'equip-helmet', 'equip-cloak', 'equip-boots',
    'equip-ring1', 'equip-quickitems', 'hero-spells', 'hero-backstory'
  ];
  sheetInputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => saveCurrentHeroFromSheet());
    }
  });

  // Quest and flag buttons
  document.getElementById('btn-add-quest').addEventListener('click', addNewQuest);
  document.getElementById('btn-add-flag').addEventListener('click', addNewFlag);
}

function calculateMod(score) {
  const mod = Math.floor(((parseInt(score, 10) || 10) - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

async function loadCampaignsList() {
  try {
    if (!window.robosCrpgCampaign) return;
    const res = await window.robosCrpgCampaign.listCampaigns();
    const select = document.getElementById('campaign-select');
    select.innerHTML = '';

    if (res.success && res.campaigns.length > 0) {
      res.campaigns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.slug;
        opt.textContent = `${c.title} (${c.heroCount} heroes, ${c.questCount} quests)`;
        select.appendChild(opt);
      });
      // Load first or default
      await loadSelectedCampaign(res.campaigns[0].slug);
    } else {
      // Default initial campaign
      const opt = document.createElement('option');
      opt.value = currentCampaign.slug;
      opt.textContent = currentCampaign.title;
      select.appendChild(opt);
      scaffoldFullSixHeroParty();
      populateOverviewForm();
      renderHeroRoster();
      renderGameStateTab();
      renderQuestsAndFlags();
    }
  } catch (err) {
    console.error('Error loading campaigns:', err);
  }
}

async function loadSelectedCampaign(slug) {
  try {
    if (!window.robosCrpgCampaign) return;
    const res = await window.robosCrpgCampaign.loadCampaign(slug);
    if (res.success && res.data) {
      const d = res.data;
      const gs = d['robos:gameState'] || d.gameState || {};
      const inv = gs['robos:sharedInventory'] || gs.sharedInventory || { gold: 150, sp: 40, cp: 120, items: [] };
      currentCampaign = {
        title: d['dcterms:title'] || d.title || slug,
        slug: slug,
        description: d['dcterms:description'] || d.description || '',
        setting: d['robos:setting'] || d.setting || 'Sword Coast',
        ruleSet: d['robos:ruleSet'] || d.ruleSet || 'D&D 5e SRD',
        difficulty: d['robos:difficulty'] || d.difficulty || 'Core Rules',
        startingScene: gs['robos:currentScene'] || gs.currentScene || d.startingScene || 'candlekeep-exterior',
        heroes: d['robos:heroes'] || d.heroes || [],
        gameState: {
          currentScene: gs['robos:currentScene'] || gs.currentScene || 'candlekeep-exterior',
          activeParty: gs['robos:activeParty'] || gs.activeParty || [],
          partyLeaderIndex: gs['robos:partyLeaderIndex'] ?? gs.partyLeaderIndex ?? 0,
          partyFormation: gs['robos:partyFormation'] || gs.partyFormation || 'rank',
          sharedInventory: {
            gold: inv.gold ?? 0,
            sp: inv.sp ?? 0,
            cp: inv.cp ?? 0,
            items: inv.items || []
          },
          questLog: gs['robos:questLog'] || gs.questLog || [],
          worldFlags: gs['robos:worldFlags'] || gs.worldFlags || {}
        }
      };

      // In case heroes list was empty, scaffold standard 6
      if (currentCampaign.heroes.length === 0) {
        scaffoldFullSixHeroParty();
      }

      populateOverviewForm();
      renderHeroRoster();
      if (currentCampaign.heroes.length > 0) {
        selectHero(0);
      }
      renderGameStateTab();
      renderQuestsAndFlags();
      showStatus(`Loaded campaign: ${currentCampaign.title}`, 'success', res.filePath);
    }
  } catch (err) {
    console.error('Error loading campaign:', err);
    showStatus(`Failed to load campaign: ${err.message}`, 'error');
  }
}

function populateOverviewForm() {
  document.getElementById('camp-title').value = currentCampaign.title || '';
  document.getElementById('camp-slug').value = currentCampaign.slug || '';
  document.getElementById('camp-setting').value = currentCampaign.setting || '';
  document.getElementById('camp-ruleset').value = currentCampaign.ruleSet || 'D&D 5e SRD';
  document.getElementById('camp-difficulty').value = currentCampaign.difficulty || 'Core Rules';
  document.getElementById('camp-desc').value = currentCampaign.description || '';

  const startingScene = currentCampaign.gameState?.currentScene || currentCampaign.startingScene || 'candlekeep-exterior';
  document.getElementById('camp-starting-scene-custom').value = startingScene;

  // Stats cards
  document.getElementById('stat-heroes-count').textContent = currentCampaign.heroes.length;
  document.getElementById('stat-party-count').textContent = currentCampaign.gameState?.activeParty?.length || 0;
  document.getElementById('stat-quests-count').textContent = currentCampaign.gameState?.questLog?.length || 0;
  const gold = currentCampaign.gameState?.sharedInventory?.gold || 0;
  document.getElementById('stat-gold-count').textContent = `${gold} gp`;
}

function saveOverviewForm() {
  currentCampaign.title = document.getElementById('camp-title').value.trim() || 'Untitled Campaign';
  currentCampaign.slug = document.getElementById('camp-slug').value.trim() || 'untitled-campaign';
  currentCampaign.setting = document.getElementById('camp-setting').value.trim();
  currentCampaign.ruleSet = document.getElementById('camp-ruleset').value;
  currentCampaign.difficulty = document.getElementById('camp-difficulty').value;
  currentCampaign.description = document.getElementById('camp-desc').value.trim();

  const customScene = document.getElementById('camp-starting-scene-custom').value.trim();
  if (customScene) {
    currentCampaign.startingScene = customScene;
    if (currentCampaign.gameState) {
      currentCampaign.gameState.currentScene = customScene;
    }
  }
}

function renderHeroRoster() {
  const container = document.getElementById('hero-list');
  container.innerHTML = '';
  document.getElementById('roster-count').textContent = currentCampaign.heroes.length;

  currentCampaign.heroes.forEach((h, idx) => {
    const item = document.createElement('div');
    item.className = `hero-item ${idx === activeHeroIndex ? 'active' : ''}`;
    item.innerHTML = `
      <div class="hero-thumb">${h.portrait || '👤'}</div>
      <div class="hero-meta">
        <div class="hero-item-name">${h.name}</div>
        <div class="hero-item-class">${h.race} ${h.class} (Lv ${h.level})</div>
        <div class="hero-item-vitals">
          <span class="badge-hp">HP ${h.hpCurrent}/${h.hpMax}</span>
          <span class="badge-ac">AC ${h.ac}</span>
        </div>
      </div>
    `;
    item.addEventListener('click', () => selectHero(idx));
    container.appendChild(item);
  });
}

function selectHero(index) {
  if (index < 0 || index >= currentCampaign.heroes.length) return;
  activeHeroIndex = index;
  renderHeroRoster();
  const hero = currentCampaign.heroes[index];

  document.getElementById('sheet-hero-name').textContent = `${hero.name} — Character Sheet`;
  document.getElementById('hero-name').value = hero.name || '';
  document.getElementById('hero-level').value = hero.level || 1;
  document.getElementById('hero-xp').value = hero.xp || 0;
  document.getElementById('hero-race').value = hero.race || 'Human';
  document.getElementById('hero-class').value = hero.class || 'Fighter';
  document.getElementById('hero-subclass').value = hero.subclass || '';
  document.getElementById('hero-background').value = hero.background || '';
  document.getElementById('hero-alignment').value = hero.alignment || 'Neutral Good';

  document.getElementById('hero-portrait-preview').textContent = hero.portrait || '👤';
  document.getElementById('hero-portrait-url').value = hero.portrait || '';

  // Ability Scores
  ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(attr => {
    const val = hero[attr] || 10;
    document.getElementById(`attr-${attr}`).value = val;
    document.getElementById(`mod-${attr}`).textContent = calculateMod(val);
  });

  // Combat
  document.getElementById('combat-ac').value = hero.ac || 10;
  document.getElementById('combat-hp-max').value = hero.hpMax || 10;
  document.getElementById('combat-hp-current').value = hero.hpCurrent || hero.hpMax || 10;
  document.getElementById('combat-speed').value = hero.speed || 30;
  document.getElementById('combat-initiative').value = hero.initiative || 0;
  document.getElementById('combat-prof').value = hero.prof || 2;

  // Equipment
  document.getElementById('equip-mainhand').value = hero.mainHand || '';
  document.getElementById('equip-offhand').value = hero.offHand || '';
  document.getElementById('equip-armor').value = hero.armor || '';
  document.getElementById('equip-helmet').value = hero.helmet || '';
  document.getElementById('equip-cloak').value = hero.cloak || '';
  document.getElementById('equip-boots').value = hero.boots || '';
  document.getElementById('equip-ring1').value = hero.ring1 || '';
  document.getElementById('equip-quickitems').value = hero.quickItems || '';

  // Spells & Backstory
  document.getElementById('hero-spells').value = hero.spells || '';
  document.getElementById('hero-backstory').value = hero.backstory || '';
}

function saveCurrentHeroFromSheet() {
  if (activeHeroIndex < 0 || !currentCampaign.heroes[activeHeroIndex]) return;
  const hero = currentCampaign.heroes[activeHeroIndex];

  hero.name = document.getElementById('hero-name').value.trim() || 'Hero';
  hero.level = parseInt(document.getElementById('hero-level').value, 10) || 1;
  hero.xp = parseInt(document.getElementById('hero-xp').value, 10) || 0;
  hero.race = document.getElementById('hero-race').value;
  hero.class = document.getElementById('hero-class').value;
  hero.subclass = document.getElementById('hero-subclass').value.trim();
  hero.background = document.getElementById('hero-background').value.trim();
  hero.alignment = document.getElementById('hero-alignment').value;

  const portrait = document.getElementById('hero-portrait-url').value.trim() || '👤';
  hero.portrait = portrait;
  document.getElementById('hero-portrait-preview').textContent = portrait;

  ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(attr => {
    hero[attr] = parseInt(document.getElementById(`attr-${attr}`).value, 10) || 10;
  });

  hero.ac = parseInt(document.getElementById('combat-ac').value, 10) || 10;
  hero.hpMax = parseInt(document.getElementById('combat-hp-max').value, 10) || 10;
  hero.hpCurrent = parseInt(document.getElementById('combat-hp-current').value, 10) || 10;
  hero.speed = parseInt(document.getElementById('combat-speed').value, 10) || 30;
  hero.initiative = parseInt(document.getElementById('combat-initiative').value, 10) || 0;
  hero.prof = parseInt(document.getElementById('combat-prof').value, 10) || 2;

  hero.mainHand = document.getElementById('equip-mainhand').value.trim();
  hero.offHand = document.getElementById('equip-offhand').value.trim();
  hero.armor = document.getElementById('equip-armor').value.trim();
  hero.helmet = document.getElementById('equip-helmet').value.trim();
  hero.cloak = document.getElementById('equip-cloak').value.trim();
  hero.boots = document.getElementById('equip-boots').value.trim();
  hero.ring1 = document.getElementById('equip-ring1').value.trim();
  hero.quickItems = document.getElementById('equip-quickitems').value.trim();

  hero.spells = document.getElementById('hero-spells').value.trim();
  hero.backstory = document.getElementById('hero-backstory').value.trim();

  // Refresh roster row
  renderHeroRoster();
}

function clearHeroSheet() {
  activeHeroIndex = -1;
  document.getElementById('sheet-hero-name').textContent = "Select or create a hero";
}

function addNewHero() {
  const newHero = {
    id: `hero-${Date.now()}`,
    name: "New Hero",
    race: "Human",
    class: "Fighter",
    subclass: "Champion",
    background: "Adventurer",
    alignment: "Neutral Good",
    level: 1,
    xp: 0,
    portrait: "⚔️",
    str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8,
    ac: 15, hpMax: 11, hpCurrent: 11, speed: 30, initiative: 1, prof: 2,
    mainHand: "Longsword",
    offHand: "Shield",
    armor: "Chain Shirt",
    helmet: "Iron Cap",
    cloak: "",
    boots: "Boots",
    ring1: "",
    quickItems: "Potion of Healing",
    spells: "Second Wind",
    backstory: "A newcomer to the sword coast..."
  };
  currentCampaign.heroes.push(newHero);
  renderHeroRoster();
  selectHero(currentCampaign.heroes.length - 1);
  showStatus(`Created hero: ${newHero.name}`);
}

function addArchetypeHero(arch) {
  const hero = JSON.parse(JSON.stringify(arch));
  hero.id = `hero-${Date.now()}`;
  currentCampaign.heroes.push(hero);
  renderHeroRoster();
  selectHero(currentCampaign.heroes.length - 1);
  showStatus(`Added archetype: ${hero.name} (${hero.class})`);
}

function scaffoldFullSixHeroParty() {
  currentCampaign.heroes = [
    JSON.parse(JSON.stringify(ARCHETYPES.fighter)),
    JSON.parse(JSON.stringify(ARCHETYPES.rogue)),
    JSON.parse(JSON.stringify(ARCHETYPES.wizard)),
    JSON.parse(JSON.stringify(ARCHETYPES.cleric)),
    JSON.parse(JSON.stringify(ARCHETYPES.ranger)),
    JSON.parse(JSON.stringify(ARCHETYPES.paladin))
  ];
  currentCampaign.gameState.activeParty = [
    ARCHETYPES.fighter.id,
    ARCHETYPES.rogue.id,
    ARCHETYPES.wizard.id,
    ARCHETYPES.cleric.id,
    ARCHETYPES.ranger.id,
    ARCHETYPES.paladin.id
  ];
  renderHeroRoster();
  selectHero(0);
  populateOverviewForm();
  showStatus("Scaffolded standard 6-hero Candlekeep party (Vance, Imoen, Ignis, Thrumbar, Elora, Faerûn)");
}

function renderGameStateTab() {
  const checklist = document.getElementById('party-checklist');
  checklist.innerHTML = '';
  const leaderSelect = document.getElementById('party-leader');
  leaderSelect.innerHTML = '';

  const activeIds = currentCampaign.gameState.activeParty || [];

  currentCampaign.heroes.forEach((h, idx) => {
    const isChecked = activeIds.includes(h.id);
    const item = document.createElement('label');
    item.className = 'party-check-item';
    item.innerHTML = `
      <input type="checkbox" value="${h.id}" ${isChecked ? 'checked' : ''}>
      <span>${h.portrait || '👤'} <strong>${h.name}</strong> (${h.race} ${h.class}, Lv ${h.level})</span>
    `;
    const cb = item.querySelector('input');
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!currentCampaign.gameState.activeParty.includes(h.id)) {
          currentCampaign.gameState.activeParty.push(h.id);
        }
      } else {
        currentCampaign.gameState.activeParty = currentCampaign.gameState.activeParty.filter(id => id !== h.id);
      }
      renderGameStateTab();
    });
    checklist.appendChild(item);

    if (isChecked) {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${h.name} (${h.class})`;
      if (idx === currentCampaign.gameState.partyLeaderIndex) {
        opt.selected = true;
      }
      leaderSelect.appendChild(opt);
    }
  });

  leaderSelect.addEventListener('change', (e) => {
    currentCampaign.gameState.partyLeaderIndex = parseInt(e.target.value, 10) || 0;
  });

  const formationSelect = document.getElementById('party-formation');
  formationSelect.value = currentCampaign.gameState.partyFormation || 'rank';
  formationSelect.addEventListener('change', (e) => {
    currentCampaign.gameState.partyFormation = e.target.value;
  });

  // Currencies
  const inv = currentCampaign.gameState.sharedInventory || { gold: 150, sp: 40, cp: 120, items: [] };
  const gpInput = document.getElementById('gold-gp');
  const spInput = document.getElementById('gold-sp');
  const cpInput = document.getElementById('gold-cp');
  gpInput.value = inv.gold || 0;
  spInput.value = inv.sp || 0;
  cpInput.value = inv.cp || 0;

  gpInput.addEventListener('input', () => { currentCampaign.gameState.sharedInventory.gold = parseInt(gpInput.value, 10) || 0; });
  spInput.addEventListener('input', () => { currentCampaign.gameState.sharedInventory.sp = parseInt(spInput.value, 10) || 0; });
  cpInput.addEventListener('input', () => { currentCampaign.gameState.sharedInventory.cp = parseInt(cpInput.value, 10) || 0; });

  // Items
  const itemsArea = document.getElementById('shared-items-text');
  if (Array.isArray(inv.items)) {
    itemsArea.value = inv.items.join('\n');
  }
  itemsArea.addEventListener('input', () => {
    currentCampaign.gameState.sharedInventory.items = itemsArea.value.split('\n').map(s => s.trim()).filter(Boolean);
  });
}

function renderQuestsAndFlags() {
  // Quests
  const qList = document.getElementById('quest-list');
  qList.innerHTML = '';
  const quests = currentCampaign.gameState.questLog || [];
  document.getElementById('quest-count').textContent = quests.length;

  quests.forEach((q, idx) => {
    const qEl = document.createElement('div');
    qEl.className = `quest-item ${q.status === 'completed' ? 'completed' : ''}`;
    qEl.innerHTML = `
      <div class="quest-header-row">
        <span class="quest-title-text">${q.title}</span>
        <div style="display:flex; gap:6px; align-items:center;">
          <select class="quest-status-select form-control-sm">
            <option value="active" ${q.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="completed" ${q.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="failed" ${q.status === 'failed' ? 'selected' : ''}>Failed</option>
          </select>
          <button class="btn btn-sm btn-danger btn-del-quest">×</button>
        </div>
      </div>
      <p style="font-size:11px; color:var(--text-secondary); margin-bottom:4px;">Giver: <strong>${q.giver || 'None'}</strong> | Stage: ${q.stage || 1}</p>
      <p style="font-size:12px; color:var(--text-primary);">${q.description}</p>
    `;

    qEl.querySelector('.quest-status-select').addEventListener('change', (e) => {
      q.status = e.target.value;
      renderQuestsAndFlags();
    });

    qEl.querySelector('.btn-del-quest').addEventListener('click', () => {
      currentCampaign.gameState.questLog.splice(idx, 1);
      renderQuestsAndFlags();
    });

    qList.appendChild(qEl);
  });

  // Flags
  const flagsTbody = document.getElementById('flags-table-body');
  flagsTbody.innerHTML = '';
  const flags = currentCampaign.gameState.worldFlags || {};

  Object.entries(flags).forEach(([key, val]) => {
    const row = document.createElement('tr');
    const isBool = typeof val === 'boolean';
    row.innerHTML = `
      <td><strong>${key}</strong></td>
      <td>
        ${isBool ? `
          <select class="flag-bool-select">
            <option value="true" ${val ? 'selected' : ''}>true</option>
            <option value="false" ${!val ? 'selected' : ''}>false</option>
          </select>
        ` : `
          <input type="text" class="flag-val-input" value="${val}">
        `}
      </td>
      <td><button class="btn btn-sm btn-danger btn-del-flag">Delete</button></td>
    `;

    if (isBool) {
      row.querySelector('.flag-bool-select').addEventListener('change', (e) => {
        flags[key] = (e.target.value === 'true');
      });
    } else {
      row.querySelector('.flag-val-input').addEventListener('input', (e) => {
        flags[key] = e.target.value;
      });
    }

    row.querySelector('.btn-del-flag').addEventListener('click', () => {
      delete flags[key];
      renderQuestsAndFlags();
    });

    flagsTbody.appendChild(row);
  });
}

function addNewQuest() {
  const title = prompt("Enter quest title:", "New Quest");
  if (!title) return;
  const desc = prompt("Enter quest objective:", "Complete the task assigned.");
  currentCampaign.gameState.questLog.push({
    id: `q-${Date.now()}`,
    title: title.trim(),
    status: "active",
    stage: 1,
    giver: "NPC",
    description: desc ? desc.trim() : ""
  });
  renderQuestsAndFlags();
}

function addNewFlag() {
  const key = prompt("Enter story flag identifier (e.g. talked_to_hull):");
  if (!key) return;
  const safeKey = key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!currentCampaign.gameState.worldFlags) {
    currentCampaign.gameState.worldFlags = {};
  }
  currentCampaign.gameState.worldFlags[safeKey] = false;
  renderQuestsAndFlags();
}

function buildJsonLdPayload() {
  saveOverviewForm();
  return {
    '@context': {
      'robos': 'urn:robos:',
      'dcterms': 'http://purl.org/dc/terms/',
      'xsd': 'http://www.w3.org/2001/XMLSchema#'
    },
    '@id': `urn:robos:crpg:campaign:${currentCampaign.slug}`,
    '@type': 'robos:CRPGCampaign',
    'dcterms:title': currentCampaign.title,
    'dcterms:description': currentCampaign.description,
    'robos:setting': currentCampaign.setting,
    'robos:ruleSet': currentCampaign.ruleSet,
    'robos:difficulty': currentCampaign.difficulty,
    'robos:heroes': currentCampaign.heroes,
    'robos:gameState': {
      'robos:currentScene': currentCampaign.startingScene,
      'robos:activeParty': currentCampaign.gameState.activeParty,
      'robos:partyLeaderIndex': currentCampaign.gameState.partyLeaderIndex,
      'robos:partyFormation': currentCampaign.gameState.partyFormation,
      'robos:sharedInventory': currentCampaign.gameState.sharedInventory,
      'robos:questLog': currentCampaign.gameState.questLog,
      'robos:worldFlags': currentCampaign.gameState.worldFlags
    }
  };
}

function updateJsonLdView() {
  const payload = buildJsonLdPayload();
  const viewer = document.getElementById('jsonld-viewer');
  if (viewer) {
    viewer.textContent = JSON.stringify(payload, null, 2);
  }
}

async function saveActiveCampaign() {
  try {
    saveOverviewForm();
    saveCurrentHeroFromSheet();
    const payload = buildJsonLdPayload();
    if (!window.robosCrpgCampaign) return;

    showStatus("Saving campaign...", "info");
    const res = await window.robosCrpgCampaign.saveCampaign({
      slug: currentCampaign.slug,
      data: payload
    });

    if (res.success) {
      showStatus(`Saved campaign successfully!`, "success", res.filePath);
      populateOverviewForm();
    } else {
      showStatus(`Save failed: ${res.error}`, "error");
    }
  } catch (err) {
    console.error("Save error:", err);
    showStatus(`Save error: ${err.message}`, "error");
  }
}

async function createNewCampaign() {
  const title = prompt("Enter new campaign title:", "New Campaign");
  if (!title) return;
  const slug = title.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

  currentCampaign = {
    title: title.trim(),
    slug: slug,
    description: "",
    setting: "Sword Coast",
    ruleSet: "D&D 5e SRD",
    difficulty: "Core Rules",
    startingScene: "candlekeep-exterior",
    heroes: [],
    gameState: {
      currentScene: "candlekeep-exterior",
      activeParty: [],
      partyLeaderIndex: 0,
      partyFormation: "rank",
      sharedInventory: { gold: 100, sp: 0, cp: 0, items: [] },
      questLog: [],
      worldFlags: {}
    }
  };

  scaffoldFullSixHeroParty();
  populateOverviewForm();
  renderHeroRoster();
  selectHero(0);
  renderGameStateTab();
  renderQuestsAndFlags();
  showStatus(`Created new campaign: ${title}`);
}

async function deleteActiveCampaign() {
  if (!confirm(`Are you sure you want to delete campaign "${currentCampaign.title}"?`)) return;
  try {
    if (!window.robosCrpgCampaign) return;
    const res = await window.robosCrpgCampaign.deleteCampaign(currentCampaign.slug);
    if (res.success) {
      showStatus(`Deleted campaign ${currentCampaign.slug}`);
      await loadCampaignsList();
    }
  } catch (err) {
    showStatus(`Failed to delete: ${err.message}`, 'error');
  }
}

function showStatus(msg, type = "info", filePath = "") {
  const msgEl = document.getElementById('status-message');
  if (msgEl) msgEl.textContent = msg;

  const pathEl = document.getElementById('status-filepath');
  if (pathEl) pathEl.textContent = filePath;
}
