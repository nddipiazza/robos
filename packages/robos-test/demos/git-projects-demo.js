'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/**
 * Pre-seed the projects file so the sidebar shows a realistic project tree
 * on launch. Includes a `secrets` array per project so the Secrets tab
 * renders with content (the renderer reads project.secrets directly).
 *
 * For Branches and Recent Commits — those tabs call `gp.getBranches()` /
 * `gp.getLog()` which shell out to real `git`. Rather than seed real git
 * repos, the demo cues inject canned HTML into #branches-list and
 * #commits-list after selectProject() runs (see CLICK_PROJECT below).
 */
function seedProjects(sandboxHome) {
  const cfgDir = path.join(sandboxHome, '.config', 'robos');
  fs.mkdirSync(cfgDir, { recursive: true });

  const mkProj = (id, repo, cloned, secrets, scripts) => {
    const localPath = path.join(sandboxHome, 'source', 'github.com', 'acme-corp', repo);
    return {
      id, label: repo,
      host: 'github.com', org: 'acme-corp', repo,
      url: `https://github.com/acme-corp/${repo}`,
      sshUrl: `git@github.com:acme-corp/${repo}.git`,
      localPath,
      _cloned: cloned,
      secrets: secrets || [],
      scripts: scripts || { instructions: '', setup: '', start: '', test: '', e2e: '' },
      notes: '',
    };
  };

  const SCRIPTS = {
    instructions: '# buildbarn-forms — local dev guide\n\nThis library renders any Buildbarn configuration into an interactive tree + Monaco editor.\n\n1. `npm install` to fetch the proto types peer dep + tooling.\n2. `npm run build` to compile TypeScript into `dist/`.\n3. `cd e2e && npm install && npm run dev` for the standalone harness.\n4. `npm test` runs the Jest unit suite (currently 51 tests).\n5. `cd e2e && npm run test` runs Playwright against real Buildbarn configs.\n\nProto descriptors come from `@hermetiq/buildbarn-forms-proto`.',
    setup: '#!/bin/bash\nset -e\nnpm install\nnpm run build\ncd e2e && npm install',
    start: '#!/bin/bash\ncd e2e && npm run dev',
    test:  '#!/bin/bash\nnpm test -- --ci',
    e2e:   '#!/bin/bash\ncd e2e && npm run test',
  };

  const SECRETS_BBF = [
    { env: 'GH_PACKAGES_TOKEN',       passPath: 'acme/github-packages-readonly' },
    { env: 'CHROMATIC_PROJECT_TOKEN', passPath: 'acme/chromatic-token' },
    { env: 'NPM_PUBLISH_TOKEN',       passPath: 'acme/npm-publish-token' },
  ];

  const projects = {
    projects: [
      mkProj('p1', 'buildbarn-forms', true, SECRETS_BBF, SCRIPTS),
      mkProj('p2', 'buildbarn-forms-proto', true,
        [{ env: 'NPM_PUBLISH_TOKEN', passPath: 'acme/npm-publish-token' }],
        { instructions: 'Generated proto types — `npm run build` regenerates `dist/`.', setup: 'npm install && npm run build', start: '', test: 'npm test', e2e: '' }),
      mkProj('p3', 'scheduler-dashboard', true,
        [{ env: 'GRAFANA_API_KEY', passPath: 'acme/grafana-readonly' }],
        { instructions: 'Real-time scheduler queue dashboard.', setup: 'npm install', start: 'npm run dev', test: 'npm test', e2e: '' }),
      mkProj('p4', 'worker-pool', false, [], {}),
    ],
  };
  fs.writeFileSync(path.join(cfgDir, 'git-projects.json'), JSON.stringify(projects, null, 2));

  // Pre-create the cloned project dirs so check-cloned (fs.existsSync .git) returns true.
  for (const p of projects.projects) {
    if (!p._cloned) continue;
    const git = path.join(p.localPath, '.git');
    fs.mkdirSync(git, { recursive: true });
    fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(p.localPath, 'README.md'), `# ${p.repo}\n`);
  }
}

/** Per-project canned branches + commits the demo injects into the lists. */
const MOCKS = {
  p1: {
    branches: [
      'main', 'fix/cas-ttl', 'perf/worker-pool', 'feat/proto-descriptors',
      'remotes/origin/main', 'remotes/origin/HEAD',
    ],
    commits: [
      'a1b2c3d Add proto descriptor generator (#42)',
      '8c9d0e1 Wire JsonnetEditor to MCP onAddChild',
      '7a6b5c4 Fix CAS blob TTL overflow at u32 boundary',
      '3d4e5f6 ConfigBrowser: load .jsonnet files from GitHub repo',
      'f9e8d7c Document the proto-tooltip integration plan',
    ],
  },
  p2: {
    branches: ['main', 'feat/runtime-descriptors', 'remotes/origin/main'],
    commits: [
      '5e4d3c2 Bump @bufbuild/protoc-gen-es to v2.0',
      '9f8e7d6 Emit proto-descriptors.json alongside proto-comments.json',
      'd0c1b2a Regenerate types from bb-storage main',
    ],
  },
  p3: {
    branches: ['main', 'feat/queue-priority-viz', 'remotes/origin/main'],
    commits: [
      '4a5b6c7 Real-time queue depth chart',
      '8d9e0f1 Switch metrics to Prometheus pull',
    ],
  },
};

function branchesHtmlFor(id) {
  const list = (MOCKS[id] || { branches: [] }).branches;
  return list.map(b => {
    const isRemote = b.startsWith('remotes/') || b.startsWith('origin/');
    const cls = isRemote ? 'branch-remote' : '';
    const icon = isRemote ? '☁' : '⎇';
    return `<div class="branch-row"><span class="branch-icon ${cls}">${icon}</span><span class="branch-name ${cls}">${b}</span></div>`;
  }).join('');
}

function commitsHtmlFor(id) {
  const list = (MOCKS[id] || { commits: [] }).commits;
  return list.map(line => {
    const sha = line.slice(0, 7);
    const msg = line.slice(8);
    return `<div class="commit-row"><span class="commit-sha">${sha}</span><span class="commit-msg">${msg}</span></div>`;
  }).join('');
}

/**
 * Click a tree-repo row, then after a short delay overwrite the branches +
 * commits lists with canned HTML — the real `git log` / `git branch` calls
 * have already returned empty by then because the seeded project dirs are
 * not real git repos. Avoids any actual git work in the demo.
 */
function CLICK_PROJECT(projectId) {
  const branchesHtml = branchesHtmlFor(projectId);
  const commitsHtml  = commitsHtmlFor(projectId);
  return `
    (() => {
      const row = document.querySelector(${JSON.stringify(`.tree-repo[data-id="${projectId}"]`)});
      if (row) row.click();
      setTimeout(() => {
        const b = document.getElementById('branches-list');
        if (b) b.innerHTML = ${JSON.stringify(branchesHtml)};
        const c = document.getElementById('commits-list');
        if (c) c.innerHTML = ${JSON.stringify(commitsHtml)};
      }, 1100);
    })();
  `;
}

function CLICK(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el) el.click();
  })();`;
}

const SCRIPT = [
  {
    narration: 'RobOS Git Projects is the front door to every git repository on the team — clone new ones, browse branches and commits, manage per-project secrets, and run dev-setup scripts, all from a single panel.',
    js: null, minHold: 5500,
  },
  {
    narration: 'The sidebar groups projects by host and organization. A green dot means cloned locally; a gray one means it lives only on GitHub.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Click the team’s flagship repository to open it.',
    js: CLICK_PROJECT('p1'),
    minHold: 4500,
  },
  {
    narration: 'The detail panel fills in: repo name, remote URL, SSH URL, local path. The default tab shows recent commits — the latest log entries with their short SHA.',
    js: null, minHold: 6500,
  },
  {
    narration: 'The Branches tab lists every local and remote branch — main, the active feature branches, and the origin tracking branches.',
    js: CLICK('.tab-btn[data-tab="branches"]'),
    minHold: 6000,
  },
  {
    narration: 'The Secrets tab maps environment variable names to entries in the password store. AI can scan the repo and suggest the secrets your start-script will need — no plaintext tokens, ever.',
    js: CLICK('.tab-btn[data-tab="secrets"]'),
    minHold: 7000,
  },
  {
    narration: 'Local Dev Setup is where each project’s scripts live: Instructions, Setup, Start, Test, and end-to-end. Author them by hand or let the AI generate verified ones by attempting to build the project on your machine.',
    js: CLICK('.tab-btn[data-tab="devsetup"]'),
    minHold: 7500,
  },
  {
    narration: 'Switch to Setup to see the install script. Click Run and RobOS executes it in the project root with the right environment.',
    js: CLICK('.devsetup-tab[data-dstab="setup"]'),
    minHold: 5500,
  },
  {
    narration: 'Test runs the unit suite. Start launches the dev server. End-to-end fires Playwright. Each one is editable Markdown or shell.',
    js: CLICK('.devsetup-tab[data-dstab="test"]'),
    minHold: 5500,
  },
  {
    narration: 'The Edit tab is project metadata — label, git URL, local path, and free-form notes that the AI can expand or summarize on request.',
    js: CLICK('.tab-btn[data-tab="edit"]'),
    minHold: 6000,
  },
  {
    narration: 'Switch to a different project — each one keeps its own branches, secrets, scripts, and notes, fully isolated.',
    js: CLICK_PROJECT('p2'),
    minHold: 6000,
  },
  {
    narration: 'And a project that hasn’t been cloned yet — the clone button is the only enabled action; everything else lights up once the code is on disk.',
    js: CLICK_PROJECT('p4'),
    minHold: 5500,
  },
  {
    narration: 'Add a new project. Paste a git URL or pick from the GitHub repos you already have access to via the gh CLI integration.',
    js: CLICK('#btn-add'),
    minHold: 5500,
  },
  {
    narration: 'Git Projects is RobOS’s answer to "where is that repo, and how do I get it running?" Branches, commits, secrets, scripts, edits — all in one panel, none in a terminal.',
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
