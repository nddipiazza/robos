'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/** Create realistic-looking workspace dirs under sandboxHome/source/* */
function seedWorkspaces(sandboxHome) {
  const src = path.join(sandboxHome, 'source');
  fs.mkdirSync(src, { recursive: true });

  const workspaces = [
    {
      name: 'buildbarn-forms',
      pkg: { name: 'buildbarn-forms', version: '2.4.3', description: 'Build barn forms service' },
      vscode: { 'editor.tabSize': 2 },
    },
    {
      name: 'scheduler-dashboard',
      pkg: { name: 'scheduler-dashboard', version: '0.8.0', description: 'React dashboard for the scheduler' },
      vscode: { 'editor.formatOnSave': true },
    },
    {
      name: 'worker-pool',
      pkg: { name: 'worker-pool', version: '1.1.2', description: 'Worker pool library for buildbarn' },
      idea: true,
    },
    {
      name: 'robos-cli',
      pkg: { name: 'robos-cli', version: '0.3.0', description: 'RobOS CLI tooling' },
      vscode: { 'editor.rulers': [100] },
    },
  ];

  for (const w of workspaces) {
    const dir = path.join(src, w.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(w.pkg, null, 2));
    fs.writeFileSync(path.join(dir, 'README.md'),
      `# ${w.name}\n\n${w.pkg.description}\n`);
    if (w.vscode) {
      fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.vscode', 'settings.json'),
        JSON.stringify(w.vscode, null, 2));
    }
    if (w.idea) {
      fs.mkdirSync(path.join(dir, '.idea'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.idea', 'workspace.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n<project version="4"></project>\n');
    }
    // Fake a .git folder so the app's git-info IPC has something to look at
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  }
}

const SCRIPT = [
  {
    narration: 'RobOS Workspace Manager finds every code workspace on your machine and opens it in the right IDE — VS Code, Cursor, JetBrains, whatever you have installed.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Click Scan. RobOS walks the filesystem for VS Code and JetBrains workspaces, skipping node_modules and other noise.',
    js: `document.getElementById('btn-scan').click();`,
    minHold: 4500,
  },
  {
    narration: 'Every workspace found, listed with its type, path, and a one-line summary from the README or package manifest.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Filter by type to focus — just VS Code projects, just JetBrains, or search by name.',
    js: `(() => {
      const s = document.getElementById('filter-type');
      s.value = 'vscode';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })();`,
    minHold: 3500,
  },
  {
    narration: 'Clear the filter and pick a workspace to see the full detail.',
    js: `(async () => {
      const s = document.getElementById('filter-type');
      s.value = '';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const first = document.querySelector('.ws-card');
      if (first) first.click();
    })();`,
    minHold: 5000,
  },
  {
    narration: 'The detail panel shows the current git branch, recent commits, and any uncommitted changes, so you know exactly where this workspace stands before you open it.',
    js: null, minHold: 5500,
  },
  {
    narration: 'One-click launchers for every detected IDE. Open in VS Code, Cursor, or IntelliJ. Drop a terminal directly in the workspace root. No cd dance, no copying paths.',
    js: null, minHold: 6000,
  },
  {
    narration: 'Workspace Manager is how RobOS turns "where is that project?" into a solved problem. Every project, every IDE, one click away.',
    js: null, minHold: 4500,
  },
];

runDemo({
  slug: 'workspace-manager',
  appId: 'workspace-manager',
  windowTitle: 'RobOS Workspace Manager',
  scenario: scenarios['all-good'],
  prelaunch: async (app) => {
    seedWorkspaces(app.sandboxHome);
    // Write scan roots to settings so Scan picks up sandbox/source
    const fs2 = require('fs');
    const p2  = require('path');
    const cfg = p2.join(app.sandboxHome, '.config', 'robos', 'settings.json');
    let s = {};
    try { s = JSON.parse(fs2.readFileSync(cfg, 'utf8')); } catch {}
    s.workspace_scan_roots = [p2.join(app.sandboxHome, 'source')];
    fs2.writeFileSync(cfg, JSON.stringify(s, null, 2));
    await evalJS(app.port, `window.location.reload()`);
  },
  postSettle: 1800,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
