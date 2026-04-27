'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/**
 * Pre-seed the projects file so the sidebar shows a realistic project tree
 * on launch. Pre-create fake .git dirs so the renderer's `_cloned` check
 * (which calls fs.existsSync(localPath/.git)) returns true.
 */
function seedProjects(sandboxHome) {
  const cfgDir = path.join(sandboxHome, '.config', 'robos');
  fs.mkdirSync(cfgDir, { recursive: true });

  const mkProj = (id, repo, cloned = true) => {
    const localPath = path.join(sandboxHome, 'source', 'github.com', 'acme-corp', repo);
    return {
      id,
      label: repo,
      host: 'github.com',
      org:  'acme-corp',
      repo,
      url:  `https://github.com/acme-corp/${repo}`,
      sshUrl: `git@github.com:acme-corp/${repo}.git`,
      localPath,
      _cloned: cloned,
      scripts: {
        instructions: '# Build & test the React component library\n\n1. `npm install` to fetch deps.\n2. `npm run build` to compile TypeScript.\n3. `npm test` to run the Jest unit suite.\n4. `npm run e2e` to run Playwright in the e2e workspace.',
        setup: 'npm install\nnpm run build',
        start: 'cd e2e && npm run dev',
        test:  'npm test',
        e2e:   'cd e2e && npm run test',
      },
    };
  };

  const projects = {
    projects: [
      mkProj('p1', 'buildbarn-forms',       true),
      mkProj('p2', 'buildbarn-forms-proto', true),
      mkProj('p3', 'scheduler-dashboard',   true),
      mkProj('p4', 'worker-pool',           false),
    ],
  };
  fs.writeFileSync(path.join(cfgDir, 'git-projects.json'), JSON.stringify(projects, null, 2));

  // Pre-create the cloned project dirs so check-cloned (fs.existsSync .git) returns true
  for (const p of projects.projects) {
    if (!p._cloned) continue;
    const git = path.join(p.localPath, '.git');
    fs.mkdirSync(git, { recursive: true });
    fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(p.localPath, 'README.md'), `# ${p.repo}\n`);
    fs.writeFileSync(path.join(p.localPath, 'package.json'),
      JSON.stringify({ name: p.repo, version: '0.0.5' }, null, 2));
  }
}

/** Click an element matching a CSS selector (used by the cue 'js' field) */
function CLICK(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el) el.click();
  })();`;
}

const SCRIPT = [
  {
    narration: 'RobOS Git Projects is the front door to every git repository on the team — clone new ones, run dev-setup scripts, open in any IDE, all from a single panel.',
    js: null, minHold: 5000,
  },
  {
    narration: 'The sidebar groups projects by host and organization. A green dot means the project is already cloned locally; a gray one means it lives only on GitHub for now.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Click into the team’s flagship repository.',
    js: CLICK('.tree-repo[data-id="p1"]'),
    minHold: 4000,
  },
  {
    narration: 'The detail panel fills in: repo name, remote URL, SSH URL, local path, current branch, and a row of one-click action buttons that work the moment a project is cloned.',
    js: null, minHold: 6500,
  },
  {
    narration: 'Switch tabs across Instructions, Setup, Start, Test, and E2E to see the scripts that ship with this project. Each one is editable Markdown or shell — author once, run forever.',
    js: CLICK('.devsetup-tab[data-dstab="setup"]'),
    minHold: 4500,
  },
  {
    narration: 'The Setup tab is where the dev-setup script lives. Click Run and RobOS executes it in the project root, with output streaming back into the panel.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Test tab — same idea, but for the unit suite. Start tab launches the dev server. E2E tab kicks off Playwright.',
    js: CLICK('.devsetup-tab[data-dstab="test"]'),
    minHold: 4500,
  },
  {
    narration: 'Now jump to the proto types repo that buildbarn-forms depends on. Each project keeps its own scripts and state.',
    js: CLICK('.tree-repo[data-id="p2"]'),
    minHold: 4500,
  },
  {
    narration: 'And here’s the worker-pool — registered but not cloned yet. The clone button is the only enabled action; the IDE and terminal buttons unlock once the code is on disk.',
    js: CLICK('.tree-repo[data-id="p4"]'),
    minHold: 5500,
  },
  {
    narration: 'Add a new project. Either paste a git URL straight in, or pick from the GitHub repos you already have access to via the gh CLI integration — RobOS pulls the list and you filter by name.',
    js: CLICK('#btn-add'),
    minHold: 5500,
  },
  {
    narration: 'Cancel back to the project list. Git Projects is RobOS’s answer to "where is that repo, and how do I get it running?" One panel, every project, every IDE, every script.',
    js: CLICK('#btn-add-cancel'),
    minHold: 5500,
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
  postSettle: 2000,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
