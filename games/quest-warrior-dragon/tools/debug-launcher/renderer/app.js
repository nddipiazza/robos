const SCENE_MAP = {
  'world-map': 'WorldMap',
  'tantegel-castle-1f': 'Castle1F',
  'tantegel-castle-2f': 'ThroneRoom',
  'tantegel-castle-b1': 'CastleB1',
  'brecconary-1f': 'Brecconary',
  'garinham-1f': 'Garinham',
  'kol-1f': 'Kol',
  'rimuldar-1f': 'Rimuldar',
  'cantlin-1f': 'Cantlin',
  'hauksness-1f': 'Hauksness',
  'charlock-castle-1f': 'CharlockCastle1F',
  'charlock-castle-b1': 'CharlockCastleB1',
  'charlock-castle-b2': 'CharlockCastleB2',
  'charlock-castle-b3': 'CharlockCastleB3',
  'charlock-castle-b4': 'CharlockCastleB4',
  'charlock-castle-b5': 'CharlockCastleB5',
  'charlock-castle-b6': 'CharlockCastleB6',
  'charlock-castle-b7': 'CharlockCastleB7',
  'erdricks-cave-b1': 'ErdricksCaveB1',
  'erdricks-cave-b2': 'ErdricksCaveB2',
  'garinham-b1': 'GarinhamB1',
  'garinham-b2': 'GarinhamB2',
  'garinham-b3': 'GarinhamB3',
  'garinham-b4': 'GarinhamB4',
  'mountain-cave-b1': 'MountainCaveB1',
  'mountain-cave-b2': 'MountainCaveB2',
  'northern-cave-b1': 'StaffOfRainCave',
  'southern-cave-b1': 'RainbowDropCave',
  'swamp-cave-b1': 'SwampCave',
};

const SCENE_LAUNCH_MAP = {
  ...SCENE_MAP,
  'tantegel-castle-b1': 'TantegelBasement',
  'charlock-castle-b7': 'CharlockThroneRoom',
};

const AVAILABLE_SCENES = new Set([
  'TitleScreen', 'SaveSelect',
  'WorldMap', 'Castle1F', 'ThroneRoom', 'TantegelBasement', 'Brecconary', 'Garinham', 'Kol',
  'Rimuldar', 'Cantlin', 'Hauksness', 'CharlockCastle1F', 'CharlockCastleB1', 'CharlockCastleB2',
  'CharlockCastleB3', 'CharlockCastleB4', 'CharlockCastleB5', 'CharlockCastleB6', 'CharlockThroneRoom',
  'ErdricksCaveB1', 'ErdricksCaveB2', 'GarinhamB1', 'GarinhamB2', 'GarinhamB3', 'GarinhamB4',
  'MountainCaveB1', 'MountainCaveB2', 'SwampCave',
]);

const PRESETS = [
  {
    id: 'title-screen',
    icon: '🐉',
    name: 'Title Screen — Boot Flow',
    desc: 'Boots into the title screen. Press any key to reach the save-select list.',
    scene: 'TitleScreen',
    tile: null,
    facing: null,
    gold: 0,
    items: null,
    from: null,
    badges: [
      { label: 'TitleScreen', type: 'scene' },
    ],
  },
  {
    id: 'throne-start',
    icon: '👑',
    name: 'Throne Room — Opening',
    desc: 'Full intro cutscene plays. King greets hero. Door locked. No items.',
    scene: 'ThroneRoom',
    tile: null,
    facing: null,
    gold: 0,
    items: null,
    from: null,
    badges: [
      { label: 'ThroneRoom', type: 'scene' },
      { label: 'intro on', type: 'scene' },
      { label: '0g', type: 'gold' },
    ],
  },
  {
    id: 'throne-chests-done',
    icon: '🗝️',
    name: 'Throne Room — Chests Cleared',
    desc: 'Intro skipped. Door unlocked. All 3 chests opened. Hero has Torch + 120g.',
    scene: 'ThroneRoom',
    tile: '4,5',
    facing: 'up',
    gold: 120,
    items: 'Torch',
    from: 'debug',
    allChests: '7,2;5,5;6,5',
    unlockedDoors: 'throne_room',
    badges: [
      { label: 'ThroneRoom', type: 'scene' },
      { label: '120g', type: 'gold' },
      { label: 'Torch', type: 'item' },
      { label: 'door unlocked', type: 'item' },
    ],
  },
  {
    id: 'castle1f-arrival',
    icon: '🏰',
    name: 'Castle 1F — First Arrival',
    desc: 'Hero descends from ThroneRoom staircase. Torch + 120g in inventory.',
    scene: 'Castle1F',
    tile: '8,8',
    facing: 'right',
    gold: 120,
    items: 'Torch',
    from: 'ThroneRoom',
    badges: [
      { label: 'Castle1F', type: 'scene' },
      { label: '8,8 →right', type: 'scene' },
      { label: '120g', type: 'gold' },
      { label: 'Torch', type: 'item' },
    ],
  },
  {
    id: 'world-map',
    icon: '🗺️',
    name: 'World Map — Alefgard',
    desc: 'Hero spawns near Tantegel Castle on the overworld. Walk north to enter castle.',
    scene: 'WorldMap',
    tile: '46,44',
    facing: 'up',
    gold: 0,
    items: null,
    from: 'debug',
    badges: [
      { label: 'WorldMap', type: 'scene' },
      { label: '46,44 ↑up', type: 'scene' },
    ],
  },
];

const LEVEL_PRESETS = {
   1: { hp: 13, mp: 0, atk: 3, def: 3, agl: 3 },
   2: { hp: 19, mp: 5, atk: 4, def: 3, agl: 3 },
   3: { hp: 21, mp: 5, atk: 6, def: 5, agl: 5 },
   4: { hp: 27, mp: 10, atk: 6, def: 7, agl: 7 },
   5: { hp: 31, mp: 16, atk: 10, def: 9, agl: 9 },
   6: { hp: 34, mp: 18, atk: 14, def: 9, agl: 9 },
   7: { hp: 36, mp: 28, atk: 16, def: 15, agl: 15 },
   8: { hp: 41, mp: 32, atk: 19, def: 18, agl: 18 },
   9: { hp: 45, mp: 36, atk: 27, def: 19, agl: 19 },
  10: { hp: 48, mp: 40, atk: 31, def: 27, agl: 27 },
  11: { hp: 55, mp: 50, atk: 36, def: 31, agl: 31 },
  12: { hp: 56, mp: 58, atk: 43, def: 36, agl: 36 },
  13: { hp: 63, mp: 64, atk: 46, def: 43, agl: 43 },
  14: { hp: 70, mp: 70, atk: 54, def: 49, agl: 49 },
  15: { hp: 77, mp: 78, atk: 61, def: 57, agl: 57 },
  16: { hp: 82, mp: 82, atk: 64, def: 63, agl: 63 },
  17: { hp: 90, mp: 90, atk: 64, def: 70, agl: 70 },
  18: { hp: 103, mp: 95, atk: 76, def: 75, agl: 75 },
  19: { hp: 117, mp: 100, atk: 78, def: 77, agl: 77 },
  20: { hp: 124, mp: 100, atk: 82, def: 79, agl: 79 },
};

const SPELL_LEVELS = {
  heal: 3,
  hurt: 4,
  sleep: 7,
  radiant: 9,
  stopspell: 10,
  outside: 12,
  return: 13,
  repel: 15,
  healmore: 17,
  hurtmore: 19,
};

const BATTLE_ITEMS = [
  { name: 'Herb', max: 6 },
  { name: 'Torch', max: 3 },
  { name: 'Fairy Water', max: 3 },
  { name: 'Wings', max: 2 },
  { name: 'Magic Key', max: 9 },
  { name: "Dragon's Scale", max: 1 },
  { name: "Fighter's Ring", max: 1 },
];

const $ = id => document.getElementById(id);
const logEl = $('log-output');

let _monsters = [];
let _spells = [];
let _weapons = [];
let _armors = [];
let _saveStateData = {
  chestRegistry: {},
  doorRegistry: {},
  weapons: [],
  armors: [],
  items: [],
  spells: [],
  mapSpawns: [],
  mapGridKeys: [],
  inventoryChoices: [],
  inventoryChoiceMap: new Map(),
};
let _saveStateInventory = [];
let _saveStateActionsBound = false;

function appendLog(msg) {
  logEl.textContent += msg;
  logEl.scrollTop = logEl.scrollHeight;
}

function asNumber(id, fallback = 0) {
  const value = parseInt($(id).value, 10);
  return Number.isFinite(value) ? value : fallback;
}

function parseTile(tile, fallback = [4, 5]) {
  if (!tile || typeof tile !== 'string') return fallback;
  const parts = tile.split(',').map(part => parseInt(part.trim(), 10));
  if (parts.length !== 2 || parts.some(Number.isNaN)) return fallback;
  return parts;
}

function normalizeMapKey(mapKey) {
  if (!mapKey) return 'world-map';
  if (SCENE_MAP[mapKey]) return mapKey;

  const withoutEntry = mapKey.replace(/-entry-\d+$/, '');
  if (SCENE_MAP[withoutEntry]) return withoutEntry;
  if (SCENE_MAP[`${mapKey}-1f`]) return `${mapKey}-1f`;
  if (SCENE_MAP[`${withoutEntry}-1f`]) return `${withoutEntry}-1f`;
  return mapKey;
}

function getLaunchSceneForMapKey(mapKey) {
  const key = normalizeMapKey(mapKey);
  return SCENE_LAUNCH_MAP[key] || SCENE_MAP[key] || key;
}

function getMapKeyForScene(scene, explicitMapKey = '') {
  if (explicitMapKey) {
    const normalized = normalizeMapKey(explicitMapKey);
    if (SCENE_MAP[normalized]) return normalized;
  }

  const direct = Object.entries(SCENE_LAUNCH_MAP).find(([, sceneId]) => sceneId === scene);
  if (direct) return direct[0];

  const fallback = Object.entries(SCENE_MAP).find(([, sceneId]) => sceneId === scene);
  if (fallback) return fallback[0];

  return normalizeMapKey(scene);
}

function setTabHandlers() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function renderPresets() {
  const container = $('preset-list');
  container.innerHTML = '';

  PRESETS.forEach(preset => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.dataset.id = preset.id;

    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = preset.icon;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = preset.name;

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = preset.desc;

    const badgeRow = document.createElement('div');
    badgeRow.className = 'badge-row';
    preset.badges.forEach(badge => {
      const span = document.createElement('span');
      span.className = `badge ${badge.type}`;
      span.textContent = badge.label;
      badgeRow.appendChild(span);
    });

    card.append(icon, name, desc, badgeRow);
    card.addEventListener('click', () => launchPreset(preset));
    container.appendChild(card);
  });
}

async function launchPreset(preset) {
  appendLog(`\n▶ Launching: ${preset.name}\n`);
  const result = await window.dw.launch(preset);
  if (!result.ok) appendLog('[error] launch failed\n');
}

async function initBattleTab() {
  [_monsters, _spells, _weapons, _armors] = await Promise.all([
    window.dw.loadMonsters(),
    window.dw.loadSpells(),
    window.dw.loadWeapons(),
    window.dw.loadArmor(),
  ]);

  const monSel = $('mon-select');
  monSel.innerHTML = '';
  _monsters.forEach(monster => {
    const option = document.createElement('option');
    option.value = monster.key;
    option.textContent = monster.name;
    monSel.appendChild(option);
  });
  updateMonPreview();

  const weaponSelect = $('weapon-select');
  weaponSelect.innerHTML = '<option value="">— none —</option>';
  _weapons.forEach(weapon => {
    const option = document.createElement('option');
    option.value = weapon.id;
    option.textContent = `${weapon.name} (ATK +${weapon.attack})`;
    weaponSelect.appendChild(option);
  });

  const armorSelect = $('armor-select');
  armorSelect.innerHTML = '<option value="">— none —</option>';
  _armors.forEach(armor => {
    const option = document.createElement('option');
    option.value = armor.id;
    option.textContent = `${armor.name} (DEF +${armor.defense})`;
    armorSelect.appendChild(option);
  });

  const spellList = $('spell-list');
  spellList.innerHTML = '';
  _spells.forEach(spell => {
    const row = document.createElement('label');
    row.className = 'check-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'spell';
    checkbox.value = spell.id;

    const spellName = document.createElement('span');
    spellName.className = 'spell-name';
    spellName.textContent = spell.name;

    const spellMp = document.createElement('span');
    spellMp.className = 'spell-mp';
    spellMp.textContent = `${spell.mp_cost}MP`;

    const spellLv = document.createElement('span');
    spellLv.className = 'spell-lv';
    spellLv.textContent = `Lv${spell.level_learned}`;

    row.append(checkbox, spellName, spellMp, spellLv);
    spellList.appendChild(row);
  });

  const itemList = $('item-list');
  itemList.innerHTML = '';
  BATTLE_ITEMS.forEach(item => {
    const row = document.createElement('div');
    row.className = 'item-row';

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'item-qty';
    input.dataset.item = item.name;
    input.value = '0';
    input.min = '0';
    input.max = String(item.max);

    row.append(name, input);
    itemList.appendChild(row);
  });

  const levelSelect = $('ql-select');
  levelSelect.innerHTML = '<option value="">— pick level —</option>';
  Object.keys(LEVEL_PRESETS).forEach(level => {
    const option = document.createElement('option');
    option.value = level;
    option.textContent = `Level ${level}`;
    levelSelect.appendChild(option);
  });
}

function updateMonPreview() {
  const monster = _monsters.find(entry => entry.key === $('mon-select').value);
  const box = $('mon-preview');
  if (!monster) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = `
    <table class="stat-table">
      <tr><td>HP</td><td>${monster.hp_min}–${monster.hp_max}</td></tr>
      <tr><td>STR</td><td>${monster.strength}</td></tr>
      <tr><td>AGL</td><td>${monster.agility}</td></tr>
      <tr><td>XP</td><td>${monster.xp}</td></tr>
      <tr><td>GP</td><td>${monster.gp_min}–${monster.gp_max}</td></tr>
      <tr><td>Sleep</td><td>${monster.resist_sleep ? '✓ immune' : 'susceptible'}</td></tr>
    </table>`;
}

function createInventoryChoice(entry, kind) {
  if (!entry || !entry.id) return null;
  if (kind === 'weapon') return { id: entry.id, name: entry.name, desc: `Weapon · ATK +${entry.attack}` };
  if (kind === 'armor') return { id: entry.id, name: entry.name, desc: `Armor · DEF +${entry.defense}` };

  return {
    id: entry.id,
    name: entry.name,
    desc: entry.desc || entry.effect || entry.description || entry.note || entry.category || 'Item',
  };
}

function populateSceneDropdown() {
  const select = $('ss-scene');
  const preferredOrder = _saveStateData.mapGridKeys.length ? _saveStateData.mapGridKeys : Object.keys(SCENE_MAP);
  const keys = [...new Set([...preferredOrder, ...Object.keys(SCENE_MAP)])].filter(key => SCENE_MAP[key]);
  select.innerHTML = '';

  keys.forEach(mapKey => {
    const option = document.createElement('option');
    option.value = mapKey;

    const desiredScene = SCENE_MAP[mapKey];
    const launchScene = getLaunchSceneForMapKey(mapKey);
    let label = `${mapKey} → ${desiredScene}`;
    if (launchScene !== desiredScene) label += ` (launches ${launchScene})`;
    if (!AVAILABLE_SCENES.has(launchScene)) label += ' (scene missing)';

    option.textContent = label;
    select.appendChild(option);
  });

  select.value = select.querySelector('option[value="world-map"]') ? 'world-map' : select.options[0]?.value || '';
}

function populateSpawnPresets() {
  const select = $('ss-spawn-preset');
  select.innerHTML = '<option value="">— pick map spawn —</option>';

  (_saveStateData.mapSpawns || []).forEach((entry, index) => {
    const option = document.createElement('option');
    const mapKey = normalizeMapKey(entry.map);
    const x = entry.world?.x ?? 0;
    const y = entry.world?.y ?? 0;
    option.value = String(index);
    option.textContent = `${entry.map} → ${mapKey} (${x},${y}) ${entry.facing || ''}`.trim();
    select.appendChild(option);
  });
}

function populateEquipment() {
  const weaponSelect = $('ss-weapon');
  weaponSelect.innerHTML = '<option value="">— none —</option>';
  _saveStateData.weapons.forEach(weapon => {
    const option = document.createElement('option');
    option.value = weapon.id;
    option.textContent = `${weapon.name} (ATK +${weapon.attack})`;
    weaponSelect.appendChild(option);
  });

  const armorSelect = $('ss-armor');
  armorSelect.innerHTML = '<option value="">— none —</option>';
  _saveStateData.armors.forEach(armor => {
    const option = document.createElement('option');
    option.value = armor.id;
    option.textContent = `${armor.name} (DEF +${armor.defense})`;
    armorSelect.appendChild(option);
  });
}

function populateSaveStateSpells() {
  const container = $('ss-spells');
  container.innerHTML = '';

  _saveStateData.spells.forEach(spell => {
    const row = document.createElement('label');
    row.className = 'check-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = spell.id;

    const name = document.createElement('span');
    name.className = 'spell-name';
    name.textContent = spell.name;

    const mp = document.createElement('span');
    mp.className = 'spell-mp';
    mp.textContent = `${spell.mp_cost}MP`;

    const level = document.createElement('span');
    level.className = 'spell-lv';
    level.textContent = `Lv${spell.level_learned}`;

    row.append(checkbox, name, mp, level);
    container.appendChild(row);
  });
}

function populateInventoryChoices() {
  const choices = [
    ..._saveStateData.items.map(item => createInventoryChoice(item, 'item')),
    ..._saveStateData.weapons.map(weapon => createInventoryChoice(weapon, 'weapon')),
    ..._saveStateData.armors.map(armor => createInventoryChoice(armor, 'armor')),
  ].filter(Boolean);

  _saveStateData.inventoryChoices = choices;
  _saveStateData.inventoryChoiceMap = new Map(choices.map(choice => [choice.id, choice]));

  const select = $('ss-item-add');
  select.innerHTML = '<option value="">— add item —</option>';
  choices.forEach(choice => {
    const option = document.createElement('option');
    option.value = choice.id;
    option.textContent = `${choice.name} — ${choice.desc}`;
    select.appendChild(option);
  });
}

function renderInventoryList() {
  const list = $('ss-inventory-list');
  list.innerHTML = '';

  if (!_saveStateInventory.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Inventory is empty.';
    list.appendChild(empty);
    return;
  }

  _saveStateInventory.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'inventory-item';

    const meta = document.createElement('div');
    meta.className = 'inventory-item-meta';

    const name = document.createElement('span');
    name.textContent = item.name || item.id || 'Unknown item';

    const desc = document.createElement('span');
    desc.textContent = item.desc || item.id || '';

    meta.append(name, desc);

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-btn';
    removeButton.textContent = '✕';
    removeButton.addEventListener('click', () => {
      _saveStateInventory.splice(index, 1);
      renderInventoryList();
    });

    row.append(meta, removeButton);
    list.appendChild(row);
  });
}

function renderRegistryGroup(containerId, registry) {
  const container = $(containerId);
  container.innerHTML = '';

  const entries = Object.entries(registry || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No registry data found.';
    container.appendChild(empty);
    return;
  }

  const currentMap = $('ss-scene').value;
  entries.forEach(([mapKey, values]) => {
    const details = document.createElement('details');
    details.className = 'ss-map-group';
    details.open = normalizeMapKey(mapKey) === normalizeMapKey(currentMap);
    details.dataset.mapKey = mapKey;

    const summary = document.createElement('summary');
    summary.textContent = `${mapKey} (${values.length})`;
    details.appendChild(summary);

    const items = document.createElement('div');
    items.className = 'ss-map-items';

    values.forEach(value => {
      const row = document.createElement('label');
      row.className = 'check-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.id = value.id;
      checkbox.dataset.mapKey = mapKey;

      const text = document.createElement('span');
      text.className = 'spell-name';
      const hidden = value.hidden ? ' hidden' : '';
      text.textContent = `${value.id} (${value.col},${value.row})${hidden}`;

      row.append(checkbox, text);
      items.appendChild(row);
    });

    details.appendChild(items);
    container.appendChild(details);
  });
}

function openRegistryGroup(mapKey) {
  ['ss-chests', 'ss-doors'].forEach(containerId => {
    $(containerId).querySelectorAll('.ss-map-group').forEach(group => {
      group.open = normalizeMapKey(group.dataset.mapKey) === normalizeMapKey(mapKey);
    });
  });
}

function setCheckboxes(containerId, checked) {
  $(containerId).querySelectorAll('input[type="checkbox"]').forEach(box => {
    box.checked = checked;
  });
}

function getCheckedIdMap(containerId) {
  return [...$(containerId).querySelectorAll('input[type="checkbox"]:checked')].reduce((acc, checkbox) => {
    acc[checkbox.dataset.id] = true;
    return acc;
  }, {});
}

function normalizeItemRecord(item) {
  if (!item) return null;

  if (typeof item === 'string') {
    const choice = _saveStateData.inventoryChoiceMap.get(item);
    return choice ? { ...choice } : { id: item, name: item, desc: '' };
  }

  const id = item.id || item.name || '';
  const choice = _saveStateData.inventoryChoiceMap.get(id);
  return {
    id,
    name: item.name || choice?.name || id,
    desc: item.desc || choice?.desc || '',
  };
}

function normalizeIdSet(source) {
  if (Array.isArray(source)) return new Set(source.map(String));
  if (source && typeof source === 'object') return new Set(Object.keys(source).filter(key => source[key]));
  return new Set();
}

function setCheckedFromSource(containerId, source) {
  const wanted = normalizeIdSet(source);
  $(containerId).querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.checked = wanted.has(checkbox.dataset.id);
  });
}

function buildSaveState() {
  const mapKey = normalizeMapKey($('ss-scene').value);
  return {
    mapKey,
    scene: getLaunchSceneForMapKey(mapKey),
    tile: `${asNumber('ss-tile-x', 4)},${asNumber('ss-tile-y', 5)}`,
    facing: $('ss-facing').value,
    from: $('ss-come-from').value.trim(),
    gold: asNumber('ss-gold', 0),
    bridgeBuilt: $('ss-bridge').checked,
    heroName: $('ss-name').value.trim() || 'ERDRICK',
    heroLevel: asNumber('ss-level', 1),
    heroHp: asNumber('ss-hp', 15),
    heroHpMax: asNumber('ss-hp-max', 15),
    heroMp: asNumber('ss-mp', 0),
    heroMpMax: asNumber('ss-mp-max', 0),
    heroStr: asNumber('ss-str', 4),
    heroAgl: asNumber('ss-agl', 4),
    heroAtk: asNumber('ss-atk', 4),
    heroDef: asNumber('ss-def', 2),
    heroExp: asNumber('ss-exp', 0),
    heroWeapon: $('ss-weapon').value,
    heroArmor: $('ss-armor').value,
    heroSpells: [...$('ss-spells').querySelectorAll('input[type="checkbox"]:checked')].map(box => box.value),
    items: _saveStateInventory.map(item => ({ name: item.name, id: item.id, desc: item.desc })),
    openedChests: getCheckedIdMap('ss-chests'),
    unlockedDoors: getCheckedIdMap('ss-doors'),
  };
}

function ensureSelectOption(selectId, value, label) {
  if (!value) return;
  const select = $(selectId);
  if ([...select.options].some(option => option.value === value)) return;

  const option = document.createElement('option');
  option.value = value;
  option.textContent = label || value;
  select.appendChild(option);
}

function loadSaveStateIntoEditor(data = {}) {
  const mapKey = getMapKeyForScene(data.scene || '', data.mapKey || '');
  ensureSelectOption('ss-scene', mapKey, `${mapKey} → ${SCENE_MAP[mapKey] || data.scene || mapKey}`);
  $('ss-scene').value = mapKey;

  const [tileX, tileY] = parseTile(data.tile, [4, 5]);
  $('ss-tile-x').value = tileX;
  $('ss-tile-y').value = tileY;
  $('ss-facing').value = data.facing || 'up';
  $('ss-come-from').value = data.from ?? 'debug';
  $('ss-name').value = data.heroName ?? 'ERDRICK';
  $('ss-level').value = data.heroLevel ?? 1;
  $('ss-hp').value = data.heroHp ?? 15;
  $('ss-hp-max').value = data.heroHpMax ?? data.heroHp ?? 15;
  $('ss-mp').value = data.heroMp ?? 0;
  $('ss-mp-max').value = data.heroMpMax ?? data.heroMp ?? 0;
  $('ss-str').value = data.heroStr ?? 4;
  $('ss-agl').value = data.heroAgl ?? 4;
  $('ss-atk').value = data.heroAtk ?? 4;
  $('ss-def').value = data.heroDef ?? 2;
  $('ss-exp').value = data.heroExp ?? 0;
  $('ss-gold').value = data.gold ?? 0;
  $('ss-bridge').checked = Boolean(data.bridgeBuilt);

  ensureSelectOption('ss-weapon', data.heroWeapon || '', data.heroWeapon || '');
  ensureSelectOption('ss-armor', data.heroArmor || '', data.heroArmor || '');
  $('ss-weapon').value = data.heroWeapon || '';
  $('ss-armor').value = data.heroArmor || '';

  const spellSet = new Set(data.heroSpells || data.spells || []);
  $('ss-spells').querySelectorAll('input[type="checkbox"]').forEach(box => {
    box.checked = spellSet.has(box.value);
  });

  const inventory = data.items || data.inventory || [];
  _saveStateInventory = inventory.map(normalizeItemRecord).filter(Boolean);
  renderInventoryList();

  setCheckedFromSource('ss-chests', data.openedChests || {});
  setCheckedFromSource('ss-doors', data.unlockedDoors || {});
  openRegistryGroup(mapKey);
}

async function refreshSaveStateFileList() {
  const files = await window.dw.listSaveStates();
  const container = $('ss-file-list');
  container.innerHTML = '';

  if (!files.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No saved states yet.';
    container.appendChild(empty);
    return;
  }

  files.forEach(file => {
    const entry = document.createElement('div');
    entry.className = 'ss-file-entry';

    const name = document.createElement('div');
    name.className = 'ss-file-name';
    name.textContent = file;

    const buttons = document.createElement('div');
    buttons.className = 'ss-file-btns';

    const loadButton = document.createElement('button');
    loadButton.className = 'ss-file-btn';
    loadButton.textContent = '📂 Load';
    loadButton.addEventListener('click', async () => {
      const state = await window.dw.loadSaveState(file);
      if (!state) {
        appendLog(`[error] could not load ${file}\n`);
        return;
      }
      $('ss-save-name').value = file.replace(/\.json$/i, '');
      loadSaveStateIntoEditor(state);
      appendLog(`[save-state] loaded ${file}\n`);
    });

    const launchButton = document.createElement('button');
    launchButton.className = 'ss-file-btn';
    launchButton.textContent = '▶ Launch';
    launchButton.addEventListener('click', async () => {
      const state = await window.dw.loadSaveState(file);
      if (!state) {
        appendLog(`[error] could not load ${file}\n`);
        return;
      }
      loadSaveStateIntoEditor(state);
      const result = await window.dw.launchSaveState(state);
      if (!result.ok) appendLog('[error] launch failed\n');
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'ss-file-btn';
    deleteButton.textContent = '🗑 Delete';
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm(`Delete save state ${file}?`)) return;
      await window.dw.deleteSaveState(file);
      appendLog(`[save-state] deleted ${file}\n`);
      await refreshSaveStateFileList();
    });

    buttons.append(loadButton, launchButton, deleteButton);
    entry.append(name, buttons);
    container.appendChild(entry);
  });
}

function bindSaveStateActions() {
  if (_saveStateActionsBound) return;
  _saveStateActionsBound = true;

  $('ss-scene').addEventListener('change', event => openRegistryGroup(event.target.value));
  $('ss-spawn-preset').addEventListener('change', event => {
    if (event.target.value === '') return;

    const spawn = _saveStateData.mapSpawns[Number(event.target.value)];
    if (!spawn) return;

    const mapKey = normalizeMapKey(spawn.map);
    ensureSelectOption('ss-scene', mapKey, `${mapKey} → ${SCENE_MAP[mapKey] || getLaunchSceneForMapKey(mapKey)}`);
    $('ss-scene').value = mapKey;
    $('ss-tile-x').value = spawn.world?.x ?? 0;
    $('ss-tile-y').value = spawn.world?.y ?? 0;
    $('ss-facing').value = spawn.facing || 'up';
    $('ss-come-from').value = 'world_map';
    openRegistryGroup(mapKey);
  });

  $('btn-ss-add-item').addEventListener('click', () => {
    const choice = _saveStateData.inventoryChoiceMap.get($('ss-item-add').value);
    if (!choice) return;

    _saveStateInventory.push({ ...choice });
    $('ss-item-add').value = '';
    renderInventoryList();
  });

  $('btn-ss-all-chests').addEventListener('click', () => setCheckboxes('ss-chests', true));
  $('btn-ss-no-chests').addEventListener('click', () => setCheckboxes('ss-chests', false));
  $('btn-ss-all-doors').addEventListener('click', () => setCheckboxes('ss-doors', true));
  $('btn-ss-no-doors').addEventListener('click', () => setCheckboxes('ss-doors', false));

  $('btn-ss-save').addEventListener('click', async () => {
    const name = $('ss-save-name').value.trim();
    if (!name) {
      appendLog('[error] save state name is required\n');
      return;
    }

    const state = buildSaveState();
    const result = await window.dw.saveSaveState(name, state);
    if (!result.ok) {
      appendLog(`[error] ${result.error || 'save failed'}\n`);
      return;
    }

    $('ss-save-name').value = result.file.replace(/\.json$/i, '');
    appendLog(`[save-state] saved ${result.file}\n`);
    await refreshSaveStateFileList();
  });

  $('btn-ss-launch').addEventListener('click', async () => {
    const result = await window.dw.launchSaveState(buildSaveState());
    if (!result.ok) appendLog('[error] launch failed\n');
  });
}

async function initSaveStateTab() {
  const [chestRegistry, doorRegistry, weapons, armors, items, spells, mapSpawns, mapGridKeys] = await Promise.all([
    window.dw.loadChestRegistry(),
    window.dw.loadDoorRegistry(),
    window.dw.loadWeapons(),
    window.dw.loadArmor(),
    window.dw.loadItems(),
    window.dw.loadSpells(),
    window.dw.loadMapSpawns(),
    window.dw.loadMapGridsKeys(),
  ]);

  _saveStateData = {
    chestRegistry: chestRegistry || {},
    doorRegistry: doorRegistry || {},
    weapons: weapons || [],
    armors: armors || [],
    items: items || [],
    spells: spells || [],
    mapSpawns: mapSpawns?.map_entry_points || [],
    mapGridKeys: mapGridKeys || [],
    inventoryChoices: [],
    inventoryChoiceMap: new Map(),
  };

  populateSceneDropdown();
  populateSpawnPresets();
  populateEquipment();
  populateSaveStateSpells();
  populateInventoryChoices();
  renderInventoryList();
  renderRegistryGroup('ss-chests', _saveStateData.chestRegistry);
  renderRegistryGroup('ss-doors', _saveStateData.doorRegistry);
  bindSaveStateActions();
  loadSaveStateIntoEditor(buildSaveState());
  await refreshSaveStateFileList();
}

window.dw.onLog(msg => appendLog(msg));

$('btn-clear-log').addEventListener('click', () => {
  logEl.textContent = '';
});

$('btn-kill').addEventListener('click', async () => {
  const { killed } = await window.dw.killGame();
  appendLog(killed ? '[launcher] game process killed\n' : '[launcher] no game running\n');
});

$('mon-select').addEventListener('change', updateMonPreview);

$('weapon-select').addEventListener('change', () => {
  const weapon = _weapons.find(entry => entry.id === $('weapon-select').value);
  if (weapon) {
    $('weapon-preview').textContent = `ATK +${weapon.attack}`;
    $('h-atk').value = weapon.attack;
  } else {
    $('weapon-preview').textContent = '';
  }
});

$('armor-select').addEventListener('change', () => {
  const armor = _armors.find(entry => entry.id === $('armor-select').value);
  if (armor) {
    $('armor-preview').textContent = `DEF +${armor.defense}`;
    $('h-def').value = armor.defense;
  } else {
    $('armor-preview').textContent = '';
  }
});

$('ql-select').addEventListener('change', () => {
  const level = parseInt($('ql-select').value, 10);
  const stats = LEVEL_PRESETS[level];
  if (!stats) return;

  $('h-hp').value = stats.hp;
  $('h-mp').value = stats.mp;
  $('h-atk').value = stats.atk;
  $('h-def').value = stats.def;
  $('h-agl').value = stats.agl;

  document.querySelectorAll('input[name="spell"]').forEach(box => {
    box.checked = level >= (SPELL_LEVELS[box.value] || 99);
  });

  $('ql-select').value = '';
});

$('btn-launch-battle').addEventListener('click', async () => {
  const checkedSpells = [...document.querySelectorAll('input[name="spell"]:checked')].map(box => box.value);
  const itemParts = [...document.querySelectorAll('.item-qty')]
    .filter(input => parseInt(input.value, 10) > 0)
    .map(input => `${input.dataset.item},${input.value}`);

  const preset = {
    scene: 'BattleTest',
    monster: $('mon-select').value,
    heroHp: asNumber('h-hp', 15),
    heroMp: asNumber('h-mp', 0),
    heroAtk: asNumber('h-atk', 4),
    heroDef: asNumber('h-def', 2),
    heroAgl: asNumber('h-agl', 4),
    heroSpells: checkedSpells.length ? checkedSpells.join(';') : null,
    heroWeapon: $('weapon-select').value || null,
    heroArmor: $('armor-select').value || null,
    items: itemParts.length ? itemParts.join(';') : null,
    gold: 0,
    from: 'debug',
    name: `Battle — ${$('mon-select').value}`,
  };

  appendLog(`\n▶ Launching battle: ${preset.monster} | HP=${preset.heroHp} MP=${preset.heroMp} ATK=${preset.heroAtk} DEF=${preset.heroDef} AGL=${preset.heroAgl}\n`);
  if (checkedSpells.length) appendLog(`  Spells: ${checkedSpells.join(', ')}\n`);
  if (itemParts.length) appendLog(`  Items: ${itemParts.join(', ')}\n`);

  const result = await window.dw.launch(preset);
  if (!result.ok) appendLog('[error] launch failed\n');
});

async function init() {
  setTabHandlers();
  renderPresets();
  appendLog('Quest: Warrior Dragon Debug Launcher ready.\n');
  appendLog(`Project: ${location.href.replace(/[^/]+$/, '../../..')}\n\n`);
  await Promise.all([initBattleTab(), initSaveStateTab()]);
}

init().catch(error => {
  appendLog(`[error] ${error?.stack || error}\n`);
});
