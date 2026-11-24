'use strict';

/**
 * RobOS Shopping Lists — Natural Language & Text Command Engine
 * -------------------------------------------------------------
 * Powers:
 *   1. CLI tool (`node packages/shopping-lists/bin/shopping-lists.js ...`)
 *   2. AI Agent Skill (`/shopping-lists ...`)
 *   3. RobOS Voice & Desktop Assistant (`"add 2 gallons of milk to grocery"`, `"what is on my costco list?"`)
 *   4. Desktop & Mobile Quick Command Bar (`POST /api/command`)
 *   5. Printable Skills & Text Commands Reference (`/guide` and `PRINTABLE-GUIDE.md`)
 */

const { syncWithGoogleDrive, listGoogleAccounts } = require('./google-drive-sync');
const { normalizeShoppingVoiceTranscript, MEAL_BUNDLES, WORD_QTY: DEFAULT_WORD_QTY } = require('./defaults');

const SPOKEN_NUM = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12,
  couple: 2, pair: 2, ...(DEFAULT_WORD_QTY || {}),
};

/**
 * Shared classifier determining whether a spoken `"Commander, _____"` query targets
 * RobOS Shopping Lists (Grocery, Target, Costco, or custom household lists) — even when
 * the speaker uses natural kitchen phrasing without saying `"grocery list"` explicitly.
 */
function isLikelyShoppingVoiceCommand(rawQuery) {
  const normalized = normalizeShoppingVoiceTranscript(String(rawQuery || '').trim());
  if (!normalized) return false;
  if (/^\/shopping-lists?\b/i.test(normalized)) return true;

  const q = normalized
    .replace(/^(?:(?:hey|hello|hi|ok|okay|yo)\s+)?(?:nabu|na\s+bu|naboo|commander|computer|assistant)\b[,.:;!\-\s]*/i, '')
    .replace(/^(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:please\s+)?/i, '')
    .trim();
  if (!q) return false;

  // Never hijack explicit app-launch or non-shopping domains
  if (/^(?:open|launch|start|switch\s+to)\s+(?:the\s+)?(?:robos\s+)?(?:household\s+)?shopping\s+lists?(?:\s+app|\s+window)?$/i.test(q)) {
    return false;
  }
  if (/\b(?:task|tasks|todo|to-do|issue|issues|ticket|tickets|watch|movie|movies|song|songs|playlist|playlists|calendar|appointment|appointments|git\s+status|branch|commits?|error\s+logs?|vm\s+status|shapes|kgraph|knowledge\s+graph|skeletons?|zombies?|goblins?|orcs?|mummies)\b/i.test(q)) {
    return false;
  }
  if (/^(?:check|show|view|read)\s+(?:git|errors?|system|logs?|vm|status|memory|cpu|disk|ports?|shapes)\b/i.test(q)) {
    return false;
  }

  // 1. Explicit store or shopping list mention
  if (/\b(?:shopping\s+lists?|groceries|grocery(?:\s+shopping)?(?:\s+lists?)?|target(?:\s+shopping)?(?:\s+lists?)?|costco(?:\s+shopping)?(?:\s+lists?)?|kirkland|@(?:grocery|target|costco))\b/i.test(q)) {
    return true;
  }

  // 2. Prepositional "... list" ("on the list", "off my list", "to the list", "read the list", "what's on the list")
  if (/\b(?:to|on|in|from|at|for|off)\s+(?:the\s+|my\s+|our\s+)?(?:[a-z0-9'\-\s]{1,24}\s+)?lists?\b/i.test(q)) {
    return true;
  }
  if (/^(?:what(?:'s|\s+is|\s+are)\s+(?:on|left\s+on)|read(?:\s+me)?|show(?:\s+me)?|see|empty|clear|wipe)\s+(?:the\s+|my\s+|our\s+)?lists?\b/i.test(q)) {
    return true;
  }

  // 3. Meal kits & bundles ("add taco night", "add breakfast essentials", "add smoothie ingredients", etc.)
  if (Array.isArray(MEAL_BUNDLES) && MEAL_BUNDLES.some((b) => b.pattern.test(q))) {
    return true;
  }

  // 4. Kitchen out-of-stock / running-low / store-run phrases (even without saying "list")
  if (/\b(?:we(?:'re|\s+are)|i(?:'m|\s+am))?\s*(?:all\s+|almost\s+|nearly\s+)?out\s+of\s+[a-z]/i.test(q)
      && !/\bout\s+of\s+(?:memory|ram|disk|space|time|swap|bounds)\b/i.test(q)) {
    return true;
  }
  if (/\b(?:ran\s+out\s+of|running\s+low\s+on|low\s+on)\s+[a-z]/i.test(q)
      && !/\b(?:memory|ram|disk|space|battery|power|cpu)\b/i.test(q)) {
    return true;
  }
  if (/^(?:what\s+do\s+(?:we|i)\s+need\s+(?:at|from|for)\s+(?:the\s+)?(?:store|market|supermarket|shop)|remind\s+me\s+to\s+(?:buy|get|pick\s+up|grab)|don'?t\s+let\s+me\s+forget\s+(?:to\s+(?:buy|get|grab)\s+)?|(?:we|i)\s+need\s+to\s+(?:buy|pick\s+up|grab)\s+)/i.test(q)) {
    return true;
  }

  // 5. Cart / aisle / check-off actions
  if (/\b(?:in\s+(?:my|the|our)\s+cart|shopping\s+cart)\b/i.test(q)) {
    return true;
  }
  if (/\b(?:produce|dairy|bakery|frozen|meat|seafood|deli|pharmacy)\s+aisle\b/i.test(q)) {
    return true;
  }
  if (/^(?:check\s+off|cross\s+off|uncheck|clear\s+checked|(?:i\s+)?(?:just\s+)?(?:got|bought|picked\s+up|grabbed)\s+(?:the\s+)?[a-z])/i.test(q)) {
    return true;
  }

  return false;
}

async function maybeAutoSyncDrive(store, options = {}) {
  if (options.autoSync === false || process.env.ROBOS_TEST === '1') return null;
  try {
    const snap = store.getSnapshot();
    const hasAccount = Boolean(snap.sync?.accountId) || listGoogleAccounts().some((a) => a.signedIn);
    if (!hasAccount) return null;
    return await syncWithGoogleDrive({
      store,
      pullFromDocs: false,
      fetchImpl: options.fetchImpl,
    });
  } catch {
    return null;
  }
}

function resolveStoreIdFromText(text, lists, fallbackId = null) {
  const s = String(text || '').toLowerCase();
  for (const list of lists || []) {
    const id = list.id.toLowerCase();
    const name = list.name.toLowerCase();
    const re = new RegExp(`(?:^|\\s)@${id}\\b|\\b${id}\\b|\\b${name}\\b`, 'i');
    if (re.test(s)) return list.id;
  }
  if (/\bkirkland\b/i.test(s) && (lists || []).some((l) => l.id === 'costco')) {
    return 'costco';
  }
  return fallbackId;
}

function stripStoreClause(text) {
  return String(text || '')
    .replace(/(?:^|\s)@(?:grocery|target|costco)\b/gi, ' ')
    .replace(/\b(?:on|in|from|to|at|for|off)\s+(?:my\s+|the\s+|our\s+)?(?:grocery|target|costco|shopping)(?:\s+shopping)?(?:\s+lists?)?\b/gi, ' ')
    .replace(/\b(?:on|in|from|to|at|for|off)\s+(?:my\s+|the\s+|our\s+)?lists?\b/gi, ' ')
    .replace(/^(?:grocery|target|costco)\s*:\s*/i, '')
    .replace(/[?.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSpokenItemQty(item) {
  return `${item.qty > 1 ? `${item.qty} ${item.unit !== 'ea' ? item.unit + ' ' : ''}` : ''}${item.name}`;
}

function joinNaturalSpoken(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Find an item by ID, exact name, or substring match across one list or all lists.
 */
function findMatchingItem(snapshot, query, preferredListId = null) {
  const q = String(query || '').trim().toLowerCase().replace(/^(?:the|my|our|some|any)\s+/i, '');
  if (!q) return null;

  const lists = snapshot.lists || [];
  const searchOrder = preferredListId
    ? [
        ...lists.filter((l) => l.id === preferredListId),
        ...lists.filter((l) => l.id !== preferredListId),
      ]
    : [
        ...lists.filter((l) => l.id === snapshot.activeListId),
        ...lists.filter((l) => l.id !== snapshot.activeListId),
      ];

  // 1. Exact ID or exact name match
  for (const list of searchOrder) {
    for (const item of list.items) {
      if (item.id.toLowerCase() === q || item.name.toLowerCase() === q) {
        return { list, item };
      }
    }
  }

  // 2. Substring / singular-plural match (prefer unchecked items when checking/modifying)
  const qSingular = q.endsWith('es') && q.length > 4 ? q.slice(0, -2)
    : q.endsWith('s') && !q.endsWith('ss') && q.length > 3 ? q.slice(0, -1)
    : q;
  for (const list of searchOrder) {
    const uncheckedMatch = list.items.find((it) => {
      if (it.checked) return false;
      const n = it.name.toLowerCase();
      return n.includes(q) || n.includes(qSingular);
    });
    if (uncheckedMatch) return { list, item: uncheckedMatch };
    const anyMatch = list.items.find((it) => {
      const n = it.name.toLowerCase();
      return n.includes(q) || n.includes(qSingular) || q.includes(n);
    });
    if (anyMatch) return { list, item: anyMatch };
  }

  return null;
}

/**
 * Format one or all shopping lists as a spoken sentence (for RobOS Voice) and a printable text block.
 */
function formatListsSummary(snapshot, targetListId = 'all', filterMode = 'all', opts = {}) {
  const lists = targetListId && targetListId !== 'all'
    ? snapshot.lists.filter((l) => l.id === targetListId)
    : snapshot.lists;

  if (!lists.length) {
    return {
      ok: false,
      spoken: `Could not find shopping list "${targetListId}".`,
      text: `Could not find shopping list "${targetListId}".`,
    };
  }

  if (lists.length === 1) {
    const l = lists[0];
    const unchecked = l.items.filter((i) => !i.checked);
    const checked = l.items.filter((i) => i.checked);
    const text = renderPrintableChecklist(snapshot, l.id, filterMode);

    if (filterMode === 'checked') {
      const checkedNames = checked.slice(0, 8).map(formatSpokenItemQty);
      const moreChecked = checked.length > 8 ? `, and ${checked.length - 8} more` : '';
      const spoken = checked.length === 0
        ? `Nothing is checked off in your ${l.name} cart yet — ${unchecked.length} item${unchecked.length === 1 ? '' : 's'} still to buy.`
        : `You have ${checked.length} item${checked.length === 1 ? '' : 's'} checked off in your ${l.name} cart: ${checkedNames.join(', ')}${moreChecked} (${unchecked.length} left to buy).`;
      return { ok: true, skill: 'shopping-lists:in-cart', listId: l.id, spoken, text, data: { list: l } };
    }

    if (l.items.length === 0) {
      const spoken = `Your ${l.name} list is completely empty right now, Commander.`;
      return { ok: true, skill: 'shopping-lists:list', listId: l.id, spoken, text, data: { list: l } };
    }

    if (unchecked.length === 0) {
      const spoken = `Your ${l.name} list is all checked off (${checked.length} item${checked.length === 1 ? '' : 's'} in cart).`;
      return { ok: true, skill: 'shopping-lists:list', listId: l.id, spoken, text, data: { list: l } };
    }

    if (opts.byAisle) {
      const byAisle = new Map();
      for (const it of unchecked) {
        const a = it.aisle || 'General';
        if (!byAisle.has(a)) byAisle.set(a, []);
        byAisle.get(a).push(formatSpokenItemQty(it));
      }
      const aisleSentences = [...byAisle.entries()].map(([aisle, names]) => `${aisle}: ${names.join(', ')}`);
      const spoken = `Your ${l.name} list by aisle (${unchecked.length} to buy) — ${aisleSentences.join('. ')}.`;
      return { ok: true, skill: 'shopping-lists:list', listId: l.id, spoken, text, data: { list: l } };
    }

    const cap = opts.readAll ? unchecked.length : 5;
    const sample = unchecked.slice(0, cap).map(formatSpokenItemQty).join(', ');
    const more = unchecked.length > cap ? `, and ${unchecked.length - cap} more` : '';
    const estClause = l.stats.estRemaining > 0 ? ` ($${l.stats.estRemaining.toFixed(2)} estimated)` : '';
    const spoken = `Your ${l.name} list has ${unchecked.length} item${unchecked.length === 1 ? '' : 's'} to buy${estClause}: ${sample}${more}.`;

    return {
      ok: true,
      skill: 'shopping-lists:list',
      listId: l.id,
      spoken,
      text,
      data: { list: l },
    };
  }

  const parts = lists.map((l) => `${l.name}: ${l.stats.toBuyCount} to buy (${l.stats.checkedCount} checked)`);
  const totalClause = snapshot.overall.estTotal > 0 ? ` ($${snapshot.overall.estTotal.toFixed(2)} total)` : '';
  const spoken = `You have ${snapshot.overall.toBuyCount} items to buy across ${lists.length} lists${totalClause} — ${parts.join('; ')}.`;
  return {
    ok: true,
    skill: 'shopping-lists:list',
    listId: 'all',
    spoken,
    text: renderPrintableChecklist(snapshot, 'all', filterMode),
    data: { lists, overall: snapshot.overall },
  };
}

/**
 * Render a clean, printer-friendly ASCII/Unicode checklist for one or all lists.
 */
function renderPrintableChecklist(snapshot, targetListId = 'all', filterMode = 'all') {
  const lists = targetListId && targetListId !== 'all'
    ? snapshot.lists.filter((l) => l.id === targetListId)
    : snapshot.lists;

  const lines = [];
  lines.push('====================================================================');
  lines.push('  ROBOS HOUSEHOLD SHOPPING LISTS');
  lines.push(`  Updated: ${new Date(snapshot.updatedAt || Date.now()).toLocaleString()}`);
  lines.push('====================================================================');

  for (const list of lists) {
    lines.push('');
    lines.push(`${list.icon}  ${list.name.toUpperCase()} — ${list.subtitle}`);
    lines.push(`   To Buy: ${list.stats.toBuyCount}  |  In Cart: ${list.stats.checkedCount}  |  Est. Remaining: $${list.stats.estRemaining.toFixed(2)} (Total: $${list.stats.estTotal.toFixed(2)})`);
    lines.push('--------------------------------------------------------------------');

    const visibleItems = list.items.filter((it) => {
      if (filterMode === 'unchecked' || filterMode === 'to-buy') return !it.checked;
      if (filterMode === 'checked') return it.checked;
      return true;
    });

    if (visibleItems.length === 0) {
      lines.push('   (No items matching filter)');
      continue;
    }

    // Group by aisle
    const byAisle = new Map();
    for (const item of visibleItems) {
      const a = item.aisle || 'General';
      if (!byAisle.has(a)) byAisle.set(a, []);
      byAisle.get(a).push(item);
    }

    for (const [aisle, items] of byAisle.entries()) {
      lines.push(`  [${aisle}]`);
      for (const it of items) {
        const box = it.checked ? '☑' : '☐';
        const qtyStr = `${it.qty} ${it.unit || 'ea'}`;
        const priceStr = it.estPrice != null ? `  ($${(it.estPrice * it.qty).toFixed(2)})` : '';
        const badgeStr = it.badge ? `  [${it.badge.toUpperCase()}]` : '';
        const noteStr = it.note ? ` — ${it.note}` : '';
        lines.push(`    ${box} ${it.name} — ${qtyStr}${priceStr}${badgeStr}${noteStr}`);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Execute a natural-language or shorthand text command against a ShoppingListsStore.
 */
async function executeTextCommand(store, rawInput, options = {}) {
  const input = normalizeShoppingVoiceTranscript(String(rawInput || '').trim());
  if (!input) {
    return {
      ok: false,
      spoken: 'Enter a shopping list command, such as "add 2 gal milk, tide pods @target".',
      text: 'Enter a shopping list command.',
    };
  }

  const snap0 = store.getSnapshot();
  const explicitListId = resolveStoreIdFromText(input, snap0.lists, null);
  const defaultListId = explicitListId || options.listId || snap0.activeListId || 'grocery';

  // Strip optional leading slash command "/shopping-lists" or "Commander" / "Ok Nabu" prefix
  const cleanedInput = input
    .replace(/^\/shopping-lists?\b\s*/i, '')
    .replace(/^(?:(?:hey|hello|hi|ok|okay|yo)\s+)?(?:nabu|na\s+bu|naboo|commander)\b[,.:;!\-\s]*/i, '')
    .replace(/^(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:please\s+)?/i, '')
    .trim();

  // 1. HELP / GUIDE / VOICE COMMAND CHEAT SHEET ("Commander, what can I say for grocery lists?", "what kind of things can I do with grocery list?")
  if (/^(?:help|guide|commands|cheat\s*sheet|\?|(?:what\s+(?:kind\s+of\s+things\s+|things\s+)?can\s+(?:i|we|you)\s+(?:say|do|ask)|how\s+do\s+(?:i|we)\s+use|(?:voice|commander)\s+commands?)(?:\s+.*)?)$/i.test(cleanedInput)) {
    const text = renderPrintableCommandGuideText();
    const spoken = 'You can say things like: Commander, add two gallons of milk and avocados to grocery; Commander, we are out of eggs; Commander, is milk on my grocery list; Commander, what do we need in Produce; Commander, add taco night to grocery; Commander, check off milk; Commander, move paper towels to Costco; Commander, how much is my grocery list; or Commander, clear checked items.';
    return {
      ok: true,
      skill: 'shopping-lists:guide',
      spoken,
      text,
      data: { guide: true },
    };
  }

  // 2. UNDO ("Commander, undo", "Commander, undo last grocery change", "Commander, undo that on my grocery list")
  if (/^(?:undo(?:\s+(?:that|it|last(?:\s+(?:grocery|target|costco|shopping))?(?:\s+(?:action|change|edit|delete|removal))?))?|restore\s+(?:last|removed)(?:\s+items?)?)(?:\s+(?:on|in|for|from)\s+.*)?[.!?]*$/i.test(cleanedInput)) {
    const res = store.undo();
    if (res.restored) await maybeAutoSyncDrive(store, options);
    const msg = res.restored ? `Undid: ${res.label}.` : 'Nothing to undo on your shopping lists, Commander.';
    return {
      ok: res.restored,
      skill: 'shopping-lists:undo',
      spoken: msg,
      text: msg,
      data: res,
    };
  }

  // 3. CLEAR CHECKED ("Commander, clear checked items on grocery", "Commander, clean up bought items")
  const clearMatch = cleanedInput.match(/^(?:clear|remove|delete|clean(?:\s+up)?|purge)\s+(?:all\s+|the\s+|my\s+)?(?:checked(?:\s+off)?|completed|bought|done|in[\s-]cart)(?:\s+items?)?(?:\s+.*)?$/i);
  if (clearMatch) {
    const targetId = explicitListId || defaultListId;
    const listName = snap0.lists.find((l) => l.id === targetId)?.name || targetId;
    const res = store.clearChecked(targetId);
    await maybeAutoSyncDrive(store, options);
    const msg = res.removedCount > 0
      ? `Cleared ${res.removedCount} checked item${res.removedCount === 1 ? '' : 's'} from ${listName}.`
      : `There were no checked-off items to clear on ${listName}.`;
    return {
      ok: true,
      skill: 'shopping-lists:clear-checked',
      spoken: msg,
      text: msg,
      data: res,
    };
  }

  // 3.5 EMPTY / CLEAR ENTIRE LIST ("Commander, empty my grocery list", "Commander, clear all items on grocery", "Commander, wipe my grocery list")
  const emptyListMatch = cleanedInput.match(/^(?:empty|wipe|clear(?:\s+out)?)\s+(?:all\s+(?:items?\s+(?:on|in|from)\s+)?|(?:the\s+|my\s+|our\s+)?(?:entire|whole)\s+)?(?:my\s+|the\s+|our\s+)?(?:grocery|target|costco|shopping)?(?:\s+shopping)?\s*lists?[.!?]*$/i)
    || cleanedInput.match(/^(?:clear|remove|delete)\s+(?:all|every)\s+items?\s+(?:on|in|from)\s+(?:my\s+|the\s+|our\s+)?(?:grocery|target|costco|shopping)(?:\s+lists?)?[.!?]*$/i);
  if (emptyListMatch && typeof store.clearAllItems === 'function') {
    const targetId = explicitListId || defaultListId;
    const listName = snap0.lists.find((l) => l.id === targetId)?.name || targetId;
    const res = store.clearAllItems(targetId);
    await maybeAutoSyncDrive(store, options);
    const msg = res.removedCount > 0
      ? `Cleared all ${res.removedCount} item${res.removedCount === 1 ? '' : 's'} from ${listName}, Commander. Say "Commander, undo" anytime to restore them.`
      : `Your ${listName} list is already empty, Commander.`;
    return {
      ok: true,
      skill: 'shopping-lists:clear-all',
      spoken: msg,
      text: msg,
      data: res,
    };
  }

  // 4. CHECK ALL / UNCHECK ALL ("Commander, check all items on grocery", "Commander, uncheck everything on grocery")
  const checkAllMatch = cleanedInput.match(/^(check|uncheck|reset)\s+(?:all|every|everything|checkboxes)(?:\s+items?)?(?:\s+.*)?$/i);
  if (checkAllMatch) {
    const verb = checkAllMatch[1].toLowerCase();
    const checked = verb === 'check';
    const targetId = explicitListId || defaultListId;
    const listName = snap0.lists.find((l) => l.id === targetId)?.name || targetId;
    const res = store.checkAll(targetId, checked);
    await maybeAutoSyncDrive(store, options);
    const msg = `${checked ? 'Checked' : 'Unchecked'} all items in ${listName}.`;
    return {
      ok: true,
      skill: 'shopping-lists:check-all',
      spoken: msg,
      text: msg,
      data: res,
    };
  }

  // 5. SYNC WITH GOOGLE DRIVE ("Commander, sync my grocery list", "Commander, pull changes from Google Docs")
  if (/^(?:sync|pull|push|refresh)(?:\s+(?:my|our|the|all))?(?:\s+(?:grocery|target|costco|shopping))?(?:\s+lists?)?(?:\s+(?:with|from|to))?(?:\s+(?:google\s+)?(?:drive|docs))?(?:\s+(--pull|pull))?[.!?]*$/i.test(cleanedInput)) {
    const pullChanges = /\b(?:pull|from|refresh)\b/i.test(cleanedInput) || Boolean(options.pull);
    const res = await syncWithGoogleDrive({
      store,
      pullFromDocs: pullChanges,
      fetchImpl: options.fetchImpl,
    });
    const docLines = Object.entries(res.docUrls || {}).map(([id, url]) => `  • ${id}: ${url}`);
    const spoken = pullChanges
      ? `Pulled latest Google Docs updates and synced Grocery, Target, and Costco shopping lists.`
      : `Synced Grocery, Target, and Costco shopping lists with Google Drive.`;
    const text = `${spoken}\n  • Drive Folder: ${res.folderUrl}\n${docLines.join('\n')}`;
    return {
      ok: res.ok,
      skill: 'shopping-lists:sync',
      spoken,
      text,
      data: res,
    };
  }

  // 6. EXPORT HOUSEHOLD CSV
  const csvMatch = cleanedInput.match(/^(?:export[\s-]csv|csv)(?:\s+(.+))?$/i);
  if (csvMatch) {
    const targetId = explicitListId || defaultListId;
    const res = store.exportHouseholdCsv(targetId);
    return {
      ok: true,
      skill: 'shopping-lists:export-csv',
      spoken: `Exported ${res.filename} for RobOS Household.`,
      text: res.csv.trimEnd(),
      data: res,
    };
  }

  // 7. PRINT CHECKLIST
  const printMatch = cleanedInput.match(/^print(?:\s+(grocery|target|costco|all))?(?:\s+.*)?$/i);
  if (printMatch) {
    const targetId = (printMatch[1] || explicitListId || 'all').toLowerCase();
    const text = renderPrintableChecklist(snap0, targetId, 'all');
    return {
      ok: true,
      skill: 'shopping-lists:print',
      spoken: `Prepared printable shopping list for ${targetId}.`,
      text,
      data: { listId: targetId },
    };
  }

  // 7.5 CREATE NEW STORE LIST / SWITCH ACTIVE LIST / WHICH LISTS EXIST
  const createListMatch = cleanedInput.match(/^(?:create|make|start|new)\s+(?:a\s+)?(?:new\s+)?(?:shopping\s+list\s+(?:for|called|named)\s+|list\s+(?:for|called|named)\s+)?([a-z0-9][a-z0-9'\s\-]{1,28}?)(?:\s+shopping)?\s+lists?[.!?]*$/i);
  if (createListMatch && !/^(?:grocery|target|costco|my|our|the|a|new)$/i.test(createListMatch[1].trim())) {
    const rawName = createListMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
    const created = store.createList({ name: rawName });
    await maybeAutoSyncDrive(store, options);
    const msg = `Created your new ${rawName} shopping list and set it active, Commander.`;
    return { ok: true, skill: 'shopping-lists:create-list', spoken: msg, text: msg, data: created };
  }

  const switchListMatch = cleanedInput.match(/^(?:switch|change|set)\s+(?:active\s+(?:shopping\s+)?list\s+)?to\s+(?:my\s+|the\s+)?([a-z0-9'\s\-]+?)(?:\s+shopping)?(?:\s+list)?[.!?]*$/i);
  if (switchListMatch) {
    const targetId = resolveStoreIdFromText(switchListMatch[1], snap0.lists, null);
    if (targetId) {
      const nextSnap = store.setActiveList(targetId);
      const listObj = nextSnap.lists.find((l) => l.id === targetId);
      const msg = `Switched your active shopping list to ${listObj.name} (${listObj.stats.toBuyCount} items to buy).`;
      return { ok: true, skill: 'shopping-lists:switch-list', spoken: msg, text: msg, data: { listId: targetId } };
    }
  }

  if (/^(?:what|which)\s+(?:shopping\s+|store\s+)?lists?\s+do\s+(?:i|we)\s+have[.!?]*$/i.test(cleanedInput)) {
    const names = snap0.lists.map((l) => `${l.name} (${l.stats.toBuyCount} to buy)`);
    const msg = `You have ${snap0.lists.length} shopping lists, Commander: ${joinNaturalSpoken(names)}.`;
    return { ok: true, skill: 'shopping-lists:lists-overview', spoken: msg, text: msg, data: { lists: snap0.lists } };
  }

  // 7.6 ITEM PRESENCE / LOOKUP ("Commander, is milk on my grocery list?", "are avocados on the list?", "did I put eggs on Costco?", "do we already have butter on the list?")
  const hasItemMatch = cleanedInput.match(/^(?:is|are)\s+(.+?)\s+(?:already\s+)?(?:on|in)\s+(?:my\s+|the\s+|our\s+)?(?:grocery|target|costco|shopping|[a-z0-9'\-]+)?(?:\s+shopping)?\s*lists?[?.!]*$/i)
    || cleanedInput.match(/^(?:do\s+(?:we|i)\s+(?:already\s+)?have|did\s+(?:we|i)\s+(?:already\s+)?(?:put|add))\s+(.+?)\s+(?:on|in|to)\s+(?:my\s+|the\s+|our\s+)?(?:grocery|target|costco|shopping|[a-z0-9'\-]+)?(?:\s+shopping)?\s*lists?[?.!]*$/i)
    || cleanedInput.match(/^(?:check|see)\s+(?:if|whether)\s+(.+?)\s+(?:is|are)\s+(?:on|in)\s+(?:my\s+|the\s+|our\s+)?.*lists?[?.!]*$/i)
    || cleanedInput.match(/^do\s+(?:we|i)\s+need\s+(?!to\s+(?:buy|get|grab|pick\s+up)\b)(?!anything\b)(?!groceries\b)(.+?)[?.!]*$/i);
  if (hasItemMatch && !/\b(?:at|from)\s+(?:the\s+)?(?:store|market|costco|target|grocery)\b/i.test(hasItemMatch[1])) {
    const itemQuery = stripStoreClause(hasItemMatch[1]).replace(/^(?:any|some|more)\s+/i, '').trim();
    if (itemQuery) {
      const found = findMatchingItem(snap0, itemQuery, explicitListId || defaultListId);
      let msg;
      if (found) {
        const requestedDiffers = explicitListId && found.list.id !== explicitListId;
        const reqName = explicitListId ? (snap0.lists.find((l) => l.id === explicitListId)?.name || explicitListId) : '';
        const qtyDesc = formatSpokenItemQty(found.item);
        const noteSuffix = found.item.note ? ` (note: ${found.item.note})` : '';
        if (requestedDiffers) {
          msg = `${itemQuery} isn't on ${reqName}, Commander, but you have ${qtyDesc} on your ${found.list.name} list${found.item.checked ? ' (already checked off in cart)' : ` in ${found.item.aisle}`}.`;
        } else if (found.item.checked) {
          msg = `${found.item.name} is on your ${found.list.name} list, Commander, and it's already checked off in your cart.`;
        } else {
          msg = `Yes, Commander — you have ${qtyDesc} on your ${found.list.name} list in ${found.item.aisle}${noteSuffix}.`;
        }
      } else {
        const targetName = snap0.lists.find((l) => l.id === (explicitListId || defaultListId))?.name || 'Grocery';
        msg = `No, Commander — ${itemQuery} isn't on your ${explicitListId ? targetName + ' list' : 'shopping lists'} yet. Say "Commander, add ${itemQuery}" to put it on.`;
      }
      return {
        ok: true,
        skill: 'shopping-lists:has-item',
        spoken: msg,
        text: msg,
        data: { query: itemQuery, found: found ? { listId: found.list.id, item: found.item } : null },
      };
    }
  }

  // 7.7 COUNT, BUDGET & ESTIMATED COST QUERIES ("Commander, how many items are on my grocery list?", "how much is my Costco list?")
  const countOrCostMatch = cleanedInput.match(/^(?:how\s+many\s+(?:items?|things?|groceries)|item\s+count|how\s+much\s+(?:is|are|does|will)|what(?:'s|\s+is)\s+the\s+(?:estimated\s+)?(?:total|cost|price|budget))\b/i);
  if (countOrCostMatch) {
    const wantsAll = /\ball\b/i.test(cleanedInput) || (!explicitListId && /\bshopping\s+lists\b/i.test(cleanedInput));
    if (wantsAll) {
      const msg = `Across all ${snap0.lists.length} lists, you have ${snap0.overall.toBuyCount} item${snap0.overall.toBuyCount === 1 ? '' : 's'} to buy and ${snap0.overall.checkedCount} in your cart, totaling $${snap0.overall.estTotal.toFixed(2)} estimated.`;
      return { ok: true, skill: 'shopping-lists:stats', spoken: msg, text: msg, data: snap0.overall };
    }
    const targetList = snap0.lists.find((l) => l.id === (explicitListId || defaultListId)) || snap0.lists[0];
    const s = targetList.stats;
    const costPart = s.estTotal > 0
      ? `, with $${s.estRemaining.toFixed(2)} estimated remaining ($${s.estTotal.toFixed(2)} total)`
      : '';
    const msg = `Your ${targetList.name} list has ${s.toBuyCount} item${s.toBuyCount === 1 ? '' : 's'} left to buy and ${s.checkedCount} checked off in your cart${costPart}.`;
    return { ok: true, skill: 'shopping-lists:stats', spoken: msg, text: msg, data: { listId: targetList.id, stats: s } };
  }

  // 7.8 IN-CART / ALREADY CHECKED QUERIES ("Commander, what's in my cart?", "what did we already check off on grocery?")
  if (/^(?:what(?:'s|\s+is|\s+are)\s+in\s+(?:my|the|our)\s+cart|what\s+(?:did\s+(?:i|we)|have\s+(?:i|we))\s+(?:already\s+)?(?:check(?:ed)?\s+off|bought|got|picked\s+up)|show\s+(?:checked|in[\s-]cart)\s+items?)\b/i.test(cleanedInput)) {
    const targetId = explicitListId || defaultListId;
    return formatListsSummary(snap0, targetId, 'checked');
  }

  // 7.9 PRIORITY / BADGE QUERIES ("Commander, what urgent items are on my grocery list?", "any deals or coupons on Target?", "what organic items do we need?")
  const badgeFilterMatch = cleanedInput.match(/\b(urgent|must[\s-]*haves?|deals?|coupons?|on\s+sale|sale\s+items?|organic|kirkland)\b/i);
  if (badgeFilterMatch && /^(?:what|which|any|show|list|read|are\s+there)\b/i.test(cleanedInput)) {
    const rawKey = badgeFilterMatch[1].toLowerCase();
    const badgeId = rawKey.startsWith('urgent') || rawKey.startsWith('must') ? 'urgent'
      : rawKey.startsWith('organic') ? 'organic'
      : rawKey.startsWith('kirkland') ? 'kirkland'
      : 'deal';
    const badgeLabel = badgeId === 'urgent' ? 'urgent must-have'
      : badgeId === 'organic' ? 'organic'
      : badgeId === 'kirkland' ? 'Kirkland / store-brand'
      : 'sale or coupon';
    const searchLists = explicitListId ? snap0.lists.filter((l) => l.id === explicitListId) : snap0.lists;
    const hits = [];
    for (const l of searchLists) {
      for (const it of l.items) {
        if (!it.checked && (it.badge === badgeId || (badgeId === 'kirkland' && /kirkland/i.test(it.name)))) {
          hits.push(explicitListId ? formatSpokenItemQty(it) : `${formatSpokenItemQty(it)} (${l.name})`);
        }
      }
    }
    const scopeName = explicitListId ? `on your ${searchLists[0]?.name || explicitListId} list` : 'across your shopping lists';
    const msg = hits.length > 0
      ? `You have ${hits.length} ${badgeLabel} item${hits.length === 1 ? '' : 's'} ${scopeName}: ${joinNaturalSpoken(hits.slice(0, 8))}.`
      : `You don't have any unchecked ${badgeLabel} items ${scopeName} right now, Commander.`;
    return { ok: true, skill: 'shopping-lists:filter-badge', spoken: msg, text: msg, data: { badge: badgeId, items: hits } };
  }

  // 7.10 AISLE-SPECIFIC QUERIES ("Commander, what do we need in Produce?", "what's in the dairy aisle?", "anything in Frozen on grocery?")
  const aisleQueryMatch = cleanedInput.match(/^(?:what\s+(?:else\s+)?do\s+(?:we|i)\s+need|what(?:'s|\s+is|\s+are)|anything(?:\s+left)?|show|read|list)\s+(?:to\s+(?:get|grab|buy)\s+)?(?:in|from|on)\s+(?:the\s+)?([a-z\s&'\-]+?)(?:\s+aisle|\s+section|\s+department)?(?:\s+(?:on|in|at)\s+.*)?[?.!]*$/i);
  if (aisleQueryMatch) {
    const aisleToken = stripStoreClause(aisleQueryMatch[1]).replace(/\b(?:aisle|section|department)\b/gi, '').trim().toLowerCase();
    const targetList = snap0.lists.find((l) => l.id === (explicitListId || defaultListId)) || snap0.lists[0];
    const matchedAisle = targetList.aisles.find((a) => a.toLowerCase().includes(aisleToken) || aisleToken.includes(a.toLowerCase().split(/\s+/)[0]));
    if (aisleToken.length >= 3 && matchedAisle && !/^(?:my|our|the|grocery|target|costco|shopping|list|lists|cart)$/.test(aisleToken)) {
      const itemsInAisle = targetList.items.filter((i) => !i.checked && i.aisle === matchedAisle);
      const msg = itemsInAisle.length > 0
        ? `In ${matchedAisle} on your ${targetList.name} list, you need ${itemsInAisle.length} item${itemsInAisle.length === 1 ? '' : 's'}: ${joinNaturalSpoken(itemsInAisle.map(formatSpokenItemQty))}.`
        : `Nothing left to grab in ${matchedAisle} on your ${targetList.name} list, Commander.`;
      return { ok: true, skill: 'shopping-lists:aisle', spoken: msg, text: msg, data: { listId: targetList.id, aisle: matchedAisle, items: itemsInAisle } };
    }
  }

  // 7.11 STORE STAPLES & CURATED MEAL BUNDLES ("Commander, add taco night to grocery", "Commander, add my grocery staples", "what are my Costco staples?")
  if (/\bstaples\b/i.test(cleanedInput)) {
    const targetList = snap0.lists.find((l) => l.id === (explicitListId || defaultListId)) || snap0.lists[0];
    if (/^(?:what|which|show|list|read)\b/i.test(cleanedInput)) {
      const names = (targetList.staples || []).slice(0, 8).map((s) => s.name);
      const msg = `Your ${targetList.name} quick staples include: ${joinNaturalSpoken(names)}. Say "Commander, add my ${targetList.name} staples" to stock them all at once.`;
      return { ok: true, skill: 'shopping-lists:staples', spoken: msg, text: msg, data: { listId: targetList.id, staples: targetList.staples } };
    }
    if (/^(?:add|restock|load|put|fill)\b/i.test(cleanedInput)) {
      const added = [];
      for (const st of targetList.staples || []) {
        const r = store.addItem(targetList.id, st);
        added.push(r.item);
      }
      await maybeAutoSyncDrive(store, options);
      const msg = `Restocked ${added.length} ${targetList.name} staples onto your ${targetList.name} list, Commander.`;
      return { ok: true, skill: 'shopping-lists:staples', summary: msg, spoken: msg, text: msg, data: { listId: targetList.id, added } };
    }
  }

  if (Array.isArray(MEAL_BUNDLES) && /^(?:add|put|load|get|we\s+are\s+having|make\s+it|plan)\b/i.test(cleanedInput)) {
    const matchedBundle = MEAL_BUNDLES.find((b) => b.pattern.test(cleanedInput));
    if (matchedBundle) {
      const targetId = explicitListId || matchedBundle.defaultListId || defaultListId;
      const targetList = snap0.lists.find((l) => l.id === targetId) || snap0.lists[0];
      const added = [];
      for (const item of matchedBundle.items) {
        const res = store.addItem(targetList.id, item);
        added.push({ listId: targetList.id, item: res.item, merged: res.merged });
      }
      await maybeAutoSyncDrive(store, options);
      const itemNames = added.map((a) => a.item.name);
      const msg = `Added ${matchedBundle.label} (${added.length} items) to your ${targetList.name} list, Commander: ${joinNaturalSpoken(itemNames)}.`;
      return {
        ok: true,
        skill: 'shopping-lists:bundle',
        summary: msg,
        spoken: msg,
        text: msg,
        data: { bundle: matchedBundle.id, added, state: store.getSnapshot() },
      };
    }
  }

  // 8. LIST / SHOW / STATUS / VOICE QUERY ("what is on my costco list?", "can you see my grocery list?", "what groceries do we need?", "read the full grocery list", "read grocery list by aisle")
  const isShowQuery = /^(?:list|show|view|read|see|status|items)(?:\s+.*)?$/i.test(cleanedInput)
    || /^(?:what(?:'s|\s+is|\s+are)?\s+(?:left\s+)?(?:on|in)|what\s+(?:else\s+)?do\s+(?:we|i)\s+need(?:\s+(?:at|from|on|in|for))?|what\s+groceries\s+do\s+(?:we|i)\s+need|anything\s+(?:left\s+)?(?:on|in)|(?:read|show|see|check|tell\s+me|give\s+me)(?:\s+me)?\s+(?:what(?:'s|\s+is)\s+(?:left\s+)?(?:on|in)\s+)?(?:my|our|the|all|every))\b/i.test(cleanedInput);
  if (isShowQuery) {
    const wantsAllStores = /\ball\s+(?:my\s+|our\s+|the\s+)?(?:shopping\s+|store\s+)?lists\b|^list$|^status$|\bshopping\s+summary\b/i.test(cleanedInput);
    const targetId = wantsAllStores ? 'all' : (explicitListId || defaultListId);
    const filterMode = /\bunchecked|to[\s-]buy|left\b/i.test(cleanedInput) ? 'unchecked'
      : /\bchecked|in[\s-]cart\b/i.test(cleanedInput) ? 'checked'
      : 'all';
    const readAll = /\b(?:full|entire|whole|complete|every|everything|all\s+items)\b/i.test(cleanedInput);
    const byAisle = /\bby\s+aisles?\b/i.test(cleanedInput);
    return formatListsSummary(snap0, targetId, filterMode, { readAll, byAisle });
  }

  // 8.5 MOVE ITEM BETWEEN STORES ("Commander, move paper towels to Costco", "move laundry pods from grocery to Target")
  const moveMatch = cleanedInput.match(/^(?:move|transfer|switch|send)\s+(.+?)\s+(?:over\s+)?to\s+(?:my\s+|the\s+|our\s+)?(grocery|target|costco|[a-z0-9'\s\-]+?)(?:\s+shopping)?(?:\s+lists?)?[.!?]*$/i);
  if (moveMatch && typeof store.moveItem === 'function') {
    const toListId = resolveStoreIdFromText(moveMatch[2], snap0.lists, null);
    if (toListId) {
      const fromExplicit = resolveStoreIdFromText(moveMatch[1], snap0.lists, null);
      const itemQuery = stripStoreClause(moveMatch[1]);
      const found = findMatchingItem(snap0, itemQuery, fromExplicit);
      if (!found) {
        const msg = `Could not find "${itemQuery}" on your shopping lists to move.`;
        return { ok: false, skill: 'shopping-lists:move', spoken: msg, text: msg };
      }
      const moved = store.moveItem(found.list.id, found.item.id, toListId);
      await maybeAutoSyncDrive(store, options);
      const msg = moved.sameList
        ? `"${moved.item.name}" is already on your ${moved.toList.name} list.`
        : `Moved "${moved.item.name}" from ${moved.fromList.name} to ${moved.toList.name} (${moved.item.aisle}).`;
      return { ok: true, skill: 'shopping-lists:move', spoken: msg, text: msg, data: moved };
    }
  }

  // 8.6 ITEM NOTE, PRICE & BADGE UPDATES ("Commander, add a note to milk: get lactose free", "set price of salmon to 12.99", "mark eggs as urgent")
  const noteCmdMatch = cleanedInput.match(/^(?:add\s+(?:a\s+)?note\s+(?:to|on|for)|set\s+(?:the\s+)?note\s+(?:on|for)|note\s+(?:on|for))\s+(.+?)\s*(?::|-|\bto\b|\bsaying\b|\bthat\b)\s*(.+)$/i);
  if (noteCmdMatch) {
    const itemQuery = stripStoreClause(noteCmdMatch[1]);
    const noteText = noteCmdMatch[2].trim().replace(/[.]+$/, '');
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" to add a note.`;
      return { ok: false, skill: 'shopping-lists:note', spoken: msg, text: msg };
    }
    const res = store.updateItem(found.list.id, found.item.id, { note: noteText });
    await maybeAutoSyncDrive(store, options);
    const msg = `Added note "${noteText}" to ${res.item.name} on ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:note', spoken: msg, text: msg, data: res };
  }

  const priceCmdMatch = cleanedInput.match(/^(?:set\s+(?:the\s+)?price\s+(?:of|for|on)|price\s+(?:of|for))\s+(.+?)\s+(?:to|at|is)\s+\$?(\d+(?:\.\d{1,2})?)(?:\s+(?:on|in|at|for)\s+.*)?[.!?]*$/i);
  if (priceCmdMatch) {
    const itemQuery = stripStoreClause(priceCmdMatch[1]);
    const priceVal = Number(priceCmdMatch[2]);
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" to update price.`;
      return { ok: false, skill: 'shopping-lists:price', spoken: msg, text: msg };
    }
    const res = store.updateItem(found.list.id, found.item.id, { estPrice: priceVal });
    await maybeAutoSyncDrive(store, options);
    const msg = `Set estimated price of ${res.item.name} to $${res.item.estPrice.toFixed(2)} on ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:price', spoken: msg, text: msg, data: res };
  }

  const badgeCmdMatch = cleanedInput.match(/^(?:mark|flag|tag|set)\s+(.+?)\s+(?:as\s+)?(urgent|must\s+have|organic|on\s+sale|deal|coupon|kirkland)(?:\s+(?:on|in|at|for)\s+.*)?[.!?]*$/i);
  if (badgeCmdMatch) {
    const itemQuery = stripStoreClause(badgeCmdMatch[1]);
    const rawBadge = badgeCmdMatch[2].toLowerCase();
    const badge = rawBadge.startsWith('urgent') || rawBadge.startsWith('must') ? 'urgent'
      : rawBadge === 'organic' ? 'organic'
      : rawBadge === 'kirkland' ? 'kirkland'
      : 'deal';
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" on your shopping lists.`;
      return { ok: false, skill: 'shopping-lists:badge', spoken: msg, text: msg };
    }
    const res = store.updateItem(found.list.id, found.item.id, { badge });
    await maybeAutoSyncDrive(store, options);
    const msg = `Marked "${res.item.name}" as ${rawBadge} on ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:badge', spoken: msg, text: msg, data: res };
  }

  // 9. UNCHECK ITEM ("uncheck avocados", "put back milk on grocery", "put milk back on the list")
  const uncheckMatch = cleanedInput.match(/^(?:uncheck|unmark|put\s+back)\s+(.+)$/i)
    || cleanedInput.match(/^put\s+(.+?)\s+back(?:\s+on.*)?$/i);
  if (uncheckMatch) {
    const itemQuery = stripStoreClause(uncheckMatch[1]);
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" to uncheck.`;
      return { ok: false, skill: 'shopping-lists:uncheck', spoken: msg, text: msg };
    }
    const res = store.toggleItem(found.list.id, found.item.id, false);
    await maybeAutoSyncDrive(store, options);
    const msg = `Put "${res.item.name}" back on your ${found.list.name} to-buy list.`;
    return { ok: true, skill: 'shopping-lists:uncheck', spoken: msg, text: msg, data: res };
  }

  // 10. CHECK / CROSS OFF ITEM(S) ("check avocados", "check off milk and eggs", "I got the rotisserie chicken", "picked up avocados", "x avocados")
  const checkMatch = cleanedInput.match(/^(?:check(?:\s+off)?|cross\s+off|mark(?:\s+off)?|tick\s+off|(?:i\s+)?(?:just\s+)?(?:got|bought|picked\s+up|grabbed)|x)\s+(.+)$/i)
    || cleanedInput.match(/^(.+?)\s+(?:is|are)\s+in\s+(?:my|the|our)\s+cart[.!?]*$/i);
  if (checkMatch) {
    const cleanedTarget = stripStoreClause(checkMatch[1]).replace(/\s+(?:checked|done|off)$/i, '').trim();
    const subQueries = cleanedTarget.split(/\s*(?:,|\band\b)\s*/i).map((s) => s.replace(/^(?:the|my|our)\s+/i, '').trim()).filter(Boolean);
    const checkedItems = [];
    let lastRes = null;
    for (const q of (subQueries.length ? subQueries : [cleanedTarget])) {
      const snapCur = store.getSnapshot();
      const found = findMatchingItem(snapCur, q, explicitListId);
      if (found) {
        lastRes = store.toggleItem(found.list.id, found.item.id, true);
        checkedItems.push({ list: found.list, item: lastRes.item });
      }
    }
    if (!checkedItems.length) {
      const msg = `Could not find "${cleanedTarget}" on your shopping lists.`;
      return { ok: false, skill: 'shopping-lists:check', spoken: msg, text: msg };
    }
    await maybeAutoSyncDrive(store, options);
    const msg = checkedItems.length === 1
      ? `Checked off "${checkedItems[0].item.name}" on ${checkedItems[0].list.name}.`
      : `Checked off ${checkedItems.length} items: ${joinNaturalSpoken(checkedItems.map((c) => c.item.name))}.`;
    return { ok: true, skill: 'shopping-lists:check', spoken: msg, text: msg, data: checkedItems.length === 1 ? lastRes : { checkedItems, state: store.getSnapshot() } };
  }

  // 11. QUANTITY ADJUSTMENT ("qty avocados +2", "double the avocados", "add 2 more avocados", "set quantity of milk to 3", "change milk to 2", "more avocados", "less avocados")
  const doubleMatch = cleanedInput.match(/^(?:double|triple)\s+(?:the\s+|my\s+)?(.+)$/i);
  if (doubleMatch) {
    const mult = /^triple/i.test(cleanedInput) ? 3 : 2;
    const itemQuery = stripStoreClause(doubleMatch[1]);
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" to ${mult === 3 ? 'triple' : 'double'}.`;
      return { ok: false, skill: 'shopping-lists:qty', spoken: msg, text: msg };
    }
    const res = store.updateItem(found.list.id, found.item.id, { qty: found.item.qty * mult });
    await maybeAutoSyncDrive(store, options);
    const msg = `Updated "${res.item.name}" quantity to ${res.item.qty} ${res.item.unit} on ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:qty', spoken: msg, text: msg, data: res };
  }

  const nMoreMatch = cleanedInput.match(/^(?:add|get|grab)\s+(\d+|one|two|three|four|five|six|couple)\s+more\s+(.+)$/i);
  if (nMoreMatch) {
    const delta = Number(nMoreMatch[1]) || SPOKEN_NUM[nMoreMatch[1].toLowerCase()] || 1;
    const itemQuery = stripStoreClause(nMoreMatch[2]);
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (found) {
      const res = store.adjustItemQty(found.list.id, found.item.id, delta);
      await maybeAutoSyncDrive(store, options);
      const msg = `Bumped "${res.item.name}" up to ${res.item.qty} ${res.item.unit} on ${found.list.name}.`;
      return { ok: true, skill: 'shopping-lists:qty', spoken: msg, text: msg, data: res };
    }
  }

  const qtyCmdMatch = cleanedInput.match(/^(?:qty|quantity)\s+(.+?)\s+([+-]?\d+(?:\.\d+)?)$/i)
    || cleanedInput.match(/^(?:set\s+(?:the\s+)?(?:qty|quantity)\s+of|change\s+(?:the\s+)?(?:qty|quantity)\s+of|update\s+quantity\s+of)\s+(.+?)\s+to\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|dozen)[.!?]*$/i);
  if (qtyCmdMatch) {
    const itemQuery = stripStoreClause(qtyCmdMatch[1]);
    const rawNum = qtyCmdMatch[2].trim().toLowerCase();
    const parsedNum = SPOKEN_NUM[rawNum] || Number(rawNum);
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" to update quantity.`;
      return { ok: false, skill: 'shopping-lists:qty', spoken: msg, text: msg };
    }
    let res;
    if (rawNum.startsWith('+') || rawNum.startsWith('-')) {
      res = store.adjustItemQty(found.list.id, found.item.id, Number(rawNum));
    } else {
      res = store.updateItem(found.list.id, found.item.id, { qty: parsedNum });
    }
    await maybeAutoSyncDrive(store, options);
    const msg = `Updated "${res.item.name}" quantity to ${res.item.qty} ${res.item.unit} on ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:qty', spoken: msg, text: msg, data: res };
  }

  const moreLessMatch = cleanedInput.match(/^(more|less|fewer)\s+(.+)$/i);
  if (moreLessMatch) {
    const delta = moreLessMatch[1].toLowerCase() === 'more' ? 1 : -1;
    const itemQuery = stripStoreClause(moreLessMatch[2]);
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" on your shopping lists.`;
      return { ok: false, skill: 'shopping-lists:qty', spoken: msg, text: msg };
    }
    const res = store.adjustItemQty(found.list.id, found.item.id, delta);
    await maybeAutoSyncDrive(store, options);
    const msg = `Updated "${res.item.name}" quantity to ${res.item.qty} ${res.item.unit} on ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:qty', spoken: msg, text: msg, data: res };
  }

  // 12. REMOVE / DELETE ITEM ("remove tide pods from target", "take Wheat Thins off my grocery list", "we don't need avocados anymore", "scratch milk")
  const removeMatch = cleanedInput.match(/^(?:remove|delete|rm|drop|scratch|nix|-)\s+(.+)$/i)
    || cleanedInput.match(/^take\s+(.+?)\s+off(?:\s+.*)?$/i)
    || cleanedInput.match(/^(?:we|i)\s+don'?t\s+need\s+(.+?)(?:\s+anymore|\s+any\s+more)?[.!?]*$/i);
  if (removeMatch) {
    const itemQuery = stripStoreClause(removeMatch[1]).replace(/\s+(?:off|anymore|any\s+more)$/i, '').trim();
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" to remove.`;
      return { ok: false, skill: 'shopping-lists:remove', spoken: msg, text: msg };
    }
    const res = store.removeItem(found.list.id, found.item.id);
    await maybeAutoSyncDrive(store, options);
    const msg = `Removed "${res.removed.name}" from ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:remove', spoken: msg, text: msg, data: res };
  }

  // Guard: never let unrecognized open-ended questions get added as fake grocery items!
  if (/^(?:what|how|why|when|where|who|which|can\s+(?:i|we|you)|could\s+you|do\s+you)\b/i.test(cleanedInput)) {
    const msg = 'Try saying "Commander, can you see my grocery list?", "Commander, add milk to grocery", or "Commander, what can I say for grocery lists?".';
    return { ok: false, skill: 'shopping-lists:help', summary: msg, spoken: msg, text: msg };
  }

  // 13. ADD ITEMS (Explicit "add ...", "at <item> to <store>" STT mishearing, "we're out of ...", "running low on ...", "remind me to buy ...", "grab ...", or direct shorthand item string)
  const isOutPhrase = /\b(?:out\s+of|running\s+low\s+on|low\s+on)\b/i.test(cleanedInput);
  const addPayload = cleanedInput
    .replace(/^(?:(?:we(?:'re|\s+are)|i(?:'m|\s+am))\s+)?(?:just\s+)?(?:all\s+|almost\s+|nearly\s+)?(?:ran\s+)?out\s+of\s+/i, '')
    .replace(/^(?:(?:we(?:'re|\s+are)|i(?:'m|\s+am))\s+)?(?:running\s+)?low\s+on\s+/i, '')
    .replace(/^(?:don'?t\s+let\s+me\s+forget(?:\s+to\s+(?:buy|get|grab|pick\s+up))?|remind\s+me\s+to\s+(?:buy|get|grab|pick\s+up))\s+/i, '')
    .replace(/^(?:(?:we|i)\s+need(?:\s+to\s+(?:buy|get|grab|pick\s+up))?|add|plus|buy|get|grab|pick\s+up|put|need|\+)\s+/i, '')
    .replace(/^at\s+(?=.+\b(?:to|on|in|for)\s+(?:my\s+|the\s+|our\s+)?(?:grocery|target|costco|shopping))/i, '')
    .trim();

  const isMultiChunk = /[,;\n]/.test(addPayload);
  const addDefaultListId = isMultiChunk ? (options.listId || snap0.activeListId || 'grocery') : defaultListId;
  const batchRes = store.smartBatchAdd(addPayload, addDefaultListId);
  if (!batchRes.added.length) {
    const msg = `No items recognized in "${rawInput}".`;
    return { ok: false, skill: 'shopping-lists:add', summary: msg, spoken: msg, text: msg };
  }

  await maybeAutoSyncDrive(store, options);

  const listMap = new Map(batchRes.state.lists.map((l) => [l.id, l]));
  const summaryParts = batchRes.added.map((entry) => {
    const listName = listMap.get(entry.listId)?.name || entry.listId;
    const qtyLabel = `${entry.item.qty} ${entry.item.unit !== 'ea' ? entry.item.unit + ' ' : ''}${entry.item.name}`;
    return `${qtyLabel} → ${listName} (${entry.item.aisle})`;
  });

  let spoken;
  if (batchRes.added.length === 1) {
    const first = batchRes.added[0];
    const destName = listMap.get(first.listId)?.name || first.listId;
    const qtyUnit = `${first.item.qty} ${first.item.unit !== 'ea' ? first.item.unit + ' ' : ''}${first.item.name}`;
    if (first.merged) {
      spoken = `Updated ${first.item.name} on ${destName} — you now have ${first.item.qty} ${first.item.unit !== 'ea' ? first.item.unit + ' ' : ''}to buy.`;
    } else if (isOutPhrase) {
      spoken = `Got it, Commander — added ${qtyUnit} to ${destName} (${first.item.aisle}).`;
    } else {
      spoken = `Added ${qtyUnit} to ${destName}.`;
    }
  } else {
    spoken = `Added ${batchRes.added.length} items: ${summaryParts.join('; ')}.`;
  }

  return {
    ok: true,
    skill: 'shopping-lists:add',
    summary: spoken,
    spoken,
    text: `Added ${batchRes.added.length} item${batchRes.added.length === 1 ? '' : 's'}:\n  • ${summaryParts.join('\n  • ')}`,
    data: batchRes,
  };
}

/**
 * Render the plain-text printable guide for CLI `guide` / `help`.
 */
function renderPrintableCommandGuideText() {
  return [
    '================================================================================',
    '  ROBOS SHOPPING LISTS — SKILLS & TEXT COMMANDS PRINTABLE GUIDE',
    '  Pre-Seeded Lists:  1) 🥬 Grocery   2) 🎯 Target   3) 📦 Costco',
    '================================================================================',
    '',
    '1. AI AGENT SKILL & SLASH COMMANDS (Claude, Codex, Antigravity, Copilot, Gemini)',
    '--------------------------------------------------------------------------------',
    '  /shopping-lists list                          Show all 3 lists & totals',
    '  /shopping-lists list costco                   Show Costco items & aisles',
    '  /shopping-lists add "2 gal milk, 4 avocados"  Add items to active/Grocery list',
    '  /shopping-lists add "tide pods @target, rotisserie chicken @costco"',
    '  /shopping-lists check "avocados"              Check item off (mark in cart)',
    '  /shopping-lists uncheck "avocados"            Put item back on To-Buy list',
    '  /shopping-lists qty "avocados" +2             Step quantity (+N, -N, or exact N)',
    '  /shopping-lists remove "tide pods" --list target',
    '  /shopping-lists clear-checked --list grocery  Remove all checked items',
    '  /shopping-lists undo                          Restore last removed/cleared items',
    '  /shopping-lists sync                          Two-way Google Docs & Drive sync',
    '  /shopping-lists print                         Print clean checklist for the fridge',
    '',
    '2. SMART TEXT & QUICK-PASTE SHORTHAND (Desktop App, Mobile Web, CLI & Voice)',
    '--------------------------------------------------------------------------------',
    '  Separate multiple items with commas (,), semicolons (;), or newlines:',
    '  • Store Routing Tags:',
    '      @grocery   or  "at grocery" / "on grocery list"  → 🥬 Grocery',
    '      @target    or  "at target"  / "from target"      → 🎯 Target',
    '      @costco    or  "at costco"  / "kirkland" / "bulk"→ 📦 Costco',
    '  • Quantity & Unit Prefixes:',
    '      2 gal | 3 lb | 16 oz | 2 pack | 1 case | 2 bag | 1 box | 1 bunch | 2 bottle | 1 jar',
    '  • Inline Price & Notes:',
    '      $4.99          Sets estimated unit price ($4.99)',
    '      (extra firm)   Parentheses at end set item note ("extra firm")',
    '  • Auto-Badge Keywords:',
    '      urgent / must  → 🔥 Must Have        organic         → 🌿 Organic',
    '      kirkland       → ⭐ Store Brand      deal / coupon   → 🏷️ Sale / Coupon',
    '  • Example One-Liner (routes to all 3 stores automatically):',
    '      2 gal organic milk $4.89 (whole), 4 avocados, laundry pods @target, kirkland paper towels @costco',
    '',
    '3. "COMMANDER" VOICE & NATURAL TEXT COMMANDS (RobOS Assistant / RobOS Voice)',
    '--------------------------------------------------------------------------------',
    '  • "Commander, can you see my grocery list?" / "Commander, read my grocery list by aisle"',
    '  • "Commander, add 2 gallons of milk and 4 avocados to the grocery list"',
    '  • "Commander, we\'re out of eggs and butter" / "Commander, running low on olive oil"',
    '  • "Commander, is milk on my grocery list?" / "Commander, do we need avocados?"',
    '  • "Commander, what do we need in Produce?" / "Commander, how much is my Costco list?"',
    '  • "Commander, add taco night to grocery" (pasta, breakfast, burger, pizza, smoothie, stir fry, baking, sick day)',
    '  • "Commander, add my grocery staples" / "Commander, what\'s in my cart?"',
    '  • "Commander, check off avocados and milk" / "Commander, I got the rotisserie chicken"',
    '  • "Commander, double the avocados" / "Commander, move paper towels to Costco"',
    '  • "Commander, add a note to milk: lactose free" / "Commander, mark eggs as urgent"',
    '  • "Commander, take Tide pods off Target" / "Commander, clear checked on Grocery" / "Commander, undo"',
    '',
    '4. GOOGLE DOCS MOBILE TEXT SYNTAX (Edit in Google Docs App on Phone)',
    '--------------------------------------------------------------------------------',
    '  • Unchecked item (To Buy):   ☐ Organic Honeycrisp Apples — 2 bag · $5.49 [🌿 ORGANIC]',
    '  • Checked item (In Cart):    ☑ Rotisserie Chicken — 1 ea · $4.99',
    '  • Markdown checkboxes too:   [ ] Unchecked item   |   [x] Checked item',
    '  • Item sub-note line:        ↳ Pick crisp ones',
    '',
    '5. TERMINAL CLI & HTTP API COMMANDS',
    '--------------------------------------------------------------------------------',
    '  node packages/shopping-lists/bin/shopping-lists.js list [grocery|target|costco|all]',
    '  node packages/shopping-lists/bin/shopping-lists.js add "2 gal milk, batteries @target"',
    '  node packages/shopping-lists/bin/shopping-lists.js check "avocados"',
    '  node packages/shopping-lists/bin/shopping-lists.js qty "avocados" +2',
    '  node packages/shopping-lists/bin/shopping-lists.js remove "avocados"',
    '  node packages/shopping-lists/bin/shopping-lists.js sync --pull',
    '  node packages/shopping-lists/bin/shopping-lists.js guide',
    '   Printable Web Cheat Sheet:  http://127.0.0.1:19225/guide',
    '================================================================================',
  ].join('\n');
}

/**
 * Render a print-optimized HTML page for `GET /guide` on port 19225.
 */
function renderPrintableGuideHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RobOS Shopping Lists — Printable Skills & Text Commands Guide</title>
  <style>
    :root {
      --bg: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --text: #f0f6fc;
      --muted: #8b949e;
      --cyan: #00bcd4;
      --green: #22c55e;
      --red: #ef4444;
      --blue: #3b82f6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
    }
    .sheet {
      max-width: 980px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--cyan);
      margin-bottom: 20px;
    }
    h1 {
      margin: 0 0 6px 0;
      font-size: 24px;
      letter-spacing: -0.02em;
    }
    .subtitle {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }
    .store-badges {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      border: 1px solid var(--border);
      background: var(--card);
    }
    .print-btn {
      padding: 10px 18px;
      border-radius: 10px;
      border: 1px solid var(--cyan);
      background: rgba(0, 188, 212, 0.15);
      color: var(--text);
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      break-inside: avoid;
    }
    .card.full {
      grid-column: 1 / -1;
    }
    h2 {
      margin: 0 0 10px 0;
      font-size: 15px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--cyan);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      background: rgba(255, 255, 255, 0.07);
      padding: 2px 6px;
      border-radius: 5px;
    }
    @media print {
      :root {
        --bg: #ffffff;
        --card: #ffffff;
        --border: #d0d7de;
        --text: #111827;
        --muted: #4b5563;
        --cyan: #0f766e;
      }
      body { padding: 0; font-size: 11pt; }
      .print-btn { display: none; }
      .card { border: 1px solid #cbd5e1; }
      code { background: #f1f5f9; border: 1px solid #e2e8f0; color: #0f172a; }
    }
    @media (max-width: 720px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <h1>🛒 RobOS Shopping Lists — Skills &amp; Text Commands Guide</h1>
        <p class="subtitle">Quick-reference sheet for AI Agent skills, Smart Multi-Store text shorthand, Voice commands, Google Docs mobile edits, and CLI.</p>
        <div class="store-badges">
          <span class="badge">1) 🥬 Grocery (<code>@grocery</code>)</span>
          <span class="badge">2) 🎯 Target (<code>@target</code>)</span>
          <span class="badge">3) 📦 Costco (<code>@costco</code>)</span>
        </div>
      </div>
      <button class="print-btn" onclick="window.print()">🖨️ Print Guide</button>
    </div>

    <div class="grid">
      <section class="card full">
        <h2>1. AI Agent Skill &amp; Slash Commands (<code>/shopping-lists</code>)</h2>
        <table>
          <thead>
            <tr><th>Command</th><th>What It Does</th></tr>
          </thead>
          <tbody>
            <tr><td><code>/shopping-lists list [grocery|target|costco|all]</code></td><td>Show items to buy, items in cart, aisle groupings, and estimated totals.</td></tr>
            <tr><td><code>/shopping-lists add "2 gal milk, tide pods @target, rotisserie chicken @costco"</code></td><td>Parse quantities, units, badges, and store tags and route each item to its store list.</td></tr>
            <tr><td><code>/shopping-lists check "avocados"</code> / <code>uncheck "avocados"</code></td><td>Check an item off (mark in cart) or put it back on the To-Buy list.</td></tr>
            <tr><td><code>/shopping-lists qty "avocados" +2</code> (or <code>-1</code> or <code>6</code>)</td><td>Increment, decrement, or set the exact quantity of an item.</td></tr>
            <tr><td><code>/shopping-lists remove "tide pods" --list target</code></td><td>Remove an item from the list (saved to the Undo stack).</td></tr>
            <tr><td><code>/shopping-lists clear-checked --list grocery</code> / <code>undo</code></td><td>Clear all checked-off items or restore the last removed/cleared items.</td></tr>
            <tr><td><code>/shopping-lists sync [--pull]</code></td><td>Run two-way Google Docs &amp; Google Drive sync across all 3 lists.</td></tr>
            <tr><td><code>/shopping-lists print [grocery|target|costco|all]</code></td><td>Generate a clean, fridge-ready printable checklist grouped by aisle.</td></tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>2. Smart Paste &amp; Quick-Entry Shorthand</h2>
        <table>
          <thead>
            <tr><th>Syntax</th><th>Example &amp; Effect</th></tr>
          </thead>
          <tbody>
            <tr><td><code>@grocery</code>, <code>@target</code>, <code>@costco</code></td><td><code>laundry pods @target</code> → routes to Target</td></tr>
            <tr><td><code>at/to/on &lt;store&gt;</code></td><td><code>paper towels at costco</code> → routes to Costco</td></tr>
            <tr><td><code>kirkland</code> / <code>bulk</code></td><td><code>kirkland almond butter</code> → auto-routes to Costco</td></tr>
            <tr><td><code>&lt;qty&gt; &lt;unit&gt; &lt;name&gt;</code></td><td><code>2 gal organic milk</code> → Qty <code>2</code>, Unit <code>gal</code></td></tr>
            <tr><td><code>$&lt;price&gt;</code></td><td><code>ribeye steaks $34.99</code> → Est. Price <code>$34.99</code></td></tr>
            <tr><td><code>(&lt;note&gt;)</code></td><td><code>avocados (medium ripe)</code> → Note <code>medium ripe</code></td></tr>
            <tr><td><code>#urgent</code> / <code>must</code></td><td>Applies <strong>🔥 Must Have</strong> badge</td></tr>
            <tr><td><code>#organic</code></td><td>Applies <strong>🌿 Organic</strong> badge</td></tr>
            <tr><td><code>#kirkland</code></td><td>Applies <strong>⭐ Store Brand</strong> badge</td></tr>
            <tr><td><code>#deal</code> / <code>coupon</code> / <code>sale</code></td><td>Applies <strong>🏷️ Sale / Coupon</strong> badge</td></tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>3. "Commander" Voice &amp; Natural Text Commands</h2>
        <table>
          <thead>
            <tr><th>Say or Type</th><th>Action</th></tr>
          </thead>
          <tbody>
            <tr><td><code>"Commander, can you see my grocery list?"</code></td><td>Reads unchecked items &amp; estimated total (or say <code>by aisle</code> / <code>full list</code>).</td></tr>
            <tr><td><code>"Commander, add 2 gal milk and 4 avocados to grocery"</code></td><td>Adds both items with quantities &amp; aisles to Grocery.</td></tr>
            <tr><td><code>"Commander, we're out of eggs"</code> / <code>"running low on olive oil"</code></td><td>Auto-adds out-of-stock kitchen items even without saying "list".</td></tr>
            <tr><td><code>"Commander, is milk on my grocery list?"</code></td><td>Checks whether an item is already on the list or in your cart.</td></tr>
            <tr><td><code>"Commander, what do we need in Produce?"</code></td><td>Reads only the items needed in that store aisle.</td></tr>
            <tr><td><code>"Commander, add taco night to grocery"</code></td><td>Adds full meal bundle (pasta, breakfast, burger, pizza, smoothie, stir fry, sick day).</td></tr>
            <tr><td><code>"Commander, check off milk and avocados"</code> / <code>"I got chicken"</code></td><td>Marks one or multiple items checked (in cart).</td></tr>
            <tr><td><code>"Commander, move paper towels to Costco"</code></td><td>Moves an item between Grocery, Target, and Costco.</td></tr>
            <tr><td><code>"Commander, double the avocados"</code> / <code>"mark eggs urgent"</code></td><td>Updates quantities, notes, prices, or priority badges.</td></tr>
            <tr><td><code>"Commander, clear checked on Grocery"</code> / <code>"Commander, undo"</code></td><td>Clears completed items or restores the last change.</td></tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>4. Google Docs Mobile Text Syntax</h2>
        <table>
          <thead>
            <tr><th>Doc Line Format</th><th>Meaning on Sync</th></tr>
          </thead>
          <tbody>
            <tr><td><code>☐ Avocados — 4 ea · $1.25</code></td><td>Unchecked item (To Buy), qty 4, $1.25 each</td></tr>
            <tr><td><code>☑ Avocados — 4 ea · $1.25</code></td><td>Checked item (In Cart)</td></tr>
            <tr><td><code>[ ] Milk — 1 gal</code> / <code>[x] Milk</code></td><td>Plain-text checkbox alternative on mobile</td></tr>
            <tr><td><code>[🔥 MUST HAVE]</code> / <code>[🌿 ORGANIC]</code></td><td>Preserves or sets item badge in Google Docs</td></tr>
            <tr><td><code>↳ Pick medium-ripe ones</code></td><td>Indented note line under an item</td></tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>5. Terminal CLI &amp; Local HTTP API</h2>
        <table>
          <thead>
            <tr><th>CLI / Endpoint</th><th>Usage</th></tr>
          </thead>
          <tbody>
            <tr><td><code>shopping-lists list [store]</code></td><td><code>node packages/shopping-lists/bin/shopping-lists.js list</code></td></tr>
            <tr><td><code>shopping-lists add "&lt;text&gt;"</code></td><td><code>node packages/shopping-lists/bin/shopping-lists.js add "2 gal milk"</code></td></tr>
            <tr><td><code>shopping-lists cmd "&lt;text&gt;"</code></td><td>Run any natural command from terminal</td></tr>
            <tr><td><code>POST :19225/api/command</code></td><td><code>{"command": "add 2 avocados @grocery"}</code></td></tr>
            <tr><td><code>GET :19225/guide</code></td><td>Open this printable guide in any browser</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  isLikelyShoppingVoiceCommand,
  resolveStoreIdFromText,
  findMatchingItem,
  formatListsSummary,
  renderPrintableChecklist,
  executeTextCommand,
  renderPrintableCommandGuideText,
  renderPrintableGuideHtml,
};
