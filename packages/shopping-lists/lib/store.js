'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DEFAULT_LISTS, UNITS, BADGES, detectAisle, parseSmartItemsOffline } = require('./defaults');

const SCHEMA_VERSION = 1;

function newId(prefix = 'item') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function roundMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function roundQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(n * 100) / 100;
}

function normalizeItem(raw, list, nowIso) {
  const name = String(raw?.name || '').trim();
  if (!name) return null;
  const aisle = raw?.aisle && raw.aisle !== 'auto'
    ? String(raw.aisle).trim()
    : detectAisle(list, name);
  return {
    id: String(raw?.id || newId('item')),
    name,
    qty: roundQty(raw?.qty ?? 1),
    unit: UNITS.includes(raw?.unit) ? raw.unit : (String(raw?.unit || 'ea').trim() || 'ea'),
    aisle: aisle || 'General',
    estPrice: roundMoney(raw?.estPrice),
    badge: String(raw?.badge || '').trim(),
    note: String(raw?.note || '').trim(),
    checked: Boolean(raw?.checked),
    addedAt: raw?.addedAt || nowIso,
    updatedAt: raw?.updatedAt || nowIso,
    checkedAt: raw?.checked ? (raw?.checkedAt || nowIso) : null,
  };
}

function buildSeedState(nowIso = new Date().toISOString()) {
  const lists = DEFAULT_LISTS.map((tpl) => {
    const baseList = {
      id: tpl.id,
      slug: tpl.slug,
      name: tpl.name,
      subtitle: tpl.subtitle,
      icon: tpl.icon,
      accent: tpl.accent,
      accentGlow: tpl.accentGlow,
      docTitle: tpl.docTitle,
      householdCategory: tpl.householdCategory,
      aisles: [...tpl.aisles],
      staples: tpl.staples.map((s) => ({ ...s })),
      items: [],
      updatedAt: nowIso,
    };
    baseList.items = tpl.starterItems
      .map((item) => normalizeItem(item, baseList, nowIso))
      .filter(Boolean);
    return baseList;
  });

  return {
    schema: SCHEMA_VERSION,
    activeListId: 'grocery',
    lists,
    undoStack: [],
    sync: {
      accountId: '',
      folderId: '',
      folderName: 'RobOS Household Shopping Lists',
      folderUrl: '',
      manifestFileId: '',
      appsScriptFolderId: '',
      appsScriptWebAppUrl: '',
      docIds: {},
      docUrls: {},
      autoSync: false,
      lastSyncedAt: null,
      lastSyncStatus: 'idle',
      lastSyncMessage: '',
    },
    updatedAt: nowIso,
  };
}

function computeListStats(list) {
  const items = Array.isArray(list?.items) ? list.items : [];
  let toBuyCount = 0;
  let checkedCount = 0;
  let estRemaining = 0;
  let estChecked = 0;
  let estTotal = 0;
  for (const item of items) {
    const lineTotal = item.estPrice != null ? item.estPrice * (item.qty || 1) : 0;
    estTotal += lineTotal;
    if (item.checked) {
      checkedCount += 1;
      estChecked += lineTotal;
    } else {
      toBuyCount += 1;
      estRemaining += lineTotal;
    }
  }
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  return {
    totalCount,
    toBuyCount,
    checkedCount,
    progressPct,
    estRemaining: Math.round(estRemaining * 100) / 100,
    estChecked: Math.round(estChecked * 100) / 100,
    estTotal: Math.round(estTotal * 100) / 100,
  };
}

function createStore(options = {}) {
  const homeDir = options.homeDir || process.env.HOME || os.homedir();
  const configDir = options.configDir || process.env.ROBOS_CONFIG_DIR || path.join(homeDir, '.config', 'robos');
  const filePath = options.filePath || path.join(configDir, 'household', 'shopping-lists.json');
  const listeners = new Set();

  let state = null;

  function ensureLoaded() {
    if (state) return state;
    if (fs.existsSync(filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (raw && Array.isArray(raw.lists) && raw.lists.length > 0) {
          const seed = buildSeedState();
          // Ensure the 3 core lists always have staples/aisles hydrated if upgraded
          const seedById = new Map(seed.lists.map((l) => [l.id, l]));
          const lists = raw.lists.map((l) => {
            const tpl = seedById.get(l.id);
            const mergedList = {
              id: String(l.id),
              slug: String(l.slug || l.id),
              name: String(l.name || tpl?.name || l.id),
              subtitle: String(l.subtitle ?? tpl?.subtitle ?? ''),
              icon: String(l.icon || tpl?.icon || '🛒'),
              accent: String(l.accent || tpl?.accent || '#00bcd4'),
              accentGlow: String(l.accentGlow || tpl?.accentGlow || 'rgba(0, 188, 212, 0.22)'),
              docTitle: String(l.docTitle || tpl?.docTitle || `${l.name} — RobOS Shopping List`),
              householdCategory: String(l.householdCategory || tpl?.householdCategory || 'Shopping'),
              aisles: Array.isArray(l.aisles) && l.aisles.length ? l.aisles : (tpl?.aisles || ['General']),
              staples: Array.isArray(l.staples) && l.staples.length ? l.staples : (tpl?.staples || []),
              items: [],
              updatedAt: l.updatedAt || new Date().toISOString(),
            };
            mergedList.items = (Array.isArray(l.items) ? l.items : [])
              .map((it) => normalizeItem(it, mergedList, mergedList.updatedAt))
              .filter(Boolean);
            return mergedList;
          });
          // Guarantee Grocery, Target, and Costco exist unless explicitly deleted
          state = {
            schema: SCHEMA_VERSION,
            activeListId: lists.some((l) => l.id === raw.activeListId) ? raw.activeListId : lists[0].id,
            lists,
            undoStack: Array.isArray(raw.undoStack) ? raw.undoStack.slice(0, 10) : [],
            sync: { ...seed.sync, ...(raw.sync || {}), docIds: { ...(raw.sync?.docIds || {}) }, docUrls: { ...(raw.sync?.docUrls || {}) } },
            updatedAt: raw.updatedAt || new Date().toISOString(),
          };
          return state;
        }
      } catch {}
    }
    state = buildSeedState();
    persist({ silent: true });
    return state;
  }

  function persist({ silent = false, reason = 'update' } = {}) {
    ensureLoaded();
    state.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, filePath);
    if (!silent) {
      const snap = getSnapshot();
      for (const fn of listeners) {
        try { fn(snap, reason); } catch {}
      }
    }
    return state;
  }

  function findList(listId) {
    ensureLoaded();
    const targetId = listId || state.activeListId;
    const list = state.lists.find((l) => l.id === targetId);
    if (!list) throw new Error(`Shopping list "${targetId}" was not found.`);
    return list;
  }

  function pushUndo(entry) {
    ensureLoaded();
    state.undoStack = [entry, ...(state.undoStack || [])].slice(0, 12);
  }

  function getSnapshot() {
    ensureLoaded();
    const lists = state.lists.map((l) => ({
      ...l,
      items: l.items.map((it) => ({ ...it })),
      staples: l.staples.map((s) => ({ ...s })),
      aisles: [...l.aisles],
      stats: computeListStats(l),
      docId: state.sync.docIds?.[l.id] || '',
      docUrl: state.sync.docUrls?.[l.id] || '',
    }));
    const overall = lists.reduce(
      (acc, l) => {
        acc.totalCount += l.stats.totalCount;
        acc.toBuyCount += l.stats.toBuyCount;
        acc.checkedCount += l.stats.checkedCount;
        acc.estTotal = Math.round((acc.estTotal + l.stats.estTotal) * 100) / 100;
        return acc;
      },
      { totalCount: 0, toBuyCount: 0, checkedCount: 0, estTotal: 0 },
    );
    return {
      schema: state.schema,
      filePath,
      activeListId: state.activeListId,
      lists,
      overall,
      canUndo: state.undoStack.length > 0,
      lastUndoLabel: state.undoStack[0]?.label || '',
      units: UNITS,
      badges: BADGES,
      sync: {
        ...state.sync,
        docIds: { ...(state.sync.docIds || {}) },
        docUrls: { ...(state.sync.docUrls || {}) },
      },
      updatedAt: state.updatedAt,
    };
  }

  function setActiveList(listId) {
    const list = findList(listId);
    state.activeListId = list.id;
    persist({ reason: 'select-list' });
    return getSnapshot();
  }

  function createList({ name, subtitle = '', icon = '🛍️', accent = '#00bcd4', aisles } = {}) {
    ensureLoaded();
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Enter a name for the shopping list.');
    const baseSlug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'list';
    let id = baseSlug;
    let n = 2;
    while (state.lists.some((l) => l.id === id)) { id = `${baseSlug}-${n++}`; }
    const nowIso = new Date().toISOString();
    const newList = {
      id,
      slug: id,
      name: cleanName,
      subtitle: String(subtitle || 'Custom household shopping list').trim(),
      icon: String(icon || '🛍️'),
      accent: String(accent || '#00bcd4'),
      accentGlow: 'rgba(0, 188, 212, 0.24)',
      docTitle: `${cleanName} — RobOS Shopping List`,
      householdCategory: 'Shopping',
      aisles: Array.isArray(aisles) && aisles.length ? aisles : ['Essentials', 'Produce & Fresh', 'Pantry', 'Household', 'Other'],
      staples: [],
      items: [],
      updatedAt: nowIso,
    };
    state.lists.push(newList);
    state.activeListId = newList.id;
    persist({ reason: 'create-list' });
    return { listId: newList.id, state: getSnapshot() };
  }

  function addItem(listId, payload = {}) {
    const list = findList(listId);
    const cleanName = String(payload.name || '').trim();
    if (!cleanName) throw new Error('Enter an item name to add.');
    const nowIso = new Date().toISOString();
    const qtyToAdd = roundQty(payload.qty ?? 1);

    // Merge into existing unchecked item of the exact same name unless mergeDuplicate === false
    if (payload.mergeDuplicate !== false) {
      const existing = list.items.find(
        (it) => !it.checked && it.name.toLowerCase() === cleanName.toLowerCase(),
      );
      if (existing) {
        existing.qty = roundQty(existing.qty + qtyToAdd);
        if (payload.note) existing.note = String(payload.note).trim();
        if (payload.badge) existing.badge = String(payload.badge).trim();
        if (payload.estPrice !== undefined && payload.estPrice !== null && payload.estPrice !== '') {
          existing.estPrice = roundMoney(payload.estPrice);
        }
        if (payload.aisle && payload.aisle !== 'auto') existing.aisle = String(payload.aisle).trim();
        existing.updatedAt = nowIso;
        list.updatedAt = nowIso;
        persist({ reason: 'increment-item' });
        return { item: { ...existing }, merged: true, state: getSnapshot() };
      }
    }

    const item = normalizeItem(
      {
        ...payload,
        id: payload.id || newId('item'),
        name: cleanName,
        qty: qtyToAdd,
        checked: Boolean(payload.checked),
      },
      list,
      nowIso,
    );
    if (!list.aisles.includes(item.aisle)) {
      list.aisles.push(item.aisle);
    }
    list.items.unshift(item);
    list.updatedAt = nowIso;
    persist({ reason: 'add-item' });
    return { item: { ...item }, merged: false, state: getSnapshot() };
  }

  function toggleItem(listId, itemId, explicitChecked) {
    const list = findList(listId);
    const item = list.items.find((it) => it.id === itemId);
    if (!item) throw new Error('Item not found.');
    const nowIso = new Date().toISOString();
    item.checked = typeof explicitChecked === 'boolean' ? explicitChecked : !item.checked;
    item.checkedAt = item.checked ? nowIso : null;
    item.updatedAt = nowIso;
    list.updatedAt = nowIso;
    persist({ reason: 'toggle-item' });
    return { item: { ...item }, state: getSnapshot() };
  }

  function adjustItemQty(listId, itemId, delta) {
    const list = findList(listId);
    const item = list.items.find((it) => it.id === itemId);
    if (!item) throw new Error('Item not found.');
    const step = Number(delta) || 0;
    const nextQty = Math.max(1, roundQty(item.qty + step));
    item.qty = nextQty;
    item.updatedAt = new Date().toISOString();
    list.updatedAt = item.updatedAt;
    persist({ reason: 'qty-item' });
    return { item: { ...item }, state: getSnapshot() };
  }

  function updateItem(listId, itemId, patch = {}) {
    const list = findList(listId);
    const item = list.items.find((it) => it.id === itemId);
    if (!item) throw new Error('Item not found.');
    const nowIso = new Date().toISOString();
    if (patch.name !== undefined) {
      const n = String(patch.name).trim();
      if (!n) throw new Error('Item name cannot be empty.');
      item.name = n;
    }
    if (patch.qty !== undefined) item.qty = roundQty(patch.qty);
    if (patch.unit !== undefined) item.unit = String(patch.unit || 'ea').trim() || 'ea';
    if (patch.aisle !== undefined && patch.aisle !== '') {
      item.aisle = patch.aisle === 'auto' ? detectAisle(list, item.name) : String(patch.aisle).trim();
      if (!list.aisles.includes(item.aisle)) list.aisles.push(item.aisle);
    }
    if (patch.estPrice !== undefined) item.estPrice = roundMoney(patch.estPrice);
    if (patch.badge !== undefined) item.badge = String(patch.badge || '').trim();
    if (patch.note !== undefined) item.note = String(patch.note || '').trim();
    if (typeof patch.checked === 'boolean') {
      item.checked = patch.checked;
      item.checkedAt = patch.checked ? nowIso : null;
    }
    item.updatedAt = nowIso;
    list.updatedAt = nowIso;
    persist({ reason: 'update-item' });
    return { item: { ...item }, state: getSnapshot() };
  }

  function removeItem(listId, itemId) {
    const list = findList(listId);
    const idx = list.items.findIndex((it) => it.id === itemId);
    if (idx === -1) throw new Error('Item not found.');
    const [removed] = list.items.splice(idx, 1);
    pushUndo({
      kind: 'remove-items',
      listId: list.id,
      label: `Removed "${removed.name}" from ${list.name}`,
      items: [removed],
    });
    list.updatedAt = new Date().toISOString();
    persist({ reason: 'remove-item' });
    return { removed, state: getSnapshot() };
  }

  function clearChecked(listId) {
    const list = findList(listId);
    const removed = list.items.filter((it) => it.checked);
    if (!removed.length) return { removedCount: 0, state: getSnapshot() };
    list.items = list.items.filter((it) => !it.checked);
    pushUndo({
      kind: 'remove-items',
      listId: list.id,
      label: `Cleared ${removed.length} checked item${removed.length === 1 ? '' : 's'} in ${list.name}`,
      items: removed,
    });
    list.updatedAt = new Date().toISOString();
    persist({ reason: 'clear-checked' });
    return { removedCount: removed.length, state: getSnapshot() };
  }

  function checkAll(listId, checked = true) {
    const list = findList(listId);
    const nowIso = new Date().toISOString();
    for (const it of list.items) {
      it.checked = Boolean(checked);
      it.checkedAt = it.checked ? nowIso : null;
      it.updatedAt = nowIso;
    }
    list.updatedAt = nowIso;
    persist({ reason: 'check-all' });
    return { state: getSnapshot() };
  }

  function undo() {
    ensureLoaded();
    const entry = state.undoStack.shift();
    if (!entry) return { restored: false, state: getSnapshot() };
    const list = state.lists.find((l) => l.id === entry.listId);
    if (list && entry.kind === 'remove-items' && Array.isArray(entry.items)) {
      const existingIds = new Set(list.items.map((i) => i.id));
      for (const item of entry.items) {
        if (!existingIds.has(item.id)) list.items.unshift(item);
      }
      list.updatedAt = new Date().toISOString();
    }
    persist({ reason: 'undo' });
    return { restored: true, label: entry.label, state: getSnapshot() };
  }

  function smartBatchAdd(rawText, defaultListId) {
    ensureLoaded();
    const entries = parseSmartItemsOffline(rawText, state.lists, defaultListId || state.activeListId);
    const added = [];
    for (const entry of entries) {
      const res = addItem(entry.listId, entry);
      added.push({ listId: entry.listId, item: res.item, merged: res.merged });
    }
    return { added, state: getSnapshot() };
  }

  function resetStarterLists() {
    ensureLoaded();
    const syncBackup = { ...state.sync };
    state = buildSeedState();
    state.sync = syncBackup;
    persist({ reason: 'reset-lists' });
    return getSnapshot();
  }

  function updateSyncConfig(patch = {}) {
    ensureLoaded();
    state.sync = {
      ...state.sync,
      ...patch,
      docIds: { ...(state.sync.docIds || {}), ...(patch.docIds || {}) },
      docUrls: { ...(state.sync.docUrls || {}), ...(patch.docUrls || {}) },
    };
    persist({ reason: 'sync-config' });
    return getSnapshot();
  }

  function replaceListItemsFromSync(listId, nextItems) {
    const list = findList(listId);
    const nowIso = new Date().toISOString();
    list.items = nextItems.map((it) => normalizeItem(it, list, nowIso)).filter(Boolean);
    for (const it of list.items) {
      if (!list.aisles.includes(it.aisle)) list.aisles.push(it.aisle);
    }
    list.updatedAt = nowIso;
    persist({ reason: 'drive-sync' });
    return getSnapshot();
  }

  function exportHouseholdCsv(listId) {
    const list = findList(listId);
    const today = new Date().toISOString().slice(0, 10);
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ['date', 'merchant', 'category', 'item', 'aisle', 'qty', 'unit', 'unit_price', 'line_total', 'status'].join(','),
    ];
    for (const it of list.items) {
      const unitPrice = it.estPrice != null ? it.estPrice.toFixed(2) : '';
      const lineTotal = it.estPrice != null ? (it.estPrice * it.qty).toFixed(2) : '';
      rows.push([
        today,
        esc(list.name),
        esc(list.householdCategory || 'Groceries'),
        esc(it.name),
        esc(it.aisle),
        it.qty,
        esc(it.unit),
        unitPrice,
        lineTotal,
        it.checked ? 'in_cart' : 'to_buy',
      ].join(','));
    }
    return {
      filename: `robos-household-${list.slug}-${today}.csv`,
      csv: rows.join('\n') + '\n',
    };
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    filePath,
    getSnapshot,
    setActiveList,
    createList,
    addItem,
    toggleItem,
    adjustItemQty,
    updateItem,
    removeItem,
    clearChecked,
    checkAll,
    undo,
    smartBatchAdd,
    resetStarterLists,
    updateSyncConfig,
    replaceListItemsFromSync,
    exportHouseholdCsv,
    onChange,
  };
}

module.exports = {
  SCHEMA_VERSION,
  buildSeedState,
  computeListStats,
  createStore,
};
