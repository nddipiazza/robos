'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/**
 * search-index demo — seed a realistic source tree + pre-build the two default
 * indexes so the sidebar shows file counts and fresh timestamps at launch.
 * Then walk through selecting an index and running a live grep-based search.
 */

function seedSearchIndex(sandboxHome) {
  const srcDir   = path.join(sandboxHome, 'source');
  const robosCfg = path.join(sandboxHome, '.config', 'robos');
  const idxDir   = path.join(robosCfg, 'search-index');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(idxDir, { recursive: true });

  // Tiny but believable source tree — enough that the "files" count reads real.
  const files = [
    'buildbarn-forms/src/JsonnetEditor/JsonnetEditor.tsx',
    'buildbarn-forms/src/JsonnetEditor/JsonnetEditor.css',
    'buildbarn-forms/src/TreeView/TreeView.tsx',
    'buildbarn-forms/src/TreeView/TreeNode.tsx',
    'buildbarn-forms/src/TreeView/TreeContextMenu.tsx',
    'buildbarn-forms/src/ProtoFormBuilder/ProtoFormBuilder.tsx',
    'buildbarn-forms/src/ProtoFormBuilder/fieldTypeMapper.ts',
    'buildbarn-forms/src/components/FormFields.tsx',
    'buildbarn-forms/src/utils/protoComments.ts',
    'buildbarn-forms/src/utils/protoTypeInference.ts',
    'buildbarn-forms/package.json',
    'buildbarn-forms/README.md',
    'buildbarn-forms/tsconfig.json',
    'scheduler-dashboard/src/App.tsx',
    'scheduler-dashboard/src/metrics.ts',
    'scheduler-dashboard/package.json',
    'worker-pool/src/pool.rs',
    'worker-pool/src/main.rs',
    'worker-pool/Cargo.toml',
    'robos-cli/src/main.ts',
    'robos-cli/README.md',
  ];

  for (const rel of files) {
    const full = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `// stub for ${path.basename(rel)}\nexport default null;\n`);
  }

  // Write the indexes directly (the app would have built these via `find`).
  const nowIso = new Date().toISOString();
  const sourceIndex = files.map(f => path.join(srcDir, f)).join('\n') + '\n';
  fs.writeFileSync(path.join(idxDir, 'source.txt'), sourceIndex);

  const robosConfigFiles = [
    'settings.json', 'notifications.json', 'event-rules.json',
    'scheduled-jobs.json', 'workflows.json', 'widgets.json',
  ].map(f => path.join(robosCfg, f));
  for (const f of robosConfigFiles) {
    fs.writeFileSync(f, '{}\n');
  }
  fs.writeFileSync(path.join(idxDir, 'robos-config.txt'),
    robosConfigFiles.join('\n') + '\n');

  // Write the index config so the sidebar shows both with counts + timestamps
  fs.writeFileSync(path.join(robosCfg, 'search-indexes.json'), JSON.stringify([
    {
      id: 'source',
      name: 'Source Projects',
      paths: [srcDir],
      system: true,
      lastIndexed: nowIso,
      fileCount: files.length,
    },
    {
      id: 'robos-config',
      name: 'RobOS Config',
      paths: [robosCfg],
      system: true,
      lastIndexed: nowIso,
      fileCount: robosConfigFiles.length,
    },
  ], null, 2));
}

function JS_TYPE(selector, text, delayMs = 55) {
  return `
    (() => {
      (async () => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;
        el.focus();
        el.value = '';
        for (const ch of ${JSON.stringify(text)}) {
          el.value += ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, ${delayMs}));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })();
      return 'typing-started';
    })();
  `;
}

const SCRIPT = [
  {
    narration: 'RobOS Search Index is the file-system indexer that powers the at-mention search every RobOS app uses. Type an at-sign in any AI textarea and you’re searching whatever this app has indexed.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Two indexes ship by default — Source Projects covering your code, and RobOS Config covering the settings every RobOS app reads. Both auto-refresh in the background.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Select the source projects index.',
    js: `(() => {
      const cards = document.querySelectorAll('.index-card');
      if (cards[0]) cards[0].click();
    })();`,
    minHold: 3500,
  },
  {
    narration: 'The detail panel shows everything that’s indexed — file count, last indexed time, and the root paths the index covers. Rebuild any index on demand, or let the scheduler do it overnight.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Run a live search to see it in action.',
    js: JS_TYPE('#search-input', 'JsonnetEditor'),
    minHold: 5500,
  },
  {
    narration: 'Results stream in from the indexed files — every match with its full path. This is the same engine that powers at-mention search inside the AI panels across RobOS.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Need to index a new directory? Click Add Index, pick a path, and RobOS walks the tree once and keeps it fresh. Fast search, zero background cost.',
    js: `(() => {
      const i = document.getElementById('search-input');
      if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }
    })();`,
    minHold: 5000,
  },
  {
    narration: 'Search Index is the plumbing RobOS’s AI apps rely on — invisible most of the time, essential when you need it.',
    js: null, minHold: 4500,
  },
];

runDemo({
  slug: 'search-index',
  appId: 'search-index',
  windowTitle: 'RobOS Search Index',
  scenario: scenarios['all-good'],
  prelaunch: async (app) => {
    seedSearchIndex(app.sandboxHome);
    await evalJS(app.port, `window.location.reload()`);
  },
  postSettle: 1800,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
