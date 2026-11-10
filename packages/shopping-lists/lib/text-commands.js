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

const { syncWithGoogleDrive } = require('./google-drive-sync');

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
    .replace(/\b(?:on|in|from|to|at|for)\s+(?:my\s+|the\s+|our\s+)?(?:grocery|target|costco)(?:\s+shopping)?(?:\s+list)?\b/gi, ' ')
    .replace(/^(?:grocery|target|costco)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find an item by ID, exact name, or substring match across one list or all lists.
 */
function findMatchingItem(snapshot, query, preferredListId = null) {
  const q = String(query || '').trim().toLowerCase();
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

  // 2. Substring match (prefer unchecked items when checking/modifying)
  for (const list of searchOrder) {
    const uncheckedMatch = list.items.find((it) => !it.checked && it.name.toLowerCase().includes(q));
    if (uncheckedMatch) return { list, item: uncheckedMatch };
    const anyMatch = list.items.find((it) => it.name.toLowerCase().includes(q) || q.includes(it.name.toLowerCase()));
    if (anyMatch) return { list, item: anyMatch };
  }

  return null;
}

/**
 * Format one or all shopping lists as a spoken sentence (for RobOS Voice) and a printable text block.
 */
function formatListsSummary(snapshot, targetListId = 'all', filterMode = 'all') {
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
    const sample = unchecked.slice(0, 5).map((i) => `${i.qty > 1 ? `${i.qty} ${i.unit !== 'ea' ? i.unit + ' ' : ''}` : ''}${i.name}`).join(', ');
    const more = unchecked.length > 5 ? `, and ${unchecked.length - 5} more` : '';
    const spoken = unchecked.length === 0
      ? `Your ${l.name} list is all checked off (${checked.length} item${checked.length === 1 ? '' : 's'} in cart).`
      : `Your ${l.name} list has ${unchecked.length} item${unchecked.length === 1 ? '' : 's'} to buy ($${l.stats.estRemaining.toFixed(2)} estimated): ${sample}${more}.`;

    return {
      ok: true,
      skill: 'shopping-lists:list',
      listId: l.id,
      spoken,
      text: renderPrintableChecklist(snapshot, l.id, filterMode),
      data: { list: l },
    };
  }

  const parts = lists.map((l) => `${l.name}: ${l.stats.toBuyCount} to buy (${l.stats.checkedCount} checked)`);
  const spoken = `You have ${snapshot.overall.toBuyCount} items to buy across ${lists.length} lists ($${snapshot.overall.estTotal.toFixed(2)} total) — ${parts.join('; ')}.`;
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
  const input = String(rawInput || '').trim();
  if (!input) {
    return {
      ok: false,
      spoken: 'Enter a shopping list command, such as "add 2 gal milk, tide pods @target".',
      text: 'Enter a shopping list command.',
    };
  }

  const snap0 = store.getSnapshot();
  const explicitListId = options.listId || resolveStoreIdFromText(input, snap0.lists, null);
  const defaultListId = explicitListId || snap0.activeListId || 'grocery';

  // Strip optional leading slash command "/shopping-lists" or "Ok Nabu" / "Hello RobOS" prefix
  const cleanedInput = input
    .replace(/^\/shopping-lists?\b\s*/i, '')
    .replace(/^(?:(?:hey|hello|hi|ok|okay|yo)\s+)?(?:nabu|na\s+bu|naboo|robos|rob\s+os|row\s+bose)\b[,.:;!\-\s]*/i, '')
    .replace(/^(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:please\s+)?/i, '')
    .trim();

  // 1. HELP / GUIDE
  if (/^(?:help|guide|commands|cheat\s*sheet|\?)$/i.test(cleanedInput)) {
    const text = renderPrintableCommandGuideText();
    return {
      ok: true,
      skill: 'shopping-lists:guide',
      spoken: 'Here is the RobOS Shopping Lists skills and text commands guide.',
      text,
      data: { guide: true },
    };
  }

  // 2. UNDO
  if (/^(?:undo|undo\s+last(?:\s+action)?)$/i.test(cleanedInput)) {
    const res = store.undo();
    const msg = res.restored ? `Undid: ${res.label}.` : 'Nothing to undo.';
    return {
      ok: res.restored,
      skill: 'shopping-lists:undo',
      spoken: msg,
      text: msg,
      data: res,
    };
  }

  // 3. CLEAR CHECKED
  const clearMatch = cleanedInput.match(/^(?:clear|remove|delete|clean|purge)\s+(?:all\s+)?(?:checked|completed|bought|done|in[\s-]cart)(?:\s+items?)?(?:\s+.*)?$/i);
  if (clearMatch) {
    const targetId = explicitListId || defaultListId;
    const listName = snap0.lists.find((l) => l.id === targetId)?.name || targetId;
    const res = store.clearChecked(targetId);
    const msg = `Cleared ${res.removedCount} checked item${res.removedCount === 1 ? '' : 's'} from ${listName}.`;
    return {
      ok: true,
      skill: 'shopping-lists:clear-checked',
      spoken: msg,
      text: msg,
      data: res,
    };
  }

  // 4. CHECK ALL / UNCHECK ALL
  const checkAllMatch = cleanedInput.match(/^(check|uncheck)\s+all(?:\s+items?)?(?:\s+.*)?$/i);
  if (checkAllMatch) {
    const checked = checkAllMatch[1].toLowerCase() === 'check';
    const targetId = explicitListId || defaultListId;
    const listName = snap0.lists.find((l) => l.id === targetId)?.name || targetId;
    const res = store.checkAll(targetId, checked);
    const msg = `${checked ? 'Checked' : 'Unchecked'} all items in ${listName}.`;
    return {
      ok: true,
      skill: 'shopping-lists:check-all',
      spoken: msg,
      text: msg,
      data: res,
    };
  }

  // 5. SYNC WITH GOOGLE DRIVE
  if (/^(?:sync|sync\s+drive|sync\s+google\s+drive|sync\s+docs|pull\s+drive|push\s+drive)(?:\s+(--pull|pull))?$/i.test(cleanedInput)) {
    const pullChanges = /\bpull\b/i.test(cleanedInput) || options.pull !== false;
    const res = await syncWithGoogleDrive(store, { pullChanges, fetchImpl: options.fetchImpl });
    return {
      ok: res.ok,
      skill: 'shopping-lists:sync',
      spoken: res.message,
      text: res.message,
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
  const printMatch = cleanedInput.match(/^print(?:\s+(grocery|target|costco|all))?$/i);
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

  // 8. LIST / SHOW / STATUS / VOICE QUERY ("what is on my costco list?", "show target list", "list grocery")
  const isShowQuery = /^(?:list|show|view|read|status|items)(?:\s+.*)?$/i.test(cleanedInput)
    || /^(?:what(?:'s|\s+is|\s+are)?\s+(?:on|in)|what\s+do\s+(?:we|i)\s+need\s+(?:at|from|on|in)|read\s+(?:me\s+)?(?:my|our|the))\s+.*(?:shopping|grocery|target|costco|list)/i.test(cleanedInput);
  if (isShowQuery) {
    const targetId = /\ball\b/i.test(cleanedInput) ? 'all' : (explicitListId || (cleanedInput.toLowerCase() === 'list' || cleanedInput.toLowerCase() === 'status' ? 'all' : defaultListId));
    const filterMode = /\bunchecked|to[\s-]buy\b/i.test(cleanedInput) ? 'unchecked'
      : /\bchecked|in[\s-]cart\b/i.test(cleanedInput) ? 'checked'
      : 'all';
    return formatListsSummary(snap0, targetId, filterMode);
  }

  // 9. UNCHECK ITEM ("uncheck avocados", "put back milk on grocery")
  const uncheckMatch = cleanedInput.match(/^(?:uncheck|unmark|put\s+back)\s+(.+)$/i);
  if (uncheckMatch) {
    const itemQuery = stripStoreClause(uncheckMatch[1]);
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" to uncheck.`;
      return { ok: false, skill: 'shopping-lists:uncheck', spoken: msg, text: msg };
    }
    const res = store.toggleItem(found.list.id, found.item.id, false);
    const msg = `Unchecked "${res.item.name}" on ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:uncheck', spoken: msg, text: msg, data: res };
  }

  // 10. CHECK / CROSS OFF ITEM ("check avocados", "check off milk", "got rotisserie chicken", "x avocados")
  const checkMatch = cleanedInput.match(/^(?:check(?:\s+off)?|cross\s+off|mark(?:\s+off)?|got|bought|x)\s+(.+)$/i);
  if (checkMatch) {
    const itemQuery = stripStoreClause(checkMatch[1]).replace(/\s+(?:checked|done|off)$/i, '').trim();
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" on your shopping lists.`;
      return { ok: false, skill: 'shopping-lists:check', spoken: msg, text: msg };
    }
    const res = store.toggleItem(found.list.id, found.item.id, true);
    const msg = `Checked off "${res.item.name}" on ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:check', spoken: msg, text: msg, data: res };
  }

  // 11. QUANTITY ADJUSTMENT ("qty avocados +2", "qty avocados 6", "set quantity of milk to 3", "more avocados", "less avocados")
  const qtyCmdMatch = cleanedInput.match(/^(?:qty|quantity)\s+(.+?)\s+([+-]?\d+(?:\.\d+)?)$/i)
    || cleanedInput.match(/^(?:set\s+(?:the\s+)?(?:qty|quantity)\s+of)\s+(.+?)\s+to\s+(\d+(?:\.\d+)?)$/i);
  if (qtyCmdMatch) {
    const itemQuery = stripStoreClause(qtyCmdMatch[1]);
    const rawNum = qtyCmdMatch[2].trim();
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" to update quantity.`;
      return { ok: false, skill: 'shopping-lists:qty', spoken: msg, text: msg };
    }
    let res;
    if (rawNum.startsWith('+') || rawNum.startsWith('-')) {
      res = store.adjustItemQty(found.list.id, found.item.id, Number(rawNum));
    } else {
      res = store.updateItem(found.list.id, found.item.id, { qty: Number(rawNum) });
    }
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
    const msg = `Updated "${res.item.name}" quantity to ${res.item.qty} ${res.item.unit} on ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:qty', spoken: msg, text: msg, data: res };
  }

  // 12. REMOVE / DELETE ITEM ("remove tide pods from target", "delete avocados", "rm croissants @costco", "- avocados")
  const removeMatch = cleanedInput.match(/^(?:remove|delete|rm|drop|-)\s+(.+)$/i);
  if (removeMatch) {
    const itemQuery = stripStoreClause(removeMatch[1]);
    const found = findMatchingItem(snap0, itemQuery, explicitListId);
    if (!found) {
      const msg = `Could not find "${itemQuery}" to remove.`;
      return { ok: false, skill: 'shopping-lists:remove', spoken: msg, text: msg };
    }
    const res = store.removeItem(found.list.id, found.item.id);
    const msg = `Removed "${res.removed.name}" from ${found.list.name}.`;
    return { ok: true, skill: 'shopping-lists:remove', spoken: msg, text: msg, data: res };
  }

  // 13. ADD ITEMS (Explicit "add ...", "+ ...", "buy ...", "put ...", or direct shorthand item string)
  const addPayload = cleanedInput
    .replace(/^(?:add|plus|buy|get|put|need|we\s+need|i\s+need|\+)\s+/i, '')
    .trim();

  const isMultiChunk = /[,;\n]/.test(addPayload);
  const addDefaultListId = options.listId || (isMultiChunk ? (snap0.activeListId || 'grocery') : defaultListId);
  const batchRes = store.smartBatchAdd(addPayload, addDefaultListId);
  if (!batchRes.added.length) {
    const msg = `No items recognized in "${rawInput}".`;
    return { ok: false, skill: 'shopping-lists:add', spoken: msg, text: msg };
  }

  const listMap = new Map(batchRes.state.lists.map((l) => [l.id, l]));
  const summaryParts = batchRes.added.map((entry) => {
    const listName = listMap.get(entry.listId)?.name || entry.listId;
    const qtyLabel = `${entry.item.qty} ${entry.item.unit !== 'ea' ? entry.item.unit + ' ' : ''}${entry.item.name}`;
    return `${qtyLabel} → ${listName} (${entry.item.aisle})`;
  });

  const spoken = batchRes.added.length === 1
    ? `Added ${batchRes.added[0].item.qty} ${batchRes.added[0].item.unit !== 'ea' ? batchRes.added[0].item.unit + ' ' : ''}${batchRes.added[0].item.name} to ${listMap.get(batchRes.added[0].listId)?.name || batchRes.added[0].listId}.`
    : `Added ${batchRes.added.length} items: ${summaryParts.join('; ')}.`;

  return {
    ok: true,
    skill: 'shopping-lists:add',
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
    '3. NATURAL VOICE & TEXT COMMANDS (RobOS Voice / "Hey Nabu" / Quick Command)',
    '--------------------------------------------------------------------------------',
    '  • "Add 2 gallons of milk and 4 avocados to the grocery list"',
    '  • "Add laundry detergent to Target and rotisserie chicken to Costco"',
    '  • "Check off avocados" / "Got rotisserie chicken"',
    '  • "Remove Tide pods from Target"',
    '  • "What is on my Costco list?" / "What do we need at Target?"',
    '  • "Clear checked items on Grocery" / "Undo"',
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
        <h2>3. Voice &amp; Natural Text Commands</h2>
        <table>
          <thead>
            <tr><th>Say or Type</th><th>Action</th></tr>
          </thead>
          <tbody>
            <tr><td><code>"Add 2 gallons of milk and 4 avocados to grocery"</code></td><td>Adds both items with quantities &amp; aisles to Grocery.</td></tr>
            <tr><td><code>"Add Tide pods to Target and croissants to Costco"</code></td><td>Splits &amp; routes to Target and Costco.</td></tr>
            <tr><td><code>"Check off avocados"</code> / <code>"Got rotisserie chicken"</code></td><td>Marks the matching item checked (in cart).</td></tr>
            <tr><td><code>"Uncheck avocados"</code></td><td>Moves item back to To-Buy.</td></tr>
            <tr><td><code>"More avocados"</code> / <code>"Qty avocados +2"</code></td><td>Increases quantity by +1 or +2.</td></tr>
            <tr><td><code>"Remove Tide pods from Target"</code></td><td>Deletes item (with Undo support).</td></tr>
            <tr><td><code>"What is on my Costco list?"</code></td><td>Reads out unchecked items &amp; estimated total.</td></tr>
            <tr><td><code>"Clear checked on Grocery"</code> / <code>"Undo"</code></td><td>Clears completed items or undoes last change.</td></tr>
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
  resolveStoreIdFromText,
  findMatchingItem,
  formatListsSummary,
  renderPrintableChecklist,
  executeTextCommand,
  renderPrintableCommandGuideText,
  renderPrintableGuideHtml,
};
