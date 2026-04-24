'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/**
 * context-manager persists to ~/.config/robos/context-sources.json.
 * Seed a realistic list of context sources so the app opens with content
 * instead of an empty state.
 */
function seedContextSources(sandboxHome) {
  const cfgDir = path.join(sandboxHome, '.config', 'robos');
  fs.mkdirSync(cfgDir, { recursive: true });

  const sources = [
    {
      id: 'src-1',
      type: 'github',
      name: 'acme-corp/buildbarn-forms',
      active: true,
      url: 'https://github.com/acme-corp/buildbarn-forms',
      lastPulled: new Date(Date.now() - 45 * 60_000).toISOString(),
      files: ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'package.json', 'docs/architecture.md'],
      scopes: ['issue-manager', 'pr-review', 'agents-manager'],
    },
    {
      id: 'src-2',
      type: 'github',
      name: 'acme-corp/scheduler-dashboard',
      active: true,
      url: 'https://github.com/acme-corp/scheduler-dashboard',
      lastPulled: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      files: ['README.md', 'package.json', 'docs/design.md'],
      scopes: ['issue-manager'],
    },
    {
      id: 'src-3',
      type: 'local',
      name: 'robos-cli',
      active: true,
      path: '/home/robos/source/robos-cli',
      files: ['README.md', 'AGENTS.md', 'src/main.rs'],
      scopes: ['agents-manager', 'workspace-manager'],
    },
    {
      id: 'src-4',
      type: 'url',
      name: 'RobOS Docs — Agent Protocol',
      active: false,
      url: 'https://nddipiazza.github.io/robos/agent-protocol',
      lastPulled: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      scopes: ['agents-manager'],
    },
  ];

  fs.writeFileSync(path.join(cfgDir, 'context-sources.json'),
    JSON.stringify(sources, null, 2));
}

const SCRIPT = [
  {
    narration: 'RobOS Context Manager is how you curate the background knowledge every AI agent on your desktop draws from — repos, local folders, docs, tickets, whatever the agent needs to answer well.',
    js: null, minHold: 5500,
  },
  {
    narration: 'The sidebar on the left lists every source you\u2019ve added. Active ones are pulled into every AI prompt across RobOS. Toggle a source off and the agents stop seeing it.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Open the main buildbarn-forms repo to see what\u2019s indexed.',
    js: `(() => {
      const items = document.querySelectorAll('.source-item');
      if (items[0]) items[0].click();
    })();`,
    minHold: 4000,
  },
  {
    narration: 'The Files tab shows what RobOS extracted from the source — the README, the AGENTS.md instructions, the architecture docs. The agent gets these as grounded context, not a training guess.',
    js: `(() => {
      const tab = document.querySelector('#detail-tab[data-tab="files"], [data-tab="files"]');
      if (tab) tab.click();
    })();`,
    minHold: 5500,
  },
  {
    narration: 'The Agents tab shows which RobOS apps this source is scoped to — so the Issue Manager uses it, but the Workspace Manager might not. Sources stay narrowly relevant.',
    js: `(() => {
      const tab = document.querySelector('[data-tab="agents"]');
      if (tab) tab.click();
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Add a new source. RobOS supports GitHub repos, local folders, raw files, and web URLs — anything an agent might need to know about.',
    js: `(() => {
      const btn = document.getElementById('btn-add');
      if (btn) btn.click();
    })();`,
    minHold: 4500,
  },
  {
    narration: 'Context Manager is the difference between an AI agent that guesses and an AI agent that knows your codebase. Curate once, every app benefits.',
    js: null, minHold: 5000,
  },
];

runDemo({
  slug: 'context-manager',
  appId: 'context-manager',
  windowTitle: 'RobOS Context Manager',
  scenario: scenarios['all-good'],
  prelaunch: async (app) => {
    seedContextSources(app.sandboxHome);
    await evalJS(app.port, `window.location.reload()`);
  },
  postSettle: 1800,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
