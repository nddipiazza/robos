#!/usr/bin/env node
'use strict';

/**
 * RobOS Shopping Lists CLI & Text Command Runner
 *
 * Usage:
 *   node packages/shopping-lists/bin/shopping-lists.js list [grocery|target|costco|all] [--unchecked|--checked]
 *   node packages/shopping-lists/bin/shopping-lists.js add "2 gal milk, tide pods @target, rotisserie chicken @costco" [--list grocery]
 *   node packages/shopping-lists/bin/shopping-lists.js check "avocados" [--list grocery]
 *   node packages/shopping-lists/bin/shopping-lists.js uncheck "avocados" [--list grocery]
 *   node packages/shopping-lists/bin/shopping-lists.js qty "avocados" +2 [--list grocery]
 *   node packages/shopping-lists/bin/shopping-lists.js remove "tide pods" [--list target]
 *   node packages/shopping-lists/bin/shopping-lists.js clear-checked [--list grocery]
 *   node packages/shopping-lists/bin/shopping-lists.js check-all [--list grocery]
 *   node packages/shopping-lists/bin/shopping-lists.js uncheck-all [--list grocery]
 *   node packages/shopping-lists/bin/shopping-lists.js undo
 *   node packages/shopping-lists/bin/shopping-lists.js sync [--pull]
 *   node packages/shopping-lists/bin/shopping-lists.js export-csv [--list grocery]
 *   node packages/shopping-lists/bin/shopping-lists.js print [grocery|target|costco|all]
 *   node packages/shopping-lists/bin/shopping-lists.js guide
 *   node packages/shopping-lists/bin/shopping-lists.js "what is on my costco list?"
 *
 * Flags:
 *   --list <grocery|target|costco|all>   Target store list
 *   --json                               Output structured JSON
 *   --spoken                             Output the single-sentence voice response
 *   --file <path>                        Custom shopping-lists.json path (for testing)
 */

const { createStore } = require('../lib/store');
const { executeTextCommand, formatListsSummary, renderPrintableChecklist, renderPrintableCommandGuideText } = require('../lib/text-commands');

function parseArgs(argv) {
  const out = {
    _: [],
    list: null,
    json: false,
    spoken: false,
    unchecked: false,
    checked: false,
    pull: true,
    file: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--spoken') out.spoken = true;
    else if (a === '--unchecked' || a === '--to-buy') out.unchecked = true;
    else if (a === '--checked') out.checked = true;
    else if (a === '--pull') out.pull = true;
    else if (a === '--no-pull') out.pull = false;
    else if (a === '--list' || a === '-l') out.list = argv[++i];
    else if (a === '--file' || a === '-f') out.file = argv[++i];
    else if (a === '--help' || a === '-h') out._.push('guide');
    else out._.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const store = createStore(args.file ? { filePath: args.file } : {});
  const [sub, ...rest] = args._;
  const cmd = (sub || 'list').toLowerCase();

  let res;
  switch (cmd) {
    case 'list':
    case 'show':
    case 'status': {
      const targetList = args.list || rest[0] || 'all';
      const filterMode = args.unchecked ? 'unchecked' : args.checked ? 'checked' : 'all';
      res = formatListsSummary(store.getSnapshot(), targetList, filterMode);
      break;
    }
    case 'print': {
      const targetList = args.list || rest[0] || 'all';
      const filterMode = args.unchecked ? 'unchecked' : args.checked ? 'checked' : 'all';
      const text = renderPrintableChecklist(store.getSnapshot(), targetList, filterMode);
      res = {
        ok: true,
        skill: 'shopping-lists:print',
        spoken: `Prepared printable shopping list for ${targetList}.`,
        text,
        data: { listId: targetList },
      };
      break;
    }
    case 'guide':
    case 'help':
    case 'commands': {
      const text = renderPrintableCommandGuideText();
      res = {
        ok: true,
        skill: 'shopping-lists:guide',
        spoken: 'Here is the RobOS Shopping Lists skills and text commands guide.',
        text,
        data: { guide: true },
      };
      break;
    }
    case 'add': {
      const textPayload = rest.join(' ');
      res = await executeTextCommand(store, `add ${textPayload}`, { listId: args.list });
      break;
    }
    case 'check': {
      res = await executeTextCommand(store, `check ${rest.join(' ')}`, { listId: args.list });
      break;
    }
    case 'uncheck': {
      res = await executeTextCommand(store, `uncheck ${rest.join(' ')}`, { listId: args.list });
      break;
    }
    case 'qty':
    case 'quantity': {
      const deltaOrVal = rest.length >= 2 ? rest[rest.length - 1] : '+1';
      const itemName = rest.length >= 2 ? rest.slice(0, -1).join(' ') : rest[0] || '';
      res = await executeTextCommand(store, `qty ${itemName} ${deltaOrVal}`, { listId: args.list });
      break;
    }
    case 'remove':
    case 'rm':
    case 'delete': {
      res = await executeTextCommand(store, `remove ${rest.join(' ')}`, { listId: args.list });
      break;
    }
    case 'clear-checked':
    case 'clear': {
      res = await executeTextCommand(store, 'clear checked', { listId: args.list || rest[0] });
      break;
    }
    case 'check-all': {
      res = await executeTextCommand(store, 'check all', { listId: args.list || rest[0] });
      break;
    }
    case 'uncheck-all': {
      res = await executeTextCommand(store, 'uncheck all', { listId: args.list || rest[0] });
      break;
    }
    case 'undo': {
      res = await executeTextCommand(store, 'undo');
      break;
    }
    case 'sync':
    case 'sync-drive': {
      res = await executeTextCommand(store, args.pull ? 'sync pull' : 'sync', { pull: args.pull });
      break;
    }
    case 'export-csv':
    case 'csv': {
      res = await executeTextCommand(store, 'export-csv', { listId: args.list || rest[0] });
      break;
    }
    case 'cmd': {
      res = await executeTextCommand(store, rest.join(' '), { listId: args.list });
      break;
    }
    default: {
      // Natural language or shorthand command passed directly
      res = await executeTextCommand(store, args._.join(' '), { listId: args.list });
      break;
    }
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  } else if (args.spoken) {
    process.stdout.write((res.spoken || res.text || '') + '\n');
  } else {
    process.stdout.write((res.text || res.spoken || JSON.stringify(res)) + '\n');
  }
  process.exit(res && res.ok === false ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
