'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/**
 * Pre-seed the projects file so the sidebar shows a realistic project tree
 * on launch. Avoids any UI interaction with the real `git clone` IPC.
 */
function seedProjects(sandboxHome) {
  const cfgDir = path.join(sandboxHome, '.config', 'robos');
  fs.mkdirSync(cfgDir, { recursive: true });
  const projects = {
    projects: [
      {
        id: 'p1', label: 'buildbarn-forms',
        host: 'github.com', org: 'acme-corp', repo: 'buildbarn-forms',
        url: 'https://github.com/acme-corp/buildbarn-forms',
        sshUrl: 'git@github.com:acme-corp/buildbarn-forms.git',
        localPath: path.join(sandboxHome, 'source', 'github.com', 'acme-corp', 'buildbarn-forms'),
        cloned: true,
      },
      {
        id: 'p2', label: 'buildbarn-forms-proto',
        host: 'github.com', org: 'acme-corp', repo: 'buildbarn-forms-proto',
        url: 'https://github.com/acme-corp/buildbarn-forms-proto',
        sshUrl: 'git@github.com:acme-corp/buildbarn-forms-proto.git',
        localPath: path.join(sandboxHome, 'source', 'github.com', 'acme-corp', 'buildbarn-forms-proto'),
        cloned: true,
      },
      {
        id: 'p3', label: 'scheduler-dashboard',
        host: 'github.com', org: 'acme-corp', repo: 'scheduler-dashboard',
        url: 'https://github.com/acme-corp/scheduler-dashboard',
        sshUrl: 'git@github.com:acme-corp/scheduler-dashboard.git',
        localPath: path.join(sandboxHome, 'source', 'github.com', 'acme-corp', 'scheduler-dashboard'),
        cloned: true,
      },
      {
        id: 'p4', label: 'worker-pool',
        host: 'github.com', org: 'acme-corp', repo: 'worker-pool',
        url: 'https://github.com/acme-corp/worker-pool',
        sshUrl: 'git@github.com:acme-corp/worker-pool.git',
        localPath: path.join(sandboxHome, 'source', 'github.com', 'acme-corp', 'worker-pool'),
        cloned: false,
      },
    ],
  };
  fs.writeFileSync(path.join(cfgDir, 'git-projects.json'), JSON.stringify(projects, null, 2));

  // Pre-create the cloned project dirs so the "Clone" badge shows the right
  // state and any path-readers see real folders.
  for (const p of projects.projects) {
    if (p.cloned) {
      const dir = path.join(p.localPath, '.git');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'HEAD'), 'ref: refs/heads/main\n');
      fs.writeFileSync(path.join(p.localPath, 'README.md'), `# ${p.repo}\n`);
      fs.writeFileSync(path.join(p.localPath, 'package.json'),
        JSON.stringify({ name: p.repo, version: '0.0.5' }, null, 2));
    }
  }
}

const SCRIPT = [
  {
    narration: 'RobOS Git Projects is the front door to every git repository on the team — clone new ones, run dev-setup scripts, open in any IDE, all from a single panel.',
    js: null, minHold: 5000,
  },
  {
    narration: 'The sidebar lists every project the team has registered. A green badge means it’s already cloned locally; a gray one means it lives only on GitHub for now.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Click any project to see the full detail view.',
    js: `(() => {
      const tree = document.getElementById('project-tree');
      const cards = tree && tree.querySelectorAll('[data-project-id], .project-row, .tree-row');
      if (cards && cards[0]) cards[0].click();
    })();`,
    minHold: 4000,
  },
  {
    narration: 'Repository name, remote URL, SSH URL, local path, current branch — everything you’d normally `cd` into a terminal to find, surfaced in the panel.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Each project has dev-setup, test, and run scripts that ship with the repo or get authored here. Click a button and RobOS runs it in the project root with the right environment.',
    js: null, minHold: 6000,
  },
  {
    narration: 'Open in VS Code, Cursor, or whichever JetBrains IDE is installed. Open a terminal in the project root. Open the file explorer. Every action is one click; no path-copying.',
    js: null, minHold: 6000,
  },
  {
    narration: 'Add a new project by URL — paste a GitHub or git-over-SSH link, optionally clone immediately, and the project lands in the sidebar.',
    js: `(() => {
      const btn = document.getElementById('btn-add');
      if (btn) btn.click();
    })();`,
    minHold: 4500,
  },
  {
    narration: 'Or pick from the GitHub repos you already have access to — RobOS pulls the list from your authenticated gh CLI and you filter by name in the dropdown.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Git Projects is RobOS’s answer to "where is that repo, and how do I get it running?" One panel, every project, every IDE, every script — all without leaving the desktop.',
    js: `(() => {
      const cancel = document.getElementById('btn-add-cancel');
      if (cancel) cancel.click();
    })();`,
    minHold: 5000,
  },
];

runDemo({
  slug: 'git-projects',
  appId: 'git-projects',
  windowTitle: 'RobOS Git Projects',
  scenario: scenarios['all-good'],
  prelaunch: async (app) => {
    seedProjects(app.sandboxHome);
    await evalJS(app.port, `window.location.reload()`);
  },
  postSettle: 1800,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
