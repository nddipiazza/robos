'use strict';
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

// ── Helpers ───────────────────────────────────────────────────────────────────
function CLICK(sel) {
  return `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.click(); return !!el; })();`;
}

function JS_TYPE(selector, text, delayMs = 22) {
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

// ── Mock task list ─────────────────────────────────────────────────────────────
// Injects a realistic 12-task hierarchy (3 epics + 9 stories) directly into
// the DOM so we never wait on a real AI call during the recording.
const MOCK_INJECT_TASKS = `(() => {
  const TASKS = [
    { num:1, epic:true,  title:'Component Library Extraction',      body:'Extract ProtoFormBuilder into a standalone TypeScript npm package.' },
    { num:2, epic:false, title:'Set up npm package scaffolding',    body:'Create @hermetiq/buildbarn-forms package with TypeScript + Rollup.' },
    { num:3, epic:false, title:'Copy ProtoFormBuilder core',        body:'Move core component tree from buildbarn-config-editor to the package.' },
    { num:4, epic:false, title:'Add TypeScript build pipeline',     body:'Configure tsc + Rollup; publish CJS + ESM targets; write README.' },
    { num:5, epic:true,  title:'MVP Integration Foundation',        body:'Wire the new package into the Hermetiq MVP dashboard.' },
    { num:6, epic:false, title:'Create schema mapper',              body:'Map Buildbarn config proto schema to form field descriptors.' },
    { num:7, epic:false, title:'Integrate ConfigSetEditor',         body:'Embed ConfigSetEditor in MVP/BBConfigEditor.js via gRPC bridge.' },
    { num:8, epic:false, title:'Update BBConfigEditor navigation',  body:'Add sidebar nav entries and breadcrumb links for the new editor.' },
    { num:9, epic:true,  title:'Core Features',                     body:'Add advanced capabilities once the integration baseline lands.' },
    { num:10,epic:false, title:'Worker and browser config support', body:'Extend schema mapper to handle WorkerConfig + BrowserConfig protos.' },
    { num:11,epic:false, title:'Version history with diff viewer',  body:'Store config snapshots in bb-config; show inline unified diff.' },
    { num:12,epic:false, title:'Search and filter config sets',     body:'Full-text search across config set names and field values.' },
  ];

  const list = document.getElementById('task-list');
  list.innerHTML = TASKS.map(t => \`
    <div class="task-card \${t.epic ? 'task-epic' : 'task-child'}">
      <div class="task-card-header">
        \${!t.epic ? '<span class="tree-indent">└</span>' : ''}
        <span class="issue-type-badge \${t.epic ? 'badge-epic' : 'badge-story'}">\${t.epic ? '⬡ Epic' : 'Story'}</span>
        <span class="task-num">#\${t.num}</span>
        <input class="task-title-input" type="text" value="\${t.title}" readonly/>
        <div class="task-sync-area">
          <button class="sync-btn sync-create-btn" title="Create on server">🔗 Sync</button>
        </div>
      </div>
      <div class="task-body-preview md-body">\${t.body}</div>
    </div>
  \`).join('');

  document.getElementById('task-count').textContent = '12';
  const eb = document.getElementById('epic-count');
  if (eb) { eb.textContent = '3 epics'; eb.style.display = 'inline-flex'; }
  document.getElementById('preview-section').style.display = 'block';
  document.getElementById('main-content').style.display = 'block';
  document.getElementById('generate-status').textContent = '✓ 12 tasks generated — 3 epics, 9 stories';
  document.getElementById('btn-generate-spinner').style.display = 'none';
  document.getElementById('btn-generate-text').style.display = '';
})();`;

// Injects synced (KAN-XX) state onto every card after "Sync All"
const MOCK_SYNCED = `(() => {
  const KEYS = ['KAN-41','KAN-42','KAN-43','KAN-44','KAN-45','KAN-46','KAN-47','KAN-48','KAN-49','KAN-50','KAN-51','KAN-52'];
  document.querySelectorAll('.task-card').forEach((card, i) => {
    card.classList.add('task-synced');
    const area = card.querySelector('.task-sync-area');
    if (area && KEYS[i]) area.innerHTML = \`
      <span class="ticket-badge" title="https://robos-acme.atlassian.net/browse/\${KEYS[i]}">\${KEYS[i]}</span>
      <button class="sync-btn sync-update-btn" title="Re-sync to server">↺</button>
    \`;
  });
  document.getElementById('create-status').textContent = '✓ 12 tasks synced — 3 epics, 9 stories now live in Jira';
  document.getElementById('btn-create-spinner').style.display = 'none';
  document.getElementById('btn-create-text').style.display = '';
})();`;

// Show the Projects badge on the active project item (after save)
const MOCK_SHOW_PROJECT_ACTIVE = `(() => {
  const badge = document.getElementById('current-project-badge');
  if (badge) { badge.textContent = '📁 Buildbarn Forms MVP'; badge.style.display = 'inline-flex'; }
})();`;

// ── Demo script ───────────────────────────────────────────────────────────────
const SCRIPT = [
  // 1 — Intro
  {
    narration: 'RobOS Task Planner turns a plain-English project description into a complete Jira backlog — epics, stories, and all — in seconds.',
    js: null,
    minHold: 5000,
  },

  // 2 — Show Projects sidebar
  {
    narration: 'The new Projects sidebar lets you save and reload any plan. Every project you create is stored locally and linked to your task server.',
    js: null,
    minHold: 4500,
  },

  // 3 — Click + to open inline new-project form
  {
    narration: 'Click the plus button to create a new project.',
    js: CLICK('#btn-new-project'),
    minHold: 2500,
  },

  // 4 — Type project name and confirm
  {
    narration: 'Give it a name — Buildbarn Forms MVP — and press Enter to save.',
    js: JS_TYPE('#project-name-input', 'Buildbarn Forms MVP', 35),
    minHold: 4000,
  },

  // 5 — Confirm project creation
  {
    narration: 'The project appears in the sidebar and becomes the active context for everything we do next.',
    js: CLICK('#btn-project-confirm'),
    minHold: 3500,
  },

  // 6 — Type a brief prompt
  {
    narration: 'Describe the project in the AI prompt. We want three epics: extracting the form library, wiring it into the MVP dashboard, and adding core features.',
    js: JS_TYPE('#prompt-input', 'Extract the ProtoFormBuilder component into a standalone @hermetiq/buildbarn-forms npm package, integrate it into the Hermetiq MVP dashboard via gRPC, then add core features: version history, diff viewer, and config set search. Create 3 epics with all stories.', 12),
    minHold: 5000,
  },

  // 7 — Click Generate and immediately inject mock results
  {
    narration: 'Hit Generate. The AI structures the entire plan — three epics and twelve tasks — before a single API call touches Jira.',
    js: `${CLICK('#btn-generate')}; setTimeout(() => { ${MOCK_INJECT_TASKS} }, 1200);`,
    minHold: 4000,
  },

  // 8 — Preview section: count badge, epic badges
  {
    narration: 'Twelve tasks are ready: three purple epics and nine stories nested beneath them. Every title and description is editable before you sync.',
    js: null,
    minHold: 5000,
  },

  // 9 — Scroll down to show stories
  {
    narration: 'Epic two covers the integration foundation — schema mapper, ConfigSetEditor, and navigation updates. Each story has a full acceptance-criteria description.',
    js: `(() => { const epics = document.querySelectorAll('.task-card.task-epic'); if (epics[1]) epics[1].scrollIntoView({ behavior: 'smooth', block: 'start' }); })();`,
    minHold: 4500,
  },

  // 10 — Show per-task Sync buttons
  {
    narration: 'Notice the Sync button on every card. You can push individual tasks to Jira as you refine them — no need to sync everything at once.',
    js: `(() => { const epics = document.querySelectorAll('.task-card.task-epic'); if (epics[2]) epics[2].scrollIntoView({ behavior: 'smooth', block: 'start' }); })();`,
    minHold: 4500,
  },

  // 11 — Scroll back up and click Sync All
  {
    narration: 'When the plan looks good, scroll back and hit Sync All to Server. RobOS creates the epics first, captures their Jira keys, then links every child story automatically.',
    js: `window.scrollTo({ top: 0, behavior: 'smooth' });`,
    minHold: 2500,
  },

  // 12 — Inject synced state (no real Jira call)
  {
    narration: 'All twelve tasks land in Jira in one shot. Ticket keys appear as clickable badges on each card.',
    js: `${CLICK('#btn-create-all')}; setTimeout(() => { ${MOCK_SYNCED} }, 900);`,
    minHold: 4500,
  },

  // 13 — Show current-project badge, conclude
  {
    narration: 'The plan is auto-saved to the Buildbarn Forms MVP project. Reload Task Planner any time and pick up exactly where you left off.',
    js: MOCK_SHOW_PROJECT_ACTIVE,
    minHold: 4000,
  },

  // 14 — Outro
  {
    narration: 'RobOS Task Planner: describe your project once, get a full Jira backlog in seconds — then save, iterate, and re-sync whenever the plan evolves.',
    js: null,
    minHold: 5000,
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────
runDemo({
  slug: 'task-planner',
  appId: 'task-planner',
  windowTitle: 'RobOS Task Planner',
  scenario: scenarios['task-planner-jira'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
